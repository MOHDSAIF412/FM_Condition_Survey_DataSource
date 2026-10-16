/**
 * AI descriptions for the Excel report's "AI Description" column.
 *
 * Each snag's notes and first photos go to api/describe.js (which holds the
 * model key), a few snags per request. The answer is cached on this device per
 * snag, keyed by what was sent, so building the same report again is instant,
 * gives the same wording, and spends no free quota. Editing the notes or the
 * photos changes the key, so the description is written afresh.
 *
 * This must never stop a report: offline, signed out, not configured, the free
 * limit used up, or any error -- the column is simply left blank for the
 * snags that did not get a description. The surveyor's own text is untouched.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase } from './supabaseClient';
import { dataUrlToBlob } from './dataUrl';
import { DEPARTMENTS } from '../types/survey.js';

const ENDPOINT_ORIGIN = 'https://fm-condition-survey-data-source.vercel.app';
const CACHE_PREFIX = 'fm_ai_desc_v1:';
export const BATCH_SIZE = 4;
const PHOTOS_PER_SNAG = 2;
const PHOTO_MAX_EDGE = 768;
const REQUEST_TIMEOUT_MS = 45000;

// FNV-1a: a short, stable fingerprint of what the description was written from.
function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const usablePhotos = (item) => (item.photos || []).filter((p) => p && p.dataUrl).slice(0, PHOTOS_PER_SNAG);

export function cacheKey(item) {
  const basis = JSON.stringify([
    item.assetName || '', item.location || '', item.department || '', item.defectDescription || '',
    usablePhotos(item).map((p) => p.id || p.name || p.dataUrl.length)
  ]);
  return `${CACHE_PREFIX}${item.id}:${fingerprint(basis)}`;
}

const browserStore = {
  get(key) { try { return globalThis.localStorage?.getItem(key) || null; } catch { return null; } },
  set(key, value) { try { globalThis.localStorage?.setItem(key, value); } catch { /* full or blocked: just not cached */ } }
};

/** Shrinks a photo so a batch stays small. Not fetch(): the CSP refuses data: URLs. */
async function shrinkPhoto(dataUrl) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('photo could not be decoded'));
      el.src = url;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function snagPayload(item) {
  const photos = [];
  for (const p of usablePhotos(item)) {
    const small = await shrinkPhoto(p.dataUrl);
    if (small) photos.push(small);
  }
  return {
    id: String(item.id),
    name: item.assetName || '',
    location: item.location || '',
    trade: (DEPARTMENTS[item.department] || {}).name || item.department || '',
    notes: item.defectDescription || '',
    photos
  };
}

/** Sends one batch to api/describe. Resolves to { status, data }. */
async function defaultTransport(body, signal) {
  const { data } = (await supabase?.auth?.getSession?.()) || {};
  const token = data?.session?.access_token;
  if (!token) return { status: 401, data: null };
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  if (Capacitor.isNativePlatform()) {
    // CapacitorHttp avoids WebView CORS, the same route the update check uses.
    const r = await CapacitorHttp.post({
      url: `${ENDPOINT_ORIGIN}/api/describe`, headers, data: body, responseType: 'json',
      connectTimeout: 15000, readTimeout: REQUEST_TIMEOUT_MS
    });
    return { status: r.status, data: r.data };
  }
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const stop = () => timeout.abort();
  signal?.addEventListener?.('abort', stop);
  try {
    const r = await fetch('/api/describe', { method: 'POST', headers, body: JSON.stringify(body), signal: timeout.signal });
    return { status: r.status, data: await r.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', stop);
  }
}

/**
 * Resolves to a Map of snag id -> AI description. Snags without one are
 * absent from the map. Never throws.
 */
export async function describeSnags(items, { signal, transport = defaultTransport, store = browserStore, online } = {}) {
  const result = new Map();
  const todo = [];
  for (const item of items || []) {
    if (!item || item.id == null) continue;
    const hit = store.get(cacheKey(item));
    if (hit) result.set(String(item.id), hit);
    else todo.push(item);
  }
  const isOnline = online ?? (typeof navigator === 'undefined' || navigator.onLine !== false);
  if (!todo.length || !isOnline) return result;

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = todo.slice(i, i + BATCH_SIZE);
    let reply;
    try {
      const snags = [];
      for (const item of batch) snags.push(await snagPayload(item));
      reply = await transport({ snags }, signal);
    } catch (err) {
      console.warn('[ai descriptions] request failed, leaving the rest blank:', err?.message || err);
      break;
    }
    // Signed out, not configured, or the free limit is used up: further
    // requests would fail the same way, so stop instead of waiting on each.
    if (!reply || reply.status !== 200) {
      console.warn('[ai descriptions] not available:', reply?.status, reply?.data?.error);
      break;
    }
    const got = reply.data?.descriptions || {};
    for (const item of batch) {
      const text = typeof got[item.id] === 'string' ? got[item.id].trim() : '';
      if (!text) continue;
      result.set(String(item.id), text);
      store.set(cacheKey(item), text);
    }
  }
  return result;
}
