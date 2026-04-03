// services/wordpressService.ts - SOTA WordPress Service with Full Media Library Support

import { 
  WordPressPost, 
  MediaUploadResult, 
  WordPressCredentials, 
  InsertionPoint, 
  ContentImage,
  MediaItem,
  MediaLibraryFilters,
  MediaLibraryResponse,
  MediaLibraryStats
} from '../types';
import { fetchWithRetry } from './retry';
import { cachedFetch, generateCacheKey } from './cache';
import { APIError, AuthenticationError } from './errors';
import { circuitBreakers, withCircuitBreaker } from './circuitBreaker';
import { extractContentImages } from './imageUtils';

// ============================================================
// CORE API UTILITIES
// ============================================================

const createAuthHeader = (username: string, appPassword?: string): string | null => {
  if (!username || !appPassword) return null;
  return `Basic ${btoa(unescape(encodeURIComponent(`${username}:${appPassword}`)))}`;
};

const buildApiUrl = (baseUrl: string, endpoint: string): string => {
  return `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2${endpoint}`;
};

interface WPFetchOptions extends RequestInit {
  timeout?: number;
  skipCache?: boolean;
}

// CORS proxy list for fallback when direct requests fail
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

const wpFetch = async <T = unknown>(
  baseUrl: string,
  endpoint: string,
  username: string,
  appPassword?: string,
  options: WPFetchOptions = {}
): Promise<{ data: T; headers: Headers }> => {
  const url = buildApiUrl(baseUrl, endpoint);
  const headers = new Headers(options.headers || {});
  
  const authHeader = createAuthHeader(username, appPassword);
  if (authHeader) headers.set('Authorization', authHeader);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const { timeout = 60000, skipCache, ...fetchOptions } = options;

  // Try direct fetch first, wrapped in circuit breaker
  try {
    const response = await withCircuitBreaker(circuitBreakers.wordpress, () => 
      fetchWithRetry(url, { ...fetchOptions, headers }, { maxRetries: 1 }, timeout)
    );
    const data = await response.json() as T;
    return { data, headers: response.headers };
  } catch (directError) {
    if (directError instanceof APIError && directError.statusCode === 401) {
      throw new AuthenticationError('Invalid WordPress credentials');
    }
    
    // If it's a network/CORS error, try proxies
    const isNetworkError = directError instanceof TypeError || 
      (directError instanceof Error && directError.message.includes('Failed to fetch'));
    
    if (!isNetworkError) throw directError;
    
    console.warn('Direct WP fetch failed (likely CORS), trying proxy fallback...');
    
    // For non-GET requests with auth, proxies won't work well - throw clear error
    if (options.method && options.method !== 'GET') {
      throw new Error(
        'CORS blocked. Your WordPress site needs CORS headers for write operations. ' +
        'Install the "WP CORS" or "Enable CORS" plugin on your WordPress site, ' +
        'or add this to your theme\'s functions.php:\n' +
        'add_filter("rest_pre_serve_request", function($v) { header("Access-Control-Allow-Origin: *"); header("Access-Control-Allow-Headers: Authorization, Content-Type"); return $v; });'
      );
    }

    // Try CORS proxies for GET requests
    // SECURITY: Never send auth headers through third-party CORS proxies
    for (const proxyFn of CORS_PROXIES) {
      try {
        const proxyUrl = proxyFn(url);
        
        const response = await fetch(proxyUrl, { 
          ...fetchOptions, 
          headers: new Headers(), // Strip all auth headers
          signal: AbortSignal.timeout(timeout)
        });
        
        if (!response.ok) continue;
        
        const data = await response.json() as T;
        // Proxy responses don't have WP headers, so create synthetic ones
        const syntheticHeaders = new Headers(response.headers);
        return { data, headers: syntheticHeaders };
      } catch (proxyError) {
        console.warn('Proxy fallback failed, trying next...', proxyError);
        continue;
      }
    }

    // All proxies failed
    throw new Error(
      'Cannot connect to WordPress (CORS blocked). Solutions:\n' +
      '1. Install "WP CORS" plugin on your WordPress site\n' +
      '2. Or add CORS headers to your theme\'s functions.php\n' +
      '3. Or test from your own domain (not the Lovable preview)'
    );
  }
};

