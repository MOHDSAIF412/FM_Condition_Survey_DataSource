import { useEffect, useState } from 'react';
export function useRecordPage(rows, resetKey, focusId) {
  const [limit, setLimit] = useState(24);
  useEffect(() => { setLimit(24); }, [resetKey]);
  useEffect(() => {
    if (!focusId) return;
    const index = rows.findIndex(row => row.id === focusId);
    if (index >= 24) setLimit(n => Math.max(n, Math.ceil((index + 1) / 24) * 24));
  }, [focusId, rows]);
  return { rows: rows.slice(0, limit), total: rows.length, limit, more: () => setLimit(n => n + 24) };
}
