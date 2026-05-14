import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { PostCache } from '../services/postCache';
import { WordPressPost } from '../types';

const makePost = (id: number, link = 'https://example.com/p'): WordPressPost => ({
  id,
  date: '2024-01-01',
  modified: '2024-01-01',
  slug: `post-${id}`,
  link: `${link}/${id}`,
  title: { rendered: `Title ${id}` },
  content: { rendered: '<p>x</p>' },
  excerpt: { rendered: 'x' },
  featured_media: 0,
  status: 'publish',
  type: 'post',
  imageCount: 0,
  paragraphCount: 0,
  contentImages: [],
  wordCount: 100,
} as unknown as WordPressPost);

describe('PostCache', () => {
  let cache: PostCache;
  let counter = 0;

  beforeEach(async () => {
    counter++;
    cache = new PostCache();
    // Use a unique DB name per test for isolation
    (cache as any).dbName = `test-cache-${counter}-${Date.now()}`;
    await cache.init();
  });

  it('returns null when nothing cached', async () => {
    const result = await cache.getCachedPosts('https://site.com');
    expect(result).toBeNull();
  });

  it('caches and retrieves posts', async () => {
    const posts = [makePost(1), makePost(2)];
    await cache.cachePosts('https://site.com', posts);
    const result = await cache.getCachedPosts('https://site.com');
    expect(result).not.toBeNull();
    expect(result!.posts).toHaveLength(2);
    expect(result!.isFresh).toBe(true);
  });

  it('isolates posts by siteUrl', async () => {
    await cache.cachePosts('https://a.com', [makePost(1)]);
    await cache.cachePosts('https://b.com', [makePost(2), makePost(3)]);
    const a = await cache.getCachedPosts('https://a.com');
    const b = await cache.getCachedPosts('https://b.com');
    expect(a!.posts).toHaveLength(1);
    expect(b!.posts).toHaveLength(2);
  });

  it('clears cache for a single site', async () => {
    await cache.cachePosts('https://a.com', [makePost(1)]);
    await cache.cachePosts('https://b.com', [makePost(2)]);
    await cache.clearCache('https://a.com');
    expect(await cache.getCachedPosts('https://a.com')).toBeNull();
    expect((await cache.getCachedPosts('https://b.com'))!.posts).toHaveLength(1);
  });

  it('clears entire cache', async () => {
    await cache.cachePosts('https://a.com', [makePost(1)]);
    await cache.cachePosts('https://b.com', [makePost(2)]);
    await cache.clearCache();
    expect(await cache.getCachedPosts('https://a.com')).toBeNull();
    expect(await cache.getCachedPosts('https://b.com')).toBeNull();
  });

  it('marks stale entries as not fresh', async () => {
    vi.useFakeTimers();
    const start = new Date('2024-01-01T00:00:00Z');
    vi.setSystemTime(start);
    await cache.cachePosts('https://site.com', [makePost(1)]);
    vi.setSystemTime(new Date(start.getTime() + 25 * 60 * 60 * 1000));
    const result = await cache.getCachedPosts('https://site.com');
    expect(result!.isFresh).toBe(false);
    vi.useRealTimers();
  });

  it('replaces posts for a site on re-cache', async () => {
    await cache.cachePosts('https://site.com', [makePost(1), makePost(2)]);
    await cache.cachePosts('https://site.com', [makePost(3)]);
    const result = await cache.getCachedPosts('https://site.com');
    expect(result!.posts).toHaveLength(1);
    expect(result!.posts[0].id).toBe(3);
  });
});
