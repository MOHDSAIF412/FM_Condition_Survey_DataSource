/**
 * Cloud sync for condition surveys.
 *
 * IndexedDB stays the source of truth on site so the app keeps working with no
 * signal in a plant room. This layer pushes that local state up when a
 * connection is available and pulls changes from other devices down, which is
 * what makes a phone and a laptop show the same survey.
 *
 * Conflicts are resolved last-write-wins on `revision`.
 */
import { supabase, isCloudConfigured, PHOTO_BUCKET } from './supabaseClient';

/* ------------------------------------------------------------------ photos */

const UPLOADABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Photos downloaded at once when building a report. Tuned for a phone on site:
// enough to keep the connection busy, not so many that a large report starves
// the rest of the app or trips server-side rate limiting.
const PHOTO_FETCH_CONCURRENCY = 6;

/**
 * Turns any data URL into an uploadable image Blob.
 *
 * fetch() is used rather than atob() because data URLs are not always base64:
 * the sample photos are `data:image/svg+xml;utf8,<percent-encoded>`, and atob()
 * throws on those, which previously aborted the whole survey push.
 *
 * Anything that is not already a JPEG/PNG/WebP (SVG, for instance) is drawn to
 * a canvas and re-encoded, since the storage bucket only accepts those types.
 */
async function dataUrlToUploadableBlob(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  if (UPLOADABLE_TYPES.includes(blob.type)) return blob;

  const bitmapUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image could not be decoded for upload'));
      el.src = bitmapUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 800;
    canvas.height = img.naturalHeight || 600;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Uploads a photo if it is not in the bucket yet. Returns its storage path. */
async function uploadPhoto(surveyId, itemId, photo) {
  if (photo.storagePath) return photo.storagePath;

  const path = `${surveyId}/${itemId}/${photo.id}.jpg`;
  const body = await dataUrlToUploadableBlob(photo.dataUrl);
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, body, {
      contentType: 'image/jpeg',
      upsert: true
    });

  // "already exists" is fine, the object is what we wanted either way.
  if (error && !/exists/i.test(error.message || '')) throw error;
  return path;
}

/** Downloads a photo back into a data URL so the PDF/Excel code is unchanged. */
export async function downloadPhoto(storagePath) {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(storagePath);
  if (error) throw error;

  // A photo missing from Storage can come back as an error document rather
  // than an error, and this project has had orphaned photo rows before. Without
  // this check that body is turned into a "data:application/json" URL, which
  // then rides silently into a client's PDF and Excel as a broken image.
  if (!data || !String(data.type || '').startsWith('image/')) {
    throw new Error(`storage returned ${data?.type || 'no content'} for ${storagePath}`);
  }
  return blobToDataUrl(data);
}

/* -------------------------------------------------------------------- push */

/**
 * Pushes the whole survey. Items are replaced wholesale: a survey is tens of
 * rows, so diffing would add failure modes for no real gain, and replacing
 * makes deletes propagate without extra bookkeeping.
 */
