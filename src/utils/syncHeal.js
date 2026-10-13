/**
 * Telling this device's own upload apart from another device's edit.
 *
 * ROOT CAUSE of facilities stuck on "changed on another device" with nobody
 * else editing them: a push commits on the server (revision N -> N+1) and only
 * afterwards does the device write down that it now builds on N+1. If the app
 * is reloaded or killed in between -- an over-the-air update installing when
 * the app goes to the background, Android reclaiming memory while the camera
 * is open, the surveyor swiping the app away -- the device still says N. Every
 * later push then sees N+1 on the server, calls it someone else's change, and
 * refuses. Nothing ever clears it, so the facility shows "waiting to sync" for
 * good even though the server already holds exactly what the device sent.
 *
 * The fix never weakens the conflict check. Before committing, the device
 * notes what it is about to send. On a stale refusal it reads the server copy
 * (rows only, no photo bytes) and builds on the newer revision only when that
 * copy holds the same user content as either that note or the device copy
 * itself. Anything else -- a snag added, edited or removed elsewhere -- still
 * stops and asks the surveyor to compare.
 */

const ATTEMPT_PREFIX = 'fm_push_attempt:';
const DEFAULT_TITLE = 'Facility Condition Assessment';
// Stamped by the server when it numbers a facility, so a copy whose receipt
// was lost does not have them yet.
const SERVER_STAMPED = new Set(['facilityNumber', 'facilityCode']);

/** JSON with sorted keys: Postgres jsonb does not keep key order. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const text = (v) => (v == null ? '' : String(v));
// Signatures are images; a digest keeps the note small enough for localStorage.
function digest(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${str.length}:${(h >>> 0).toString(16)}`;
}
const when = (v) => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? String(v) : new Date(t).toISOString();
};

/**
 * The user content of a facility, normalised the way a push and a pull treat
 * it, so a device copy and a server copy of the same work compare equal.
 */
export function uploadShape(survey) {
  if (!survey) return null;
  const facility = {};
  for (const [k, v] of Object.entries(survey.facility || {})) if (!SERVER_STAMPED.has(k)) facility[k] = v;
  return {
    title: survey.title || DEFAULT_TITLE,
    facility,
    signatures: digest(stableStringify(survey.signatures || {})),
    generalNotes: text(survey.generalNotes),
    status: survey.status || 'draft',
    submittedAt: when(survey.submittedAt),
    items: (survey.items || []).map((item) => ({
      id: item.id,
      assetName: text(item.assetName),
      department: item.department || 'GENERAL',
      location: text(item.location),
      priority: item.priority == null ? 2 : Number(item.priority),
      defectDescription: text(item.defectDescription),
      estimatedCost: parseFloat(item.estimatedCost) || 0,
      quantity: parseFloat(item.quantity) || 1,
      unit: item.unit || 'Unit',
      customValues: item.customValues && typeof item.customValues === 'object' ? item.customValues : {},
      photos: (item.photos || []).map((p) => ({
        id: p.id, caption: text(p.caption), name: text(p.name), onServer: Boolean(p.storagePath)
      }))
    }))
  };
}

const photoKey = (p) => stableStringify({ id: p.id, caption: p.caption, name: p.name });

/**
 * True when `server` holds the same work as `device`. The server may lack a
 * photo the device has never uploaded (no storage path yet) -- the next push
 * sends it -- but every other difference counts.
 */
export function sameUserContent(device, server) {
  if (!device || !server) return false;
  const strip = (s) => ({ ...s, items: s.items.map(({ photos, ...rest }) => rest) });
  if (stableStringify(strip(device)) !== stableStringify(strip(server))) return false;
  return device.items.every((item, i) => {
    const onServer = new Map(server.items[i].photos.map((p) => [p.id, photoKey(p)]));
    for (const p of item.photos) {
      if (onServer.has(p.id)) {
        if (onServer.get(p.id) !== photoKey(p)) return false;
        onServer.delete(p.id);
      } else if (p.onServer) {
        return false; // uploaded from here, yet gone: removed elsewhere
      }
    }
    return onServer.size === 0; // a photo this device has never seen
  });
}

function storage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/**
 * Notes, synchronously, what is about to be committed. localStorage rather
 * than IndexedDB because the write must have landed before the request goes
 * out: the whole point is surviving a reload in the next few hundred ms.
 */
export function recordPushAttempt(survey) {
  try {
    storage()?.setItem(ATTEMPT_PREFIX + survey.id, JSON.stringify({
      seenRevision: survey.cloudRevision ?? null,
      shape: uploadShape(survey)
    }));
  } catch { /* storage full or blocked: the device-copy comparison still applies */ }
}

export function readPushAttempt(surveyId) {
  try {
    const raw = storage()?.getItem(ATTEMPT_PREFIX + surveyId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearPushAttempt(surveyId) {
  try { storage()?.removeItem(ATTEMPT_PREFIX + surveyId); } catch { /* nothing to clear */ }
}

/**
 * Whether a stale refusal is only this device's own earlier upload. `server`
 * is the server copy, `attempt` what readPushAttempt returned.
 */
export function isOwnUpload(device, server, attempt) {
  if (!device || !server) return false;
  const seen = device.cloudRevision ?? null;
  if (seen != null && !(server.cloudRevision > seen)) return false;
  const serverShape = uploadShape(server);
  if (sameUserContent(uploadShape(device), serverShape)) return true;
  // The device may have kept editing after the interrupted upload. Its last
  // attempt is then an ancestor of what it holds now, so building on the
  // server copy of that attempt loses nothing from anywhere.
  return Boolean(attempt && attempt.shape && attempt.seenRevision === seen
    && sameUserContent(attempt.shape, serverShape));
}
