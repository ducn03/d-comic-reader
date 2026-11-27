/**
 * Comic Detail View:
 * - Keep-Alive DOM & Per-Slug UI State (preserves sort order, chunk tab, filter text across Reader returns)
 * - Auto-syncs followed bookmark metadata cleanly
 * - Zero heavy GPU blur backdrop
 */
import { fetchApi, hasCachedApi } from '../api.js';
import {
  state,
  isBookmarked,
  toggleFavorite,
  getReadingProgress,
  syncSingleBookmarkFromComic
} from '../state.js';
import {
  escapeHtml,
  debounce,
  getProxyImageUrl,
  FALLBACK_COVER,
  showToast,
  showSpinner,
  hideSpinner
} from '../utils.js';
import { navigateTo, switchView, restoreViewScroll } from '../router.js';

const CHUNK_SIZE = 100;
let activeChunkIndex = 0;
let renderedDetailSlug = '';

// Remember per-comic UI controls (sortAsc, chunkIndex, filterText) across Reader round-trips
const detailUiState = new Map();

function saveDetailUiState(slug) {
  if (!slug) return;
  const searchInput = document.getElementById('chapter-search-input');
  if (detailUiState.size >= 50 && !detailUiState.has(slug)) {
    const oldest = detailUiState.keys().next().value;
    if (oldest) detailUiState.delete(oldest);
  }
  detailUiState.set(slug, {
    sortAsc: Boolean(state.chapterSortAsc),
    chunkIndex: activeChunkIndex,
    filterText: searchInput ? searchInput.value : ''
  });
}

function getDetailUiState(slug) {
  return detailUiState.get(slug) || { sortAsc: false, chunkIndex: 0, filterText: '' };
}

function updateDetailFavIcon(isFav) {
  const btn = document.getElementById('btn-favorite-toggle');
  const icon = document.getElementById('favorite-heart-icon');
  if (btn) btn.classList.toggle('active', isFav);
  if (icon) icon.setAttribute('fill', isFav ? 'currentColor' : 'none');
}

function updateDynamicProgressSection(detail) {
  const readSet = new Set(state.readChapters[detail.slug] || []);
  const progEl = document.getElementById('detail-read-progress');
  if (progEl) {
    if (readSet.size > 0 && state.chaptersList.length > 0) {
      progEl.textContent = `Đã đọc ${readSet.size}/${state.chaptersList.length}`;
      progEl.classList.remove('hidden');
    } else {
      progEl.classList.add('hidden');
    }
  }

  const continueBtn = document.getElementById('btn-read-continue');
  const continueLabel = document.getElementById('read-continue-label');
  const progress = getReadingProgress(detail.slug);
  const histMatch = state.history.find((h) => h.slug === detail.slug);
  const resumeSlug = progress?.chapterSlug || histMatch?.chapterSlug || '';
  const resumeTitle = progress?.chapterTitle || histMatch?.chapterTitle || resumeSlug;

  if (resumeSlug && continueBtn && continueLabel) {
    const pageHint = progress?.pageIndex > 0 ? ` (Tr.${progress.pageIndex + 1})` : '';
    continueLabel.textContent = `Đọc tiếp: ${resumeTitle}${pageHint}`;
    continueBtn.classList.remove('hidden');
    continueBtn.onclick = () => {
      saveDetailUiState(detail.slug);
      navigateTo(`#read/${encodeURIComponent(detail.slug)}/${encodeURIComponent(resumeSlug)}`);
    };
  } else if (continueBtn) {
    continueBtn.classList.add('hidden');
  }
}

