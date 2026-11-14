'use client';

import React, { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamic module');

    if (isChunkError && typeof window !== 'undefined') {
      const reloadKey = 'taskboard_last_chunk_reload';
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem(reloadKey, now.toString());
        window.location.reload();
      }
    }
  }, [error]);

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-teal/10 text-teal flex items-center justify-center mb-4">
        <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-ink mb-2">
        App Version Updated
      </h2>
      <p className="text-muted mb-5 text-sm max-w-md">
        A new version of TaskBoard OS has been deployed. Refreshing to load the latest dashboard components...
      </p>
      <button
        onClick={handleReload}
        className="px-4 py-2 bg-teal text-white text-xs font-semibold rounded-lg hover:bg-tealhi transition-colors shadow-sm"
      >
        Refresh Application
      </button>
    </div>
  );
}
