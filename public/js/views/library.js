/**
 * Library Views: Bookmarks (with "MỚI" badge, Undo remove, gentle sync, backup/restore) & History.
 */
import { fetchApi } from '../api.js';
import {
  state,
  compactBookmark,
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
  parseVietnameseTime,
  FALLBACK_COVER,
  showToast
} from '../utils.js';
import { navigateTo, switchView, restoreViewScroll } from '../router.js';
import { renderComicsGrid } from './home.js';

let syncAbort = null;
let lastSyncTime = 0;

function getBookmarkSortTime(comic) {
  if (comic.updatedAt && Number(comic.updatedAt) > 0) {
    return Number(comic.updatedAt);
  }
  if (comic.latestTime) {
    const t = parseVietnameseTime(comic.latestTime);
    if (t > 0) return t;
  }
  return Number(comic.bookmarkedAt || 0);
}

function getSortedFilteredBookmarks() {
  const filterText = (document.getElementById('bookmarks-filter-input')?.value || '')
    .trim()
    .toLowerCase();

  let list = [...state.bookmarks];
  if (filterText) {
    list = list.filter((b) => (b.title || '').toLowerCase().includes(filterText));
  }

  const sortType = state.bookmarkSort || 'updated';
  if (sortType === 'az') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi'));
  } else if (sortType === 'added') {
    list.sort((a, b) => (b.bookmarkedAt || 0) - (a.bookmarkedAt || 0));
  } else {
    list.sort((a, b) => getBookmarkSortTime(b) - getBookmarkSortTime(a));
  }
  return list;
}

