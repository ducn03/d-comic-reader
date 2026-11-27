/**
 * Library Views:
 * - Bookmarks with accurate release-time sorting, 2-tier full sync, unread filter chip, and overflow menu
 * - Keep-Alive DOM signatures so returning to Bookmarks / History preserves state without flicker
 */
import { fetchApi } from '../api.js';
import {
  state,
  compactBookmark,
  mergeBookmarkChapterInfo,
  compareBookmarksUpdated,
  hasBookmarkUnreadChapter,
  getBookmarkDisplayTime,
  saveBookmarks,
  restoreFavorite,
  clearAllBookmarks,
  setBookmarkSort,
  removeHistoryItem,
  clearAllHistory,
  getReadingProgress
} from '../state.js';
import {
  escapeHtml,
  debounce,
  getProxyImageUrl,
  FALLBACK_COVER,
  showToast
} from '../utils.js';
import { ICONS } from '../icons.js';
import { navigateTo, switchView, restoreViewScroll } from '../router.js';
import { renderComicsGrid } from './home.js';

let syncAbort = null;
let lastFullSyncTime = 0;
let lastHomeSyncTime = 0;
const sessionSyncedSlugs = new Set();

function updateUnreadFilterButtonUI() {
  const unreadBtn = document.getElementById('btn-filter-unread');
  if (!unreadBtn) return;

  const unreadCount = state.bookmarks.filter((bm) => hasBookmarkUnreadChapter(bm)).length;
  unreadBtn.classList.toggle('active', Boolean(state.bookmarkUnreadOnly));
  unreadBtn.textContent = unreadCount > 0 ? `Có chap mới (${unreadCount})` : 'Có chap mới';
}

function getSortedFilteredBookmarks() {
  const filterText = (document.getElementById('bookmarks-filter-input')?.value || '')
    .trim()
    .toLowerCase();

  let list = [...state.bookmarks];
  if (filterText) {
    list = list.filter((b) => (b.title || '').toLowerCase().includes(filterText));
  }

  if (state.bookmarkUnreadOnly) {
    list = list.filter((bm) => hasBookmarkUnreadChapter(bm));
  }

  const sortType = state.bookmarkSort || 'updated';
  if (sortType === 'az') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi'));
  } else if (sortType === 'added') {
    list.sort((a, b) => (Number(b.bookmarkedAt) || 0) - (Number(a.bookmarkedAt) || 0));
  } else {
    list.sort((a, b) => compareBookmarksUpdated(a, b));
  }

  // Enrich chapter time label dynamically for display in grid
  return list.map((bm) => ({
    ...bm,
    latestTime: bm.latestChapter ? getBookmarkDisplayTime(bm) : ''
  }));
}

export function renderBookmarksList() {
  const grid = document.getElementById('bookmarks-grid');
  const pill = document.getElementById('bookmarks-count-pill');
  const sortSelect = document.getElementById('select-bookmark-sort');

  if (pill) pill.textContent = `${state.bookmarks.length} truyện`;
  if (sortSelect) sortSelect.value = state.bookmarkSort || 'updated';
  updateUnreadFilterButtonUI();

  const items = getSortedFilteredBookmarks();
  const emptyText = !state.bookmarks.length
    ? 'Bạn chưa theo dõi bộ truyện nào.'
    : state.bookmarkUnreadOnly
      ? 'Không có truyện nào có chương mới chưa đọc.'
      : 'Không có truyện theo dõi nào khớp từ khóa lọc.';

  renderComicsGrid(items, grid, {
    markUnreadNew: true,
    emptyText,
    onFavoriteToggled: (comic, res, cardEl) => {
      if (!res.added && cardEl) {
        cardEl.remove();
        if (pill) pill.textContent = `${state.bookmarks.length} truyện`;
        updateUnreadFilterButtonUI();
        showToast(`Đã bỏ theo dõi "${comic.title}"`, {
          duration: 4500,
          actionText: 'Hoàn tác',
          onAction: () => {
            restoreFavorite(res.item, res.index);
            renderBookmarksList();
          }
        });
      }
    }
  });
}

