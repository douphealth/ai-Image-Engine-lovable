// types.ts - Complete SOTA Type Definitions with Media Library Support

export enum AppState {
  Welcome,
  Configuration,
  Crawling,
  Results,
}

export enum AIProvider {
  Gemini = 'Google Gemini',
  DallE3 = 'OpenAI DALL-E 3',
  Stability = 'Stability AI',
  OpenRouter = 'OpenRouter',
  Pollinations = 'Pollinations.ai (Free)',
}

export enum TextAIProvider {
  None = 'None (Heuristic)',
  Gemini = 'Google Gemini',
  OpenAI = 'OpenAI',
  Groq = 'Groq',
  OpenRouter = 'OpenRouter',
}

export enum ImageFormat {
  WebP = 'image/webp',
  JPEG = 'image/jpeg',
  PNG = 'image/png',
}

export enum AspectRatio {
  Landscape = '16:9',
  Square = '1:1',
  Portrait = '9:16',
}

export enum ImageSize {
  K1 = '1K',
  K2 = '2K',
  K4 = '4K',
}

export type JobStatus = 
  | 'idle' 
  | 'pending' 
  | 'generating_brief' 
  | 'analyzing_placement' 
  | 'generating_image' 
  | 'uploading' 
  | 'inserting' 
  | 'setting_featured' 
  | 'updating_meta' 
  | 'analyzing' 
  | 'analysis_success' 
  | 'success' 
  | 'error' 
  | 'cancelled' 
  | 'generating_schema' 
  | 'inserting_schema' 
  | 'generating_tldr' 
  | 'inserting_tldr' 
  | 'aeo_auditing'
  | 'deleting_image'
  | 'replacing_image'
  | 'browsing_media';

export interface WordPressCredentials {
  url: string;
  username: string;
  appPassword?: string;
}

export interface ImageSettings {
  format: ImageFormat;
  quality: number;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  style: string;
  negativePrompt: string;
  useHighQuality?: boolean;
}

export interface ImageAIConfig {
  provider: AIProvider;
  apiKey?: string;
  model?: string;
}

export interface AnalysisAIConfig {
  provider: TextAIProvider;
  apiKey?: string;
  model?: string;
}

export interface SEOContext {
  targetLocation?: string;
  primaryKeywords?: string;
  brandVoice?: string;
  audience?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface AEOAnalysis {
  score: number;
  suggestions: string[];
  qaPairs: { question: string; answer: string }[];
  serpSnippet: string;
  sources?: GroundingSource[];
}

export interface ImageAnalysis {
  score: number;
  altText: string;
  brief: string;
  caption?: string;
  filenameSlug?: string;
}

export interface GeneratedImage {
  url: string;
  alt: string;
  mediaId: number;
  brief?: string;
  caption?: string;
  filenameSlug?: string;
}

export interface Configuration {
  wordpress: WordPressCredentials;
  ai: {
    image: ImageAIConfig;
    analysis: AnalysisAIConfig;
  };
  image: ImageSettings;
  seo: SEOContext;
}

// Content image details
export interface ContentImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  position: number;
  paragraphIndex: number;
  isExternal: boolean;
  quality?: 'low' | 'medium' | 'high';
}

// Image insertion point
export interface InsertionPoint {
  paragraphIndex: number;
  afterElement: 'p' | 'h2' | 'h3' | 'ul' | 'ol' | 'blockquote';
  position: number;
  context: string;
  recommended: boolean;
  reason?: string;
}

// Post image analysis
export interface PostImageAnalysis {
  contentImages: ContentImage[];
  insertionPoints: InsertionPoint[];
  imageGaps: number[];
  averageImageDistance: number;
  recommendedImageCount: number;
  qualityScore: number;
  paragraphCount?: number;
}

