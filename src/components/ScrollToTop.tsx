import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Ensures that navigating via hyperlinks always starts at the top of the viewport
 * rather than leaving the user scrolled down into empty white/blank space.
 */
export function ScrollToTop() {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const id = hash.replace(/^#/, '');
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    // Instant scroll to top on navigation
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }
  }, [pathname, search, hash]);

  return null;
}
