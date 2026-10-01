import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@livekit/components-styles';
import './styles/global.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// Automatically handle Vite dynamic import preload failures (e.g. after new deployments)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    console.warn('[Vite Preload Error] Module chunk fetch failed, attempting recovery reload...', event);
    const storageKey = 'ventricura_preload_error_reload';
    const lastReload = sessionStorage.getItem(storageKey);
    const now = Date.now();
    // Guard against reload loops: allow 1 reload every 10 seconds
    if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
      sessionStorage.setItem(storageKey, String(now));
      window.location.reload();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);

