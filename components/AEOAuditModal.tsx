
import React, { useState, useEffect } from 'react';
import { WordPressPost, Configuration, AEOAnalysis } from '../types';
import { analyzeAEO } from '../services/aiService';
import { XIcon, Loader, CheckCircle2, AlertTriangle, TargetIcon, SparklesIcon, GlobeIcon, ExternalLinkIcon } from './icons/Icons';

interface Props {
  post: WordPressPost;
  config: Configuration;
  onClose: () => void;
  onUpdatePost: (postId: number, updates: Partial<WordPressPost>) => void;
}

const AEOAuditModal: React.FC<Props> = ({ post, config, onClose, onUpdatePost }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aeo, setAeo] = useState<AEOAnalysis | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const performAudit = async () => {
      try {
        setIsLoading(true);
        onUpdatePost(post.id, { status: 'aeo_auditing', statusMessage: 'Analyzing SERP potential...' });
        const result = await analyzeAEO(config.ai.analysis, post, config.seo, controller.signal);
        setAeo(result);
        onUpdatePost(post.id, { aeo: result, seoScore: result.score, status: 'idle', statusMessage: `SERP Score: ${result.score}/100` });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'AEO audit failed.');
      } finally {
        setIsLoading(false);
      }
    };
    performAudit();
    return () => controller.abort();
  }, [post.id, config]);

  return (
    <div className="fixed inset-0 bg-background/90 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl border border-border max-h-[90vh] flex flex-col overflow-hidden">
        <header className="flex justify-between items-center p-6 border-b border-border bg-surface-muted/30">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-brand-primary/10 rounded-lg"><TargetIcon className="w-6 h-6 text-brand-primary"/></div>
             <div>
                <h2 className="text-xl font-black text-text-primary tracking-tight">SERP AEO Audit</h2>
                <p className="text-xs text-muted">Analyzing Answer Engine Optimization for "{post.title.rendered}"</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-subtle hover:bg-surface-muted hover:text-text-primary transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="p-8 flex-grow overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader className="w-12 h-12 animate-spin text-brand-primary" />
                <p className="text-lg font-bold text-text-secondary animate-pulse">Running Semantic Intelligence Scan...</p>
                <p className="text-xs text-muted">Searching Google for live grounding data...</p>
            </div>
          ) : error ? (
            <div className="text-center py-10">
                <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <p className="text-red-400 font-bold">{error}</p>
            </div>
          ) : aeo && (
            <div className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-surface-muted rounded-2xl p-6 border border-border text-center flex flex-col items-center justify-center shadow-inner">
                        <span className="text-[10px] font-black text-muted uppercase tracking-[0.2em] mb-2">SERP Potential</span>
                        <div className={`text-6xl font-black ${aeo.score > 80 ? 'text-green-500' : aeo.score > 60 ? 'text-amber-500' : 'text-red-500'}`}>
                            {aeo.score}
                        </div>
                        <div className="mt-2 h-1.5 w-full bg-background rounded-full overflow-hidden">
                            <div className="h-full bg-brand-primary" style={{ width: `${aeo.score}%` }} />
                        </div>
                    </div>
                    <div className="md:col-span-2 space-y-4">
                        <h4 className="text-sm font-black text-text-primary uppercase flex items-center gap-2"><SparklesIcon className="w-4 h-4 text-brand-secondary"/> Ranking Recommendations</h4>
                        <ul className="space-y-3">
                            {aeo.suggestions.map((s, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-text-secondary bg-surface-muted/50 p-3 rounded-xl border border-border">
                                    <CheckCircle2 className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
                                    <span>{s}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="space-y-4">
                    <h4 className="text-sm font-black text-text-primary uppercase flex items-center gap-2"><GlobeIcon className="w-4 h-4 text-brand-primary"/> Optimized SERP Snippet</h4>
                    <div className="bg-background border border-border rounded-2xl p-6 shadow-lg">
                        <p className="text-[#1a0dab] text-xl font-medium hover:underline cursor-pointer mb-1 line-clamp-1">{post.title.rendered}</p>
                        <p className="text-[#006621] text-sm mb-2 flex items-center gap-1">{post.link} <span className="text-[10px]">▼</span></p>
                        <p className="text-text-secondary text-sm leading-relaxed">{aeo.serpSnippet}</p>
                    </div>
                </div>

                {aeo.sources && aeo.sources.length > 0 && (
                    <div className="space-y-4">
                        <h4 className="text-sm font-black text-text-primary uppercase flex items-center gap-2"><GlobeIcon className="w-4 h-4 text-indigo-500"/> Real-Time Grounding Sources</h4>
                        <div className="flex flex-wrap gap-2">
                            {aeo.sources.map((source, i) => (
                                <a 
                                    key={i} 
                                    href={source.uri} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="flex items-center gap-2 bg-indigo-500/5 border border-indigo-500/20 px-4 py-2 rounded-xl text-xs font-bold text-indigo-600 hover:bg-indigo-500/10 transition-all"
                                >
                                    {source.title}
                                    <ExternalLinkIcon className="w-3 h-3" />
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <h4 className="text-sm font-black text-text-primary uppercase flex items-center gap-2"><TargetIcon className="w-4 h-4 text-brand-secondary"/> AEO Featured Snippet QA</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {aeo.qaPairs.map((qa, i) => (
                            <div key={i} className="bg-brand-primary/5 border border-brand-primary/10 rounded-2xl p-5 space-y-2">
                                <p className="font-bold text-text-primary text-sm">Q: {qa.question}</p>
                                <p className="text-text-secondary text-sm leading-relaxed">A: {qa.answer}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          )}
        </div>

        <footer className="p-6 border-t border-border flex justify-end bg-surface-muted/30">
          <button onClick={onClose} className="inline-flex items-center justify-center gap-2 font-bold py-3 px-10 rounded-xl text-white bg-gradient-to-br from-brand-primary to-brand-secondary shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
            Dismiss Audit
          </button>
        </footer>
      </div>
    </div>
  );
};

export default AEOAuditModal;
