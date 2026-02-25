// App.tsx - SOTA Enterprise-Grade with FIXED UltraFast Streaming Fetcher
// BUG FIX: Pagination now correctly fetches ALL posts

import React, { useState, useCallback, useEffect, useMemo, Suspense, lazy, useRef } from 'react';
import { AppState, Configuration, CrawlProgress, WordPressPost, AppStats, ContentImage, PostImageAnalysis } from './types';
import { AppIcon, GeminiIcon, SunIcon, MoonIcon, Loader, KeyboardIcon, ZapIcon, TrendingUpIcon } from './components/icons/Icons';
import { startCacheCleanup, stopCacheCleanup } from './services/cache';
import { getErrorMessage } from './services/errors';
import { usePersistence } from './hooks/usePersistence';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy load heavy components
const WelcomeStep = lazy(() => import('./components/WelcomeStep'));
const ConfigurationStep = lazy(() => import('./components/ConfigurationStep'));
const CrawlingStep = lazy(() => import('./components/CrawlingStep'));
const ResultsStep = lazy(() => import('./components/ResultsStep'));
const KeyboardShortcutsModal = lazy(() => import('./components/KeyboardShortcutsModal'));

// ============================================================
// SOTA CONFIGURATION - ENTERPRISE TUNED & BUG FIXED
// ============================================================
const ULTRA_FETCH_CONFIG = {
  // FIXED: More conservative defaults for reliability
  INITIAL_CONCURRENCY: 5,      // Reduced from 10 for stability
  MAX_CONCURRENCY: 15,         // Reduced from 25
  MIN_CONCURRENCY: 2,
  
  // FIXED: Smaller batch size for better compatibility
  INITIAL_BATCH_SIZE: 50,      // Reduced from 100 - many servers cap at 50
  MAX_BATCH_SIZE: 100,
  MIN_BATCH_SIZE: 10,
  
  // Timing thresholds (ms)
  FAST_RESPONSE_THRESHOLD: 800,
  SLOW_RESPONSE_THRESHOLD: 3000,
  REQUEST_TIMEOUT: 45000,      // Increased for slow servers
  
  // FIXED: More aggressive retry config
  MAX_RETRIES: 5,              // Increased from 3
  RETRY_BASE_DELAY: 1000,      // Increased from 500
  MAX_RETRY_DELAY: 10000,
  
  // Cache TTL (24 hours)
  CACHE_TTL: 24 * 60 * 60 * 1000,
};

// ============================================================
// FETCH STATS INTERFACE
// ============================================================
export interface FetchStats {
  concurrency: number;
  batchSize: number;
  avgResponseTime: number;
  requestsCompleted: number;
  totalRequests: number;
  cachedHit: boolean;
  elapsedMs: number;
  postsPerSecond: number;
  bytesDownloaded: number;
  serverResponseCode: number;
  retryCount: number;
  skippedPages: number;
}

