// services/cache.ts - High-performance caching with LRU eviction & request deduplication

import { CacheEntry } from '../types';

interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 500,
      defaultTTL: config.defaultTTL ?? 5 * 60 * 1000,
    };
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    this.updateAccessOrder(key);
    return entry.data;
  }

  set(key: string, data: T, ttl?: number): void {
    const actualTTL = ttl ?? this.config.defaultTTL;
    const now = Date.now();

    while (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + actualTTL,
    });

    this.updateAccessOrder(key);
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      const idx = this.accessOrder.indexOf(key);
      if (idx > -1) this.accessOrder.splice(idx, 1);
    }
    return deleted;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  private updateAccessOrder(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx > -1) this.accessOrder.splice(idx, 1);
    this.accessOrder.push(key);
  }

  private evictOldest(): void {
    if (this.accessOrder.length === 0) return;
    const oldestKey = this.accessOrder.shift()!;
    this.cache.delete(oldestKey);
  }

  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: 0,
    };
  }
}

// ============================================================
// REQUEST DEDUPLICATION - Prevents duplicate in-flight requests
// ============================================================

class RequestDeduplicator {
  private pendingRequests = new Map<string, Promise<unknown>>();
  private requestCounts = new Map<string, number>();

  async dedupe<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (this.pendingRequests.has(key)) {
      this.incrementCount(key);
      return this.pendingRequests.get(key) as Promise<T>;
    }

    const promise = fetcher()
      .then(result => {
        this.pendingRequests.delete(key);
        return result;
      })
      .catch(error => {
        this.pendingRequests.delete(key);
        throw error;
      });

    this.pendingRequests.set(key, promise);
    this.incrementCount(key);

    return promise;
  }

  private incrementCount(key: string): void {
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  getDedupeStats(): Map<string, number> {
    return new Map(this.requestCounts);
  }

  clear(): void {
    this.pendingRequests.clear();
    this.requestCounts.clear();
  }
}

// ============================================================
// GLOBAL INSTANCES
// ============================================================

export const apiCache = new LRUCache<unknown>({ maxSize: 200, defaultTTL: 5 * 60 * 1000 });
export const imageCache = new LRUCache<string>({ maxSize: 50, defaultTTL: 30 * 60 * 1000 });
export const requestDeduplicator = new RequestDeduplicator();

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export const cachedFetch = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number
): Promise<T> => {
  const cached = apiCache.get(key) as T | null;
  if (cached !== null) {
    return cached;
  }

  const data = await requestDeduplicator.dedupe(key, fetcher);
  apiCache.set(key, data, ttl);
  return data;
};

export const deduplicatedFetch = async <T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<T> => {
  return requestDeduplicator.dedupe(key, fetcher);
};

export const generateCacheKey = (prefix: string, params: Record<string, unknown>): string => {
  const sortedParams = Object.keys(params)
    .sort()
    .map(k => `${k}=${JSON.stringify(params[k])}`)
    .join('&');
  return `${prefix}:${sortedParams}`;
};

export const batchCacheGet = <T>(keys: string[]): Map<string, T | null> => {
  const results = new Map<string, T | null>();
  for (const key of keys) {
    results.set(key, apiCache.get(key) as T | null);
  }
  return results;
};

export const batchCacheSet = <T>(entries: Array<{ key: string; data: T; ttl?: number }>): void => {
  for (const { key, data, ttl } of entries) {
    apiCache.set(key, data, ttl);
  }
};

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export const startCacheCleanup = (): void => {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const apiPruned = apiCache.prune();
    const imagePruned = imageCache.prune();
    if (apiPruned > 0 || imagePruned > 0) {
      console.log(`Cache cleanup: pruned ${apiPruned} API entries, ${imagePruned} image entries`);
    }
  }, 5 * 60 * 1000);
};

export const stopCacheCleanup = (): void => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

export const getCacheStats = () => ({
  api: apiCache.getStats(),
  image: imageCache.getStats(),
  pendingRequests: requestDeduplicator.getPendingCount(),
});

export default {
  apiCache,
  imageCache,
  requestDeduplicator,
  cachedFetch,
  deduplicatedFetch,
  generateCacheKey,
  batchCacheGet,
  batchCacheSet,
  startCacheCleanup,
  stopCacheCleanup,
  getCacheStats,
};
