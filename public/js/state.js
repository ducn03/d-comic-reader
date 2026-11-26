/**
 * Application State & Safe LocalStorage Persistence (with legacy bloat migration).
 */
import { parseVietnameseTime } from './utils.js';

const STORAGE_KEYS = {
  BOOKMARKS: 'mf_bookmarks',
  HISTORY: 'mf_history',
  READ_CHAPTERS: 'mf_read_chapters',
  PROGRESS: 'mf_reading_progress',
  SETTINGS: 'mf_reader_settings',
  SEARCH_HISTORY: 'mf_search_history',
  BOOKMARK_SORT: 'mf_bookmark_sort'
};

export const DEFAULT_READER_SETTINGS = {
  mode: 'webtoon', // 'webtoon' | 'paged'
  direction: 'ltr', // 'ltr' | 'rtl'
  width: '840px', // '680px' | '840px' | '1040px' | '100%'
  gap: '0px', // '0px' | '8px'
  theme: 'dark', // 'dark' | 'oled' | 'sepia'
  brightness: 100, // 40..100
  autoScrollSpeed: 90 // px/sec
};

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[Storage] Failed writing ${key}:`, err.message);
  }
}

/**
 * Strips bloated 1,000+ chapter arrays from legacy bookmark objects, keeping only compact metadata.
 */
export function compactBookmark(comic) {
  const firstChap =
    Array.isArray(comic.chapters) && comic.chapters.length > 0 ? comic.chapters[0] : null;

  const latestChapter =
    comic.latestChapter || firstChap?.title || firstChap?.name || '';
  const latestChapterSlug =
    comic.latestChapterSlug || firstChap?.chapterSlug || '';
  const latestTime = comic.latestTime || firstChap?.time || '';

  const parsedTime = latestTime ? parseVietnameseTime(latestTime) : 0;

  return {
    slug: comic.slug,
    title: comic.title || comic.slug,
    cover: comic.cover || '',
    views: comic.views || '',
    latestChapter,
    latestChapterSlug,
    latestTime,
    bookmarkedAt: comic.bookmarkedAt || Date.now(),
    updatedAt: comic.updatedAt || (parsedTime > 0 ? parsedTime : Date.now())
  };
}

function loadInitialBookmarks() {
  const rawList = readStorage(STORAGE_KEYS.BOOKMARKS, []);
  if (!Array.isArray(rawList)) return [];

  let needsMigration = false;
  const compacted = rawList
    .filter((b) => b && b.slug)
    .map((b) => {
      if (Array.isArray(b.chapters)) needsMigration = true;
      return compactBookmark(b);
    });

  if (needsMigration) {
    writeStorage(STORAGE_KEYS.BOOKMARKS, compacted);
  }
  return compacted;
}

export const state = {
  currentView: 'home',
  homePage: 1,
  homeSort: 0,
  homeGenre: '',
  homeStatus: 0,
  searchKeyword: '',
  searchPage: 1,
  loadedComics: [],

  currentComic: null,
  chaptersList: [],
  chapterSortAsc: false,

  readingComicSlug: null,
  readingChapterSlug: null,
  readingChapterData: null,
  pagedCurrentIndex: 0,

  bookmarks: loadInitialBookmarks(),
  bookmarkSlugs: new Set(),
  history: Array.isArray(readStorage(STORAGE_KEYS.HISTORY, []))
    ? readStorage(STORAGE_KEYS.HISTORY, [])
    : [],
  readChapters: readStorage(STORAGE_KEYS.READ_CHAPTERS, {}),
  readingProgress: readStorage(STORAGE_KEYS.PROGRESS, {}),
  readerSettings: {
    ...DEFAULT_READER_SETTINGS,
    ...readStorage(STORAGE_KEYS.SETTINGS, {})
  },
  searchHistory: Array.isArray(readStorage(STORAGE_KEYS.SEARCH_HISTORY, []))
    ? readStorage(STORAGE_KEYS.SEARCH_HISTORY, [])
    : [],
  bookmarkSort: localStorage.getItem(STORAGE_KEYS.BOOKMARK_SORT) || 'updated',

  scrollPositions: new Map()
};

function refreshBookmarkSet() {
  state.bookmarkSlugs = new Set(state.bookmarks.map((b) => b.slug));
}
refreshBookmarkSet();

export function isBookmarked(slug) {
  return state.bookmarkSlugs.has(slug);
}

export function updateBookmarkBadge() {
  const count = state.bookmarks.length;
  const desktop = document.getElementById('bookmark-badge');
  const mobile = document.getElementById('m-bookmark-badge');
  if (desktop) desktop.textContent = String(count);
  if (mobile) mobile.textContent = String(count);
}

export function saveBookmarks() {
  refreshBookmarkSet();
  writeStorage(STORAGE_KEYS.BOOKMARKS, state.bookmarks);
  updateBookmarkBadge();
}

export function toggleFavorite(comic) {
  if (!comic || !comic.slug) return { added: false, item: null };
  const idx = state.bookmarks.findIndex((b) => b.slug === comic.slug);

  if (idx > -1) {
    const [removed] = state.bookmarks.splice(idx, 1);
    saveBookmarks();
    return { added: false, item: removed, index: idx };
  }

  const compact = compactBookmark(comic);
  state.bookmarks.unshift(compact);
  saveBookmarks();
  return { added: true, item: compact, index: 0 };
}

export function restoreFavorite(item, index = 0) {
  if (!item || !item.slug || state.bookmarkSlugs.has(item.slug)) return;
  const safeIndex = Math.max(0, Math.min(index, state.bookmarks.length));
  state.bookmarks.splice(safeIndex, 0, compactBookmark(item));
  saveBookmarks();
}

export function clearAllBookmarks() {
  state.bookmarks = [];
  saveBookmarks();
}

export function setBookmarkSort(sortVal) {
  state.bookmarkSort = sortVal;
  try {
    localStorage.setItem(STORAGE_KEYS.BOOKMARK_SORT, sortVal);
  } catch {}
}

export function markChapterAsRead(comicSlug, chapterSlug) {
  if (!comicSlug || !chapterSlug) return;
  if (!Array.isArray(state.readChapters[comicSlug])) {
    state.readChapters[comicSlug] = [];
  }
  const list = state.readChapters[comicSlug];
  if (!list.includes(chapterSlug)) {
    list.push(chapterSlug);
    if (list.length > 2000) list.shift();
    writeStorage(STORAGE_KEYS.READ_CHAPTERS, state.readChapters);
  }
}

export function saveReadingProgress(comicSlug, payload) {
  if (!comicSlug || !payload?.chapterSlug) return;
  state.readingProgress[comicSlug] = {
    chapterSlug: payload.chapterSlug,
    chapterTitle: payload.chapterTitle || payload.chapterSlug,
    pageIndex: payload.pageIndex || 0,
    totalPages: payload.totalPages || 0,
    scrollRatio: payload.scrollRatio || 0,
    updatedAt: Date.now()
  };

  // Prune to max 100 entries by recency
  const entries = Object.entries(state.readingProgress);
  if (entries.length > 100) {
    entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
    state.readingProgress = Object.fromEntries(entries.slice(0, 100));
  }
  writeStorage(STORAGE_KEYS.PROGRESS, state.readingProgress);
}

export function getReadingProgress(comicSlug) {
  return state.readingProgress[comicSlug] || null;
}

export function addToHistory(item) {
  if (!item || !item.slug) return;
  state.history = state.history.filter((h) => h.slug !== item.slug);
  state.history.unshift(item);
  if (state.history.length > 60) state.history.length = 60;
  writeStorage(STORAGE_KEYS.HISTORY, state.history);
}

export function updateHistoryCover(slug, cover) {
  if (!slug || !cover) return;
  const target = state.history.find((h) => h.slug === slug);
  if (target && !target.cover) {
    target.cover = cover;
    writeStorage(STORAGE_KEYS.HISTORY, state.history);
  }
}

export function removeHistoryItem(slug) {
  state.history = state.history.filter((h) => h.slug !== slug);
  writeStorage(STORAGE_KEYS.HISTORY, state.history);
}

export function clearAllHistory() {
  state.history = [];
  writeStorage(STORAGE_KEYS.HISTORY, []);
}

export function saveReaderSettings(partial) {
  state.readerSettings = { ...state.readerSettings, ...partial };
  writeStorage(STORAGE_KEYS.SETTINGS, state.readerSettings);
}

export function addSearchHistory(keyword) {
  const clean = (keyword || '').trim();
  if (clean.length < 2) return;
  state.searchHistory = [
    clean,
    ...state.searchHistory.filter((k) => k.toLowerCase() !== clean.toLowerCase())
  ].slice(0, 6);
  writeStorage(STORAGE_KEYS.SEARCH_HISTORY, state.searchHistory);
}
