/**
 * Application State & LocalStorage Persistence:
 * - Clean separation between chapterUpdatedAt (chapter release time) & bookmarkedAt (follow time)
 * - Automatic migration of legacy v3.5 bookmarks that mistakenly stored Date.now() for undated comics
 * - Precision-preserving merge helpers for 2-tier bookmark sync
 */
import {
  parseVietnameseTimeWithPrecision,
  isSameLocalDay,
  formatChapterTimeLabel
} from './utils.js?v=4.0';

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
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readStringStorage(key, fallback) {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[Storage] Failed writing ${key}:`, err.message);
  }
}

/**
 * Creates a clean compact bookmark record. Never fabricates chapterUpdatedAt with Date.now().
 */
export function compactBookmark(comic, nowMs = Date.now()) {
  const firstChap =
    Array.isArray(comic.chapters) && comic.chapters.length > 0 ? comic.chapters[0] : null;

  const latestChapter =
    comic.latestChapter || firstChap?.title || firstChap?.name || '';
  const latestChapterSlug =
    comic.latestChapterSlug || firstChap?.chapterSlug || '';
  const latestTime = comic.latestTime || firstChap?.time || '';
  const bookmarkedAt = Number(comic.bookmarkedAt) > 0 ? Number(comic.bookmarkedAt) : nowMs;

  let chapterUpdatedAt = 0;
  let chapterTimePrecision = 'none';

  if (Object.prototype.hasOwnProperty.call(comic, 'chapterUpdatedAt')) {
    // Already migrated v4 bookmark (restored from storage / backup / undo)
    chapterUpdatedAt = Math.max(0, Number(comic.chapterUpdatedAt) || 0);
    chapterTimePrecision =
      comic.chapterTimePrecision || (chapterUpdatedAt > 0 ? 'day' : 'none');
  } else if (
    Object.prototype.hasOwnProperty.call(comic, 'updatedAt') &&
    !Array.isArray(comic.chapters)
  ) {
    // Legacy v3.5 bookmark migration
    const parsed = parseVietnameseTimeWithPrecision(latestTime, nowMs);
    if (parsed.precision === 'day' && parsed.ts > 0) {
      chapterUpdatedAt = parsed.ts;
      chapterTimePrecision = 'day';
    } else if (parsed.precision === 'exact') {
      const legacyTs = Number(comic.updatedAt) || parsed.ts;
      chapterUpdatedAt = legacyTs > 0 ? legacyTs : parsed.ts;
      chapterTimePrecision = 'exact';
    } else {
      // Legacy bookmark had no latestTime -> v3.5 faked updatedAt = Date.now(). Reset to 0 so sync fixes it!
      chapterUpdatedAt = 0;
      chapterTimePrecision = 'none';
    }
  } else {
    // Fresh comic object from API (Home / Genre / Search / Detail)
    const parsed = parseVietnameseTimeWithPrecision(latestTime, nowMs);
    chapterUpdatedAt = parsed.ts;
    chapterTimePrecision = parsed.precision;
  }

  return {
    slug: comic.slug,
    title: comic.title || comic.slug,
    cover: comic.cover || '',
    views: comic.views || '',
    latestChapter,
    latestChapterSlug,
    latestTime,
    bookmarkedAt,
    chapterUpdatedAt,
    chapterTimePrecision
  };
}

function loadInitialBookmarks() {
  const rawList = readStorage(STORAGE_KEYS.BOOKMARKS, []);
  if (!Array.isArray(rawList)) return [];

  let needsMigration = false;
  const compacted = rawList
    .filter((b) => b && b.slug)
    .map((b) => {
      if (
        Array.isArray(b.chapters) ||
        !Object.prototype.hasOwnProperty.call(b, 'chapterUpdatedAt')
      ) {
        needsMigration = true;
      }
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
  bookmarkUnreadOnly: false,
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
  bookmarkSort: readStringStorage(STORAGE_KEYS.BOOKMARK_SORT, 'updated'),

  scrollPositions: new Map()
};

function refreshBookmarkSet() {
  state.bookmarkSlugs = new Set(state.bookmarks.map((b) => b.slug));
}
refreshBookmarkSet();

export function isBookmarked(slug) {
  return state.bookmarkSlugs.has(slug);
}

export function hasBookmarkUnreadChapter(bm, readChaptersMap = state.readChapters, progressMap = state.readingProgress) {
  if (!bm?.slug || !bm?.latestChapterSlug) return false;
  const readArr = readChaptersMap[bm.slug] || [];
  if (readArr.includes(bm.latestChapterSlug)) return false;
  const prog = progressMap[bm.slug];
  if (prog && prog.chapterSlug === bm.latestChapterSlug) return false;
  return true;
}

export function getBookmarkDisplayTime(bm, nowMs = Date.now()) {
  if (!bm) return '';
  if (bm.chapterUpdatedAt > 0) {
    return formatChapterTimeLabel(bm.chapterUpdatedAt, bm.chapterTimePrecision, bm.latestTime, nowMs);
  }
  return bm.latestTime || 'Chưa đồng bộ';
}

/**
 * Merges incoming chapter metadata into an existing bookmark record.
 * Preserves minute-level 'exact' precision when a Detail lookup returns day-only precision
 * for the same calendar day and same chapter. Returns true if anything changed.
 */
export function mergeBookmarkChapterInfo(bm, info, nowMs = Date.now()) {
  if (!bm || !info) return false;
  let changed = false;

  if (info.title && bm.title !== info.title) {
    bm.title = info.title;
    changed = true;
  }
  if (info.cover && !bm.cover) {
    bm.cover = info.cover;
    changed = true;
  }
  if (info.views && bm.views !== info.views) {
    bm.views = info.views;
    changed = true;
  }

  const nextChap = info.latestChapter || '';
  const nextSlug = info.latestChapterSlug || '';
  const nextTimeRaw = info.latestTime || '';
  const parsed = parseVietnameseTimeWithPrecision(nextTimeRaw, nowMs);

  const chapterChanged = Boolean(nextChap && bm.latestChapter !== nextChap);
  if (chapterChanged) {
    bm.latestChapter = nextChap;
    if (nextSlug) bm.latestChapterSlug = nextSlug;
    if (parsed.ts > 0) {
      bm.latestTime = nextTimeRaw;
      bm.chapterUpdatedAt = parsed.ts;
      bm.chapterTimePrecision = parsed.precision;
    }
    return true;
  }

  if (nextSlug && bm.latestChapterSlug !== nextSlug) {
    bm.latestChapterSlug = nextSlug;
    changed = true;
  }

  if (parsed.ts <= 0) {
    return changed;
  }

  if (!bm.chapterUpdatedAt || bm.chapterUpdatedAt <= 0) {
    bm.chapterUpdatedAt = parsed.ts;
    bm.chapterTimePrecision = parsed.precision;
    bm.latestTime = nextTimeRaw;
    return true;
  }

  if (parsed.precision === 'exact') {
    if (
      bm.chapterTimePrecision !== 'exact' ||
      Math.abs(parsed.ts - bm.chapterUpdatedAt) > 120000
    ) {
      bm.chapterUpdatedAt = parsed.ts;
      bm.chapterTimePrecision = 'exact';
      bm.latestTime = nextTimeRaw;
      return true;
    }
    return changed;
  }

  // Incoming has 'day' precision (e.g. '27/11/2026' -> midnight 00:00)
  if (bm.chapterTimePrecision === 'exact' && isSameLocalDay(bm.chapterUpdatedAt, parsed.ts)) {
    // Preserve higher-precision minute/hour timestamp on the same calendar day!
    return changed;
  }

  if (bm.chapterUpdatedAt !== parsed.ts) {
    bm.chapterUpdatedAt = parsed.ts;
    bm.chapterTimePrecision = 'day';
    bm.latestTime = nextTimeRaw;
    return true;
  }

  return changed;
}

/**
 * Comparator for sorting bookmarks by latest chapter release time (newest first).
 * Comics with unknown release time (0) always sink below dated ones.
 */
export function compareBookmarksUpdated(
  a,
  b,
  readChaptersMap = state.readChapters,
  progressMap = state.readingProgress
) {
  const ta = Number(a?.chapterUpdatedAt) || 0;
  const tb = Number(b?.chapterUpdatedAt) || 0;
  if (tb !== ta) return tb - ta;

  const ua = hasBookmarkUnreadChapter(a, readChaptersMap, progressMap) ? 1 : 0;
  const ub = hasBookmarkUnreadChapter(b, readChaptersMap, progressMap) ? 1 : 0;
  if (ub !== ua) return ub - ua;

  return (Number(b?.bookmarkedAt) || 0) - (Number(a?.bookmarkedAt) || 0);
}

export function updateBookmarkBadge() {
  if (typeof document === 'undefined') return;
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

export function syncSingleBookmarkFromComic(comic) {
  if (!comic?.slug || !state.bookmarkSlugs.has(comic.slug)) return false;
  const bm = state.bookmarks.find((b) => b.slug === comic.slug);
  if (!bm) return false;

  const firstChap = Array.isArray(comic.chapters) ? comic.chapters[0] : null;
  const changed = mergeBookmarkChapterInfo(bm, {
    title: comic.title,
    cover: comic.cover,
    views: comic.views,
    latestChapter: comic.latestChapter || firstChap?.title || firstChap?.name || '',
    latestChapterSlug: comic.latestChapterSlug || firstChap?.chapterSlug || '',
    latestTime: comic.latestTime || firstChap?.time || ''
  });
  if (changed) saveBookmarks();
  return changed;
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

  // If bookmarked from Detail (day precision) or Search (none), check loadedComics for exact minute time
  if (compact.chapterTimePrecision !== 'exact') {
    const listMatch = (state.loadedComics || []).find((c) => c.slug === comic.slug);
    const listChap = listMatch?.chapters?.[0];
    if (listChap) {
      mergeBookmarkChapterInfo(compact, {
        title: listMatch.title,
        cover: listMatch.cover,
        views: listMatch.views,
        latestChapter: listChap.title || listChap.name || '',
        latestChapterSlug: listChap.chapterSlug || '',
        latestTime: listChap.time || ''
      });
    }
  }

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
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.BOOKMARK_SORT, sortVal);
    }
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
