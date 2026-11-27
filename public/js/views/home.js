/**
 * Home, Filter, Genre, Search, Live Suggestions, Pagination, Continue Reading Strip & Genres Modal.
 * Keep-Alive DOM avoids clearing/re-rendering when returning to the active view.
 */
import { fetchApi, hasCachedApi } from '../api.js?v=4.0';
import {
  state,
  isBookmarked,
  toggleFavorite,
  addSearchHistory,
  getReadingProgress
} from '../state.js?v=4.0';
import { escapeHtml, debounce, getProxyImageUrl, FALLBACK_COVER, showToast } from '../utils.js?v=4.0';
import { ICONS } from '../icons.js?v=4.0';
import { navigateTo, switchView, restoreViewScroll } from '../router.js?v=4.0';

const FALLBACK_GENRES = [
  { slug: 'action', name: 'Action' },
  { slug: 'manhwa', name: 'Manhwa' },
  { slug: 'manhua', name: 'Manhua' },
  { slug: 'manga', name: 'Manga' },
  { slug: 'chuyen-sinh', name: 'Chuyển Sinh' },
  { slug: 'xuyen-khong', name: 'Xuyên Không' },
  { slug: 'co-dai', name: 'Cổ Đại' },
  { slug: 'ngon-tinh', name: 'Ngôn Tình' },
  { slug: 'romance', name: 'Romance' },
  { slug: 'comedy', name: 'Comedy' },
  { slug: 'adventure', name: 'Adventure' },
  { slug: 'fantasy', name: 'Fantasy' },
  { slug: 'shounen', name: 'Shounen' },
  { slug: 'truyen-mau', name: 'Truyện Màu' },
  { slug: 'webtoon', name: 'Webtoon' },
  { slug: 'martial-arts', name: 'Võ Thuật' },
  { slug: 'huyen-huyen', name: 'Huyền Huyễn' },
  { slug: 'isekai', name: 'Isekai' },
  { slug: 'trong-sinh', name: 'Trọng Sinh' },
  { slug: 'mystery', name: 'Mystery' },
  { slug: 'supernatural', name: 'Supernatural' },
  { slug: 'sports', name: 'Sports' },
  { slug: 'slice-of-life', name: 'Slice of Life' },
  { slug: 'school-life', name: 'School Life' },
  { slug: 'sci-fi', name: 'Sci-fi' },
  { slug: 'seinen', name: 'Seinen' },
  { slug: 'psychological', name: 'Psychological' },
  { slug: 'harem', name: 'Harem' },
  { slug: 'drama', name: 'Drama' },
  { slug: 'historical', name: 'Historical' },
  { slug: 'horror', name: 'Horror' },
  { slug: 'magic', name: 'Magic' }
];

let genresCatalog = FALLBACK_GENRES;

// Keep-Alive render cache for Home/Explore view
let currentRenderedKey = '';
let currentRenderedAt = 0;
let suppressNextScrollRestore = false;

/**
 * Shared Comic Grid Renderer using DocumentFragment + Event Delegation.
 */