export function loadBookmarksView(hashKey) {
  switchView('bookmarks');
  renderBookmarksList();
  restoreViewScroll(hashKey, 0);

  if (state.bookmarks.length > 0) {
    const hasUnsynced = state.bookmarks.some(
      (b) => (!b.chapterUpdatedAt || b.chapterUpdatedAt <= 0) && !sessionSyncedSlugs.has(b.slug)
    );
    const fullDue = Date.now() - lastFullSyncTime > 900000;
    if (fullDue || hasUnsynced) {
      syncBookmarksUpdates(false);
    }
  }
}

function setSyncBtnState(busy, labelText = 'Cập nhật') {
  const btn = document.getElementById('btn-sync-bookmarks');
  if (!btn) return;
  btn.disabled = busy;
  btn.innerHTML = `<span class="btn-svg-icon${busy ? ' is-spinning' : ''}">${ICONS.refresh(15)}</span><span>${escapeHtml(labelText)}</span>`;
}

/**
 * 2-Tier Bookmark Sync:
 * Tier 1: Matches Home pages 1..2 (~84 newest releases) to capture minute-accurate timestamps.
 * Tier 2: Checks ALL remaining followed comics (no 15-item limit) in batches of 3, preserving same-day exact times.
 */
export async function syncBookmarksUpdates(force = false) {
  if (syncAbort || !state.bookmarks.length) return;
  const now = Date.now();
  const unsyncedOnly =
    !force && now - lastFullSyncTime <= 900000
      ? state.bookmarks.filter(
          (b) => (!b.chapterUpdatedAt || b.chapterUpdatedAt <= 0) && !sessionSyncedSlugs.has(b.slug)
        )
      : null;

  if (unsyncedOnly && unsyncedOnly.length === 0) return;

  syncAbort = new AbortController();
  const { signal } = syncAbort;
  const allTargets = unsyncedOnly || [...state.bookmarks];

  let checked = 0;
  let newChapterCount = 0;
  let changedCount = 0;
  const totalCount = allTargets.length;

  setSyncBtnState(true, `0/${totalCount}`);

  try {
    // Tier 1: Fetch Home page 1..2 when doing full sync OR home cache stale
    const homeMap = new Map();
    if (!unsyncedOnly || force || now - lastHomeSyncTime > 300000) {
      lastHomeSyncTime = now;
      const homeResults = await Promise.allSettled([
        fetchApi('home', { page: 1, sort: 0 }, { ttlMs: 120000, signal, force }),
        fetchApi('home', { page: 2, sort: 0 }, { ttlMs: 120000, signal, force })
      ]);

      for (const res of homeResults) {
        if (res.status === 'fulfilled' && Array.isArray(res.value?.comics)) {
          for (const c of res.value.comics) {
            if (c?.slug && !homeMap.has(c.slug)) homeMap.set(c.slug, c);
          }
        }
      }
    }

    // Apply Tier 1 matches immediately
    const tier2Targets = [];
    let tier1Changed = 0;
    for (const bm of allTargets) {
      const homeComic = homeMap.get(bm.slug);
      const firstChap = homeComic?.chapters?.[0];
      if (homeComic && firstChap) {
        sessionSyncedSlugs.add(bm.slug);
        const hadNew = firstChap.title && bm.latestChapter !== firstChap.title;
        const changed = mergeBookmarkChapterInfo(bm, {
          title: homeComic.title,
          cover: homeComic.cover,
          views: homeComic.views,
          latestChapter: firstChap.title || firstChap.name || '',
          latestChapterSlug: firstChap.chapterSlug || '',
          latestTime: firstChap.time || ''
        });
        if (hadNew) newChapterCount++;
        if (changed) {
          changedCount++;
          tier1Changed++;
        }
        checked++;
      } else {
        tier2Targets.push(bm);
      }
    }

    if (tier1Changed > 0) {
      saveBookmarks();
      if (state.currentView === 'bookmarks') renderBookmarksList();
    }
    setSyncBtnState(true, `${checked}/${totalCount}`);

    // Tier 2: Check ALL remaining targets in batches of 3 (complete coverage)
    for (let i = 0; i < tier2Targets.length; i += 3) {
      if (signal.aborted) break;
      const batch = tier2Targets.slice(i, i + 3);

      await Promise.all(
        batch.map(async (bm) => {
          try {
            const detail = await fetchApi(
              'detail',
              { slug: bm.slug },
              { ttlMs: 180000, signal, force }
            );
            sessionSyncedSlugs.add(bm.slug);

            if (detail?.chapters?.length) {
              const latest = detail.chapters[0];
              const chapTitle = latest.name || latest.title || '';
              const hadNew = Boolean(chapTitle && bm.latestChapter !== chapTitle);
              const changed = mergeBookmarkChapterInfo(bm, {
                title: detail.title,
                cover: detail.cover,
                views: detail.views,
                latestChapter: chapTitle,
                latestChapterSlug: latest.chapterSlug || '',
                latestTime: latest.time || ''
              });
              if (hadNew) newChapterCount++;
              if (changed) changedCount++;
            }
          } catch {}
          checked++;
          setSyncBtnState(true, `${checked}/${totalCount}`);
        })
      );
    }

    if (!unsyncedOnly) {
      lastFullSyncTime = Date.now();
    }

    if (changedCount > 0) {
      saveBookmarks();
      if (state.currentView === 'bookmarks') renderBookmarksList();
    }

    if (!signal.aborted) {
      if (newChapterCount > 0) {
        showToast(`Có ${newChapterCount} truyện vừa cập nhật chương mới`);
      } else if (force) {
        showToast(
          changedCount > 0
            ? 'Đã cập nhật lại thứ tự theo thời gian mới nhất'
            : 'Tất cả truyện theo dõi đều đã mới nhất'
        );
      }
    }
  } finally {
    if (changedCount > 0) {
      saveBookmarks();
    }
    syncAbort = null;
    setSyncBtnState(false, 'Cập nhật');
  }
}

