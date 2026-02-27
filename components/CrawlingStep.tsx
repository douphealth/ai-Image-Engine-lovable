// components/CrawlingStep.tsx - Premium Crawling Dashboard

import React, { useMemo, useEffect, useState } from 'react';
import { CrawlProgress } from '../types';
import { 
  Loader, 
  ImageIcon, 
  SearchIcon, 
  CheckCircle2, 
  ZapIcon, 
  TrendingUpIcon,
  AlertTriangle,
  XIcon,
  RefreshCwIcon
} from './icons/Icons';

import type { FetchStats } from '../App';

interface Props {
  progress: CrawlProgress;
  error?: string | null;
  stats?: FetchStats | null;
  onCancel?: () => void;
}

const useAnimatedCounter = (target: number, duration: number = 500): number => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const startValue = value;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(startValue + (target - startValue) * easeOut));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);
  return value;
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const CrawlingStep: React.FC<Props> = ({ progress, error, stats, onCancel }) => {
  const [showDetails, setShowDetails] = useState(false);

  const percentage = useMemo(() => {
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  }, [progress.current, progress.total]);

  const animatedPercentage = useAnimatedCounter(percentage, 300);
  const animatedCurrent = useAnimatedCounter(progress.current, 300);

  const estimatedTimeRemaining = useMemo(() => {
    if (!stats || stats.elapsedMs === 0 || progress.current === 0) return null;
    const remaining = progress.total - progress.current;
    const rate = progress.current / stats.elapsedMs;
    const remainingMs = remaining / rate;
    if (remainingMs < 1000) return 'Almost done!';
    return `~${formatTime(remainingMs)} remaining`;
  }, [stats, progress]);

  const phases = useMemo(() => [
    { id: 'fetching', label: 'Fetching', icon: <SearchIcon className="w-4 h-4" /> },
    { id: 'analyzing', label: 'Analyzing', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'complete', label: 'Done', icon: <CheckCircle2 className="w-4 h-4" /> },
  ], []);
  const currentPhaseIndex = phases.findIndex(p => p.id === progress.phase);

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center bg-surface rounded-3xl shadow-2xl shadow-danger/5 p-10 max-w-2xl mx-auto animate-fade-in border border-danger/20 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-danger" />
        <div className="w-16 h-16 bg-danger/10 rounded-2xl flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-danger" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Connection Error</h2>
        <p className="text-text-secondary text-center max-w-md mb-8 text-sm leading-relaxed">{error}</p>
        <button 
          onClick={onCancel}
          className="px-6 py-2.5 bg-surface border border-border rounded-xl text-sm font-semibold hover:border-brand-primary hover:text-brand-primary transition-all"
        >
          ← Back to Configuration
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center bg-surface rounded-3xl shadow-2xl shadow-brand-primary/5 p-10 max-w-3xl mx-auto animate-fade-in border border-border relative overflow-hidden">
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent animate-gradient" />
      
      {/* Animated Icon */}
      <div className="relative mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-brand-primary/15 to-brand-secondary/15 rounded-2xl flex items-center justify-center">
          {stats?.cachedHit ? (
            <ZapIcon className="w-10 h-10 text-success" />
          ) : (
            <Loader className="w-10 h-10 text-brand-primary animate-spin" />
          )}
        </div>
      </div>

      {/* Cache Hit Banner */}
      {stats?.cachedHit && (
        <div className="mb-6 px-5 py-3 bg-success/8 border border-success/15 rounded-xl flex items-center gap-3">
          <ZapIcon className="w-4 h-4 text-success" />
          <div>
            <p className="text-sm font-bold text-success">Instant Cache Hit</p>
            <p className="text-xs text-success/70">Posts loaded from local storage</p>
          </div>
        </div>
      )}

      {/* Phase Stepper */}
      <div className="flex items-center gap-2 mb-6">
        {phases.map((phase, i) => (
          <React.Fragment key={phase.id}>
            <div className={`
              flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all
              ${i < currentPhaseIndex ? 'bg-success/10 text-success' :
                i === currentPhaseIndex ? 'bg-brand-primary/10 text-brand-primary scale-105' :
                'bg-surface-muted text-muted'}
            `}>
              {i < currentPhaseIndex ? <CheckCircle2 className="w-3.5 h-3.5" /> : phase.icon}
              <span>{phase.label}</span>
            </div>
            {i < phases.length - 1 && (
              <div className={`w-6 h-0.5 rounded ${i < currentPhaseIndex ? 'bg-success' : 'bg-border'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Title */}
      <h2 className="text-2xl font-extrabold text-text-primary mb-1 tracking-tight">
        {progress.phase === 'fetching' && 'Fetching Posts'}
        {progress.phase === 'analyzing' && 'Analyzing Content'}
        {progress.phase === 'complete' && 'Complete'}
        {!progress.phase && 'Initializing...'}
      </h2>
      <p className="text-sm text-text-muted mb-8 text-center max-w-md">
        {stats?.cachedHit 
          ? 'Posts loaded from cache — ready to optimize!'
          : progress.phase === 'fetching' 
            ? 'Adaptive parallel requests for maximum throughput...'
            : progress.phase === 'analyzing' 
              ? 'Scanning content for images and quality...'
              : 'Preparing your posts for optimization'}
      </p>

      {/* Progress Bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex justify-between text-xs text-muted mb-2">
          <span className="font-mono text-[11px]">{progress.phase === 'analyzing' ? 'Analyzing' : 'Fetching'}</span>
          <span className="font-bold text-brand-primary">{animatedPercentage}%</span>
        </div>
        <div className="h-3 bg-surface-muted rounded-full overflow-hidden border border-border">
          <div
            className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary rounded-full transition-all duration-300 ease-out relative"
            style={{ width: `${percentage}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer" />
          </div>
        </div>
      </div>

      {/* Main Stats */}
      <div className="flex items-center gap-8 text-center mb-8">
        <div>
          <div className="text-3xl font-extrabold text-brand-primary tabular-nums">{animatedCurrent.toLocaleString()}</div>
          <div className="text-[10px] text-muted uppercase tracking-wider font-semibold mt-1">
            {progress.phase === 'analyzing' ? 'Analyzed' : 'Fetched'}
          </div>
        </div>
        <div className="h-10 w-px bg-border" />
        <div>
          <div className="text-3xl font-extrabold text-text-primary tabular-nums">{progress.total.toLocaleString()}</div>
          <div className="text-[10px] text-muted uppercase tracking-wider font-semibold mt-1">Total</div>
        </div>
        {stats && !stats.cachedHit && (
          <>
            <div className="h-10 w-px bg-border" />
            <div>
              <div className="text-3xl font-extrabold text-success tabular-nums">{stats.postsPerSecond}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider font-semibold mt-1">Posts/sec</div>
            </div>
          </>
        )}
      </div>

      {/* Live Metrics Grid */}
      {stats && !stats.cachedHit && (
        <div className="w-full max-w-lg grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-6">
          {[
            { label: 'Threads', value: stats.concurrency, color: 'text-brand-primary' },
            { label: 'Avg Response', value: `${stats.avgResponseTime || '-'}ms`, color: 'text-success' },
            { label: 'Batch Size', value: stats.batchSize, color: 'text-warning' },
            { label: 'Elapsed', value: formatTime(stats.elapsedMs), color: 'text-text-primary' },
          ].map(m => (
            <div key={m.label} className="bg-surface-muted/50 rounded-xl p-3 text-center border border-border">
              <div className={`text-lg font-extrabold tabular-nums ${m.color}`}>{m.value}</div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Expandable Details */}
      {stats && !stats.cachedHit && (
        <div className="w-full max-w-lg">
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between px-4 py-2 bg-surface-muted/30 rounded-xl border border-border text-xs font-medium text-muted hover:text-text-secondary transition-all"
          >
            <span>Technical Details</span>
            <span className={`transform transition-transform ${showDetails ? 'rotate-180' : ''}`}>▼</span>
          </button>
          
          {showDetails && (
            <div className="mt-2 p-4 bg-surface-muted/20 rounded-xl border border-border space-y-2 animate-fade-in">
              {[
                ['Requests', `${stats.requestsCompleted} / ${stats.totalRequests}`],
                ['Downloaded', formatBytes(stats.bytesDownloaded)],
                ['Throughput', `${stats.postsPerSecond} posts/sec`],
                ['Concurrency', `${stats.concurrency} threads`],
                ['Cache', 'IndexedDB + LRU'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-muted">{k}:</span>
                  <span className="font-mono text-text-secondary">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Time Estimate */}
      {estimatedTimeRemaining && !stats?.cachedHit && (
        <p className="mt-6 text-sm text-muted flex items-center gap-2">
          <TrendingUpIcon className="w-4 h-4" />
          {estimatedTimeRemaining}
        </p>
      )}

      {/* Cancel Button */}
      {onCancel && progress.phase !== 'complete' && (
        <button
          onClick={onCancel}
          className="mt-6 flex items-center gap-2 px-5 py-2 text-sm font-medium text-danger bg-danger/8 border border-danger/15 rounded-xl hover:bg-danger/15 transition-all"
        >
          <XIcon className="w-4 h-4" />
          Cancel
        </button>
      )}

      {/* Refresh Cache */}
      {stats?.cachedHit && onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 flex items-center gap-2 px-5 py-2 text-sm font-medium text-text-secondary bg-surface border border-border rounded-xl hover:border-brand-primary hover:text-brand-primary transition-all"
        >
          <RefreshCwIcon className="w-4 h-4" />
          Force Refresh
        </button>
      )}
    </div>
  );
};

export default CrawlingStep;