export function renderBookmarksList() {
  const grid = document.getElementById('bookmarks-grid');
  const pill = document.getElementById('bookmarks-count-pill');
  const sortSelect = document.getElementById('select-bookmark-sort');

  if (pill) pill.textContent = `${state.bookmarks.length} bộ truyện`;
  if (sortSelect) sortSelect.value = state.bookmarkSort || 'updated';

  const items = getSortedFilteredBookmarks();
  renderComicsGrid(items, grid, {
    markUnreadNew: true,
    emptyText: state.bookmarks.length
      ? 'Không có truyện yêu thích nào khớp từ khóa lọc.'
      : 'Bạn chưa theo dõi bộ truyện nào!',
    onFavoriteToggled: (comic, res, cardEl) => {
      if (!res.added && cardEl) {
        cardEl.remove();
        if (pill) pill.textContent = `${state.bookmarks.length} bộ truyện`;
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

  // Gentle auto-sync at most once every 15 minutes
  if (state.bookmarks.length > 0 && Date.now() - lastSyncTime > 900000) {
    syncBookmarksUpdates(false);
  }
}

export async function syncBookmarksUpdates(force = false) {
  if (syncAbort || !state.bookmarks.length) return;
  const now = Date.now();
  if (!force && now - lastSyncTime < 900000) return;

  lastSyncTime = now;
  syncAbort = new AbortController();
  const btn = document.getElementById('btn-sync-bookmarks');
  const targets = state.bookmarks.slice(0, 15);
  let checked = 0;
  let updatedCount = 0;

  if (btn) {
    btn.disabled = true;
    btn.textContent = `🔄 Đang kiểm tra 0/${targets.length}...`;
  }

  try {
    // Low concurrency (2) to never choke backend or trigger origin rate limits
    for (let i = 0; i < targets.length; i += 2) {
      if (syncAbort.signal.aborted) break;
      const batch = targets.slice(i, i + 2);
      await Promise.all(
        batch.map(async (bm) => {
          try {
            const detail = await fetchApi(
              'detail',
              { slug: bm.slug },
              { ttlMs: 180000, signal: syncAbort.signal, force }
            );
            if (detail?.chapters?.length) {
              const latest = detail.chapters[0];
              const latestTitle = latest.name || latest.title || '';
              const latestTime = latest.time || '';
              const parsedTime = parseVietnameseTime(latestTime);

              if (latestTitle && bm.latestChapter !== latestTitle) {
                bm.latestChapter = latestTitle;
                bm.latestChapterSlug = latest.chapterSlug;
                bm.latestTime = latestTime;
                bm.updatedAt = parsedTime > 0 ? parsedTime : Date.now();
                updatedCount++;
              } else if (parsedTime > 0 && bm.updatedAt !== parsedTime) {
                bm.updatedAt = parsedTime;
                bm.latestTime = latestTime;
              }
            }
          } catch {}
          checked++;
          if (btn) btn.textContent = `🔄 Đang kiểm tra ${checked}/${targets.length}...`;
        })
      );
    }

    if (updatedCount > 0) {
      saveBookmarks();
      if (state.currentView === 'bookmarks') renderBookmarksList();
      showToast(`✨ Có ${updatedCount} truyện vừa cập nhật chương mới!`);
    } else if (force) {
      saveBookmarks();
      if (state.currentView === 'bookmarks') renderBookmarksList();
      showToast('✅ Tất cả truyện theo dõi đều đã mới nhất!');
    }
  } finally {
    syncAbort = null;
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 Cập nhật chap';
    }
  }
}

export function renderHistoryList() {
  const listEl = document.getElementById('history-list');
  const pill = document.getElementById('history-count-pill');
  const filterText = (document.getElementById('history-filter-input')?.value || '')
    .trim()
    .toLowerCase();

  if (pill) pill.textContent = `${state.history.length} đã đọc`;
  if (!listEl) return;

  const items = filterText
    ? state.history.filter((h) => (h.title || '').toLowerCase().includes(filterText))
    : state.history;

  listEl.innerHTML = '';
  if (!items.length) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 56px 20px; color: var(--text-dim);">
        <p>${state.history.length ? 'Không có lịch sử khớp từ khóa lọc.' : 'Chưa có lịch sử đọc truyện nào!'}</p>
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
        ? ` • Trang ${prog.pageIndex + 1}/${prog.totalPages || '?'}`
        : '';

    const coverUrl = item.cover ? getProxyImageUrl(item.cover) : FALLBACK_COVER;
    const safeTitle = escapeHtml(item.title || item.slug);
    const safeChap = escapeHtml((item.chapterTitle || item.chapterSlug) + pageInfo);
    const safeTime = escapeHtml(item.time || '');

    card.innerHTML = `
      <div class="history-left">
        <div class="history-thumb-wrap">
          <img class="history-thumb" src="${coverUrl}" alt="${safeTitle}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_COVER}'">
        </div>
        <div class="history-meta-wrap">
          <h4 class="history-title" title="${safeTitle}">${safeTitle}</h4>
          <div class="history-chapter">Đang đọc: ${safeChap}</div>
          <div class="history-time">${safeTime}</div>
        </div>
      </div>
      <div class="history-actions">
        <button class="btn btn-secondary btn-sm btn-hist-detail" title="Xem chi tiết truyện">Chi tiết</button>
        <button class="btn btn-primary btn-sm btn-hist-read">Đọc tiếp</button>
        <button class="btn-icon btn-hist-del" title="Xóa khỏi lịch sử">✕</button>
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

  document.getElementById('bookmarks-filter-input')?.addEventListener(
    'input',
    debounce(() => renderBookmarksList(), 150)
  );

  document.getElementById('btn-sync-bookmarks')?.addEventListener('click', () => {
    syncBookmarksUpdates(true);
  });

  document.getElementById('btn-clear-bookmarks')?.addEventListener('click', () => {
    if (confirm('Bạn có chắc muốn xóa tất cả truyện yêu thích?')) {
      clearAllBookmarks();
      renderBookmarksList();
    }
  });

  document.getElementById('btn-export-backup')?.addEventListener('click', () => {
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
    showToast('💾 Đã tải file backup về máy!');
  });

  document.getElementById('input-import-backup')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(String(ev.target?.result || '{}'));
        if (Array.isArray(data.bookmarks)) {
          state.bookmarks = data.bookmarks.filter((b) => b && b.slug).map(compactBookmark);
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
        showToast('📥 Phục hồi dữ liệu thành công!');
      } catch {
        showToast('Lỗi đọc file backup JSON!');
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
