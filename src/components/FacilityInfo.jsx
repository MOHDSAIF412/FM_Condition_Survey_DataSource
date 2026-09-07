import React, { useState } from 'react';
import {
  Building,
  MapPin,
  FileText,
  Navigation as NavIcon,
  ExternalLink,
  Compass,
  CheckCircle2
} from 'lucide-react';
import { captureLocation, GPS_STATUS } from '../utils/geolocation';

export default function FacilityInfo({ facility = {}, onChange, onNext }) {
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [gpsStatus, setGpsStatus] = useState(GPS_STATUS.IDLE);

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
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-white/10 rounded-xl">
            <Building className="w-8 h-8 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Facility & Site Information</h2>
          </div>
        </div>
      </div>

      {/* Facility & Primary Identification */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Building className="w-4 h-4 text-sky-600" />
            Facility & Complex Identification
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Facilities Name / Complex Name *
            </label>
            <input
              type="text"
              value={facility.facilityName || facility.buildingName || ''}
              onChange={(e) => {
                updateField('facilityName', e.target.value);
                if (!facility.buildingName) updateField('buildingName', e.target.value);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Building / Tower Name
            </label>
            <input
              type="text"
              value={facility.buildingName || ''}
              onChange={(e) => updateField('buildingName', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Gross Internal Area (GIA)
            </label>
            <input
              type="text"
              value={facility.grossInternalArea || ''}
              onChange={(e) => updateField('grossInternalArea', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Google Location & GPS Details */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Compass className="w-4 h-4 text-emerald-600" />
            Google Location & GPS Coordinates
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
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Google Maps Location Address
            </label>
            <div className="relative">
              <input
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
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              GPS Latitude
            </label>
            <input
              type="text"
              value={googleLoc.latitude || ''}
              onChange={(e) => updateGoogleLocation('latitude', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              GPS Longitude
            </label>
            <input
              type="text"
              value={googleLoc.longitude || ''}
              onChange={(e) => updateGoogleLocation('longitude', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm font-mono"
            />
          </div>

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

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Google Location Description & Access Landmarks
            </label>
            <textarea
              rows={2}
              value={googleLoc.description || ''}
              onChange={(e) => updateGoogleLocation('description', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Scope Details */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <FileText className="w-4 h-4 text-sky-600" />
          Survey Scope & Methodology
        </h3>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Audit Scope Description
          </label>
          <textarea
            rows={3}
            value={facility.scopeNotes || ''}
            onChange={(e) => updateField('scopeNotes', e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          />
        </div>
      </div>

      {/* Next Step Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
        >
          <span>Proceed to Survey Items</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
