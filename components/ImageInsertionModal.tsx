// components/ImageInsertionModal.tsx - Insert images into post content

import { parseSafeHtml } from '../services/sanitize';
import React, { useState, useCallback } from 'react';
import { WordPressPost, Configuration, InsertionPoint } from '../types';
import { 
  XIcon, 
  SparklesIcon, 
  Loader, 
  ImageIcon,
  WandIcon,
  CheckCircle2
} from './icons/Icons';

interface Props {
  post: WordPressPost;
  config: Configuration;
  onClose: () => void;
  onInsert: (post: WordPressPost, insertionPoint: InsertionPoint, imagePrompt: string) => Promise<void>;
}

const ImageInsertionModal: React.FC<Props> = ({ post, config, onClose, onInsert }) => {
  const [step, setStep] = useState<'position' | 'prompt' | 'generating'>('position');
  const [selectedPoint, setSelectedPoint] = useState<InsertionPoint | null>(null);
  const [imagePrompt, setImagePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);

  // Parse content for insertion points
  const insertionPoints = React.useMemo<InsertionPoint[]>(() => {
    const doc = parseSafeHtml(post.content.rendered);
    const elements = doc.querySelectorAll('p, h2, h3, ul, ol, blockquote');
    const points: InsertionPoint[] = [];
    
    elements.forEach((el, index) => {
      const text = el.textContent || '';
      if (text.length > 50) {
        points.push({
          paragraphIndex: index,
          afterElement: el.tagName.toLowerCase() as any,
          position: index,
          context: text.slice(0, 150) + (text.length > 150 ? '...' : ''),
          recommended: el.tagName === 'H2' || el.tagName === 'H3',
          reason: el.tagName.match(/^H[23]$/) ? 'After heading' : undefined,
        });
      }
    });
    
    return points;
  }, [post.content.rendered]);

  // Generate AI suggested prompts based on content context
  const generateSuggestions = useCallback(async (point: InsertionPoint) => {
    setSelectedPoint(point);
    setStep('prompt');
    
    // Simple context-based suggestions (in production, use AI)
    const context = point.context.toLowerCase();
    const suggestions: string[] = [];
    
    if (context.includes('step') || context.includes('how to')) {
      suggestions.push(`Instructional diagram showing ${point.context.slice(0, 50)}`);
    }
    if (context.includes('product') || context.includes('review')) {
      suggestions.push(`Professional product photography for ${point.context.slice(0, 50)}`);
    }
    suggestions.push(`Professional illustration representing: ${point.context.slice(0, 80)}`);
    suggestions.push(`High-quality photograph related to: ${point.context.slice(0, 80)}`);
    
    setSuggestedPrompts(suggestions);
  }, []);

  const handleInsert = useCallback(async () => {
    if (!selectedPoint || !imagePrompt) return;
    
    setIsGenerating(true);
    setStep('generating');
    
    try {
      await onInsert(post, selectedPoint, `${imagePrompt}. Style: ${config.image.style}`);
      onClose();
    } catch (error) {
      console.error('Failed to insert image:', error);
      setStep('prompt');
    } finally {
      setIsGenerating(false);
    }
  }, [post, selectedPoint, imagePrompt, config, onInsert, onClose]);

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4 animate-fade-in">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-border overflow-hidden">
        {/* Header */}
        <header className="flex justify-between items-center p-6 border-b border-border bg-surface-muted/30">
          <div>
            <h2 className="text-xl font-bold text-text-primary">Insert Image</h2>
            <p className="text-sm text-muted">
              {step === 'position' && 'Select where to insert the image'}
              {step === 'prompt' && 'Describe the image to generate'}
              {step === 'generating' && 'Generating and inserting image...'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-muted transition-colors">
            <XIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Select Position */}
          {step === 'position' && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary mb-4">
                Choose where in the content you want to insert the new image:
              </p>
              
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                {insertionPoints.map((point, i) => (
                  <button
                    key={i}
                    onClick={() => generateSuggestions(point)}
                    className={`
                      w-full text-left p-4 rounded-xl border transition-all hover:scale-[1.01]
                      ${point.recommended 
                        ? 'border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10' 
                        : 'border-border hover:border-brand-primary/30 hover:bg-surface-muted'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wide text-muted flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-surface-muted rounded text-text-secondary">
                          {point.afterElement.toUpperCase()}
                        </span>
                        Position {point.paragraphIndex + 1}
                      </span>
                      {point.recommended && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-brand-primary flex items-center gap-1">
                          <SparklesIcon className="w-3 h-3" />
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary line-clamp-2">{point.context}</p>
                  </button>
                ))}
              </div>
              
              {insertionPoints.length === 0 && (
                <div className="text-center py-12">
                  <ImageIcon className="w-12 h-12 text-muted mx-auto mb-3" />
                  <p className="text-text-secondary">No suitable insertion points found</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Enter Prompt */}
          {step === 'prompt' && selectedPoint && (
            <div className="space-y-6">
              {/* Context Preview */}
              <div className="p-4 bg-surface-muted/50 rounded-xl border border-border">
                <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">Inserting after:</p>
                <p className="text-sm text-text-secondary">{selectedPoint.context}</p>
              </div>

              {/* Prompt Input */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-text-primary">Image Description</label>
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Describe the image you want to generate..."
                  rows={4}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:ring-2 focus:ring-brand-primary outline-none resize-none"
                  autoFocus
                />
              </div>

              {/* AI Suggestions */}
              {suggestedPrompts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted flex items-center gap-2">
                    <WandIcon className="w-4 h-4" />
                    AI Suggestions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedPrompts.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => setImagePrompt(suggestion)}
                        className="text-left px-3 py-2 text-xs bg-surface-muted border border-border rounded-lg hover:border-brand-primary hover:bg-brand-primary/5 transition-all"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Style Preview */}
              <div className="p-4 bg-brand-primary/5 rounded-xl border border-brand-primary/20">
                <p className="text-xs font-bold uppercase tracking-wide text-brand-primary mb-1">Style applied:</p>
                <p className="text-xs text-text-secondary">{config.image.style}</p>
              </div>
            </div>
          )}

          {/* Step 3: Generating */}
          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative mb-6">
                <div className="w-20 h-20 bg-brand-primary/10 rounded-full flex items-center justify-center">
                  <Loader className="w-10 h-10 text-brand-primary animate-spin" />
                </div>
                <div className="absolute inset-0 bg-brand-primary/20 rounded-full animate-ping" />
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">Generating Image</h3>
              <p className="text-sm text-muted text-center max-w-md">
                AI is creating your image and inserting it into the post content...
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-4 border-t border-border bg-surface-muted/30 flex items-center justify-between">
          {step === 'prompt' && (
            <button
              onClick={() => setStep('position')}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              ← Back
            </button>
          )}
          {step !== 'prompt' && <div />}
          
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="px-6 py-2 text-sm font-medium bg-surface border border-border rounded-xl hover:border-brand-primary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            
            {step === 'prompt' && (
              <button
                onClick={handleInsert}
                disabled={!imagePrompt.trim() || isGenerating}
                className="flex items-center gap-2 px-6 py-2 text-sm font-bold bg-brand-primary text-white rounded-xl hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
              >
                <SparklesIcon className="w-4 h-4" />
                Generate & Insert
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default ImageInsertionModal;
