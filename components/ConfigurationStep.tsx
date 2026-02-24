
// components/ConfigurationStep.tsx - FIXED model names

import React, { useState, useCallback, useMemo } from 'react';
import {
  Configuration,
  AIProvider,
  ImageFormat,
  AspectRatio,
  TextAIProvider,
  AnalysisAIConfig,
  ImageAIConfig,
  ImageSize,
} from '../types';
import {
  EyeIcon,
  EyeOffIcon,
  ZapIcon,
  Loader,
  AlertTriangle,
  CheckCircle2,
  GlobeIcon,
  TargetIcon,
  UserIcon,
  SparklesIcon,
} from './icons/Icons';
import { testConnection } from '../services/wordpressService';
import { testTextAIProvider, testImageAIProvider } from '../services/aiService';

interface Props {
  onConfigure: (config: Configuration) => void;
  initialConfig?: Partial<Configuration>;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';
type TestResults = Record<string, { status: TestStatus; message: string }>;

const KEY_HOLDER_MAP: Record<string, string> = {
  [AIProvider.Gemini]: 'Google Gemini',
  [AIProvider.DallE3]: 'OpenAI',
  [TextAIProvider.OpenAI]: 'OpenAI',
  [AIProvider.Stability]: 'Stability AI',
  [AIProvider.OpenRouter]: 'OpenRouter',
  [TextAIProvider.Groq]: 'Groq',
};

const ConfigurationStep: React.FC<Props> = ({ onConfigure, initialConfig }) => {
  // WordPress credentials
  const [wpUrl, setWpUrl] = useState(initialConfig?.wordpress?.url || '');
  const [wpUser, setWpUser] = useState(initialConfig?.wordpress?.username || '');
  const [wpPass, setWpPass] = useState('');
  const [showPass, setShowPass] = useState(false);

  // AI providers - FIXED: Use Pollinations by default (free, reliable)
  const [imageProvider, setImageProvider] = useState<AIProvider>(AIProvider.Pollinations);
  const [analysisProvider, setAnalysisProvider] = useState<TextAIProvider>(TextAIProvider.Gemini);
  
  // FIXED: Correct model names (these are used as fallbacks, the service uses hardcoded correct models)
  const [imageModel, setImageModel] = useState('pollinations'); // Not actually used for Pollinations
  const [analysisModel, setAnalysisModel] = useState('gemini-3-flash-preview'); // CORRECT model name
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

  // Image settings
  const [imageFormat, setImageFormat] = useState<ImageFormat>(
    initialConfig?.image?.format || ImageFormat.WebP
  );
  const [quality, setQuality] = useState(initialConfig?.image?.quality || 85);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    initialConfig?.image?.aspectRatio || AspectRatio.Landscape
  );
  const [imageSize, setImageSize] = useState<ImageSize>(
    initialConfig?.image?.imageSize || ImageSize.K1
  );
  const [style, setStyle] = useState(
    initialConfig?.image?.style ||
      'Professional editorial photography, cinematic lighting, ultra-high resolution'
  );
  const [negativePrompt, setNegativePrompt] = useState(
    initialConfig?.image?.negativePrompt ||
      'text, watermark, logo, low quality, distorted'
  );
  const [useHighQuality, setUseHighQuality] = useState(true);

  // SEO context
  const [targetLocation, setTargetLocation] = useState(initialConfig?.seo?.targetLocation || 'Global');
  const [primaryKeywords, setPrimaryKeywords] = useState(initialConfig?.seo?.primaryKeywords || '');
  const [brandVoice, setBrandVoice] = useState(
    initialConfig?.seo?.brandVoice || 'Professional & Authoritative'
  );

  // Testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResults>({});

  const requiredKeyHolders = useMemo(() => {
    const holders = new Set<string>();
    // Pollinations doesn't need an API key
    if (imageProvider !== AIProvider.Pollinations) {
      const holder = KEY_HOLDER_MAP[imageProvider];
      if (holder) holders.add(holder);
    }
    const analysisHolder = KEY_HOLDER_MAP[analysisProvider];
    if (analysisHolder) holders.add(analysisHolder);
    return Array.from(holders);
  }, [imageProvider, analysisProvider]);

  const getApiKeyForProvider = useCallback(
    (provider: AIProvider | TextAIProvider): string | undefined => {
      const holder = KEY_HOLDER_MAP[provider];
      return holder ? apiKeys[holder] : undefined;
    },
    [apiKeys]
  );

  const isFormValid = useMemo(() => {
    if (!wpUrl || !wpUser || !wpPass) return false;
    for (const holder of requiredKeyHolders) {
      if (!apiKeys[holder]) return false;
    }
    return true;
  }, [wpUrl, wpUser, wpPass, requiredKeyHolders, apiKeys]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!isFormValid) return;

