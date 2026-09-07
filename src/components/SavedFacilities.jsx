import React, { useState } from 'react';
import { FileText, FileSpreadsheet, FolderOpen, CheckCircle2, Loader2 } from 'lucide-react';
import { pullSurvey, hydratePhotos } from '../utils/cloudSync';
import { generateSurveyPDF } from '../utils/pdfGenerator';
import { generateSurveyExcel } from '../utils/excelGenerator';
import { formatMoney } from '../utils/currency';

/**
 * Every facility that has been saved, with a report download per facility.
 *
 * Reports are generated from the server copy rather than whatever happens to be
 * open, so a facility submitted from the phone can be downloaded on the laptop.
 * Photo bytes are fetched first -- the generators read from dataUrl, and a
 * facility synced from another device carries only storage paths until then.
 */
export default function SavedFacilities({ surveys = [], currentId, onOpen, onRefresh }) {
  const [busy, setBusy] = useState(null);

  const download = async (surveyId, kind) => {
    setBusy(`${surveyId}:${kind}`);
    try {
      const survey = await pullSurvey(surveyId, {});
      if (!survey) {
        alert('That facility could not be loaded. Check your connection and try again.');
        return;
      }
      const ready = await hydratePhotos(survey);
      if (kind === 'pdf') await generateSurveyPDF(ready, 'ALL');
      else await generateSurveyExcel(ready, 'ALL');
    } catch (err) {
      console.error('Report failed:', err);
      alert('Could not build the report: ' + (err.message || err));
    } finally {
      setBusy(null);
    }
  };

  if (!surveys.length) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
        <FolderOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <h3 className="font-bold text-slate-700 text-sm">No saved facilities yet</h3>
        <p className="text-xs text-slate-500 mt-1">
          Finish a facility and press Submit. It will be listed here with its reports.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Saved Facilities ({surveys.length})
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs font-semibold text-ocs-600 hover:text-ocs-700"
        >
          Refresh
        </button>
      </div>

      <ul className="divide-y divide-slate-100">
        {surveys.map((s) => {
          const isCurrent = s.id === currentId;
          return (
            <li key={s.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 text-sm truncate">
                    {s.facilityName}
                  </span>
                  {s.status === 'submitted' ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Submitted
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      Draft
                    </span>
                  )}
                  {isCurrent && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ocs-100 text-ocs-700 border border-ocs-200">
                      Open now
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {s.submittedAt
                    ? `Submitted ${new Date(s.submittedAt).toLocaleString()}`
                    : `Updated ${new Date(s.updatedAt).toLocaleString()}`}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => onOpen(s.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Open
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => download(s.id, 'pdf')}
                  className="px-2.5 py-1.5 rounded-lg bg-ocs-600 hover:bg-ocs-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1"
                >
                  {busy === `${s.id}:pdf`
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <FileText className="w-3.5 h-3.5" />}
                  PDF
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => download(s.id, 'excel')}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1"
                >
                  {busy === `${s.id}:excel`
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <FileSpreadsheet className="w-3.5 h-3.5" />}
                  Excel
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
