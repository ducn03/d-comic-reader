/**
 * Non-blocking SPA Hash Router with Hierarchical Navigation Stack (prevents Back loops),
 * Keep-Alive Explore/Tab History, AbortController, and Scroll Restoration.
 */
import { state } from './state.js';

let routeSeq = 0;
let activeController = null;
let currentHashKey = '';
const handlers = [];

// Pure navigation stack tracking to guarantee #comic <-> #read loops never happen
let navStack = [];
let pendingNavHash = null;
let lastTabHash = '#home';
let lastExploreHash = '#home';

export function normalizeHash(hash) {
  const h = String(hash || '').trim();
  if (!h || h === '#' || h === '#/') return '#home';
  return h.startsWith('#') ? h : `#${h}`;
}

export function isReaderHash(hash) {
  return normalizeHash(hash).startsWith('#read/');
}

export function isDetailHash(hash) {
  return normalizeHash(hash).startsWith('#comic/');
}

export function isExploreHash(hash) {
  const h = normalizeHash(hash);
  return h === '#home' || h.startsWith('#home?') || h.startsWith('#genre/') || h.startsWith('#search/');
}

export function isTabHash(hash) {
  const h = normalizeHash(hash);
  return isExploreHash(h) || h === '#bookmarks' || h === '#history';
}

/**
 * Pure Navigation Stack Model (exported for automated testing).
 */
export function createNavModel(initialHash = '#home') {
  const start = normalizeHash(initialHash);
  return {
    stack: [start],
    lastTabHash: isTabHash(start) ? start : '#home',
    lastExploreHash: isExploreHash(start) ? start : '#home'
  };
}

export function modelPush(model, hash, { replace = false } = {}) {
  const target = normalizeHash(hash);
  if (replace && model.stack.length > 0) {
    model.stack[model.stack.length - 1] = target;
  } else if (model.stack[model.stack.length - 1] !== target) {
    model.stack.push(target);
    if (model.stack.length > 100) model.stack.shift();
  }
  if (isTabHash(target)) model.lastTabHash = target;
  if (isExploreHash(target)) model.lastExploreHash = target;
  return target;
}

export function modelSyncExternalHash(model, hash) {
  const target = normalizeHash(hash);
  if (model.stack.length >= 2 && model.stack[model.stack.length - 2] === target) {
    model.stack.pop();
  } else if (model.stack[model.stack.length - 1] !== target) {
    model.stack.push(target);
    if (model.stack.length > 100) model.stack.shift();
  }
  if (isTabHash(target)) model.lastTabHash = target;
  if (isExploreHash(target)) model.lastExploreHash = target;
  return target;
}

export function decideReaderBack(model, comicSlug) {
  const detailHash = comicSlug ? `#comic/${encodeURIComponent(comicSlug)}` : '';
  const prev = model.stack.length >= 2 ? model.stack[model.stack.length - 2] : '';

  if (detailHash && prev === detailHash) {
    return { action: 'historyBack', target: prev };
  }
  if (detailHash) {
    return { action: 'replace', target: detailHash };
  }
  return { action: 'replace', target: model.lastTabHash || '#home' };
}

export function decideDetailBack(model) {
  const current = model.stack[model.stack.length - 1] || '';
  const prev = model.stack.length >= 2 ? model.stack[model.stack.length - 2] : '';

  if (prev && !isReaderHash(prev) && prev !== current) {
    return { action: 'historyBack', target: prev };
  }
  return { action: 'replace', target: model.lastTabHash || '#home' };
}

function getRuntimeModel() {
  return { stack: navStack, lastTabHash, lastExploreHash };
}

function syncRuntimeFromModel(m) {
  navStack = m.stack;
  lastTabHash = m.lastTabHash;
  lastExploreHash = m.lastExploreHash;
}

export function getLastTabHash() {
  return lastTabHash;
}

export function getLastExploreHash() {
  return lastExploreHash;
}

export function registerRoutes(routeMatcherFn) {
  handlers.push(routeMatcherFn);
}

export function switchView(viewName, rawHash = '') {
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
    const clean = (rawHash || (window.location.hash || '').replace(/^#\/?/, '')).trim();
    const isRootHome = viewName === 'home' && (!clean || clean === 'home');
    backBtn.classList.toggle('hidden', isRootHome);
  }
}

export function navigateTo(hash, { replace = false } = {}) {
  const normalized = normalizeHash(hash);
  const model = getRuntimeModel();
  modelPush(model, normalized, { replace });
  syncRuntimeFromModel(model);

  if (window.location.hash === normalized) {
    handleRoute();
    return;
  }

  if (replace) {
    try {
      window.history.replaceState({ mfIdx: navStack.length - 1 }, '', normalized);
      handleRoute();
      return;
    } catch {
      pendingNavHash = normalized;
      window.location.replace(normalized);
      return;
    }
  }

  pendingNavHash = normalized;
  window.location.hash = normalized;
}

export function goBackFromReader(comicSlug) {
  const model = getRuntimeModel();
  const decision = decideReaderBack(model, comicSlug);

  if (decision.action === 'historyBack' && window.history.length > 1) {
    window.history.back();
  } else {
    navigateTo(decision.target, { replace: true });
  }
}

export function goBackFromDetail() {
  const model = getRuntimeModel();
  const decision = decideDetailBack(model);

  if (decision.action === 'historyBack' && window.history.length > 1) {
    window.history.back();
  } else {
    navigateTo(decision.target, { replace: true });
  }
}

export function goBack(fallbackHash = '#home') {
  if (state.currentView === 'reader') {
    goBackFromReader(state.readingComicSlug);
    return;
  }
  if (state.currentView === 'detail') {
    goBackFromDetail();
    return;
  }

  const prev = navStack.length >= 2 ? navStack[navStack.length - 2] : '';
  if (prev && !isReaderHash(prev) && !isDetailHash(prev) && window.history.length > 1) {
    window.history.back();
  } else {
    navigateTo(fallbackHash || lastExploreHash || '#home', { replace: true });
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

  const fullNormalized = normalizeHash(window.location.hash);
  if (pendingNavHash === fullNormalized) {
    pendingNavHash = null;
  } else {
    const model = getRuntimeModel();
    modelSyncExternalHash(model, fullNormalized);
    syncRuntimeFromModel(model);
  }

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
  const initModel = createNavModel(window.location.hash || '#home');
  syncRuntimeFromModel(initModel);

  window.addEventListener('hashchange', () => {
    handleRoute();
  });
  handleRoute();
}