export function renderComicsGrid(comics, container, options = {}) {
  if (!container) return;
  container.innerHTML = '';

  const comicMap = new Map();
  container._comicMap = comicMap;
  container._gridOptions = options;

  if (!comics || comics.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 56px 20px; color: var(--text-dim);">
        <p style="font-size: 14.5px;">${escapeHtml(options.emptyText || 'Không tìm thấy bộ truyện nào.')}</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const comic of comics) {
    comicMap.set(comic.slug, comic);
    const card = document.createElement('div');
    card.className = 'comic-card';
    card.dataset.slug = comic.slug;

    const fav = isBookmarked(comic.slug);
    const chapters = Array.isArray(comic.chapters)
      ? comic.chapters
      : comic.latestChapter
        ? [{ title: comic.latestChapter, chapterSlug: comic.latestChapterSlug || '', time: comic.latestTime || '' }]
        : [];

    let hasNewUnread = false;
    if (options.markUnreadNew && chapters[0]?.chapterSlug) {
      const readArr = state.readChapters[comic.slug] || [];
      const prog = getReadingProgress(comic.slug);
      hasNewUnread =
        !readArr.includes(chapters[0].chapterSlug) &&
        prog?.chapterSlug !== chapters[0].chapterSlug;
    }

    const chapItemsHtml = chapters
      .slice(0, 2)
      .map((ch) => {
        const chapTitle = escapeHtml(ch.title || ch.name || '');
        const chapTime = escapeHtml(ch.time || '');
        const chapSlug = escapeHtml(ch.chapterSlug || '');
        return `
          <div class="comic-chapter-link" data-slug="${escapeHtml(comic.slug)}" data-chap="${chapSlug}">
            <span>${chapTitle}</span>
            ${chapTime ? `<span class="c-time">${chapTime}</span>` : ''}
          </div>
        `;
      })
      .join('');

    const titleSafe = escapeHtml(comic.title || comic.slug);
    const viewBadge = comic.views ? `<span class="badge-view">${escapeHtml(comic.views)}</span>` : '';
    const newBadge = hasNewUnread ? `<span class="badge-new-chap">MỚI</span>` : '';

    card.innerHTML = `
      <div class="comic-thumb-wrapper">
        <img class="comic-thumb" src="${getProxyImageUrl(comic.cover)}" alt="${titleSafe}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${FALLBACK_COVER}'">
        <div class="comic-overlay-badges">
          <div class="badge-group-left">${newBadge}${viewBadge}</div>
          <button class="btn-card-fav ${fav ? 'active' : ''}" data-slug="${escapeHtml(comic.slug)}" title="Theo dõi" aria-label="Theo dõi truyện">
            ${ICONS.heart(fav, 16)}
          </button>
        </div>
      </div>
      <div class="comic-info">
        <h3 class="comic-title" title="${titleSafe}">${titleSafe}</h3>
        <div class="comic-chapters">${chapItemsHtml}</div>
      </div>
    `;

    fragment.appendChild(card);
  }

  container.appendChild(fragment);

  if (!container._delegatedBound) {
    container._delegatedBound = true;
    attachGridDelegation(container);
  }
}

function syncGridBookmarksUI(container) {
  if (!container) return;
  container.querySelectorAll('.btn-card-fav').forEach((btn) => {
    const slug = btn.dataset.slug;
    const fav = isBookmarked(slug);
    btn.classList.toggle('active', fav);
    const pathEl = btn.querySelector('path');
    if (pathEl) pathEl.setAttribute('fill', fav ? 'currentColor' : 'none');
  });
}

function attachGridDelegation(container) {
  container.addEventListener('click', (e) => {
    const favBtn = e.target.closest('.btn-card-fav');
    if (favBtn) {
      e.stopPropagation();
      const slug = favBtn.dataset.slug;
      const comic = container._comicMap?.get(slug);
      if (!comic) return;

      const res = toggleFavorite(comic);
      favBtn.classList.toggle('active', res.added);
      const pathEl = favBtn.querySelector('path');
      if (pathEl) pathEl.setAttribute('fill', res.added ? 'currentColor' : 'none');

      if (typeof container._gridOptions?.onFavoriteToggled === 'function') {
        container._gridOptions.onFavoriteToggled(comic, res, favBtn.closest('.comic-card'));
      } else {
        showToast(res.added ? `Đã theo dõi "${comic.title}"` : `Đã bỏ theo dõi "${comic.title}"`);
      }
      return;
    }

    const chapLink = e.target.closest('.comic-chapter-link');
    if (chapLink) {
      e.stopPropagation();
      const slug = chapLink.dataset.slug;
      const chap = chapLink.dataset.chap;
      if (slug && chap) {
        navigateTo(`#read/${encodeURIComponent(slug)}/${encodeURIComponent(chap)}`);
      } else if (slug) {
        navigateTo(`#comic/${encodeURIComponent(slug)}`);
      }
      return;
    }

    const card = e.target.closest('.comic-card');
    if (card && card.dataset.slug) {
      navigateTo(`#comic/${encodeURIComponent(card.dataset.slug)}`);
    }
  });
}

function renderContinueReadingStrip(show = true) {
  const strip = document.getElementById('continue-reading-strip');
  const listEl = document.getElementById('continue-reading-list');
  if (!strip || !listEl) return;

  if (!show || !state.history || state.history.length === 0) {
    strip.classList.add('hidden');
    return;
  }

  const recent = state.history.slice(0, 8);
  listEl.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const h of recent) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'continue-card';
    item.dataset.slug = h.slug;
    item.dataset.chap = h.chapterSlug;

    const prog = getReadingProgress(h.slug);
    const pageHint =
      prog && prog.chapterSlug === h.chapterSlug && prog.pageIndex > 0
        ? ` · Tr.${prog.pageIndex + 1}`
        : '';

    const coverUrl = h.cover ? getProxyImageUrl(h.cover) : FALLBACK_COVER;
    const safeTitle = escapeHtml(h.title || h.slug);
    const safeSub = escapeHtml((h.chapterTitle || h.chapterSlug) + pageHint);

    item.innerHTML = `
      <img class="continue-thumb" src="${coverUrl}" alt="${safeTitle}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${FALLBACK_COVER}'">
      <div class="continue-meta">
        <div class="continue-title">${safeTitle}</div>
        <div class="continue-sub">${safeSub}</div>
      </div>
    `;
    frag.appendChild(item);
  }

  listEl.appendChild(frag);
  strip.classList.remove('hidden');
}

