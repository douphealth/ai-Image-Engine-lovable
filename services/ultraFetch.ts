// services/ultraFetch.ts - SOTA Ultra-Fast Parallel WordPress Post Fetcher

import { WordPressPost, Configuration } from '../types';
import { PostCache } from './postCache';
import { AdaptiveRateController } from './rateController';

// ============================================================
// CONFIG
// ============================================================
const FETCH_CONFIG = {
  REQUEST_TIMEOUT: 45000,
  MAX_RETRIES: 5,
  RETRY_BASE_DELAY: 1000,
  MAX_RETRY_DELAY: 10000,
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
// CORS PROXY HELPERS
// ============================================================
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

const stripAuthHeaders = (opts: RequestInit): RequestInit => {
  const safeHeaders = new Headers();
  if (opts.headers) {
    const h = opts.headers instanceof Headers ? opts.headers : new Headers(opts.headers as Record<string, string>);
    h.forEach((v, k) => {
      if (k.toLowerCase() !== 'authorization') safeHeaders.set(k, v);
    });
  }
  return { ...opts, headers: safeHeaders };
};

// ============================================================
// PARSE POST
// ============================================================
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

// ============================================================
// MAIN FETCHER
// ============================================================
export const ultraFetchAllPosts = async (
  config: Configuration,
  cache: PostCache,
  rateController: AdaptiveRateController,
  abortController: AbortController,
  onProgress: (progress: { current: number; total: number; phase: string }, stats: FetchStats) => void
): Promise<WordPressPost[]> => {
  const startTime = performance.now();
  const baseUrl = config.wordpress.url.replace(/\/$/, '');
  const authHeader = config.wordpress.appPassword 
    ? `Basic ${btoa(unescape(encodeURIComponent(`${config.wordpress.username}:${config.wordpress.appPassword}`)))}` 
    : null;
  
  let requestsCompleted = 0;
  let totalRequests = 0;
  let bytesDownloaded = 0;
  let retryCount = 0;
  let skippedPages = 0;
  
  rateController.reset();

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

  // PHASE 0: CHECK CACHE
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

  // SETUP
  const headers: HeadersInit = { 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate, br' };
  if (authHeader) headers['Authorization'] = authHeader;

  let useProxy: ((url: string) => string) | null = null;

  const corsFetch = async (url: string, opts: RequestInit): Promise<Response> => {
    if (useProxy) return fetch(useProxy(url), stripAuthHeaders(opts));
    try {
      return await fetch(url, opts);
    } catch (directError) {
      for (const proxyFn of CORS_PROXIES) {
        try {
          const resp = await fetch(proxyFn(url), stripAuthHeaders(opts));
          if (resp.ok) {
            useProxy = proxyFn;
            return resp;
          }
        } catch { continue; }
      }
      throw directError;
    }
  };

  // PHASE 1: PROBE
  const probeUrl = `${baseUrl}/wp-json/wp/v2/posts?per_page=1&page=1&status=publish`;
  const probeResponse = await corsFetch(probeUrl, { headers, signal: abortController.signal });

  if (!probeResponse.ok) {
    const errorText = await probeResponse.text().catch(() => '');
    throw new Error(`WordPress API Error: ${probeResponse.status} ${probeResponse.statusText}. ${errorText}`);
  }

  const headerTotal = parseInt(probeResponse.headers.get('X-WP-Total') || '0', 10);
  
  if (headerTotal === 0) {
    onProgress({ current: 0, total: 0, phase: 'complete' }, getStats(false));
    return [];
  }

  // Detect batch size
  let effectiveBatchSize = Math.min(rateController.getBatchSize(), 100);
  try {
    const testResponse = await corsFetch(
      `${baseUrl}/wp-json/wp/v2/posts?per_page=100&page=1&status=publish`,
      { headers, signal: abortController.signal }
    );
    if (testResponse.ok) {
      const testData = await testResponse.json();
      if (testData.length < 100 && testData.length < headerTotal) {
        effectiveBatchSize = Math.max(10, testData.length);
      } else if (testData.length > 0) {
        effectiveBatchSize = 100;
      }
      bytesDownloaded += parseInt(testResponse.headers.get('content-length') || '0');
    }
  } catch {
    effectiveBatchSize = 20;
  }

  const calculatedTotalPages = Math.ceil(headerTotal / effectiveBatchSize);
  totalRequests = calculatedTotalPages;
  onProgress({ current: 0, total: headerTotal, phase: 'fetching' }, getStats(false));

  // PHASE 2: FETCH ALL PAGES
  const allPosts: WordPressPost[] = [];
  const fetchedPostIds = new Set<number>();
  const failedPages: number[] = [];

  const fetchSinglePage = async (page: number, attemptNumber: number = 1): Promise<WordPressPost[]> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_CONFIG.REQUEST_TIMEOUT);
      const abortHandler = () => controller.abort();
      abortController.signal.addEventListener('abort', abortHandler);

      try {
        const response = await corsFetch(
          `${baseUrl}/wp-json/wp/v2/posts?per_page=${effectiveBatchSize}&page=${page}&status=publish&_embed=wp:featuredmedia`,
          { headers, signal: controller.signal }
        );
        clearTimeout(timeoutId);
        abortController.signal.removeEventListener('abort', abortHandler);

        if (!response.ok) {
          if (response.status === 400) {
            const errorBody = await response.text().catch(() => '');
            if (errorBody.includes('rest_post_invalid_page_number')) return [];
          }
          throw new Error(`Page ${page} failed: ${response.status}`);
        }

        const data = await response.json();
        bytesDownloaded += parseInt(response.headers.get('content-length') || '0');
        if (!Array.isArray(data)) return [];
        return data.map(parsePost);
      } finally {
        clearTimeout(timeoutId);
        abortController.signal.removeEventListener('abort', abortHandler);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') throw error;
      if (attemptNumber < FETCH_CONFIG.MAX_RETRIES) {
        const delay = Math.min(FETCH_CONFIG.RETRY_BASE_DELAY * Math.pow(2, attemptNumber - 1), FETCH_CONFIG.MAX_RETRY_DELAY);
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchSinglePage(page, attemptNumber + 1);
      }
      throw error;
    }
  };

  const pageQueue = Array.from({ length: calculatedTotalPages }, (_, i) => i + 1);
  const inFlight = new Map<number, Promise<{ page: number; posts: WordPressPost[] }>>();

  const processPage = async (page: number): Promise<{ page: number; posts: WordPressPost[] }> => {
    const reqStartTime = performance.now();
    try {
      const pagePosts = await fetchSinglePage(page);
      rateController.recordSuccess(performance.now() - reqStartTime);
      return { page, posts: pagePosts };
    } catch {
      rateController.recordError();
      failedPages.push(page);
      skippedPages++;
      return { page, posts: [] };
    }
  };

  while (pageQueue.length > 0 || inFlight.size > 0) {
    if (abortController.signal.aborted) break;

    const currentConcurrency = rateController.getConcurrency();
    while (pageQueue.length > 0 && inFlight.size < currentConcurrency) {
      const page = pageQueue.shift()!;
      inFlight.set(page, processPage(page));
    }

    if (inFlight.size > 0) {
      const results = await Promise.race(
        Array.from(inFlight.entries()).map(async ([page, promise]) => {
          const result = await promise;
          return { page, result };
        })
      );
      
      inFlight.delete(results.page);
      requestsCompleted++;
      
      for (const post of results.result.posts) {
        if (!fetchedPostIds.has(post.id)) {
          fetchedPostIds.add(post.id);
          allPosts.push(post);
        }
      }
      
      onProgress({ current: allPosts.length, total: headerTotal, phase: 'fetching' }, getStats(false));
    }
  }

  // PHASE 2.5: RECOVERY
  if (allPosts.length < headerTotal && failedPages.length > 0) {
    for (const page of failedPages) {
      if (abortController.signal.aborted) break;
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const pagePosts = await fetchSinglePage(page, 1);
        for (const post of pagePosts) {
          if (!fetchedPostIds.has(post.id)) {
            fetchedPostIds.add(post.id);
            allPosts.push(post);
          }
        }
        skippedPages--;
        requestsCompleted++;
        onProgress({ current: allPosts.length, total: headerTotal, phase: 'fetching' }, getStats(false));
      } catch { /* skip */ }
    }
  }

  // PHASE 3: CACHE & SORT
  try { await cache.cachePosts(baseUrl, allPosts); } catch { /* skip */ }
  
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
  onProgress({ current: allPosts.length, total: allPosts.length, phase: 'complete' }, finalStats);
  
  return allPosts;
};

export default ultraFetchAllPosts;
