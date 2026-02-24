// components/GenerationModal.tsx - Enhanced with queue state visualization

import React, { useEffect, useMemo } from 'react';
import { WordPressPost } from '../types';
import { QueueState } from '../hooks/useJobQueue';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Loader, 
  XIcon, 
  BanIcon, 
  PauseIcon, 
  PlayIcon 
} from './icons/Icons';

interface Props {
  posts: WordPressPost[];
  queueState: QueueState;
  onClose: () => void;
  onCancelAll: () => void;
  onPause: () => void;
  onResume: () => void;
}

const StatusIcon: React.FC<{ status?: string }> = ({ status }) => {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case 'error':
      return <AlertTriangle className="w-5 h-5 text-red-500" />;
    case 'cancelled':
      return <BanIcon className="w-5 h-5 text-amber-500" />;
    default:
      return <Loader className="w-5 h-5 text-brand-primary animate-spin" />;
  }
};

const GenerationModal: React.FC<Props> = ({
  posts,
  queueState,
  onClose,
  onCancelAll,
  onPause,
  onResume,
}) => {
  const activeJobs = useMemo(
    () => posts.filter(p => p.status && !['success', 'error', 'cancelled', 'idle'].includes(p.status)),
    [posts]
  );
  
  const completedJobs = useMemo(
    () => posts.filter(p => ['success', 'error', 'cancelled'].includes(p.status || '')),
    [posts]
  );

  const isRunning = queueState.isProcessing && !queueState.isPaused;
  const progress = queueState.totalJobs > 0 
    ? Math.round((queueState.completedJobs / queueState.totalJobs) * 100) 
    : 0;

  // Lock body scroll
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4 sm:p-6 animate-fade-in">
      <div className="bg-surface rounded-3xl shadow-2xl w-full max-w-2xl border border-border max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex justify-between items-center p-6 border-b border-border bg-surface-muted/30">
          <div>
            <h2 className="text-xl font-black text-text-primary tracking-tight">
              Processing Queue
            </h2>
            <p className="text-xs font-medium text-muted mt-1">
              {queueState.completedJobs} of {queueState.totalJobs} completed
              {queueState.failedJobs > 0 && ` • ${queueState.failedJobs} failed`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted hover:bg-surface-muted hover:text-text-primary transition-all"
            aria-label="Close"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-2 text-xs text-muted">
            <span>{progress}% complete</span>
            <span>{queueState.activeJobs} active</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Jobs */}
          {activeJobs.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary mb-3 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
                Active
              </h3>
              <div className="space-y-2">
                {activeJobs.map(post => (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/10"
                  >
                    <StatusIcon status={post.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {post.title.rendered}
                      </p>
                      <p className="text-xs text-brand-primary">
                        {post.statusMessage}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Completed Jobs */}
          {completedJobs.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">
                Completed ({completedJobs.length})
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {completedJobs.map(post => (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 p-3 bg-surface-muted/50 rounded-xl border border-border/50"
                  >
                    <StatusIcon status={post.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-secondary truncate">
                        {post.title.rendered}
                      </p>
                      {post.status === 'error' && (
                        <p className="text-xs text-red-500 truncate">
                          {post.statusMessage}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {!isRunning && activeJobs.length === 0 && completedJobs.length > 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-bold text-text-primary">All Done!</h3>
              <p className="text-sm text-muted mt-1">
                {queueState.completedJobs - queueState.failedJobs} successful
                {queueState.failedJobs > 0 && `, ${queueState.failedJobs} failed`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-6 border-t border-border flex justify-between items-center bg-surface-muted/30">
          <div className="flex items-center gap-3">
            {isRunning && (
              <>
                <button
                  onClick={onPause}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-surface border border-border hover:border-amber-500 hover:text-amber-500 transition-all"
                >
                  <PauseIcon className="w-4 h-4" />
                  Pause
                </button>
                <button
                  onClick={onCancelAll}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl text-red-500 border border-red-500/20 hover:bg-red-500/10 transition-all"
                >
                  Cancel All
                </button>
              </>
            )}
            {queueState.isPaused && (
              <button
                onClick={onResume}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-brand-primary text-white hover:bg-brand-primary/90 transition-all"
              >
                <PlayIcon className="w-4 h-4" />
                Resume
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-bold rounded-xl bg-text-primary text-surface hover:bg-brand-primary transition-all"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};

export default GenerationModal;
