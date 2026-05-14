import { describe, it, expect } from 'vitest';
import { extractContentImages } from '../services/imageUtils';
import { WordPressPost } from '../types';

const post = (html: string, link = 'https://example.com/post'): WordPressPost => ({
  id: 1, link, content: { rendered: html },
} as unknown as WordPressPost);

describe('extractContentImages', () => {
  it('returns empty array for content without images', () => {
    expect(extractContentImages(post('<p>hello</p>'))).toEqual([]);
  });

  it('extracts a basic image', () => {
    const imgs = extractContentImages(post('<img src="https://example.com/a.jpg" alt="A" width="100" height="50">'));
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toBe('https://example.com/a.jpg');
    expect(imgs[0].alt).toBe('A');
    expect(imgs[0].width).toBe(100);
    expect(imgs[0].height).toBe(50);
    expect(imgs[0].isExternal).toBe(false);
  });

  it('flags images on a different host as external', () => {
    const imgs = extractContentImages(post('<img src="https://cdn.other.com/a.jpg">'));
    expect(imgs[0].isExternal).toBe(true);
  });

  it('treats www subdomain as same host', () => {
    const imgs = extractContentImages(post('<img src="https://www.example.com/a.jpg">'));
    expect(imgs[0].isExternal).toBe(false);
  });

  it('prefers data-src over src for lazy-loaded images', () => {
    const imgs = extractContentImages(post('<img src="data:image/gif;base64,xxx" data-src="https://example.com/real.jpg">'));
    expect(imgs[0].src).toBe('https://example.com/real.jpg');
  });

  it('falls back to srcset first candidate when src is data:', () => {
    const imgs = extractContentImages(post('<img src="data:image/gif;base64,xxx" srcset="https://example.com/a.jpg 1x, https://example.com/b.jpg 2x">'));
    expect(imgs[0].src).toBe('https://example.com/a.jpg');
  });

  it('skips spacer and 1x1 images', () => {
    const imgs = extractContentImages(post('<img src="https://example.com/spacer.gif"><img src="https://example.com/1x1.png"><img src="https://example.com/real.jpg">'));
    expect(imgs).toHaveLength(1);
    expect(imgs[0].src).toBe('https://example.com/real.jpg');
  });

  it('skips images without src', () => {
    expect(extractContentImages(post('<img alt="no src">'))).toEqual([]);
  });

  it('extracts multiple images preserving order', () => {
    const imgs = extractContentImages(post('<img src="https://example.com/1.jpg"><p>x</p><img src="https://example.com/2.jpg">'));
    expect(imgs.map(i => i.src)).toEqual(['https://example.com/1.jpg', 'https://example.com/2.jpg']);
  });
});