function renderSkeletonGrid(container, count = 12) {
  if (!container) return;
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const skel = document.createElement('div');
    skel.className = 'skeleton-card';
    frag.appendChild(skel);
  }
  container.appendChild(frag);
}

function renderPagination(pagination, onPageChange) {
  const bar = document.getElementById('pagination-bar');
  const prevBtn = document.getElementById('btn-prev-page');
  const nextBtn = document.getElementById('btn-next-page');
  const numsEl = document.getElementById('page-numbers');
  const jumpInput = document.getElementById('page-jump-input');
  const jumpWrap = document.getElementById('page-jump-wrap');

  if (!bar) return;

  const current = pagination?.currentPage || 1;
  const total = pagination?.totalPages || current;
  const hasPrev = Boolean(pagination?.hasPrev ?? current > 1);
  const hasNext = Boolean(pagination?.hasNext ?? current < total);

  if (total <= 1 && current === 1 && !hasNext) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');

  prevBtn.disabled = !hasPrev;
  nextBtn.disabled = !hasNext;
  prevBtn.onclick = () => hasPrev && onPageChange(current - 1);
  nextBtn.onclick = () => hasNext && onPageChange(current + 1);

  const pages = new Set([1, current - 1, current, current + 1, total]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  numsEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  let last = 0;

  for (const p of sorted) {
    if (p - last > 1) {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.color = 'var(--text-dim)';
      dots.style.padding = '0 4px';
      frag.appendChild(dots);
    }
    const btn = document.createElement('button');
    btn.className = `page-num-btn ${p === current ? 'active' : ''}`;
    btn.textContent = String(p);
    btn.onclick = () => {
      if (p !== current) onPageChange(p);
    };
    frag.appendChild(btn);
    last = p;
  }
  numsEl.appendChild(frag);

  if (jumpWrap && jumpInput) {
    jumpWrap.classList.toggle('hidden', total <= 3);
    jumpInput.max = String(total);
    jumpInput.value = '';
    jumpInput.placeholder = String(current);
    jumpInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const target = Math.max(1, Math.min(total, parseInt(jumpInput.value, 10) || 1));
        onPageChange(target);
      }
    };
  }
}

