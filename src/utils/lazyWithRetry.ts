import { ComponentType, lazy, LazyExoticComponent } from 'react';

/**
 * Checks whether an error is caused by a failed dynamic chunk import
 * (e.g. after a new deployment when old chunk hashes no longer exist, or network interruption).
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const name = (error as Error)?.name || '';
  return (
    name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Unable to preload CSS/i.test(message) ||
    /Load failed/i.test(message) ||
    /Failed to load resource/i.test(message) ||
    /Failed to fetch/i.test(message) ||
    /NetworkError/i.test(message)
  );
}

/**
 * Wraps dynamic React component imports with automatic retries and auto-reload on stale deployment chunks.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  intervalMs = 600
): LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (remaining: number) => {
        factory()
          .then(resolve)
          .catch((error) => {
            const chunkError = isChunkLoadError(error);

            if (remaining > 0) {
              setTimeout(() => attempt(remaining - 1), intervalMs);
              return;
            }

            if (chunkError && typeof window !== 'undefined') {
              const storageKey = `ventricura_chunk_reload_${window.location.pathname}`;
              const lastReload = sessionStorage.getItem(storageKey);
              const now = Date.now();
              // Prevent infinite reload loop by enforcing a 10-second debounce
              if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
                sessionStorage.setItem(storageKey, String(now));
                window.location.reload();
                // Reject after scheduling reload so React Suspense/ErrorBoundary doesn't hang in a void
                setTimeout(() => reject(error), 500);
                return;
              }
            }

            reject(error);
          });
      };

      attempt(retries);
    })
  );
}
