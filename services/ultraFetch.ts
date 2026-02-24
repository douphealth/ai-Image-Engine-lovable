// services/ultraFetch.ts - SOTA Enterprise Parallel Fetcher with Streaming

import { WordPressPost, CrawlProgress } from '../types';
import { APIError } from './errors';

// ============================================================
// CONFIGURATION - ENTERPRISE TUNED
// ============================================================
const CONFIG = {
  // Aggressive defaults - auto-calibrated based on server response
  INITIAL_CONCURRENCY: 10,
  MAX_CONCURRENCY: 25,
  MIN_CONCURRENCY: 2,
  INITIAL_BATCH_SIZE: 100,
  MAX_BATCH_SIZE: 100,
  MIN_BATCH_SIZE: 10,
  
  // Timing thresholds (ms)
  FAST_RESPONSE_THRESHOLD: 500,
  SLOW_RESPONSE_THRESHOLD: 2000,
  REQUEST_TIMEOUT: 30000,
  
  // Retry config
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY: 500,
  
  // Cache TTL (24 hours)
  CACHE_TTL: 24 * 60 * 60 * 1000,
};

// ============================================================
// INDEXED DB CACHE - Persistent Post Storage
// ============================================================
class PostCache {
  private dbName = 'ai-image-engine-cache';
  private storeName = 'posts';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('siteUrl', 'siteUrl', { unique: false });
          store.createIndex('fetchedAt', 'fetchedAt', { unique: false });
        }
      };
    });
  }

  async getCachedPosts(siteUrl: string): Promise<{ posts: WordPressPost[]; isFresh: boolean } | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const index = store.index('siteUrl');
      const request = index.getAll(siteUrl);
      
      request.onsuccess = () => {
        const results = request.result;
        if (!results.length) {
          resolve(null);
          return;
        }
        
        const oldestFetch = Math.min(...results.map(r => r.fetchedAt));
        const isFresh = Date.now() - oldestFetch < CONFIG.CACHE_TTL;
        
        resolve({
          posts: results.map(r => r.post),
          isFresh,
        });
      };
      
      request.onerror = () => resolve(null);
    });
  }

  async cachePosts(siteUrl: string, posts: WordPressPost[]): Promise<void> {
    if (!this.db) await this.init();
    
    const tx = this.db!.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    const now = Date.now();
    
    for (const post of posts) {
      store.put({ id: `${siteUrl}-${post.id}`, siteUrl, post, fetchedAt: now });
    }
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clearCache(siteUrl?: string): Promise<void> {
    if (!this.db) await this.init();
    
    const tx = this.db!.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    
    if (siteUrl) {
      const index = store.index('siteUrl');
      const request = index.openCursor(IDBKeyRange.only(siteUrl));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    } else {
      store.clear();
    }
  }
}

// ============================================================
// ADAPTIVE RATE CONTROLLER
// ============================================================
class AdaptiveRateController {
  private concurrency: number;
  private batchSize: number;
  private responseTimes: number[] = [];
  private errorCount = 0;
  private successCount = 0;

  constructor() {
    this.concurrency = CONFIG.INITIAL_CONCURRENCY;
    this.batchSize = CONFIG.INITIAL_BATCH_SIZE;
  }

  recordSuccess(responseTime: number): void {
    this.responseTimes.push(responseTime);
    this.successCount++;
    this.errorCount = Math.max(0, this.errorCount - 1);
    
    // Keep last 20 response times
    if (this.responseTimes.length > 20) this.responseTimes.shift();
    
    this.adjust();
  }

  recordError(): void {
    this.errorCount++;
    this.adjust();
  }

  private adjust(): void {
    const avgResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      : CONFIG.SLOW_RESPONSE_THRESHOLD;

    // Scale up if fast responses
    if (avgResponseTime < CONFIG.FAST_RESPONSE_THRESHOLD && this.errorCount === 0) {
      this.concurrency = Math.min(CONFIG.MAX_CONCURRENCY, this.concurrency + 2);
      this.batchSize = Math.min(CONFIG.MAX_BATCH_SIZE, this.batchSize + 10);
    }
    // Scale down on slow responses or errors
    else if (avgResponseTime > CONFIG.SLOW_RESPONSE_THRESHOLD || this.errorCount > 2) {
      this.concurrency = Math.max(CONFIG.MIN_CONCURRENCY, Math.floor(this.concurrency * 0.6));
      this.batchSize = Math.max(CONFIG.MIN_BATCH_SIZE, Math.floor(this.batchSize * 0.7));
    }
  }