function scrollToGridTop() {
  const anchor = document.getElementById('home-section-title') || document.getElementById('comics-grid');
  if (anchor) {
    const top = anchor.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
}

export async function loadHomeView({ page = 1, sort = 0, genre = '', status = 0, hashKey = 'home' }, ctx) {
  state.homePage = page;
  state.homeSort = sort;
  state.homeGenre = genre;
  state.homeStatus = status;
  state.searchKeyword = '';

  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const dropdown = document.getElementById('search-dropdown');
  if (searchInput) searchInput.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  if (dropdown) dropdown.classList.add('hidden');

  document.querySelectorAll('.filter-chip').forEach((chip) => {
    const match = genre
      ? chip.dataset.genre === genre
      : status
        ? Number(chip.dataset.status) === status
        : Number(chip.dataset.sort || 0) === sort && !chip.dataset.genre && !chip.dataset.status;
    chip.classList.toggle('active', Boolean(match));
  });

  const showContinue = page === 1 && !genre && !status && sort === 0;
  const grid = document.getElementById('comics-grid');
  const renderKey = `home:${hashKey || 'home'}`;
  const isFreshKeepAlive =
    currentRenderedKey === renderKey &&
    grid &&
    grid.children.length > 0 &&
    Date.now() - currentRenderedAt < 300000;

  if (isFreshKeepAlive && !suppressNextScrollRestore) {
    syncGridBookmarksUI(grid);
    renderContinueReadingStrip(showContinue);
    switchView('home', hashKey);
    restoreViewScroll(hashKey, 0);
    return;
  }

  switchView('home', hashKey);
  renderContinueReadingStrip(showContinue);

  const apiCached = genre
    ? hasCachedApi('genre', { slug: genre, page }, 300000)
    : hasCachedApi('home', { page, sort, status }, 180000);

  if (!apiCached) {
    renderSkeletonGrid(grid, 12);
  }

  try {
    const data = genre
      ? await fetchApi('genre', { slug: genre, page }, { ttlMs: 300000, signal: ctx.signal })
      : await fetchApi('home', { page, sort, status }, { ttlMs: 180000, signal: ctx.signal });

    if (ctx.isStale()) return;

    const comics = data?.comics || [];
    state.loadedComics = comics;

    const titleEl = document.getElementById('home-section-title');
    const countEl = document.getElementById('comics-count-pill');
    const sourceEl = document.getElementById('live-source-label');

    if (genre) {
      const g = genresCatalog.find((item) => item.slug === genre);
      titleEl.textContent = `Thể loại: ${g ? g.name : genre}`;
    } else if (status === 2) {
      titleEl.textContent = 'Truyện Đã Hoàn Thành';
    } else if (sort === 10 || sort === 1) {
      titleEl.textContent = 'Top Xem Nhiều Trong Ngày';
    } else if (sort === 12) {
      titleEl.textContent = 'Top Xem Nhiều Trong Tuần';
    } else if (sort === 11) {
      titleEl.textContent = 'Top Xem Nhiều Trong Tháng';
    } else if (sort === 20) {
      titleEl.textContent = 'Truyện Được Yêu Thích';
    } else {
      titleEl.textContent = 'Mới Cập Nhật';
    }

    if (countEl) countEl.textContent = `${comics.length} truyện`;
    if (sourceEl) sourceEl.textContent = data?.source === 'nettruyen' ? 'NetTruyen' : 'TruyenQQ';

    renderComicsGrid(comics, grid);
    currentRenderedKey = renderKey;
    currentRenderedAt = Date.now();

    renderPagination(data?.pagination, (targetPage) => {
      suppressNextScrollRestore = true;
      if (genre) {
        navigateTo(`#genre/${encodeURIComponent(genre)}?page=${targetPage}`);
      } else {
        const params = new URLSearchParams({ page: String(targetPage) });
        if (sort) params.set('sort', String(sort));
        if (status) params.set('status', String(status));
        navigateTo(`#home?${params.toString()}`);
      }
    });

    if (suppressNextScrollRestore) {
      suppressNextScrollRestore = false;
      scrollToGridTop();
    } else {
      restoreViewScroll(hashKey, 0);
    }
  } catch (err) {
    suppressNextScrollRestore = false;
    if (err.name === 'AbortError' || ctx.isStale()) return;

    if (window.location.protocol === 'file:') {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: rgba(255,42,85,0.08); border: 1px dashed rgba(255,42,85,0.4); border-radius: 14px;">
          <h3 style="color: #ff5277; margin-bottom: 8px;">Chưa khởi động Server</h3>
          <p style="color: #cbd5e1; font-size: 14px;">Hãy nhấp đúp chạy file <code>Mo Web Doc Truyen.bat</code> trong thư mục dự án để mở web.</p>
        </div>
      `;
    } else {
      showToast('Lỗi tải dữ liệu: ' + err.message);
    }
  }
}

export async function loadSearchView(keyword, page = 1, hashKey = '', ctx) {
  state.searchKeyword = keyword;
  state.searchPage = page;
  addSearchHistory(keyword);

  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const dropdown = document.getElementById('search-dropdown');

  if (searchInput) searchInput.value = keyword;
  if (clearBtn) clearBtn.classList.toggle('hidden', !keyword);
  if (dropdown) dropdown.classList.add('hidden');
  renderContinueReadingStrip(false);

  document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));

  const grid = document.getElementById('comics-grid');
  const renderKey = `search:${hashKey}`;
  const isFreshKeepAlive =
    currentRenderedKey === renderKey &&
    grid &&
    grid.children.length > 0 &&
    Date.now() - currentRenderedAt < 300000;

  if (isFreshKeepAlive && !suppressNextScrollRestore) {
    syncGridBookmarksUI(grid);
    switchView('home', hashKey);
    restoreViewScroll(hashKey, 0);
    return;
  }

  switchView('home', hashKey);

  if (!hasCachedApi('search', { q: keyword, page }, 180000)) {
    renderSkeletonGrid(grid, 8);
  }

  try {
    const data = await fetchApi('search', { q: keyword, page }, { ttlMs: 180000, signal: ctx.signal });
    if (ctx.isStale()) return;

    const comics = data?.comics || [];
    state.loadedComics = comics;

    document.getElementById('home-section-title').textContent = `Tìm kiếm: "${keyword}"`;
    document.getElementById('comics-count-pill').textContent = `${comics.length} kết quả`;

    renderComicsGrid(comics, grid, {
      emptyText: `Không tìm thấy truyện nào khớp với "${keyword}".`
    });
    currentRenderedKey = renderKey;
    currentRenderedAt = Date.now();

    renderPagination(data?.pagination, (targetPage) => {
      suppressNextScrollRestore = true;
      navigateTo(`#search/${encodeURIComponent(keyword)}?page=${targetPage}`);
    });

    if (suppressNextScrollRestore) {
      suppressNextScrollRestore = false;
      scrollToGridTop();
    } else {
      restoreViewScroll(hashKey, 0);
    }
  } catch (err) {
    suppressNextScrollRestore = false;
    if (err.name === 'AbortError' || ctx.isStale()) return;
    showToast('Lỗi tìm kiếm: ' + err.message);
  }
}