export async function pushSurvey(survey) {
  if (!isCloudConfigured || !survey || !survey.id) return { skipped: true };

  // This push replaces the server's items wholesale, so a client pushing a
  // stale or partially-loaded survey would silently destroy whatever the
  // server holds.
  //
  // Comparing `revision` counters is NOT sufficient: each browser increments
  // its own local counter on every save, so a device that has been edited a
  // lot ends up with a higher number than the server without ever having seen
  // the server's current state. That defeated the first version of this guard
  // and cost a survey its items.
  //
  // The reliable test is the one an ETag makes: only push if this client has
  // actually seen the server revision it is about to overwrite. `cloudRevision`
  // is stamped onto the local record whenever we pull, so it means "the server
  // state I am building on".
  const { data: current, error: readErr } = await supabase
    .from('condition_surveys')
    .select('revision')
    .eq('id', survey.id)
    .limit(1);
  if (readErr) throw readErr;

  const serverExists = Boolean(current && current.length);
  const serverRevision = serverExists ? current[0].revision || 0 : 0;
  const seenRevision = survey.cloudRevision;

  if (serverExists && seenRevision !== undefined && seenRevision !== serverRevision) {
    return { conflict: true, reason: 'stale', serverRevision, seenRevision };
  }

  // Belt and braces for the case the ETag check cannot see: a client that has
  // never pulled (cloudRevision undefined) and holds far less than the server.
  // Losing most of a survey is never an acceptable silent outcome, so refuse
  // and make the caller reconcile.
  if (serverExists && seenRevision === undefined) {
    const { count, error: countErr } = await supabase
      .from('survey_items')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', survey.id);
    if (countErr) throw countErr;

    const serverItems = count || 0;
    const localItems = (survey.items || []).length;
    if (serverItems >= 3 && localItems < serverItems / 2) {
      return { conflict: true, reason: 'destructive', serverItems, localItems };
    }
  }

  const nextRevision = serverRevision + 1;

  // `project_id` is included only when this client knows it. An upsert updates
  // exactly the columns it is given, so omitting it leaves the server's link
  // alone -- a device still running an older bundle cannot blank a facility's
  // project by pushing an edit.
  const surveyRow = {
    id: survey.id,
    title: survey.title || null,
    facility: survey.facility || {},
    signatures: survey.signatures || {},
    general_notes: survey.generalNotes || null,
    revision: nextRevision,
    status: survey.status || 'draft',
    submitted_at: survey.submittedAt || null,
    facility_name: (survey.facility && (survey.facility.facilityName || survey.facility.buildingName)) || null,
    updated_at: new Date().toISOString()
  };
  if (survey.projectId) surveyRow.project_id = survey.projectId;

  // `facility_number` is deliberately absent from surveyRow: the column's
  // sequence default assigns it when the row is first inserted, and an upsert
  // only touches the columns it is given, so later edits leave it alone. That
  // is what makes the number collision-proof -- worked out on the device, two
  // surveyors creating a facility at the same moment both picked the same one.
  const { data: savedSurvey, error: surveyErr } = await supabase
    .from('condition_surveys')
    .upsert(surveyRow)
    .select('facility_number')
    .maybeSingle();
  if (surveyErr) throw surveyErr;

  const items = survey.items || [];

  // Upload any photo not yet in storage, before rows reference it.
  const photoRows = [];
  const failedPhotoIds = [];
  for (const item of items) {
    for (const photo of item.photos || []) {
      if (!photo.dataUrl && !photo.storagePath) continue;

      // Already in storage and we never loaded the bytes: keep the row pointing
      // at the existing object rather than re-uploading nothing.
      if (!photo.dataUrl && photo.storagePath) {
        photoRows.push({
          id: photo.id,
          survey_id: survey.id,
          item_id: item.id,
          caption: photo.caption || null,
          name: photo.name || null,
          storage_path: photo.storagePath,
          taken_at: photo.timestamp || null
        });
        continue;
      }

      let storagePath;
      try {
        storagePath = await uploadPhoto(survey.id, item.id, photo);
      } catch (err) {
        // Skip this image rather than losing the whole survey's sync. It stays
        // on the device and is retried on the next push -- never discarded.
        console.warn('Photo upload deferred, will retry:', photo.id, err.message);
        failedPhotoIds.push(photo.id);
        continue;
      }

      photoRows.push({
        id: photo.id,
        survey_id: survey.id,
        item_id: item.id,
        caption: photo.caption || null,
        name: photo.name || null,
        storage_path: storagePath,
        taken_at: photo.timestamp || null
      });
    }
  }

  // Deleting every row and re-inserting was the single most destructive thing
  // in this file. Any device pushing a partial copy wiped whatever the server
  // held -- and because survey_photos cascades off survey_items, it silently
  // destroyed photos taken on another device too, leaving orphaned files in
  // storage. Upsert what we have and delete ONLY what the user actually
  // removed, tracked as explicit tombstones.
  const deletedItemIds = Array.isArray(survey.deletedItemIds) ? survey.deletedItemIds : [];
  const deletedPhotoIds = Array.isArray(survey.deletedPhotoIds) ? survey.deletedPhotoIds : [];

  if (deletedPhotoIds.length) {
    const { error } = await supabase.from('survey_photos').delete().in('id', deletedPhotoIds);
    if (error) throw error;
  }
  if (deletedItemIds.length) {
    const { error } = await supabase.from('survey_items').delete().in('id', deletedItemIds);
    if (error) throw error;
  }

  if (items.length) {
    const rows = items.map((item, position) => ({
      id: item.id,
      survey_id: survey.id,
      position,
      asset_name: item.assetName || null,
      department: item.department || null,
      location: item.location || null,
      priority: item.priority == null ? 2 : item.priority,
      defect_description: item.defectDescription || null,
      estimated_cost: parseFloat(item.estimatedCost) || 0,
      quantity: parseFloat(item.quantity) || 1,
      unit: item.unit || null,
      updated_at: new Date().toISOString(),
      ...(item.customValues && typeof item.customValues === 'object'
        ? { custom_values: item.customValues }
        : {})
    }));

    // Two batches on purpose. A batch upsert writes every column any row in it
    // names, so one snag carrying custom values would reset them to empty on
    // every other snag in the batch that does not. Snags with no customValues
    // at all (made before custom fields existed, or by an older app version)
    // are sent without the column, which leaves whatever the server holds.
    const withCustom = rows.filter((r) => 'custom_values' in r);
    const withoutCustom = rows.filter((r) => !('custom_values' in r));
    for (const batch of [withCustom, withoutCustom]) {
      if (!batch.length) continue;
      const { error: itemErr } = await supabase.from('survey_items').upsert(batch);
      if (itemErr) throw itemErr;
    }
  }

  if (photoRows.length) {
    // Upsert by id: re-sending a photo that is already there is a no-op rather
    // than a duplicate-key failure, which is what makes a retry safe.
    const { error: photoErr } = await supabase.from('survey_photos').upsert(photoRows);
    if (photoErr) throw photoErr;
  }

  return {
    pushed: true,
    items: items.length,
    photos: photoRows.length,
    // Ids the server has confirmed, so the caller can mark exactly those
    // photos synced rather than assuming the whole batch succeeded.
    syncedPhotoIds: photoRows.map((r) => r.id),
    failedPhotoIds: failedPhotoIds,
    // What the database actually assigned. While offline the facility carries a
    // provisional number worked out on the device; this is the authoritative
    // one and the caller adopts it once the facility has reached the server.
    facilityNumber: savedSurvey?.facility_number ?? null,
    // We are now the server state, so this is what the next push builds on.
    cloudRevision: nextRevision
  };
}

