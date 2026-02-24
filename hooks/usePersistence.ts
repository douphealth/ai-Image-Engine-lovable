// hooks/usePersistence.ts - Progress persistence for session recovery

import { useState, useEffect, useCallback } from 'react';
import { Configuration, WordPressPost } from '../types';

const STORAGE_KEYS = {
  CONFIG: 'ai-image-engine-config',
  PROGRESS: 'ai-image-engine-progress',
  POSTS: 'ai-image-engine-posts',
} as const;

const EXPIRY_HOURS = 24;

interface PersistedProgress {
  pendingPostIds: number[];
  completedPostIds: number[];
  timestamp: number;
}

interface PersistedConfig {
  wordpress: {
    url: string;
    username: string;
  };
  seo: Configuration['seo'];
  image: Configuration['image'];
  timestamp: number;
}

const isExpired = (timestamp: number): boolean => {
  const expiryMs = EXPIRY_HOURS * 60 * 60 * 1000;
  return Date.now() - timestamp > expiryMs;
};

const safeJsonParse = <T>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

export const usePersistence = () => {
  const [hasPersistedData, setHasPersistedData] = useState(false);

  // Check for persisted data on mount
  useEffect(() => {
    const progress = localStorage.getItem(STORAGE_KEYS.PROGRESS);
    if (progress) {
      const parsed = safeJsonParse<PersistedProgress | null>(progress, null);
      if (parsed && !isExpired(parsed.timestamp)) {
        setHasPersistedData(true);
      } else {
        clearAll();
      }
    }
  }, []);

  // Save configuration (without sensitive data)
  const saveConfig = useCallback((config: Configuration) => {
    const safeConfig: PersistedConfig = {
      wordpress: {
        url: config.wordpress.url,
        username: config.wordpress.username,
        // Note: We don't persist appPassword for security
      },
      seo: config.seo,
      image: config.image,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(safeConfig));
  }, []);

  // Load configuration
  const loadConfig = useCallback((): Partial<Configuration> | null => {
    const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
    const config = safeJsonParse<PersistedConfig | null>(stored, null);
    
    if (!config || isExpired(config.timestamp)) {
      return null;
    }

    return {
      wordpress: {
        url: config.wordpress.url,
        username: config.wordpress.username,
      },
      seo: config.seo,
      image: config.image,
    };
  }, []);

  // Save progress
  const saveProgress = useCallback((
    pendingPostIds: number[],
    completedPostIds: number[]
  ) => {
    const progress: PersistedProgress = {
      pendingPostIds,
      completedPostIds,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(progress));
    setHasPersistedData(pendingPostIds.length > 0 || completedPostIds.length > 0);
  }, []);

  // Load progress
  const loadProgress = useCallback((): PersistedProgress | null => {
    const stored = localStorage.getItem(STORAGE_KEYS.PROGRESS);
    const progress = safeJsonParse<PersistedProgress | null>(stored, null);
    
    if (!progress || isExpired(progress.timestamp)) {
      return null;
    }

    return progress;
  }, []);

  // Save posts cache
  const savePosts = useCallback((posts: WordPressPost[]) => {
    // Only save essential post data to reduce storage size
    const minimalPosts = posts.map(p => ({
      id: p.id,
      title: p.title,
      link: p.link,
      featured_media: p.featured_media,
      imageCount: p.imageCount,
      status: p.status,
      existingImageUrl: p.existingImageUrl,
      generatedImage: p.generatedImage,
    }));
    
    try {
      localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify({
        posts: minimalPosts,
        timestamp: Date.now(),
      }));
    } catch (e) {
      // Storage quota exceeded, clear old data
      console.warn('Storage quota exceeded, clearing cached posts');
      localStorage.removeItem(STORAGE_KEYS.POSTS);
    }
  }, []);

  // Load posts cache
  const loadPosts = useCallback((): Partial<WordPressPost>[] | null => {
    const stored = localStorage.getItem(STORAGE_KEYS.POSTS);
    if (!stored) return null;
    
    const data = safeJsonParse<{ posts: Partial<WordPressPost>[]; timestamp: number } | null>(stored, null);
    if (!data || isExpired(data.timestamp)) {
      localStorage.removeItem(STORAGE_KEYS.POSTS);
      return null;
    }
    
    return data.posts;
  }, []);

  // Clear all persisted data
  const clearAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.CONFIG);
    localStorage.removeItem(STORAGE_KEYS.PROGRESS);
    localStorage.removeItem(STORAGE_KEYS.POSTS);
    setHasPersistedData(false);
  }, []);

  // Clear progress only
  const clearProgress = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.PROGRESS);
    setHasPersistedData(false);
  }, []);

  return {
    hasPersistedData,
    saveConfig,
    loadConfig,
    saveProgress,
    loadProgress,
    savePosts,
    loadPosts,
    clearAll,
    clearProgress,
  };
};

export default usePersistence;
