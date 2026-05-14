// components/ImageUploadModal.tsx - SOTA Enterprise Image Upload System
// Supports: Featured Image Upload, Content Image Insertion, AI Auto-Placement, Manual Placement

import { parseSafeHtml } from '../services/sanitize';
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { WordPressPost, Configuration, InsertionPoint } from '../types';
import { uploadImage, updatePost, updatePostContent } from '../services/wordpressService';
import { generateImageBrief } from '../services/aiService';
import {
  XIcon,
  UploadCloudIcon,
  ImageIcon,
  SparklesIcon,
  Loader,
  CheckCircle2,
  AlertTriangle,
  WandIcon,
  ZoomInIcon,
  TrashIcon,
  PlusCircleIcon,
} from './icons/Icons';

// ============================================================
// TYPES
// ============================================================
export type UploadMode = 'featured' | 'content' | 'both';
export type PlacementMode = 'auto' | 'manual';

interface Props {
  post: WordPressPost;
  config: Configuration;
  initialMode?: UploadMode;
  onClose: () => void;
  onSuccess: (updatedPost: WordPressPost) => void;
}

interface UploadedFile {
  file: File;
  preview: string;
  name: string;
  size: number;
  type: string;
}

interface AIPlacementSuggestion {
  point: InsertionPoint;
  confidence: number;
  reason: string;
}

// ============================================================
// CONSTANTS
// ============================================================
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const OPTIMAL_DIMENSIONS = { width: 1200, height: 630 }; // OG image standard

