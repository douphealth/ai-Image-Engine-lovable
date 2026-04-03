// components/ResultsStep.tsx - SOTA with Media Library Browser Integration

import React, { 
  useState, 
  useMemo, 
  useCallback, 
  useRef, 
  useDeferredValue,
  useTransition,
  Suspense,
  lazy
} from 'react';
import { WordPressPost, Configuration, JobStatus, FilterPreset, AppStats, InsertionPoint, MediaItem, MediaInsertionMode } from '../types';
import PostCard from './PostCard';
import PostCardSkeleton from './PostCardSkeleton';
import GenerationModal from './GenerationModal';
import StatsBar from './StatsBar';
import FilterBar from './FilterBar';
import { ErrorBoundary } from './ErrorBoundary';
import { generateImageBrief, generateImage, analyzeImagePlacement } from '../services/aiService';
import { uploadImage, updatePost, updatePostContent } from '../services/wordpressService';
import { useJobQueue, QueueJob } from '../hooks/useJobQueue';
import { usePersistence } from '../hooks/usePersistence';
import { useFilteredPosts, FilterMode } from '../hooks/useFilteredPosts';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { 
  CheckSquare, 
  Square, 
  SparklesIcon, 
  FilterIcon, 
  SearchIcon,
  Loader,
  GridIcon,
  ListIcon,
  GalleryIcon,
  DownloadIcon,
  RefreshCwIcon,
  ChevronUpIcon,
  UploadCloudIcon,
  FolderOpenIcon
} from './icons/Icons';

// Lazy load modals
const ImageGalleryModal = lazy(() => import('./ImageGalleryModal'));
const ImageInsertionModal = lazy(() => import('./ImageInsertionModal'));
const BulkActionsModal = lazy(() => import('./BulkActionsModal'));
const ImageUploadModal = lazy(() => import('./ImageUploadModal'));
const MediaLibraryBrowser = lazy(() => import('./MediaLibraryBrowser'));

interface Props {
  initialPosts: WordPressPost[];
  config: Configuration;
  onReset: () => void;
  onBackToConfig: () => void;
  onUpdatePosts: (posts: WordPressPost[]) => void;
  persistence: ReturnType<typeof usePersistence>;
  appStats: AppStats;
}

// Virtual grid constants
const CARD_HEIGHT = 420;
const CARD_GAP = 24;
const VISIBLE_BUFFER = 4;

type ViewMode = 'grid' | 'list' | 'compact';

