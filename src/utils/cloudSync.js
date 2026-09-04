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
async function downloadPhoto(storagePath) {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(storagePath);
  if (error) throw error;
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
  // server holds. Refuse when the server is ahead of what this client last
  // saw, and let the caller pull instead. (Observed for real: a tab that had
  // only part of a survey in memory overwrote the full copy, losing items.)
  const { data: current, error: readErr } = await supabase
    .from('condition_surveys')
    .select('revision')
    .eq('id', survey.id)
    .limit(1);
  if (readErr) throw readErr;

  const serverRevision = current && current.length ? current[0].revision || 0 : 0;
  const localRevision = survey.revision || 0;

  if (serverRevision > localRevision) {
    return { conflict: true, serverRevision, localRevision };
  }

  const { error: surveyErr } = await supabase.from('condition_surveys').upsert({
    id: survey.id,
    title: survey.title || null,
    facility: survey.facility || {},
    signatures: survey.signatures || {},
    general_notes: survey.generalNotes || null,
    revision: survey.revision || 1,
    updated_at: new Date().toISOString()
  });
  if (surveyErr) throw surveyErr;

  const items = survey.items || [];

  // Upload any photo not yet in storage, before rows reference it.
  const photoRows = [];
  for (const item of items) {
    for (const photo of item.photos || []) {
      if (!photo.dataUrl && !photo.storagePath) continue;

      let storagePath;
      try {
        storagePath = await uploadPhoto(survey.id, item.id, photo);
      } catch (err) {
        // Skip this image rather than losing the whole survey's sync.
        console.warn('Skipping photo that could not be uploaded:', photo.id, err.message);
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

  // Replace items (cascade clears their photo rows), then re-insert.
  const { error: delErr } = await supabase.from('survey_items').delete().eq('survey_id', survey.id);
  if (delErr) throw delErr;

  if (items.length) {
    const { error: itemErr } = await supabase.from('survey_items').insert(
      items.map((item, position) => ({
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
        updated_at: new Date().toISOString()
      }))
    );
    if (itemErr) throw itemErr;
  }

  if (photoRows.length) {
    const { error: photoErr } = await supabase.from('survey_photos').insert(photoRows);
    if (photoErr) throw photoErr;
  }

  return { pushed: true, items: items.length, photos: photoRows.length };
}

/* -------------------------------------------------------------------- pull */

/**
 * Pulls a survey back into the shape the app already uses.
 * `knownPhotos` maps photo id to dataUrl, so images already held locally are
 * not downloaded again on every sync.
 */
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

  const photosByItem = {};
  for (const p of photoResult.data || []) {
    let dataUrl = knownPhotos[p.id];
    if (!dataUrl) {
      try {
        dataUrl = await downloadPhoto(p.storage_path);
      } catch (err) {
        console.warn('Could not download photo', p.storage_path, err);
        continue;
      }
    }
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
    title: row.title || 'Facility Condition Assessment',
    facility: row.facility || {},
    signatures: row.signatures || {},
    generalNotes: row.general_notes || '',
    revision: row.revision || 1,
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
      photos: photosByItem[it.id] || []
    }))
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
