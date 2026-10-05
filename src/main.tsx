import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@livekit/components-styles';
import './styles/global.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ScrollToTop } from './components/ScrollToTop';
import { isChunkLoadError } from './utils/lazyWithRetry';

// Automatically handle dynamic import / chunk fetch failures (e.g. after deployments or network glitches)
if (typeof window !== 'undefined') {
  const triggerAutoReload = (reason: string) => {
    console.warn(`[Ventricura] Recovering from chunk/module error: ${reason}`);
    const storageKey = 'ventricura_chunk_recovery';
    const lastReload = sessionStorage.getItem(storageKey);
    const now = Date.now();
    // Guard against reload loops: allow 1 reload every 8 seconds
    if (!lastReload || now - parseInt(lastReload, 10) > 8000) {
      sessionStorage.setItem(storageKey, String(now));
      window.location.reload();
    }
  };

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    triggerAutoReload('vite:preloadError');
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      triggerAutoReload(event.reason?.message || 'unhandledrejection');
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);

