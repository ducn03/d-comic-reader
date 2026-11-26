/**
 * Non-blocking SPA Hash Router with Sequence Guard, AbortController, and Scroll Restoration.
 */
import { state } from './state.js';

let routeSeq = 0;
let activeController = null;
let currentHashKey = '';
let navigationDepth = 0;
const handlers = [];

export function registerRoutes(routeMatcherFn) {
  handlers.push(routeMatcherFn);
}

export function switchView(viewName) {
  state.currentView = viewName;
  document.body.classList.toggle('in-reader', viewName === 'reader');

  const viewIds = ['home', 'detail', 'reader', 'bookmarks', 'history'];
  for (const id of viewIds) {
    const el = document.getElementById(`view-${id}`);
    if (el) el.classList.toggle('active', id === viewName);
  }

  document.querySelectorAll('.nav-actions .nav-btn[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === viewName);
  });

  document.querySelectorAll('.mobile-bottom-nav .m-nav-item[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === viewName);
  });

  const backBtn = document.getElementById('btn-back-global');
  if (backBtn) {
    backBtn.classList.toggle('hidden', viewName === 'home');
  }
}

export function navigateTo(hash) {
  const normalized = hash.startsWith('#') ? hash : `#${hash}`;
  if (window.location.hash === normalized) {
    handleRoute();
  } else {
    navigationDepth++;
    window.location.hash = normalized;
  }
}

export function goBack(fallbackHash = '#home') {
  if (navigationDepth > 0 && window.history.length > 1) {
    navigationDepth = Math.max(0, navigationDepth - 1);
    window.history.back();
  } else {
    navigateTo(fallbackHash);
  }
}

export function getRouteSeq() {
  return routeSeq;
}

export async function handleRoute() {
  // Save scroll position for outgoing view (except reader which manages chapter scroll)
  if (currentHashKey && state.currentView !== 'reader') {
    state.scrollPositions.set(currentHashKey, window.scrollY);
  }

  if (activeController) {
    activeController.abort();
  }
  activeController = new AbortController();
  const { signal } = activeController;
  const seq = ++routeSeq;

  const rawHash = (window.location.hash || '').replace(/^#\/?/, '');
  currentHashKey = rawHash || 'home';

  for (const handler of handlers) {
    try {
      const handled = await handler(rawHash, { signal, seq, isStale: () => seq !== routeSeq });
      if (handled) break;
    } catch (err) {
      if (err?.name === 'AbortError' || seq !== routeSeq) {
        return;
      }
      console.error('[Router] Route handler error:', err);
      break;
    }
  }
}

export function restoreViewScroll(hashKey, fallbackTop = 0) {
  const saved = state.scrollPositions.get(hashKey || currentHashKey);
  const top = typeof saved === 'number' ? saved : fallbackTop;
  requestAnimationFrame(() => {
    window.scrollTo({ top, behavior: 'instant' });
  });
}

export function initRouter() {
  window.addEventListener('hashchange', () => {
    handleRoute();
  });
  handleRoute();
}
