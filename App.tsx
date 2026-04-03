// App.tsx - Refactored: Clean orchestration layer
// Heavy logic extracted to services/postCache.ts, services/rateController.ts, services/ultraFetch.ts

import React, { useState, useCallback, useEffect, useMemo, Suspense, lazy, useRef } from 'react';
import { AppState, Configuration, CrawlProgress, WordPressPost, AppStats, ContentImage, PostImageAnalysis } from './types';
import { AppIcon, GeminiIcon, SunIcon, MoonIcon, Loader, KeyboardIcon, ZapIcon } from './components/icons/Icons';
import { startCacheCleanup, stopCacheCleanup } from './services/cache';
import { getErrorMessage } from './services/errors';
import { usePersistence } from './hooks/usePersistence';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PostCache } from './services/postCache';
import { AdaptiveRateController } from './services/rateController';
import { ultraFetchAllPosts, FetchStats } from './services/ultraFetch';
import { extractContentImages as extractImages } from './services/imageUtils';

// Lazy load heavy components
const WelcomeStep = lazy(() => import('./components/WelcomeStep'));
const ConfigurationStep = lazy(() => import('./components/ConfigurationStep'));
const CrawlingStep = lazy(() => import('./components/CrawlingStep'));
const ResultsStep = lazy(() => import('./components/ResultsStep'));
const KeyboardShortcutsModal = lazy(() => import('./components/KeyboardShortcutsModal'));

// Re-export FetchStats for CrawlingStep
export type { FetchStats } from './services/ultraFetch';

// ============================================================
// LOADING FALLBACK
// ============================================================
const StepLoader: React.FC = () => (
  <div className="flex flex-col items-center justify-center min-h-[400px] bg-surface rounded-2xl border border-border">
    <Loader className="w-12 h-12 text-brand-primary animate-spin mb-4" />
    <p className="text-text-secondary font-medium">Loading...</p>
  </div>
);

// ============================================================
// THEME HOOK
// ============================================================
const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedTheme = window.localStorage.getItem('theme');
      if (storedTheme) return storedTheme;
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, toggleTheme };
};

