/**
 * MangaFlow PRO - Advanced Frontend Engine
 * Powered by Hinettruyen Crawler APIs
 */

// Detect iPhone / iOS Standalone PWA (Added to Home Screen) for Notch / Dynamic Island Safe Area
(function initIosStandaloneDetector() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
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

const API_BASE = window.location.protocol === 'file:' 
  ? 'http://localhost:3000/api/manga' 
  : '/api/manga';

// State Management
const state = {
  currentView: 'home',
  homePage: 1,
  homeSort: 0,
  homeGenre: '',
  homeStatus: 0,
  searchKeyword: '',
  searchPage: 1,
  loadedComics: [],
  
  // Current Comic Detail
  currentComic: null,
  chaptersList: [],
  chapterSortAsc: false,

  // Reader Settings & State
  readingComicSlug: null,
  readingChapterSlug: null,
  readingChapterData: null,
  readMode: 'webtoon', // 'webtoon' or 'paged'
  pagedCurrentIndex: 0,
  
  // Auto-scroll
  isAutoScrolling: false,
  autoScrollSpeed: 1.5, // pixels per frame
  autoScrollAnimId: null,

  // Eye care & brightness
  readingTone: 'normal',
  readingBrightness: 100,

  // Bookmarks & History (LocalStorage)
  bookmarks: JSON.parse(localStorage.getItem('mf_bookmarks') || '[]'),
  history: JSON.parse(localStorage.getItem('mf_history') || '[]'),
  readChapters: JSON.parse(localStorage.getItem('mf_read_chapters') || '{}'),
  bookmarkSort: localStorage.getItem('mf_bookmark_sort') || 'updated'
};

// Verified Clean Categories from NetTruyen Engine
const GENRES_CATALOG = [
  { name: 'Action', slug: 'action', icon: '⚔️' },
  { name: 'Manhwa', slug: 'manhwa', icon: '🇰🇷' },
  { name: 'Manhua', slug: 'manhua', icon: '🇨🇳' },
  { name: 'Manga', slug: 'manga', icon: '🇯🇵' },
  { name: 'Chuyển Sinh', slug: 'chuyen-sinh', icon: '✨' },
  { name: 'Xuyên Không', slug: 'xuyen-khong', icon: '🚀' },
  { name: 'Cổ Đại', slug: 'co-dai', icon: '🏯' },
  { name: 'Ngôn Tình', slug: 'ngon-tinh', icon: '💕' },
  { name: 'Romance', slug: 'romance', icon: '💖' },
  { name: 'Comedy', slug: 'comedy', icon: '😂' },
  { name: 'Adventure', slug: 'adventure', icon: '🧭' },
  { name: 'Fantasy', slug: 'fantasy', icon: '🧙' },
  { name: 'Shounen', slug: 'shounen', icon: '⚡' },
  { name: 'Truyện Màu', slug: 'truyen-mau', icon: '🎨' },
  { name: 'Webtoon', slug: 'webtoon', icon: '📱' },
  { name: 'Martial Arts', slug: 'martial-arts', icon: '🥋' },
  { name: 'Mystery', slug: 'mystery', icon: '🔍' },
  { name: 'Supernatural', slug: 'supernatural', icon: '🔮' },
  { name: 'Sports', slug: 'sports', icon: '⚽' },
  { name: 'Slice of Life', slug: 'slice-of-life', icon: '☕' },
  { name: 'School Life', slug: 'school-life', icon: '🏫' },
  { name: 'Sci-fi', slug: 'sci-fi', icon: '🛸' },
  { name: 'Seinen', slug: 'seinen', icon: '🍷' },
  { name: 'Mecha', slug: 'mecha', icon: '🤖' },
  { name: 'Psychological', slug: 'psychological', icon: '🧠' },
  { name: 'Harem', slug: 'harem', icon: '🌸' },
  { name: 'Drama', slug: 'drama', icon: '🎭' }
];

// DOM References
const el = {
  header: document.getElementById('app-header'),
  btnBackGlobal: document.getElementById('btn-back-global'),
  logoLink: document.getElementById('logo-link'),
  searchInput: document.getElementById('search-input'),
  searchClearBtn: document.getElementById('search-clear-btn'),
  searchBtn: document.getElementById('search-btn'),
  searchDropdown: document.getElementById('search-dropdown'),
  searchDropdownList: document.getElementById('search-dropdown-list'),
  navBtns: document.querySelectorAll('.nav-actions .nav-btn'),
  bookmarkBadge: document.getElementById('bookmark-badge'),
  btnRandomManga: document.getElementById('btn-random-manga'),
  btnOpenGenresModal: document.getElementById('btn-open-genres-modal'),
  genresModalBackdrop: document.getElementById('genres-modal-backdrop'),
  btnCloseGenresModal: document.getElementById('btn-close-genres-modal'),
  genresModalGrid: document.getElementById('genres-modal-grid'),
  
  // Views
  views: {
    home: document.getElementById('view-home'),
    detail: document.getElementById('view-detail'),
    reader: document.getElementById('view-reader'),
    bookmarks: document.getElementById('view-bookmarks'),
    history: document.getElementById('view-history')
  },

  // Home
  filterChips: document.querySelectorAll('.filter-chip'),
  featuredSection: document.getElementById('featured-section'),
  featuredCard: document.getElementById('featured-card'),
  featuredBg: document.getElementById('featured-bg'),
  featuredCoverImg: document.getElementById('featured-cover-img'),
  featuredTitle: document.getElementById('featured-title'),
  featuredDesc: document.getElementById('featured-desc'),
  featuredStatusBadge: document.getElementById('featured-status-badge'),
  featuredViewsBadge: document.getElementById('featured-views-badge'),
  featuredReadBtn: document.getElementById('featured-read-btn'),
  featuredDetailBtn: document.getElementById('featured-detail-btn'),
  homeSectionTitle: document.getElementById('home-section-title'),
  comicsCountPill: document.getElementById('comics-count-pill'),
  comicsGrid: document.getElementById('comics-grid'),
  paginationBar: document.getElementById('pagination-bar'),
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  pageIndicator: document.getElementById('page-indicator'),

  // Detail
  detailBackdrop: document.getElementById('detail-backdrop'),
  detailCover: document.getElementById('detail-cover'),
  detailTitle: document.getElementById('detail-title'),
  detailAuthor: document.getElementById('detail-author'),
  detailStatus: document.getElementById('detail-status'),
  detailViews: document.getElementById('detail-views'),
  detailRating: document.getElementById('detail-rating'),
  detailGenres: document.getElementById('detail-genres'),
  detailSynopsis: document.getElementById('detail-synopsis'),
  detailChaptersList: document.getElementById('detail-chapters-list'),
  detailChapterCount: document.getElementById('detail-chapter-count'),
  btnFavoriteToggle: document.getElementById('btn-favorite-toggle'),
  favoriteHeartIcon: document.getElementById('favorite-heart-icon'),
  btnReadFirst: document.getElementById('btn-read-first'),
  btnReadLatest: document.getElementById('btn-read-latest'),
  chapterSearchInput: document.getElementById('chapter-search-input'),
  btnSortChapters: document.getElementById('btn-sort-chapters'),
  sortOrderText: document.getElementById('sort-order-text'),

  // Reader Controls
  readerToolbar: document.getElementById('reader-toolbar'),
  btnReaderBack: document.getElementById('btn-reader-back'),
  readerComicTitle: document.getElementById('reader-comic-title'),
  readerChapterTitle: document.getElementById('reader-chapter-title'),
  readerChapterSelect: document.getElementById('reader-chapter-select'),
  btnReaderPrev: document.getElementById('btn-reader-prev'),
  btnReaderNext: document.getElementById('btn-reader-next'),
  btnToggleReadMode: document.getElementById('btn-toggle-read-mode'),
  readModeIcon: document.getElementById('read-mode-icon'),
  readModeLabel: document.getElementById('read-mode-label'),
  btnAutoscrollToggle: document.getElementById('btn-autoscroll-toggle'),
  autoscrollIcon: document.getElementById('autoscroll-icon'),
  btnEyeCare: document.getElementById('btn-eye-care'),
  eyeCareDropdown: document.getElementById('eye-care-dropdown'),
  btnTones: document.querySelectorAll('.btn-tone'),
  brightnessSlider: document.getElementById('brightness-slider'),
  btnToggleChapterDrawer: document.getElementById('btn-toggle-chapter-drawer'),
  chapterDrawerOverlay: document.getElementById('chapter-drawer-overlay'),
  btnCloseDrawer: document.getElementById('btn-close-drawer'),
  drawerChapSearch: document.getElementById('drawer-chap-search'),
  drawerChapList: document.getElementById('drawer-chap-list'),
  btnWidthModes: document.querySelectorAll('.btn-width-mode'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  readerCanvas: document.getElementById('reader-canvas'),
  readerImagesContainer: document.getElementById('reader-images-container'),
  pagedReaderContainer: document.getElementById('paged-reader-container'),
  pagedCurrentImg: document.getElementById('paged-current-img'),
  pagedPrevBtn: document.getElementById('paged-prev-btn'),
  pagedNextBtn: document.getElementById('paged-next-btn'),
  pagedIndicator: document.getElementById('paged-indicator'),
  pagedScrubber: document.getElementById('paged-scrubber'),
  readerLoading: document.getElementById('reader-loading'),
  btnBottomPrev: document.getElementById('btn-bottom-prev'),
  btnBottomNext: document.getElementById('btn-bottom-next'),
  btnScrollTop: document.getElementById('btn-scroll-top'),
  readerFloatingDock: document.getElementById('reader-floating-dock'),
  fabMainTrigger: document.getElementById('fab-main-trigger'),
  btnFabScrollTop: document.getElementById('btn-fab-scroll-top'),
  readProgressBar: document.getElementById('read-progress-bar'),

  // Bookmarks & History
  selectBookmarkSort: document.getElementById('select-bookmark-sort'),
  bookmarksGrid: document.getElementById('bookmarks-grid'),
  bookmarksCountPill: document.getElementById('bookmarks-count-pill'),
  btnExportBackup: document.getElementById('btn-export-backup'),
  inputImportBackup: document.getElementById('input-import-backup'),
  btnClearBookmarks: document.getElementById('btn-clear-bookmarks'),
  historyList: document.getElementById('history-list'),
  historyCountPill: document.getElementById('history-count-pill'),
  btnClearHistory: document.getElementById('btn-clear-history'),

  // Overlays
  globalSpinner: document.getElementById('global-spinner'),
  spinnerText: document.getElementById('spinner-text'),
  toastContainer: document.getElementById('toast-container')
};

// ==================== High-Speed Client Cache (RAM + SessionStorage) ====================
const clientCache = new Map();

async function fetchCached(url, ttlMs = 180000) {
  const now = Date.now();
  const memoryItem = clientCache.get(url);
  if (memoryItem && (now - memoryItem.time < ttlMs)) {
    return memoryItem.data;
  }
  try {
    const sItem = sessionStorage.getItem('mf_c_' + url);
    if (sItem) {
      const parsed = JSON.parse(sItem);
      if (now - parsed.time < ttlMs) {
        clientCache.set(url, parsed);
        return parsed.data;
      }
    }
  } catch (e) {}

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const entry = { time: now, data };
  clientCache.set(url, entry);
  try {
    sessionStorage.setItem('mf_c_' + url, JSON.stringify(entry));
  } catch (e) {
    try { sessionStorage.clear(); } catch (_) {}
  }
  return data;
}

// ==================== Utilities ====================

function getProxyImageUrl(rawUrl) {
  if (!rawUrl) return '/assets/images/thumb-default.jpg';
  // Direct fast CDN loading with 0 server delay for supported hosts
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    if (rawUrl.includes('khotruyen.site') || rawUrl.includes('img.otruyenapi.com') || rawUrl.includes('storage/thumbnails') || rawUrl.includes('truyenqq.com.vn/media/book')) {
      return rawUrl;
    }
  }
  return `${API_BASE}/image?url=${encodeURIComponent(rawUrl)}`;
}

function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showSpinner(text = 'Đang tải dữ liệu...') {
  el.spinnerText.textContent = text;
  el.globalSpinner.classList.remove('hidden');
}

function hideSpinner() {
  el.globalSpinner.classList.add('hidden');
}

function updateBookmarkBadge() {
  el.bookmarkBadge.textContent = state.bookmarks.length;
  const mBadge = document.getElementById('m-bookmark-badge');
  if (mBadge) mBadge.textContent = state.bookmarks.length;
}

// ==================== View Switching ====================

function switchView(viewName) {
  stopAutoScroll();
  state.currentView = viewName;
  document.body.classList.toggle('in-reader', viewName === 'reader');

  Object.keys(el.views).forEach(key => {
    if (key === viewName) {
      el.views[key].classList.add('active');
    } else {
      el.views[key].classList.remove('active');
    }
  });

  el.navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === viewName);
  });

  document.querySelectorAll('.mobile-bottom-nav .m-nav-item').forEach(mBtn => {
    mBtn.classList.toggle('active', mBtn.dataset.tab === viewName);
  });

  if (viewName === 'home') {
    el.btnBackGlobal.classList.add('hidden');
    el.readProgressBar.style.width = '0%';
  } else {
    el.btnBackGlobal.classList.remove('hidden');
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ==================== Skeleton Shimmer Loading ====================

function renderSkeletonGrid(targetContainer, count = 12) {
  targetContainer.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skel = document.createElement('div');
    skel.className = 'skeleton-card';
    targetContainer.appendChild(skel);
  }
}