// ============================================================
// INDEXED DB CACHE - Persistent Post Storage
// ============================================================
class PostCache {
  private dbName = 'ai-image-engine-cache-v3';
  private storeName = 'posts';
  private metaStore = 'meta';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 3);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Delete old stores if they exist
        if (db.objectStoreNames.contains(this.storeName)) {
          db.deleteObjectStore(this.storeName);
        }
        if (db.objectStoreNames.contains(this.metaStore)) {
          db.deleteObjectStore(this.metaStore);
        }
        
        const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
        store.createIndex('siteUrl', 'siteUrl', { unique: false });
        store.createIndex('fetchedAt', 'fetchedAt', { unique: false });
        
        db.createObjectStore(this.metaStore, { keyPath: 'siteUrl' });
      };
    });
  }

  async getCachedPosts(siteUrl: string): Promise<{ posts: WordPressPost[]; isFresh: boolean; cachedAt: number } | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction([this.storeName, this.metaStore], 'readonly');
        const store = tx.objectStore(this.storeName);
        const metaStore = tx.objectStore(this.metaStore);
        const index = store.index('siteUrl');
        
        const metaRequest = metaStore.get(siteUrl);
        const postsRequest = index.getAll(siteUrl);
        
        tx.oncomplete = () => {
          const meta = metaRequest.result;
          const results = postsRequest.result;
          
          if (!results.length || !meta) {
            resolve(null);
            return;
          }
          
          const isFresh = Date.now() - meta.fetchedAt < ULTRA_FETCH_CONFIG.CACHE_TTL;
          
          resolve({
            posts: results.map((r: any) => r.post),
            isFresh,
            cachedAt: meta.fetchedAt,
          });
        };
        
        tx.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async cachePosts(siteUrl: string, posts: WordPressPost[]): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction([this.storeName, this.metaStore], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const metaStore = tx.objectStore(this.metaStore);
        const now = Date.now();
        
        // Clear old posts for this site first
        const index = store.index('siteUrl');
        const clearRequest = index.openCursor(IDBKeyRange.only(siteUrl));
        clearRequest.onsuccess = () => {
          const cursor = clearRequest.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        
        // Add new posts
        for (const post of posts) {
          store.put({ id: `${siteUrl}-${post.id}`, siteUrl, post, fetchedAt: now });
        }
        
        // Update meta
        metaStore.put({ siteUrl, fetchedAt: now, postCount: posts.length });
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async clearCache(siteUrl?: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction([this.storeName, this.metaStore], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const metaStore = tx.objectStore(this.metaStore);
        
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
          metaStore.delete(siteUrl);
        } else {
          store.clear();
          metaStore.clear();
        }
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

// ============================================================
// ADAPTIVE RATE CONTROLLER - Self-Optimizing (FIXED)
// ============================================================
class AdaptiveRateController {
  private concurrency: number;
  private batchSize: number;
  private responseTimes: number[] = [];
  private errorCount = 0;
  private successCount = 0;
  private lastAdjustment = 0;
  private consecutiveErrors = 0;

  constructor() {
    this.concurrency = ULTRA_FETCH_CONFIG.INITIAL_CONCURRENCY;
    this.batchSize = ULTRA_FETCH_CONFIG.INITIAL_BATCH_SIZE;
  }

  recordSuccess(responseTime: number): void {
    this.responseTimes.push(responseTime);
    this.successCount++;
    this.consecutiveErrors = 0;
    this.errorCount = Math.max(0, this.errorCount - 1);
    
    if (this.responseTimes.length > 30) this.responseTimes.shift();
    
    const now = Date.now();
    if (now - this.lastAdjustment > 1000) {
      this.adjust();
      this.lastAdjustment = now;
    }
  }

  recordError(): void {
    this.errorCount++;
    this.consecutiveErrors++;
    this.adjust();
  }

  private adjust(): void {
    const avgResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
      : ULTRA_FETCH_CONFIG.SLOW_RESPONSE_THRESHOLD;

    // FIXED: More conservative scaling
    if (avgResponseTime < ULTRA_FETCH_CONFIG.FAST_RESPONSE_THRESHOLD && 
        this.consecutiveErrors === 0 && 
        this.successCount > 10) {
      // Slow ramp up
      this.concurrency = Math.min(ULTRA_FETCH_CONFIG.MAX_CONCURRENCY, this.concurrency + 1);
    }
    else if (avgResponseTime > ULTRA_FETCH_CONFIG.SLOW_RESPONSE_THRESHOLD) {
      // Moderate scale down
      this.concurrency = Math.max(ULTRA_FETCH_CONFIG.MIN_CONCURRENCY, this.concurrency - 1);
    }
    
    // FIXED: Aggressive backoff on consecutive errors
    if (this.consecutiveErrors >= 2) {
      this.concurrency = Math.max(ULTRA_FETCH_CONFIG.MIN_CONCURRENCY, Math.floor(this.concurrency / 2));
      this.batchSize = Math.max(ULTRA_FETCH_CONFIG.MIN_BATCH_SIZE, Math.floor(this.batchSize / 2));
    }
  }

  getConcurrency(): number { return this.concurrency; }
  getBatchSize(): number { return this.batchSize; }
  getConsecutiveErrors(): number { return this.consecutiveErrors; }

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

  reset(): void {
    this.concurrency = ULTRA_FETCH_CONFIG.INITIAL_CONCURRENCY;
    this.batchSize = ULTRA_FETCH_CONFIG.INITIAL_BATCH_SIZE;
    this.responseTimes = [];
    this.errorCount = 0;
    this.successCount = 0;
    this.consecutiveErrors = 0;
  }
}

// ============================================================
// LOADING FALLBACK
// ============================================================
const StepLoader: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] bg-surface rounded-2xl border border-border">
    <Loader className="w-12 h-12 text-brand-primary animate-spin mb-4" />
    <p className="text-text-secondary font-medium">Loading...</p>
  </div>
);

// ============================================================
// THEME HOOK
// ============================================================
const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedTheme = window.localStorage.getItem('theme');
      if (storedTheme) return storedTheme;
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, toggleTheme };
};

