// components/MediaLibraryBrowser.tsx - SOTA Enterprise Media Library Browser
// Features: Infinite Scroll, Virtual Grid, Instant Selection, Direct Actions

import React, { 
  useState, 
  useCallback, 
  useEffect, 
  useMemo, 
  useRef,
  useTransition,
  memo
} from 'react';
import { 
  MediaItem, 
  MediaLibraryFilters, 
  WordPressPost, 
  Configuration, 
  InsertionPoint,
  MediaInsertionMode 
} from '../types';
import { 
  fetchMediaLibrary, 
  updateMediaItem, 
  deleteMediaItem,
  updatePost,
  updatePostContent 
} from '../services/wordpressService';
import {
  XIcon,
  ImageIcon,
  SearchIcon,
  GridIcon,
  ListIcon,
  CheckCircle2,
  Loader,
  AlertTriangle,
  TrashIcon,
  EditIcon,
  ExternalLinkIcon,
  DownloadIcon,
  ZoomInIcon,
  RefreshCwIcon,
  SparklesIcon,
  InfoIcon,
  FileIcon,
  FolderOpenIcon,
  PlusCircleIcon,
} from './icons/Icons';

// ============================================================
// TYPES
// ============================================================

interface Props {
  config: Configuration;
  post?: WordPressPost;
  mode: MediaInsertionMode;
  insertionPoint?: InsertionPoint;
  multiSelect?: boolean;
  onClose: () => void;
  onSelect: (items: MediaItem[], mode: MediaInsertionMode) => void;
  onPostUpdate?: (post: WordPressPost) => void;
}

type ViewMode = 'grid' | 'list';
type SortOption = 'date' | 'title' | 'id';

// ============================================================
// CONSTANTS
// ============================================================

const ITEMS_PER_PAGE = 48; // Load more items per batch for smoother scrolling
const LOAD_MORE_THRESHOLD = 300; // px from bottom to trigger load more
const THUMBNAIL_SIZES = ['medium', 'thumbnail', 'medium_large'] as const;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

const getImageThumbnail = (item: MediaItem): string => {
  // Try different thumbnail sizes for fastest loading
  for (const size of THUMBNAIL_SIZES) {
    if (item.media_details?.sizes?.[size]?.source_url) {
      return item.media_details.sizes[size].source_url;
    }
  }
  return item.source_url;
};