// ==================== Home & Feed ====================

async function loadHome(page = 1, sort = 0, genre = '', status = 0) {
  state.homePage = page;
  state.homeSort = sort;
  state.homeGenre = genre;
  state.homeStatus = status;
  state.searchKeyword = '';
  el.searchInput.value = '';
  el.searchClearBtn.classList.add('hidden');
  el.searchDropdown.classList.add('hidden');

  renderSkeletonGrid(el.comicsGrid, 12);

  try {
    let url = `${API_BASE}/home?page=${page}`;
    if (sort) url += `&sort=${sort}`;
    if (status) url += `&status=${status}`;
    if (genre) url = `${API_BASE}/genre?slug=${encodeURIComponent(genre)}&page=${page}`;

    const data = await fetchCached(url, 180000);

    if (!data || !data.comics) {
      showToast('Không thể tải truyện lúc này!');
      return;
    }

    state.loadedComics = data.comics;
    renderComicsGrid(data.comics, el.comicsGrid);

    // Section title
    if (genre) {
      const gItem = GENRES_CATALOG.find(g => g.slug === genre);
      el.homeSectionTitle.textContent = `${gItem ? gItem.icon : '🏷️'} Thể loại: ${gItem ? gItem.name : genre}`;
    } else if (status == 2) {
      el.homeSectionTitle.textContent = '🏆 Danh Sách Truyện Đã Hoàn Thành (Full)';
    } else if (sort == 10 || sort == 1) {
      el.homeSectionTitle.textContent = '🔥 Top Truyện Được Xem Nhiều Nhất';
    } else if (sort == 11) {
      el.homeSectionTitle.textContent = '📅 Top Truyện Được Xem Nhiều Trong Tháng';
    } else if (sort == 12) {
      el.homeSectionTitle.textContent = '⭐ Top Truyện Được Xem Nhiều Trong Tuần';
    } else if (sort == 20) {
      el.homeSectionTitle.textContent = '❤️ Top Truyện Được Độc Giả Yêu Thích';
    } else {
      el.homeSectionTitle.textContent = 'Danh Sách Truyện Mới Cập Nhật';
    }

    el.comicsCountPill.textContent = `${data.comics.length} truyện`;

    if (el.featuredSection) {
      if (data.comics.length > 0 && page === 1 && !genre && !status && (!sort || sort === 0)) {
        el.featuredSection.classList.remove('hidden');
        setupFeaturedManga(data.comics[0]);
      } else {
        el.featuredSection.classList.add('hidden');
      }
    } else if (data.comics.length > 0 && page === 1 && !genre && !status && (!sort || sort === 0)) {
      setupFeaturedManga(data.comics[0]);
    }

    // Pagination
    el.pageIndicator.textContent = `Trang ${page}`;
    el.btnPrevPage.disabled = page <= 1;
    el.btnNextPage.disabled = data.comics.length < 20;

    // PRE-WARM top 8 comics into memory so tapping any of them is 100% instant (0ms)!
    if (data.comics && data.comics.length > 0) {
      setTimeout(() => {
        data.comics.slice(0, 8).forEach(c => {
          const u = `${API_BASE}/detail?slug=${encodeURIComponent(c.slug)}`;
          fetchCached(u, 300000).catch(() => {});
        });
      }, 600);
    }

  } catch (err) {
    console.error('Error loading home:', err);
    if (window.location.protocol === 'file:') {
      showToast('⚠️ Bạn đang mở trực tiếp file. Hãy chạy file "Mo Web Doc Truyen.bat" để khởi động server cào dữ liệu nhé!', 7000);
      el.comicsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: rgba(255,42,85,0.1); border: 1px dashed rgba(255,42,85,0.4); border-radius: 14px;">
          <h3 style="color: #ff5277; margin-bottom: 10px;">⚠️ Chưa khởi động Server cào dữ liệu!</h3>
          <p style="color: #cbd5e1; max-width: 600px; margin: 0 auto 16px auto; font-size: 14px; line-height: 1.6;">
            Trình duyệt chặn các web tĩnh gọi cào dữ liệu trực tiếp từ web khác (lỗi CORS & chặn ảnh 403 Forbidden).<br>
            Để xem truyện, bạn chỉ cần <b>nhấp đúp chạy file <code>Mo Web Doc Truyen.bat</code></b> trong thư mục dự án!
          </p>
        </div>
      `;
    } else {
      showToast('Lỗi kết nối tới hinettruyen: ' + err.message);
    }
  }
}

function setupFeaturedManga(comic) {
  if (!comic) return;
  el.featuredTitle.textContent = comic.title;
  el.featuredDesc.textContent = `Xem ${comic.views || 'hàng ngàn lượt xem'} • Chương mới: ${comic.chapters && comic.chapters[0] ? comic.chapters[0].title : 'Đang cập nhật'}`;
  el.featuredBg.style.backgroundImage = `url(${getProxyImageUrl(comic.cover)})`;
  if (el.featuredCoverImg) {
    el.featuredCoverImg.src = getProxyImageUrl(comic.cover);
  }
  if (el.featuredViewsBadge) {
    el.featuredViewsBadge.textContent = comic.views ? `👁️ ${comic.views}` : '👁️ Xem nhiều';
  }
  if (el.featuredStatusBadge) {
    el.featuredStatusBadge.textContent = '🔥 Hot Live';
  }
  
  el.featuredReadBtn.onclick = () => {
    if (comic.chapters && comic.chapters.length > 0) {
      openChapter(comic.slug, comic.chapters[0].chapterSlug);
    } else {
      openComicDetail(comic.slug);
    }
  };

  el.featuredDetailBtn.onclick = () => {
    openComicDetail(comic.slug);
  };
}

function renderComicsGrid(comics, targetContainer) {
  targetContainer.innerHTML = '';
  if (!comics || comics.length === 0) {
    targetContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-dim);">
        <p style="font-size: 16px;">Không tìm thấy bộ truyện nào!</p>
      </div>
    `;
    return;
  }

  comics.forEach(comic => {
    const card = document.createElement('div');
    card.className = 'comic-card';
    
    const isFav = state.bookmarks.some(b => b.slug === comic.slug);

    const chapItemsHtml = (comic.chapters || []).map(ch => `
      <div class="comic-chapter-link" data-slug="${comic.slug}" data-chap="${ch.chapterSlug}">
        <span>${ch.title}</span>
        <span class="c-time">${ch.time}</span>
      </div>
    `).join('');

    card.innerHTML = `
      <div class="comic-thumb-wrapper">
        <img class="comic-thumb" src="${getProxyImageUrl(comic.cover)}" alt="${comic.title}" loading="lazy" onerror="this.src='/assets/images/thumb-default.jpg'">
        <div class="comic-overlay-badges">
          <span class="badge-view">${comic.views || 'Hot'}</span>
          <button class="btn-card-fav ${isFav ? 'active' : ''}" data-slug="${comic.slug}" title="Yêu thích">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="comic-info">
        <h3 class="comic-title" title="${comic.title}">${comic.title}</h3>
        <div class="comic-chapters">
          ${chapItemsHtml}
        </div>
      </div>
    `;

    card.querySelector('.comic-thumb-wrapper').onclick = (e) => {
      if (e.target.closest('.btn-card-fav')) return;
      openComicDetail(comic.slug);
    };
    card.querySelector('.comic-title').onclick = () => openComicDetail(comic.slug);

    card.querySelectorAll('.comic-chapter-link').forEach(link => {
      link.onclick = (e) => {
        e.stopPropagation();
        openChapter(comic.slug, link.dataset.chap);
      };
    });

    const favBtn = card.querySelector('.btn-card-fav');
    favBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFavorite(comic);
      favBtn.classList.toggle('active');
      const svgPath = favBtn.querySelector('path');
      svgPath.setAttribute('fill', favBtn.classList.contains('active') ? 'currentColor' : 'none');
    };

    targetContainer.appendChild(card);
  });
}

