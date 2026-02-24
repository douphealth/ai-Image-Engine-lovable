
// components/ImageGalleryModal.tsx - SOTA Content Image Manager

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { WordPressPost, ContentImage, InsertionPoint, Configuration } from '../types';
import { deleteContentImage, replaceContentImage, uploadImage } from '../services/wordpressService';
import { generateImage } from '../services/aiService';
import { 
  XIcon, 
  ImageIcon, 
  ExternalLinkIcon, 
  SparklesIcon, 
  PlusCircleIcon,
  AlertTriangle,
  CheckCircle2,
  ZoomInIcon,
  TrashIcon,
  RefreshCwIcon,
  Loader,
  WandIcon
} from './icons/Icons';

interface Props {
  post: WordPressPost;
  config: Configuration;
  onClose: () => void;
  onInsertImage: (point: InsertionPoint) => void;
  onGenerateFeatured: () => void;
  onPostUpdate: (post: WordPressPost) => void;
}

const ImageGalleryModal: React.FC<Props> = ({ 
  post, 
  config,
  onClose, 
  onInsertImage, 
  onGenerateFeatured,
  onPostUpdate 
}) => {
  const [selectedImage, setSelectedImage] = useState<ContentImage | null>(null);
  const [showZoom, setShowZoom] = useState(false);
  const [processingImage, setProcessingImage] = useState<string | null>(null); // URL of image being processed
  const [replacingImage, setReplacingImage] = useState<ContentImage | null>(null);
  const [replacementPrompt, setReplacementPrompt] = useState('');
  const [isGeneratingReplacement, setIsGeneratingReplacement] = useState(false);

  // Parse images from content using SOTA extraction logic
  const contentImages = useMemo<ContentImage[]>(() => {
    const doc = new DOMParser().parseFromString(post.content.rendered, 'text/html');
    const images: ContentImage[] = [];
    
    doc.querySelectorAll('img').forEach((img, index) => {
       // 1. Detect Real Source (handling Lazy Loading plugins like Smush, WP Rocket, Autoptimize)
       let src = img.getAttribute('data-src') || 
                 img.getAttribute('data-lazy-src') || 
                 img.getAttribute('data-original') || 
                 img.getAttribute('src');

       // 2. Fallback to srcset
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
                const postHost = new URL(post.link).hostname;
                const imgHost = new URL(src).hostname;
                isExternal = !imgHost.includes(postHost);
           }
      } catch (e) {}
      
      images.push({
        src,
        alt: img.getAttribute('alt') || '',
        width: parseInt(img.getAttribute('width') || '0') || img.naturalWidth || 0,
        height: parseInt(img.getAttribute('height') || '0') || img.naturalHeight || 0,
        position: 0,
        paragraphIndex: index,
        isExternal,
        quality: img.naturalWidth > 800 ? 'high' : img.naturalWidth > 400 ? 'medium' : 'low',
      });
    });
    
    return images;
  }, [post.content.rendered, post.link]);

  // Find gaps in content
  const insertionPoints = useMemo<InsertionPoint[]>(() => {
    const doc = new DOMParser().parseFromString(post.content.rendered, 'text/html');
    const paragraphs = doc.querySelectorAll('p, h2, h3');
    const points: InsertionPoint[] = [];
    
    let lastImageIndex = -1;
    paragraphs.forEach((p, index) => {
      const hasImage = p.querySelector('img') || (p.nextElementSibling?.tagName === 'FIGURE');
      if (hasImage) {
        lastImageIndex = index;
      } else if (index - lastImageIndex > 3 && p.textContent && p.textContent.length > 100) {
        points.push({
          paragraphIndex: index,
          afterElement: p.tagName.toLowerCase() as any,
          position: index,
          context: p.textContent.slice(0, 100) + '...',
          recommended: index - lastImageIndex > 5,
          reason: `${index - lastImageIndex} paragraphs since last image`,
        });
      }
    });
    
    return points;
  }, [post.content.rendered]);

  const hasFeatured = post.featured_media > 0 || !!post.generatedImage;

  // Actions
  const handleDeleteImage = useCallback(async (image: ContentImage) => {
    if (!confirm('Are you sure you want to remove this image from the post content? This cannot be undone.')) return;
    
    setProcessingImage(image.src);
    try {
        const updatedPost = await deleteContentImage(config.wordpress, post, image.src);
        onPostUpdate({
            ...updatedPost,
            imageCount: Math.max(0, post.imageCount - 1),
            status: 'success',
            statusMessage: 'Image removed'
        });
    } catch (e: any) {
        alert(`Failed to delete image: ${e.message}`);
    } finally {
        setProcessingImage(null);
    }
  }, [config, post, onPostUpdate]);

  const handleStartReplace = (image: ContentImage) => {
    setReplacingImage(image);
    setReplacementPrompt(image.alt || '');
  };

  const handleConfirmReplace = useCallback(async () => {
    if (!replacingImage || !replacementPrompt) return;

    setIsGeneratingReplacement(true);
    try {
        // 1. Generate new image
        const fullPrompt = `${replacementPrompt}. Style: ${config.image.style}`;
        const dataUrl = await generateImage(config.ai.image, fullPrompt, config.image);

        // 2. Upload
        const fileExt = config.image.format.split('/')[1] || 'webp';
        const fileName = `replaced-${Date.now()}.${fileExt}`;
        const media = await uploadImage(config.wordpress, dataUrl, fileName, replacementPrompt, replacementPrompt);

        // 3. Replace in Content
        const updatedPost = await replaceContentImage(
            config.wordpress, 
            post, 
            replacingImage.src, 
            media.source_url, 
            replacementPrompt
        );

        onPostUpdate({
            ...updatedPost,
            status: 'success',
            statusMessage: 'Image replaced'
        });
        setReplacingImage(null);
    } catch (e: any) {
        alert(`Failed to replace image: ${e.message}`);
    } finally {
        setIsGeneratingReplacement(false);
    }
  }, [replacingImage, replacementPrompt, config, post, onPostUpdate]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col border border-border overflow-hidden">
        
        {/* Header */}
        <header className="flex justify-between items-center p-6 border-b border-border bg-surface-muted/30">
          <div>
            <h2 className="text-xl font-bold text-text-primary truncate max-w-2xl">
              Content Image Command Center
            </h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted">
              <span className="flex items-center gap-1 font-mono text-xs">
                ID: {post.id}
              </span>
              <span className="flex items-center gap-1">
                <ImageIcon className="w-4 h-4" />
                {contentImages.length} active images
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-muted transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface-muted/10">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            
            {/* Left Sidebar: Featured & Insert */}
            <div className="lg:col-span-1 space-y-6">
              {/* Featured Image */}
              <div className="bg-surface p-4 rounded-xl border border-border shadow-sm">
                <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm uppercase tracking-wide">
                  <SparklesIcon className="w-4 h-4 text-brand-primary" />
                  Featured Image
                </h3>
                
                {post.existingImageUrl || post.generatedImage?.url ? (
                  <div className="relative rounded-lg overflow-hidden border border-border group aspect-video">
                    <img 
                      src={post.generatedImage?.url || post.existingImageUrl} 
                      alt="Featured"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button 
                        onClick={() => {
                          setSelectedImage({ src: post.generatedImage?.url || post.existingImageUrl!, alt: 'Featured', position: 0, paragraphIndex: 0, isExternal: false });
                          setShowZoom(true);
                        }}
                        className="p-2 bg-white/20 rounded-lg hover:bg-white/30 backdrop-blur-md transition-colors"
                      >
                        <ZoomInIcon className="w-5 h-5 text-white" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video bg-surface-muted rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center p-4">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                    <button
                      onClick={onGenerateFeatured}
                      className="text-xs font-bold px-3 py-1.5 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 transition-colors"
                    >
                      Generate Featured
                    </button>
                  </div>
                )}
              </div>

              {/* Insertion Suggestions */}
              {insertionPoints.length > 0 && (
                <div className="bg-surface p-4 rounded-xl border border-border shadow-sm">
                   <h3 className="font-bold text-text-primary flex items-center gap-2 mb-3 text-sm uppercase tracking-wide">
                    <PlusCircleIcon className="w-4 h-4 text-emerald-500" />
                    Insert Points
                  </h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                    {insertionPoints.map((point, i) => (
                      <button
                        key={i}
                        onClick={() => onInsertImage(point)}
                        className={`
                          w-full text-left p-3 rounded-lg border transition-all
                          ${point.recommended 
                            ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10' 
                            : 'border-border hover:border-brand-primary/30 hover:bg-surface-muted'
                          }
                        `}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold uppercase text-muted">
                            After &lt;{point.afterElement}/&gt;
                          </span>
                          {point.recommended && (
                            <span className="text-[10px] font-bold text-emerald-500">
                              Best Spot
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed opacity-80">{point.context}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Main Content: Image Grid */}
            <div className="lg:col-span-3">
               <h3 className="font-bold text-text-primary flex items-center gap-2 mb-4 text-sm uppercase tracking-wide">
                <ImageIcon className="w-4 h-4 text-brand-secondary" />
                Post Content Gallery ({contentImages.length})
              </h3>

              {contentImages.length === 0 ? (
                <div className="h-64 bg-surface rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-4">
                    <ImageIcon className="w-8 h-8 text-muted/50" />
                  </div>
                  <h4 className="text-lg font-bold text-text-primary">No Images Found in Content</h4>
                  <p className="text-sm text-muted mt-1 mb-6">This post text is looking a bit plain.</p>
                  <button
                    onClick={() => insertionPoints[0] && onInsertImage(insertionPoints[0])}
                    className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white rounded-xl font-bold shadow-lg shadow-brand-primary/20 hover:-translate-y-0.5 transition-all"
                  >
                    <PlusCircleIcon className="w-5 h-5" />
                    Add First Image
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                  {contentImages.map((img, i) => (
                    <div 
                      key={i + img.src} 
                      className={`
                        group relative bg-surface rounded-xl border border-border overflow-hidden transition-all duration-300
                        ${processingImage === img.src ? 'opacity-50 pointer-events-none grayscale' : 'hover:shadow-xl hover:border-brand-primary/30 hover:-translate-y-1'}
                      `}
                    >
                      {/* Image Preview */}
                      <div className="aspect-square relative overflow-hidden bg-surface-muted">
                         <img 
                            src={img.src} 
                            alt={img.alt} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                         />
                         
                         {/* Hover Overlay */}
                         <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
                            <div className="flex items-center justify-between gap-2 translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                <button 
                                    onClick={() => handleStartReplace(img)}
                                    className="p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-lg text-white transition-colors"
                                    title="Replace with AI Image"
                                >
                                    <RefreshCwIcon className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => { setSelectedImage(img); setShowZoom(true); }}
                                    className="p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-lg text-white transition-colors"
                                    title="Zoom View"
                                >
                                    <ZoomInIcon className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => handleDeleteImage(img)}
                                    className="p-2 bg-red-500/80 hover:bg-red-500 backdrop-blur-md rounded-lg text-white transition-colors"
                                    title="Delete from Post"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                         </div>

                         {/* Processing Loader */}
                         {processingImage === img.src && (
                             <div className="absolute inset-0 bg-surface/80 flex items-center justify-center">
                                 <Loader className="w-8 h-8 text-brand-primary animate-spin" />
                             </div>
                         )}
                      </div>

                      {/* Info Footer */}
                      <div className="p-3 border-t border-border bg-surface relative z-10">
                        <div className="flex items-center justify-between mb-1">
                             <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${img.isExternal ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {img.isExternal ? 'External' : 'Local'}
                             </span>
                             <span className="text-[10px] text-muted font-mono">
                                {img.width ? `${img.width}px` : 'Auto'}
                             </span>
                        </div>
                        <p className="text-xs text-text-primary truncate font-medium" title={img.alt}>
                            {img.alt || 'No Alt Text'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-border bg-surface-muted/30 flex items-center justify-between">
          <a 
            href={post.link} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-muted hover:text-brand-primary transition-colors"
          >
            <ExternalLinkIcon className="w-4 h-4" />
            Open Post
          </a>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-surface border border-border rounded-xl text-sm font-bold hover:bg-surface-muted transition-colors"
          >
            Close
          </button>
        </footer>
      </div>

      {/* Replace Modal Overlay */}
      {replacingImage && (
        <div className="absolute inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg border border-border p-6 space-y-4">
                <div className="flex justify-between items-start">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                        <RefreshCwIcon className="w-5 h-5 text-brand-primary" />
                        Replace Image
                    </h3>
                    <button onClick={() => setReplacingImage(null)} className="text-muted hover:text-text-primary"><XIcon className="w-5 h-5"/></button>
                </div>
                
                <div className="flex gap-4 p-3 bg-surface-muted rounded-xl border border-border">
                    <img src={replacingImage.src} className="w-16 h-16 rounded-lg object-cover" alt="Original" />
                    <div>
                        <p className="text-xs font-bold uppercase text-muted mb-1">Replacing</p>
                        <p className="text-xs text-text-secondary line-clamp-2">{replacingImage.src}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-bold text-text-primary">New Image Prompt</label>
                    <textarea 
                        value={replacementPrompt}
                        onChange={(e) => setReplacementPrompt(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl p-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                        rows={3}
                        placeholder="Describe the new image..."
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setReplacingImage(null)} className="px-4 py-2 text-sm font-medium text-muted hover:text-text-primary">Cancel</button>
                    <button 
                        onClick={handleConfirmReplace}
                        disabled={isGeneratingReplacement || !replacementPrompt}
                        className="px-6 py-2 bg-brand-primary text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50"
                    >
                        {isGeneratingReplacement ? <Loader className="w-4 h-4 animate-spin"/> : <WandIcon className="w-4 h-4"/>}
                        {isGeneratingReplacement ? 'Synthesizing...' : 'Generate & Replace'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Zoom Modal */}
      {showZoom && selectedImage && (
        <div 
          className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center p-8"
          onClick={() => setShowZoom(false)}
        >
          <button 
            className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
            onClick={() => setShowZoom(false)}
          >
            <XIcon className="w-6 h-6 text-white" />
          </button>
          <img 
            src={selectedImage.src}
            alt={selectedImage.alt}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {selectedImage.alt && (
            <p className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white text-sm font-medium bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20">
              {selectedImage.alt}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageGalleryModal;
