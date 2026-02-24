// hooks/useDebouncedValue.ts - High-performance debouncing with flush capability

import { useState, useEffect, useRef, useCallback, useDeferredValue } from 'react';

export interface DebouncedValueOptions {
  delay?: number;
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
}

export interface DebouncedValueResult<T> {
  debouncedValue: T;
  isPending: boolean;
  flush: () => void;
  cancel: () => void;
}

export const useDebouncedValue = <T>(
  value: T,
  options: DebouncedValueOptions = {}
): DebouncedValueResult<T> => {
  const { delay = 300, leading = false, trailing = true, maxWait } = options;

  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [isPending, setIsPending] = useState(false);
  
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const maxWaitTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastCallRef = useRef<number>(0);
  const lastValueRef = useRef<T>(value);
  const leadingCalledRef = useRef(false);

  const updateValue = useCallback((newValue: T) => {
    setDebouncedValue(newValue);
    setIsPending(false);
    leadingCalledRef.current = false;
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (maxWaitTimeoutRef.current) {
      clearTimeout(maxWaitTimeoutRef.current);
      maxWaitTimeoutRef.current = undefined;
    }
    updateValue(lastValueRef.current);
  }, [updateValue]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (maxWaitTimeoutRef.current) {
      clearTimeout(maxWaitTimeoutRef.current);
      maxWaitTimeoutRef.current = undefined;
    }
    setIsPending(false);
    leadingCalledRef.current = false;
  }, []);

  useEffect(() => {
    lastValueRef.current = value;
    const now = Date.now();

    // Handle leading edge
    if (leading && !leadingCalledRef.current) {
      leadingCalledRef.current = true;
      updateValue(value);
      lastCallRef.current = now;
      return;
    }

    setIsPending(true);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set up maxWait timeout if specified
    if (maxWait && !maxWaitTimeoutRef.current) {
      maxWaitTimeoutRef.current = setTimeout(() => {
        if (trailing) {
          updateValue(lastValueRef.current);
        }
        maxWaitTimeoutRef.current = undefined;
      }, maxWait);
    }

    // Set up debounce timeout
    if (trailing) {
      timeoutRef.current = setTimeout(() => {
        updateValue(lastValueRef.current);
        lastCallRef.current = Date.now();
        
        if (maxWaitTimeoutRef.current) {
          clearTimeout(maxWaitTimeoutRef.current);
          maxWaitTimeoutRef.current = undefined;
        }
      }, delay);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay, leading, trailing, maxWait, updateValue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (maxWaitTimeoutRef.current) clearTimeout(maxWaitTimeoutRef.current);
    };
  }, []);

  return { debouncedValue, isPending, flush, cancel };
};

// Simpler hook using React 18's useDeferredValue for filter responsiveness
export const useDeferredFilter = <T>(value: T): T => {
  return useDeferredValue(value);
};

// Throttle hook for scroll events
export const useThrottledValue = <T>(value: T, delay: number = 100): T => {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastRan = useRef<number>(Date.now());

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= delay) {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }
    }, delay - (Date.now() - lastRan.current));

    return () => clearTimeout(handler);
  }, [value, delay]);

  return throttledValue;
};

export default useDebouncedValue;
