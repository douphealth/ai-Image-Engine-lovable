// hooks/useFilteredPosts.ts - Pre-computed indexes with zero/low image filtering

import { useMemo, useCallback } from 'react';
import { WordPressPost, JobStatus, FilterPreset } from '../types';

export type FilterMode = FilterPreset;

export interface FilterIndexes {
  all: Set<number>;
  noFeatured: Set<number>;
  hasFeatured: Set<number>;
  zeroImages: Set<number>;
  lowImages: Set<number>;
  needsWork: Set<number>;
  processed: Set<number>;
  errors: Set<number>;
  pending: Set<number>;
  searchIndex: Map<number, string>;
  dateIndex: Map<number, number>;
  imageCountIndex: Map<number, number>;
}

export interface UseFilteredPostsOptions {
  posts: WordPressPost[];
  filterMode: FilterMode;
  searchQuery: string;
  sortBy?: 'date' | 'title' | 'images' | 'status';
  sortDirection?: 'asc' | 'desc';
  minImages?: number;
  maxImages?: number;
}

export interface UseFilteredPostsResult {
  filteredPosts: WordPressPost[];
  filteredCount: number;
  totalCount: number;
  indexes: FilterIndexes;
  stats: {
    noFeatured: number;
    hasFeatured: number;
    zeroImages: number;
    lowImages: number;
    needsWork: number;
    processed: number;
    errors: number;
    pending: number;
  };
}

const PENDING_STATUSES: JobStatus[] = [
  'pending', 'generating_brief', 'analyzing_placement', 'generating_image',
  'uploading', 'inserting', 'setting_featured', 'updating_meta', 'analyzing',
  'generating_schema', 'inserting_schema', 'generating_tldr', 'inserting_tldr', 'aeo_auditing',
];

import { stripHtml as safeStripHtml } from '../services/sanitize';
const stripHtml = (html: string): string => safeStripHtml(html).toLowerCase();

export const useFilteredPosts = (options: UseFilteredPostsOptions): UseFilteredPostsResult => {
  const { 
    posts, 
    filterMode, 
    searchQuery, 
    sortBy = 'date', 
    sortDirection = 'desc',
    minImages = 0,
    maxImages = 100,
  } = options;

  // Build indexes - O(n) once, then O(1) lookups
  const indexes = useMemo<FilterIndexes>(() => {
    const all = new Set<number>();
    const noFeatured = new Set<number>();
    const hasFeatured = new Set<number>();
    const zeroImages = new Set<number>();
    const lowImages = new Set<number>();
    const needsWork = new Set<number>();
    const processed = new Set<number>();
    const errors = new Set<number>();
    const pending = new Set<number>();
    const searchIndex = new Map<number, string>();
    const dateIndex = new Map<number, number>();
    const imageCountIndex = new Map<number, number>();

    for (const post of posts) {
      const id = post.id;
      all.add(id);

      // Featured image status
      const hasFeature = post.featured_media > 0 || !!post.generatedImage;
      if (!hasFeature) {
        noFeatured.add(id);
      } else {
        hasFeatured.add(id);
      }

      // Content image count
      if (post.imageCount === 0) {
        zeroImages.add(id);
      }
      if (post.imageCount > 0 && post.imageCount < 3) {
        lowImages.add(id);
      }

      // Needs work: no featured OR zero/low images
      if (!hasFeature || post.imageCount < 3) {
        needsWork.add(id);
      }

      // Processing status
      if (post.status === 'success') {
        processed.add(id);
      } else if (post.status === 'error') {
        errors.add(id);
      } else if (post.status && PENDING_STATUSES.includes(post.status)) {
        pending.add(id);
      }

      // Search index
      const searchText = stripHtml(post.title.rendered) + ' ' + stripHtml(post.excerpt.rendered);
      searchIndex.set(id, searchText);

      // Date index
      dateIndex.set(id, new Date(post.date).getTime());

      // Image count index
      imageCountIndex.set(id, post.imageCount);
    }

    return { 
      all, noFeatured, hasFeatured, zeroImages, lowImages, needsWork,
      processed, errors, pending, searchIndex, dateIndex, imageCountIndex 
    };
  }, [posts]);

  // Apply filter mode
  const filterByMode = useCallback((postId: number): boolean => {
    const imageCount = indexes.imageCountIndex.get(postId) || 0;
    
    // Apply min/max image filters
    if (imageCount < minImages || imageCount > maxImages) {
      return false;
    }

    switch (filterMode) {
      case 'no-featured':
        return indexes.noFeatured.has(postId);
      case 'has-featured':
        return indexes.hasFeatured.has(postId);
      case 'zero-images':
        return indexes.zeroImages.has(postId);
      case 'low-images':
        return indexes.lowImages.has(postId);
      case 'needs-work':
        return indexes.needsWork.has(postId);
      case 'processed':
        return indexes.processed.has(postId);
      case 'errors':
        return indexes.errors.has(postId);
      case 'pending':
        return indexes.pending.has(postId);
      case 'all':
      default:
        return true;
    }
  }, [filterMode, indexes, minImages, maxImages]);

  // Apply search filter
  const filterBySearch = useCallback((postId: number): boolean => {
    if (!searchQuery.trim()) return true;
    const searchText = indexes.searchIndex.get(postId);
    if (!searchText) return false;
    
    const query = searchQuery.toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    return terms.every(term => searchText.includes(term));
  }, [searchQuery, indexes]);

  // Filter and sort posts
  const filteredPosts = useMemo(() => {
    const filtered = posts.filter(post => filterByMode(post.id) && filterBySearch(post.id));

    return filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date':
          comparison = (indexes.dateIndex.get(a.id) || 0) - (indexes.dateIndex.get(b.id) || 0);
          break;
        case 'title':
          comparison = (indexes.searchIndex.get(a.id) || '').localeCompare(indexes.searchIndex.get(b.id) || '');
          break;
        case 'images':
          comparison = (indexes.imageCountIndex.get(a.id) || 0) - (indexes.imageCountIndex.get(b.id) || 0);
          break;
        case 'status':
          const statusOrder: Record<string, number> = { error: 0, pending: 1, idle: 2, success: 3 };
          comparison = (statusOrder[a.status || 'idle'] || 2) - (statusOrder[b.status || 'idle'] || 2);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [posts, filterByMode, filterBySearch, sortBy, sortDirection, indexes]);

  // Calculate stats
  const stats = useMemo(() => ({
    noFeatured: indexes.noFeatured.size,
    hasFeatured: indexes.hasFeatured.size,
    zeroImages: indexes.zeroImages.size,
    lowImages: indexes.lowImages.size,
    needsWork: indexes.needsWork.size,
    processed: indexes.processed.size,
    errors: indexes.errors.size,
    pending: indexes.pending.size,
  }), [indexes]);

  return {
    filteredPosts,
    filteredCount: filteredPosts.length,
    totalCount: posts.length,
    indexes,
    stats,
  };
};

export default useFilteredPosts;