// ==================== Live Instant Search Suggestions ====================

let searchDebounceTimer = null;

el.searchInput.oninput = () => {
  const query = el.searchInput.value.trim();
  if (query) {
    el.searchClearBtn.classList.remove('hidden');
  } else {
    el.searchClearBtn.classList.add('hidden');
    el.searchDropdown.classList.add('hidden');
    return;
  }

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    fetchLiveSuggestions(query);
  }, 300);
};

async function fetchLiveSuggestions(query) {
  if (query.length < 2) return;
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&page=1`);
    const data = await res.json();
    if (!data || !data.comics || data.comics.length === 0) {
      el.searchDropdown.classList.add('hidden');
      return;
    }

    el.searchDropdownList.innerHTML = '';
    const topResults = data.comics.slice(0, 5);

    topResults.forEach(c => {
      const item = document.createElement('div');
      item.className = 'search-drop-item';
      item.innerHTML = `
        <img class="search-drop-thumb" src="${getProxyImageUrl(c.cover)}" alt="${c.title}" onerror="this.src='/assets/images/thumb-default.jpg'">
        <div class="search-drop-info">
          <div class="search-drop-title">${c.title}</div>
          <div class="search-drop-sub">${c.chapters && c.chapters[0] ? c.chapters[0].title : (c.views || 'Đọc ngay')}</div>
        </div>
      `;
      item.onclick = () => {
        el.searchDropdown.classList.add('hidden');
        openComicDetail(c.slug);
      };
      el.searchDropdownList.appendChild(item);
    });

    el.searchDropdown.classList.remove('hidden');
  } catch (e) {
    console.error('Live search error:', e);
  }
}

// Hide dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrapper')) {
    el.searchDropdown.classList.add('hidden');
  }
});

async function handleSearch(keyword, page = 1) {
  if (!keyword.trim()) return;
  state.searchKeyword = keyword.trim();
  state.searchPage = page;
  el.searchDropdown.classList.add('hidden');
  switchView('home');
  renderSkeletonGrid(el.comicsGrid, 12);

  try {
    const data = await fetchCached(`${API_BASE}/search?q=${encodeURIComponent(state.searchKeyword)}&page=${page}`, 180000);

    el.homeSectionTitle.textContent = `Kết Quả Tìm Kiếm: "${state.searchKeyword}"`;
    el.comicsCountPill.textContent = `${data.comics ? data.comics.length : 0} kết quả`;
    renderComicsGrid(data.comics || [], el.comicsGrid);

    el.pageIndicator.textContent = `Trang ${page}`;
    el.btnPrevPage.disabled = page <= 1;
    el.btnNextPage.disabled = !data.comics || data.comics.length < 20;

  } catch (err) {
    console.error('Search error:', err);
    showToast('Lỗi tìm kiếm: ' + err.message);
  }
}

// ==================== Comic Detail View ====================

function openComicDetail(slug) {
  const targetHash = `#comic/${encodeURIComponent(slug)}`;
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  } else {
    _loadComicDetail(slug);
  }
}