function getFilteredChapters(filterText) {
  let list = [...(state.chaptersList || [])];
  if (state.chapterSortAsc) list.reverse();

  const q = (filterText || '').trim().toLowerCase();
  if (q) {
    list = list.filter(
      (ch) =>
        (ch.name || '').toLowerCase().includes(q) ||
        (ch.chapterSlug || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderChapterChunks(totalCount) {
  const bar = document.getElementById('chapter-chunks-bar');
  if (!bar) return;

  if (totalCount <= CHUNK_SIZE) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  const numChunks = Math.ceil(totalCount / CHUNK_SIZE);
  if (activeChunkIndex >= numChunks) activeChunkIndex = 0;

  bar.classList.remove('hidden');
  bar.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (let i = 0; i < numChunks; i++) {
    const start = i * CHUNK_SIZE + 1;
    const end = Math.min((i + 1) * CHUNK_SIZE, totalCount);
    const btn = document.createElement('button');
    btn.className = `chunk-tab-btn ${i === activeChunkIndex ? 'active' : ''}`;
    btn.dataset.chunk = String(i);
    btn.textContent = `${start}–${end}`;
    frag.appendChild(btn);
  }
  bar.appendChild(frag);
}

export function renderChapterButtons(filterText = '') {
  const listEl = document.getElementById('detail-chapters-list');
  const chunksBar = document.getElementById('chapter-chunks-bar');
  if (!listEl || !state.currentComic) return;

  const list = getFilteredChapters(filterText);
  const isFiltering = Boolean(filterText.trim());

  if (list.length === 0) {
    chunksBar?.classList.add('hidden');
    listEl.innerHTML =
      '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 22px;">Không tìm thấy chương nào khớp.</div>';
    return;
  }

  let slice = list;
  if (!isFiltering && list.length > CHUNK_SIZE) {
    renderChapterChunks(list.length);
    const start = activeChunkIndex * CHUNK_SIZE;
    slice = list.slice(start, start + CHUNK_SIZE);
  } else {
    chunksBar?.classList.add('hidden');
  }

  const slug = state.currentComic.slug;
  const readSet = new Set(state.readChapters[slug] || []);
  const progress = getReadingProgress(slug);
  const currentChapSlug =
    progress?.chapterSlug || state.history.find((h) => h.slug === slug)?.chapterSlug || '';

  listEl.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const ch of slice) {
    const btn = document.createElement('div');
    const isCurrent = ch.chapterSlug === currentChapSlug;
    const isRead = readSet.has(ch.chapterSlug);

    btn.className = `chapter-btn${isCurrent ? ' is-current' : isRead ? ' is-read' : ''}`;
    btn.dataset.chap = ch.chapterSlug;
    btn.textContent = ch.name;
    btn.title = ch.time ? `${ch.name} (${ch.time})` : ch.name;
    frag.appendChild(btn);
  }
  listEl.appendChild(frag);
}

export async function loadDetailView(slug, hashKey, ctx) {
  const searchInput = document.getElementById('chapter-search-input');
  const sortOrderText = document.getElementById('sort-order-text');

  // Keep-Alive Fast Path: Returning to the exact same comic from Reader
  if (renderedDetailSlug === slug && state.currentComic?.slug === slug && state.chaptersList.length > 0) {
    const savedUi = getDetailUiState(slug);
    state.chapterSortAsc = savedUi.sortAsc;
    activeChunkIndex = savedUi.chunkIndex;
    if (searchInput) searchInput.value = savedUi.filterText;
    if (sortOrderText) sortOrderText.textContent = state.chapterSortAsc ? 'Cũ nhất' : 'Mới nhất';

    updateDetailFavIcon(isBookmarked(slug));
    updateDynamicProgressSection(state.currentComic);
    renderChapterButtons(savedUi.filterText);
    switchView('detail', hashKey);
    restoreViewScroll(hashKey, 0);
    return;
  }

  const existing =
    (state.loadedComics || []).find((c) => c.slug === slug) ||
    (state.bookmarks || []).find((c) => c.slug === slug) ||
    (state.history || []).find((c) => c.slug === slug);

  const titleEl = document.getElementById('detail-title');
  const coverEl = document.getElementById('detail-cover');

  if (existing) {
    titleEl.textContent = existing.title || slug;
    if (existing.cover) {
      coverEl.src = getProxyImageUrl(existing.cover);
    }
    switchView('detail', hashKey);
  }

  const isCached = hasCachedApi('detail', { slug }, 300000);
  if (!isCached && !existing) {
    showSpinner('Đang tải thông tin truyện...');
  }

  try {
    const detail = await fetchApi('detail', { slug }, { ttlMs: 300000, signal: ctx.signal });
    hideSpinner();
    if (ctx.isStale()) return;

    if (!detail || !detail.title) {
      showToast('Không tìm thấy thông tin truyện.');
      return;
    }

    state.currentComic = detail;
    state.chaptersList = detail.chapters || [];
    renderedDetailSlug = slug;

    syncSingleBookmarkFromComic(detail);

    const savedUi = getDetailUiState(slug);
    state.chapterSortAsc = savedUi.sortAsc;
    activeChunkIndex = savedUi.chunkIndex;
    if (searchInput) searchInput.value = savedUi.filterText;
    if (sortOrderText) sortOrderText.textContent = state.chapterSortAsc ? 'Cũ nhất' : 'Mới nhất';

    titleEl.textContent = detail.title;
    const coverUrl = getProxyImageUrl(detail.cover);
    coverEl.src = coverUrl;
    coverEl.onerror = () => {
      coverEl.onerror = null;
      coverEl.src = FALLBACK_COVER;
    };

    document.getElementById('detail-author').textContent = detail.author || 'Đang cập nhật';
    document.getElementById('detail-status').textContent = detail.status || 'Đang cập nhật';
    document.getElementById('detail-views').textContent = detail.views || 'Đang cập nhật';
    document.getElementById('detail-follows').textContent = detail.follows || detail.likes || '--';
    document.getElementById('detail-chapter-count').textContent = `${state.chaptersList.length} chương`;

    // Synopsis with collapse toggle
    const synopsisEl = document.getElementById('detail-synopsis');
    const toggleSynBtn = document.getElementById('btn-toggle-synopsis');
    const desc = detail.description || 'Chưa có mô tả cho bộ truyện này.';
    synopsisEl.textContent = desc;
    synopsisEl.classList.add('is-collapsed');
    if (desc.length > 220) {
      toggleSynBtn.classList.remove('hidden');
      toggleSynBtn.textContent = 'Xem thêm';
      toggleSynBtn.onclick = () => {
        const collapsed = synopsisEl.classList.toggle('is-collapsed');
        toggleSynBtn.textContent = collapsed ? 'Xem thêm' : 'Thu gọn';
      };
    } else {
      toggleSynBtn.classList.add('hidden');
    }

    // Genres tags
    const genresEl = document.getElementById('detail-genres');
    genresEl.innerHTML = (detail.genres || [])
      .map((g) => `<span class="genre-tag" data-slug="${escapeHtml(g.slug)}">${escapeHtml(g.name)}</span>`)
      .join('');

    updateDetailFavIcon(isBookmarked(detail.slug));
    updateDynamicProgressSection(detail);

    const firstBtn = document.getElementById('btn-read-first');
    const latestBtn = document.getElementById('btn-read-latest');

    if (state.chaptersList.length > 0) {
      const firstChap = state.chaptersList[state.chaptersList.length - 1];
      const latestChap = state.chaptersList[0];

      firstBtn.disabled = false;
      latestBtn.disabled = false;
      firstBtn.onclick = () => {
        saveDetailUiState(detail.slug);
        navigateTo(`#read/${encodeURIComponent(detail.slug)}/${encodeURIComponent(firstChap.chapterSlug)}`);
      };
      latestBtn.onclick = () => {
        saveDetailUiState(detail.slug);
        navigateTo(`#read/${encodeURIComponent(detail.slug)}/${encodeURIComponent(latestChap.chapterSlug)}`);
      };
    } else {
      firstBtn.disabled = true;
      latestBtn.disabled = true;
    }

    renderChapterButtons(savedUi.filterText);
    switchView('detail', hashKey);
    restoreViewScroll(hashKey, 0);
  } catch (err) {
    hideSpinner();
    if (err.name === 'AbortError' || ctx.isStale()) return;
    showToast('Lỗi tải chi tiết truyện: ' + err.message);
  }
}

export function initDetailInteractions() {
  const favBtn = document.getElementById('btn-favorite-toggle');
  favBtn?.addEventListener('click', () => {
    if (!state.currentComic) return;
    const res = toggleFavorite(state.currentComic);
    updateDetailFavIcon(res.added);
    showToast(
      res.added
        ? `Đã theo dõi "${state.currentComic.title}"`
        : `Đã bỏ theo dõi "${state.currentComic.title}"`
    );
  });

  const genresEl = document.getElementById('detail-genres');
  genresEl?.addEventListener('click', (e) => {
    const tag = e.target.closest('.genre-tag');
    if (tag?.dataset.slug) {
      navigateTo(`#genre/${encodeURIComponent(tag.dataset.slug)}`);
    }
  });

  const chapSearchInput = document.getElementById('chapter-search-input');
  chapSearchInput?.addEventListener(
    'input',
    debounce((e) => {
      activeChunkIndex = 0;
      saveDetailUiState(state.currentComic?.slug);
      renderChapterButtons(e.target.value);
    }, 150)
  );

  const sortBtn = document.getElementById('btn-sort-chapters');
  sortBtn?.addEventListener('click', () => {
    state.chapterSortAsc = !state.chapterSortAsc;
    activeChunkIndex = 0;
    const sortText = document.getElementById('sort-order-text');
    if (sortText) sortText.textContent = state.chapterSortAsc ? 'Cũ nhất' : 'Mới nhất';
    saveDetailUiState(state.currentComic?.slug);
    renderChapterButtons(chapSearchInput?.value || '');
  });

  const chunksBar = document.getElementById('chapter-chunks-bar');
  chunksBar?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chunk-tab-btn');
    if (!btn) return;
    activeChunkIndex = parseInt(btn.dataset.chunk || '0', 10) || 0;
    saveDetailUiState(state.currentComic?.slug);
    renderChapterButtons(chapSearchInput?.value || '');
  });

  const chaptersList = document.getElementById('detail-chapters-list');
  chaptersList?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chapter-btn');
    if (!btn?.dataset.chap || !state.currentComic) return;
    saveDetailUiState(state.currentComic.slug);
    navigateTo(
      `#read/${encodeURIComponent(state.currentComic.slug)}/${encodeURIComponent(btn.dataset.chap)}`
    );
  });
}
