import React, { useState } from 'react';
import {
  Building,
  MapPin,
  FileText,
  Navigation as NavIcon,
  ExternalLink,
  Compass,
  CheckCircle2,
  FilePlus,
  Loader2
} from 'lucide-react';
import { captureLocation, GPS_STATUS } from '../utils/geolocation';
import { FACILITY_TYPES } from '../types/survey';
import { CreateTemplatePicker } from './TemplatePicker';
import { CustomFieldList, CustomSections, FacilitySectionCard, useSystemFields } from './CustomFields';

export default function FacilityInfo({ facility = {}, onChange, onCreate, creating, created, onNewFacility, templates = [], canStartFromTemplate = false }) {
  const [templateId, setTemplateId] = useState('');
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [gpsStatus, setGpsStatus] = useState(GPS_STATUS.IDLE);

  // Names and visibility of the built-in fields, from the Admin Dashboard.
  const sys = useSystemFields('facility', facility);
  const f = (key, fallback) => sys.get(key, fallback);
  const updateCustom = (key, value) => {
    onChange({ ...facility, custom: { ...(facility.custom || {}), [key]: value } });
  };

  const updateField = (field, value) => {
    onChange({
      ...facility,
      [field]: value
    });
  };

  const updateGoogleLocation = (field, value) => {
    const currentLoc = facility.googleLocation || {};
    const updated = {
      ...currentLoc,
      [field]: value
    };

    // If lat or lng changed, regenerate mapsUrl
    if (field === 'latitude' || field === 'longitude') {
      const lat = field === 'latitude' ? value : currentLoc.latitude;
      const lng = field === 'longitude' ? value : currentLoc.longitude;
      if (lat && lng) {
        updated.mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      }
    }

    onChange({
      ...facility,
      googleLocation: updated
    });
  };

  /**
   * Reads the device GPS. Uses the native location service via the plugin,
   * which is why this now works on Android at all -- the WebView call was
   * failing silently because the app never declared location permissions.
   * Never throws: a denial or a missing fix reports a message and leaves the
   * inspection usable.
   */
  const handleGetDeviceGPS = async () => {
    setIsGettingGps(true);
    setGpsError('');

    const result = await captureLocation();
    setIsGettingGps(false);
    setGpsStatus(result.status);

    if (!result.ok) {
      setGpsError(result.message);
      return;
    }

    const loc = result.location;
    onChange({
      ...facility,
      googleLocation: {
        ...(facility.googleLocation || {}),
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
        capturedAt: loc.capturedAt,
        source: loc.source,
        mapsUrl: loc.mapsUrl
      }
    });
  };

  const googleLoc = facility.googleLocation || {};

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* Introduction Card */}
      <div className="bg-gradient-to-r from-sky-900 to-slate-900 rounded-2xl p-5 sm:p-6 text-white shadow-md">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start space-x-4 min-w-0">
            <div className="p-3 bg-white/10 rounded-xl shrink-0">
              <Building className="w-8 h-8 text-sky-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">Facility & Site Information</h2>
                {facility.facilityCode && (
                  <span className="px-2 py-0.5 rounded-md bg-sky-400/20 text-sky-200 text-[11px] font-bold tracking-wide border border-sky-400/30">
                    {facility.facilityCode}
                  </span>
                )}
              </div>
              <p className="text-sky-200/80 text-xs mt-0.5 truncate">
                {facility.facilityName || facility.buildingName
                  ? `Working on: ${facility.facilityName || facility.buildingName}`
                  : 'Enter this facility’s name below, then press Create Facility.'}
              </p>
            </div>
          </div>

          {onNewFacility && (
            <button
              type="button"
              onClick={onNewFacility}
              className="px-4 py-2.5 rounded-xl bg-flame-500 hover:bg-flame-600 active:scale-[0.98] text-white font-bold text-sm shadow-card inline-flex items-center gap-2 shrink-0 transition-[background-color,transform] duration-150"
              title="Begin a new facility. The current one stays saved in your facility list."
            >
              <FilePlus className="w-4 h-4" />
              New Facility
            </button>
          )}
        </div>
      </div>

      {/* Facility & Primary Identification */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Building className="w-4 h-4 text-sky-600" />
            {sys.sectionLabel('facility_identification', 'Facility & Complex Identification')}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label htmlFor="facility-name" className="block text-xs font-semibold text-slate-700 mb-1">
              {f('facilityName', 'Facilities Name / Complex Name').label} *
            </label>
            <input
              id="facility-name"
              type="text"
              /* Bound to facilityName alone. It used to fall back to
                 `|| facility.buildingName`, so clearing the field made it
                 immediately repopulate from the building name - the text could
                 not be deleted. */
              value={facility.facilityName ?? ''}
              /* Writes facilityName only. It used to copy itself into
                 buildingName whenever that was empty, which made sense while
                 both fields were on screen; now that Building / Tower Name has
                 been removed, mirroring would just print the same name twice on
                 the report cover. Records that already carry a building name
                 keep it -- every reader still falls back to it. */
              onChange={(e) => onChange({ ...facility, facilityName: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold"
            />
          </div>

          {f('facilityType').visible && <div>
            <label htmlFor="facility-type" className="block text-xs font-semibold text-slate-700 mb-1">
              {f('facilityType', 'Facility Type').label}
            </label>
            <select
              id="facility-type"
              value={facility.facilityType || ''}
              onChange={(e) => updateField('facilityType', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm bg-white"
            >
              <option value="">Not set</option>
              {Object.values(FACILITY_TYPES).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>}

          {f('grossInternalArea').visible && <div>
            <label htmlFor="facility-gia" className="block text-xs font-semibold text-slate-700 mb-1">
              {f('grossInternalArea', 'Gross Internal Area (GIA)').label}
            </label>
            <input
              id="facility-gia"
              type="text"
              value={facility.grossInternalArea || ''}
              onChange={(e) => updateField('grossInternalArea', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>}
        </div>

        <CustomFieldList scope="facility" sectionId="facility_identification" record={facility}
          onChangeValue={updateCustom} idPrefix="facility" />
      </div>

      {/* Google Location & GPS Details */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Compass className="w-4 h-4 text-emerald-600" />
            {sys.sectionLabel('facility_location', 'Google Location & GPS Coordinates')}
          </h3>

          {/* GPS Auto-detect Button */}
          <button
            type="button"
            onClick={handleGetDeviceGPS}
            disabled={isGettingGps}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition-all"
          >
            <NavIcon className={`w-3.5 h-3.5 ${isGettingGps ? 'animate-spin' : ''}`} />
            <span>{isGettingGps ? 'Locating...' : 'Get Current GPS Location'}</span>
          </button>
        </div>

        {/* Location status. Always says what happened -- captured, refused, or
            no fix -- rather than failing quietly the way the old call did. */}
        {gpsError && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
              <span aria-hidden="true">⚠</span>
              {gpsStatus === GPS_STATUS.DENIED ? 'Location permission denied' :
               gpsStatus === GPS_STATUS.TIMEOUT ? 'No GPS fix yet' : 'Location unavailable'}
            </p>
            <p className="text-xs text-amber-800">{gpsError}</p>
            <button
              type="button"
              onClick={handleGetDeviceGPS}
              disabled={isGettingGps}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold disabled:opacity-60"
            >
              {isGettingGps ? 'Retrying...' : 'Retry'}
            </button>
            <p className="text-[11px] text-amber-700">
              You can carry on with the inspection without it.
            </p>
          </div>
        )}

        {!gpsError && googleLoc.latitude && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
            <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5 mb-2">
              <span aria-hidden="true">✓</span> Location captured
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-emerald-900">
              <dt className="text-emerald-700">Latitude</dt>
              <dd className="font-mono font-semibold text-right">{googleLoc.latitude}</dd>
              <dt className="text-emerald-700">Longitude</dt>
              <dd className="font-mono font-semibold text-right">{googleLoc.longitude}</dd>
              {googleLoc.accuracy != null && (
                <>
                  <dt className="text-emerald-700">Accuracy</dt>
                  <dd className="font-mono font-semibold text-right">{googleLoc.accuracy} m</dd>
                </>
              )}
              {googleLoc.capturedAt && (
                <>
                  <dt className="text-emerald-700">Captured</dt>
                  <dd className="font-semibold text-right">
                    {new Date(googleLoc.capturedAt).toLocaleString()}
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {f('address').visible && <div className="sm:col-span-2">
            <label htmlFor="facility-address" className="block text-xs font-semibold text-slate-700 mb-1">
              {f('address', 'Google Maps Location Address').label}
            </label>
            <div className="relative">
              <input
              id="facility-address"
                type="text"
                value={googleLoc.address || facility.address || ''}
                onChange={(e) => {
                  updateGoogleLocation('address', e.target.value);
                  updateField('address', e.target.value);
                }}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
              <MapPin className="w-4 h-4 text-emerald-600 absolute left-3 top-3.5" />
            </div>
          </div>}

          {f('latitude').visible && <div>
            <label htmlFor="facility-lat" className="block text-xs font-semibold text-slate-700 mb-1">
              {f('latitude', 'GPS Latitude').label}
            </label>
            <input
              id="facility-lat"
              type="text"
              value={googleLoc.latitude || ''}
              onChange={(e) => updateGoogleLocation('latitude', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-mono"
            />
          </div>}

          {f('longitude').visible && <div>
            <label htmlFor="facility-lng" className="block text-xs font-semibold text-slate-700 mb-1">
              {f('longitude', 'GPS Longitude').label}
            </label>
            <input
              id="facility-lng"
              type="text"
              value={googleLoc.longitude || ''}
              onChange={(e) => updateGoogleLocation('longitude', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-mono"
            />
          </div>}

          {/* Google Maps Link Preview */}
          {googleLoc.mapsUrl && (
            <div className="sm:col-span-2 flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              <span className="font-medium truncate mr-2">
                📍 Coordinates: {googleLoc.latitude}, {googleLoc.longitude}
              </span>
              <a
                href={googleLoc.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="font-bold flex items-center gap-1 text-emerald-700 hover:text-emerald-900 shrink-0 underline"
              >
                <span>Open in Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

        </div>

        <CustomFieldList scope="facility" sectionId="facility_location" record={facility}
          onChangeValue={updateCustom} idPrefix="facility" />
      </div>

      {/* Scope Details */}
      {(f('scopeNotes').visible || sys.hasVisibleCustom('facility_scope')) && (
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <FileText className="w-4 h-4 text-sky-600" />
          {sys.sectionLabel('facility_scope', 'Survey Scope & Methodology')}
        </h3>

        {f('scopeNotes').visible && <div>
          <label htmlFor="facility-scope" className="block text-xs font-semibold text-slate-700 mb-1">
            {f('scopeNotes', 'Audit Scope Description').label}
          </label>
          <textarea
              id="facility-scope"
            rows={3}
            value={facility.scopeNotes || ''}
            onChange={(e) => updateField('scopeNotes', e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          />
        </div>}

        <CustomFieldList scope="facility" sectionId="facility_scope" record={facility}
          onChangeValue={updateCustom} idPrefix="facility" />
      </div>
      )}

      {/* Sections added in the Admin Dashboard. */}
      <CustomSections scope="facility" record={facility} onChangeValue={updateCustom} idPrefix="facility"
        renderSection={(section, body) => <FacilitySectionCard section={section}>{body}</FacilitySectionCard>} />

      {/* Only while no snag has been written: autosave can upload the facility
          seconds after its name is typed, so "not created yet" is the wrong
          test. Later, templates are loaded from the Survey Items tab. */}
      {canStartFromTemplate && (
        <CreateTemplatePicker
          templates={templates}
          facilityType={facility.facilityType || ''}
          value={templateId}
          onChange={setTemplateId}
        />
      )}

      {/* Creating the facility is the deliberate step that fixes its reference
          number. Until then the code on screen is provisional. */}
      <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-2 pt-2">
        {!facility.facilityName?.trim() && (
          <p className="text-xs text-slate-500 sm:mr-auto">
            Enter the facility name to create it.
          </p>
        )}
        <button
          onClick={() => onCreate(canStartFromTemplate ? templates.find((t) => t.id === templateId) || null : null)}
          disabled={creating || !facility.facilityName?.trim()}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
        >
          {creating
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <FilePlus className="w-4 h-4" />}
          <span>
            {creating ? 'Creating…' : created ? 'Save & Continue' : 'Create Facility'}
          </span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