async function _loadComicDetail(slug) {
  // OPTIMISTIC RENDER: If we have basic info in state, render immediately (0ms UI!)
  const existing = (state.loadedComics || []).find(c => c.slug === slug)
    || (state.bookmarks || []).find(c => c.slug === slug)
    || (state.history || []).find(c => c.slug === slug);

  if (existing) {
    el.detailTitle.textContent = existing.title || slug;
    if (existing.cover) {
      el.detailCover.src = getProxyImageUrl(existing.cover);
      el.detailBackdrop.style.backgroundImage = `url(${getProxyImageUrl(existing.cover)})`;
    }
    switchView('detail');
  }

  const detailUrl = `${API_BASE}/detail?slug=${encodeURIComponent(slug)}`;
  const isPrecached = clientCache.has(detailUrl);
  if (!isPrecached && !existing) {
    showSpinner('Đang tải thông tin truyện & danh sách chương...');
  }

  try {
    const detail = await fetchCached(detailUrl, 300000);
    hideSpinner();

    if (!detail || !detail.title) {
      showToast('Không tìm thấy thông tin truyện!');
      return;
    }

    state.currentComic = detail;
    state.chaptersList = detail.chapters || [];
    state.chapterSortAsc = false;

    // Populate UI
    el.detailTitle.textContent = detail.title;
    el.detailCover.src = getProxyImageUrl(detail.cover);
    el.detailBackdrop.style.backgroundImage = `url(${getProxyImageUrl(detail.cover)})`;
    el.detailAuthor.textContent = detail.author || 'Đang cập nhật';
    el.detailStatus.textContent = detail.status || 'Đang tiến hành';
    el.detailViews.textContent = detail.views || '0';
    el.detailRating.textContent = `⭐ ${detail.rating || '5.0'}`;
    el.detailSynopsis.textContent = detail.description || 'Chưa có mô tả cho bộ truyện này.';
    el.detailChapterCount.textContent = `${state.chaptersList.length} chương`;

    // Genres tags
    el.detailGenres.innerHTML = (detail.genres || []).map(g => `
      <span class="genre-tag" data-slug="${g.slug}">${g.name}</span>
    `).join('');

    el.detailGenres.querySelectorAll('.genre-tag').forEach(tag => {
      tag.onclick = () => {
        navigateTo(`#genre/${encodeURIComponent(tag.dataset.slug)}`);
      };
    });

    const isFav = state.bookmarks.some(b => b.slug === detail.slug);
    updateFavoriteButtonState(isFav);

    // Read First & Read Latest buttons
    if (state.chaptersList.length > 0) {
      const firstChap = state.chaptersList[state.chaptersList.length - 1]; // oldest
      const latestChap = state.chaptersList[0]; // newest
      
      el.btnReadFirst.onclick = () => openChapter(slug, firstChap.chapterSlug);
      el.btnReadLatest.onclick = () => openChapter(slug, latestChap.chapterSlug);

      // Pre-warm latest chapter so tapping "Đọc Ngay" opens in 0ms!
      setTimeout(() => {
        const firstUrl = `${API_BASE}/chapter?slug=${encodeURIComponent(slug)}&chapter=${encodeURIComponent(latestChap.chapterSlug)}`;
        fetchCached(firstUrl, 1800000).catch(() => {});
      }, 500);
    }

    renderChapterButtons();
    switchView('detail');

  } catch (err) {
    hideSpinner();
    console.error('Error fetching detail:', err);
    showToast('Lỗi tải chi tiết truyện: ' + err.message);
  }
}

function renderChapterButtons(filterText = '') {
  el.detailChaptersList.innerHTML = '';
  
  let list = [...state.chaptersList];
  if (state.chapterSortAsc) {
    list.reverse();
  }

  if (filterText.trim()) {
    const f = filterText.toLowerCase();
    list = list.filter(ch => ch.name.toLowerCase().includes(f) || ch.chapterSlug.toLowerCase().includes(f));
  }

  if (list.length === 0) {
    el.detailChaptersList.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 20px;">Không tìm thấy chương nào khớp!</div>`;
    return;
  }

  const readSet = new Set(state.readChapters[state.currentComic.slug] || []);
  const fragment = document.createDocumentFragment();

  // If over 120 chapters and not searching, render first 120 with one-click expand to avoid UI freeze
  const isFiltering = Boolean(filterText.trim());
  const displayLimit = isFiltering ? list.length : Math.min(list.length, 120);

  for (let i = 0; i < displayLimit; i++) {
    const ch = list[i];
    const btn = document.createElement('div');
    const isRead = readSet.has(ch.chapterSlug);
    btn.className = `chapter-btn ${isRead ? 'is-read' : ''}`;
    btn.textContent = ch.name;
    btn.title = `${ch.name} (${ch.time || ''})`;
    btn.onclick = () => openChapter(state.currentComic.slug, ch.chapterSlug);
    fragment.appendChild(btn);
  }

  el.detailChaptersList.appendChild(fragment);

  if (!isFiltering && list.length > displayLimit) {
    const moreBtn = document.createElement('button');
    moreBtn.className = 'btn btn-outline';
    moreBtn.style.gridColumn = '1 / -1';
    moreBtn.style.margin = '12px auto';
    moreBtn.style.padding = '10px 24px';
    moreBtn.style.borderRadius = '24px';
    moreBtn.textContent = `Xem toàn bộ ${list.length} chương (+${list.length - displayLimit} chương)`;
    moreBtn.onclick = () => {
      moreBtn.remove();
      const moreFrag = document.createDocumentFragment();
      for (let i = displayLimit; i < list.length; i++) {
        const ch = list[i];
        const btn = document.createElement('div');
        const isRead = readSet.has(ch.chapterSlug);
        btn.className = `chapter-btn ${isRead ? 'is-read' : ''}`;
        btn.textContent = ch.name;
        btn.title = `${ch.name} (${ch.time || ''})`;
        btn.onclick = () => openChapter(state.currentComic.slug, ch.chapterSlug);
        moreFrag.appendChild(btn);
      }
      el.detailChaptersList.appendChild(moreFrag);
    };
    el.detailChaptersList.appendChild(moreBtn);
  }
}

function updateFavoriteButtonState(isFav) {
  if (isFav) {
    el.btnFavoriteToggle.classList.add('active');
    el.favoriteHeartIcon.setAttribute('fill', 'currentColor');
  } else {
    el.btnFavoriteToggle.classList.remove('active');
    el.favoriteHeartIcon.setAttribute('fill', 'none');
  }
}

// ==================== Chapter Reader ====================

function openChapter(slug, chapterSlug) {
  const targetHash = `#read/${encodeURIComponent(slug)}/${encodeURIComponent(chapterSlug)}`;
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  } else {
    _loadChapter(slug, chapterSlug);
  }
}