const ResultsStep: React.FC<Props> = ({ 
  initialPosts, 
  config, 
  onReset, 
  onBackToConfig,
  onUpdatePosts,
  persistence,
  appStats
}) => {
  // Core state
  const [posts, setPosts] = useState<WordPressPost[]>(initialPosts);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<number>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  
  // Modal states
  const [galleryPost, setGalleryPost] = useState<WordPressPost | null>(null);
  const [insertionPost, setInsertionPost] = useState<WordPressPost | null>(null);
  const [uploadPost, setUploadPost] = useState<WordPressPost | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);
  
  // NEW: Media Library Browser state
  const [mediaLibraryPost, setMediaLibraryPost] = useState<WordPressPost | null>(null);
  const [mediaLibraryMode, setMediaLibraryMode] = useState<MediaInsertionMode>('featured');
  
  // Filter state
  const [filterPreset, setFilterPreset] = useState<FilterPreset>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'images' | 'status'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [minImages, setMinImages] = useState<number>(0);
  const [maxImages, setMaxImages] = useState<number>(100);
  
  // Virtualization state
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(800);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [showScrollTop, setShowScrollTop] = useState(false);
  
  // Processing state
  const processingPostsRef = useRef<Set<number>>(new Set());
  const focusedPostRef = useRef<number | null>(null);
  
  // Transitions for non-blocking updates
  const [isPending, startTransition] = useTransition();
  
  // Deferred values for responsive typing
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredFilterPreset = useDeferredValue(filterPreset);

  // ============================================================
  // ADVANCED FILTERING with pre-computed indexes
  // ============================================================
  const { filteredPosts, filteredCount, totalCount, stats } = useFilteredPosts({
    posts,
    filterMode: deferredFilterPreset as FilterMode,
    searchQuery: deferredSearchQuery,
    sortBy: sortBy as any,
    sortDirection,
    minImages,
    maxImages,
  });

  // ============================================================
  // VIRTUALIZATION - Only render visible cards
  // ============================================================
  const columnsCount = useMemo(() => {
    if (viewMode === 'list') return 1;
    if (viewMode === 'compact') return 6;
    const width = containerWidth;
    if (width >= 1536) return 5;
    if (width >= 1280) return 4;
    if (width >= 1024) return 3;
    if (width >= 640) return 2;
    return 1;
  }, [containerWidth, viewMode]);

  const effectiveCardHeight = viewMode === 'list' ? 120 : viewMode === 'compact' ? 280 : CARD_HEIGHT;
  const rowHeight = effectiveCardHeight + CARD_GAP;
  const totalRows = Math.ceil(filteredPosts.length / columnsCount);
  const totalHeight = totalRows * rowHeight;

  const visibleRange = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - VISIBLE_BUFFER);
    const visibleRows = Math.ceil(containerHeight / rowHeight) + VISIBLE_BUFFER * 2;
    const endRow = Math.min(totalRows, startRow + visibleRows);
    
    return {
      startIndex: startRow * columnsCount,
      endIndex: Math.min(endRow * columnsCount, filteredPosts.length),
      offsetY: startRow * rowHeight,
    };
  }, [scrollTop, containerHeight, rowHeight, totalRows, columnsCount, filteredPosts.length]);

  const visiblePosts = useMemo(() => {
    return filteredPosts.slice(visibleRange.startIndex, visibleRange.endIndex);
  }, [filteredPosts, visibleRange]);

  // Handle scroll with show/hide scroll-to-top
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
      setShowScrollTop(target.scrollTop > 500);
    });
  }, []);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Resize observer
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    setContainerHeight(container.clientHeight);
    setContainerWidth(container.clientWidth);

    return () => resizeObserver.disconnect();
  }, []);

  // ============================================================
  // KEYBOARD SHORTCUTS - Updated with 'm' for media library
  // ============================================================
  useKeyboardShortcuts({
    'j': () => navigatePosts(1),
    'k': () => navigatePosts(-1),
    'space': () => {
      if (focusedPostRef.current) {
        handleToggleSelect(focusedPostRef.current);
      }
    },
    'enter': () => {
      if (focusedPostRef.current) {
        const post = posts.find(p => p.id === focusedPostRef.current);
        if (post) handleGenerateSingle(post);
      }
    },
    'g': () => {
      if (focusedPostRef.current) {
        const post = posts.find(p => p.id === focusedPostRef.current);
        if (post) setGalleryPost(post);
      }
    },
    'i': () => {
      if (focusedPostRef.current) {
        const post = posts.find(p => p.id === focusedPostRef.current);
        if (post) setInsertionPost(post);
      }
    },
    'u': () => {
      if (focusedPostRef.current) {
        const post = posts.find(p => p.id === focusedPostRef.current);
        if (post) setUploadPost(post);
      }
    },
    'm': () => {
      if (focusedPostRef.current) {
        const post = posts.find(p => p.id === focusedPostRef.current);
        if (post) handleOpenMediaLibrary(post, 'featured');
      }
    },
    'ctrl+a': (e) => {
      e.preventDefault();
      handleSelectAll();
    },
    'escape': () => {
      setGalleryPost(null);
      setInsertionPost(null);
      setUploadPost(null);
      setShowBulkActions(false);
      setMediaLibraryPost(null);
    },
    '/': (e) => {
      e.preventDefault();
      document.querySelector<HTMLInputElement>('#search-input')?.focus();
    },
    '1': () => setFilterPreset('all'),
    '2': () => setFilterPreset('no-featured'),
    '3': () => setFilterPreset('zero-images'),
    '4': () => setFilterPreset('low-images'),
    '5': () => setFilterPreset('needs-work'),
  });

  const navigatePosts = useCallback((direction: 1 | -1) => {
    const currentIndex = focusedPostRef.current 
      ? filteredPosts.findIndex(p => p.id === focusedPostRef.current)
      : -1;
    const newIndex = Math.max(0, Math.min(filteredPosts.length - 1, currentIndex + direction));
    focusedPostRef.current = filteredPosts[newIndex]?.id || null;
    
    const rowIndex = Math.floor(newIndex / columnsCount);
    const targetScroll = rowIndex * rowHeight - containerHeight / 2;
    containerRef.current?.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }, [filteredPosts, columnsCount, rowHeight, containerHeight]);

  // ============================================================
  // STATE UPDATES - Surgical, non-blocking
  // ============================================================
  const updatePostState = useCallback((postId: number, updates: Partial<WordPressPost>) => {
    startTransition(() => {
      setPosts(prev => {
        const idx = prev.findIndex(p => p.id === postId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...updates };
        return next;
      });
    });
  }, []);

  // ============================================================
  // MEDIA LIBRARY HANDLERS - NEW
  // ============================================================
  const handleOpenMediaLibrary = useCallback((post: WordPressPost, mode: MediaInsertionMode = 'featured') => {
    setMediaLibraryPost(post);
    setMediaLibraryMode(mode);
  }, []);

  const handleMediaLibrarySelect = useCallback((items: MediaItem[], mode: MediaInsertionMode) => {
    console.log('Selected from Media Library:', items, mode);
    setMediaLibraryPost(null);
  }, []);

  // ============================================================
  // JOB PROCESSING - Featured Image Generation
  // ============================================================
  const processJob = useCallback(async (
    job: QueueJob<WordPressPost>,
    signal: AbortSignal
  ): Promise<void> => {
    const post = job.data;
    try {
      updatePostState(post.id, { status: 'generating_brief', statusMessage: 'Analyzing content...' });
      
      const brief = await generateImageBrief(post, config.ai.analysis, config.seo, signal);
      
      updatePostState(post.id, { status: 'generating_image', statusMessage: 'Synthesizing visual...' });
      const fullPrompt = `${brief.brief}. Style: ${config.image.style}`;
      const dataUrl = await generateImage(config.ai.image, fullPrompt, config.image, signal);

      updatePostState(post.id, { status: 'uploading', statusMessage: 'Uploading to WordPress...' });
      const fileExt = config.image.format.split('/')[1] || 'webp';
      const fileName = `${brief.filenameSlug}-${Date.now()}.${fileExt}`;
      const media = await uploadImage(config.wordpress, dataUrl, fileName, brief.altText, brief.caption, signal);

      updatePostState(post.id, { status: 'setting_featured', statusMessage: 'Setting featured image...' });
      await updatePost(config.wordpress, post.id, { featured_media: media.id }, signal);

      updatePostState(post.id, {
        status: 'success',
        statusMessage: 'Complete ✓',
        featured_media: media.id,
        existingImageUrl: media.source_url,
        generatedImage: {
          url: media.source_url,
          alt: brief.altText,
          mediaId: media.id,
          brief: brief.brief,
          caption: brief.caption,
          filenameSlug: brief.filenameSlug,
        },
      });

    } catch (error: any) {
      if (error.name === 'AbortError') {
        updatePostState(post.id, { status: 'cancelled', statusMessage: 'Cancelled' });
        return;
      }
      updatePostState(post.id, { status: 'error', statusMessage: error.message || 'Failed' });
      throw error;
    }
  }, [config, updatePostState]);

  const queue = useJobQueue<WordPressPost>({
    processor: processJob,
    concurrency: 3,
    onJobStart: (j) => {
      processingPostsRef.current.add(j.data.id);
    },
    onJobComplete: (j) => {
      processingPostsRef.current.delete(j.data.id);
    },
    onJobError: (j) => {
      processingPostsRef.current.delete(j.data.id);
    },
    onQueueEmpty: () => {
      onUpdatePosts(posts);
    },
  });

  // ============================================================
  // CONTENT IMAGE INSERTION
  // ============================================================
  const handleInsertImage = useCallback(async (
    post: WordPressPost,
    insertionPoint: InsertionPoint,
    imagePrompt: string
  ) => {
    try {
      updatePostState(post.id, { status: 'generating_image', statusMessage: 'Generating content image...' });
      
      const dataUrl = await generateImage(config.ai.image, imagePrompt, config.image);
      
      updatePostState(post.id, { status: 'uploading', statusMessage: 'Uploading image...' });
      const fileName = `content-image-${post.id}-${Date.now()}.webp`;
      const media = await uploadImage(config.wordpress, dataUrl, fileName, imagePrompt.slice(0, 100), '');

      updatePostState(post.id, { status: 'inserting', statusMessage: 'Inserting into content...' });
      await updatePostContent(config.wordpress, post.id, insertionPoint, media.source_url, imagePrompt);

      updatePostState(post.id, { 
        status: 'success', 
        statusMessage: 'Image inserted!',
        imageCount: post.imageCount + 1 
      });
      
      setInsertionPost(null);
    } catch (error: any) {
      updatePostState(post.id, { status: 'error', statusMessage: error.message });
    }
  }, [config, updatePostState]);

  // ============================================================
  // IMAGE UPLOAD HANDLER
  // ============================================================
  const handleUploadSuccess = useCallback((updatedPost: WordPressPost) => {
    updatePostState(updatedPost.id, updatedPost);
    setUploadPost(null);
  }, [updatePostState]);

  // ============================================================
  // ACTIONS
  // ============================================================
  const handleStartBulkGeneration = useCallback(() => {
    const targets = posts.filter(p => selectedPostIds.has(p.id));
    const jobs = targets.map(p => ({ 
      id: p.id, 
      data: p, 
      priority: p.featured_media === 0 ? 10 : 1 
    }));
    queue.addJobs(jobs);
    setIsModalOpen(true);
  }, [posts, selectedPostIds, queue]);

  const handleGenerateSingle = useCallback((post: WordPressPost) => {
    queue.addJob({ id: post.id, data: post });
    setIsModalOpen(true);
  }, [queue]);

  const handleSelectAll = useCallback(() => {
    startTransition(() => {
      if (selectedPostIds.size === filteredPosts.length) {
        setSelectedPostIds(new Set());
      } else {
        setSelectedPostIds(new Set(filteredPosts.map(p => p.id)));
      }
    });
  }, [filteredPosts, selectedPostIds.size]);

  const handleToggleSelect = useCallback((postId: number) => {
    startTransition(() => {
      setSelectedPostIds(prev => {
        const next = new Set(prev);
        if (next.has(postId)) {
          next.delete(postId);
        } else {
          next.add(postId);
        }
        return next;
      });
    });
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleFilterChange = useCallback((preset: FilterPreset) => {
    startTransition(() => {
      setFilterPreset(preset);
      setSelectedPostIds(new Set());
    });
  }, []);

  const handleExportReport = useCallback(() => {
    const report = {
      generatedAt: new Date().toISOString(),
      stats: appStats,
      posts: posts.map(p => ({
        id: p.id,
        title: p.title.rendered,
        link: p.link,
        hasFeaturedImage: p.featured_media > 0 || !!p.generatedImage,
        imageCount: p.imageCount,
        status: p.status,
      })),
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `image-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [posts, appStats]);

  const handleUpdateSinglePost = useCallback((updatedPost: WordPressPost) => {
      updatePostState(updatedPost.id, updatedPost);
  }, [updatePostState]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="animate-fade-in space-y-6">
      {/* Generation Modal */}
      {isModalOpen && (
        <GenerationModal
          posts={posts.filter(p => 
            processingPostsRef.current.has(p.id) || 
            p.status === 'success' || 
            p.status === 'error'
          )}
          queueState={queue.state}
          onClose={() => setIsModalOpen(false)}
          onCancelAll={queue.cancelAll}
          onPause={queue.pause}
          onResume={queue.resume}
        />
      )}

      {/* Image Gallery Modal */}
      {galleryPost && (
        <Suspense fallback={null}>
          <ImageGalleryModal
            post={galleryPost}
            config={config} 
            onClose={() => setGalleryPost(null)}
            onInsertImage={(point) => {
              setGalleryPost(null);
              setInsertionPost(galleryPost);
            }}
            onGenerateFeatured={() => {
              setGalleryPost(null);
              handleGenerateSingle(galleryPost);
            }}
            onPostUpdate={handleUpdateSinglePost}
          />
        </Suspense>
      )}

      {/* Image Insertion Modal */}
      {insertionPost && (
        <Suspense fallback={null}>
          <ImageInsertionModal
            post={insertionPost}
            config={config}
            onClose={() => setInsertionPost(null)}
            onInsert={handleInsertImage}
          />
        </Suspense>
      )}

      {/* Image Upload Modal */}
      {uploadPost && (
        <Suspense fallback={null}>
          <ImageUploadModal
            post={uploadPost}
            config={config}
            onClose={() => setUploadPost(null)}
            onSuccess={handleUploadSuccess}
          />
        </Suspense>
      )}

      {/* Media Library Browser Modal - NEW */}
      {mediaLibraryPost && (
        <Suspense fallback={null}>
          <MediaLibraryBrowser
            config={config}
            post={mediaLibraryPost}
            mode={mediaLibraryMode}
            multiSelect={false}
            onClose={() => setMediaLibraryPost(null)}
            onSelect={handleMediaLibrarySelect}
            onPostUpdate={handleUpdateSinglePost}
          />
        </Suspense>
      )}

      {/* Bulk Actions Modal */}
      {showBulkActions && selectedPostIds.size > 0 && (
        <Suspense fallback={null}>
          <BulkActionsModal
            selectedPosts={posts.filter(p => selectedPostIds.has(p.id))}
            onClose={() => setShowBulkActions(false)}
            onGenerateAll={handleStartBulkGeneration}
            onExport={handleExportReport}
          />
        </Suspense>
      )}

      <div className="bg-surface rounded-3xl shadow-2xl shadow-brand-primary/5 border border-border overflow-hidden">
        {/* Header */}
        <header className="p-6 border-b border-border relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-brand-primary/3 to-brand-secondary/3" />
          <div className="relative flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-1 bg-gradient-to-b from-brand-primary to-brand-secondary rounded-full" />
              <div>
                <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
                  Image Command Center
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  {totalCount} Posts • Generate AI images, upload, or browse media library
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleExportReport}
                className="flex items-center gap-2 px-3.5 py-2 text-[11px] font-semibold rounded-xl bg-surface border border-border hover:border-brand-primary/40 hover:text-brand-primary transition-all"
              >
                <DownloadIcon className="w-3.5 h-3.5" />
                Export
              </button>
              <button 
                onClick={onBackToConfig} 
                className="flex items-center gap-2 px-3.5 py-2 text-[11px] font-semibold rounded-xl bg-surface border border-border hover:border-brand-primary/40 hover:text-brand-primary transition-all"
              >
                <RefreshCwIcon className="w-3.5 h-3.5" />
                Rescan
              </button>
              <button 
                onClick={onReset} 
                className="px-3.5 py-2 text-[11px] font-semibold rounded-xl text-danger border border-danger/20 hover:bg-danger/8 transition-all"
              >
                Reset
              </button>
            </div>
          </div>
        </header>

        {/* Stats Bar */}
        <StatsBar stats={appStats} onFilterClick={handleFilterChange} activeFilter={filterPreset} />

        {/* Filter Bar */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          filterPreset={filterPreset}
          onFilterChange={handleFilterChange}
          sortBy={sortBy}
          onSortChange={setSortBy}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectedCount={selectedPostIds.size}
          filteredCount={filteredCount}
          onSelectAll={handleSelectAll}
          onBulkActions={() => setShowBulkActions(true)}
          isProcessing={queue.state.isProcessing}
          onStartGeneration={handleStartBulkGeneration}
          isPending={isPending}
        />

        {/* Virtualized Grid */}
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          className="relative overflow-auto bg-surface-muted/20"
          style={{ height: 'calc(100vh - 420px)', minHeight: '500px' }}
        >
          {/* Scroll Spacer */}
          <div style={{ height: totalHeight, position: 'relative' }}>
            {/* Positioned Grid */}
            <div 
              className={`
                absolute left-0 right-0 p-6
                ${viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6' : ''}
                ${viewMode === 'list' ? 'flex flex-col gap-3' : ''}
                ${viewMode === 'compact' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4' : ''}
              `}
              style={{ 
                transform: `translateY(${visibleRange.offsetY}px)`,
              }}
            >
              {visiblePosts.map(post => (
                <ErrorBoundary key={post.id} fallback={<PostCardSkeleton />}>
                  <PostCard
                    post={post}
                    isSelected={selectedPostIds.has(post.id)}
                    isFocused={focusedPostRef.current === post.id}
                    onToggleSelect={() => handleToggleSelect(post.id)}
                    onGenerate={() => handleGenerateSingle(post)}
                    onViewGallery={() => setGalleryPost(post)}
                    onInsertImage={() => setInsertionPost(post)}
                    onUploadImage={() => setUploadPost(post)}
                    onBrowseMediaLibrary={() => handleOpenMediaLibrary(post, 'featured')}
                    isProcessing={processingPostsRef.current.has(post.id)}
                    viewMode={viewMode}
                  />
                </ErrorBoundary>
              ))}
            </div>
          </div>

          {/* Empty State */}
          {filteredPosts.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <FilterIcon className="w-16 h-16 mb-4 text-muted opacity-50" />
              <p className="font-bold text-lg text-text-primary mb-2">
                {searchQuery ? 'No matching posts found' : 'No posts in this filter'}
              </p>
              <p className="text-sm text-muted mb-4">
                {searchQuery ? 'Try a different search term' : 'Try selecting a different filter'}
              </p>
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 text-sm font-medium text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors"
                >
                  Clear search
                </button>
              )}
            </div>
          )}

          {/* Scroll to Top Button */}
          {showScrollTop && (
            <button
              onClick={scrollToTop}
              className="fixed bottom-8 right-8 p-3 bg-brand-primary text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all z-50"
              aria-label="Scroll to top"
            >
              <ChevronUpIcon className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Footer Stats */}
        <div className="p-3.5 bg-surface-muted/40 border-t border-border flex items-center justify-between text-[11px] text-muted">
          <div className="flex items-center gap-3">
            <span className="font-medium">
              Showing {visiblePosts.length} of {filteredCount} posts
              {filteredCount !== totalCount && ` (from ${totalCount})`}
            </span>
            {queue.state.isProcessing && (
              <span className="flex items-center gap-1.5 text-brand-primary font-semibold">
                <Loader className="w-3 h-3 animate-spin" />
                {queue.state.activeJobs} jobs
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {[
              ['M', 'Media'],
              ['U', 'Upload'],
              ['G', 'Gallery'],
              ['Space', 'Select'],
            ].map(([key, label]) => (
              <span key={key} className="hidden sm:inline">
                <kbd className="px-1.5 py-0.5 bg-surface rounded-md border border-border text-[9px] font-mono">{key}</kbd> {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ResultsStep);
