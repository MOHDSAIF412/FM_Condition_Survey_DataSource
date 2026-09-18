import React, { useEffect, useMemo, useState } from 'react';
import SavedFacilities from '../components/SavedFacilities';
import { cachedPriorityBySurvey, loadPriorityBreakdown, narrowFor } from './portalData';

/**
 * Every facility the user can see, across projects -- where the dashboard's
 * numbers lead. `filter` is what the clicked number counted (see
 * facilityListFilter), so the list always shows exactly those facilities.
 */
export default function AllFacilities({ surveys = [], projects = [], filter, onClearNarrow, ...listProps }) {
  const [bySurvey, setBySurvey] = useState(() => cachedPriorityBySurvey());

  const ids = useMemo(() => surveys.filter((s) => !s.localOnly).map((s) => s.id), [surveys]);
  const idsKey = ids.join(',');

  // Priority counts live on the snags, not the facility rows, so a priority
  // filter needs them loaded. The last known counts show meanwhile.
  useEffect(() => {
    if (!filter?.priority || !ids.length) return undefined;
    let cancelled = false;
    loadPriorityBreakdown(ids)
      .then((b) => { if (!cancelled && b) setBySurvey(b.bySurvey); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter?.priority, idsKey]);

  const narrow = useMemo(() => narrowFor(filter, bySurvey), [filter, bySurvey]);
  const focus = useMemo(
    () => (filter ? { key: filter.status, projectId: filter.projectId, nonce: filter.nonce } : null),
    [filter]
  );

  return (
    <SavedFacilities
      {...listProps}
      title="All Facilities"
      scrollOnFocus={false}
      surveys={surveys}
      projects={projects}
      narrow={narrow}
      onClearNarrow={onClearNarrow}
      focus={focus}
    />
  );
}