// ============================================================
// MEDIA LIBRARY API - SOTA Implementation with Infinite Scroll
// ============================================================

/**
 * Fetch media library items with filtering, pagination, and search
 * Optimized for infinite scroll with large batch sizes
 */
export const fetchMediaLibrary = async (
  config: WordPressCredentials,
  page: number = 1,
  perPage: number = 48,
  filters: Partial<MediaLibraryFilters> = {},
  signal?: AbortSignal
): Promise<MediaLibraryResponse> => {
  const params = new URLSearchParams();
  params.append('per_page', perPage.toString());
  params.append('page', page.toString());
  
  // Media type filter
  if (filters.mediaType && filters.mediaType !== 'all') {
    params.append('media_type', filters.mediaType);
  } else {
    params.append('media_type', 'image');
  }
  
  params.append('orderby', filters.orderBy || 'date');
  params.append('order', filters.order || 'desc');
  
  if (filters.search) {
    params.append('search', filters.search);
  }
  
  // Date filtering
  if (filters.dateRange && filters.dateRange !== 'all') {
    const now = new Date();
    let after: Date;
    
    switch (filters.dateRange) {
      case 'today':
        after = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        after = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        after = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case 'year':
        after = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        after = new Date(0);
    }
    
    params.append('after', after.toISOString());
  }

  const { data, headers } = await wpFetch<MediaItem[]>(
    config.url,
    `/media?${params.toString()}`,
    config.username,
    config.appPassword,
    { signal }
  );

  return {
    items: data,
    total: parseInt(headers.get('X-WP-Total') || '0', 10),
    totalPages: parseInt(headers.get('X-WP-TotalPages') || '0', 10),
  };
};

/**
 * Fetch a single media item by ID
 */
export const fetchMediaItem = async (
  config: WordPressCredentials,
  mediaId: number,
  signal?: AbortSignal
): Promise<MediaItem> => {
  const { data } = await wpFetch<MediaItem>(
    config.url,
    `/media/${mediaId}`,
    config.username,
    config.appPassword,
    { signal }
  );
  return data;
};

/**
 * Update media item metadata (alt text, caption, title)
 */
export const updateMediaItem = async (
  config: WordPressCredentials,
  mediaId: number,
  updates: {
    alt_text?: string;
    caption?: string;
    title?: string;
    description?: string;
  },
  signal?: AbortSignal
): Promise<MediaItem> => {
  const { data } = await wpFetch<MediaItem>(
    config.url,
    `/media/${mediaId}`,
    config.username,
    config.appPassword,
    {
      method: 'POST',
      body: JSON.stringify(updates),
      signal,
    }
  );
  return data;
};

/**
 * Delete a media item permanently
 */
export const deleteMediaItem = async (
  config: WordPressCredentials,
  mediaId: number,
  force: boolean = true,
  signal?: AbortSignal
): Promise<void> => {
  await wpFetch(
    config.url,
    `/media/${mediaId}?force=${force}`,
    config.username,
    config.appPassword,
    { method: 'DELETE', signal }
  );
};

/**
 * Get media library statistics
 */
export const getMediaLibraryStats = async (
  config: WordPressCredentials,
  signal?: AbortSignal
): Promise<MediaLibraryStats> => {
  const [images, videos, audio, docs] = await Promise.all([
    wpFetch<MediaItem[]>(config.url, '/media?media_type=image&per_page=1', config.username, config.appPassword, { signal }),
    wpFetch<MediaItem[]>(config.url, '/media?media_type=video&per_page=1', config.username, config.appPassword, { signal }),
    wpFetch<MediaItem[]>(config.url, '/media?media_type=audio&per_page=1', config.username, config.appPassword, { signal }),
    wpFetch<MediaItem[]>(config.url, '/media?media_type=application&per_page=1', config.username, config.appPassword, { signal }),
  ]);

  return {
    totalImages: parseInt(images.headers.get('X-WP-Total') || '0', 10),
    totalVideos: parseInt(videos.headers.get('X-WP-Total') || '0', 10),
    totalAudio: parseInt(audio.headers.get('X-WP-Total') || '0', 10),
    totalDocuments: parseInt(docs.headers.get('X-WP-Total') || '0', 10),
    totalSize: 0,
  };
};

