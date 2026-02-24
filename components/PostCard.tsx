// components/PostCard.tsx - Enhanced with Upload & Media Library buttons

import React, { memo, useCallback } from 'react';
import { WordPressPost, JobStatus } from '../types';
import { 
  ImageIcon, 
  SparklesIcon, 
  ExternalLinkIcon, 
  CheckCircle2,
  AlertTriangle,
  Loader,
  GalleryIcon,
  PlusCircleIcon,
  EyeIcon,
  UploadCloudIcon,
  FolderOpenIcon,
} from './icons/Icons';

interface Props {
  post: WordPressPost;
  isSelected: boolean;
  isFocused?: boolean;
  isProcessing?: boolean;
  onToggleSelect: () => void;
  onGenerate: () => void;
  onViewGallery: () => void;
  onInsertImage: () => void;
  onUploadImage: () => void;
  onBrowseMediaLibrary: () => void;
  viewMode?: 'grid' | 'list' | 'compact';
}

const stripHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
};

const StatusBadge: React.FC<{ status?: JobStatus; message?: string }> = memo(({ status, message }) => {
  if (!status || status === 'idle') return null;

  const configs: Record<string, { bg: string; text: string; icon?: React.ReactNode }> = {
    success: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', icon: <CheckCircle2 className="w-3 h-3" /> },
    error: { bg: 'bg-red-500/10', text: 'text-red-500', icon: <AlertTriangle className="w-3 h-3" /> },
    cancelled: { bg: 'bg-amber-500/10', text: 'text-amber-600' },
  };

  const config = configs[status] || { 
    bg: 'bg-brand-primary/10', 
    text: 'text-brand-primary',
    icon: <Loader className="w-3 h-3 animate-spin" />
  };

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold ${config.bg} ${config.text}`}>
      {config.icon}
      <span className="truncate">{message || status}</span>
    </div>
  );
});

const ImageCountBadge: React.FC<{ count: number; hasFeatured: boolean }> = memo(({ count, hasFeatured }) => {
  let colorClass = 'bg-emerald-500/10 text-emerald-600';
  if (count === 0) colorClass = 'bg-red-500/10 text-red-500';
  else if (count < 3) colorClass = 'bg-orange-500/10 text-orange-500';
  
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold ${colorClass}`}>
      <ImageIcon className="w-3 h-3" />
      <span>{count}</span>
      {!hasFeatured && <span className="text-amber-500">• No featured</span>}
    </div>
  );
});

