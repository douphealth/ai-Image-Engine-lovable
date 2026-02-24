// components/CrawlingStep.tsx - SOTA Enterprise Crawling Dashboard with Live Performance Metrics

import React, { useMemo, useEffect, useState, useCallback } from 'react';
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

// Import FetchStats type from App or define locally
interface FetchStats {
  concurrency: number;
  batchSize: number;
  avgResponseTime: number;
  requestsCompleted: number;
  totalRequests: number;
  cachedHit: boolean;
  elapsedMs: number;
  postsPerSecond: number;
  bytesDownloaded: number;
  serverResponseCode: number;
}

interface Props {
  progress: CrawlProgress;
  error?: string | null;
  stats?: FetchStats | null;
  onCancel?: () => void;  // NEW
}


// Animated counter hook
const useAnimatedCounter = (target: number, duration: number = 500): number => {
  const [value, setValue] = useState(0);
  
  useEffect(() => {
    const startValue = value;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out quad
      const easeOut = 1 - (1 - progress) * (1 - progress);
      const newValue = Math.round(startValue + (target - startValue) * easeOut);
      
      setValue(newValue);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [target, duration]);
  
  return value;
};

// Format bytes to human readable
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Format time
const formatTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const CrawlingStep: React.FC<Props> = ({ progress, error, stats, onCancel }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [historicalStats, setHistoricalStats] = useState<FetchStats[]>([]);
  
  // Track stats history for visualization
  useEffect(() => {
    if (stats && !stats.cachedHit) {
      setHistoricalStats(prev => [...prev.slice(-30), stats]);
    }
  }, [stats]);

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

  const speedIndicator = useMemo(() => {
    if (!stats) return null;
    
    if (stats.cachedHit) return { label: 'INSTANT', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    if (stats.postsPerSecond > 100) return { label: 'BLAZING', color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
    if (stats.postsPerSecond > 50) return { label: 'FAST', color: 'text-brand-primary', bg: 'bg-brand-primary/10' };
    if (stats.postsPerSecond > 20) return { label: 'GOOD', color: 'text-amber-500', bg: 'bg-amber-500/10' };
    return { label: 'MODERATE', color: 'text-orange-500', bg: 'bg-orange-500/10' };
  }, [stats]);

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center bg-surface rounded-2xl shadow-xl p-8 max-w-2xl mx-auto animate-fade-in border border-red-500/20">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Connection Error</h2>
        <p className="text-text-secondary text-center max-w-md mb-6">{error}</p>
        <button 
          onClick={onCancel}
          className="px-6 py-2 bg-surface border border-border rounded-xl text-sm font-bold hover:border-brand-primary transition-all"
        >
          Back to Configuration
        </button>
      </div>
    );
  }

  // Phase definitions
  const phases = [
    { id: 'fetching', label: 'Fetching Posts', icon: <SearchIcon className="w-5 h-5" />, description: 'Parallel HTTP requests' },
    { id: 'analyzing', label: 'Analyzing Content', icon: <ImageIcon className="w-5 h-5" />, description: 'Image detection' },
    { id: 'complete', label: 'Complete', icon: <CheckCircle2 className="w-5 h-5" />, description: 'Ready!' },
  ];

  const currentPhaseIndex = phases.findIndex(p => p.id === progress.phase);

  return (
    <div className="flex flex-col items-center justify-center bg-surface rounded-2xl shadow-xl p-8 max-w-3xl mx-auto animate-fade-in border border-border">
      
      {/* Animated Icon with Speed Indicator */}
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-gradient-to-br from-brand-primary/20 to-brand-secondary/20 rounded-full flex items-center justify-center">
          {stats?.cachedHit ? (
            <ZapIcon className="w-12 h-12 text-emerald-500" />
          ) : (
            <Loader className="w-12 h-12 text-brand-primary animate-spin" />
          )}
        </div>
        <div className="absolute inset-0 bg-brand-primary/10 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
        
        {/* Speed Badge */}
        {speedIndicator && (
          <div className={`absolute -top-2 -right-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${speedIndicator.bg} ${speedIndicator.color} border border-current/20`}>
            {speedIndicator.label}
          </div>
        )}
      </div>

      {/* Cache Hit Banner */}
      {stats?.cachedHit && (
        <div className="mb-6 px-6 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3">
          <ZapIcon className="w-5 h-5 text-emerald-500" />
          <div>
            <p className="text-sm font-bold text-emerald-600">Lightning Cache Hit!</p>
            <p className="text-xs text-emerald-600/70">Posts loaded instantly from local storage</p>
          </div>
        </div>
      )}

      {/* Phase Indicator */}
      <div className="flex items-center gap-2 mb-6">
        {phases.map((phase, i) => (
          <React.Fragment key={phase.id}>
            <div className={`
              flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all
              ${i < currentPhaseIndex ? 'bg-emerald-500/10 text-emerald-500' :
                i === currentPhaseIndex ? 'bg-brand-primary/10 text-brand-primary scale-105' :
                'bg-surface-muted text-muted'}
            `}>
              {i < currentPhaseIndex ? <CheckCircle2 className="w-4 h-4" /> : phase.icon}
              <div className="text-left">
                <span className="block">{phase.label}</span>
                {i === currentPhaseIndex && (
                  <span className="block text-[10px] font-normal opacity-70">{phase.description}</span>
                )}
              </div>
            </div>
            {i < phases.length - 1 && (
              <div className={`w-8 h-0.5 rounded ${i < currentPhaseIndex ? 'bg-emerald-500' : 'bg-border'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Title */}
      <h2 className="text-2xl font-black text-text-primary mb-2 tracking-tight">
        {progress.phase === 'fetching' && 'Fetching Posts'}
        {progress.phase === 'analyzing' && 'Analyzing Content'}
        {progress.phase === 'complete' && 'Processing Complete'}
        {!progress.phase && 'Initializing...'}
      </h2>
      <p className="text-text-secondary mb-8 text-center max-w-md">
        {stats?.cachedHit 
          ? 'Posts loaded from cache - ready to optimize your images!'
          : progress.phase === 'fetching' 
            ? 'Using adaptive parallel requests for maximum speed...'
            : progress.phase === 'analyzing' 
              ? 'Scanning content for images and analyzing quality...'
              : 'Preparing your posts for optimization!'}
      </p>

      {/* Progress Bar */}
      <div className="w-full max-w-lg mb-6">
        <div className="flex justify-between text-xs text-muted mb-2">
          <span className="font-mono">{progress.phase === 'analyzing' ? 'Analyzing' : 'Fetching'}</span>
          <span className="font-bold text-brand-primary">{animatedPercentage}%</span>
        </div>
        <div className="h-4 bg-surface-muted rounded-full overflow-hidden border border-border relative">
          <div
            className="h-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite] transition-all duration-300 ease-out rounded-full"
            style={{ width: `${percentage}%` }}
          />
          {/* Shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_1.5s_linear_infinite]" />
        </div>
      </div>

      {/* Main Stats */}
      <div className="flex items-center gap-8 text-center mb-8">
        <div className="relative">
          <div className="text-4xl font-black text-brand-primary tabular-nums">{animatedCurrent.toLocaleString()}</div>
          <div className="text-xs text-muted uppercase tracking-wider font-bold">
            {progress.phase === 'analyzing' ? 'Analyzed' : 'Fetched'}
          </div>
        </div>
        <div className="h-12 w-px bg-border" />
        <div>
          <div className="text-4xl font-black text-text-primary tabular-nums">{progress.total.toLocaleString()}</div>
          <div className="text-xs text-muted uppercase tracking-wider font-bold">Total</div>
        </div>
        {stats && !stats.cachedHit && (
          <>
            <div className="h-12 w-px bg-border" />
            <div>
              <div className="text-4xl font-black text-emerald-500 tabular-nums">{stats.postsPerSecond}</div>
              <div className="text-xs text-muted uppercase tracking-wider font-bold">Posts/sec</div>
            </div>
          </>
        )}
      </div>

      {/* Live Performance Metrics Grid */}
      {stats && !stats.cachedHit && (
        <div className="w-full max-w-lg grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-surface-muted/50 rounded-xl p-3 text-center border border-border">
            <div className="text-2xl font-black text-brand-primary tabular-nums">
              {stats.concurrency}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Parallel Threads
            </div>
          </div>
          <div className="bg-surface-muted/50 rounded-xl p-3 text-center border border-border">
            <div className="text-2xl font-black text-emerald-500 tabular-nums">
              {stats.avgResponseTime || '-'}
              <span className="text-sm font-normal text-muted">ms</span>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Avg Response
            </div>
          </div>
          <div className="bg-surface-muted/50 rounded-xl p-3 text-center border border-border">
            <div className="text-2xl font-black text-amber-500 tabular-nums">
              {stats.batchSize}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Batch Size
            </div>
          </div>
          <div className="bg-surface-muted/50 rounded-xl p-3 text-center border border-border">
            <div className="text-2xl font-black text-text-primary tabular-nums">
              {formatTime(stats.elapsedMs)}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Elapsed
            </div>
          </div>
        </div>
      )}

      {/* Expandable Technical Details */}
      {stats && !stats.cachedHit && (
        <div className="w-full max-w-lg">
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between px-4 py-2 bg-surface-muted/30 rounded-xl border border-border text-xs font-medium text-muted hover:text-text-secondary hover:bg-surface-muted/50 transition-all"
          >
            <span>Technical Details</span>
            <span className={`transform transition-transform ${showDetails ? 'rotate-180' : ''}`}>▼</span>
          </button>
          
          {showDetails && (
            <div className="mt-3 p-4 bg-surface-muted/20 rounded-xl border border-border space-y-2 animate-fade-in">
              <div className="flex justify-between text-xs">
                <span className="text-muted">Requests Completed:</span>
                <span className="font-mono text-text-secondary">{stats.requestsCompleted} / {stats.totalRequests}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Data Downloaded:</span>
                <span className="font-mono text-text-secondary">{formatBytes(stats.bytesDownloaded)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Throughput:</span>
                <span className="font-mono text-text-secondary">{stats.postsPerSecond} posts/sec</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Adaptive Concurrency:</span>
                <span className="font-mono text-emerald-500">{stats.concurrency} threads</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted">Cache Strategy:</span>
                <span className="font-mono text-text-secondary">IndexedDB + LRU</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Time Estimate */}
      {estimatedTimeRemaining && !stats?.cachedHit && (
        <p className="mt-6 text-sm text-muted animate-pulse flex items-center gap-2">
          <TrendingUpIcon className="w-4 h-4" />
          {estimatedTimeRemaining}
        </p>
      )}

      {/* Cancel Button */}
      {onCancel && progress.phase !== 'complete' && (
        <button
          onClick={onCancel}
          className="mt-6 flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all"
        >
          <XIcon className="w-4 h-4" />
          Cancel
        </button>
      )}

      {/* Tips */}
      <div className="mt-8 p-4 bg-surface-muted/50 rounded-xl border border-border max-w-lg">
        <p className="text-xs text-muted text-center flex items-center justify-center gap-2">
          <span className="text-lg">💡</span>
          <span>
            {stats?.cachedHit 
              ? 'Posts are cached for 24 hours. Click "Rescan" to fetch fresh data.'
              : 'Posts will be sorted by priority - those missing images appear first.'}
          </span>
        </p>
      </div>

      {/* Refresh Cache Button (only shown when cached) */}
      {stats?.cachedHit && onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary bg-surface border border-border rounded-xl hover:border-brand-primary hover:text-brand-primary transition-all"
        >
          <RefreshCwIcon className="w-4 h-4" />
          Force Refresh (Bypass Cache)
        </button>
      )}
    </div>
  );
};

export default CrawlingStep;