const getMediumImage = (item: MediaItem): string => {
  return item.media_details?.sizes?.medium_large?.source_url 
    || item.media_details?.sizes?.large?.source_url 
    || item.source_url;
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

// Optimized Media Item Card with Lazy Loading
const MediaItemCard = memo<{
  item: MediaItem;
  isSelected: boolean;
  viewMode: ViewMode;
  onSelect: () => void;
  onDoubleClick: () => void;
  onPreview: () => void;
}>(({ item, isSelected, viewMode, onSelect, onDoubleClick, onPreview }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  
  const isImage = item.media_type === 'image';
  const thumbnail = getImageThumbnail(item);
  const dimensions = item.media_details ? 
    `${item.media_details.width} × ${item.media_details.height}` : 'N/A';

  // Intersection Observer for lazy loading
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !isImage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            img.src = thumbnail;
            observer.unobserve(img);
          }
        });
      },
      { rootMargin: '200px' }
    );

    observer.observe(img);
    return () => observer.disconnect();
  }, [thumbnail, isImage]);

  if (viewMode === 'list') {
    return (
      <div 
        className={`
          flex items-center gap-4 p-3 bg-surface rounded-xl border transition-all cursor-pointer
          ${isSelected 
            ? 'border-brand-primary ring-2 ring-brand-primary/20 bg-brand-primary/5' 
            : 'border-border hover:border-brand-primary/40 hover:bg-surface-muted/50'
          }
        `}
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
      >
        <div className="w-14 h-14 rounded-lg overflow-hidden bg-surface-muted flex-shrink-0">
          {isImage ? (
            <img 
              ref={imgRef}
              alt={item.alt_text || item.title.rendered} 
              className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileIcon className="w-5 h-5 text-muted" />
            </div>
          )}
          {!imageLoaded && !imageError && isImage && (
            <div className="absolute inset-0 bg-surface-muted animate-pulse" />
          )}
        </div>

        <div className="flex-grow min-w-0">
          <h4 className="font-semibold text-text-primary truncate text-sm">
            {item.title.rendered || item.slug}
          </h4>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted">
            <span>{dimensions}</span>
            <span>•</span>
            <span>{formatFileSize(item.media_details?.filesize)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button 
            onClick={(e) => { e.stopPropagation(); onPreview(); }}
            className="p-1.5 rounded-lg hover:bg-surface-muted text-muted hover:text-text-primary transition-colors"
            title="Preview"
          >
            <ZoomInIcon className="w-4 h-4" />
          </button>
          <div className={`
            w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
            ${isSelected 
              ? 'bg-brand-primary border-brand-primary text-white' 
              : 'border-border bg-surface'
            }
          `}>
            {isSelected && <CheckCircle2 className="w-3 h-3" />}
          </div>
        </div>
      </div>
    );
  }

  // Grid View - Optimized for fast scrolling
  return (
    <div 
      className={`
        group relative bg-surface rounded-xl overflow-hidden border transition-all cursor-pointer
        ${isSelected 
          ? 'border-brand-primary ring-2 ring-brand-primary/20 scale-[1.02] z-10' 
          : 'border-border/60 hover:border-brand-primary/40 hover:shadow-lg'
        }
      `}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    >
      <div className="aspect-square relative overflow-hidden bg-surface-muted">
        {isImage ? (
          <>
            <img 
              ref={imgRef}
              alt={item.alt_text || item.title.rendered} 
              className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              loading="lazy"
            />
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 bg-surface-muted animate-pulse" />
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileIcon className="w-10 h-10 text-muted" />
          </div>
        )}

        {/* Selection Indicator */}
        <div className={`
          absolute inset-0 flex items-center justify-center transition-all pointer-events-none
          ${isSelected ? 'bg-brand-primary/20' : 'bg-black/0 group-hover:bg-black/20'}
        `}>
          <div className={`
            w-7 h-7 rounded-lg border-2 flex items-center justify-center backdrop-blur-sm transition-all
            ${isSelected 
              ? 'bg-brand-primary border-brand-primary text-white scale-110' 
              : 'bg-white/80 border-white/50 opacity-0 group-hover:opacity-100'
            }
          `}>
            {isSelected ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-2.5 h-2.5 rounded-sm border-2 border-gray-600" />}
          </div>
        </div>

        {/* Quick Preview Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100"
          title="Preview"
        >
          <ZoomInIcon className="w-3.5 h-3.5" />
        </button>

        {/* File Type Badge */}
        <div className="absolute bottom-2 left-2">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-black/50 backdrop-blur-md text-white">
            {item.mime_type.split('/')[1]}
          </span>
        </div>
      </div>

      {/* Compact Info Footer */}
      <div className="p-2 border-t border-border/50">
        <h4 className="text-[11px] font-semibold text-text-primary truncate" title={item.title.rendered}>
          {item.title.rendered || item.slug}
        </h4>
        <div className="flex items-center justify-between mt-0.5 text-[9px] text-muted">
          <span>{dimensions}</span>
          <span>{formatFileSize(item.media_details?.filesize)}</span>
        </div>
      </div>
    </div>
  );
});

MediaItemCard.displayName = 'MediaItemCard';

// Image Preview Modal - Optimized
const ImagePreviewModal = memo<{
  item: MediaItem;
  onClose: () => void;
  onSelect: () => void;
  mode: MediaInsertionMode;
}>(({ item, onClose, onSelect, mode }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') { onSelect(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onSelect]);

  return (
    <div 
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <button 
        className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
        onClick={onClose}
      >
        <XIcon className="w-6 h-6 text-white" />
      </button>
      
      <div className="flex flex-col items-center max-w-full max-h-full">
        <img 
          src={getMediumImage(item)}
          alt={item.alt_text || item.title.rendered}
          className="max-w-full max-h-[70vh] object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
        
        {/* Quick Action Bar */}
        <div className="mt-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { onSelect(); onClose(); }}
            className="flex items-center gap-2 px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 transition-colors"
          >
            <CheckCircle2 className="w-5 h-5" />
            {mode === 'featured' ? 'Set as Featured Image' : 'Insert This Image'}
          </button>
        </div>
        
        <div className="mt-4 text-center">
          <p className="text-white font-medium">{item.title.rendered}</p>
          <p className="text-white/60 text-sm mt-1">
            {item.media_details?.width} × {item.media_details?.height} • {formatFileSize(item.media_details?.filesize)}
          </p>
          {item.alt_text && (
            <p className="text-white/40 text-xs mt-1 max-w-md">Alt: {item.alt_text}</p>
          )}
        </div>
      </div>
    </div>
  );
});

