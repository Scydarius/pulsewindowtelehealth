import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertCircle, RotateCw, Home } from 'lucide-react';
import { isChunkLoadError } from '../utils/lazyWithRetry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  title?: string;
  message?: string;
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunk: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    isChunk: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      isChunk: isChunkLoadError(error),
    };
  }

  public componentDidUpdate(prevProps: Props): void {
    if (this.props.resetKey !== undefined && prevProps.resetKey !== this.props.resetKey) {
      if (this.state.hasError) {
        this.setState({ hasError: false, error: null, isChunk: false });
      }
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);

    if (isChunkLoadError(error) && typeof window !== 'undefined') {
      const storageKey = `ventricura_boundary_reload_${window.location.pathname}`;
      const lastReload = sessionStorage.getItem(storageKey);
      const now = Date.now();
      // Auto-reload once if chunk was stale/missing from a deployment
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem(storageKey, String(now));
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    // If clinician workspace, go to /clinician; otherwise return to landing page
    if (window.location.pathname.startsWith('/clinician')) {
      window.location.href = '/clinician';
    } else {
      window.location.href = '/';
    }
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, isChunk: false });
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunk = this.state.isChunk;
      const defaultTitle = isChunk ? 'New Update Available' : (this.props.title || 'Unable to Load Page');
      const defaultMessage = isChunk
        ? 'A new version of Ventricura was published. Reloading your session will fetch the latest features.'
        : (this.props.message || 'An unexpected issue occurred while loading this view. You can reload the page or return to your workspace.');

      return (
        <div className="error-boundary-wrap" role="alert">
          <div className="error-boundary-card">
            <div className="error-boundary-icon">
              <AlertCircle size={28} />
            </div>
            <h2>{defaultTitle}</h2>
            <p>{defaultMessage}</p>
            <div className="error-boundary-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={this.handleReload}
              >
                <RotateCw size={16} /> Reload page
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={this.handleGoHome}
              >
                <Home size={16} /> Return to overview
              </button>
              <button
                type="button"
                className="text-button"
                onClick={this.handleReset}
              >
                Try again
              </button>
            </div>
            {this.state.error && (
              <details className="error-boundary-details">
                <summary>Diagnostics & details</summary>
                <pre>{this.state.error.message || String(this.state.error)}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Route-aware ErrorBoundary that automatically clears caught errors
 * whenever the user navigates to a new path or query state.
 */
export function RouteErrorBoundary({ children, ...props }: Omit<Props, 'resetKey'>) {
  const location = useLocation();
  return (
    <ErrorBoundary {...props} resetKey={`${location.pathname}${location.search}`}>
      {children}
    </ErrorBoundary>
  );
}
