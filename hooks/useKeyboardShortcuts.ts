// hooks/useKeyboardShortcuts.ts - Global keyboard shortcuts

import { useEffect, useCallback, useRef } from 'react';

type ShortcutHandler = (event: KeyboardEvent) => void;
type ShortcutMap = Record<string, ShortcutHandler>;

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  preventDefault?: boolean;
}

export const useKeyboardShortcuts = (
  shortcuts: ShortcutMap,
  options: UseKeyboardShortcutsOptions = {}
) => {
  const { enabled = true, preventDefault = true } = options;
  const shortcutsRef = useRef(shortcuts);
  
  // Update ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;
    
    // Ignore if user is typing in an input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Allow escape in inputs
      if (event.key !== 'Escape') return;
    }

    // Build shortcut string
    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    
    // Handle special keys
    const key = event.key.toLowerCase();
    if (key === ' ') parts.push('space');
    else if (key === 'escape') parts.push('escape');
    else if (key === 'enter') parts.push('enter');
    else if (key === 'arrowup') parts.push('up');
    else if (key === 'arrowdown') parts.push('down');
    else if (key === 'arrowleft') parts.push('left');
    else if (key === 'arrowright') parts.push('right');
    else if (key === '?') parts.push('?');
    else if (key.length === 1) parts.push(key);
    else return;

    const shortcut = parts.join('+');
    const handler = shortcutsRef.current[shortcut];

    if (handler) {
      if (preventDefault) event.preventDefault();
      handler(event);
    }
  }, [enabled, preventDefault]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

export default useKeyboardShortcuts;