ImagePreviewModal.displayName = 'ImagePreviewModal';

// Loading Skeleton Grid
const LoadingSkeleton = memo<{ count: number; viewMode: ViewMode }>(({ count, viewMode }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div 
        key={i} 
        className={`
          bg-surface rounded-xl border border-border overflow-hidden animate-pulse
          ${viewMode === 'list' ? 'flex items-center gap-4 p-3' : ''}
        `}
      >
        {viewMode === 'list' ? (
          <>
            <div className="w-14 h-14 rounded-lg bg-surface-muted flex-shrink-0" />
            <div className="flex-grow space-y-2">
              <div className="h-4 bg-surface-muted rounded w-3/4" />
              <div className="h-3 bg-surface-muted rounded w-1/2" />
            </div>
          </>
        ) : (
          <>
            <div className="aspect-square bg-surface-muted" />
            <div className="p-2 space-y-1">
              <div className="h-3 bg-surface-muted rounded w-3/4" />
              <div className="h-2 bg-surface-muted rounded w-1/2" />
            </div>
          </>
        )}
      </div>
    ))}
  </>
));

LoadingSkeleton.displayName = 'LoadingSkeleton';

// ============================================================
// MAIN COMPONENT
// ============================================================

const MediaLibraryBrowser: React.FC<Props> = ({
  config,
  post,
  mode,
  insertionPoint,
  multiSelect = false,
  onClose,
  onSelect,
  onPostUpdate,
}) => {
  // ============================================================
  // STATE
  // ============================================================
  
  // Data state
  const [items, setItems] = useState<MediaItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [mediaType, setMediaType] = useState<'all' | 'image' | 'video' | 'audio'>('image');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  // Derived state
  const selectedItems = useMemo(() => 
    items.filter(item => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  // ============================================================
  // DATA FETCHING
  // ============================================================
  
  const fetchItems = useCallback(async (page: number = 1, append: boolean = false) => {
    if (page === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);
    
    try {
      const result = await fetchMediaLibrary(
        config.wordpress,
        page,
        ITEMS_PER_PAGE,
        {
          search: searchQuery,
          mediaType,
          dateRange,
          orderBy: sortBy,
          order: sortOrder,
        }
      );
      
      startTransition(() => {
        if (append) {
          setItems(prev => {
            // Dedupe items
            const existingIds = new Set(prev.map(i => i.id));
            const newItems = result.items.filter(i => !existingIds.has(i.id));
            return [...prev, ...newItems];
          });
        } else {
          setItems(result.items);
          setSelectedIds(new Set());
        }
        setTotalItems(result.total);
        setCurrentPage(page);
        setHasMore(page < result.totalPages);
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load media library');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [config.wordpress, searchQuery, mediaType, dateRange, sortBy, sortOrder]);

  // Initial load
  useEffect(() => {
    fetchItems(1);
  }, []);

  // Refetch on filter changes (debounced for search)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      fetchItems(1);
    }, searchQuery ? 300 : 0);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, mediaType, dateRange, sortBy, sortOrder]);

  // ============================================================
  // INFINITE SCROLL - Mouse wheel friendly
  // ============================================================
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isLoadingMore || !hasMore) return;
      
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      if (distanceFromBottom < LOAD_MORE_THRESHOLD) {
        fetchItems(currentPage + 1, true);
      }
    };

    // Throttled scroll handler for better performance
    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener('scroll', throttledScroll, { passive: true });
    return () => container.removeEventListener('scroll', throttledScroll);
  }, [currentPage, hasMore, isLoadingMore, fetchItems]);

  // Also use Intersection Observer as backup
  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          fetchItems(currentPage + 1, true);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [currentPage, hasMore, isLoadingMore, fetchItems]);

  // ============================================================
  // SELECTION HANDLERS
  // ============================================================
  
  const handleSelectItem = useCallback((item: MediaItem) => {
    if (multiSelect) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
        return next;
      });
    } else {
      setSelectedIds(new Set([item.id]));
    }
  }, [multiSelect]);

  const handleDoubleClick = useCallback((item: MediaItem) => {
    // Double click = instant select and apply
    setSelectedIds(new Set([item.id]));
    // Trigger apply after state update
    setTimeout(() => {
      handleApplySelection([item]);
    }, 0);
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map(i => i.id)));
    }
  }, [items, selectedIds.size]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ============================================================
  // APPLY SELECTION
  // ============================================================
  
  const handleApplySelection = useCallback(async (itemsToApply?: MediaItem[]) => {
    const applyItems = itemsToApply || selectedItems;
    if (applyItems.length === 0) return;
    
    setIsApplying(true);
    
    try {
      if (post && onPostUpdate) {
        const selectedItem = applyItems[0];
        
        if (mode === 'featured') {
          await updatePost(config.wordpress, post.id, {
            featured_media: selectedItem.id,
          });
          
          onPostUpdate({
            ...post,
            featured_media: selectedItem.id,
            existingImageUrl: selectedItem.source_url,
            status: 'success',
            statusMessage: 'Featured image updated!',
          });
        } else if (mode === 'content' && insertionPoint) {
          await updatePostContent(
            config.wordpress,
            post.id,
            insertionPoint,
            selectedItem.source_url,
            selectedItem.alt_text || selectedItem.title.rendered
          );
          
          onPostUpdate({
            ...post,
            imageCount: (post.imageCount || 0) + 1,
            status: 'success',
            statusMessage: 'Image inserted!',
          });
        }
      }
      
      onSelect(applyItems, mode);
      onClose();
    } catch (error: any) {
      setError(error.message || 'Failed to apply selection');
      setIsApplying(false);
    }
  }, [selectedItems, post, mode, insertionPoint, config.wordpress, onPostUpdate, onSelect, onClose]);

  // ============================================================
  // KEYBOARD SHORTCUTS
  // ============================================================
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        if (previewItem) {
          setPreviewItem(null);
        } else {
          onClose();
        }
        return;
      }
      
      // / to focus search
      if (e.key === '/' && e.target !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      
      // Enter to apply selection
      if (e.key === 'Enter' && selectedIds.size > 0 && !previewItem) {
        e.preventDefault();
        handleApplySelection();
        return;
      }
      
      // Ctrl/Cmd + A to select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && multiSelect) {
        e.preventDefault();
        handleSelectAll();
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, previewItem, selectedIds.size, handleApplySelection, handleSelectAll, multiSelect]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ============================================================
  // RENDER
  // ============================================================
  
  const gridColumnsClass = viewMode === 'grid' 
    ? 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3'
    : 'flex flex-col gap-2';

  return (
    <div className="fixed inset-0 bg-background/98 backdrop-blur-xl flex z-[100] animate-fade-in">
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header - Compact */}
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary/10 rounded-xl">
              <FolderOpenIcon className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h2 className="text-lg font-black text-text-primary tracking-tight">Media Library</h2>
              <p className="text-[11px] text-muted">
                {totalItems.toLocaleString()} items
                {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
                {' • '}{mode === 'featured' ? 'Select featured image' : 'Select image to insert'}
              </p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-muted transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </header>

        {/* Toolbar - Compact */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-surface-muted/30 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-grow max-w-sm">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search... (Press /)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-brand-primary outline-none"
            />
            {isPending && (
              <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-brand-primary" />
            )}
          </div>

          {/* Compact Filters */}
          <div className="flex items-center gap-2">
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as any)}
              className="bg-surface border border-border rounded-lg px-2.5 py-2 text-xs font-medium focus:ring-2 focus:ring-brand-primary outline-none"
            >
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="all">All</option>
            </select>

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split('-');
                setSortBy(by as SortOption);
                setSortOrder(order as 'asc' | 'desc');
              }}
              className="bg-surface border border-border rounded-lg px-2.5 py-2 text-xs font-medium focus:ring-2 focus:ring-brand-primary outline-none"
            >
              <option value="date-desc">Newest</option>
              <option value="date-asc">Oldest</option>
              <option value="title-asc">A-Z</option>
              <option value="title-desc">Z-A</option>
            </select>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-surface rounded-lg border border-border">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-brand-primary text-white' : 'text-muted hover:text-text-primary'}`}
              title="Grid view"
            >
              <GridIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-brand-primary text-white' : 'text-muted hover:text-text-primary'}`}
              title="List view"
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchItems(1)}
            disabled={isLoading}
            className="p-2 bg-surface border border-border rounded-lg hover:border-brand-primary text-muted hover:text-brand-primary disabled:opacity-50 transition-all"
            title="Refresh"
          >
            <RefreshCwIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Selection Bar */}
        {selectedIds.size > 0 && (
          <div className="flex-shrink-0 px-4 py-2 bg-brand-primary/5 border-b border-brand-primary/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-brand-primary">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleClearSelection}
                className="text-xs font-medium text-brand-primary hover:underline"
              >
                Clear
              </button>
              {multiSelect && (
                <button
                  onClick={handleSelectAll}
                  className="text-xs font-medium text-brand-primary hover:underline"
                >
                  {selectedIds.size === items.length ? 'Deselect all' : 'Select all visible'}
                </button>
              )}
            </div>
            
            {/* Quick Apply Button in Selection Bar */}
            <button
              onClick={() => handleApplySelection()}
              disabled={isApplying}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 disabled:opacity-50 transition-colors"
            >
              {isApplying ? <Loader className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              {mode === 'featured' ? 'Set Featured' : 'Insert'}
            </button>
          </div>
        )}

        {/* Content Area - Scrollable with Infinite Scroll */}
        <div 
          ref={containerRef} 
          className="flex-1 overflow-y-auto p-4 scroll-smooth"
          style={{ scrollBehavior: 'smooth' }}
        >
          {/* Loading State - Initial */}
          {isLoading && items.length === 0 && (
            <div className={gridColumnsClass}>
              <LoadingSkeleton count={ITEMS_PER_PAGE} viewMode={viewMode} />
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center h-64">
              <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
              <p className="text-red-500 font-medium mb-2">Failed to load media</p>
              <p className="text-sm text-muted mb-4">{error}</p>
              <button
                onClick={() => fetchItems(1)}
                className="px-4 py-2 bg-brand-primary text-white rounded-xl font-medium"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64">
              <ImageIcon className="w-16 h-16 text-muted/50 mb-4" />
              <p className="text-lg font-bold text-text-primary mb-2">No media found</p>
              <p className="text-sm text-muted mb-4">
                {searchQuery ? 'Try a different search term' : 'Upload some images to get started'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-sm font-medium text-brand-primary hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          )}

          {/* Media Grid/List - Optimized for scrolling */}
          {!isLoading && items.length > 0 && (
            <>
              <div className={gridColumnsClass}>
                {items.map(item => (
                  <MediaItemCard
                    key={item.id}
                    item={item}
                    isSelected={selectedIds.has(item.id)}
                    viewMode={viewMode}
                    onSelect={() => handleSelectItem(item)}
                    onDoubleClick={() => handleDoubleClick(item)}
                    onPreview={() => setPreviewItem(item)}
                  />
                ))}
              </div>

              {/* Load More Trigger - For infinite scroll */}
              <div 
                ref={loadMoreTriggerRef} 
                className="h-20 flex items-center justify-center mt-4"
              >
                {isLoadingMore && (
                  <div className="flex items-center gap-3">
                    <Loader className="w-5 h-5 text-brand-primary animate-spin" />
                    <span className="text-sm text-muted">Loading more...</span>
                  </div>
                )}
                {!hasMore && items.length > 0 && (
                  <span className="text-sm text-muted">
                    All {totalItems.toLocaleString()} items loaded
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions - Sticky */}
        <footer className="flex-shrink-0 px-4 py-3 border-t border-border bg-surface flex items-center justify-between">
          <div className="text-xs text-muted">
            {mode === 'featured' && post && (
              <span>Setting featured image for: <strong className="text-text-primary">{post.title.rendered}</strong></span>
            )}
            {mode === 'content' && post && (
              <span>Inserting image into: <strong className="text-text-primary">{post.title.rendered}</strong></span>
            )}
            <span className="ml-3 text-muted/60">Double-click to quick select</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium bg-surface border border-border rounded-xl hover:border-brand-primary transition-colors"
            >
              Cancel
            </button>
            
            <button
              onClick={() => handleApplySelection()}
              disabled={selectedIds.size === 0 || isApplying}
              className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-brand-primary text-white rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isApplying ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {mode === 'featured' ? 'Set as Featured' : 
               mode === 'content' ? 'Insert Image' : 
               `Select${selectedIds.size > 1 ? ` (${selectedIds.size})` : ''}`}
            </button>
          </div>
        </footer>
      </div>

      {/* Preview Modal */}
      {previewItem && (
        <ImagePreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onSelect={() => handleSelectItem(previewItem)}
          mode={mode}
        />
      )}
    </div>
  );
};

export default MediaLibraryBrowser;
