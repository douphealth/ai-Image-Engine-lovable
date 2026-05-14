// services/imageUtils.ts - Shared image extraction utility (single source of truth)

import { WordPressPost, ContentImage } from '../types';
import { parseSafeHtml } from './sanitize';

/**
 * Extract content images from a WordPress post's HTML content.
 * This is the canonical implementation — import this everywhere.
 */
export const extractContentImages = (post: WordPressPost): ContentImage[] => {
  if (typeof window === 'undefined') return [];
  
  try {
    const doc = parseSafeHtml(post.content.rendered);
    const images: ContentImage[] = [];
    
    doc.querySelectorAll('img').forEach((img, index) => {
      let src = img.getAttribute('data-src') || 
                img.getAttribute('data-lazy-src') || 
                img.getAttribute('data-original') || 
                img.getAttribute('src');

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
          const postHost = new URL(post.link).hostname.replace('www.', '');
          const imgHost = new URL(src).hostname.replace('www.', '');
          isExternal = !imgHost.includes(postHost);
        }
      } catch { /* invalid URL */ }

      images.push({
        src,
        alt: img.getAttribute('alt') || '',
        width: parseInt(img.getAttribute('width') || '0') || 0,
        height: parseInt(img.getAttribute('height') || '0') || 0,
        position: 0,
        paragraphIndex: index,
        isExternal,
        quality: 'medium',
      });
    });
    
    return images;
  } catch {
    return [];
  }
};

export default extractContentImages;