/* -------------------------------------------------------------------- pull */

/**
 * Pulls a survey back into the shape the app already uses.
 * `knownPhotos` maps photo id to dataUrl, so images already held locally are
 * not downloaded again on every sync.
 */
/**
 * Whether the server holds this facility, with one tiny query.
 *
 * Lets a caller with nothing on the device find out quickly that the server is
 * unreachable, without capping the full download -- which, for a facility with
 * many photos on a slow link, can legitimately take a while.
 */
export async function surveyExistsOnServer(surveyId) {
  if (!isCloudConfigured) return false;
  const { data, error } = await supabase
    .from('condition_surveys')
    .select('id')
    .eq('id', surveyId)
    .limit(1);
  if (error) throw error;
  return !!(data && data.length);
}

export async function pullSurvey(surveyId, knownPhotos = {}) {
  if (!isCloudConfigured) return null;

  const { data: rows, error } = await supabase
    .from('condition_surveys')
    .select('*')
    .eq('id', surveyId)
    .limit(1);
  if (error) throw error;
  if (!rows || !rows.length) return null;
  const row = rows[0];

  const itemResult = await supabase
    .from('survey_items')
    .select('*')
    .eq('survey_id', surveyId)
    .order('position');
  if (itemResult.error) throw itemResult.error;

  const photoResult = await supabase
    .from('survey_photos')
    .select('*')
    .eq('survey_id', surveyId);
  if (photoResult.error) throw photoResult.error;

  // Photos the device already holds are reused; the rest download in parallel.
  // One after another, a facility with forty photos took long enough to open
  // on a phone that it looked stuck.
  const photoRows = photoResult.data || [];
  const withBytes = await mapWithConcurrency(photoRows, PHOTO_FETCH_CONCURRENCY, async (p) => {
    if (knownPhotos[p.id]) return knownPhotos[p.id];
    try {
      return await downloadPhoto(p.storage_path);
    } catch (err) {
      // Keep the photo record even though the bytes did not arrive. Dropping
      // it here used to delete the photo from the server on this client's
      // next push, because that push replaced the item list wholesale -- one
      // flaky download permanently destroyed the picture. Retaining the row
      // with its storagePath means it can be fetched again later.
      console.warn('Photo bytes unavailable, keeping reference:', p.storage_path, err?.message);
      return null;
    }
  });

  const photosByItem = {};
  for (let idx = 0; idx < photoRows.length; idx++) {
    const p = photoRows[idx];
    const dataUrl = withBytes[idx];
    if (!photosByItem[p.item_id]) photosByItem[p.item_id] = [];
    photosByItem[p.item_id].push({
      id: p.id,
      dataUrl,
      storagePath: p.storage_path,
      caption: p.caption || '',
      name: p.name || '',
      timestamp: p.taken_at || null
    });
  }

  return {
    id: row.id,
    projectId: row.project_id || null,
    title: row.title || 'Facility Condition Assessment',
    facility: row.facility || {},
    signatures: row.signatures || {},
    generalNotes: row.general_notes || '',
    status: row.status || 'draft',
    submittedAt: row.submitted_at || null,
    revision: row.revision || 1,
    // The server revision this copy is built on. pushSurvey refuses to
    // overwrite a server state the client has not actually seen.
    cloudRevision: row.revision || 0,
    updatedAt: row.updated_at,
    items: (itemResult.data || []).map((it) => ({
      id: it.id,
      assetName: it.asset_name || '',
      department: it.department || 'GENERAL',
      location: it.location || '',
      priority: it.priority == null ? 2 : it.priority,
      defectDescription: it.defect_description || '',
      estimatedCost: Number(it.estimated_cost) || 0,
      quantity: Number(it.quantity) || 1,
      unit: it.unit || 'Unit',
      customValues: it.custom_values && typeof it.custom_values === 'object' ? it.custom_values : {},
      photos: photosByItem[it.id] || []
    }))
  };
}