const PostCard: React.FC<Props> = memo(({ 
  post, 
  isSelected,
  isFocused = false,
  isProcessing = false,
  onToggleSelect, 
  onGenerate,
  onViewGallery,
  onInsertImage,
  onUploadImage,
  onBrowseMediaLibrary,
  viewMode = 'grid'
}) => {
  const needsImage = post.featured_media === 0 && !post.generatedImage;
  const displayImageUrl = post.generatedImage?.url || post.existingImageUrl;
  const isPending = isProcessing || (post.status && !['idle', 'success', 'error', 'cancelled'].includes(post.status));
  const title = stripHtml(post.title.rendered);
  const hasFeatured = post.featured_media > 0 || !!post.generatedImage;

  const handleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onToggleSelect();
  }, [onToggleSelect]);

  // List View
  if (viewMode === 'list') {
    return (
      <article 
        className={`
          flex items-center gap-4 p-4 bg-surface rounded-xl border transition-all cursor-pointer
          ${isSelected ? 'border-brand-primary ring-2 ring-brand-primary/20' : 'border-border hover:border-brand-primary/40'}
          ${isFocused ? 'ring-2 ring-brand-secondary' : ''}
        `}
        onClick={handleClick}
      >
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-surface-muted flex-shrink-0">
          {displayImageUrl ? (
            <img src={displayImageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-muted" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-grow min-w-0">
          <h3 className="font-semibold text-text-primary truncate">{title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <ImageCountBadge count={post.imageCount} hasFeatured={hasFeatured} />
            {post.status && post.status !== 'idle' && (
              <StatusBadge status={post.status} message={post.statusMessage} />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onViewGallery} className="p-2 rounded-lg hover:bg-surface-muted" title="View images">
            <GalleryIcon className="w-4 h-4" />
          </button>
          <button onClick={onInsertImage} className="p-2 rounded-lg hover:bg-surface-muted" title="Insert image">
            <PlusCircleIcon className="w-4 h-4" />
          </button>
          <button onClick={onBrowseMediaLibrary} className="p-2 rounded-lg hover:bg-surface-muted text-purple-500" title="Media Library">
            <FolderOpenIcon className="w-4 h-4" />
          </button>
          <button onClick={onUploadImage} className="p-2 rounded-lg hover:bg-surface-muted text-brand-secondary" title="Upload image">
            <UploadCloudIcon className="w-4 h-4" />
          </button>
          <button 
            onClick={onGenerate} 
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-primary text-white disabled:opacity-50"
          >
            {isPending ? <Loader className="w-3 h-3 animate-spin" /> : 'Generate'}
          </button>
        </div>
      </article>
    );
  }

  // Grid/Compact View
  return (
    <article 
      className={`
        relative bg-surface rounded-2xl overflow-hidden border transition-all duration-200 
        flex flex-col group cursor-pointer
        ${isSelected 
          ? 'border-brand-primary ring-2 ring-brand-primary/20 shadow-xl scale-[1.02]' 
          : 'border-border/60 hover:border-brand-primary/40 hover:shadow-lg'
        }
        ${isFocused ? 'ring-2 ring-brand-secondary' : ''}
        ${viewMode === 'compact' ? 'text-xs' : ''}
      `}
      onClick={handleClick}
    >
      {/* Image Section */}
      <div className={`relative overflow-hidden bg-surface-muted/50 ${viewMode === 'compact' ? 'aspect-square' : 'aspect-[4/3]'}`}>
        {/* Selection Overlay */}
        <div 
          className={`
            absolute inset-0 z-10 flex items-center justify-center transition-opacity
            ${isSelected ? 'bg-brand-primary/10 opacity-100' : 'bg-black/30 opacity-0 group-hover:opacity-100'}
          `}
        >
          <div className={`
            h-8 w-8 rounded-lg border-2 flex items-center justify-center backdrop-blur-sm transition-all
            ${isSelected ? 'bg-brand-primary border-brand-primary text-white scale-110' : 'bg-white/20 border-white/50 text-white'}
          `}>
            {isSelected ? <CheckCircle2 className="w-5 h-5" /> : <div className="h-3 w-3 rounded-sm border-2 border-white/50" />}
          </div>
        </div>

        {/* Image Count Badge */}
        <div className="absolute top-2 left-2 z-20">
          <div className={`
            flex items-center gap-1 px-2 py-1 rounded-lg backdrop-blur-md text-[10px] font-bold
            ${post.imageCount === 0 ? 'bg-red-500/80 text-white' : post.imageCount < 3 ? 'bg-orange-500/80 text-white' : 'bg-black/50 text-white'}
          `}>
            <ImageIcon className="w-3 h-3" />
            <span>{post.imageCount}</span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.stopPropagation(); onViewGallery(); }}
            className="p-1.5 rounded-lg bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition-colors"
            title="View all images (G)"
          >
            <EyeIcon className="w-4 h-4" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onInsertImage(); }}
            className="p-1.5 rounded-lg bg-black/50 backdrop-blur-md text-white hover:bg-black/70 transition-colors"
            title="Insert AI image (I)"
          >
            <PlusCircleIcon className="w-4 h-4" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onBrowseMediaLibrary(); }}
            className="p-1.5 rounded-lg bg-purple-500/80 backdrop-blur-md text-white hover:bg-purple-500 transition-colors"
            title="Media Library (M)"
          >
            <FolderOpenIcon className="w-4 h-4" />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onUploadImage(); }}
            className="p-1.5 rounded-lg bg-brand-secondary/80 backdrop-blur-md text-white hover:bg-brand-secondary transition-colors"
            title="Upload image (U)"
          >
            <UploadCloudIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Processing Indicator */}
        {isPending && (
          <div className="absolute bottom-2 right-2 bg-brand-primary p-2 rounded-lg z-20 shadow-lg">
            <Loader className="w-4 h-4 text-white animate-spin" />
          </div>
        )}

        {/* No Featured Image Badge */}
        {needsImage && (
          <div className="absolute bottom-2 left-2 z-20">
            <div className="px-2 py-1 rounded-lg bg-amber-500/90 backdrop-blur-md text-white text-[10px] font-bold">
              No Featured
            </div>
          </div>
        )}

        {/* Image or Placeholder */}
        {displayImageUrl ? (
          <img
            src={displayImageUrl}
            alt={post.generatedImage?.alt || post.existingImageAltText || title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 opacity-50 group-hover:opacity-70 transition-opacity">
            <ImageIcon className="w-10 h-10 text-muted mb-2" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted">No Featured Image</p>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className={`flex-grow flex flex-col ${viewMode === 'compact' ? 'p-2' : 'p-4'} gap-2`}>
        {/* Title */}
        <a
          href={post.link}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-bold text-text-primary hover:text-brand-primary line-clamp-2 leading-tight flex items-start gap-1 transition-colors ${viewMode === 'compact' ? 'text-xs' : 'text-sm'}`}
          onClick={e => e.stopPropagation()}
        >
          <span className="flex-1">{title}</span>
          <ExternalLinkIcon className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
        </a>

        {/* Status */}
        {post.status && post.status !== 'idle' && (
          <StatusBadge status={post.status} message={post.statusMessage} />
        )}
      </div>

      {/* Action Footer */}
      {viewMode !== 'compact' && (
        <div className="p-3 bg-surface-muted/30 border-t border-border/50 mt-auto">
          <div className="flex gap-2">
            {/* Media Library Button */}
            <button
              disabled={isPending}
              onClick={(e) => { e.stopPropagation(); onBrowseMediaLibrary(); }}
              className={`
                flex items-center justify-center gap-1 py-2 px-2 rounded-xl 
                text-xs font-bold transition-all
                ${isPending
                  ? 'bg-surface-muted text-muted cursor-not-allowed'
                  : 'text-purple-600 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20'
                }
              `}
              title="Browse Media Library"
            >
              <FolderOpenIcon className="w-4 h-4" />
            </button>
            
            {/* Upload Button */}
            <button
              disabled={isPending}
              onClick={(e) => { e.stopPropagation(); onUploadImage(); }}
              className={`
                flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl 
                text-xs font-bold uppercase tracking-wide transition-all
                ${isPending
                  ? 'bg-surface-muted text-muted cursor-not-allowed'
                  : 'text-brand-secondary bg-brand-secondary/10 border border-brand-secondary/30 hover:bg-brand-secondary/20'
                }
              `}
            >
              <UploadCloudIcon className="w-4 h-4" />
              <span>Upload</span>
            </button>
            
            {/* Generate Button */}
            <button
              disabled={isPending}
              onClick={(e) => { e.stopPropagation(); onGenerate(); }}
              className={`
                flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl 
                text-xs font-bold uppercase tracking-wide transition-all
                ${isPending
                  ? 'bg-surface-muted text-muted cursor-not-allowed'
                  : 'text-white bg-gradient-to-r from-brand-primary to-brand-secondary shadow-md hover:shadow-lg hover:-translate-y-0.5'
                }
              `}
            >
              <SparklesIcon className="w-4 h-4" />
              <span>{post.generatedImage ? 'Regen' : 'Generate'}</span>
            </button>
          </div>
        </div>
      )}
    </article>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.post.id === nextProps.post.id &&
    prevProps.post.status === nextProps.post.status &&
    prevProps.post.statusMessage === nextProps.post.statusMessage &&
    prevProps.post.featured_media === nextProps.post.featured_media &&
    prevProps.post.imageCount === nextProps.post.imageCount &&
    prevProps.post.generatedImage?.url === nextProps.post.generatedImage?.url &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isFocused === nextProps.isFocused &&
    prevProps.isProcessing === nextProps.isProcessing &&
    prevProps.viewMode === nextProps.viewMode
  );
});

export default PostCard;