// ============================================================
// COMPONENT
// ============================================================
const ImageUploadModal: React.FC<Props> = ({
  post,
  config,
  initialMode = 'featured',
  onClose,
  onSuccess,
}) => {
  // State
  const [step, setStep] = useState<'select' | 'configure' | 'uploading' | 'success' | 'error'>('select');
  const [uploadMode, setUploadMode] = useState<UploadMode>(initialMode);
  const [placementMode, setPlacementMode] = useState<PlacementMode>('auto');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedInsertionPoint, setSelectedInsertionPoint] = useState<InsertionPoint | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AIPlacementSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // ============================================================
  // INSERTION POINTS ANALYSIS
  // ============================================================
  const insertionPoints = useMemo<InsertionPoint[]>(() => {
    const doc = parseSafeHtml(post.content.rendered);
    const elements = doc.querySelectorAll('p, h2, h3, ul, ol, blockquote');
    const points: InsertionPoint[] = [];
    let lastImageIndex = -1;

    elements.forEach((el, index) => {
      const text = el.textContent || '';
      const hasImage = el.querySelector('img') || (el.nextElementSibling?.tagName === 'FIGURE');
      
      if (hasImage) {
        lastImageIndex = index;
      }

      if (text.length > 30) {
        const gapSinceLastImage = index - lastImageIndex;
        points.push({
          paragraphIndex: index,
          afterElement: el.tagName.toLowerCase() as any,
          position: index,
          context: text.slice(0, 120) + (text.length > 120 ? '...' : ''),
          recommended: gapSinceLastImage > 4 || !!el.tagName.match(/^H[23]$/),
          reason: el.tagName.match(/^H[23]$/) 
            ? 'After section heading' 
            : gapSinceLastImage > 4 
              ? `${gapSinceLastImage} paragraphs since last image`
              : undefined,
        });
      }
    });

    return points;
  }, [post.content.rendered]);

  // ============================================================
  // AI AUTO-PLACEMENT ANALYSIS
  // ============================================================
  const analyzeOptimalPlacement = useCallback(async () => {
    if (insertionPoints.length === 0) return;
    
    setIsAnalyzing(true);
    
    try {
      // Simple heuristic-based analysis (can be enhanced with actual AI call)
      const suggestions: AIPlacementSuggestion[] = [];
      
      // Find the best spots based on content structure
      const headingPoints = insertionPoints.filter(p => p.afterElement === 'h2' || p.afterElement === 'h3');
      const gapPoints = insertionPoints.filter(p => p.recommended && !headingPoints.includes(p));
      
      // Prioritize after headings
      headingPoints.slice(0, 2).forEach((point, i) => {
        suggestions.push({
          point,
          confidence: 0.95 - (i * 0.1),
          reason: 'Optimal: Visual break after section heading improves readability',
        });
      });
      
      // Then large gaps
      gapPoints.slice(0, 2).forEach((point, i) => {
        suggestions.push({
          point,
          confidence: 0.8 - (i * 0.1),
          reason: 'Good: Breaking up long text sections improves engagement',
        });
      });
      
      // Sort by confidence
      suggestions.sort((a, b) => b.confidence - a.confidence);
      
      setAiSuggestions(suggestions);
      
      // Auto-select the best one
      if (suggestions.length > 0 && placementMode === 'auto') {
        setSelectedInsertionPoint(suggestions[0].point);
      }
    } catch (error) {
      console.error('AI placement analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [insertionPoints, placementMode]);

  // Run AI analysis when entering configure step for content mode
  useEffect(() => {
    if (step === 'configure' && (uploadMode === 'content' || uploadMode === 'both') && uploadedFile) {
      analyzeOptimalPlacement();
    }
  }, [step, uploadMode, uploadedFile, analyzeOptimalPlacement]);

  // ============================================================
  // FILE HANDLING
  // ============================================================
  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `Invalid file type. Allowed: ${ALLOWED_TYPES.map(t => t.split('/')[1].toUpperCase()).join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`;
    }
    return null;
  }, []);

  const processFile = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      setErrorMessage(error);
      return;
    }

    const preview = URL.createObjectURL(file);
    setUploadedFile({
      file,
      preview,
      name: file.name,
      size: file.size,
      type: file.type,
    });

    // Generate default alt text from filename
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setAltText(nameWithoutExt);
    
    setErrorMessage(null);
    setStep('configure');
  }, [validateFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const clearFile = useCallback(() => {
    if (uploadedFile?.preview) {
      URL.revokeObjectURL(uploadedFile.preview);
    }
    setUploadedFile(null);
    setAltText('');
    setCaption('');
    setStep('select');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [uploadedFile]);

  // ============================================================
  // UPLOAD LOGIC
  // ============================================================
  const handleUpload = useCallback(async () => {
    if (!uploadedFile) return;

    setStep('uploading');
    setUploadProgress(0);

    try {
      // Convert File to data URL for the existing upload function
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(uploadedFile.file);
      });

      setUploadProgress(20);

      // Generate filename
      const ext = uploadedFile.type.split('/')[1] || 'jpg';
      const slug = altText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const fileName = `${slug}-${Date.now()}.${ext}`;

      // Upload to WordPress Media Library
      const media = await uploadImage(
        config.wordpress,
        dataUrl,
        fileName,
        altText,
        caption
      );

      setUploadProgress(60);

      let updatedPost = post;

      // Set as Featured Image if needed
      if (uploadMode === 'featured' || uploadMode === 'both') {
        updatedPost = await updatePost(
          config.wordpress,
          post.id,
          { featured_media: media.id }
        );
        setUploadProgress(80);
      }

      // Insert into Content if needed
      if ((uploadMode === 'content' || uploadMode === 'both') && selectedInsertionPoint) {
        updatedPost = await updatePostContent(
          config.wordpress,
          post.id,
          selectedInsertionPoint,
          media.source_url,
          altText
        );
      }

      setUploadProgress(100);

      // Update local post state
      const finalPost: WordPressPost = {
        ...updatedPost,
        featured_media: uploadMode === 'featured' || uploadMode === 'both' 
          ? media.id 
          : updatedPost.featured_media,
        existingImageUrl: uploadMode === 'featured' || uploadMode === 'both'
          ? media.source_url
          : updatedPost.existingImageUrl,
        imageCount: uploadMode === 'content' || uploadMode === 'both'
          ? (post.imageCount || 0) + 1
          : post.imageCount,
        status: 'success',
        statusMessage: 'Image uploaded successfully',
      };

      setStep('success');
      
      setTimeout(() => {
        onSuccess(finalPost);
      }, 1500);

    } catch (error: any) {
      console.error('Upload failed:', error);
      setErrorMessage(error.message || 'Failed to upload image');
      setStep('error');
    }
  }, [uploadedFile, uploadMode, selectedInsertionPoint, altText, caption, config, post, onSuccess]);

  // ============================================================
  // AI ALT TEXT GENERATION
  // ============================================================
  const generateAltText = useCallback(async () => {
    if (!uploadedFile) return;
    
    setIsAnalyzing(true);
    try {
      const brief = await generateImageBrief(post, config.ai.analysis, config.seo);
      setAltText(brief.altText || altText);
      if (!caption) setCaption(brief.caption || '');
    } catch (error) {
      console.error('Alt text generation failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [uploadedFile, post, config, altText, caption]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (uploadedFile?.preview) {
        URL.revokeObjectURL(uploadedFile.preview);
      }
    };
  }, [uploadedFile]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ============================================================
  // RENDER HELPERS
  // ============================================================
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-border overflow-hidden">
        
        {/* Header */}
        <header className="flex justify-between items-center p-6 border-b border-border bg-surface-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary/10 rounded-xl">
              <UploadCloudIcon className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black text-text-primary tracking-tight">Upload Image</h2>
              <p className="text-xs text-muted">
                {step === 'select' && 'Choose an image from your device'}
                {step === 'configure' && 'Configure image settings and placement'}
                {step === 'uploading' && 'Uploading to WordPress...'}
                {step === 'success' && 'Upload complete!'}
                {step === 'error' && 'Upload failed'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl hover:bg-surface-muted transition-colors"
            disabled={step === 'uploading'}
          >
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* Step 1: File Selection */}
          {step === 'select' && (
            <div className="space-y-6">
              {/* Upload Mode Selection */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'featured' as UploadMode, label: 'Featured Image', desc: 'Set as post thumbnail' },
                  { id: 'content' as UploadMode, label: 'Content Image', desc: 'Insert into post body' },
                  { id: 'both' as UploadMode, label: 'Both', desc: 'Featured + in content' },
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setUploadMode(mode.id)}
                    className={`
                      p-4 rounded-xl border-2 transition-all text-left
                      ${uploadMode === mode.id 
                        ? 'border-brand-primary bg-brand-primary/5 shadow-lg' 
                        : 'border-border hover:border-brand-primary/30'
                      }
                    `}
                  >
                    <div className="text-sm font-bold text-text-primary">{mode.label}</div>
                    <div className="text-[10px] text-muted mt-1">{mode.desc}</div>
                  </button>
                ))}
              </div>

              {/* Drop Zone */}
              <div
                ref={dropZoneRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative h-64 border-2 border-dashed rounded-2xl cursor-pointer transition-all
                  flex flex-col items-center justify-center gap-4
                  ${isDragging 
                    ? 'border-brand-primary bg-brand-primary/10 scale-[1.02]' 
                    : 'border-border hover:border-brand-primary/50 hover:bg-surface-muted/30'
                  }
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES.join(',')}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <div className={`
                  w-20 h-20 rounded-2xl flex items-center justify-center transition-all
                  ${isDragging ? 'bg-brand-primary/20 scale-110' : 'bg-surface-muted'}
                `}>
                  <UploadCloudIcon className={`w-10 h-10 ${isDragging ? 'text-brand-primary' : 'text-muted'}`} />
                </div>
                
                <div className="text-center">
                  <p className="font-bold text-text-primary">
                    {isDragging ? 'Drop your image here' : 'Drag & drop or click to browse'}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    JPG, PNG, WebP, GIF • Max {MAX_FILE_SIZE / 1024 / 1024}MB
                  </p>
                </div>

                {isDragging && (
                  <div className="absolute inset-0 bg-brand-primary/5 rounded-2xl animate-pulse" />
                )}
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-500">{errorMessage}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 'configure' && uploadedFile && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Preview & Metadata */}
              <div className="space-y-6">
                {/* Image Preview */}
                <div className="relative rounded-xl overflow-hidden border border-border bg-surface-muted group">
                  <img 
                    src={uploadedFile.preview} 
                    alt="Preview" 
                    className="w-full h-auto max-h-[300px] object-contain"
                  />
                  <button
                    onClick={clearFile}
                    className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                    <p className="text-white text-xs font-medium truncate">{uploadedFile.name}</p>
                    <p className="text-white/70 text-[10px]">{formatFileSize(uploadedFile.size)}</p>
                  </div>
                </div>

                {/* Alt Text */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-text-primary">Alt Text (SEO)</label>
                    <button
                      onClick={generateAltText}
                      disabled={isAnalyzing}
                      className="flex items-center gap-1 text-[10px] font-bold text-brand-primary hover:underline disabled:opacity-50"
                    >
                      {isAnalyzing ? <Loader className="w-3 h-3 animate-spin" /> : <WandIcon className="w-3 h-3" />}
                      AI Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    placeholder="Describe the image for accessibility & SEO"
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>

                {/* Caption */}
                <div className="space-y-2">
                  <label className="text-sm font-bold text-text-primary">Caption (Optional)</label>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Visible caption below the image"
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-primary outline-none"
                  />
                </div>
              </div>

              {/* Right: Placement Options (for content mode) */}
              {(uploadMode === 'content' || uploadMode === 'both') && (
                <div className="space-y-6">
                  {/* Placement Mode Toggle */}
                  <div className="flex items-center gap-2 p-1 bg-surface-muted rounded-xl">
                    {[
                      { id: 'auto' as PlacementMode, label: 'AI Auto-Place', icon: <WandIcon className="w-4 h-4" /> },
                      { id: 'manual' as PlacementMode, label: 'Manual Select', icon: <PlusCircleIcon className="w-4 h-4" /> },
                    ].map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setPlacementMode(mode.id)}
                        className={`
                          flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all
                          ${placementMode === mode.id 
                            ? 'bg-brand-primary text-white shadow-lg' 
                            : 'text-muted hover:text-text-primary'
                          }
                        `}
                      >
                        {mode.icon}
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {/* AI Suggestions */}
                  {placementMode === 'auto' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <SparklesIcon className="w-4 h-4 text-brand-primary" />
                        <span className="text-sm font-bold text-text-primary">AI Recommended Placements</span>
                        {isAnalyzing && <Loader className="w-4 h-4 animate-spin text-brand-primary" />}
                      </div>
                      
                      {aiSuggestions.length > 0 ? (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                          {aiSuggestions.map((suggestion, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedInsertionPoint(suggestion.point)}
                              className={`
                                w-full text-left p-4 rounded-xl border-2 transition-all
                                ${selectedInsertionPoint?.paragraphIndex === suggestion.point.paragraphIndex
                                  ? 'border-brand-primary bg-brand-primary/5 shadow-lg'
                                  : 'border-border hover:border-brand-primary/30'
                                }
                              `}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                                  After &lt;{suggestion.point.afterElement}/&gt;
                                </span>
                                <span className={`
                                  text-[10px] font-bold px-2 py-0.5 rounded-full
                                  ${suggestion.confidence > 0.9 ? 'bg-emerald-500/10 text-emerald-600' :
                                    suggestion.confidence > 0.7 ? 'bg-brand-primary/10 text-brand-primary' :
                                    'bg-amber-500/10 text-amber-600'}
                                `}>
                                  {Math.round(suggestion.confidence * 100)}% match
                                </span>
                              </div>
                              <p className="text-xs text-text-secondary line-clamp-2 mb-2">
                                {suggestion.point.context}
                              </p>
                              <p className="text-[10px] text-muted italic">
                                💡 {suggestion.reason}
                              </p>
                            </button>
                          ))}
                        </div>
                      ) : !isAnalyzing ? (
                        <div className="p-6 bg-surface-muted/50 rounded-xl text-center">
                          <p className="text-sm text-muted">No insertion points found</p>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Manual Selection */}
                  {placementMode === 'manual' && (
                    <div className="space-y-3">
                      <span className="text-sm font-bold text-text-primary">Select Insertion Point</span>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                        {insertionPoints.map((point, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedInsertionPoint(point)}
                            className={`
                              w-full text-left p-3 rounded-xl border transition-all
                              ${selectedInsertionPoint?.paragraphIndex === point.paragraphIndex
                                ? 'border-brand-primary bg-brand-primary/5'
                                : point.recommended
                                  ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
                                  : 'border-border hover:border-brand-primary/30'
                              }
                            `}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold uppercase text-muted">
                                Position {point.paragraphIndex + 1}
                              </span>
                              {point.recommended && (
                                <span className="text-[10px] font-bold text-emerald-600">Recommended</span>
                              )}
                            </div>
                            <p className="text-xs text-text-secondary line-clamp-2">{point.context}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warning if no point selected */}
                  {!selectedInsertionPoint && (uploadMode === 'content' || uploadMode === 'both') && (
                    <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="text-xs text-amber-600">Please select where to insert the image</span>
                    </div>
                  )}
                </div>
              )}

              {/* Featured-only mode info */}
              {uploadMode === 'featured' && (
                <div className="flex flex-col items-center justify-center p-8 bg-surface-muted/30 rounded-2xl border border-border">
                  <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mb-4">
                    <ImageIcon className="w-8 h-8 text-brand-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-text-primary mb-2">Featured Image</h3>
                  <p className="text-sm text-muted text-center max-w-xs">
                    This image will be set as the post's featured image (thumbnail) visible in archives and social shares.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Uploading */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative mb-8">
                <div className="w-24 h-24 bg-brand-primary/10 rounded-full flex items-center justify-center">
                  <Loader className="w-12 h-12 text-brand-primary animate-spin" />
                </div>
                <div className="absolute inset-0 bg-brand-primary/20 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
              </div>
              
              <h3 className="text-xl font-bold text-text-primary mb-2">Uploading Image</h3>
              <p className="text-sm text-muted mb-6">Please wait while we process your image...</p>
              
              {/* Progress Bar */}
              <div className="w-full max-w-md">
                <div className="flex justify-between text-xs text-muted mb-2">
                  <span>Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-500"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">Upload Successful!</h3>
              <p className="text-sm text-muted">Your image has been uploaded and applied to the post.</p>
            </div>
          )}

          {/* Step 5: Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">Upload Failed</h3>
              <p className="text-sm text-red-500 mb-6">{errorMessage}</p>
              <button
                onClick={() => setStep('configure')}
                className="px-6 py-2 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'select' || step === 'configure') && (
          <footer className="p-4 border-t border-border bg-surface-muted/30 flex items-center justify-between">
            <div className="text-xs text-muted">
              {uploadedFile && (
                <span className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  {uploadedFile.name} ({formatFileSize(uploadedFile.size)})
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2 text-sm font-medium bg-surface border border-border rounded-xl hover:border-brand-primary transition-colors"
              >
                Cancel
              </button>
              
              {step === 'configure' && (
                <button
                  onClick={handleUpload}
                  disabled={
                    !uploadedFile || 
                    !altText.trim() ||
                    ((uploadMode === 'content' || uploadMode === 'both') && !selectedInsertionPoint)
                  }
                  className="flex items-center gap-2 px-6 py-2 text-sm font-bold bg-brand-primary text-white rounded-xl hover:bg-brand-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UploadCloudIcon className="w-4 h-4" />
                  Upload & Apply
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};

export default ImageUploadModal;
