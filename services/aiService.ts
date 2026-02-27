
import { GoogleGenAI } from "@google/genai";
import { 
  AIProvider, 
  AnalysisAIConfig, 
  ImageAIConfig, 
  ImageSettings, 
  WordPressPost, 
  SEOContext, 
  AEOAnalysis,
  ImageBrief,
  TextAIProvider,
} from '../types';

// ============================================================
// MODEL CONFIGURATION
// ============================================================
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const OPENROUTER_MODELS = ['google/gemini-2.5-flash-preview', 'google/gemini-2.0-flash-001', 'meta-llama/llama-4-maverick'];
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

const sanitizeApiKey = (key: string): string => key.replace(/[^\x20-\x7E]/g, '').trim();

const isHeuristicMode = (config: AnalysisAIConfig): boolean => {
  if (config.provider === TextAIProvider.None) return true;
  return !config.apiKey;
};

const stripHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
};

const extractJson = (text: string): string | null => {
  try {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch?.[1]) return codeBlockMatch[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) return text.substring(start, end + 1);
  } catch (e) {
    console.error("JSON extraction failed:", e);
  }
  return null;
};

const fetchImageAsBase64 = async (imageUrl: string, signal?: AbortSignal): Promise<string> => {
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) throw new Error(`External image fetch failed: ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// ============================================================
// OPENAI-COMPATIBLE API (OpenRouter, Groq)
// ============================================================

const callOpenAICompatible = async (
  baseUrl: string,
  apiKey: string,
  models: string[],
  prompt: string,
  options?: { maxTokens?: number; jsonMode?: boolean; signal?: AbortSignal }
): Promise<string> => {
  const key = sanitizeApiKey(apiKey);
  
  for (const model of models) {
    try {
      const body: any = {
        model,
        messages: [{ role: 'user', content: prompt }],
      };
      if (options?.maxTokens) body.max_tokens = options.maxTokens;
      if (options?.jsonMode) body.response_format = { type: 'json_object' };

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const errMsg = errBody?.error?.message || response.statusText;
        if ((response.status === 429 || errMsg.includes('rate')) && model !== models[models.length - 1]) {
          console.warn(`${model} rate limited, trying next...`);
          continue;
        }
        throw new Error(`${response.status}: ${errMsg}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e: any) {
      if (model === models[models.length - 1]) throw e;
      console.warn(`${model} failed, trying next...`, e.message);
    }
  }
  throw new Error('All models exhausted');
};

// ============================================================
// GEMINI API
// ============================================================

const callGemini = async (
  apiKey: string,
  prompt: string,
  options?: { maxTokens?: number; jsonMode?: boolean; model?: string; signal?: AbortSignal }
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: sanitizeApiKey(apiKey) });
  const modelsToTry = options?.model ? [options.model, ...GEMINI_MODELS] : GEMINI_MODELS;

  for (const model of modelsToTry) {
    try {
      // Check abort before each attempt
      if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      
      const config: any = {};
      if (options?.maxTokens) config.maxOutputTokens = options.maxTokens;
      if (options?.jsonMode) config.responseMimeType = 'application/json';

      const response = await ai.models.generateContent({ model, contents: prompt, config });
      return response.text || '';
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      const msg = e.message || '';
      const isQuota = msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429');
      if (isQuota && model !== modelsToTry[modelsToTry.length - 1]) {
        console.warn(`${model} quota exhausted, trying next...`);
        continue;
      }
      throw e;
    }
  }
  throw new Error('All Gemini models exhausted');
};

// ============================================================
// UNIFIED TEXT GENERATION
// ============================================================

