/**
 * Frontend API Client:
 * - In-memory LRU Cache (zero synchronous sessionStorage blocking)
 * - In-flight Request Deduplication
 * - AbortSignal-aware fetch
 * - Gentle single-slot intent prefetch
 */
import { getApiBase } from './utils.js?v=4.0';

const MAX_CACHE_ENTRIES = 80;
const memoryCache = new Map();
const inFlight = new Map();

function getCached(key, ttlMs) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > ttlMs) {
    memoryCache.delete(key);
    return null;
  }
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  return entry.data;
}

function setCached(key, data) {
  if (memoryCache.has(key)) {
    memoryCache.delete(key);
  } else if (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { time: Date.now(), data });
}

export function hasCachedApi(endpoint, params = {}, ttlMs = 180000) {
  const url = buildApiUrl(endpoint, params);
  return getCached(url, ttlMs) !== null;
}

export function buildApiUrl(endpoint, params = {}) {
  const search = new URLSearchParams({ endpoint });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      search.set(k, String(v));
    }
  }
  return `${getApiBase()}?${search.toString()}`;
}

export async function fetchApi(endpoint, params = {}, options = {}) {
  const { ttlMs = 180000, signal = null, force = false } = options;
  const url = buildApiUrl(endpoint, params);

  if (!force) {
    const cached = getCached(url, ttlMs);
    if (cached !== null) return cached;
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Coalesce identical concurrent requests without tying shared fetch to a single caller's signal
  let sharedPromise = inFlight.get(url);
  if (!sharedPromise) {
    sharedPromise = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          let errMsg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.error) errMsg = body.error;
          } catch {}
          throw new Error(errMsg);
        }
        const data = await res.json();
        setCached(url, data);
        return data;
      } finally {
        inFlight.delete(url);
      }
    })();
    inFlight.set(url, sharedPromise);
  }

  if (!signal) {
    return sharedPromise;
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });

    sharedPromise.then(
      (data) => {
        signal.removeEventListener('abort', onAbort);
        resolve(data);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

let activePrefetch = false;
export function prefetchDetail(slug) {
  if (!slug || activePrefetch) return;
  if (navigator.connection?.saveData) return;
  if (hasCachedApi('detail', { slug }, 300000)) return;

  activePrefetch = true;
  fetchApi('detail', { slug }, { ttlMs: 300000 })
    .catch(() => {})
    .finally(() => {
      activePrefetch = false;
    });
}
