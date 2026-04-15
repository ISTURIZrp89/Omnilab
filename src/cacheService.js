class CacheService {
  constructor() {
    this.cache = new Map();
    this.expiry = new Map();
    this.defaultTTL = 5 * 60 * 1000;
  }

  set(key, value, ttl = this.defaultTTL) {
    this.cache.set(key, value);
    this.expiry.set(key, Date.now() + ttl);
  }

  get(key) {
    const expiry = this.expiry.get(key);
    if (!expiry) return null;
    
    if (Date.now() > expiry) {
      this.delete(key);
      return null;
    }
    
    return this.cache.get(key);
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    this.cache.delete(key);
    this.expiry.delete(key);
  }

  clear() {
    this.cache.clear();
    this.expiry.clear();
  }

  cleanExpired() {
    const now = Date.now();
    for (const [key, expiry] of this.expiry) {
      if (now > expiry) {
        this.delete(key);
      }
    }
  }
}

export const cache = new CacheService();

export function cachedQuery(key, fetcher, ttl = 60000) {
  const cached = cache.get(key);
  if (cached !== null) return Promise.resolve(cached);

  return fetcher().then(data => {
    cache.set(key, data, ttl);
    return data;
  });
}

export function invalidateCache(key) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

setInterval(() => cache.cleanExpired(), 60000);

export const queryOptimizer = {
  queries: new Map(),
  
  debounce(key, fn, delay = 300) {
    const existing = this.queries.get(key);
    if (existing) {
      clearTimeout(existing.timeout);
    }

    return new Promise((resolve) => {
      this.queries.set(key, {
        timeout: setTimeout(() => {
          this.queries.delete(key);
          resolve(fn());
        }, delay),
      });
    });
  },

  cancel(key) {
    const existing = this.queries.get(key);
    if (existing) {
      clearTimeout(existing.timeout);
      this.queries.delete(key);
    }
  },

  cancelAll() {
    for (const [, query] of this.queries) {
      clearTimeout(query.timeout);
    }
    this.queries.clear();
  },
};

export default cache;