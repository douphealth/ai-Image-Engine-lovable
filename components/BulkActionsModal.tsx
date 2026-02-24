// components/BulkActionsModal.tsx - Bulk actions for selected posts

import React, { useEffect } from 'react';
import { WordPressPost } from '../types';
import { 
  XIcon, 
  SparklesIcon, 
  ImageIcon, 
  DownloadIcon, 
  EditIcon,
  TrashIcon,
  CheckCircle2
} from './icons/Icons';

interface Props {
  selectedPosts: WordPressPost[];
  onClose: () => void;
  onGenerateAll: () => void;
  onExport: () => void;
}

const BulkActionsModal: React.FC<Props> = ({ 
  selectedPosts, 
  onClose, 
  onGenerateAll,
  onExport 
}) => {
  // Stats
  const stats = {
    total: selectedPosts.length,
    withoutFeatured: selectedPosts.filter(p => p.featured_media === 0 && !p.generatedImage).length,
    zeroImages: selectedPosts.filter(p => p.imageCount === 0).length,
    lowImages: selectedPosts.filter(p => p.imageCount > 0 && p.imageCount < 3).length,
    processed: selectedPosts.filter(p => p.status === 'success').length,
  };

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const actions = [
    {
      id: 'generate-featured',
      icon: <SparklesIcon className="w-5 h-5" />,
      label: 'Generate Featured Images',
      description: `Generate AI images for ${stats.withoutFeatured} posts missing featured images`,
      count: stats.withoutFeatured,
      color: 'brand-primary',
      onClick: onGenerateAll,
      disabled: stats.withoutFeatured === 0,
    },
    {
      id: 'export',
      icon: <DownloadIcon className="w-5 h-5" />,
      label: 'Export Report',
      description: 'Download a JSON report of selected posts and their image status',
      count: stats.total,
      color: 'emerald',
      onClick: onExport,
      disabled: false,
    },
  ];

  return (
    <div 
      className="fixed inset-0 bg-background/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex justify-between items-center p-6 border-b border-border bg-surface-muted/30">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Bulk Actions</h2>
            <p className="text-sm text-muted">{stats.total} posts selected</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl hover:bg-surface-muted transition-colors"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Selection Summary */}
        <div className="p-4 bg-brand-primary/5 border-b border-border">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-2xl font-bold text-text-primary">{stats.total}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Selected</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-500">{stats.withoutFeatured}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted">No Featured</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500">{stats.zeroImages}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Zero Images</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-500">{stats.processed}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Processed</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {actions.map(action => (
              <button
                key={action.id}
                onClick={() => {
                  action.onClick();
                  onClose();
                }}
                disabled={action.disabled}
                className={`
                  w-full text-left p-4 rounded-xl border transition-all
                  ${action.disabled 
                    ? 'opacity-50 cursor-not-allowed border-border bg-surface-muted/30' 
                    : `border-${action.color}-500/20 bg-${action.color}-500/5 hover:bg-${action.color}-500/10 hover:border-${action.color}-500/40`
                  }
                `}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl bg-${action.color}-500/10 text-${action.color}-500`}>
                    {action.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-text-primary">{action.label}</h3>
                      {action.count > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold bg-${action.color}-500/10 text-${action.color}-500`}>
                          {action.count}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary mt-1">{action.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-border bg-surface-muted/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium bg-surface border border-border rounded-xl hover:border-brand-primary transition-colors"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );
};

export default BulkActionsModal;
