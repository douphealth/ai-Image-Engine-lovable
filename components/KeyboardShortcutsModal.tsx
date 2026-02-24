// components/KeyboardShortcutsModal.tsx - Keyboard shortcuts help modal

import React, { useEffect } from 'react';
import { XIcon, KeyboardIcon } from './icons/Icons';

interface Props {
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{ keys: string[]; description: string }>;
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['J'], description: 'Move to next post' },
      { keys: ['K'], description: 'Move to previous post' },
      { keys: ['/'], description: 'Focus search input' },
      { keys: ['Esc'], description: 'Close modals / Clear focus' },
    ],
  },
  {
    title: 'Selection & Actions',
    shortcuts: [
      { keys: ['Space'], description: 'Select/deselect focused post' },
      { keys: ['Ctrl', 'A'], description: 'Select all visible posts' },
      { keys: ['Enter'], description: 'Generate image for focused post' },
    ],
  },
  {
    title: 'Views & Modals',
    shortcuts: [
      { keys: ['G'], description: 'Open image gallery for focused post' },
      { keys: ['I'], description: 'Open image insertion modal' },
      { keys: ['Shift', '?'], description: 'Show this help' },
    ],
  },
  {
    title: 'Filters (Quick Access)',
    shortcuts: [
      { keys: ['1'], description: 'All posts' },
      { keys: ['2'], description: 'No featured image' },
      { keys: ['3'], description: 'Zero images in content' },
      { keys: ['4'], description: 'Low images (<3)' },
      { keys: ['5'], description: 'Needs work' },
    ],
  },
  {
    title: 'App Controls',
    shortcuts: [
      { keys: ['Alt', 'T'], description: 'Toggle dark/light theme' },
      { keys: ['Alt', 'H'], description: 'Go to home/welcome' },
      { keys: ['Alt', 'C'], description: 'Go to configuration' },
    ],
  },
];

const KeyboardShortcutsModal: React.FC<Props> = ({ onClose }) => {
  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-background/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex justify-between items-center p-6 border-b border-border bg-surface-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary/10 rounded-lg">
              <KeyboardIcon className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">Keyboard Shortcuts</h2>
              <p className="text-xs text-muted">Navigate faster with your keyboard</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl hover:bg-surface-muted transition-colors"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {shortcutGroups.map((group, gi) => (
              <div key={gi} className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, si) => (
                    <div 
                      key={si}
                      className="flex items-center justify-between p-3 bg-surface-muted/50 rounded-xl border border-border"
                    >
                      <span className="text-sm text-text-secondary">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, ki) => (
                          <React.Fragment key={ki}>
                            {ki > 0 && <span className="text-xs text-muted">+</span>}
                            <kbd className="px-2 py-1 bg-surface border border-border rounded-lg text-xs font-bold text-text-primary min-w-[24px] text-center">
                              {key}
                            </kbd>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-border bg-surface-muted/30 text-center">
          <p className="text-xs text-muted">
            Press <kbd className="px-1.5 py-0.5 bg-surface rounded border border-border text-[10px]">Esc</kbd> to close
          </p>
        </footer>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