/**
 * Every survey on the server, newest first - the facility list. Cheap: reads
 * only the summary columns, never the photo payloads.
 */
const SURVEY_LIST_CACHE_KEY = 'fm_survey_list_cache';

/**
 * The facility list as last downloaded, for showing with no connection.
 * Summaries only -- no snags or photos -- so it stays small.
 */
export function cachedSurveyList() {
  try {
    const raw = localStorage.getItem(SURVEY_LIST_CACHE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Throws when the list cannot be fetched. It used to return an empty list,
 * which made "no connection" indistinguishable from "no facilities" and left
 * the caller nothing to fall back on.
 */
export async function listSurveys() {
  if (!isCloudConfigured) return [];
  const { data, error } = await supabase
    .from('condition_surveys')
    .select('id, title, facility, facility_name, status, submitted_at, updated_at, created_at, revision, project_id')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const surveys = data || [];
  const ids = surveys.map((r) => r.id);

  // Snag counts tell two unnamed facilities apart in the list; photo counts
  // say how much evidence each one carries. Both are fetched together.
  const [itemCounts, photoCounts] = await Promise.all([
    countRowsBySurvey('survey_items', ids),
    countRowsBySurvey('survey_photos', ids)
  ]);

  const list = surveys.map((r) => ({
    id: r.id,
    title: r.title,
    projectId: r.project_id || null,
    facility: r.facility || {},
    facilityName: r.facility_name || (r.facility && r.facility.facilityName) || '',
    itemCount: itemCounts[r.id] || 0,
    photoCount: photoCounts[r.id] || 0,
    status: r.status || 'draft',
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
    createdAt: r.created_at
  }));

  try {
    localStorage.setItem(SURVEY_LIST_CACHE_KEY, JSON.stringify(list));
  } catch { /* storage full or unavailable; the live list still works */ }
  return list;
}

/**
 * How many rows each survey owns in `table`, as { surveyId: count }.
 *
 * Paged deliberately. PostgREST caps how many rows one request may return, and
 * this counts a row per snag or per photo across every facility -- a few
 * hundred facilities' photos would quietly exceed that cap and every count
 * after the cut-off would read low, with nothing to indicate the total was
 * wrong.
 */
async function countRowsBySurvey(table, surveyIds) {
  const counts = {};
  if (!surveyIds.length) return counts;

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('survey_id')
      .in('survey_id', surveyIds)
      .range(from, from + PAGE - 1);

    if (error) {
      console.warn(`Could not count ${table}:`, error.message);
      return counts;
    }
    for (const row of data || []) {
      counts[row.survey_id] = (counts[row.survey_id] || 0) + 1;
    }
    if (!data || data.length < PAGE) return counts;
  }
}

/**
 * Every snag across the given facilities, each with its photos attached.
 *
 * Deliberately metadata only -- no image bytes. The gallery fetches those one
 * tile at a time as they scroll into view; pulling all of them up front would
 * be ~94MB for a project this size and would stall a phone on site.
 *
 * Returns { photos, snagsWithoutPhotos } because the second is the point: with
 * hundreds of snags there is otherwise no way to notice that a P1 defect is
 * going into a client report carrying no evidence at all.
 */
export async function listProjectEvidence(surveyIds = []) {
  const empty = { photos: [], snagsWithoutPhotos: [] };
  if (!isCloudConfigured || !surveyIds.length) return empty;

  const [items, photoRows] = await Promise.all([
    fetchAllPages('survey_items', 'id, survey_id, location, defect_description, priority, department, asset_name, position', surveyIds),
    fetchAllPages('survey_photos', 'id, survey_id, item_id, storage_path, caption, name, taken_at', surveyIds)
  ]);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const photoCountByItem = new Map();
  for (const p of photoRows) {
    photoCountByItem.set(p.item_id, (photoCountByItem.get(p.item_id) || 0) + 1);
  }

  const photos = photoRows
    .filter((p) => p.storage_path)
    .map((p) => {
      const item = itemById.get(p.item_id) || {};
      return {
        id: p.id,
        surveyId: p.survey_id,
        itemId: p.item_id,
        storagePath: p.storage_path,
        takenAt: p.taken_at,
        location: item.location || '',
        description: item.defect_description || '',
        priority: item.priority || null,
        department: item.department || 'GENERAL'
      };
    });

  const snagsWithoutPhotos = items
    .filter((i) => !photoCountByItem.get(i.id))
    .map((i) => ({
      id: i.id,
      surveyId: i.survey_id,
      location: i.location || '',
      description: i.defect_description || '',
      priority: i.priority || null,
      department: i.department || 'GENERAL'
    }));

  return { photos, snagsWithoutPhotos };
}

/** Pages through one table for a set of surveys, same reason as the counts do. */
export async function fetchAllPages(table, columns, surveyIds) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in('survey_id', surveyIds)
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn(`Could not read ${table}:`, error.message);
      return out;
    }
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * Permanently deletes a survey and everything under it (snags, photos).
 *
 * Every row is archived by the database's own trigger before it goes
 * (DATA_SAFETY.md), and photo files are never removed from Storage, so this
 * is recoverable server-side even though the app gives no undo. Rows are
 * deleted in batches of 5 -- the database refuses a single statement that
 * removes more than that from survey_items/survey_photos, on purpose, after
 * a wholesale delete destroyed real data twice in this project's history.
 */
export async function deleteSurveyPermanently(surveyId) {
  if (!isCloudConfigured) return { deleted: false };

  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const { data: photoRows, error: photoListErr } = await supabase
    .from('survey_photos')
    .select('id')
    .eq('survey_id', surveyId);
  if (photoListErr) throw photoListErr;

  const { data: itemRows, error: itemListErr } = await supabase
    .from('survey_items')
    .select('id')
    .eq('survey_id', surveyId);
  if (itemListErr) throw itemListErr;

  for (const group of chunk((photoRows || []).map((r) => r.id), 5)) {
    const { error } = await supabase.from('survey_photos').delete().in('id', group);
    if (error) throw error;
  }
  for (const group of chunk((itemRows || []).map((r) => r.id), 5)) {
    const { error } = await supabase.from('survey_items').delete().in('id', group);
    if (error) throw error;
  }

  const { error: surveyErr } = await supabase.from('condition_surveys').delete().eq('id', surveyId);
  if (surveyErr) throw surveyErr;

  return {
    deleted: true,
    itemsDeleted: (itemRows || []).length,
    photosDeleted: (photoRows || []).length
  };
}

/** Latest survey id on the server, so a fresh device knows what to open. */
export async function fetchLatestSurveyId() {
  if (!isCloudConfigured) return null;
  const { data, error } = await supabase
    .from('condition_surveys')
    .select('id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return null;
  return data[0].id;
}

/** Collects every photo already held locally, keyed by id, to avoid re-downloads. */
export function collectKnownPhotos(survey) {
  const map = {};
  for (const item of (survey && survey.items) || []) {
    for (const photo of item.photos || []) {
      if (photo.id && photo.dataUrl) map[photo.id] = photo.dataUrl;
    }
  }
  return map;
}

/* ---------------------------------------------------------------- realtime */

/**
 * Fires whenever any device changes this survey, so other devices refresh.
 * Returns an unsubscribe function.
 */
export function subscribeToCloudChanges(surveyId, onRemoteChange) {
  if (!isCloudConfigured || !surveyId) return () => {};

  const channel = supabase
    .channel(`survey-${surveyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'condition_surveys', filter: `id=eq.${surveyId}` },
      onRemoteChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'survey_items', filter: `survey_id=eq.${surveyId}` },
      onRemoteChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'survey_photos', filter: `survey_id=eq.${surveyId}` },
      onRemoteChange
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * Fills in photo bytes that are not held locally.
 *
 * A survey pulled from the server (or opened from the facility list) carries
 * each photo's storagePath but may have no dataUrl, either because the download
 * failed once or because it was never needed. The PDF and Excel generators draw
 * from dataUrl, so without this a report from a synced facility came out with
 * no pictures at all - which is exactly the "Excel has no photo" symptom.
 *
 * Returns a copy; the original is untouched. Failures leave that one photo
 * without bytes rather than aborting the whole report.
 */
/**
 * Runs `task` over every entry with at most `limit` in flight at once.
 *
 * Results come back in input order. The limit matters: a report covering every
 * facility can involve hundreds of photos, and firing them all at once buries
 * the browser's connection pool and risks the server rate-limiting the lot,
 * while doing them one at a time is what made a 67-facility report take
 * minutes.
 */
export async function mapWithConcurrency(entries, limit, task) {
  const list = [...entries];
  const results = new Array(list.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= list.length) return;
      results[i] = await task(list[i], i);
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, worker)
  );
  return results;
}

/**
 * Rejects if `promise` has not settled within `ms`.
 *
 * For anything a surveyor is actively waiting on. With weak signal the phone
 * still reports being online while a single request takes around 16 seconds to
 * fail, so opening a facility or signing out appeared frozen. The original
 * promise keeps running; only the wait is abandoned.
 */
export function withTimeout(promise, ms, label = 'Request') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${Math.round(ms / 1000)}s`);
      err.timeout = true;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function hydratePhotos(survey) {
  if (!isCloudConfigured || !survey) return survey;

  const needsBytes = (survey.items || []).some((it) =>
    (it.photos || []).some((p) => !p.dataUrl && p.storagePath)
  );
  if (!needsBytes) return survey;

  // Flattened first so every missing photo in the whole survey downloads in
  // the same pool. Nesting the loops meant a snag with one slow photo held up
  // every snag after it.
  const wanted = [];
  (survey.items || []).forEach((item, itemIdx) => {
    (item.photos || []).forEach((photo, photoIdx) => {
      if (!photo.dataUrl && photo.storagePath) wanted.push({ itemIdx, photoIdx, photo });
    });
  });

  let fetched = 0;
  let failed = 0;
  const bytesByKey = new Map();

  await mapWithConcurrency(wanted, PHOTO_FETCH_CONCURRENCY, async ({ itemIdx, photoIdx, photo }) => {
    try {
      const dataUrl = await downloadPhoto(photo.storagePath);
      bytesByKey.set(`${itemIdx}:${photoIdx}`, dataUrl);
      fetched++;
    } catch (err) {
      console.warn('[report] photo unavailable:', photo.storagePath, err?.message);
      failed++;
    }
  });

  const items = (survey.items || []).map((item, itemIdx) => ({
    ...item,
    photos: (item.photos || []).map((photo, photoIdx) => {
      const dataUrl = bytesByKey.get(`${itemIdx}:${photoIdx}`);
      return dataUrl ? { ...photo, dataUrl } : photo;
    })
  }));

  console.info(`[report] fetched ${fetched} photo(s) for the report` + (failed ? `, ${failed} unavailable` : ''));
  return { ...survey, items };
}
