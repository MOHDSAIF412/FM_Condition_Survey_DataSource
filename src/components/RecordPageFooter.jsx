import React from 'react';
export default function RecordPageFooter({ page }) {
  if (page.total <= 24) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Showing {page.rows.length} of {page.total} records</p>{page.rows.length < page.total && <button type="button" onClick={page.more} className="min-h-11 rounded-xl bg-ocs-50 px-4 font-semibold text-sm text-ocs-600">Load 24 more</button>}</div>;
}