/**
 * Search media library with debounced query
 */
export const searchMediaLibrary = async (
  config: WordPressCredentials,
  query: string,
  mediaType: string = 'image',
  limit: number = 20,
  signal?: AbortSignal
): Promise<MediaItem[]> => {
  if (!query.trim()) return [];
  
  const { data } = await wpFetch<MediaItem[]>(
    config.url,
    `/media?search=${encodeURIComponent(query)}&media_type=${mediaType}&per_page=${limit}`,
    config.username,
    config.appPassword,
    { signal }
  );
  
  return data;
};

// ============================================================
// POST FETCHING API
// ============================================================

export const getTotalPosts = async (url: string, user: string, pass?: string, signal?: AbortSignal): Promise<number> => {
  const cacheKey = generateCacheKey('totalPosts', { url, user });
  return cachedFetch(cacheKey, async () => {
    const { headers } = await wpFetch<unknown[]>(url, '/posts?per_page=1', user, pass, { signal });
    return parseInt(headers.get('X-WP-Total') || '0', 10);
  }, 60000);
};

const parsePost = (post: Record<string, unknown>): WordPressPost => {
  const content = (post.content as { rendered: string, raw?: string })?.rendered || '';
  const wordCount = content.split(/\s+/).length; 
  
  return {
    id: post.id as number,
    title: post.title as { rendered: string },
    link: post.link as string,
    excerpt: post.excerpt as { rendered: string },
    content: {
        rendered: content,
        raw: (post.content as any)?.raw
    },
    date: post.date as string,
    modified: post.modified as string,
    featured_media: post.featured_media as number,
    imageCount: 0,
    wordCount,
    paragraphCount: 0,
    existingImageUrl: (post._embedded as any)?.['wp:featuredmedia']?.[0]?.source_url,
    status: 'idle',
  };
};

export const fetchPostsPage = async (url: string, user: string, pass: string | undefined, page: number, perPage: number, signal?: AbortSignal): Promise<WordPressPost[]> => {
  // FIXED: Don't use context=edit - it requires elevated permissions many users don't have
  const { data } = await wpFetch<Record<string, unknown>[]>(url, `/posts?per_page=${perPage}&page=${page}&_embed=wp:featuredmedia`, user, pass, { signal });
  return data.map(parsePost);
};

export const fetchAllPostsParallel = async (
  url: string,
  user: string,
  pass: string | undefined,
  estimatedTotal: number,
  perPage = 20,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
  concurrency = 3
): Promise<WordPressPost[]> => {
  
  let page1: WordPressPost[] = [];
  let serverTotalPages = 0;
  let serverTotal = estimatedTotal;

  try {
      const { data, headers } = await wpFetch<Record<string, unknown>[]>(
        url, 
        `/posts?per_page=${perPage}&page=1&_embed=wp:featuredmedia`, 
        user, 
        pass, 
        { signal }
      );
      
      page1 = data.map(parsePost);
      serverTotal = parseInt(headers.get('X-WP-Total') || String(estimatedTotal), 10);
      serverTotalPages = parseInt(headers.get('X-WP-TotalPages') || '0', 10);
      
      onProgress?.(page1.length, serverTotal);
  } catch (e) {
      console.error("Failed to fetch page 1:", e);
      throw e;
  }

  const allPosts = [...page1];
  
  if (serverTotalPages <= 1) return allPosts;

  const remainingPages = Array.from({ length: serverTotalPages - 1 }, (_, i) => i + 2);

  for (let i = 0; i < remainingPages.length; i += concurrency) {
    if (signal?.aborted) break;
    
    const batch = remainingPages.slice(i, i + concurrency);
    
    const results = await Promise.all(
      batch.map(async (p) => {
        try {
            return await fetchPostsPage(url, user, pass, p, perPage, signal);
        } catch (e) {
            console.error(`Error fetching page ${p}:`, e);
            try {
                return await fetchPostsPage(url, user, pass, p, perPage, signal);
            } catch (retryError) {
                console.error(`Retry failed for page ${p}:`, retryError);
                return [];
            }
        }
      })
    );
    
    results.forEach(posts => allPosts.push(...posts));
    onProgress?.(allPosts.length, serverTotal);
  }

  return allPosts;
};

