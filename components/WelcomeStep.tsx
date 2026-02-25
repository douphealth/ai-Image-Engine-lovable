// components/WelcomeStep.tsx - Premium enterprise welcome screen

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
      gradient: 'from-brand-primary/15 to-brand-secondary/10',
      iconBg: 'bg-brand-primary/15 text-brand-primary',
    },
    {
      icon: <ImageIcon className="w-6 h-6" />,
      title: 'Smart Alt Text',
      description: 'Generate SEO-optimized alt text that improves accessibility and search rankings.',
      gradient: 'from-brand-accent/15 to-brand-primary/10',
      iconBg: 'bg-brand-accent/15 text-brand-accent',
    },
    {
      icon: <ZapIcon className="w-6 h-6" />,
      title: 'Bulk Processing',
      description: 'Process hundreds of posts in parallel with intelligent queue management.',
      gradient: 'from-brand-secondary/15 to-brand-accent/10',
      iconBg: 'bg-brand-secondary/15 text-brand-secondary',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-surface rounded-3xl border border-border shadow-2xl shadow-brand-primary/5 mb-8">
        {/* Decorative gradient orbs */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-brand-primary/8 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-brand-secondary/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative px-8 py-16 sm:px-16 sm:py-20 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-2xl shadow-xl shadow-brand-primary/25 mb-8 animate-float">
            <AppIcon className="h-11 w-11 text-white" />
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold text-text-primary mb-4 tracking-tight leading-[1.1]">
            AI Image <span className="gradient-text">Engine</span>
          </h1>

          <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed mb-10">
            Automatically generate and assign beautiful, relevant featured images for your WordPress posts using cutting-edge AI.
          </p>

          {/* CTA */}
          <button
            onClick={onGetStarted}
            className="group relative inline-flex items-center justify-center gap-3 font-bold text-lg py-4 px-14 rounded-2xl text-white bg-gradient-to-r from-brand-primary to-brand-secondary shadow-xl shadow-brand-primary/25 hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 transition-all duration-300 pulse-glow"
          >
            <SparklesIcon className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            <span>Get Started</span>
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>

          <p className="mt-5 text-xs text-muted font-medium tracking-wide">
            Free to use • No account required • Open source
          </p>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 stagger-fade-in">
        {features.map((feature, index) => (
          <div
            key={index}
            className={`p-7 bg-gradient-to-br ${feature.gradient} rounded-2xl border border-border hover:border-brand-primary/30 transition-all duration-300 group card-lift`}
          >
            <div className={`w-12 h-12 ${feature.iconBg} rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
              {feature.icon}
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-2 tracking-tight">{feature.title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>

      {/* How It Works */}
      <div className="bg-surface rounded-2xl border border-border p-8 mb-8 shadow-sm">
        <h2 className="text-xl font-bold text-text-primary mb-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-primary/10 rounded-lg flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-brand-primary" />
          </div>
          How It Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            'Connect your WordPress site using an Application Password',
            'Scan your posts to identify those missing featured images',
            'AI analyzes your content and generates relevant images',
            'Review and approve images individually or in bulk',
          ].map((step, index) => (
            <div key={index} className="flex flex-col items-start gap-3 p-4 bg-surface-muted/50 rounded-xl border border-border/50">
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary text-white text-sm font-bold flex items-center justify-center shadow-sm">
                {index + 1}
              </span>
              <span className="text-sm text-text-secondary leading-relaxed">{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Application Password Instructions */}
      <details className="bg-surface rounded-2xl border border-border p-6 mb-8 group cursor-pointer shadow-sm">
        <summary className="text-base font-semibold text-text-primary list-none flex justify-between items-center">
          <span className="flex items-center gap-3">
            <div className="w-8 h-8 bg-warning/10 rounded-lg flex items-center justify-center">
              <InfoIcon className="w-4 h-4 text-warning" />
            </div>
            How to Get Your WordPress Application Password
          </span>
          <svg
            className="w-5 h-5 text-muted group-open:rotate-90 transition-transform duration-200"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </summary>
        <div className="mt-5 text-text-secondary space-y-3 pl-11">
          <p className="text-sm leading-relaxed">
            Application Passwords provide secure access to your WordPress site without sharing your main password.
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Log in to your WordPress dashboard</li>
            <li>Navigate to <code className="bg-surface-muted px-2 py-0.5 rounded text-xs font-mono">Users → Profile</code></li>
            <li>Scroll to "Application Passwords" section</li>
            <li>Enter a name (e.g., "AI Image Engine")</li>
            <li>Click "Add New Application Password"</li>
            <li><strong className="text-warning">Copy the generated password immediately</strong> — you won't see it again!</li>
          </ol>
          <p className="text-xs text-muted pt-3 border-t border-border flex items-start gap-2">
            <InfoIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>If you don't see Application Passwords, ensure you're using WordPress 5.6+ and that it's not disabled by a security plugin.</span>
          </p>
        </div>
      </details>
    </div>
  );
};

export default WelcomeStep;
