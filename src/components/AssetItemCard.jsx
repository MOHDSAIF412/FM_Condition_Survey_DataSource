import React, { useState, useRef } from 'react';
import { 
  Camera, 
  Image as ImageIcon, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  DollarSign, 
  MapPin, 
  X, 
  Wrench, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2, 
  Edit3,
  ArrowRight,
  Copy
} from 'lucide-react';
import { PRIORITY_LEVELS, DEPARTMENTS } from '../types/survey';
import { PRESET_FACILITIES, ZONES } from '../data/facilitiesList';
import { compressImage } from '../utils/imageCompressor';

const PHOTO_PRESET_TAGS = [
  'Defect Close-up',
  'Wide Angle Overview',
  'Asset Tag / Serial',
  'Severity Detail',
  'Post-Rectification'
];

function AssetItemCard({ 
  item, 
  index, 
  totalItems = 1,
  onUpdate, 
  onUpdateItem,
  onDelete, 
  onDeleteItem,
  onAddNextAsset,
  recentLocations = []
}) {
  // Collapsed by default. Each expanded card renders ~182 DOM nodes and 27
  // buttons; opening all of them at once was the bulk of the tab-switch cost
  // (~9,300 nodes at 50 assets). The card header still shows name, location,
  // priority, cost and photo count, so the list stays scannable while closed.
  const [isExpanded, setIsExpanded] = useState(false);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
  const [editingCaptionId, setEditingCaptionId] = useState(null);

  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleDelete = () => {
    const fn = onDelete || onDeleteItem;
    if (typeof fn === 'function') {
      fn(item.id);
    } else {
      console.warn('Delete handler not provided to AssetItemCard');
    }
  };

  const handlePrioritySelect = (priorityNum) => {
    const updateFn = onUpdate || onUpdateItem;
    if (typeof updateFn === 'function') updateFn({ ...item, priority: priorityNum });
  };

  const handleDepartmentSelect = (deptKey) => {
    const updateFn = onUpdate || onUpdateItem;
    if (typeof updateFn === 'function') updateFn({ ...item, department: deptKey });
  };

  const handleFieldChange = (field, value) => {
    const updateFn = onUpdate || onUpdateItem;
    if (typeof updateFn === 'function') updateFn({ ...item, [field]: value });
  };

  // Multi-photo upload / Camera append
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsProcessingPhoto(true);
    setProcessingCount(files.length);

    try {
      const compressedPhotos = [];
      const currentPhotosCount = (item.photos || []).length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImage(file);
        
        const photoNum = currentPhotosCount + i + 1;
        compressedPhotos.push({
          ...compressed,
          caption: photoNum === 1 ? 'Defect Close-up' : photoNum === 2 ? 'Wide Angle Overview' : `Evidence Photo #${photoNum}`
        });
      }

      onUpdate({
        ...item,
        photos: [...(item.photos || []), ...compressedPhotos]
      });
    } catch (err) {
      console.error('Error compressing image:', err);
      alert('Could not process photo: ' + err.message);
    } finally {
      setIsProcessingPhoto(false);
      setProcessingCount(0);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemovePhoto = (photoId) => {
    const updated = (item.photos || []).filter((p) => p.id !== photoId);
    onUpdate({
      ...item,
      photos: updated
    });
    if (previewPhotoIndex !== null && previewPhotoIndex >= updated.length) {
      setPreviewPhotoIndex(updated.length > 0 ? updated.length - 1 : null);
    }
  };

  const handleUpdatePhotoCaption = (photoId, newCaption) => {
    const updated = (item.photos || []).map((p) => 
      p.id === photoId ? { ...p, caption: newCaption } : p
    );
    onUpdate({
      ...item,
      photos: updated
    });
  };

  const currentPriority = PRIORITY_LEVELS[item.priority] || PRIORITY_LEVELS[2] || { badge: 'bg-orange-500 text-white', timeframe: '1-2 years', label: 'Priority 2' };
  const currentDept = DEPARTMENTS[item.department] || DEPARTMENTS.GENERAL || { name: 'General', badge: 'bg-slate-100 text-slate-700', badgeSolid: 'bg-slate-700 text-white' };
  const photosList = item.photos || [];

  return (
    <div className={`bg-white rounded-2xl border transition-all shadow-sm overflow-hidden ${
      item.priority === 1 
        ? 'border-rose-300 ring-1 ring-rose-200' 
        : item.priority === 2
        ? 'border-orange-200'
        : 'border-slate-200'
    }`}>
      {/* Card Header / Summary Bar */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-3.5 sm:p-4 bg-slate-50/80 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between transition-colors"
      >
        <div className="flex items-center space-x-3 min-w-0 flex-1 pr-2">
          {/* Asset Number Badge */}
          <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-xs text-white shadow-sm shrink-0">
            #{index + 1}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="font-bold text-slate-800 text-sm truncate">
                {item.assetName || `Asset / Snag #${index + 1}`}
              </span>

              {/* Department Badge */}
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${currentDept.badge || 'border-slate-200'}`}>
                {(currentDept.name || 'General').split('&')[0]}
              </span>

              {/* Priority Badge */}
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${currentPriority.badge}`}>
                P{item.priority}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 truncate">
              {item.location && (
                <span className="font-semibold text-sky-700 flex items-center gap-0.5 shrink-0">
                  <MapPin className="w-3 h-3 text-sky-600 inline" />
                  {item.location}
                </span>
              )}
              {item.defectDescription && (
                <span className="truncate text-slate-500">
                  {item.location ? '• ' : ''}{item.defectDescription}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {/* Photos Count Badge */}
          {photosList.length > 0 ? (
            <span className="text-[12px] font-bold text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded-full border border-sky-300 flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              <span>{photosList.length}</span>
            </span>
          ) : null}

          {item.estimatedCost > 0 && (
            <span className="text-xs font-bold text-slate-700 hidden sm:inline-block">
              ${parseFloat(item.estimatedCost).toLocaleString()}
            </span>
          )}

          {/* Quick Delete in Card Header */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Delete this asset"
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
          </button>

          <button 
            type="button"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
            aria-label="Toggle details"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4 border-t border-slate-100">
          
          {/* Asset Name */}
          <div>
            <label className="block text-[12px] font-bold uppercase text-slate-600 mb-1">
              Asset / Component / Snag Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Chiller Compressor #1, Drywall Paint Peeling, Fire Exit Door"
              value={item.assetName || ''}
              onChange={(e) => handleFieldChange('assetName', e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none font-medium"
            />
          </div>

          {/* Asset Location / Room / Area */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[12px] font-bold uppercase text-slate-600 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-sky-600" />
                Asset Location / Room / Area *
              </label>
              {recentLocations && recentLocations.length > 0 && (
                <span className="text-[11px] text-slate-400">23 Facilities Available</span>
              )}
            </div>

            <div className="space-y-2">
              <select
                value={PRESET_FACILITIES.some((f) => f.name === item.location) ? item.location : ''}
                onChange={(e) => {
                  if (e.target.value) handleFieldChange('location', e.target.value);
                }}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-sky-300 bg-sky-50/50 focus:ring-2 focus:ring-sky-500 focus:outline-none font-bold text-slate-800 cursor-pointer shadow-sm"
              >
                <option value="">-- Select from 23 Facilities (Zone A - E) --</option>
                {ZONES.map((zone) => (
                  <optgroup key={zone} label={`ZONE ${zone}`}>
                    {PRESET_FACILITIES.filter((f) => f.zone === zone).map((f) => (
                      <option key={f.id} value={f.name}>
                        [{f.zone}] {f.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>

              <input
                type="text"
                placeholder="Or specify room / area (e.g. Old Grandstand - Plant Room B1)"
                value={item.location || ''}
                onChange={(e) => handleFieldChange('location', e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none font-medium text-slate-700"
              />
            </div>

            {recentLocations && recentLocations.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {recentLocations.slice(0, 6).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => handleFieldChange('location', loc)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      item.location === loc
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Department / Trade Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[12px] font-bold uppercase text-slate-600 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-sky-600" />
                Department / Trade *
              </label>
              <span className="text-xs font-semibold text-slate-600">
                {currentDept.name}
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-xs">
              {Object.keys(DEPARTMENTS).map((dKey) => {
                const dept = DEPARTMENTS[dKey];
                const isSelected = (item.department || 'GENERAL') === dKey;
                return (
                  <button
                    key={dKey}
                    type="button"
                    onClick={() => handleDepartmentSelect(dKey)}
                    className={`py-1.5 px-2 rounded-xl text-center font-bold truncate transition-all text-[12px] border ${
                      isSelected
                        ? `${dept.badgeSolid} border-transparent shadow-sm scale-[1.02]`
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {(dept.name || 'Trade').split('&')[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Remedial Urgency / Priority Selector (1 - 4) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[12px] font-bold uppercase text-slate-600">
                Remedial Priority (1 - 4)
              </label>
              <span className="text-xs font-semibold text-slate-500">
                {currentPriority.timeframe}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((pNum) => {
                const isSelected = item.priority === pNum;
                const p = PRIORITY_LEVELS[pNum] || { label: `Priority ${pNum}`, timeframe: '', description: '', badge: '' };
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => handlePrioritySelect(pNum)}
                    className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? `${p.badge} shadow-sm scale-[1.02]`
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="font-extrabold text-sm">P{pNum}</span>
                    <span className="text-[11px] truncate max-w-full font-medium">
                      {p.label ? (p.label.split(' ')[1] || p.label) : `P${pNum}`}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] text-slate-500 mt-1.5">
              {currentPriority.description}
            </p>
          </div>

          {/* Observations & Defects */}
          <div>
            <label className="block text-[12px] font-bold uppercase text-slate-600 mb-1">
              Observed Defects & Condition Notes
            </label>
            <textarea
              rows={2}
              placeholder="Describe deterioration, paint peeling, carpentry damage, leakage, mechanical noise, crack..."
              value={item.defectDescription || ''}
              onChange={(e) => handleFieldChange('defectDescription', e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          {/* Quantity and Estimated Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold uppercase text-slate-600 mb-1">
                Estimated Remediation Cost ($)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="50"
                  placeholder="0.00"
                  value={item.estimatedCost ?? ''}
                  onChange={(e) => handleFieldChange('estimatedCost', e.target.value ? parseFloat(e.target.value) : 0)}
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none font-semibold text-slate-800"
                />
                <DollarSign className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold uppercase text-slate-600 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                placeholder="1"
                value={item.quantity ?? 1}
                onChange={(e) => handleFieldChange('quantity', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Photos & Evidence Section (Multi-Photo) */}
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <Camera className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-bold text-slate-700 uppercase">
                  Snag Photos & Evidence ({photosList.length} Attached)
                </span>
              </div>
              <span className="text-[12px] text-slate-500">
                Continuous photo snapping supported
              </span>
            </div>

            {/* Photos Grid */}
            {photosList.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 mb-3">
                {photosList.map((photo, pIdx) => (
                  <div 
                    key={photo.id || pIdx}
                    className="group relative rounded-xl border border-slate-200 bg-slate-900 overflow-hidden shadow-card flex flex-col"
                  >
                    <div 
                      className="aspect-video relative cursor-pointer overflow-hidden bg-black"
                      onClick={() => setPreviewPhotoIndex(pIdx)}
                    >
                      <img
                        src={photo.dataUrl}
                        alt={photo.caption || photo.name || 'Defect'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-white font-bold text-[11px]">
                        #{pIdx + 1}
                      </span>
                      
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Maximize2 className="w-4 h-4 text-white" />
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePhoto(photo.id);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-rose-600 text-white hover:bg-rose-700 shadow-sm transition-colors"
                        title="Delete photo"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="p-1.5 bg-slate-800 text-white flex items-center justify-between gap-1">
                      {editingCaptionId === photo.id ? (
                        <div className="flex items-center space-x-1 w-full">
                          <input
                            type="text"
                            value={photo.caption || ''}
                            onChange={(e) => handleUpdatePhotoCaption(photo.id, e.target.value)}
                            onBlur={() => setEditingCaptionId(null)}
                            onKeyDown={(e) => e.key === 'Enter' && setEditingCaptionId(null)}
                            autoFocus
                            className="w-full px-1.5 py-0.5 text-[11px] text-slate-900 rounded bg-white focus:outline-none"
                            placeholder="Type caption..."
                          />
                          <button
                            type="button"
                            onClick={() => setEditingCaptionId(null)}
                            className="text-[11px] text-sky-400 font-bold px-1"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <div 
                          className="flex items-center justify-between w-full cursor-pointer hover:text-sky-300"
                          onClick={() => setEditingCaptionId(photo.id)}
                          title="Click to edit caption"
                        >
                          <span className="text-[11px] truncate max-w-[120px] font-medium text-slate-200">
                            {photo.caption || 'Add caption...'}
                          </span>
                          <Edit3 className="w-2.5 h-2.5 text-slate-400 shrink-0 ml-1" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Photo Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isProcessingPhoto}
                onClick={() => cameraInputRef.current?.click()}
                className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md transition-all"
              >
                <Camera className="w-4 h-4" />
                <span>
                  {isProcessingPhoto 
                    ? `Compressing (${processingCount})...` 
                    : photosList.length > 0 
                    ? `Snap Another Photo (+)` 
                    : `Snap Photo (Camera)`}
                </span>
              </button>

              <button
                type="button"
                disabled={isProcessingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md transition-all"
              >
                <ImageIcon className="w-4 h-4" />
                <span>Add Photos</span>
              </button>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Card Bottom Actions: NEXT ASSET BUTTON & DELETE */}
          <div className="pt-3 flex items-center justify-between border-t border-slate-100 flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="text-xs font-semibold flex items-center space-x-1.5 py-2 px-3 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
              title="Delete this asset"
            >
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span>Delete Asset</span>
            </button>

            {/* Next Asset Button (inherits location) */}
            <button
              type="button"
              onClick={() => onAddNextAsset(item.location, item.department)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md flex items-center space-x-1.5 transition-all active:scale-95 cursor-pointer"
              title="Add next asset item inheriting this location"
            >
              <Plus className="w-4 h-4" />
              <span>+ Next Asset {item.location ? `(Same Room: ${item.location})` : ''}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {previewPhotoIndex !== null && photosList[previewPhotoIndex] && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-2 sm:p-4 backdrop-blur-md"
          onClick={() => setPreviewPhotoIndex(null)}
        >
          <div 
            className="relative max-w-3xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 bg-slate-800 flex items-center justify-between text-white border-b border-slate-700">
              <div className="flex items-center space-x-2 truncate">
                <span className="px-2 py-0.5 rounded-full bg-sky-500 text-white font-bold text-xs">
                  Photo {previewPhotoIndex + 1} of {photosList.length}
                </span>
                <span className="text-xs font-semibold text-slate-200 truncate">
                  {photosList[previewPhotoIndex].caption || item.assetName}
                </span>
              </div>
              <button 
                onClick={() => setPreviewPhotoIndex(null)} 
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative p-2 flex items-center justify-center bg-black flex-1 min-h-[300px] overflow-hidden">
              <img 
                src={photosList[previewPhotoIndex].dataUrl} 
                alt="Enlarged snag defect" 
                className="max-h-[65vh] w-auto object-contain rounded-lg"
              />

              {photosList.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewPhotoIndex((prev) => (prev > 0 ? prev - 1 : photosList.length - 1));
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 backdrop-blur-sm transition-all shadow-lg"
                  title="Previous Photo"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {photosList.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewPhotoIndex((prev) => (prev < photosList.length - 1 ? prev + 1 : 0));
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 backdrop-blur-sm transition-all shadow-lg"
                  title="Next Photo"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            <div className="p-3 bg-slate-800 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2 border-t border-slate-700">
              <div className="flex items-center space-x-2 flex-1">
                <span className="font-semibold text-slate-400">Caption:</span>
                <input
                  type="text"
                  value={photosList[previewPhotoIndex].caption || ''}
                  onChange={(e) => handleUpdatePhotoCaption(photosList[previewPhotoIndex].id, e.target.value)}
                  placeholder="Enter caption for this photo..."
                  className="px-2 py-1 rounded bg-slate-700 text-white border border-slate-600 text-xs flex-1 max-w-sm focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-3 text-[12px] text-slate-400">
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(photosList[previewPhotoIndex].id)}
                  className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Photo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Memoised: without this, editing one field re-rendered every card in the
   survey, because App re-creates the items array on each keystroke. */
export default React.memo(AssetItemCard);
