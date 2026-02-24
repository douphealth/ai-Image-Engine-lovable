// workers/imageAnalyzer.worker.ts - Background image analysis

/// <reference lib="webworker" />

import { WordPressPost, ContentImage, PostImageAnalysis } from '../types';

self.onmessage = (event: MessageEvent<{ posts: WordPressPost[] }>) => {
  const { posts } = event.data;
  const results: WordPressPost[] = [];
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const { contentImages, analysis } = analyzePost(post);
    
    results.push({
      ...post,
      imageCount: contentImages.length,
      paragraphCount: analysis.paragraphCount,
      contentImages,
      imageAnalysis: analysis,
    });
    
    // Report progress every 10 posts
    if (i % 10 === 0) {
      self.postMessage({ type: 'progress', current: i + 1, total: posts.length });
    }
  }
  
  self.postMessage({ type: 'complete', posts: results });
};

function analyzePost(post: WordPressPost): { contentImages: ContentImage[]; analysis: PostImageAnalysis } {
  const content = post.content.rendered;
  const images: ContentImage[] = [];
  
  // Fast regex-based image extraction (faster than DOMParser in worker)
  const imgRegex = /<img[^>]+>/gi;
  let match;
  let index = 0;
  
  while ((match = imgRegex.exec(content)) !== null) {
    const imgTag = match[0];
    
    // Extract src (handles lazy loading attributes)
    const srcMatch = imgTag.match(/(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i);
    const src = srcMatch?.[1];
    
    if (!src || src.startsWith('data:') || src.includes('1x1') || src.includes('spacer')) continue;
    
    // Extract alt
    const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
    const alt = altMatch?.[1] || '';
    
    // Check if external
    let isExternal = false;
    try {
      if (src.startsWith('http')) {
        const postHost = new URL(post.link).hostname.replace('www.', '');
        const imgHost = new URL(src).hostname.replace('www.', '');
        isExternal = !imgHost.includes(postHost);
      }
    } catch {}
    
    images.push({
      src,
      alt,
      width: 0,
      height: 0,
      position: match.index,
      paragraphIndex: index++,
      isExternal,
      quality: 'medium',
    });
  }
  
  // Count paragraphs
  const paragraphCount = (content.match(/<p[^>]*>/gi) || []).length;
  
  const analysis: PostImageAnalysis = {
    contentImages: images,
    insertionPoints: [],
    imageGaps: [],
    averageImageDistance: paragraphCount / Math.max(1, images.length),
    recommendedImageCount: Math.ceil(post.wordCount / 300),
    qualityScore: Math.min(100, images.length * 20 + (post.featured_media ? 50 : 0)),
    paragraphCount,
  };
  
  return { contentImages: images, analysis };
}
