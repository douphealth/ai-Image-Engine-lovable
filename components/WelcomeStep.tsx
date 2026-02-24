// components/WelcomeStep.tsx - Enhanced welcome screen

import React from 'react';
import { AppIcon, InfoIcon, SparklesIcon, ImageIcon, ZapIcon, CheckCircle2 } from './icons/Icons';

interface Props {
  onGetStarted: () => void;
}

const WelcomeStep: React.FC<Props> = ({ onGetStarted }) => {
  const features = [
    {
      icon: <SparklesIcon className="w-6 h-6" />,
      title: 'AI-Powered Generation',
      description: 'Create stunning, contextually relevant images using state-of-the-art AI models.',
    },
    {
      icon: <ImageIcon className="w-6 h-6" />,
      title: 'Smart Alt Text',
      description: 'Generate SEO-optimized alt text that improves accessibility and search rankings.',
    },
    {
      icon: <ZapIcon className="w-6 h-6" />,
      title: 'Bulk Processing',
      description: 'Process hundreds of posts in parallel with intelligent queue management.',
    },
  ];

  return (
    <div className="bg-surface rounded-2xl shadow-xl p-6 sm:p-10 max-w-4xl mx-auto animate-fade-in border border-border">
      {/* Hero Section */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-2xl shadow-lg shadow-brand-primary/20 mb-6">
          <AppIcon className="h-12 w-12 text-white" />
        </div>
        <h1 className="text-4xl font-black text-text-primary mb-3 tracking-tight">
          AI Image Engine
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl mx-auto">
          Automatically generate and assign beautiful, relevant featured images for your WordPress
          posts using cutting-edge AI technology.
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {features.map((feature, index) => (
          <div
            key={index}
            className="p-6 bg-surface-muted/50 rounded-xl border border-border hover:border-brand-primary/30 transition-colors group"
          >
            <div className="w-12 h-12 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary mb-4 group-hover:scale-110 transition-transform">
              {feature.icon}
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-2">{feature.title}</h3>
            <p className="text-sm text-text-secondary">{feature.description}</p>
          </div>
        ))}
      </div>

      {/* How It Works */}
      <div className="bg-surface-muted/30 border border-border rounded-xl p-6 mb-8">
        <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-brand-primary" />
          How It Works
        </h2>
        <ol className="space-y-3">
          {[
            'Connect your WordPress site using an Application Password',
            'Scan your posts to identify those missing featured images',
            'AI analyzes your content and generates relevant images',
            'Review and approve images individually or in bulk',
          ].map((step, index) => (
            <li key={index} className="flex items-start gap-3 text-text-secondary">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold flex items-center justify-center">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Application Password Instructions */}
      <details className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6 mb-8 group cursor-pointer">
        <summary className="text-lg font-semibold text-text-primary list-none flex justify-between items-center">
          <span className="flex items-center gap-2">
            <InfoIcon className="w-5 h-5 text-amber-500" />
            How to Get Your WordPress Application Password
          </span>
          <svg
            className="w-5 h-5 text-muted group-open:rotate-90 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </summary>
        <div className="mt-4 text-text-secondary space-y-3">
          <p>
            Application Passwords provide secure access to your WordPress site without sharing your
            main password.
          </p>
          <ol className="list-decimal list-inside space-y-2 pl-2">
            <li>Log in to your WordPress dashboard</li>
            <li>
              Navigate to{' '}
              <code className="bg-surface-muted px-2 py-0.5 rounded text-sm">
                Users → Profile
              </code>
            </li>
            <li>Scroll to "Application Passwords" section</li>
            <li>Enter a name (e.g., "AI Image Engine")</li>
            <li>Click "Add New Application Password"</li>
            <li>
              <strong className="text-amber-600">Copy the generated password immediately</strong> -
              you won't see it again!
            </li>
          </ol>
          <p className="text-xs text-muted pt-2 border-t border-border flex items-start gap-2">
            <InfoIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              If you don't see Application Passwords, ensure you're using WordPress 5.6+ and that
              it's not disabled by a security plugin.
            </span>
          </p>
        </div>
      </details>

      {/* CTA Button */}
      <div className="text-center">
        <button
          onClick={onGetStarted}
          className="inline-flex items-center justify-center gap-3 font-bold text-lg py-4 px-12 rounded-2xl text-white bg-gradient-to-br from-brand-primary to-brand-secondary shadow-xl shadow-brand-primary/20 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group"
        >
          <SparklesIcon className="w-6 h-6 group-hover:rotate-12 transition-transform" />
          <span>Get Started</span>
        </button>
        <p className="mt-4 text-xs text-muted">Free to use • No account required</p>
      </div>
    </div>
  );
};

export default WelcomeStep;