async function _loadChapter(slug, chapterSlug) {
  stopAutoScroll();
  if (el.readerFloatingDock) el.readerFloatingDock.classList.remove('open');
  state.readingComicSlug = slug;
  state.readingChapterSlug = chapterSlug;
  state.pagedCurrentIndex = 0;

  switchView('reader');
  window.scrollTo({ top: 0, behavior: 'instant' });

  const chapterUrl = `${API_BASE}/chapter?slug=${encodeURIComponent(slug)}&chapter=${encodeURIComponent(chapterSlug)}`;
  const isPrecached = clientCache.has(chapterUrl);
  if (!isPrecached) {
    el.readerLoading.classList.remove('hidden');
    el.readerImagesContainer.innerHTML = '';
  }

  try {
    const data = await fetchCached(chapterUrl, 1800000);
    el.readerLoading.classList.add('hidden');
    el.readerImagesContainer.innerHTML = '';

    if (!data || !data.images || data.images.length === 0) {
      el.readerImagesContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #ff5277; background: rgba(255,42,85,0.1); border-radius: 12px;">
          <p style="font-size: 16px; margin-bottom: 12px;">Không thể tải hình ảnh chương truyện lúc này!</p>
          <button class="btn btn-primary" onclick="openChapter('${slug}', '${chapterSlug}')">Thử Lại</button>
        </div>
      `;
      return;
    }

    state.readingChapterData = data;
    el.readerComicTitle.textContent = data.comicTitle || slug;
    el.readerChapterTitle.textContent = data.chapterTitle || chapterSlug;

    populateReaderSelect(slug, chapterSlug);
    populateDrawerChapters(slug, chapterSlug);

    // Prev / Next button states - HIDE when reaching the end/beginning
    if (!data.nextChapterSlug) {
      el.btnReaderNext.style.display = 'none';
      el.btnBottomNext.style.display = 'none';
    } else {
      el.btnReaderNext.style.display = '';
      el.btnBottomNext.style.display = '';
      el.btnReaderNext.disabled = false;
      el.btnBottomNext.disabled = false;
      el.btnReaderNext.onclick = () => openChapter(slug, data.nextChapterSlug);
      el.btnBottomNext.onclick = () => openChapter(slug, data.nextChapterSlug);

      // PREFETCH NEXT CHAPTER IN BACKGROUND (0ms transition when user finishes current chapter)
      setTimeout(() => {
        const nextUrl = `${API_BASE}/chapter?slug=${encodeURIComponent(slug)}&chapter=${encodeURIComponent(data.nextChapterSlug)}`;
        fetchCached(nextUrl, 1800000).catch(() => {});
      }, 1000);
    }

    if (!data.prevChapterSlug) {
      el.btnReaderPrev.style.display = 'none';
      el.btnBottomPrev.style.display = 'none';
    } else {
      el.btnReaderPrev.style.display = '';
      el.btnBottomPrev.style.display = '';
      el.btnReaderPrev.disabled = false;
      el.btnBottomPrev.disabled = false;
      el.btnReaderPrev.onclick = () => openChapter(slug, data.prevChapterSlug);
      el.btnBottomPrev.onclick = () => openChapter(slug, data.prevChapterSlug);
    }

    // Render Webtoon continuous images
    data.images.forEach((imgUrl, idx) => {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'reader-page-wrapper';

      const img = document.createElement('img');
      img.className = 'reader-page-img';
      img.alt = `Trang ${idx + 1}`;
      img.loading = idx < 2 ? 'eager' : 'lazy';
      if (idx < 2) img.setAttribute('fetchpriority', 'high');
      img.src = getProxyImageUrl(imgUrl);

      img.onerror = () => {
        img.onerror = null;
        img.src = imgUrl; // Direct fallback
      };

      const badge = document.createElement('span');
      badge.className = 'page-num-badge';
      badge.textContent = `${idx + 1} / ${data.images.length}`;

      pageWrapper.appendChild(img);
      pageWrapper.appendChild(badge);
      el.readerImagesContainer.appendChild(pageWrapper);
    });

    // Setup Paged mode controls
    el.pagedScrubber.max = data.images.length;
    el.pagedScrubber.value = 1;
    updatePagedView();

    // Mark as read in state & LocalStorage
    markChapterAsRead(slug, chapterSlug);

    // Cover lookup for history
    const foundCover = (state.currentComic && state.currentComic.cover)
      || (state.loadedComics && state.loadedComics.find(c => c.slug === slug)?.cover)
      || (state.bookmarks && state.bookmarks.find(b => b.slug === slug)?.cover)
      || '';

    // Add to history
    addToHistory({
      slug: slug,
      title: data.comicTitle || slug,
      chapterSlug: chapterSlug,
      chapterTitle: data.chapterTitle || chapterSlug,
      cover: foundCover,
      time: new Date().toLocaleString('vi-VN')
    });

    // Background fetch comic detail if chaptersList is empty or from another comic
    // This populates the FULL chapter list in dropdown & drawer and recalculates accurate next/prev
    if (!state.chaptersList || state.chaptersList.length <= 1 || (state.currentComic && state.currentComic.slug !== slug)) {
      fetch(`${API_BASE}/detail?slug=${encodeURIComponent(slug)}`)
        .then(res => res.json())
        .then(detail => {
          if (detail && detail.chapters && detail.chapters.length > 0) {
            state.currentComic = detail;
            state.chaptersList = detail.chapters;
            populateReaderSelect(slug, chapterSlug);
            populateDrawerChapters(slug, chapterSlug);

            // Re-verify next/prev from complete chapters list
            const idx = state.chaptersList.findIndex(c => c.chapterSlug === chapterSlug);
            if (idx !== -1) {
              const nextChap = idx > 0 ? state.chaptersList[idx - 1].chapterSlug : null;
              const prevChap = idx < state.chaptersList.length - 1 ? state.chaptersList[idx + 1].chapterSlug : null;

              if (!nextChap) {
                el.btnReaderNext.style.display = 'none';
                el.btnBottomNext.style.display = 'none';
              } else {
                el.btnReaderNext.style.display = '';
                el.btnBottomNext.style.display = '';
                el.btnReaderNext.disabled = false;
                el.btnBottomNext.disabled = false;
                el.btnReaderNext.onclick = () => openChapter(slug, nextChap);
                el.btnBottomNext.onclick = () => openChapter(slug, nextChap);
              }

              if (!prevChap) {
                el.btnReaderPrev.style.display = 'none';
                el.btnBottomPrev.style.display = 'none';
              } else {
                el.btnReaderPrev.style.display = '';
                el.btnBottomPrev.style.display = '';
                el.btnReaderPrev.disabled = false;
                el.btnBottomPrev.disabled = false;
                el.btnReaderPrev.onclick = () => openChapter(slug, prevChap);
                el.btnBottomPrev.onclick = () => openChapter(slug, prevChap);
              }
            }

            // If history item lacked cover, fill it now
            if (detail.cover) {
              const histItem = state.history.find(h => h.slug === slug);
              if (histItem && !histItem.cover) {
                histItem.cover = detail.cover;
                localStorage.setItem('mf_history', JSON.stringify(state.history));
              }
            }
          }
        })
        .catch(err => console.warn('Background chapters fetch error:', err));
    }

  } catch (err) {
    el.readerLoading.classList.add('hidden');
    console.error('Error loading chapter:', err);
    showToast('Lỗi tải chương: ' + err.message);
  }
}

function populateReaderSelect(slug, currentChapterSlug) {
  el.readerChapterSelect.innerHTML = '';
  const chapters = state.chaptersList || [];

  if (chapters.length === 0) {
    const opt = document.createElement('option');
    opt.value = currentChapterSlug;
    opt.textContent = currentChapterSlug;
    el.readerChapterSelect.appendChild(opt);
    return;
  }

  chapters.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch.chapterSlug;
    opt.textContent = ch.name;
    if (ch.chapterSlug === currentChapterSlug) {
      opt.selected = true;
    }
    el.readerChapterSelect.appendChild(opt);
  });

  el.readerChapterSelect.onchange = (e) => {
    openChapter(slug, e.target.value);
  };
}

// Quick Chapter Drawer
function populateDrawerChapters(slug, currentChapterSlug) {
  el.drawerChapList.innerHTML = '';
  const chapters = state.chaptersList || [];

  chapters.forEach(ch => {
    const item = document.createElement('div');
    item.className = `drawer-item ${ch.chapterSlug === currentChapterSlug ? 'active' : ''}`;
    item.textContent = ch.name;
    item.onclick = () => {
      el.chapterDrawerOverlay.classList.add('hidden');
      openChapter(slug, ch.chapterSlug);
    };
    el.drawerChapList.appendChild(item);
  });

  el.drawerChapSearch.oninput = (e) => {
    const q = e.target.value.toLowerCase();
    el.drawerChapList.querySelectorAll('.drawer-item').forEach(it => {
      it.style.display = it.textContent.toLowerCase().includes(q) ? 'block' : 'none';
    });
  };
}

// Paged mode logic
function updatePagedView() {
  if (!state.readingChapterData || !state.readingChapterData.images) return;
  const images = state.readingChapterData.images;
  const currentImgUrl = images[state.pagedCurrentIndex];
  
  el.pagedCurrentImg.src = getProxyImageUrl(currentImgUrl);
  el.pagedIndicator.textContent = `Trang ${state.pagedCurrentIndex + 1} / ${images.length}`;
  el.pagedScrubber.value = state.pagedCurrentIndex + 1;

  el.pagedPrevBtn.style.opacity = state.pagedCurrentIndex > 0 ? '1' : '0.3';
  el.pagedNextBtn.style.opacity = state.pagedCurrentIndex < images.length - 1 ? '1' : '0.3';
}

el.pagedPrevBtn.onclick = () => {
  if (state.pagedCurrentIndex > 0) {
    state.pagedCurrentIndex--;
    updatePagedView();
    window.scrollTo({ top: 120, behavior: 'smooth' });
  }
};

el.pagedNextBtn.onclick = () => {
  if (state.readingChapterData && state.pagedCurrentIndex < state.readingChapterData.images.length - 1) {
    state.pagedCurrentIndex++;
    updatePagedView();
    window.scrollTo({ top: 120, behavior: 'smooth' });
  } else if (state.readingChapterData && state.readingChapterData.nextChapterSlug) {
    openChapter(state.readingComicSlug, state.readingChapterData.nextChapterSlug);
  }
};

el.pagedScrubber.oninput = (e) => {
  state.pagedCurrentIndex = parseInt(e.target.value, 10) - 1;
  updatePagedView();
};

// Toggle Webtoon vs Paged Mode
el.btnToggleReadMode.onclick = () => {
  if (el.readerFloatingDock) el.readerFloatingDock.classList.remove('open');
  if (state.readMode === 'webtoon') {
    state.readMode = 'paged';
    el.readModeIcon.textContent = '📖';
    el.readModeLabel.textContent = 'Trang';
    el.readerImagesContainer.classList.add('hidden');
    el.pagedReaderContainer.classList.remove('hidden');
    updatePagedView();
  } else {
    state.readMode = 'webtoon';
    el.readModeIcon.textContent = '📜';
    el.readModeLabel.textContent = 'Cuộn';
    el.pagedReaderContainer.classList.add('hidden');
    el.readerImagesContainer.classList.remove('hidden');
  }
};

// Auto-Scroll Feature
function toggleAutoScroll() {
  if (state.isAutoScrolling) {
    stopAutoScroll();
  } else {
    startAutoScroll();
  }
}

function startAutoScroll() {
  if (state.readMode === 'paged') return;
  state.isAutoScrolling = true;
  el.btnAutoscrollToggle.classList.add('active');
  el.autoscrollIcon.textContent = '⏸️';
  showToast('Đang bật tự động cuộn trang (Spacebar để dừng)');

  function scrollStep() {
    if (!state.isAutoScrolling) return;
    window.scrollBy(0, state.autoScrollSpeed);
    
    // Check bottom
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 50) {
      stopAutoScroll();
      return;
    }
    state.autoScrollAnimId = requestAnimationFrame(scrollStep);
  }
  state.autoScrollAnimId = requestAnimationFrame(scrollStep);
}

function stopAutoScroll() {
  state.isAutoScrolling = false;
  if (state.autoScrollAnimId) {
    cancelAnimationFrame(state.autoScrollAnimId);
  }
  el.btnAutoscrollToggle.classList.remove('active');
  el.autoscrollIcon.textContent = '▶️';
}

el.btnAutoscrollToggle.onclick = () => {
  if (el.readerFloatingDock) el.readerFloatingDock.classList.remove('open');
  toggleAutoScroll();
};

// Expandable Floating Dock (Bấm nút chính để xổ ra menu / thu gọn)
if (el.fabMainTrigger) {
  el.fabMainTrigger.onclick = (e) => {
    e.stopPropagation();
    el.readerFloatingDock.classList.toggle('open');
  };
}

// Scroll Top handlers
if (el.btnScrollTop) {
  el.btnScrollTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
}
if (el.btnFabScrollTop) {
  el.btnFabScrollTop.onclick = () => {
    if (el.readerFloatingDock) el.readerFloatingDock.classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

// Eye Care & Brightness (if present)
if (el.btnEyeCare) {
  el.btnEyeCare.onclick = (e) => {
    e.stopPropagation();
    if (el.eyeCareDropdown) el.eyeCareDropdown.classList.toggle('hidden');
  };
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#reader-floating-dock') && !e.target.closest('.theme-eye-selector')) {
    if (el.readerFloatingDock) el.readerFloatingDock.classList.remove('open');
    if (el.eyeCareDropdown) el.eyeCareDropdown.classList.add('hidden');
  }
});

if (el.btnTones && el.btnTones.length > 0) {
  el.btnTones.forEach(btn => {
    btn.onclick = () => {
      el.btnTones.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tone = btn.dataset.tone;
      document.body.classList.remove('filter-normal', 'filter-sepia', 'filter-oled');
      document.body.classList.add(`filter-${tone}`);
    };
  });
}

if (el.brightnessSlider) {
  el.brightnessSlider.oninput = (e) => {
    const val = e.target.value;
    el.readerCanvas.style.filter = `brightness(${val}%)`;
  };
}

// Drawer Controls
el.btnToggleChapterDrawer.onclick = () => {
  if (el.readerFloatingDock) el.readerFloatingDock.classList.remove('open');
  el.chapterDrawerOverlay.classList.remove('hidden');
};
el.btnCloseDrawer.onclick = () => {
  el.chapterDrawerOverlay.classList.add('hidden');
};
el.chapterDrawerOverlay.onclick = (e) => {
  if (e.target === el.chapterDrawerOverlay) {
    el.chapterDrawerOverlay.classList.add('hidden');
  }
};

// ==================== Genres Catalog Modal ====================

function setupGenresModal() {
  el.genresModalGrid.innerHTML = '';
  GENRES_CATALOG.forEach(g => {
    const card = document.createElement('div');
    card.className = 'genre-card-item';
    card.innerHTML = `
      <span style="font-size: 20px;">${g.icon}</span>
      <span class="genre-card-name">${g.name}</span>
    `;
    card.onclick = () => {
      el.genresModalBackdrop.classList.add('hidden');
      navigateTo(`#genre/${encodeURIComponent(g.slug)}`);
    };
    el.genresModalGrid.appendChild(card);
  });
}

