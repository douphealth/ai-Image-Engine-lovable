// services/sanitize.ts - DOMPurify wrappers for safe rendering of WordPress HTML

import DOMPurify from 'dompurify';

const HTML_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'span', 'div', 'a', 'strong', 'em', 'b', 'i', 'u', 'mark', 'small', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'iframe',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'srcset', 'alt', 'title', 'class', 'id', 'width', 'height',
    'data-src', 'data-lazy-src', 'data-original', 'loading', 'target', 'rel',
    'colspan', 'rowspan', 'allow', 'allowfullscreen', 'frameborder',
  ],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
};

const TITLE_CONFIG = {
  ALLOWED_TAGS: ['em', 'strong', 'i', 'b', 'span'],
  ALLOWED_ATTR: ['class'],
};

/** Sanitize WordPress rendered HTML content. Safe for dangerouslySetInnerHTML. */
export const sanitizeHtml = (dirty: string): string => {
  if (!dirty || typeof dirty !== 'string') return '';
  return DOMPurify.sanitize(dirty, HTML_CONFIG);
};

/** Sanitize a rendered title (allows minimal inline formatting). */
export const sanitizeTitle = (dirty: string): string => {
  if (!dirty || typeof dirty !== 'string') return '';
  return DOMPurify.sanitize(dirty, TITLE_CONFIG);
};

/** Strip all HTML, returning plain text. Decodes entities. */
export const stripHtml = (dirty: string): string => {
  if (!dirty || typeof dirty !== 'string') return '';
  const clean = DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  if (typeof window === 'undefined') return clean;
  const txt = document.createElement('textarea');
  txt.innerHTML = clean;
  return txt.value;
};

/** Parse HTML safely via DOMParser after DOMPurify sanitization. */
export const parseSafeHtml = (dirty: string): Document => {
  const clean = sanitizeHtml(dirty);
  return new DOMParser().parseFromString(clean, 'text/html');
};

export default { sanitizeHtml, sanitizeTitle, stripHtml, parseSafeHtml };
