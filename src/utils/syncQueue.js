/**
 * Durable sync queue.
 *
 * Everything done offline is appended here as a job and kept in IndexedDB, so
 * it survives the app being closed, the phone restarting, or Android killing
 * the process while the camera is open. A job is only ever removed once the
 * server has confirmed it - a failed upload stays queued and is retried.
 *
 * Jobs are keyed by a caller-supplied id (the inspection's or photo's own
 * UUID), so re-queuing the same work replaces the pending job rather than
 * stacking duplicates. That, plus the server upserting on the same id, is what
 * makes a retry after a dropped connection idempotent.
 */

const DB_NAME = 'FM_Condition_Survey_DB';
const DB_VERSION = 2;
const STORE_QUEUE = 'sync_queue';
const STORE_SURVEYS = 'surveys';
const STORE_SETTINGS = 'settings';

export const JOB_STATUS = {
  PENDING: 'pending',
  IN_FLIGHT: 'in_flight',
  FAILED: 'failed',
  DONE: 'done'
};

/** Backoff so a server that is down is not hammered. Capped, not unbounded. */
const RETRY_DELAYS_MS = [0, 5_000, 15_000, 60_000, 300_000, 900_000];

export function retryDelayFor(attempts) {
  return RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_SURVEYS)) {
        db.createObjectStore(STORE_SURVEYS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const store = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('nextAttemptAt', 'nextAttemptAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode) {
  return db.transaction(STORE_QUEUE, mode).objectStore(STORE_QUEUE);
}

/**
 * Adds or refreshes a job. Same id => replaced, never duplicated.
 * @param {{id: string, type: string, payload?: object}} job
 */
export async function enqueue(job) {
  const db = await openDB();
  const store = tx(db, 'readwrite');
  const existing = await new Promise((res) => {
    const r = store.get(job.id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });

  const record = {
    id: job.id,
    type: job.type,
    payload: job.payload || {},
    status: JOB_STATUS.PENDING,
    attempts: existing ? existing.attempts || 0 : 0,
    lastError: existing ? existing.lastError || null : null,
    nextAttemptAt: Date.now(),
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const w = tx(db, 'readwrite').put(record);
    w.onsuccess = () => resolve(record);
    w.onerror = () => reject(w.error);
  });
}

export async function listJobs() {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const r = tx(db, 'readonly').getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** Jobs that are due now: pending or failed and past their backoff window. */
export async function dueJobs() {
  const now = Date.now();
  const all = await listJobs();
  return all
    .filter((j) => j.status !== JOB_STATUS.DONE)
    .filter((j) => (j.nextAttemptAt || 0) <= now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function markInFlight(id) {
  return updateJob(id, { status: JOB_STATUS.IN_FLIGHT, updatedAt: Date.now() });
}

/** Only a confirmed success removes the job. */
export async function markDone(id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const r = tx(db, 'readwrite').delete(id);
    r.onsuccess = () => resolve(true);
    r.onerror = () => resolve(false);
  });
}

export async function markFailed(id, error) {
  const all = await listJobs();
  const job = all.find((j) => j.id === id);
  const attempts = (job ? job.attempts || 0 : 0) + 1;
  return updateJob(id, {
    status: JOB_STATUS.FAILED,
    attempts,
    lastError: String((error && error.message) || error || 'unknown'),
    nextAttemptAt: Date.now() + retryDelayFor(attempts),
    updatedAt: Date.now()
  });
}

async function updateJob(id, patch) {
  const db = await openDB();
  const store = tx(db, 'readwrite');
  const existing = await new Promise((res) => {
    const r = store.get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });
  if (!existing) return null;
  const next = { ...existing, ...patch };
  return new Promise((resolve) => {
    const w = tx(db, 'readwrite').put(next);
    w.onsuccess = () => resolve(next);
    w.onerror = () => resolve(null);
  });
}

/** Counts for the status indicator. */
export async function queueSummary() {
  const jobs = await listJobs();
  return {
    total: jobs.length,
    pending: jobs.filter((j) => j.status === JOB_STATUS.PENDING).length,
    failed: jobs.filter((j) => j.status === JOB_STATUS.FAILED).length,
    jobs
  };
}