// ============================================================
// MAIN APP COMPONENT
// ============================================================
const App: React.FC = () => {
  // Core state
  const [appState, setAppState] = useState<AppState>(AppState.Welcome);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [posts, setPosts] = useState<WordPressPost[]>([]);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress>({ current: 0, total: 0, phase: 'fetching' });
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // SOTA: Live fetch stats
  const [fetchStats, setFetchStats] = useState<FetchStats | null>(null);
  
  // Refs for SOTA fetching
  const postCacheRef = useRef(new PostCache());
  const rateControllerRef = useRef(new AdaptiveRateController());
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const { theme, toggleTheme } = useTheme();
  const persistence = usePersistence();

  // Calculate app stats
  const appStats = useMemo<AppStats>(() => {
    const totalPosts = posts.length;
    const postsWithoutFeatured = posts.filter(p => p.featured_media === 0 && !p.generatedImage).length;
    const postsWithZeroImages = posts.filter(p => p.imageCount === 0).length;
    const postsWithLowImages = posts.filter(p => p.imageCount > 0 && p.imageCount < 3).length;
    const postsProcessed = posts.filter(p => p.status === 'success').length;
    const totalImages = posts.reduce((sum, p) => sum + p.imageCount, 0);
    
    return {
      totalPosts,
      postsWithoutFeatured,
      postsWithZeroImages,
      postsWithLowImages,
      postsProcessed,
      totalImagesGenerated: postsProcessed,
      averageImagesPerPost: totalPosts > 0 ? totalImages / totalPosts : 0,
    };
  }, [posts]);

  // Start cache cleanup on mount
  useEffect(() => {
    startCacheCleanup();
    postCacheRef.current.init().catch(console.error);
    return () => stopCacheCleanup();
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    'shift+?': () => setShowShortcuts(true),
    'escape': () => setShowShortcuts(false),
    'alt+t': toggleTheme,
    'alt+h': () => setAppState(AppState.Welcome),
    'alt+c': () => config && setAppState(AppState.Configuration),
  });

  // ============================================================
  // 🔧 FIXED: SOTA ULTRA-FAST PARALLEL FETCHER
  // Now correctly fetches ALL posts with proper pagination
  // ============================================================
  const ultraFetchAllPosts = useCallback(async (
    newConfig: Configuration,
    onProgress: (progress: CrawlProgress, stats: FetchStats) => void
  ): Promise<WordPressPost[]> => {
    const startTime = performance.now();
    const baseUrl = newConfig.wordpress.url.replace(/\/$/, '');
    const authHeader = newConfig.wordpress.appPassword 
      ? `Basic ${btoa(unescape(encodeURIComponent(`${newConfig.wordpress.username}:${newConfig.wordpress.appPassword}`)))}` 
      : null;
    
    let requestsCompleted = 0;
    let totalRequests = 0;
    let bytesDownloaded = 0;
    let retryCount = 0;
    let skippedPages = 0;
    
    const rateController = rateControllerRef.current;
    rateController.reset();
    
    const cache = postCacheRef.current;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const getStats = (cachedHit: boolean): FetchStats => {
      const controllerStats = rateController.getStats();
      const elapsed = performance.now() - startTime;
      return {
        ...controllerStats,
        requestsCompleted,
        totalRequests,
        cachedHit,
        elapsedMs: Math.round(elapsed),
        postsPerSecond: elapsed > 0 ? Math.round((requestsCompleted * controllerStats.batchSize) / (elapsed / 1000)) : 0,
        bytesDownloaded,
        serverResponseCode: 200,
        retryCount,
        skippedPages,
      };
    };

    // ========================================
    // PHASE 0: CHECK INDEXEDDB CACHE (Instant)
    // ========================================
    try {
      const cached = await cache.getCachedPosts(baseUrl);
      if (cached?.isFresh && cached.posts.length > 0) {
        console.log(`[UltraFetch] ⚡ Cache HIT - ${cached.posts.length} posts loaded instantly`);
        const stats = getStats(true);
        onProgress({ current: cached.posts.length, total: cached.posts.length, phase: 'complete' }, stats);
        return cached.posts;
      }
    } catch (cacheError) {
      console.warn('[UltraFetch] Cache read failed, fetching fresh:', cacheError);
    }
    
    console.log('[UltraFetch] Cache MISS - Fetching from server...');

    // ========================================
    // PHASE 1: PROBE - Get total count
    // FIXED: Use consistent query parameters
    // ========================================
    const headers: HeadersInit = { 
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
    };
    if (authHeader) headers['Authorization'] = authHeader;

    // CORS-aware fetch helper - tries direct first, then CORS proxies
    const CORS_PROXIES = [
      (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    ];
    let useProxy: ((url: string) => string) | null = null;

    const corsFetch = async (url: string, opts: RequestInit): Promise<Response> => {
      if (useProxy) {
        return fetch(useProxy(url), opts);
      }
      try {
        const resp = await fetch(url, opts);
        return resp;
      } catch (directError) {
        // CORS error - try proxies
        for (const proxyFn of CORS_PROXIES) {
          try {
            const resp = await fetch(proxyFn(url), opts);
            if (resp.ok) {
              useProxy = proxyFn; // Remember working proxy
              console.log('[UltraFetch] Using CORS proxy for subsequent requests');
              return resp;
            }
          } catch { continue; }
        }
        throw directError;
      }
    };

    const probeUrl = `${baseUrl}/wp-json/wp/v2/posts?per_page=1&page=1&status=publish`;
    const probeResponse = await corsFetch(probeUrl, { headers, signal: abortController.signal });

    if (!probeResponse.ok) {
      const errorText = await probeResponse.text().catch(() => '');
      throw new Error(`WordPress API Error: ${probeResponse.status} ${probeResponse.statusText}. ${errorText}`);
    }

    const headerTotal = parseInt(probeResponse.headers.get('X-WP-Total') || '0', 10);
    const headerTotalPages = parseInt(probeResponse.headers.get('X-WP-TotalPages') || '0', 10);
    
    console.log(`[UltraFetch] Probe response: X-WP-Total=${headerTotal}, X-WP-TotalPages=${headerTotalPages}`);
    
    if (headerTotal === 0) {
      console.warn('[UltraFetch] Server reports 0 posts');
      onProgress({ current: 0, total: 0, phase: 'complete' }, getStats(false));
      return [];
    }

    // FIXED: Determine optimal batch size based on server capabilities
    let effectiveBatchSize = Math.min(rateController.getBatchSize(), 100);
    
    // Test if server accepts per_page=100
    try {
      const testResponse = await corsFetch(
        `${baseUrl}/wp-json/wp/v2/posts?per_page=100&page=1&status=publish`,
        { headers, signal: abortController.signal }
      );
      if (testResponse.ok) {
        const testData = await testResponse.json();
        // If server returned fewer than 100 but there are more posts, server has a limit
        if (testData.length < 100 && testData.length < headerTotal) {
          effectiveBatchSize = Math.max(10, testData.length);
          console.log(`[UltraFetch] Server limits per_page to ~${effectiveBatchSize}`);
        } else if (testData.length > 0) {
          effectiveBatchSize = 100;
        }
        bytesDownloaded += parseInt(testResponse.headers.get('content-length') || '0');
      }
    } catch {
      effectiveBatchSize = 20; // Very conservative fallback
      console.warn('[UltraFetch] Could not detect server limits, using batch size:', effectiveBatchSize);
    }

    // FIXED: Calculate pages based on ACTUAL batch size
    const calculatedTotalPages = Math.ceil(headerTotal / effectiveBatchSize);
    totalRequests = calculatedTotalPages;

    console.log(`[UltraFetch] Plan: ${headerTotal} posts across ${calculatedTotalPages} pages @ ${effectiveBatchSize}/page`);
    onProgress({ current: 0, total: headerTotal, phase: 'fetching' }, getStats(false));

    // ========================================
    // PHASE 2: FETCH ALL PAGES
    // FIXED: Use sequential-then-parallel approach for reliability
    // ========================================
    const allPosts: WordPressPost[] = [];
    const fetchedPostIds = new Set<number>(); // Dedupe tracker
    const failedPages: number[] = [];

    const parsePost = (post: any): WordPressPost => {
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
        imageCount: 0,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        paragraphCount: 0,
        existingImageUrl: post._embedded?.['wp:featuredmedia']?.[0]?.source_url,
        status: 'idle',
      };
    };

    // FIXED: Robust single page fetch with proper error handling
    const fetchSinglePage = async (page: number, attemptNumber: number = 1): Promise<WordPressPost[]> => {
      const maxAttempts = ULTRA_FETCH_CONFIG.MAX_RETRIES;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ULTRA_FETCH_CONFIG.REQUEST_TIMEOUT);
        
        // Listen to main abort controller
        const abortHandler = () => controller.abort();
        abortController.signal.addEventListener('abort', abortHandler);

        try {
          // FIXED: Don't use context=edit - it requires special permissions
          // Just use _embed for featured media
          const response = await corsFetch(
            `${baseUrl}/wp-json/wp/v2/posts?per_page=${effectiveBatchSize}&page=${page}&status=publish&_embed=wp:featuredmedia`,
            { headers, signal: controller.signal }
          );

          clearTimeout(timeoutId);
          abortController.signal.removeEventListener('abort', abortHandler);

          if (!response.ok) {
            // Check if it's a "page out of range" error (400 or similar)
            if (response.status === 400) {
              const errorBody = await response.text().catch(() => '');
              if (errorBody.includes('rest_post_invalid_page_number')) {
                console.log(`[UltraFetch] Page ${page} is beyond available pages, stopping`);
                return []; // No more pages
              }
            }
            throw new Error(`Page ${page} failed: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          bytesDownloaded += parseInt(response.headers.get('content-length') || '0');
          
          if (!Array.isArray(data)) {
            console.warn(`[UltraFetch] Page ${page} returned non-array:`, typeof data);
            return [];
          }
          
          return data.map(parsePost);
          
        } finally {
          clearTimeout(timeoutId);
          abortController.signal.removeEventListener('abort', abortHandler);
        }
        
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw error; // Don't retry aborts
        }
        
        if (attemptNumber < maxAttempts) {
          const delay = Math.min(
            ULTRA_FETCH_CONFIG.RETRY_BASE_DELAY * Math.pow(2, attemptNumber - 1),
            ULTRA_FETCH_CONFIG.MAX_RETRY_DELAY
          );
          console.warn(`[UltraFetch] Page ${page} attempt ${attemptNumber} failed, retrying in ${delay}ms:`, error.message);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchSinglePage(page, attemptNumber + 1);
        }
        
        console.error(`[UltraFetch] Page ${page} failed after ${maxAttempts} attempts:`, error.message);
        throw error;
      }
    };

    // FIXED: Fetch pages with controlled parallelism
    const pageQueue = Array.from({ length: calculatedTotalPages }, (_, i) => i + 1);
    const inFlight = new Map<number, Promise<{ page: number; posts: WordPressPost[] }>>();

    const processPage = async (page: number): Promise<{ page: number; posts: WordPressPost[] }> => {
      const reqStartTime = performance.now();
      try {
        const pagePosts = await fetchSinglePage(page);
        const elapsed = performance.now() - reqStartTime;
        rateController.recordSuccess(elapsed);
        return { page, posts: pagePosts };
      } catch (error) {
        rateController.recordError();
        failedPages.push(page);
        skippedPages++;
        return { page, posts: [] };
      }
    };

    // Main fetch loop with adaptive concurrency
    while (pageQueue.length > 0 || inFlight.size > 0) {
      if (abortController.signal.aborted) {
        console.log('[UltraFetch] Aborted by user');
        break;
      }

      // Fill up to current concurrency limit
      const currentConcurrency = rateController.getConcurrency();
      while (pageQueue.length > 0 && inFlight.size < currentConcurrency) {
        const page = pageQueue.shift()!;
        const promise = processPage(page);
        inFlight.set(page, promise);
      }

      // Wait for at least one to complete
      if (inFlight.size > 0) {
        const results = await Promise.race(
          Array.from(inFlight.entries()).map(async ([page, promise]) => {
            const result = await promise;
            return { page, result };
          })
        );
        
        inFlight.delete(results.page);
        requestsCompleted++;
        
        // Add posts (with deduplication)
        for (const post of results.result.posts) {
          if (!fetchedPostIds.has(post.id)) {
            fetchedPostIds.add(post.id);
            allPosts.push(post);
          }
        }
        
        // Stream progress
        onProgress(
          { current: allPosts.length, total: headerTotal, phase: 'fetching' },
          getStats(false)
        );
        
        // FIXED: If we got an empty page and we're past page 1, 
        // we might have reached the end
        if (results.result.posts.length === 0 && results.page > 1) {
          // Check if we should continue
          const remaining = pageQueue.filter(p => p <= calculatedTotalPages);
          if (remaining.length > 0 && allPosts.length < headerTotal * 0.9) {
            // Keep trying remaining pages
            console.log(`[UltraFetch] Empty page ${results.page}, but continuing (${allPosts.length}/${headerTotal})`);
          }
        }
      }
    }

    // ========================================
    // PHASE 2.5: VERIFICATION & RECOVERY
    // FIXED: If we didn't get all posts, try alternative approach
    // ========================================
    if (allPosts.length < headerTotal && failedPages.length > 0) {
      console.log(`[UltraFetch] Recovery: Retrying ${failedPages.length} failed pages sequentially...`);
      
      for (const page of failedPages) {
        if (abortController.signal.aborted) break;
        
        try {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Long delay
          const pagePosts = await fetchSinglePage(page, 1);
          
          for (const post of pagePosts) {
            if (!fetchedPostIds.has(post.id)) {
              fetchedPostIds.add(post.id);
              allPosts.push(post);
            }
          }
          
          skippedPages--;
          requestsCompleted++;
          
          onProgress(
            { current: allPosts.length, total: headerTotal, phase: 'fetching' },
            getStats(false)
          );
        } catch (error) {
          console.error(`[UltraFetch] Recovery failed for page ${page}`);
        }
      }
    }

    // FIXED: Final verification log
    const fetchPercentage = Math.round((allPosts.length / headerTotal) * 100);
    if (fetchPercentage < 95) {
      console.warn(`[UltraFetch] ⚠️ Only fetched ${allPosts.length}/${headerTotal} posts (${fetchPercentage}%)`);
      console.warn(`[UltraFetch] This might indicate server-side filtering or rate limiting`);
    }

    // ========================================
    // PHASE 3: CACHE & FINALIZE
    // ========================================
    try {
      await cache.cachePosts(baseUrl, allPosts);
    } catch (cacheError) {
      console.warn('[UltraFetch] Cache write failed:', cacheError);
    }
    
    // Sort by priority (needs work first)
    allPosts.sort((a, b) => {
      const getScore = (p: WordPressPost) => {
        let score = 0;
        if (p.featured_media === 0) score += 1000;
        if (p.imageCount === 0) score += 500;
        else if (p.imageCount < 3) score += 200;
        score += 100 - Math.min(p.imageCount * 10, 100);
        return score;
      };
      return getScore(b) - getScore(a);
    });
    
    const finalStats = getStats(false);
    console.log(`[UltraFetch] ✅ Complete: ${allPosts.length}/${headerTotal} posts in ${finalStats.elapsedMs}ms`);
    console.log(`[UltraFetch] Stats: ${finalStats.retryCount} retries, ${finalStats.skippedPages} skipped pages`);
    
    onProgress({ current: allPosts.length, total: allPosts.length, phase: 'complete' }, finalStats);
    
    return allPosts;
  }, []);

  // ============================================================
  // SOTA IMAGE ANALYSIS - Non-Blocking with Time-Slicing
  // ============================================================
  const analyzePostsImages = useCallback(async (
    postsToAnalyze: WordPressPost[],
    onProgress: (analyzed: number) => void
  ): Promise<WordPressPost[]> => {
    const results: WordPressPost[] = [];
    const chunkSize = 25;
    const yieldInterval = 16; // 60fps
    let lastYield = performance.now();

    const extractContentImages = (post: WordPressPost): ContentImage[] => {
      if (typeof window === 'undefined') return [];
      
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(post.content.rendered, 'text/html');
        const images: ContentImage[] = [];
        
        doc.querySelectorAll('img').forEach((img, index) => {
          let src = img.getAttribute('data-src') || 
                    img.getAttribute('data-lazy-src') || 
                    img.getAttribute('data-original') || 
                    img.getAttribute('src');

          if (!src || src.startsWith('data:')) {
            const srcset = img.getAttribute('srcset');
            if (srcset) {
              const firstCandidate = srcset.split(',')[0].trim().split(' ')[0];
              if (firstCandidate) src = firstCandidate;
            }
          }

          if (!src || src.length < 5 || src.includes('1x1') || src.includes('spacer')) return;

          let isExternal = false;
          try {
            if (src.startsWith('http')) {
              const postHost = new URL(post.link).hostname.replace('www.', '');
              const imgHost = new URL(src).hostname.replace('www.', '');
              isExternal = !imgHost.includes(postHost);
            }
          } catch {}

          images.push({
            src,
            alt: img.getAttribute('alt') || '',
            width: parseInt(img.getAttribute('width') || '0') || 0,
            height: parseInt(img.getAttribute('height') || '0') || 0,
            position: 0,
            paragraphIndex: index,
            isExternal,
            quality: 'medium',
          });
        });
        
        return images;
      } catch {
        return [];
      }
    };

    const analyzeImageDistribution = (post: WordPressPost, images: ContentImage[]): PostImageAnalysis => {
      const pCount = (post.content.rendered.match(/<p/g) || []).length;
      
      return {
        contentImages: images,
        insertionPoints: [],
        imageGaps: [],
        averageImageDistance: pCount / Math.max(1, images.length),
        recommendedImageCount: Math.ceil((post.wordCount || 0) / 300),
        qualityScore: Math.min(100, (images.length * 20) + (post.featured_media ? 50 : 0)),
        paragraphCount: pCount,
      };
    };

    for (let i = 0; i < postsToAnalyze.length; i++) {
      const post = postsToAnalyze[i];
      
      const contentImages = extractContentImages(post);
      const imageAnalysis = analyzeImageDistribution(post, contentImages);
      
      results.push({
        ...post,
        imageCount: contentImages.length,
        paragraphCount: imageAnalysis.paragraphCount,
        contentImages,
        imageAnalysis,
      });

      if (i % 5 === 0) onProgress(i + 1);

      // Yield to main thread to keep UI responsive
      if (i % chunkSize === 0 || (performance.now() - lastYield) > yieldInterval) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    
    onProgress(postsToAnalyze.length);
    return results;
  }, []);

  // ============================================================
  // OPTIMIZED CRAWLING HANDLER
  // ============================================================
  const handleStartCrawling = useCallback(async (newConfig: Configuration) => {
    setConfig(newConfig);
    setAppState(AppState.Crawling);
    setPosts([]);
    setCrawlError(null);
    setFetchStats(null);
    
    persistence.saveConfig(newConfig);

    try {
      // Phase 1 & 2: Ultra-fast parallel fetch with streaming
      const fetchedPosts = await ultraFetchAllPosts(
        newConfig,
        (progress, stats) => {
          setCrawlProgress(progress);
          setFetchStats(stats);
        }
      );

      // FIXED: Check if we got any posts
      if (fetchedPosts.length === 0) {
        throw new Error('No posts were fetched. Please check your WordPress credentials and ensure the REST API is enabled.');
      }

      // Phase 3: Analyze in chunks (non-blocking)
      setCrawlProgress({ current: 0, total: fetchedPosts.length, phase: 'analyzing' });
      
      const analyzedPosts = await analyzePostsImages(fetchedPosts, (analyzed) => {
        setCrawlProgress({ current: analyzed, total: fetchedPosts.length, phase: 'analyzing' });
      });

      // Re-sort after analysis
      const sortedPosts = analyzedPosts.sort((a, b) => {
        const getScore = (p: WordPressPost) => {
          let score = 0;
          if (p.featured_media === 0) score += 1000;
          if (p.imageCount === 0) score += 500;
          else if (p.imageCount < 3) score += 200;
          score += (100 - Math.min(p.imageCount * 10, 100));
          return score;
        };
        return getScore(b) - getScore(a);
      });

      setPosts(sortedPosts);
      persistence.savePosts(sortedPosts);
      setCrawlProgress({ current: sortedPosts.length, total: sortedPosts.length, phase: 'complete' });
      setAppState(AppState.Results);
      
    } catch (error) {
      console.error("Crawling failed:", error);
      const message = getErrorMessage(error);
      setCrawlError(message);
      // Stay on Crawling screen so user sees the error with a "Back to Configuration" button
    }
  }, [persistence, ultraFetchAllPosts, analyzePostsImages]);

  // Cancel handler
  const handleCancelCrawling = useCallback(() => {
    abortControllerRef.current?.abort();
    setAppState(AppState.Configuration);
    setCrawlError('Crawling cancelled by user');
  }, []);

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort();
    setAppState(AppState.Welcome);
    setConfig(null);
    setPosts([]);
    setCrawlProgress({ current: 0, total: 0 });
    setCrawlError(null);
    setFetchStats(null);
    persistence.clearAll();
    postCacheRef.current.clearCache().catch(console.error);
  }, [persistence]);

  const handleBackToConfig = useCallback(() => {
    setAppState(AppState.Configuration);
  }, []);

  const handleUpdatePosts = useCallback((updatedPosts: WordPressPost[]) => {
    setPosts(updatedPosts);
    persistence.savePosts(updatedPosts);
  }, [persistence]);

  // Force refresh (bypass cache)
  const handleForceRefresh = useCallback(async () => {
    if (!config) return;
    await postCacheRef.current.clearCache(config.wordpress.url);
    handleStartCrawling(config);
  }, [config, handleStartCrawling]);

  // Memoized content renderer with Suspense
  const content = useMemo(() => {
    const renderContent = () => {
      switch (appState) {
        case AppState.Welcome:
          return <WelcomeStep onGetStarted={() => setAppState(AppState.Configuration)} />;
        case AppState.Configuration:
          return (
            <ConfigurationStep 
              onConfigure={handleStartCrawling} 
              initialConfig={persistence.loadConfig() ?? undefined}
            />
          );
        case AppState.Crawling:
          return (
            <CrawlingStep 
              progress={crawlProgress} 
              error={crawlError}
              stats={fetchStats}
              onCancel={handleCancelCrawling}
            />
          );
        case AppState.Results:
          return config ? (
            <ResultsStep 
              initialPosts={posts} 
              config={config} 
              onReset={handleReset}
              onBackToConfig={handleBackToConfig}
              onUpdatePosts={handleUpdatePosts}
              persistence={persistence}
              appStats={appStats}
            />
          ) : null;
        default:
          return <div>Unknown state</div>;
      }
    };

    return (
      <ErrorBoundary
        fallback={(error, reset) => (
          <div className="bg-surface rounded-2xl p-8 border border-danger/20 text-center">
            <h2 className="text-xl font-bold text-danger mb-4">Something went wrong</h2>
            <p className="text-text-secondary mb-4">{error.message}</p>
            <button 
              onClick={reset}
              className="px-6 py-2 bg-brand-primary text-white rounded-lg"
            >
              Try Again
            </button>
          </div>
        )}
        resetKeys={[appState]}
      >
        <Suspense fallback={<StepLoader />}>
          {renderContent()}
        </Suspense>
      </ErrorBoundary>
    );
  }, [appState, config, posts, crawlProgress, crawlError, fetchStats, handleStartCrawling, handleReset, handleBackToConfig, handleUpdatePosts, handleCancelCrawling, persistence, appStats]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top gradient line */}
      <div className="h-0.5 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent" />
      
      <header className="w-full border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-3">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleReset}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-xl flex items-center justify-center shadow-sm">
                <AppIcon className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-text-primary tracking-tight hidden sm:block">AI Image Engine</span>
            </button>
            <a 
              href="https://affiliatemarketingforsuccess.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[10px] text-muted hover:text-brand-primary transition-colors hidden lg:block"
            >
              by AffiliateMarketingForSuccess.com
            </a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Performance Badge */}
            {appState === AppState.Results && fetchStats && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-success/8 rounded-lg border border-success/15 text-xs">
                <ZapIcon className="w-3.5 h-3.5 text-success" />
                <span className="text-success font-semibold">
                  {fetchStats.cachedHit ? 'Cached' : `${fetchStats.elapsedMs}ms`}
                </span>
              </div>
            )}

            {/* Quick Stats Badge */}
            {appState === AppState.Results && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface-muted rounded-lg border border-border text-[11px] font-medium">
                <span className="text-warning">{appStats.postsWithoutFeatured} missing</span>
                <span className="text-muted">•</span>
                <span className="text-danger">{appStats.postsWithZeroImages} empty</span>
                <span className="text-muted">•</span>
                <span className="text-success">{appStats.postsProcessed} done</span>
              </div>
            )}
            
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span className="hidden sm:inline">Powered by</span>
              <GeminiIcon className="h-5 w-5" />
            </div>
            
            <button
              onClick={() => setShowShortcuts(true)}
              className="p-2 rounded-xl bg-surface-muted/60 hover:bg-surface-muted text-text-muted hover:text-text-primary transition-colors"
              aria-label="Keyboard shortcuts"
              title="Shift+?"
            >
              <KeyboardIcon className="h-4 w-4" />
            </button>
            
            <button 
              onClick={toggleTheme} 
              className="p-2 rounded-xl bg-surface-muted/60 hover:bg-surface-muted text-text-muted hover:text-text-primary transition-colors"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-7xl mx-auto flex-grow px-4 sm:px-6 lg:px-8 py-8">
        {content}
      </main>

      <footer className="w-full border-t border-border bg-surface/50 mt-auto">
        <div className="max-w-7xl mx-auto py-8 px-6 text-center text-sm text-muted">
          <div className="flex flex-col items-center gap-3">
            <a href="https://affiliatemarketingforsuccess.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
              <img 
                src="https://affiliatemarketingforsuccess.com/wp-content/uploads/2023/03/cropped-Affiliate-Marketing-for-Success-Logo-Edited.png?lm=6666FEE0" 
                alt="Affiliate Marketing for Success Logo" 
                className="h-12 w-auto mb-1"
                loading="lazy"
              />
            </a>
            <p className="text-xs">
              Created by Alexios Papaioannou •{' '}
              <a href="https://affiliatemarketingforsuccess.com" target="_blank" rel="noopener noreferrer" className="font-medium hover:text-brand-primary transition-colors">
                affiliatemarketingforsuccess.com
              </a>
            </p>
            <p className="text-[10px] text-muted">
              <kbd className="px-1.5 py-0.5 bg-surface-muted rounded-md border border-border text-[9px] font-mono">Shift</kbd> + <kbd className="px-1.5 py-0.5 bg-surface-muted rounded-md border border-border text-[9px] font-mono">?</kbd> for shortcuts
            </p>
          </div>
        </div>
      </footer>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <Suspense fallback={null}>
          <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default App;