export function initHomeInteractions() {
  // Filter chip clicks
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const { sort, genre, status } = chip.dataset;
      if (genre) {
        navigateTo(`#genre/${encodeURIComponent(genre)}`);
      } else if (status) {
        navigateTo(`#home?status=${status}`);
      } else if (sort && sort !== '0') {
        navigateTo(`#home?sort=${sort}`);
      } else {
        navigateTo('#home');
      }
    });
  });

  // Continue Reading strip delegation
  document.getElementById('continue-reading-list')?.addEventListener('click', (e) => {
    const card = e.target.closest('.continue-card');
    if (!card) return;
    const { slug, chap } = card.dataset;
    if (slug && chap) {
      navigateTo(`#read/${encodeURIComponent(slug)}/${encodeURIComponent(chap)}`);
    } else if (slug) {
      navigateTo(`#comic/${encodeURIComponent(slug)}`);
    }
  });

  document.getElementById('btn-continue-all')?.addEventListener('click', () => {
    navigateTo('#history');
  });

  // Drag-to-scroll horizontal filter strip on desktop
  const filterScroll = document.getElementById('filter-scroll');
  if (filterScroll) {
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let dragged = false;

    filterScroll.addEventListener('mousedown', (e) => {
      isDown = true;
      dragged = false;
      startX = e.pageX - filterScroll.offsetLeft;
      scrollLeft = filterScroll.scrollLeft;
    });
    window.addEventListener('mouseup', () => {
      isDown = false;
      setTimeout(() => {
        dragged = false;
      }, 60);
    });
    filterScroll.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const x = e.pageX - filterScroll.offsetLeft;
      const walk = (x - startX) * 1.4;
      if (Math.abs(walk) > 6) {
        dragged = true;
        e.preventDefault();
        filterScroll.scrollLeft = scrollLeft - walk;
      }
    });
    filterScroll.addEventListener(
      'click',
      (e) => {
        if (dragged) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
  }

  initLiveSearch();
  initGenresModal();
}

function initLiveSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const submitBtn = document.getElementById('search-btn');
  const dropdown = document.getElementById('search-dropdown');
  const listEl = document.getElementById('search-dropdown-list');
  const headingEl = document.getElementById('search-dropdown-heading');
  if (!input || !dropdown || !listEl) return;

  let liveAbort = null;
  let activeIdx = -1;

  function showRecentSearches() {
    if (!state.searchHistory.length) {
      dropdown.classList.add('hidden');
      return;
    }
    headingEl.textContent = 'Tìm kiếm gần đây';
    listEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'search-recent-chips';
    for (const kw of state.searchHistory) {
      const chip = document.createElement('button');
      chip.className = 'search-recent-chip';
      chip.textContent = kw;
      chip.onclick = () => {
        dropdown.classList.add('hidden');
        navigateTo(`#search/${encodeURIComponent(kw)}`);
      };
      wrap.appendChild(chip);
    }
    listEl.appendChild(wrap);
    dropdown.classList.remove('hidden');
  }

  const runLiveQuery = debounce(async (query) => {
    if (query.length < 2) return;
    if (liveAbort) liveAbort.abort();
    liveAbort = new AbortController();

    headingEl.textContent = 'Gợi ý kết quả';
    listEl.innerHTML = '<div class="search-drop-state">Đang tìm kiếm...</div>';
    dropdown.classList.remove('hidden');
    activeIdx = -1;

    try {
      const data = await fetchApi(
        'search',
        { q: query, page: 1 },
        { ttlMs: 180000, signal: liveAbort.signal }
      );
      const comics = (data?.comics || []).slice(0, 6);
      if (!comics.length) {
        listEl.innerHTML = `<div class="search-drop-state">Không tìm thấy truyện cho "${escapeHtml(query)}"</div>`;
        return;
      }

      listEl.innerHTML = '';
      const frag = document.createDocumentFragment();
      for (const c of comics) {
        const item = document.createElement('div');
        item.className = 'search-drop-item';
        item.dataset.slug = c.slug;
        const safeTitle = escapeHtml(c.title);
        const safeSub = escapeHtml(c.chapters?.[0]?.title || 'Xem chi tiết');
        item.innerHTML = `
          <img class="search-drop-thumb" src="${getProxyImageUrl(c.cover)}" alt="${safeTitle}" onerror="this.onerror=null;this.src='${FALLBACK_COVER}'">
          <div class="search-drop-info">
            <div class="search-drop-title">${safeTitle}</div>
            <div class="search-drop-sub">${safeSub}</div>
          </div>
        `;
        item.onclick = () => {
          dropdown.classList.add('hidden');
          navigateTo(`#comic/${encodeURIComponent(c.slug)}`);
        };
        frag.appendChild(item);
      }
      listEl.appendChild(frag);
    } catch (err) {
      if (err.name !== 'AbortError') {
        listEl.innerHTML = '<div class="search-drop-state">Lỗi kết nối tìm kiếm</div>';
      }
    }
  }, 300);

  input.addEventListener('focus', () => {
    if (!input.value.trim()) showRecentSearches();
  });

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.classList.toggle('hidden', !q);
    if (!q) {
      if (liveAbort) liveAbort.abort();
      showRecentSearches();
      return;
    }
    if (q.length >= 2) runLiveQuery(q);
  });

  input.addEventListener('keydown', (e) => {
    const items = listEl.querySelectorAll('.search-drop-item');
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % items.length;
      items.forEach((it, idx) => it.classList.toggle('is-highlighted', idx === activeIdx));
      return;
    }
    if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + items.length) % items.length;
      items.forEach((it, idx) => it.classList.toggle('is-highlighted', idx === activeIdx));
      return;
    }
    if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
      return;
    }
    if (e.key === 'Enter') {
      if (activeIdx >= 0 && items[activeIdx]) {
        items[activeIdx].click();
        return;
      }
      const q = input.value.trim();
      if (q) {
        dropdown.classList.add('hidden');
        navigateTo(`#search/${encodeURIComponent(q)}`);
      }
    }
  });

  submitBtn.addEventListener('click', () => {
    const q = input.value.trim();
    if (q) {
      dropdown.classList.add('hidden');
      navigateTo(`#search/${encodeURIComponent(q)}`);
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    showRecentSearches();
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
      dropdown.classList.add('hidden');
    }
  });
}

async function initGenresModal() {
  const backdrop = document.getElementById('genres-modal-backdrop');
  const grid = document.getElementById('genres-modal-grid');
  const openBtn = document.getElementById('btn-open-genres-modal');
  const mobileBtn = document.getElementById('btn-m-genres');
  const closeBtn = document.getElementById('btn-close-genres-modal');

  function renderGenres() {
    if (!grid) return;
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const g of genresCatalog) {
      const item = document.createElement('div');
      item.className = 'genre-card-item';
      item.dataset.slug = g.slug;
      item.innerHTML = `<span class="genre-card-name">${escapeHtml(g.name)}</span>`;
      frag.appendChild(item);
    }
    grid.appendChild(frag);
  }

  renderGenres();

  // Sync canonical genres from backend silently
  fetchApi('genres', {}, { ttlMs: 3600000 })
    .then((res) => {
      if (Array.isArray(res?.genres) && res.genres.length > 0) {
        genresCatalog = res.genres;
        renderGenres();
      }
    })
    .catch(() => {});

  if (grid) {
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.genre-card-item');
      if (!card?.dataset.slug) return;
      backdrop?.classList.add('hidden');
      navigateTo(`#genre/${encodeURIComponent(card.dataset.slug)}`);
    });
  }

  const openModal = (e) => {
    e?.stopPropagation();
    backdrop?.classList.remove('hidden');
  };
  openBtn?.addEventListener('click', openModal);
  mobileBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', () => backdrop?.classList.add('hidden'));
  backdrop?.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.add('hidden');
  });
}