el.btnOpenGenresModal.onclick = () => {
  el.genresModalBackdrop.classList.remove('hidden');
};
el.btnCloseGenresModal.onclick = () => {
  el.genresModalBackdrop.classList.add('hidden');
};
el.genresModalBackdrop.onclick = (e) => {
  if (e.target === el.genresModalBackdrop) {
    el.genresModalBackdrop.classList.add('hidden');
  }
};

// Random Manga Button ("Gacha Truyện")
el.btnRandomManga.onclick = () => {
  if (state.loadedComics && state.loadedComics.length > 0) {
    const randomIdx = Math.floor(Math.random() * state.loadedComics.length);
    const chosen = state.loadedComics[randomIdx];
    showToast(`🎲 Đã chọn ngẫu nhiên: "${chosen.title}"`);
    openComicDetail(chosen.slug);
  } else {
    loadHome(1, 10, '');
  }
};


function parseVietnameseTime(timeStr) {
  if (!timeStr) return 0;
  const s = String(timeStr).toLowerCase().trim();
  const now = Date.now();
  
  if (s.includes('vừa') || s.includes('mới')) return now;
  
  let m = s.match(/(\d+)\s*giây/);
  if (m) return now - parseInt(m[1], 10) * 1000;
  
  m = s.match(/(\d+)\s*phút/);
  if (m) return now - parseInt(m[1], 10) * 60 * 1000;
  
  m = s.match(/(\d+)\s*(?:giờ|tiếng)/);
  if (m) return now - parseInt(m[1], 10) * 3600 * 1000;
  
  if (s.includes('hôm qua')) return now - 24 * 3600 * 1000;
  if (s.includes('hôm kia')) return now - 48 * 3600 * 1000;

  m = s.match(/(\d+)\s*ngày/);
  if (m) return now - parseInt(m[1], 10) * 24 * 3600 * 1000;
  
  m = s.match(/(\d+)\s*tuần/);
  if (m) return now - parseInt(m[1], 10) * 7 * 24 * 3600 * 1000;
  
  m = s.match(/(\d+)\s*tháng/);
  if (m) return now - parseInt(m[1], 10) * 30 * 24 * 3600 * 1000;
  
  m = s.match(/(\d+)\s*năm/);
  if (m) return now - parseInt(m[1], 10) * 365 * 24 * 3600 * 1000;
  
  m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const d = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    return d.getTime() || 0;
  }
  
  const parsed = Date.parse(timeStr);
  return isNaN(parsed) ? 0 : parsed;
}

function parseChapterNum(title) {
  if (!title) return 0;
  const m = String(title).match(/(?:chap|chương|chapter)\s*([0-9]+(?:\.[0-9]+)?)/i);
  return m ? parseFloat(m[1]) : 0;
}

function getBookmarkSortTime(comic) {
  if (comic.updatedAt) {
    const t = typeof comic.updatedAt === 'number' ? comic.updatedAt : Date.parse(comic.updatedAt);
    if (!isNaN(t) && t > 0) return t;
  }
  if (comic.chapters && comic.chapters.length > 0) {
    const ch = comic.chapters[0];
    if (ch.time) {
      const parsed = parseVietnameseTime(ch.time);
      if (parsed > 0) return parsed;
    }
  }
  if (comic.bookmarkedAt) {
    const t = typeof comic.bookmarkedAt === 'number' ? comic.bookmarkedAt : Date.parse(comic.bookmarkedAt);
    if (!isNaN(t) && t > 0) return t;
  }
  return 0;
}

// Bookmarks & History functions
function markChapterAsRead(comicSlug, chapterSlug) {
  if (!state.readChapters[comicSlug]) {
    state.readChapters[comicSlug] = [];
  }
  if (!state.readChapters[comicSlug].includes(chapterSlug)) {
    state.readChapters[comicSlug].push(chapterSlug);
    localStorage.setItem('mf_read_chapters', JSON.stringify(state.readChapters));
  }
}

function addToHistory(item) {
  state.history = state.history.filter(h => h.slug !== item.slug);
  state.history.unshift(item);
  if (state.history.length > 50) state.history.pop();
  localStorage.setItem('mf_history', JSON.stringify(state.history));
}

function toggleFavorite(comic) {
  const index = state.bookmarks.findIndex(b => b.slug === comic.slug);
  if (index > -1) {
    state.bookmarks.splice(index, 1);
    showToast(`Đã bỏ theo dõi "${comic.title}"`);
  } else {
    const chapTime = comic.chapters?.[0]?.time ? parseVietnameseTime(comic.chapters[0].time) : 0;
    state.bookmarks.unshift({
      slug: comic.slug,
      title: comic.title,
      cover: comic.cover,
      views: comic.views,
      chapters: comic.chapters,
      bookmarkedAt: Date.now(),
      updatedAt: chapTime > 0 ? chapTime : Date.now()
    });
    showToast(`❤️ Đã theo dõi "${comic.title}"`);
  }

  localStorage.setItem('mf_bookmarks', JSON.stringify(state.bookmarks));
  updateBookmarkBadge();
}

