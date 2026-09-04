import React, { useState } from 'react';
import { 
  Building, 
  MapPin, 
  User, 
  Briefcase, 
  Calendar, 
  Sun, 
  Clock, 
  FileText,
  Navigation as NavIcon,
  ExternalLink,
  Compass,
  CheckCircle2
} from 'lucide-react';
import { PRESET_FACILITIES, ZONES } from '../data/facilitiesList';

export default function FacilityInfo({ facility = {}, onChange, onNext }) {
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [gpsError, setGpsError] = useState('');

  const handlePresetFacilityChange = (facId) => {
    const found = PRESET_FACILITIES.find((f) => f.id === facId);
    if (!found) return;

    onChange({
      ...facility,
      facilityName: found.name,
      buildingName: `Zone ${found.zone} - ${found.name}`,
      buildingCode: `Zone ${found.zone}`,
      address: `${found.name}, Zone ${found.zone}, Abu Dhabi, UAE`,
      googleLocation: {
        address: `${found.name}, Zone ${found.zone}, Abu Dhabi, UAE`,
        latitude: found.latitude,
        longitude: found.longitude,
        mapsUrl: found.mapsUrl,
        description: `DMS: ${found.dms} (Zone ${found.zone})`
      }
    });
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

  // Trigger Phone GPS geolocation
  const handleGetDeviceGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setIsGettingGps(true);
    setGpsError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

        onChange({
          ...facility,
          googleLocation: {
            ...(facility.googleLocation || {}),
            latitude: lat,
            longitude: lng,
            mapsUrl: mapsUrl
          }
        });
        setIsGettingGps(false);
      },
      (err) => {
        setIsGettingGps(false);
        setGpsError('Could not retrieve GPS: ' + (err.message || 'Permission denied'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
            <p className="text-xs sm:text-sm text-sky-200/80 mt-1">
              Enter the Facility Name, Building Title, Google Location with GPS coordinates, and inspection details.
            </p>
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
          <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200">
            23 Pre-Configured Facilities Available
          </span>
        </div>

        {/* Dropdown Selection Option */}
        <div className="bg-gradient-to-r from-sky-50 via-cyan-50 to-sky-50 p-4 rounded-2xl border-2 border-sky-300 shadow-sm space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <label className="block text-xs font-extrabold text-sky-950 uppercase tracking-wide flex items-center gap-1.5">
              <Building className="w-4 h-4 text-sky-600" />
              Select Facility / Stables / Arena (Dropdown Option) *
            </label>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Auto-fills GPS Coordinates & Zone
            </span>
          </div>

          <select
            value={PRESET_FACILITIES.find((f) => f.name === facility.facilityName)?.id || ''}
            onChange={(e) => handlePresetFacilityChange(e.target.value)}
            className="w-full px-3.5 py-3 rounded-xl border-2 border-sky-400 bg-white font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm shadow-sm cursor-pointer"
          >
            <option value="">-- Choose from 23 Facilities (Zone A - E) --</option>
            {ZONES.map((zone) => (
              <optgroup key={zone} label={`ZONE ${zone} FACILITIES`}>
                {PRESET_FACILITIES.filter((f) => f.zone === zone).map((f) => (
                  <option key={f.id} value={f.id}>
                    [{f.zone}] {f.name} — {f.dms}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="text-[11px] text-sky-800">
            Selecting a facility from this dropdown automatically configures its official name, Zone block, and exact GPS coordinates.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Facilities Name / Complex Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Al-Manar Commercial Complex"
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
              placeholder="e.g. Commercial Tower"
              value={facility.buildingName || ''}
              onChange={(e) => updateField('buildingName', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Facility / Asset Reference Code
            </label>
            <input
              type="text"
              placeholder="e.g. B-042-DXB"
              value={facility.buildingCode || ''}
              onChange={(e) => updateField('buildingCode', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Gross Internal Area (GIA)
            </label>
            <input
              type="text"
              placeholder="e.g. 28,500 sq.m"
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

        {gpsError && (
          <p className="text-xs text-rose-600 font-medium bg-rose-50 p-2.5 rounded-xl border border-rose-200">
            {gpsError}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Google Maps Location Address
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. Marasi Dr, Business Bay, Dubai, United Arab Emirates"
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
              placeholder="e.g. 25.1856"
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
              placeholder="e.g. 55.2678"
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
              placeholder="Describe access gate, perimeter reference, landmark opposite building, loading bay pin..."
              value={googleLoc.description || ''}
              onChange={(e) => updateGoogleLocation('description', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Stakeholders & Inspector Details */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <User className="w-4 h-4 text-sky-600" />
          Stakeholders & Surveyor Team
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Client / Property Owner
            </label>
            <input
              type="text"
              placeholder="e.g. Apex Asset Management LLC"
              value={facility.clientName || ''}
              onChange={(e) => updateField('clientName', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Facility / Property Manager
            </label>
            <input
              type="text"
              placeholder="e.g. Eng. Tariq Al-Mansoor"
              value={facility.facilityManager || ''}
              onChange={(e) => updateField('facilityManager', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lead Surveyor / Inspector *
            </label>
            <input
              type="text"
              placeholder="e.g. David H. Miller"
              value={facility.surveyorName || ''}
              onChange={(e) => updateField('surveyorName', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Surveying Consultancy / FM Firm
            </label>
            <input
              type="text"
              placeholder="e.g. Global FM Engineering Consultants"
              value={facility.surveyorCompany || ''}
              onChange={(e) => updateField('surveyorCompany', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Date of Condition Survey
            </label>
            <div className="relative">
              <input
                type="date"
                value={facility.surveyDate || ''}
                onChange={(e) => updateField('surveyDate', e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Weather During Audit
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. Dry, 38°C, Clear Sky"
                value={facility.weatherCondition || ''}
                onChange={(e) => updateField('weatherCondition', e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
              <Sun className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
            </div>
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
            placeholder="Describe the scope of building elements, plant rooms, accessibility constraints..."
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
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-98 text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center space-x-2"
        >
          <span>Proceed to Survey Items</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
