'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ChunkErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamic module') ||
      error?.message?.includes('CSS chunk');

    if (isChunkError && typeof window !== 'undefined') {
      const reloadKey = 'taskboard_last_chunk_reload';
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem(reloadKey, now.toString());
        window.location.reload();
      }
    }
  }


  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.name === 'ChunkLoadError' ||
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.message?.includes('Failed to fetch dynamic module') ||
        this.state.error?.message?.includes('CSS chunk');

      return (
        <div className="flex flex-col items-center justify-center min-h[40vh] p-6 text-center">
          <div className="w-10 h-10 rounded-full bg-teal/10 text-teal flex items-center justify-center mb-3">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-ink mb-1">
            {isChunkError ? 'Updating Dashboard to Latest Version...' : 'Unable to load component'}
          </h2>
          <p className="text-muted mb-4 text-xs max-w-sm">
            {isChunkError
              ? 'A newer build was deployed. Reloading page to sync assets...'
              : (this.state.error?.message || 'An unexpected error occurred.')}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-3.5 py-1.5 bg-teal text-white text-xs font-semibold rounded-lg hover:bg-tealhi transition-colors shadow-sm"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
