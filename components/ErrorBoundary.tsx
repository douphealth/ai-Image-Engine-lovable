// components/ErrorBoundary.tsx - Production error boundary with recovery

import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCwIcon } from './icons/Icons';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, errorId: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      this.props.resetKeys &&
      prevProps.resetKeys &&
      !this.areResetKeysEqual(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  private areResetKeysEqual(prev: unknown[], next: unknown[]): boolean {
    if (prev.length !== next.length) return false;
    return prev.every((key, index) => key === next[index]);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return (this.props.fallback as (error: Error, reset: () => void) => ReactNode)(this.state.error, this.reset);
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <DefaultErrorFallback error={this.state.error} onReset={this.reset} />;
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

const DefaultErrorFallback: React.FC<DefaultErrorFallbackProps> = ({ error, onReset }) => (
  <div className="flex flex-col items-center justify-center p-8 bg-red-500/5 border border-red-500/20 rounded-2xl text-center">
    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
      <AlertTriangle className="w-8 h-8 text-red-500" />
    </div>
    <h3 className="text-lg font-bold text-text-primary mb-2">Something went wrong</h3>
    <p className="text-sm text-text-secondary mb-4 max-w-md">
      {error.message || 'An unexpected error occurred'}
    </p>
    <details className="text-xs text-muted mb-4 max-w-md">
      <summary className="cursor-pointer hover:text-text-secondary">Technical details</summary>
      <pre className="mt-2 p-2 bg-surface-muted rounded text-left overflow-auto max-h-32">
        {error.stack}
      </pre>
    </details>
    <button
      onClick={onReset}
      className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
    >
      <RefreshCwIcon className="w-4 h-4" />
      Try Again
    </button>
  </div>
);

export const withErrorBoundary = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ErrorBoundaryProps['fallback']
): React.FC<P> => {
  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary fallback={fallback}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `WithErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithErrorBoundary;
};

export const AsyncBoundary: React.FC<{
  children: ReactNode;
  fallback?: ReactNode;
  errorFallback?: ErrorBoundaryProps['fallback'];
}> = ({ children, fallback, errorFallback }) => (
  <ErrorBoundary fallback={errorFallback}>
    <React.Suspense fallback={fallback || <div className="animate-pulse">Loading...</div>}>
      {children}
    </React.Suspense>
  </ErrorBoundary>
);

export default ErrorBoundary;