// ============================================================
// POST IMAGE ANALYSIS
// ============================================================

export const analyzePostImages = async (
  posts: WordPressPost[],
  onProgress?: (analyzed: number) => void
): Promise<WordPressPost[]> => {
  const results: WordPressPost[] = [];
  const chunkSize = 20;
  const yieldInterval = 16;

  let lastYield = performance.now();

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    
    const contentImages = extractContentImages(post);
    const imageAnalysis = analyzeImageDistribution(post, contentImages);
    
    results.push({
      ...post,
      imageCount: contentImages.length,
      paragraphCount: imageAnalysis.paragraphCount,
      contentImages,
      imageAnalysis,
    });

    if (i % 5 === 0) onProgress?.(i + 1);

    if (i % chunkSize === 0 || (performance.now() - lastYield) > yieldInterval) {
      await new Promise(resolve => setTimeout(resolve, 0));
      lastYield = performance.now();
    }
  }
  
  onProgress?.(posts.length);
  return results;
};

// extractContentImages is now imported from ./imageUtils (single source of truth)

const analyzeImageDistribution = (post: WordPressPost, images: ContentImage[]) => {
  const pCount = (post.content.rendered.match(/<p/g) || []).length;
  
  return {
    contentImages: images,
    insertionPoints: [],
    imageGaps: [],
    averageImageDistance: pCount / Math.max(1, images.length),
    recommendedImageCount: Math.ceil((post.wordCount || 0) / 300),
    qualityScore: Math.min(100, (images.length * 20) + (post.featured_media ? 50 : 0)),
    paragraphCount: pCount
  };
};

// ============================================================
// MEDIA UPLOAD & POST UPDATE
// ============================================================

export const uploadImage = async (config: WordPressCredentials, imageDataUrl: string, fileName: string, altText: string, caption: string, signal?: AbortSignal): Promise<MediaUploadResult> => {
  const response = await fetch(imageDataUrl);
  const blob = await response.blob();
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('alt_text', altText);
  formData.append('caption', caption);
  formData.append('title', altText);

  const { data } = await wpFetch<{ id: number; source_url: string }>(config.url, '/media', config.username, config.appPassword, {
    method: 'POST', body: formData, signal, timeout: 120000
  });
  return { id: data.id, source_url: data.source_url };
};

export const updatePost = async (config: WordPressCredentials, postId: number, update: any, signal?: AbortSignal): Promise<WordPressPost> => {
  const { data } = await wpFetch<any>(config.url, `/posts/${postId}`, config.username, config.appPassword, {
    method: 'POST', body: JSON.stringify(update), signal
  });
  return parsePost(data);
};