      const config: Configuration = {
        wordpress: {
          url: wpUrl.trim().replace(/\/$/, ''),
          username: wpUser.trim(),
          appPassword: wpPass,
        },
        ai: {
          image: {
            provider: imageProvider,
            apiKey: getApiKeyForProvider(imageProvider),
            model: imageModel,
          },
          analysis: {
            provider: analysisProvider,
            apiKey: getApiKeyForProvider(analysisProvider),
            model: analysisModel,
          },
        },
        image: {
          format: imageFormat,
          quality,
          aspectRatio,
          imageSize,
          style,
          negativePrompt,
          useHighQuality,
        },
        seo: {
          targetLocation,
          primaryKeywords,
          brandVoice,
        },
      };

      onConfigure(config);
    },
    [isFormValid, wpUrl, wpUser, wpPass, imageProvider, analysisProvider, imageModel, analysisModel, imageFormat, quality, aspectRatio, imageSize, style, negativePrompt, useHighQuality, targetLocation, primaryKeywords, brandVoice, getApiKeyForProvider, onConfigure]
  );

  const handleTestConnections = useCallback(async () => {
    setIsTesting(true);
    const results: TestResults = {};

    try {
      results['WordPress'] = { status: 'testing', message: 'Testing...' };
      setTestResults({ ...results });
      const wpResult = await testConnection(wpUrl, wpUser, wpPass);
      results['WordPress'] = { status: wpResult.success ? 'success' : 'error', message: wpResult.message };
    } catch (error: any) {
      results['WordPress'] = { status: 'error', message: error.message };
    }
    setTestResults({ ...results });

    const analysisConfig: AnalysisAIConfig = { provider: analysisProvider, apiKey: getApiKeyForProvider(analysisProvider), model: analysisModel };
    try {
      results[analysisProvider] = { status: 'testing', message: 'Testing...' };
      setTestResults({ ...results });
      const analysisResult = await testTextAIProvider(analysisConfig);
      results[analysisProvider] = { status: analysisResult.success ? 'success' : 'error', message: analysisResult.message };
    } catch (error: any) {
      results[analysisProvider] = { status: 'error', message: error.message };
    }
    setTestResults({ ...results });

    setIsTesting(false);
  }, [wpUrl, wpUser, wpPass, analysisProvider, analysisModel, getApiKeyForProvider]);

  return (
    <div className="bg-surface rounded-2xl shadow-2xl p-6 sm:p-10 max-w-5xl mx-auto animate-fade-in border border-border">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-brand-primary/10 rounded-xl">
          <ZapIcon className="w-8 h-8 text-brand-primary" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-text-primary tracking-tighter uppercase">Command Config</h2>
          <p className="text-text-secondary font-medium italic opacity-70 tracking-tight">Sync WordPress assets with AI synthesis core</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-10">
        <fieldset className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 bg-surface-muted/30 rounded-2xl border border-border">
          <legend className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary bg-surface px-4 py-1.5 rounded-full border border-border">
            WordPress Target
          </legend>

          <div>
            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">Endpoint URL</label>
            <input type="url" value={wpUrl} onChange={(e) => setWpUrl(e.target.value)} placeholder="https://site.com" required className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:ring-2 focus:ring-brand-primary outline-none transition-all" />
          </div>

          <div>
            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">Username</label>
            <input type="text" value={wpUser} onChange={(e) => setWpUser(e.target.value)} placeholder="admin" required className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:ring-2 focus:ring-brand-primary outline-none transition-all" />
          </div>

          <div className="relative">
            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">App Password</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={wpPass} onChange={(e) => setWpPass(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" required className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:ring-2 focus:ring-brand-primary outline-none transition-all pr-12" />
              <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">
                {showPass ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </fieldset>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                <fieldset className="p-8 bg-surface-muted/30 rounded-2xl border border-border">
                    <legend className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary bg-surface px-4 py-1.5 rounded-full border border-border">Synthesis Configuration</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">Image Engine</label>
                            <select value={imageProvider} onChange={(e) => setImageProvider(e.target.value as AIProvider)} className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none">
                                {Object.values(AIProvider).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            {imageProvider === AIProvider.Pollinations && (
                              <p className="text-[10px] text-emerald-500 mt-2">✓ Free, no API key required</p>
                            )}
                            {imageProvider === AIProvider.Gemini && (
                              <p className="text-[10px] text-amber-500 mt-2">⚠ Will use Pollinations (Gemini image gen unavailable)</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">Text Analysis</label>
                            <select value={analysisProvider} onChange={(e) => setAnalysisProvider(e.target.value as TextAIProvider)} className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-text-primary outline-none">
                                {Object.values(TextAIProvider).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="p-8 bg-surface-muted/30 rounded-2xl border border-border">
                    <legend className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary bg-surface px-4 py-1.5 rounded-full border border-border">Asset Parameters</legend>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">Format</label>
                            <select value={imageFormat} onChange={(e) => setImageFormat(e.target.value as ImageFormat)} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-text-primary">
                                {Object.entries(ImageFormat).map(([k, v]) => <option key={k} value={v}>{k}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">Aspect Ratio</label>
                            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-text-primary">
                                {Object.entries(AspectRatio).map(([k, v]) => <option key={k} value={v}>{k}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2">
                             <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2">Style Preset</label>
                             <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} className="w-full bg-background border border-border rounded-xl px-4 py-2 text-xs text-text-primary" />
                        </div>
                    </div>
                </fieldset>

                {/* SEO Context */}
                <fieldset className="p-8 bg-surface-muted/30 rounded-2xl border border-border">
                    <legend className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary bg-surface px-4 py-1.5 rounded-full border border-border">SEO Context</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2 flex items-center gap-1"><GlobeIcon className="w-3 h-3"/> Location</label>
                            <input type="text" value={targetLocation} onChange={(e) => setTargetLocation(e.target.value)} placeholder="Global" className="w-full bg-background border border-border rounded-xl px-4 py-2 text-xs text-text-primary" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2 flex items-center gap-1"><TargetIcon className="w-3 h-3"/> Keywords</label>
                            <input type="text" value={primaryKeywords} onChange={(e) => setPrimaryKeywords(e.target.value)} placeholder="marketing, SEO" className="w-full bg-background border border-border rounded-xl px-4 py-2 text-xs text-text-primary" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2 flex items-center gap-1"><UserIcon className="w-3 h-3"/> Brand Voice</label>
                            <input type="text" value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} placeholder="Professional" className="w-full bg-background border border-border rounded-xl px-4 py-2 text-xs text-text-primary" />
                        </div>
                    </div>
                </fieldset>
            </div>

            <fieldset className="p-8 bg-surface-muted/30 rounded-2xl border border-border flex flex-col">
                <legend className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary bg-surface px-4 py-1.5 rounded-full border border-border">API Access</legend>
                <div className="space-y-4 flex-grow">
                    {requiredKeyHolders.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3"/>
                        <p className="text-sm font-bold text-text-primary">No API Keys Required!</p>
                        <p className="text-xs text-muted mt-1">Pollinations.ai is free to use</p>
                      </div>
                    ) : (
                      requiredKeyHolders.map(holder => (
                        <div key={holder}>
                            <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2 flex justify-between">
                                {holder} {testResults[holder]?.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-500"/>}
                            </label>
                            <input type="password" value={apiKeys[holder] || ''} onChange={(e) => setApiKeys(p => ({ ...p, [holder]: e.target.value }))} placeholder="API Key" required className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary outline-none" />
                        </div>
                      ))
                    )}
                </div>
                <button type="button" onClick={handleTestConnections} disabled={isTesting || !wpUrl} className="mt-6 w-full flex items-center justify-center gap-2 font-black uppercase text-[10px] tracking-widest py-3 rounded-xl border border-border bg-surface text-text-secondary hover:text-brand-primary transition-all disabled:opacity-50">
                    {isTesting ? <Loader className="w-4 h-4 animate-spin"/> : <ZapIcon className="w-4 h-4"/>}
                    Test Connections
                </button>
                
                {/* Test Results */}
                {Object.keys(testResults).length > 0 && (
                  <div className="mt-4 space-y-2">
                    {/* FIX: Cast result to any to bypass unknown type inference in map callback */}
                    {(Object.entries(testResults) as [string, any][]).map(([key, result]) => (
                      <div key={key} className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${result.status === 'success' ? 'bg-emerald-500/10 text-emerald-600' : result.status === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-brand-primary/10 text-brand-primary'}`}>
                        {result.status === 'success' ? <CheckCircle2 className="w-3 h-3"/> : result.status === 'error' ? <AlertTriangle className="w-3 h-3"/> : <Loader className="w-3 h-3 animate-spin"/>}
                        <span className="font-semibold">{key}:</span>
                        <span className="truncate">{result.message}</span>
                      </div>
                    ))}
                  </div>
                )}
            </fieldset>
        </div>

        <div className="flex justify-center pt-8">
          <button type="submit" disabled={!isFormValid} className="group relative flex items-center justify-center gap-4 font-black uppercase text-lg tracking-widest py-6 px-20 rounded-3xl text-white bg-gradient-to-br from-brand-primary to-brand-secondary shadow-2xl hover:shadow-brand-primary/40 hover:-translate-y-1.5 transition-all duration-500 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed">
            <SparklesIcon className="w-8 h-8 group-hover:rotate-12 transition-transform" />
            <span>Engage Crawler</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default ConfigurationStep;
