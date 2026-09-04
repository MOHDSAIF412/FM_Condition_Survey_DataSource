import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Building2, 
  Wrench,
  MapPin,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import AssetItemCard from './AssetItemCard';
import { DEPARTMENTS, createDefaultAsset } from '../types/survey';

export default function SurveyList({ 
  items = [], 
  onAddItem, 
  onUpdateItem, 
  onDeleteItem
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');

  // Compute distinct recent locations to offer quick chips
  const recentLocations = useMemo(() => {
    return Array.from(new Set(items.map((i) => i.location).filter(Boolean)));
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (item.assetName || '').toLowerCase().includes(q);
        const matchesLoc = (item.location || '').toLowerCase().includes(q);
        const matchesDefect = (item.defectDescription || '').toLowerCase().includes(q);
        const matchesDept = (DEPARTMENTS[item.department]?.name || '').toLowerCase().includes(q);
        if (!matchesName && !matchesLoc && !matchesDefect && !matchesDept) return false;
      }

      // Department Filter
      if (selectedDept !== 'ALL' && (item.department || 'GENERAL') !== selectedDept) {
        return false;
      }

      // Priority Filter
      if (selectedPriority !== 'ALL' && item.priority !== parseInt(selectedPriority)) {
        return false;
      }

      return true;
    });
  }, [items, searchQuery, selectedDept, selectedPriority]);

  // Add next asset and carry forward the location & department
  const handleAddNewAsset = (inheritedLoc, inheritedDept) => {
    const lastItem = items.length > 0 ? items[items.length - 1] : null;
    const locToUse = inheritedLoc !== undefined ? inheritedLoc : (lastItem?.location || '');
    const deptToUse = inheritedDept || (selectedDept !== 'ALL' ? selectedDept : (lastItem?.department || 'HVAC'));
    const newItem = createDefaultAsset(locToUse, deptToUse);

    // If search or priority filters would hide the new item, reset them
    if (searchQuery) setSearchQuery('');
    if (selectedPriority !== 'ALL') setSelectedPriority('ALL');

    onAddItem(newItem);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-8">
      {/* Search and Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search assets, defects, or departments (HVAC, Painting, Carpentry...)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-600 font-bold"
            >
              Clear
            </button>
          )}
        </div>

        {/* Department / Trade Filter Dropdown */}
        <div>
          <div className="flex items-center justify-between mb-1.5 text-[12px] font-bold text-slate-500 uppercase tracking-wider">
            <label htmlFor="dept-filter-select" className="flex items-center gap-1.5 text-slate-700">
              <Wrench className="w-3.5 h-3.5 text-sky-600" />
              <span>Filter by Department / Trade</span>
            </label>
            {selectedDept !== 'ALL' && (
              <button 
                type="button"
                onClick={() => setSelectedDept('ALL')} 
                className="text-sky-600 hover:text-sky-800 normal-case font-semibold text-xs transition-colors cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          <select
            id="dept-filter-select"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm shadow-sm cursor-pointer"
          >
            <option value="ALL">All Departments / Trades ({items.length} Total Assets)</option>
            {Object.keys(DEPARTMENTS).map((dKey) => {
              const dept = DEPARTMENTS[dKey];
              const count = items.filter((i) => (i.department || 'GENERAL') === dKey).length;
              return (
                <option key={dKey} value={dKey}>
                  {dept.name} ({count} {count === 1 ? 'Asset' : 'Assets'})
                </option>
              );
            })}
          </select>
        </div>

        {/* Priority Filter */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs flex-wrap gap-2">
          <div className="flex items-center space-x-1">
            <span className="text-slate-500 font-medium mr-1">Urgency Priority:</span>
            {['ALL', '1', '2', '3', '4'].map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPriority(p)}
                className={`px-2.5 py-1 rounded-lg font-bold ${
                  selectedPriority === p
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p === 'ALL' ? 'ALL' : `P${p}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Add New Item Button Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
          Audited Assets ({filteredItems.length} of {items.length})
        </h2>

        {/* Next Asset Button */}
        <button
          onClick={() => handleAddNewAsset()}
          className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md flex items-center space-x-1.5 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Next Asset</span>
          {items.length > 0 && items[items.length - 1]?.location && (
            <span className="text-[12px] opacity-85 hidden sm:inline">
              (in "{items[items.length - 1].location}")
            </span>
          )}
        </button>
      </div>

      {/* List of Asset Cards */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-700 text-base">No Assets Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || selectedDept !== 'ALL' || selectedPriority !== 'ALL'
              ? 'No items match your selected filters.'
              : 'Your survey list is empty. Tap "Add Next Asset" to begin inspecting.'}
          </p>
          <button
            onClick={() => handleAddNewAsset()}
            className="px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold text-xs inline-flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Asset</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item, idx) => (
            <AssetItemCard
              key={item.id}
              item={item}
              index={idx}
              totalItems={items.length}
              onUpdate={onUpdateItem}
              onUpdateItem={onUpdateItem}
              onDelete={onDeleteItem}
              onDeleteItem={onDeleteItem}
              onAddNextAsset={handleAddNewAsset}
              recentLocations={recentLocations}
            />
          ))}

          {/* Bottom Add Next Asset Prompt */}
          <div className="pt-2 flex justify-center">
            <button
              onClick={() => handleAddNewAsset()}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-white border-2 border-dashed border-sky-400 hover:bg-sky-50 text-sky-700 font-bold text-sm shadow-sm flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Next Asset / Add Another Asset</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