export const updatePostContent = async (
  config: WordPressCredentials,
  postId: number,
  insertionPoint: InsertionPoint,
  imageUrl: string,
  imageAlt: string
): Promise<WordPressPost> => {
  // Fetch current post content (try context=edit, fall back to rendered)
  let content = '';
  try {
    const { data: currentPost } = await wpFetch<any>(
      config.url,
      `/posts/${postId}?context=edit`,
      config.username,
      config.appPassword
    );
    content = currentPost.content.raw || currentPost.content.rendered || '';
  } catch {
    // context=edit requires elevated permissions; fall back to rendered
    const { data: currentPost } = await wpFetch<any>(
      config.url,
      `/posts/${postId}`,
      config.username,
      config.appPassword
    );
    content = currentPost.content.rendered || '';
  }
  
  const imageHtml = `
<!-- wp:image {"sizeSlug":"large"} -->
<figure class="wp-block-image size-large"><img src="${imageUrl}" alt="${imageAlt}"/><figcaption class="wp-element-caption">${imageAlt}</figcaption></figure>
<!-- /wp:image -->`;

  let count = 0;
  content = content.replace(/<\/p>/gi, (match: string) => {
      if (count === insertionPoint.paragraphIndex) {
          count++;
          return match + '\n\n' + imageHtml;
      }
      count++;
      return match;
  });
  
  if (count <= insertionPoint.paragraphIndex) {
      content += '\n\n' + imageHtml;
  }

  return updatePost(config, postId, { content });
};

export const updateMediaAltText = async (
  config: WordPressCredentials,
  mediaId: number,
  altText: string
): Promise<void> => {
  await wpFetch(
    config.url,
    `/media/${mediaId}`,
    config.username,
    config.appPassword,
    {
      method: 'POST',
      body: JSON.stringify({ alt_text: altText })
    }
  );
};

// ============================================================
// CONTENT IMAGE MANIPULATION
// ============================================================

export const deleteContentImage = async (
  config: WordPressCredentials,
  post: WordPressPost,
  imageUrlToDelete: string
): Promise<WordPressPost> => {
    const { data: currentPost } = await wpFetch<any>(
        config.url,
        `/posts/${post.id}?context=edit`,
        config.username,
        config.appPassword
    );

    let content = currentPost.content.raw || currentPost.content.rendered || '';
    
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const images = Array.from(doc.querySelectorAll('img'));
    let modified = false;

    for (const img of images) {
        if (img.src.includes(imageUrlToDelete) || imageUrlToDelete.includes(img.src)) {
             const wrapper = img.closest('figure') || img.closest('.wp-block-image') || img;
             wrapper.remove();
             modified = true;
             break;
        }
    }

    if (!modified) {
        const escapedUrl = imageUrlToDelete.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const blockRegex = new RegExp(`<!-- wp:image.*?<img[^>]*src="${escapedUrl}".*?<!-- /wp:image -->`, 'gs');
        const prevLen = content.length;
        content = content.replace(blockRegex, '');
        
        if (content.length === prevLen) {
             const imgTagRegex = new RegExp(`<img[^>]*src="${escapedUrl}"[^>]*>`, 'g');
             content = content.replace(imgTagRegex, '');
        }
    } else {
        content = doc.body.innerHTML;
    }

    return updatePost(config, post.id, { content });
};

export const replaceContentImage = async (
  config: WordPressCredentials,
  post: WordPressPost,
  oldImageUrl: string,
  newImageUrl: string,
  newAltText: string
): Promise<WordPressPost> => {
    const { data: currentPost } = await wpFetch<any>(
        config.url,
        `/posts/${post.id}?context=edit`,
        config.username,
        config.appPassword
    );

    let content = currentPost.content.raw || currentPost.content.rendered || '';
    content = content.split(oldImageUrl).join(newImageUrl);
    
    return updatePost(config, post.id, { content });
};

// ============================================================
// CONNECTION TEST
// ============================================================

export const testConnection = async (url: string, user: string, pass?: string) => {
    try {
        const total = await getTotalPosts(url, user, pass);
        return { success: true, message: `Connected! ${total} posts found.`, postCount: total };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
};

// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {
  // Media Library
  fetchMediaLibrary,
  fetchMediaItem,
  updateMediaItem,
  deleteMediaItem,
  getMediaLibraryStats,
  searchMediaLibrary,
  // Posts
  getTotalPosts,
  fetchPostsPage,
  fetchAllPostsParallel,
  analyzePostImages,
  // Media Upload
  uploadImage,
  updatePost,
  updatePostContent,
  updateMediaAltText,
  // Content Image Manipulation
  deleteContentImage,
  replaceContentImage,
  // Connection
  testConnection,
};
