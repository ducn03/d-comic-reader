/**
 * LRU In-Memory Cache with TTL & In-Flight Request Deduplication.
 */

class LruTtlCache {
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
    this.store = new Map();
    this.inFlight = new Map();
  }

  get(key, ttlSec = 180) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() - entry.time > ttlSec * 1000) {
      this.store.delete(key);
      return null;
    }

    // Refresh recency for LRU
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.data;
  }

  set(key, data) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(key, { time: Date.now(), data });
  }

  /**
   * Returns cached data if fresh, shares an existing in-flight request if active,
   * or invokes fetcherFn and caches non-empty results.
   */
  async getOrFetch(key, ttlSec, fetcherFn, shouldCache = null) {
    const cached = this.get(key, ttlSec);
    if (cached !== null) {
      return cached;
    }

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const promise = (async () => {
      try {
        const data = await fetcherFn();
        const canCache = shouldCache ? shouldCache(data) : Boolean(data);
        if (canCache) {
          this.set(key, data);
        }
        return data;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }
}

module.exports = new LruTtlCache(500);
module.exports.LruTtlCache = LruTtlCache;