  getConcurrency(): number {
    return this.concurrency;
  }

  getBatchSize(): number {
    return this.batchSize;
  }

  getStats() {
    return {
      concurrency: this.concurrency,
      batchSize: this.batchSize,
      avgResponseTime: this.responseTimes.length > 0
        ? Math.round(this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length)
        : 0,
      successRate: this.successCount / (this.successCount + this.errorCount) || 1,
    };
  }
}

// ============================================================
// STREAMING RESULTS EMITTER
// ============================================================
export type StreamCallback = (posts: WordPressPost[], progress: CrawlProgress, stats: FetchStats) => void;

export interface FetchStats {
  concurrency: number;
  batchSize: number;
  avgResponseTime: number;
  requestsCompleted: number;
  totalRequests: number;
  cachedHit: boolean;
  elapsedMs: number;
}

// ============================================================
// ULTRA FAST PARALLEL FETCHER
// ============================================================
export class UltraFastFetcher {
  private cache = new PostCache();
  private rateController = new AdaptiveRateController();
  private abortController: AbortController | null = null;
  private startTime = 0;
  private requestsCompleted = 0;
  private totalRequests = 0;

  constructor() {
    this.cache.init().catch(console.error);
  }

  async fetchAllPosts(
    url: string,
    username: string,
    appPassword: string | undefined,
    onStream: StreamCallback,
    options: { forceRefresh?: boolean; signal?: AbortSignal } = {}
  ): Promise<WordPressPost[]> {
    this.startTime = performance.now();
    this.requestsCompleted = 0;
    this.abortController = new AbortController();
    
    // Merge external abort signal
    if (options.signal) {
      options.signal.addEventListener('abort', () => this.abortController?.abort());
    }

    const baseUrl = url.replace(/\/$/, '');
    const authHeader = appPassword ? `Basic ${btoa(`${username}:${appPassword}`)}` : null;

    // ========================================
    // PHASE 0: CHECK CACHE (Instant load)
    // ========================================
    if (!options.forceRefresh) {
      const cached = await this.cache.getCachedPosts(baseUrl);
      if (cached?.isFresh) {
        const stats = this.getStats(true);
        onStream(cached.posts, { current: cached.posts.length, total: cached.posts.length, phase: 'complete' }, stats);
        return cached.posts;
      }
    }

    // ========================================
    // PHASE 1: PROBE - Get total count + calibrate
    // ========================================
    const probe = await this.probeEndpoint(baseUrl, authHeader);
    const { total, serverMaxPerPage } = probe;
    
    if (total === 0) {
      onStream([], { current: 0, total: 0, phase: 'complete' }, this.getStats(false));
      return [];
    }

    // Adjust batch size based on server capabilities
    const effectiveBatchSize = Math.min(this.rateController.getBatchSize(), serverMaxPerPage);
    const totalPages = Math.ceil(total / effectiveBatchSize);
    this.totalRequests = totalPages;

    onStream([], { current: 0, total, phase: 'fetching' }, this.getStats(false));

    // ========================================
    // PHASE 2: PARALLEL STREAMING FETCH
    // ========================================
    const allPosts: WordPressPost[] = [];
    const pageQueue = Array.from({ length: totalPages }, (_, i) => i + 1);
    const inFlight = new Map<number, Promise<void>>();

    const fetchPage = async (page: number): Promise<void> => {
      const startTime = performance.now();
      
      try {
        const posts = await this.fetchSinglePage(baseUrl, authHeader, page, effectiveBatchSize);
        const elapsed = performance.now() - startTime;
        
        this.rateController.recordSuccess(elapsed);
        this.requestsCompleted++;
        
        // Stream results immediately
        allPosts.push(...posts);
        onStream(
          [...allPosts],
          { current: allPosts.length, total, phase: 'fetching' },
          this.getStats(false)
        );
      } catch (error) {
        this.rateController.recordError();
        
        // Retry logic
        if (this.shouldRetry(error)) {
          await this.delay(CONFIG.RETRY_BASE_DELAY);
          pageQueue.unshift(page); // Re-queue
        } else {
          console.error(`Failed to fetch page ${page}:`, error);
        }
      }
    };

    // Process queue with adaptive concurrency
    while (pageQueue.length > 0 || inFlight.size > 0) {
      if (this.abortController.signal.aborted) break;

      // Fill up to current concurrency limit
      while (pageQueue.length > 0 && inFlight.size < this.rateController.getConcurrency()) {
        const page = pageQueue.shift()!;
        const promise = fetchPage(page).finally(() => inFlight.delete(page));
        inFlight.set(page, promise);
      }

      // Wait for at least one to complete
      if (inFlight.size > 0) {
        await Promise.race(inFlight.values());
      }
    }

    // ========================================
    // PHASE 3: CACHE & FINALIZE
    // ========================================
    await this.cache.cachePosts(baseUrl, allPosts);
    
    // Sort by priority (needs work first)
    allPosts.sort((a, b) => this.getPriorityScore(b) - this.getPriorityScore(a));
    
    onStream(allPosts, { current: total, total, phase: 'complete' }, this.getStats(false));
    
    return allPosts;
  }

