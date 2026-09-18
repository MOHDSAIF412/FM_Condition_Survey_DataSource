/**
 * Pure decisions about which copy of a survey to trust and how to list them.
 * Kept free of React, IndexedDB and network calls so each rule has a test.
 */

/**
 * Which copy to open when a surveyor picks a facility.
 *
 * The device copy wins whenever it holds edits that have not uploaded. Opening
 * used to take the server copy unconditionally and save it over the device
 * copy marked as synced, which destroyed unsent work while the badge read
 * "All data synced". With no connection the device copy is the only one there
 * is, so it is used rather than refusing to open.
 *
 * @returns {{ survey: object|null, source: 'local'|'remote'|null, reason: string }}
 */
export function chooseSurveyToOpen(local, remote) {
  const hasLocal = !!(local && local.id);
  if (hasLocal && local.pendingSync === true) {
    return { survey: local, source: 'local', reason: 'unsent-edits' };
  }
  if (remote && remote.id) {
    return { survey: remote, source: 'remote', reason: 'server' };
  }
  if (hasLocal) {
    return { survey: local, source: 'local', reason: 'device-copy' };
  }
  return { survey: null, source: null, reason: 'unavailable' };
}

/** The date a facility row is shown with, and therefore sorted by. */
export function sortDate(s) {
  const t = Date.parse(s?.submittedAt || s?.updatedAt || '');
  return Number.isNaN(t) ? 0 : t;
}

/**
 * The Saved Facilities list: server rows plus anything only on this device.
 *
 * `projectId` must survive for device-only rows. The project screen filters on
 * it, so dropping it hid every facility that had not uploaded yet -- with no
 * signal, the whole list came up empty.
 *
 * `cached` marks rows known only from the last list this device downloaded;
 * they can be shown offline but not opened unless a device copy also exists.
 */
export function mergeSurveyLists(remote = [], local = [], {
  remoteIsCached = false, serverIsAuthoritative = false, visibleProjectIds = null
} = {}) {
  const merged = new Map(
    remote.map((s) => [s.id, { ...s, pendingSync: false, cached: remoteIsCached }])
  );
  const onDevice = new Set();

  for (const l of local) {
    if (!l || !l.id) continue;
    // A blank scratch survey that was never submitted is noise in this list.
    if (!l.submittedAt && !(l.items || []).length) continue;
    onDevice.add(l.id);

    const existing = merged.get(l.id);
    if (existing) {
      merged.set(l.id, {
        ...existing,
        projectId: existing.projectId || l.projectId || null,
        pendingSync: !!l.pendingSync,
        cached: false
      });
      continue;
    }

    // A fresh server list shows exactly what this account may see. A device
    // copy it does not list -- deleted elsewhere, or in a project this account
    // is not on (another account used this device) -- stays on the device but
    // off the list, unless it holds work that has not uploaded yet.
    if (serverIsAuthoritative && !l.pendingSync) {
      onDevice.delete(l.id);
      continue;
    }
    // Unsent work in a project this account cannot see belongs to whoever
    // used the device before. It stays stored, and uploads when they sign in.
    if (visibleProjectIds && l.projectId && !visibleProjectIds.has(l.projectId)) {
      onDevice.delete(l.id);
      continue;
    }

    merged.set(l.id, {
      id: l.id,
      title: l.title,
      projectId: l.projectId || null,
      facility: l.facility || {},
      facilityName: l.facility?.facilityName || l.facility?.buildingName || '',
      itemCount: (l.items || []).length,
      photoCount: (l.items || []).reduce((n, it) => n + (it.photos || []).length, 0),
      status: l.status || 'draft',
      submittedAt: l.submittedAt || null,
      updatedAt: l.updatedAt || null,
      reviewStatus: l.review?.status ?? null,
      reviewNote: l.review?.note ?? null,
      dueDate: l.dueDate ?? null,
      pendingSync: !!l.pendingSync,
      localOnly: true,
      cached: false
    });
  }

  return [...merged.values()]
    .map((s) => ({ ...s, onDevice: onDevice.has(s.id) }))
    .sort((a, b) => sortDate(b) - sortDate(a));
}