// ============================================================
// MAIN APP COMPONENT
// ============================================================
const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.Welcome);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [posts, setPosts] = useState<WordPressPost[]>([]);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress>({ current: 0, total: 0, phase: 'fetching' });
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [fetchStats, setFetchStats] = useState<FetchStats | null>(null);
  
  const postCacheRef = useRef(new PostCache());
  const rateControllerRef = useRef(new AdaptiveRateController());
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const { theme, toggleTheme } = useTheme();
  const persistence = usePersistence();

  const appStats = useMemo<AppStats>(() => {
    const totalPosts = posts.length;
    const postsWithoutFeatured = posts.filter(p => p.featured_media === 0 && !p.generatedImage).length;
    const postsWithZeroImages = posts.filter(p => p.imageCount === 0).length;
    const postsWithLowImages = posts.filter(p => p.imageCount > 0 && p.imageCount < 3).length;
    const postsProcessed = posts.filter(p => p.status === 'success').length;
    const totalImages = posts.reduce((sum, p) => sum + p.imageCount, 0);
    
    return {
      totalPosts,
      postsWithoutFeatured,
      postsWithZeroImages,
      postsWithLowImages,
      postsProcessed,
      totalImagesGenerated: postsProcessed,
      averageImagesPerPost: totalPosts > 0 ? totalImages / totalPosts : 0,
    };
  }, [posts]);

  useEffect(() => {
    startCacheCleanup();
    postCacheRef.current.init().catch(console.error);
    return () => stopCacheCleanup();
  }, []);

  useKeyboardShortcuts({
    'shift+?': () => setShowShortcuts(true),
    'escape': () => setShowShortcuts(false),
    'alt+t': toggleTheme,
    'alt+h': () => setAppState(AppState.Welcome),
    'alt+c': () => config && setAppState(AppState.Configuration),
  });

  // ============================================================
  // IMAGE ANALYSIS - Uses shared extractContentImages
  // ============================================================
  const analyzePostsImages = useCallback(async (
    postsToAnalyze: WordPressPost[],
    onProgress: (analyzed: number) => void
  ): Promise<WordPressPost[]> => {
    const results: WordPressPost[] = [];
    const chunkSize = 25;
    let lastYield = performance.now();

    for (let i = 0; i < postsToAnalyze.length; i++) {
      const post = postsToAnalyze[i];
      const contentImages = extractImages(post);
      
      const pCount = (post.content.rendered.match(/<p/g) || []).length;
      const imageAnalysis: PostImageAnalysis = {
        contentImages,
        insertionPoints: [],
        imageGaps: [],
        averageImageDistance: pCount / Math.max(1, contentImages.length),
        recommendedImageCount: Math.ceil((post.wordCount || 0) / 300),
        qualityScore: Math.min(100, (contentImages.length * 20) + (post.featured_media ? 50 : 0)),
        paragraphCount: pCount,
      };

      results.push({
        ...post,
        imageCount: contentImages.length,
        paragraphCount: imageAnalysis.paragraphCount,
        contentImages,
        imageAnalysis,
      });

      if (i % 5 === 0) onProgress(i + 1);
      if (i % chunkSize === 0 || (performance.now() - lastYield) > 16) {
        await new Promise(resolve => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    
    onProgress(postsToAnalyze.length);
    return results;
  }, []);

  // ============================================================
  // CRAWLING HANDLER - Uses extracted ultraFetch
  // ============================================================
  const handleStartCrawling = useCallback(async (newConfig: Configuration) => {
    setConfig(newConfig);
    setAppState(AppState.Crawling);
    setPosts([]);
    setCrawlError(null);
    setFetchStats(null);
    persistence.saveConfig(newConfig);

    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const fetchedPosts = await ultraFetchAllPosts(
        newConfig,
        postCacheRef.current,
        rateControllerRef.current,
        controller,
        (progress, stats) => {
          setCrawlProgress(progress as CrawlProgress);
          setFetchStats(stats);
        }
      );

      if (fetchedPosts.length === 0) {
        throw new Error('No posts were fetched. Please check your WordPress credentials and ensure the REST API is enabled.');
      }

      setCrawlProgress({ current: 0, total: fetchedPosts.length, phase: 'analyzing' });
      
      const analyzedPosts = await analyzePostsImages(fetchedPosts, (analyzed) => {
        setCrawlProgress({ current: analyzed, total: fetchedPosts.length, phase: 'analyzing' });
      });

      const sortedPosts = analyzedPosts.sort((a, b) => {
        const getScore = (p: WordPressPost) => {
          let score = 0;
          if (p.featured_media === 0) score += 1000;
          if (p.imageCount === 0) score += 500;
          else if (p.imageCount < 3) score += 200;
          score += (100 - Math.min(p.imageCount * 10, 100));
          return score;
        };
        return getScore(b) - getScore(a);
      });

      setPosts(sortedPosts);
      persistence.savePosts(sortedPosts);
      setCrawlProgress({ current: sortedPosts.length, total: sortedPosts.length, phase: 'complete' });
      setAppState(AppState.Results);
      
    } catch (error) {
      console.error("Crawling failed:", error);
      setCrawlError(getErrorMessage(error));
    }
  }, [persistence, analyzePostsImages]);

  const handleCancelCrawling = useCallback(() => {
    abortControllerRef.current?.abort();
    setAppState(AppState.Configuration);
    setCrawlError('Crawling cancelled by user');
  }, []);

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort();
    setAppState(AppState.Welcome);
    setConfig(null);
    setPosts([]);
    setCrawlProgress({ current: 0, total: 0 });
    setCrawlError(null);
    setFetchStats(null);
    persistence.clearAll();
    postCacheRef.current.clearCache().catch(console.error);
  }, [persistence]);

  const handleBackToConfig = useCallback(() => {
    setAppState(AppState.Configuration);
  }, []);

  const handleUpdatePosts = useCallback((updatedPosts: WordPressPost[]) => {
    setPosts(updatedPosts);
    persistence.savePosts(updatedPosts);
  }, [persistence]);

  // ============================================================
  // RENDER
  // ============================================================
  const renderContent = () => {
    switch (appState) {
      case AppState.Welcome:
        return <WelcomeStep onGetStarted={() => setAppState(AppState.Configuration)} />;
      case AppState.Configuration:
        return (
          <ConfigurationStep 
            onConfigure={handleStartCrawling} 
            initialConfig={persistence.loadConfig() ?? undefined}
          />
        );
      case AppState.Crawling:
        return (
          <CrawlingStep 
            progress={crawlProgress} 
            error={crawlError}
            stats={fetchStats}
            onCancel={handleCancelCrawling}
          />
        );
      case AppState.Results:
        return config ? (
          <ResultsStep 
            initialPosts={posts} 
            config={config} 
            onReset={handleReset}
            onBackToConfig={handleBackToConfig}
            onUpdatePosts={handleUpdatePosts}
            persistence={persistence}
            appStats={appStats}
          />
        ) : null;
      default:
        return <div>Unknown state</div>;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="h-0.5 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent" />
      
      <header className="w-full border-b border-border bg-surface/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-3">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleReset}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="w-9 h-9 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-xl flex items-center justify-center shadow-sm">
                <AppIcon className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-text-primary tracking-tight hidden sm:block">AI Image Engine</span>
            </button>
            <a 
              href="https://affiliatemarketingforsuccess.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[10px] text-muted hover:text-brand-primary transition-colors hidden lg:block"
            >
              by AffiliateMarketingForSuccess.com
            </a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {appState === AppState.Results && fetchStats && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-success/8 rounded-lg border border-success/15 text-xs">
                <ZapIcon className="w-3.5 h-3.5 text-success" />
                <span className="text-success font-semibold">
                  {fetchStats.cachedHit ? 'Cached' : `${fetchStats.elapsedMs}ms`}
                </span>
              </div>
            )}

            {appState === AppState.Results && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface-muted rounded-lg border border-border text-[11px] font-medium">
                <span className="text-warning">{appStats.postsWithoutFeatured} missing</span>
                <span className="text-muted">•</span>
                <span className="text-danger">{appStats.postsWithZeroImages} empty</span>
                <span className="text-muted">•</span>
                <span className="text-success">{appStats.postsProcessed} done</span>
              </div>
            )}
            
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span className="hidden sm:inline">Powered by</span>
              <GeminiIcon className="h-5 w-5" />
            </div>
            
            <button
              onClick={() => setShowShortcuts(true)}
              className="p-2 rounded-xl bg-surface-muted/60 hover:bg-surface-muted text-text-muted hover:text-text-primary transition-colors"
              aria-label="Keyboard shortcuts"
              title="Shift+?"
            >
              <KeyboardIcon className="h-4 w-4" />
            </button>
            
            <button 
              onClick={toggleTheme} 
              className="p-2 rounded-xl bg-surface-muted/60 hover:bg-surface-muted text-text-muted hover:text-text-primary transition-colors"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="w-full max-w-7xl mx-auto flex-grow px-4 sm:px-6 lg:px-8 py-8">
        <ErrorBoundary
          fallback={(error, reset) => (
            <div className="bg-surface rounded-2xl p-8 border border-danger/20 text-center">
              <h2 className="text-xl font-bold text-danger mb-4">Something went wrong</h2>
              <p className="text-text-secondary mb-4">{error.message}</p>
              <button onClick={reset} className="px-6 py-2 bg-brand-primary text-white rounded-lg">Try Again</button>
            </div>
          )}
          resetKeys={[appState]}
        >
          <Suspense fallback={<StepLoader />}>
            {renderContent()}
          </Suspense>
        </ErrorBoundary>
      </main>

      <footer className="w-full border-t border-border bg-surface/50 mt-auto">
        <div className="max-w-7xl mx-auto py-8 px-6 text-center text-sm text-muted">
          <div className="flex flex-col items-center gap-3">
            <a href="https://affiliatemarketingforsuccess.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
              <img 
                src="https://affiliatemarketingforsuccess.com/wp-content/uploads/2023/03/cropped-Affiliate-Marketing-for-Success-Logo-Edited.png?lm=6666FEE0" 
                alt="Affiliate Marketing for Success Logo" 
                className="h-12 w-auto mb-1"
                loading="lazy"
              />
            </a>
            <p className="text-xs">
              Created by Alexios Papaioannou •{' '}
              <a href="https://affiliatemarketingforsuccess.com" target="_blank" rel="noopener noreferrer" className="font-medium hover:text-brand-primary transition-colors">
                affiliatemarketingforsuccess.com
              </a>
            </p>
            <p className="text-[10px] text-muted">
              <kbd className="px-1.5 py-0.5 bg-surface-muted rounded-md border border-border text-[9px] font-mono">Shift</kbd> + <kbd className="px-1.5 py-0.5 bg-surface-muted rounded-md border border-border text-[9px] font-mono">?</kbd> for shortcuts
            </p>
          </div>
        </div>
      </footer>

      {showShortcuts && (
        <Suspense fallback={null}>
          <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default App;