function renderBookmarks() {
  switchView('bookmarks');
  el.bookmarksCountPill.textContent = `${state.bookmarks.length} bộ truyện`;

  const sortType = state.bookmarkSort || 'updated';
  if (el.selectBookmarkSort) {
    el.selectBookmarkSort.value = sortType;
  }

  const sorted = [...state.bookmarks];
  if (sortType === 'az') {
    sorted.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'vi'));
  } else if (sortType === 'added') {
    // Thứ tự thêm gần nhất
  } else {
    // 'updated' (Mặc định: Ngày cập nhật mới nhất lên đầu)
    sorted.sort((a, b) => {
      const timeA = getBookmarkSortTime(a);
      const timeB = getBookmarkSortTime(b);
      if (timeB !== timeA) return timeB - timeA;
      const numA = parseChapterNum(a.chapters?.[0]?.title);
      const numB = parseChapterNum(b.chapters?.[0]?.title);
      if (numB !== numA) return numB - numA;
      return 0;
    });
  }

  renderComicsGrid(sorted, el.bookmarksGrid);
}

function renderHistory() {
  switchView('history');
  el.historyCountPill.textContent = `${state.history.length} đã đọc`;
  el.historyList.innerHTML = '';

  if (state.history.length === 0) {
    el.historyList.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-dim);">
        <p>Chưa có lịch sử đọc truyện nào!</p>
      </div>
    `;
    return;
  }

  state.history.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card';
    const coverUrl = item.cover ? getProxyImageUrl(item.cover) : '';
    card.innerHTML = `
      <div class="history-left">
        <div class="history-thumb-wrap">
          ${coverUrl ? `<img class="history-thumb" src="${coverUrl}" alt="${item.title}" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'history-thumb-placeholder\\'>📖</span>';">` : `<span class="history-thumb-placeholder">📖</span>`}
        </div>
        <div class="history-meta-wrap">
          <h4 class="history-title" title="${item.title}">${item.title}</h4>
          <div class="history-chapter">Đang đọc: ${item.chapterTitle}</div>
          <div class="history-time">${item.time}</div>
        </div>
      </div>
      <button class="btn btn-primary btn-sm">Đọc Tiếp</button>
    `;
    card.onclick = () => openChapter(item.slug, item.chapterSlug);
    el.historyList.appendChild(card);
  });
}

// Backup Export & Import
el.btnExportBackup.onclick = () => {
  const backupData = {
    bookmarks: state.bookmarks,
    history: state.history,
    readChapters: state.readChapters,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mangaflow_backup_${Date.now()}.json`;
  a.click();
  showToast('💾 Đã tải file backup về máy!');
};

el.inputImportBackup.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.bookmarks) {
        const baseTime = Date.now();
        data.bookmarks.forEach((b, idx) => {
          if (!b.updatedAt) {
            if (b.chapters && b.chapters[0] && b.chapters[0].time) {
              b.updatedAt = parseVietnameseTime(b.chapters[0].time);
            }
            if (!b.updatedAt) {
              b.updatedAt = baseTime - idx * 60000;
            }
          }
        });
        state.bookmarks = data.bookmarks;
      }
      if (data.history) state.history = data.history;
      if (data.readChapters) state.readChapters = data.readChapters;

      localStorage.setItem('mf_bookmarks', JSON.stringify(state.bookmarks));
      localStorage.setItem('mf_history', JSON.stringify(state.history));
      localStorage.setItem('mf_read_chapters', JSON.stringify(state.readChapters));

      updateBookmarkBadge();
      renderBookmarks();
      showToast('📥 Phục hồi dữ liệu thành công!');
    } catch (err) {
      showToast('Lỗi đọc file backup JSON!');
    }
  };
  reader.readAsText(file);
};

// ==================== Event Listeners ====================

// Logo Click -> Home
el.logoLink.onclick = (e) => {
  e.preventDefault();
  navigateTo('#home');
};

// Global Back Button
el.btnBackGlobal.onclick = () => {
  if (state.currentView === 'reader') {
    if (state.readingComicSlug) {
      navigateTo(`#comic/${encodeURIComponent(state.readingComicSlug)}`);
    } else {
      navigateTo('#home');
    }
  } else {
    navigateTo('#home');
  }
};

el.btnReaderBack.onclick = () => {
  if (state.readingComicSlug) {
    navigateTo(`#comic/${encodeURIComponent(state.readingComicSlug)}`);
  } else {
    navigateTo('#home');
  }
};

// Search trigger
el.searchBtn.onclick = () => {
  const q = el.searchInput.value.trim();
  if (q) navigateTo(`#search/${encodeURIComponent(q)}`);
};
el.searchInput.onkeydown = (e) => {
  if (e.key === 'Enter') {
    const q = el.searchInput.value.trim();
    if (q) navigateTo(`#search/${encodeURIComponent(q)}`);
  }
};
el.searchClearBtn.onclick = () => {
  el.searchInput.value = '';
  el.searchClearBtn.classList.add('hidden');
  el.searchDropdown.classList.add('hidden');
  el.searchInput.focus();
};

// Nav Tabs (Desktop Header)
el.navBtns.forEach(btn => {
  const tab = btn.dataset.tab;
  if (!tab) return; // Do NOT overwrite buttons without data-tab (#btn-open-genres-modal, #btn-random-manga)
  btn.onclick = () => {
    navigateTo(`#${tab}`);
  };
});

// Explicitly bind Laptop & Desktop Genres Modal Button
if (el.btnOpenGenresModal) {
  el.btnOpenGenresModal.onclick = (e) => {
    e.stopPropagation();
    el.genresModalBackdrop.classList.remove('hidden');
  };
}

// Category Chips
el.filterChips.forEach(chip => {
  chip.onclick = () => {
    const sort = chip.dataset.sort;
    const genre = chip.dataset.genre;
    const status = chip.dataset.status;

    if (genre) {
      navigateTo(`#genre/${encodeURIComponent(genre)}`);
    } else if (status) {
      navigateTo(`#home?status=${status}`);
    } else if (sort && sort !== '0') {
      navigateTo(`#home?sort=${sort}`);
    } else {
      navigateTo('#home');
    }
  };
});