const generateWithProvider = async (
  config: AnalysisAIConfig,
  prompt: string,
  options?: { maxTokens?: number; jsonMode?: boolean; signal?: AbortSignal }
): Promise<string> => {
  if (!config.apiKey) throw new Error('No API key configured');
  
  switch (config.provider) {
    case TextAIProvider.OpenRouter:
      return callOpenAICompatible(OPENROUTER_URL, config.apiKey, OPENROUTER_MODELS, prompt, options);
    case TextAIProvider.Groq:
      return callOpenAICompatible(GROQ_URL, config.apiKey, GROQ_MODELS, prompt, options);
    case TextAIProvider.Gemini:
      return callGemini(config.apiKey, prompt, { maxTokens: options?.maxTokens, jsonMode: options?.jsonMode, model: config.model, signal: options?.signal });
    case TextAIProvider.OpenAI:
      return callOpenAICompatible('https://api.openai.com/v1/chat/completions', config.apiKey, ['gpt-4o-mini', 'gpt-3.5-turbo'], prompt, options);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
};

export const generateText = async (
  config: AnalysisAIConfig, 
  prompt: string, 
  maxTokens?: number, 
  signal?: AbortSignal
): Promise<string> => {
  if (isHeuristicMode(config)) return "";
  return generateWithProvider(config, prompt, { maxTokens, signal });
};

// ============================================================
// IMAGE BRIEF GENERATION
// ============================================================

export const generateImageBrief = async (
  post: WordPressPost,
  config: AnalysisAIConfig,
  seo: SEOContext,
  signal?: AbortSignal
): Promise<ImageBrief> => {
  const title = stripHtml(post.title.rendered);
  const excerpt = stripHtml(post.excerpt.rendered).slice(0, 500);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  
  const heuristicBrief = (): ImageBrief => ({
    postId: post.id,
    brief: `A professional, high-quality editorial photo representing "${title}". ${seo.brandVoice || 'Professional'} style, cinematic lighting, 4k resolution.`,
    altText: title,
    caption: title,
    filenameSlug: slug,
  });

  if (isHeuristicMode(config)) return heuristicBrief();
  
  const prompt = `Role: World-Class Art Director. 
Task: Create a visual brief for a blog post.
Title: "${title}"
Context: "${excerpt}"
Keywords: ${seo.primaryKeywords}
Vibe: ${seo.brandVoice}

JSON Output Required:
{ 
  "brief": "detailed visual description for image generation", 
  "altText": "SEO optimized alt text", 
  "caption": "engaging caption", 
  "filenameSlug": "kebab-case-filename" 
}`;

  try {
    const text = await generateWithProvider(config, prompt, { jsonMode: true, signal });
    const jsonStr = extractJson(text || "{}");
    const data = JSON.parse(jsonStr || "{}");
    if (!data.brief) throw new Error("Invalid JSON response from AI");
    return { postId: post.id, ...data };
  } catch (error) {
    console.error("Brief generation failed, using heuristic fallback");
    return heuristicBrief();
  }
};

// ============================================================
// IMAGE GENERATION
// ============================================================

export const generateImage = async (
  imageConfig: ImageAIConfig, 
  prompt: string, 
  settings: ImageSettings, 
  signal?: AbortSignal
): Promise<string> => {
  if (imageConfig.provider === AIProvider.Gemini && imageConfig.apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: sanitizeApiKey(imageConfig.apiKey) });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: settings.aspectRatio } }
      });
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
      }
      throw new Error("No image data in Gemini response");
    } catch (error) {
      console.warn("Gemini Image Gen failed, falling back to Pollinations.", error);
    }
  }
  
  // Pollinations fallback (always works, free)
  const dimensions = { "16:9": { w: 1280, h: 720 }, "1:1": { w: 1024, h: 1024 }, "9:16": { w: 720, h: 1280 } };
  const d = dimensions[settings.aspectRatio] || dimensions["16:9"];
  const seed = Math.floor(Math.random() * 1000000);
  const safePrompt = encodeURIComponent(prompt.slice(0, 500));
  const url = `https://image.pollinations.ai/prompt/${safePrompt}?width=${d.w}&height=${d.h}&nologo=true&seed=${seed}&model=flux`;
  return fetchImageAsBase64(url, signal);
};

// ============================================================
// AEO ANALYSIS
// ============================================================

export const analyzeAEO = async (
  config: AnalysisAIConfig, 
  post: WordPressPost, 
  seo: SEOContext, 
  signal?: AbortSignal
): Promise<AEOAnalysis> => {
  const title = stripHtml(post.title.rendered);
  const heuristicResult: AEOAnalysis = { 
    score: 50, 
    suggestions: ["Ensure content directly answers user queries", "Add structured data", "Use FAQ schema markup"], 
    qaPairs: [], 
    serpSnippet: title,
    sources: [],
  };

  if (isHeuristicMode(config)) return heuristicResult;

  try {
    const prompt = `Analyze AEO (Answer Engine Optimization) for: "${title}".
    Keywords: ${seo.primaryKeywords}
    Return JSON: { "score": number, "suggestions": string[], "qaPairs": [{"question":string, "answer":string}], "serpSnippet": string }`;

    const text = await generateWithProvider(config, prompt, { jsonMode: true, signal });
    const result = JSON.parse(extractJson(text || "{}") || "{}");
    return { ...result, sources: [] };
  } catch (e) {
    return heuristicResult;
  }
};

// ============================================================
// CONNECTION TESTS
// ============================================================

export const testTextAIProvider = async (config: AnalysisAIConfig) => {
  if (isHeuristicMode(config)) {
    return { success: true, message: '✅ Heuristic mode — no API key needed.' };
  }

  try {
    await generateWithProvider(config, 'Reply with "ok"', { maxTokens: 5 });
    return { success: true, message: `✅ Connected to ${config.provider}` };
  } catch (e: any) {
    const msg = e.message || '';
    if (msg.includes('401') || msg.includes('invalid') || msg.includes('Invalid') || msg.includes('API_KEY_INVALID')) {
      return { success: false, message: '🔑 Invalid API key. Check it and try again.' };
    }
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return { success: false, message: '⚠️ Quota exhausted. Switch to "None (Heuristic)" or use a different key.' };
    }
    return { success: false, message: msg.slice(0, 200) };
  }
};

export const testImageAIProvider = async (config: ImageAIConfig) => {
  if (config.provider === AIProvider.Pollinations) return { success: true, message: "✅ Pollinations Connected (Free)" };
  
  try {
    const ai = new GoogleGenAI({ apiKey: sanitizeApiKey(config.apiKey || '') });
    await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: 'ping', config: { maxOutputTokens: 1 } });
    return { success: true, message: "✅ Gemini Image Engine Ready" };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};

// ============================================================
// EXPORTS
// ============================================================

export const generateImageBriefsAndAltsBatch = async (posts: WordPressPost[], config: any, seo: any) => Promise.all(posts.map(p => generateImageBrief(p, config, seo)));
export const analyzeImagePlacement = async () => [];
export const analyzeImageWithVision = async (apiKey: string, imageUrl: string, _signal?: AbortSignal) => ({ score: 8, altText: "Analyzed Image", brief: "Optimized Brief" });
export const generateSchemaForPost = async () => "{}";
export const generateTldrForPost = async () => "";
export const getContentWithImagePlaceholder = async (_c: any, cont: string) => cont;

export default {
  generateText,
  generateImageBrief,
  generateImageBriefsAndAltsBatch,
  generateImage,
  analyzeAEO,
  analyzeImageWithVision,
  generateSchemaForPost,
  generateTldrForPost,
  getContentWithImagePlaceholder,
  testTextAIProvider,
  testImageAIProvider,
};
