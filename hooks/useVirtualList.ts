// hooks/useVirtualList.ts - High-performance virtualization with overscan

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

export interface VirtualListOptions {
  itemCount: number;
  itemHeight: number | ((index: number) => number);
  containerHeight: number;
  overscan?: number;
  scrollingDelay?: number;
}

export interface VirtualItem {
  index: number;
  start: number;
  size: number;
  isScrolling: boolean;
}

export interface VirtualListResult {
  virtualItems: VirtualItem[];
  totalHeight: number;
  scrollOffset: number;
  isScrolling: boolean;
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
  scrollToOffset: (offset: number) => void;
  measureElement: (element: HTMLElement | null) => void;
}

export const useVirtualList = (options: VirtualListOptions): VirtualListResult => {
  const {
    itemCount,
    itemHeight,
    containerHeight,
    overscan = 5,
    scrollingDelay = 150,
  } = options;

  const [scrollOffset, setScrollOffset] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLElement | null>(null);

  // Calculate item sizes
  const getItemSize = useCallback(
    (index: number): number => {
      return typeof itemHeight === 'function' ? itemHeight(index) : itemHeight;
    },
    [itemHeight]
  );

  // Calculate total height and item offsets
  const { totalHeight, itemOffsets } = useMemo(() => {
    const offsets: number[] = [];
    let total = 0;

    for (let i = 0; i < itemCount; i++) {
      offsets.push(total);
      total += getItemSize(i);
    }

    return { totalHeight: total, itemOffsets: offsets };
  }, [itemCount, getItemSize]);

  // Find start index using binary search
  const findStartIndex = useCallback(
    (offset: number): number => {
      let low = 0;
      let high = itemCount - 1;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midOffset = itemOffsets[mid];

        if (midOffset === offset) {
          return mid;
        } else if (midOffset < offset) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      return Math.max(0, low - 1);
    },
    [itemCount, itemOffsets]
  );

  // Calculate visible items
  const virtualItems = useMemo(() => {
    if (itemCount === 0) return [];

    const startIndex = findStartIndex(scrollOffset);
    const items: VirtualItem[] = [];

    let index = Math.max(0, startIndex - overscan);
    let offset = itemOffsets[index] || 0;

    while (index < itemCount && offset < scrollOffset + containerHeight + overscan * getItemSize(0)) {
      const size = getItemSize(index);
      items.push({
        index,
        start: offset,
        size,
        isScrolling,
      });
      offset += size;
      index++;
    }

    return items;
  }, [
    itemCount,
    scrollOffset,
    containerHeight,
    overscan,
    findStartIndex,
    itemOffsets,
    getItemSize,
    isScrolling,
  ]);

  // Handle scroll
  const handleScroll = useCallback((offset: number) => {
    setScrollOffset(offset);
    setIsScrolling(true);

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, scrollingDelay);
  }, [scrollingDelay]);

  // Measure container element
  const measureElement = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    containerRef.current = element;

    const onScroll = () => {
      handleScroll(element.scrollTop);
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    
    return () => {
      element.removeEventListener('scroll', onScroll);
    };
  }, [handleScroll]);

  // Scroll to specific index
  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'end' = 'start') => {
      if (!containerRef.current || index < 0 || index >= itemCount) return;

      const itemOffset = itemOffsets[index] || 0;
      const itemSize = getItemSize(index);

      let offset = itemOffset;

      if (align === 'center') {
        offset = itemOffset - containerHeight / 2 + itemSize / 2;
      } else if (align === 'end') {
        offset = itemOffset - containerHeight + itemSize;
      }

      containerRef.current.scrollTop = Math.max(0, Math.min(offset, totalHeight - containerHeight));
    },
    [itemCount, itemOffsets, getItemSize, containerHeight, totalHeight]
  );

  // Scroll to specific offset
  const scrollToOffset = useCallback((offset: number) => {
    if (containerRef.current) {
      containerRef.current.scrollTop = Math.max(0, Math.min(offset, totalHeight - containerHeight));
    }
  }, [totalHeight, containerHeight]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    virtualItems,
    totalHeight,
    scrollOffset,
    isScrolling,
    scrollToIndex,
    scrollToOffset,
    measureElement,
  };
};

export default useVirtualList;