// Pagination
function changePage(delta) {
  if (state.searchKeyword) {
    const targetPage = Math.max(1, (state.searchPage || 1) + delta);
    navigateTo(`#search/${encodeURIComponent(state.searchKeyword)}?page=${targetPage}`);
  } else if (state.homeGenre) {
    const targetPage = Math.max(1, (state.homePage || 1) + delta);
    navigateTo(`#genre/${encodeURIComponent(state.homeGenre)}?page=${targetPage}`);
  } else {
    const targetPage = Math.max(1, (state.homePage || 1) + delta);
    let hash = `#home?page=${targetPage}`;
    if (state.homeSort) hash += `&sort=${state.homeSort}`;
    if (state.homeStatus) hash += `&status=${state.homeStatus}`;
    navigateTo(hash);
  }

  // Smooth scroll back up to the top of the comic grid
  const scrollAnchor = document.querySelector('.category-chips-wrapper') || el.homeSectionTitle || el.comicsGrid;
  if (scrollAnchor) {
    const topOffset = scrollAnchor.getBoundingClientRect().top + window.pageYOffset - 70;
    window.scrollTo({ top: Math.max(0, topOffset), behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

el.btnPrevPage.onclick = () => changePage(-1);
el.btnNextPage.onclick = () => changePage(1);

// Detail Favorite Toggle
el.btnFavoriteToggle.onclick = () => {
  if (!state.currentComic) return;
  toggleFavorite(state.currentComic);
  const isFav = state.bookmarks.some(b => b.slug === state.currentComic.slug);
  updateFavoriteButtonState(isFav);
};

// Chapter filter in Detail
el.chapterSearchInput.oninput = (e) => {
  renderChapterButtons(e.target.value);
};

// Chapter Sort toggle
el.btnSortChapters.onclick = () => {
  state.chapterSortAsc = !state.chapterSortAsc;
  el.sortOrderText.textContent = state.chapterSortAsc ? 'Cũ nhất' : 'Mới nhất';
  renderChapterButtons(el.chapterSearchInput.value);
};

// Reader Width Modes
el.btnWidthModes.forEach(btn => {
  btn.onclick = () => {
    el.btnWidthModes.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    el.readerImagesContainer.style.maxWidth = btn.dataset.width;
  };
});

// Fullscreen Toggle
el.btnFullscreen.onclick = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(console.error);
  } else {
    document.exitFullscreen().catch(console.error);
  }
};

// Scroll Top Button
if (el.btnScrollTop) {
  el.btnScrollTop.onclick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
}

// Clear Bookmarks & History
el.btnClearBookmarks.onclick = () => {
  if (confirm('Bạn có chắc muốn xóa tất cả truyện yêu thích?')) {
    state.bookmarks = [];
    localStorage.setItem('mf_bookmarks', '[]');
    updateBookmarkBadge();
    renderBookmarks();
  }
};

el.btnClearHistory.onclick = () => {
  if (confirm('Bạn có chắc muốn xóa toàn bộ lịch sử đọc?')) {
    state.history = [];
    localStorage.setItem('mf_history', '[]');
    renderHistory();
  }
};

// Scroll Progress Tracker & Reader Toolbar auto-hide
let lastScrollY = window.scrollY;
window.addEventListener('scroll', () => {
  if (state.currentView === 'reader') {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
    el.readProgressBar.style.width = `${progress}%`;

    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > 150) {
      el.readerToolbar.style.transform = 'translateY(-100%)';
    } else {
      el.readerToolbar.style.transform = 'translateY(0)';
    }
    lastScrollY = currentScrollY;
  }
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (state.currentView === 'reader') {
    if (e.code === 'Space') {
      e.preventDefault();
      toggleAutoScroll();
    } else if (e.key === 'ArrowLeft') {
      if (state.readMode === 'paged') {
        el.pagedPrevBtn.click();
      } else if (!el.btnReaderPrev.disabled) {
        el.btnReaderPrev.click();
      }
    } else if (e.key === 'ArrowRight') {
      if (state.readMode === 'paged') {
        el.pagedNextBtn.click();
      } else if (!el.btnReaderNext.disabled) {
        el.btnReaderNext.click();
      }
    } else if (e.key === 'f' || e.key === 'F') {
      el.btnFullscreen.click();
    } else if (e.key === 'Escape') {
      el.btnReaderBack.click();
    }
  }
});

// Mobile Bottom Navigation Bar listeners
document.querySelectorAll('.mobile-bottom-nav .m-nav-item').forEach(btn => {
  btn.onclick = () => {
    const tab = btn.dataset.tab;
    if (tab) {
      navigateTo(`#${tab}`);
    }
  };
});
const btnMGenres = document.getElementById('btn-m-genres');
if (btnMGenres) btnMGenres.onclick = () => el.genresModalBackdrop.classList.remove('hidden');
const btnMRandom = document.getElementById('btn-m-random');
if (btnMRandom) btnMRandom.onclick = () => el.btnRandomManga.click();

// Drag-to-scroll on horizontal filter chip strip (mouse friendly for PC/Laptop)
const filterScrollEl = document.querySelector('.filter-scroll');
if (filterScrollEl) {
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let hasDragged = false;

  filterScrollEl.addEventListener('mousedown', (e) => {
    isDown = true;
    hasDragged = false;
    startX = e.pageX - filterScrollEl.offsetLeft;
    scrollLeft = filterScrollEl.scrollLeft;
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
    setTimeout(() => { hasDragged = false; }, 60);
  });

  filterScrollEl.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const x = e.pageX - filterScrollEl.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 5) {
      hasDragged = true;
      e.preventDefault();
      filterScrollEl.scrollLeft = scrollLeft - walk;
    }
  });

  // If user was dragging horizontally, suppress chip click
  filterScrollEl.addEventListener('click', (e) => {
    if (hasDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

// Tap on reader canvas to toggle toolbar on mobile
el.readerCanvas.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 && !e.target.closest('.paged-nav-btn') && !e.target.closest('.paged-controls-bar')) {
    const isHidden = el.readerToolbar.style.transform === 'translateY(-100%)';
    el.readerToolbar.style.transform = isHidden ? 'translateY(0)' : 'translateY(-100%)';
  }
});

// ==================== SPA Hash Router ====================

function navigateTo(hash) {
  if (window.location.hash === hash) {
    handleRoute();
  } else {
    window.location.hash = hash;
  }
}

let isHandlingRoute = false;
async function handleRoute() {
  if (isHandlingRoute) return;
  isHandlingRoute = true;
  try {
    const rawHash = (window.location.hash || '').replace(/^#\/?/, '');

    if (rawHash.startsWith('read/')) {
      const parts = rawHash.slice(5).split('/');
      const comicSlug = decodeURIComponent(parts[0] || '');
      const chapterSlug = decodeURIComponent(parts.slice(1).join('/') || '');
      if (comicSlug && chapterSlug) {
        await _loadChapter(comicSlug, chapterSlug);
        return;
      }
    }

    if (rawHash.startsWith('comic/')) {
      const comicSlug = decodeURIComponent(rawHash.slice(6));
      if (comicSlug) {
        await _loadComicDetail(comicSlug);
        return;
      }
    }

    if (rawHash.startsWith('genre/')) {
      const rest = rawHash.slice(6);
      const qIdx = rest.indexOf('?');
      let genreSlug = rest;
      let page = 1;
      if (qIdx !== -1) {
        genreSlug = rest.slice(0, qIdx);
        const params = new URLSearchParams(rest.slice(qIdx + 1));
        page = parseInt(params.get('page') || '1', 10);
      }
      genreSlug = decodeURIComponent(genreSlug);
      if (genreSlug) {
        _loadGenreView(genreSlug, page);
        return;
      }
    }

    if (rawHash.startsWith('search/')) {
      const rest = rawHash.slice(7);
      const qIdx = rest.indexOf('?');
      let keyword = rest;
      let page = 1;
      if (qIdx !== -1) {
        keyword = rest.slice(0, qIdx);
        const params = new URLSearchParams(rest.slice(qIdx + 1));
        page = parseInt(params.get('page') || '1', 10);
      }
      keyword = decodeURIComponent(keyword);
      if (keyword) {
        _loadSearchView(keyword, page);
        return;
      }
    }

    if (rawHash === 'bookmarks') {
      switchView('bookmarks');
      renderBookmarks();
      return;
    }

    if (rawHash === 'history') {
      switchView('history');
      renderHistory();
      return;
    }

    // Default or #home or #home?...
    const queryIdx = rawHash.indexOf('?');
    const searchParamsStr = queryIdx !== -1 ? rawHash.slice(queryIdx + 1) : '';
    _loadHomeView(searchParamsStr);

  } finally {
    isHandlingRoute = false;
  }
}

function _loadGenreView(genreSlug, page = 1) {
  el.filterChips.forEach(c => {
    if (c.dataset.genre === genreSlug) {
      c.classList.add('active');
      c.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    } else {
      c.classList.remove('active');
    }
  });
  switchView('home');
  loadHome(page, 0, genreSlug);
}

function _loadSearchView(keyword, page = 1) {
  el.filterChips.forEach(c => c.classList.remove('active'));
  el.searchInput.value = keyword;
  handleSearch(keyword, page);
}

function _loadHomeView(searchParamsStr = '') {
  const params = new URLSearchParams(searchParamsStr);
  const sort = parseInt(params.get('sort') || '0', 10);
  const status = parseInt(params.get('status') || '0', 10);
  const page = parseInt(params.get('page') || '1', 10);

  el.filterChips.forEach(c => {
    if (status && c.dataset.status == status) {
      c.classList.add('active');
    } else if (sort && c.dataset.sort == sort) {
      c.classList.add('active');
    } else if (!status && !sort && c.dataset.sort === '0') {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });

  switchView('home');
  loadHome(page, sort, '', status);
}


if (el.selectBookmarkSort) {
  el.selectBookmarkSort.onchange = (e) => {
    state.bookmarkSort = e.target.value;
    localStorage.setItem('mf_bookmark_sort', state.bookmarkSort);
    renderBookmarks();
  };
}

// Initialize
updateBookmarkBadge();
setupGenresModal();
window.addEventListener('hashchange', handleRoute);
handleRoute();

// Prevent accidental pinch-zoom & double-tap auto zoom on mobile touch
document.addEventListener('gesturestart', (e) => { e.preventDefault(); }, { passive: false });
document.addEventListener('gesturechange', (e) => { e.preventDefault(); }, { passive: false });
document.addEventListener('gestureend', (e) => { e.preventDefault(); }, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (event) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    if (!event.target.closest('button, .chapter-btn, a, input, select, textarea, .genre-chip, .comic-card, .btn-icon')) {
      event.preventDefault();
    }
  }
  lastTouchEnd = now;
}, { passive: false });