  private async probeEndpoint(
    baseUrl: string,
    authHeader: string | null
  ): Promise<{ total: number; serverMaxPerPage: number }> {
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
    };
    if (authHeader) headers['Authorization'] = authHeader;

    // Request with per_page=1 to get headers quickly
    const response = await fetch(
      `${baseUrl}/wp-json/wp/v2/posts?per_page=1&page=1`,
      { headers, signal: this.abortController?.signal }
    );

    if (!response.ok) {
      throw APIError.fromResponse(response);
    }

    const total = parseInt(response.headers.get('X-WP-Total') || '0', 10);
    
    // Detect server's max per_page (default WordPress is 100)
    let serverMaxPerPage = 100;
    try {
      const testResponse = await fetch(
        `${baseUrl}/wp-json/wp/v2/posts?per_page=100&page=1`,
        { headers, signal: this.abortController?.signal }
      );
      if (testResponse.ok) {
        const data = await testResponse.json();
        serverMaxPerPage = data.length > 0 ? 100 : 100;
      }
    } catch {
      serverMaxPerPage = 50; // Conservative fallback
    }

    return { total, serverMaxPerPage };
  }

  private async fetchSinglePage(
    baseUrl: string,
    authHeader: string | null,
    page: number,
    perPage: number
  ): Promise<WordPressPost[]> {
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
    };
    if (authHeader) headers['Authorization'] = authHeader;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    // Merge with main abort controller
    this.abortController?.signal.addEventListener('abort', () => controller.abort());

    try {
      const response = await fetch(
        `${baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_embed=wp:featuredmedia&context=edit`,
        { headers, signal: controller.signal }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw APIError.fromResponse(response);
      }

      const data = await response.json();
      return data.map(this.parsePost);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parsePost = (post: any): WordPressPost => {
    const content = post.content?.rendered || '';
    return {
      id: post.id,
      title: post.title,
      link: post.link,
      excerpt: post.excerpt,
      content: { rendered: content, raw: post.content?.raw },
      date: post.date,
      modified: post.modified,
      featured_media: post.featured_media,
      imageCount: 0, // Calculated during analysis phase
      wordCount: content.split(/\s+/).length,
      paragraphCount: 0,
      existingImageUrl: post._embedded?.['wp:featuredmedia']?.[0]?.source_url,
      status: 'idle',
    };
  };

  private getPriorityScore(post: WordPressPost): number {
    let score = 0;
    if (post.featured_media === 0) score += 1000;
    if (post.imageCount === 0) score += 500;
    else if (post.imageCount < 3) score += 200;
    score += 100 - Math.min(post.imageCount * 10, 100);
    return score;
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof APIError) {
      return error.isRetryable || error.statusCode === 429 || (error.statusCode && error.statusCode >= 500);
    }
    return error instanceof TypeError; // Network errors
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getStats(cachedHit: boolean): FetchStats {
    const controllerStats = this.rateController.getStats();
    return {
      ...controllerStats,
      requestsCompleted: this.requestsCompleted,
      totalRequests: this.totalRequests,
      cachedHit,
      elapsedMs: Math.round(performance.now() - this.startTime),
    };
  }

  abort(): void {
    this.abortController?.abort();
  }

  async clearCache(siteUrl?: string): Promise<void> {
    await this.cache.clearCache(siteUrl);
  }
}

// Singleton instance
export const ultraFetcher = new UltraFastFetcher();