export interface WordPressPost {
  id: number;
  title: {
    rendered: string;
  };
  link: string;
  excerpt: {
    rendered: string;
  };
  content: {
    rendered: string;
    raw?: string;
  };
  date: string;
  modified: string;
  featured_media: number;
  imageCount: number;
  existingImageUrl?: string;
  existingImageAltText?: string;
  generatedImage?: GeneratedImage;
  analysis?: ImageAnalysis;
  aeo?: AEOAnalysis;
  seoScore?: number;
  contentWithPlaceholder?: string;
  generatedSchema?: string;
  status?: JobStatus;
  statusMessage?: string;
  contentImages?: ContentImage[];
  imageAnalysis?: PostImageAnalysis;
  wordCount?: number;
  paragraphCount?: number;
}

export interface CrawlProgress {
  current: number;
  total: number;
  phase?: 'fetching' | 'analyzing' | 'complete';
}

export interface Job {
  post: WordPressPost;
  action: 'generate' | 'analyze' | 'schema' | 'tldr' | 'aeo' | 'insert';
  insertionPoint?: InsertionPoint;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface TestResult {
  success: boolean;
  message: string;
}

export interface MediaUploadResult {
  id: number;
  source_url: string;
}

export interface ImageBrief {
  postId: number;
  brief: string;
  altText: string;
  caption: string;
  filenameSlug: string;
}

// Filter presets
export type FilterPreset = 
  | 'all'
  | 'no-featured'
  | 'zero-images'
  | 'low-images'
  | 'needs-work'
  | 'has-featured'
  | 'processed'
  | 'errors'
  | 'pending';

export interface FilterConfig {
  preset: FilterPreset;
  minImages?: number;
  maxImages?: number;
  hasFeatureImage?: boolean;
  minWordCount?: number;
  searchQuery?: string;
  dateRange?: { start: Date; end: Date };
}

// Batch operation
export interface BatchOperation {
  id: string;
  type: 'generate-featured' | 'insert-content' | 'analyze' | 'optimize-alt';
  postIds: number[];
  status: 'pending' | 'running' | 'paused' | 'complete' | 'cancelled';
  progress: number;
  total: number;
  startedAt?: number;
  completedAt?: number;
  errors: Array<{ postId: number; error: string }>;
}

// App stats
export interface AppStats {
  totalPosts: number;
  postsWithoutFeatured: number;
  postsWithZeroImages: number;
  postsWithLowImages: number;
  postsProcessed: number;
  totalImagesGenerated: number;
  averageImagesPerPost: number;
}

// ============================================================
// MEDIA LIBRARY TYPES - SOTA Implementation
// ============================================================

export interface MediaItem {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: {
    rendered: string;
  };
  author: number;
  caption: {
    rendered: string;
  };
  alt_text: string;
  media_type: 'image' | 'file' | 'video' | 'audio';
  mime_type: string;
  source_url: string;
  media_details: {
    width: number;
    height: number;
    file: string;
    filesize?: number;
    sizes?: {
      [key: string]: {
        file: string;
        width: number;
        height: number;
        mime_type: string;
        source_url: string;
        filesize?: number;
      };
    };
    image_meta?: {
      aperture?: string;
      credit?: string;
      camera?: string;
      caption?: string;
      created_timestamp?: string;
      copyright?: string;
      focal_length?: string;
      iso?: string;
      shutter_speed?: string;
      title?: string;
      orientation?: string;
      keywords?: string[];
    };
  };
}

export interface MediaLibraryFilters {
  search: string;
  mediaType: 'all' | 'image' | 'video' | 'audio' | 'application';
  dateRange: 'all' | 'today' | 'week' | 'month' | 'year';
  orderBy: 'date' | 'title' | 'id';
  order: 'asc' | 'desc';
}

export interface MediaLibraryState {
  items: MediaItem[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  isLoading: boolean;
  error: string | null;
  selectedIds: Set<number>;
}

export type MediaInsertionMode = 'featured' | 'content' | 'replace';

export interface MediaLibraryResponse {
  items: MediaItem[];
  total: number;
  totalPages: number;
}

export interface MediaLibraryStats {
  totalImages: number;
  totalVideos: number;
  totalAudio: number;
  totalDocuments: number;
  totalSize: number;
}
