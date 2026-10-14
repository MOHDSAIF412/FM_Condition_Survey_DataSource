// Session cache is bounded and separated by account. Failed loads remain retryable.
export function createPhotoCache({ maxBytes = 32 * 1024 * 1024, concurrency = 6 } = {}) {
  const values = new Map(), pending = new Map(), queue = [];
  let bytes = 0, active = 0;
  function pump() {
    while (active < concurrency && queue.length) {
      const task = queue.shift(); active++;
      Promise.resolve().then(task.load).then(task.resolve, task.reject).finally(() => { active--; pump(); });
    }
  }
  function get(key, load) {
    if (values.has(key)) { const value = values.get(key); values.delete(key); values.set(key, value); return Promise.resolve(value); }
    if (pending.has(key)) return pending.get(key);
    const result = new Promise((resolve, reject) => { queue.push({ load, resolve, reject }); pump(); }).then(value => {
      const size = value.length * 2;
      if (size <= maxBytes) {
        while (bytes + size > maxBytes && values.size) {
          const oldest = values.keys().next().value; bytes -= values.get(oldest).length * 2; values.delete(oldest);
        }
        values.set(key, value); bytes += size;
      }
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, result); return result;
  }
  return { get };
}
export const photoCache = createPhotoCache();
