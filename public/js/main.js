/**
 * MangaFlow Entry Point:
 * - iOS Standalone PWA safe area detection
 * - Global navigation & keyboard wiring
 * - Route registration
 */
import { state, updateBookmarkBadge } from './state.js';
import { registerRoutes, navigateTo, goBack, initRouter } from './router.js';
import {
  initHomeInteractions,
  loadHomeView,
  loadSearchView,
  openRandomComic
} from './views/home.js';
import { initDetailInteractions, loadDetailView } from './views/detail.js';
import {
  initReaderInteractions,
  loadReaderView,
  cleanupReader,
  handleReaderKeydown
} from './views/reader.js';
import {
  initLibraryInteractions,
  loadBookmarksView,
  loadHistoryView
} from './views/library.js';

(function initIosStandaloneDetector() {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = Boolean(
    window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
  );

  if (isStandalone) {
    document.documentElement.classList.add('standalone-pwa');
    if (isIOS) {
      document.documentElement.classList.add('standalone-ios');
      const maxDim = Math.max(window.screen.width, window.screen.height);
      if (maxDim >= 852) {
        document.documentElement.classList.add('ios-dynamic-island');
      }
    }
  }
})();

// Register SPA routes
registerRoutes(async (rawHash, ctx) => {
  if (!rawHash.startsWith('read/') && state.currentView === 'reader') {
    cleanupReader();
  }

  if (rawHash.startsWith('read/')) {
    const parts = rawHash.slice(5).split('/');
    const comicSlug = decodeURIComponent(parts[0] || '');
    const chapterSlug = decodeURIComponent(parts.slice(1).join('/') || '');
    if (comicSlug && chapterSlug) {
      await loadReaderView(comicSlug, chapterSlug, ctx);
      return true;
    }
  }

  if (rawHash.startsWith('comic/')) {
    const slug = decodeURIComponent(rawHash.slice(6));
    if (slug) {
      await loadDetailView(slug, rawHash, ctx);
      return true;
    }
  }

  if (rawHash.startsWith('genre/')) {
    const rest = rawHash.slice(6);
    const qIdx = rest.indexOf('?');
    const genreSlug = decodeURIComponent(qIdx !== -1 ? rest.slice(0, qIdx) : rest);
    const params = qIdx !== -1 ? new URLSearchParams(rest.slice(qIdx + 1)) : null;
    const page = Math.max(1, parseInt(params?.get('page') || '1', 10) || 1);
    if (genreSlug) {
      await loadHomeView({ page, genre: genreSlug, hashKey: rawHash }, ctx);
      return true;
    }
  }

  if (rawHash.startsWith('search/')) {
    const rest = rawHash.slice(7);
    const qIdx = rest.indexOf('?');
    const keyword = decodeURIComponent(qIdx !== -1 ? rest.slice(0, qIdx) : rest);
    const params = qIdx !== -1 ? new URLSearchParams(rest.slice(qIdx + 1)) : null;
    const page = Math.max(1, parseInt(params?.get('page') || '1', 10) || 1);
    if (keyword) {
      await loadSearchView(keyword, page, rawHash, ctx);
      return true;
    }
  }

  if (rawHash === 'bookmarks') {
    loadBookmarksView(rawHash);
    return true;
  }

  if (rawHash === 'history') {
    loadHistoryView(rawHash);
    return true;
  }

  // Default Home route (#home or #home?...)
  const qIdx = rawHash.indexOf('?');
  const params = new URLSearchParams(qIdx !== -1 ? rawHash.slice(qIdx + 1) : '');
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const sort = parseInt(params.get('sort') || '0', 10) || 0;
  const status = parseInt(params.get('status') || '0', 10) || 0;

  await loadHomeView({ page, sort, status, hashKey: rawHash || 'home' }, ctx);
  return true;
});

// Wire global header & nav
document.getElementById('logo-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  navigateTo('#home');
});

document.getElementById('btn-back-global')?.addEventListener('click', () => {
  goBack('#home');
});

document.querySelectorAll('.nav-actions .nav-btn[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => navigateTo(`#${btn.dataset.tab}`));
});

document.querySelectorAll('.mobile-bottom-nav .m-nav-item[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => navigateTo(`#${btn.dataset.tab}`));
});

document.getElementById('btn-random-manga')?.addEventListener('click', openRandomComic);
document.getElementById('btn-m-random')?.addEventListener('click', openRandomComic);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const genresBackdrop = document.getElementById('genres-modal-backdrop');
    if (genresBackdrop && !genresBackdrop.classList.contains('hidden')) {
      genresBackdrop.classList.add('hidden');
      return;
    }
  }
  handleReaderKeydown(e);
});

// Boot modules
updateBookmarkBadge();
initHomeInteractions();
initDetailInteractions();
initReaderInteractions();
initLibraryInteractions();
initRouter();