export function renderHistoryList() {
  const listEl = document.getElementById('history-list');
  const pill = document.getElementById('history-count-pill');
  const filterText = (document.getElementById('history-filter-input')?.value || '')
    .trim()
    .toLowerCase();

  if (pill) pill.textContent = `${state.history.length} truyện`;
  if (!listEl) return;

  const items = filterText
    ? state.history.filter((h) => (h.title || '').toLowerCase().includes(filterText))
    : state.history;

  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 56px 20px; color: var(--text-dim);">
        <p>${state.history.length ? 'Không có lịch sử khớp từ khóa lọc.' : 'Chưa có lịch sử đọc truyện nào.'}</p>
      </div>
    `;
    return;
  }

  const frag = document.createDocumentFragment();
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.dataset.slug = item.slug;
    card.dataset.chap = item.chapterSlug;

    const prog = getReadingProgress(item.slug);
    const pageInfo =
      prog && prog.chapterSlug === item.chapterSlug && prog.pageIndex > 0
        ? ` · Trang ${prog.pageIndex + 1}/${prog.totalPages || '?'}`
        : '';

    const coverUrl = item.cover ? getProxyImageUrl(item.cover) : FALLBACK_COVER;
    const safeTitle = escapeHtml(item.title || item.slug);
    const safeChap = escapeHtml((item.chapterTitle || item.chapterSlug) + pageInfo);
    const safeTime = escapeHtml(item.time || '');

    card.innerHTML = `
      <div class="history-left">
        <div class="history-thumb-wrap">
          <img class="history-thumb" src="${coverUrl}" alt="${safeTitle}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${FALLBACK_COVER}'">
        </div>
        <div class="history-meta-wrap">
          <h4 class="history-title" title="${safeTitle}">${safeTitle}</h4>
          <div class="history-chapter">${safeChap}</div>
          <div class="history-time">${safeTime}</div>
        </div>
      </div>
      <div class="history-actions">
        <button class="btn btn-secondary btn-sm btn-hist-detail" title="Xem chi tiết truyện">Chi tiết</button>
        <button class="btn btn-primary btn-sm btn-hist-read">Đọc tiếp</button>
        <button class="btn-icon btn-hist-del" title="Xóa khỏi lịch sử">${ICONS.close(16)}</button>
      </div>
    `;
    frag.appendChild(card);
  }
  listEl.appendChild(frag);
}

export function loadHistoryView(hashKey) {
  switchView('history');
  renderHistoryList();
  restoreViewScroll(hashKey, 0);
}

export function initLibraryInteractions() {
  document.getElementById('select-bookmark-sort')?.addEventListener('change', (e) => {
    setBookmarkSort(e.target.value);
    renderBookmarksList();
  });

  document.getElementById('btn-filter-unread')?.addEventListener('click', () => {
    state.bookmarkUnreadOnly = !state.bookmarkUnreadOnly;
    renderBookmarksList();
  });

  document.getElementById('bookmarks-filter-input')?.addEventListener(
    'input',
    debounce(() => renderBookmarksList(), 150)
  );

  document.getElementById('btn-sync-bookmarks')?.addEventListener('click', () => {
    syncBookmarksUpdates(true);
  });

  // Overflow menu toggle (Export / Import / Clear All)
  const moreBtn = document.getElementById('btn-bookmarks-more');
  const moreMenu = document.getElementById('bookmarks-more-menu');
  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu?.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (moreMenu && !moreMenu.classList.contains('hidden') && !e.target.closest('.more-menu-wrap')) {
      moreMenu.classList.add('hidden');
    }
  });

  document.getElementById('btn-clear-bookmarks')?.addEventListener('click', () => {
    moreMenu?.classList.add('hidden');
    if (confirm('Bạn có chắc muốn xóa tất cả truyện theo dõi?')) {
      clearAllBookmarks();
      renderBookmarksList();
    }
  });

  document.getElementById('btn-export-backup')?.addEventListener('click', () => {
    moreMenu?.classList.add('hidden');
    const backupData = {
      bookmarks: state.bookmarks,
      history: state.history,
      readChapters: state.readChapters,
      readingProgress: state.readingProgress,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mangaflow_backup_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Đã tải file sao lưu về máy');
  });

  document.getElementById('input-import-backup')?.addEventListener('change', (e) => {
    moreMenu?.classList.add('hidden');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(String(ev.target?.result || '{}'));
        if (Array.isArray(data.bookmarks)) {
          state.bookmarks = data.bookmarks.filter((b) => b && b.slug).map((b) => compactBookmark(b));
        }
        if (Array.isArray(data.history)) {
          state.history = data.history.slice(0, 60);
          localStorage.setItem('mf_history', JSON.stringify(state.history));
        }
        if (data.readChapters && typeof data.readChapters === 'object') {
          state.readChapters = data.readChapters;
          localStorage.setItem('mf_read_chapters', JSON.stringify(state.readChapters));
        }
        if (data.readingProgress && typeof data.readingProgress === 'object') {
          state.readingProgress = data.readingProgress;
          localStorage.setItem('mf_reading_progress', JSON.stringify(state.readingProgress));
        }
        saveBookmarks();
        renderBookmarksList();
        showToast('Phục hồi dữ liệu thành công');
      } catch {
        showToast('Lỗi đọc file sao lưu JSON');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  // History interactions (delegated)
  document.getElementById('history-filter-input')?.addEventListener(
    'input',
    debounce(() => renderHistoryList(), 150)
  );

  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    if (confirm('Bạn có chắc muốn xóa toàn bộ lịch sử đọc?')) {
      clearAllHistory();
      renderHistoryList();
    }
  });

  document.getElementById('history-list')?.addEventListener('click', (e) => {
    const card = e.target.closest('.history-card');
    if (!card) return;
    const slug = card.dataset.slug;
    const chap = card.dataset.chap;

    if (e.target.closest('.btn-hist-del')) {
      removeHistoryItem(slug);
      renderHistoryList();
      showToast('Đã xóa khỏi lịch sử');
      return;
    }

    if (e.target.closest('.btn-hist-detail')) {
      navigateTo(`#comic/${encodeURIComponent(slug)}`);
      return;
    }

    navigateTo(`#read/${encodeURIComponent(slug)}/${encodeURIComponent(chap)}`);
  });
}
