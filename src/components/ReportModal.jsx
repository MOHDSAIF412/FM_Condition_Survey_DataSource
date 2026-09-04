import React, { useState, useMemo } from 'react';
import { 
  FileText, 
  Download, 
  Printer, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Building, 
  Building2, 
  Calendar, 
  User, 
  Clock, 
  MapPin, 
  DollarSign,
  Share2,
  Sparkles,
  Loader2,
  ExternalLink,
  Compass,
  Wrench,
  FileSpreadsheet,
  Camera
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { PRIORITY_LEVELS, DEPARTMENTS, calculateSurveyStats } from '../types/survey';
import { generateSurveyPDF } from '../utils/pdfGenerator';
import { generateSurveyExcel } from '../utils/excelGenerator';

export default function ReportModal({ survey = {}, onClose }) {
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState('ALL');

  const allItems = survey?.items || [];

  const facilityLocations = useMemo(() => {
    return Array.from(new Set(allItems.map((i) => i.location).filter(Boolean)));
  }, [allItems]);

  const filteredReportItems = useMemo(() => {
    if (selectedFacility === 'ALL') return allItems;
    return allItems.filter((i) => (i.location || 'General') === selectedFacility);
  }, [allItems, selectedFacility]);

  const stats = calculateSurveyStats(filteredReportItems);
  const facility = survey?.facility || {};
  const googleLoc = facility?.googleLocation || {};

  const handleExportExcel = async () => {
    setIsGeneratingExcel(true);
    try {
      await generateSurveyExcel(survey, selectedFacility);
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.7 }
      });
    } catch (err) {
      console.error('Failed generating Excel report:', err);
      alert('Error generating Excel report: ' + err.message);
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await generateSurveyPDF(survey, selectedFacility);
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err) {
      console.error('Failed generating PDF:', err);
      alert('Error generating PDF report: ' + err.message);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm overflow-y-auto flex flex-col items-center justify-start p-2 sm:p-6 print:p-0 print:bg-white">
      {/* Top Floating Control Toolbar */}
      <div className="sticky top-2 z-50 w-full max-w-4xl bg-slate-900 text-white rounded-2xl p-3 sm:p-4 shadow-2xl border border-slate-800 flex items-center justify-between gap-2 mb-4 no-print">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm truncate">Audit Report & CapEx Preview</h3>
            <p className="text-[11px] text-slate-400 truncate">
              {facility.facilityName || facility.buildingName || 'Condition Survey'} • Excel & PDF Ready
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={handlePrint}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold hidden sm:flex items-center gap-1.5 transition-colors"
            title="Print or Save via Browser"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>

          {/* Export to Excel (.xlsx) with Photos */}
          <button
            onClick={handleExportExcel}
            disabled={isGeneratingExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-700/20 flex items-center gap-1.5 transition-all"
            title="Download multi-sheet Excel (.xlsx) audit report with embedded photos"
          >
            {isGeneratingExcel ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Compiling Excel...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel (.xlsx)</span>
              </>
            )}
          </button>

          {/* Download PDF */}
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-lg shadow-sky-600/30 flex items-center gap-1.5 transition-all"
          >
            {isGeneratingPDF ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Compiling PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Facility Filter Toolbar */}
      <div className="w-full max-w-4xl mb-3 bg-slate-900 text-white p-3 sm:p-3.5 rounded-2xl border border-slate-800 shadow-lg flex items-center justify-between flex-wrap gap-2.5 no-print">
        <div className="flex items-center space-x-2">
          <Building2 className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Generate Report Facility-Wise:
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">Facility:</span>
          <select
            value={selectedFacility}
            onChange={(e) => setSelectedFacility(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
          >
            <option value="ALL">All Facilities ({allItems.length} Assets)</option>
            {facilityLocations.map((loc) => {
              const count = allItems.filter((i) => (i.location || 'General') === loc).length;
              return (
                <option key={loc} value={loc}>
                  {loc} ({count} Assets)
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Printable Report Document Sheet */}
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 text-slate-800 font-sans print:shadow-none print:border-none print:rounded-none">
        
        {/* Document Header / Cover Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white p-6 sm:p-10 border-b border-slate-800">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="space-y-1">
              <span className="text-[11px] font-mono tracking-widest uppercase px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 inline-block">
                FM Condition Survey & Snag Report
              </span>
              <span className="text-xs text-slate-400 block pt-1">
                CONFIDENTIAL AUDIT
              </span>
            </div>

            {/* OCS Company Logo */}
            <div className="bg-white px-3 py-1.5 rounded-xl shadow-lg border border-slate-200 shrink-0">
              <img 
                src="/ocs_logo.png" 
                alt="OCS Logo" 
                className="h-10 sm:h-12 w-auto object-contain"
              />
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {facility.facilityName || facility.buildingName || 'Facilities Condition Audit'}
          </h1>
          {facility.facilityName && facility.buildingName && (
            <p className="text-sky-300 text-sm font-semibold mt-0.5">
              {facility.buildingName}
            </p>
          )}

          {/* Google Location Link Bar */}
          <div className="mt-4 p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-xs flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2 truncate">
              <Compass className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-slate-300 truncate font-medium">
                {googleLoc.address || facility.address || 'Site Address unassigned'}
              </span>
              {googleLoc.latitude && (
                <span className="text-emerald-400 font-mono text-[11px] hidden sm:inline">
                  (GPS: {googleLoc.latitude}, {googleLoc.longitude})
                </span>
              )}
            </div>

            {googleLoc.mapsUrl && (
              <a
                href={googleLoc.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 shrink-0 underline"
              >
                <span>Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-semibold block">Asset Code</span>
              <span className="font-semibold text-white">{facility.buildingCode || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-semibold block">Inspection Date</span>
              <span className="font-semibold text-white">{facility.surveyDate || new Date().toLocaleDateString()}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-semibold block">Lead Inspector</span>
              <span className="font-semibold text-white truncate block">{facility.surveyorName || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-semibold block">Client / Manager</span>
              <span className="font-semibold text-white truncate block">{facility.clientName || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Executive Condition Scorecard */}
        <div className="p-6 sm:p-8 bg-slate-50 border-b border-slate-200">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
            1. Executive Scorecard & Audit Summary
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Assets Audited</span>
              <div className="text-3xl font-extrabold text-slate-900 my-1">{stats.total}</div>
              <span className="text-[11px] text-slate-500 font-medium">Cataloged Snags</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Photos Attached</span>
              <div className="text-3xl font-extrabold text-sky-600 my-1">{stats.totalPhotos || 0}</div>
              <span className="text-[11px] text-slate-500 font-medium">Defect Evidence</span>
            </div>

            <div className={`p-4 rounded-xl border shadow-sm text-center ${
              (stats?.priorityCounts?.[1] || 0) > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'
            }`}>
              <span className={`text-[10px] font-bold uppercase ${(stats?.priorityCounts?.[1] || 0) > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                Urgent Hazards (P1)
              </span>
              <div className={`text-3xl font-extrabold my-1 ${(stats?.priorityCounts?.[1] || 0) > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {stats?.priorityCounts?.[1] || 0}
              </div>
              <span className="text-[11px] font-medium text-slate-600">Immediate Action</span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Remediation CapEx</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 my-1 truncate">
                ${(stats?.totalCost || 0).toLocaleString()}
              </div>
              <span className="text-[11px] text-slate-500 font-medium">Preliminary Budget</span>
            </div>
          </div>

          {/* Departmental Work Order Allocation Table */}
          <div className="mt-6 bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-sky-600" />
              Maintenance Department / Trade CapEx Allocation
            </h4>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Department / Trade</th>
                    <th className="p-2.5 text-center">Defect Count</th>
                    <th className="p-2.5 text-right">Remedial Budget</th>
                    <th className="p-2.5 text-center">CapEx Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.keys(DEPARTMENTS).map((dKey) => {
                    const dept = DEPARTMENTS[dKey];
                    const dStat = stats.departmentStats[dKey] || { count: 0, cost: 0 };
                    if (dStat.count === 0 && dStat.cost === 0) return null;
                    const pct = stats.totalCost > 0 ? Math.round((dStat.cost / stats.totalCost) * 100) : 0;
                    return (
                      <tr key={dKey}>
                        <td className="p-2.5 font-bold text-slate-800 flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${dept.badge}`}>
                            {dept.name}
                          </span>
                        </td>
                        <td className="p-2.5 text-center font-semibold text-slate-700">{dStat.count}</td>
                        <td className="p-2.5 text-right font-bold text-slate-900">${dStat.cost.toLocaleString()}</td>
                        <td className="p-2.5 text-center font-semibold text-slate-500">{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detailed Asset Condition Register Table (Clean Columns) */}
        <div className="p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              2. Asset Condition & Defect Schedule
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              {filteredReportItems.length} Assets in Report
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Asset / Component</th>
                  <th className="p-3">Location / Room</th>
                  <th className="p-3">Department</th>
                  <th className="p-3 text-center">Priority</th>
                  <th className="p-3">Observed Defects</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-right">Est. Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredReportItems.map((item, idx) => {
                  const dept = DEPARTMENTS[item.department] || DEPARTMENTS.GENERAL || { name: 'General', badge: 'bg-slate-100' };
                  const priority = PRIORITY_LEVELS[item.priority] || PRIORITY_LEVELS[2] || { badge: 'bg-slate-100' };
                  return (
                    <tr key={item.id || idx} className="hover:bg-slate-50/80">
                      <td className="p-3 font-bold text-slate-500">{idx + 1}</td>
                      <td className="p-3 font-bold text-slate-900">{item.assetName || 'Unnamed Asset'}</td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span>{item.location || 'General Site Area'}</span>
                        </div>
                        {(googleLoc.latitude || googleLoc.address) && (
                          <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                            {googleLoc.latitude ? `${googleLoc.latitude}, ${googleLoc.longitude}` : googleLoc.address}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${dept.badge || 'border-slate-200'}`}>
                          {(dept?.name || 'General').split('&')[0]}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${priority.badge}`}>
                          P{item.priority}
                        </span>
                      </td>
                      <td className="p-3 max-w-xs text-[11px] text-slate-600">
                        {item.defectDescription || 'No defect noted.'}
                      </td>
                      <td className="p-3 text-center font-medium text-slate-700">
                        {item.quantity || 1}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">
                        ${(parseFloat(item.estimatedCost) || 0).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Photographic Evidence Log */}
        {filteredReportItems.some((i) => i.photos && i.photos.length > 0) && (
          <div className="p-6 sm:p-8 bg-slate-50 border-t border-slate-200 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                3. Photographic Defect Evidence Log
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                {filteredReportItems.reduce((sum, i) => sum + (i.photos?.length || 0), 0)} Total Photos Across Snags
              </span>
            </div>

            <div className="space-y-6">
              {filteredReportItems.filter((item) => item.photos && item.photos.length > 0).map((item, snagIdx) => (
                <div key={item.id || snagIdx} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3">
                  {/* Snag Header */}
                  <div className="flex items-start justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="font-extrabold text-slate-900 text-sm">
                          Snag #{snagIdx + 1}: {item.assetName}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${PRIORITY_LEVELS[item.priority]?.badge}`}>
                          P{item.priority}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${DEPARTMENTS[item.department]?.badge || 'bg-slate-100'}`}>
                          {DEPARTMENTS[item.department]?.name || 'General FM'}
                        </span>
                      </div>

                      {/* Asset Location with Google GPS */}
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-600 flex-wrap">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-sky-600" />
                          <span>Location: <strong className="text-slate-800">{item.location || 'General Site Area'}</strong></span>
                        </span>
                        {(googleLoc.latitude || googleLoc.address) && (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px] font-medium flex items-center gap-1">
                            <Compass className="w-3 h-3 text-emerald-600" />
                            <span>GPS: {googleLoc.latitude ? `${googleLoc.latitude}, ${googleLoc.longitude}` : googleLoc.address}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-700 block">
                        Est. Cost: ${(parseFloat(item.estimatedCost) || 0).toLocaleString()}
                      </span>
                      <span className="text-[11px] font-semibold text-sky-600">
                        {item.photos.length} {item.photos.length === 1 ? 'Photo attached' : 'Photos attached'}
                      </span>
                    </div>
                  </div>

                  {/* Defect Description */}
                  <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <strong className="text-slate-900">Observation: </strong>{item.defectDescription || 'No description recorded.'}
                  </p>

                  {/* Multi-Photo Grid for this Snag */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                    {item.photos.map((photo, pIdx) => (
                      <div key={photo.id || pIdx} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-200 shadow-xs flex flex-col">
                        <div className="aspect-video bg-black flex items-center justify-center relative overflow-hidden">
                          <img src={photo.dataUrl} alt={photo.caption || photo.name} className="w-full h-full object-cover" />
                          <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/75 text-white font-bold text-[10px]">
                            Photo #{pIdx + 1} of {item.photos.length}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-800 text-white text-xs">
                          <p className="text-[11px] font-medium text-slate-200 truncate">
                            {photo.caption || `Defect Evidence #${pIdx + 1}`}
                          </p>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {photo.timestamp ? new Date(photo.timestamp).toLocaleDateString() : 'Site Camera'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Formal Sign-Off Section */}
        <div className="p-6 sm:p-8 border-t border-slate-200 space-y-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            4. Formal Signatures & Certification
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Surveyor */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <span className="text-xs font-bold text-slate-800 uppercase block">Lead Surveyor Sign-Off</span>
              <div className="text-xs space-y-1 text-slate-600">
                <p><strong className="text-slate-800">Surveyor:</strong> {survey.signatures?.surveyor?.name || facility.surveyorName || 'N/A'}</p>
                <p><strong className="text-slate-800">Firm:</strong> {facility.surveyorCompany || 'N/A'}</p>
                <p><strong className="text-slate-800">Date:</strong> {survey.signatures?.surveyor?.date || facility.surveyDate || ''}</p>
              </div>

              <div className="h-20 bg-white border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                {survey.signatures?.surveyor?.signatureData ? (
                  <img src={survey.signatures.surveyor.signatureData} alt="Surveyor Signature" className="max-h-16 object-contain" />
                ) : (
                  <span className="text-slate-400 text-xs italic">Pending Touch Signature</span>
                )}
              </div>
            </div>

            {/* Client / Property Manager */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <span className="text-xs font-bold text-slate-800 uppercase block">Client / FM Representative</span>
              <div className="text-xs space-y-1 text-slate-600">
                <p><strong className="text-slate-800">Representative:</strong> {survey.signatures?.client?.name || facility.clientName || 'N/A'}</p>
                <p><strong className="text-slate-800">Organization:</strong> {facility.clientName || 'N/A'}</p>
                <p><strong className="text-slate-800">Date:</strong> {survey.signatures?.client?.date || facility.surveyDate || ''}</p>
              </div>

              <div className="h-20 bg-white border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                {survey.signatures?.client?.signatureData ? (
                  <img src={survey.signatures.client.signatureData} alt="Client Signature" className="max-h-16 object-contain" />
                ) : (
                  <span className="text-slate-400 text-xs italic">Pending Touch Signature</span>
                )}
              </div>
            </div>
          </div>

          <div className="text-center text-[11px] text-slate-400 pt-4 border-t border-slate-100">
            Report generated electronically via FM Condition Survey Engine • Confidential
          </div>
        </div>

      </div>

      {/* Bottom Floating Bar on Mobile */}
      <div className="w-full max-w-4xl mt-4 sm:hidden grid grid-cols-2 gap-2 no-print pb-6">
        <button
          onClick={handleExportExcel}
          disabled={isGeneratingExcel}
          className="py-3 px-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xl flex items-center justify-center space-x-1.5"
        >
          {isGeneratingExcel ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Compiling...</span>
            </>
          ) : (
            <>
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel</span>
            </>
          )}
        </button>
        <button
          onClick={handleDownloadPDF}
          disabled={isGeneratingPDF}
          className="py-3 px-2 rounded-xl bg-sky-600 text-white font-bold text-xs shadow-xl flex items-center justify-center space-x-1.5"
        >
          <Download className="w-4 h-4" />
          <span>{isGeneratingPDF ? 'Compiling...' : 'Download PDF'}</span>
        </button>
      </div>
    </div>
  );
}
