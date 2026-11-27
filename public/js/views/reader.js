/**
 * Minimal, Smooth 60/120fps Reader View:
 * - Zero-loop Back & replaceState chapter transitions
 * - Clean Tap vs Scroll/Drag gesture recognition (no accidental HUD flicker)
 * - No content-visibility thrashing or scroll-time ResizeObserver/localStorage blocking
 * - 6 concurrent image streams with generous lookahead
 */
import { fetchApi, hasCachedApi } from '../api.js';
import {
  state,
  isBookmarked,
  toggleFavorite,
  markChapterAsRead,
  saveReadingProgress,
  getReadingProgress,
  addToHistory,
  updateHistoryCover,
  saveReaderSettings,
  syncSingleBookmarkFromComic
} from '../state.js';
import { debounce, getProxyImageUrl, showToast } from '../utils.js';
import { ICONS } from '../icons.js';
import { navigateTo, goBackFromReader, switchView } from '../router.js';

const MAX_CONCURRENT_IMAGES = 6;
const DRAWER_CHUNK_SIZE = 100;

let hudVisible = true;
let isAutoScrolling = false;
let autoScrollRaf = null;
let autoScrollLastTs = 0;
let autoScrollAcc = 0;

let webtoonLoadObserver = null;
let webtoonTrackObserver = null;
let cachedDocScrollable = 1;
let scrollRafPending = false;
let lastScrollY = 0;
let downwardScrollAcc = 0;
let idleSaveTimer = null;

let currentImages = [];
let currentPageIndex = 0;
let nextChapterPrefetched = false;
let activeLoadToken = 0;
let drawerChunkIndex = 0;
const preloadedUrls = new Map(); // url -> Image

// ==================== Settings & Theme ====================

export function applyReaderSettings() {
  const s = state.readerSettings;
  document.documentElement.style.setProperty('--reader-max-width', s.width || '840px');
  document.documentElement.style.setProperty('--reader-gap', s.gap || '0px');

  document.body.classList.remove('theme-dark', 'theme-oled', 'theme-sepia');
  document.body.classList.add(`theme-${s.theme || 'dark'}`);

  const dimmer = document.getElementById('reader-dimmer');
  if (dimmer) {
    const b = Math.max(40, Math.min(100, Number(s.brightness || 100)));
    dimmer.style.opacity = String((100 - b) / 100);
  }

  syncSettingsSheetUI();
}

function syncSettingsSheetUI() {
  const s = state.readerSettings;
  document.querySelectorAll('[data-setting-mode]').forEach((b) => {
    b.classList.toggle('active', b.dataset.settingMode === s.mode);
  });
  document.querySelectorAll('[data-setting-dir]').forEach((b) => {
    b.classList.toggle('active', b.dataset.settingDir === s.direction);
  });
  document.querySelectorAll('[data-setting-width]').forEach((b) => {
    b.classList.toggle('active', b.dataset.settingWidth === s.width);
  });
  document.querySelectorAll('[data-setting-gap]').forEach((b) => {
    b.classList.toggle('active', b.dataset.settingGap === s.gap);
  });
  document.querySelectorAll('[data-setting-theme]').forEach((b) => {
    b.classList.toggle('active', b.dataset.settingTheme === s.theme);
  });

  const dirGroup = document.getElementById('setting-dir-group');
  if (dirGroup) {
    dirGroup.classList.toggle('hidden', s.mode !== 'paged');
  }

  const brightSlider = document.getElementById('setting-brightness');
  const brightVal = document.getElementById('setting-brightness-val');
  if (brightSlider) brightSlider.value = String(s.brightness || 100);
  if (brightVal) brightVal.textContent = `${s.brightness || 100}%`;

  const speedSlider = document.getElementById('setting-autoscroll-speed');
  const speedVal = document.getElementById('setting-autoscroll-val');
  if (speedSlider) speedSlider.value = String(s.autoScrollSpeed || 90);
  if (speedVal) speedVal.textContent = `${s.autoScrollSpeed || 90} px/s`;
}

// ==================== HUD & Idle Persistence ====================

function syncHudPageDisplay() {
  const total = currentImages.length;
  const counter = document.getElementById('reader-page-counter');
  const scrubber = document.getElementById('reader-hud-scrubber');

  if (counter) counter.textContent = `${total > 0 ? currentPageIndex + 1 : 0} / ${total}`;
  if (scrubber) {
    scrubber.max = String(Math.max(1, total));
    scrubber.value = String(Math.min(total || 1, currentPageIndex + 1));
  }
}

function setHudVisible(visible) {
  hudVisible = visible;
  downwardScrollAcc = 0;
  const topBar = document.getElementById('reader-top-bar');
  const bottomBar = document.getElementById('reader-bottom-bar');
  if (visible) syncHudPageDisplay();
  topBar?.classList.toggle('hud-hidden', !visible);
  bottomBar?.classList.toggle('hud-hidden', !visible);
}

function toggleHud() {
  setHudVisible(!hudVisible);
}

function measureScrollableHeight() {
  cachedDocScrollable = Math.max(
    1,
    document.documentElement.scrollHeight - window.innerHeight
  );
  updateProgressBar();
}

const scheduleMeasureHeight = debounce(() => {
  if (state.currentView === 'reader') {
    requestAnimationFrame(measureScrollableHeight);
  }
}, 150);

function updateProgressBar() {
  const bar = document.getElementById('read-progress-bar');
  if (!bar) return;
  if (state.currentView !== 'reader') {
    bar.style.transform = 'scaleX(0)';
    return;
  }

  if (state.readerSettings.mode === 'paged') {
    const ratio = currentImages.length > 0 ? (currentPageIndex + 1) / currentImages.length : 0;
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
    return;
  }

  const ratio = cachedDocScrollable > 0 ? window.scrollY / cachedDocScrollable : 0;
  bar.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
}

function scheduleIdleProgressSave() {
  clearTimeout(idleSaveTimer);
  idleSaveTimer = setTimeout(() => {
    persistCurrentProgress();
  }, 2000);
}

function updatePageIndex(index) {
  currentPageIndex = Math.max(0, Math.min(index, Math.max(0, currentImages.length - 1)));
  if (hudVisible) {
    syncHudPageDisplay();
  }
  if (state.readerSettings.mode === 'paged') {
    updateProgressBar();
  }
  maybePrefetchNextChapter();
  scheduleIdleProgressSave();
}

function persistCurrentProgress() {
  clearTimeout(idleSaveTimer);
  if (state.currentView !== 'reader' || !state.readingComicSlug || !state.readingChapterSlug) return;
  const total = currentImages.length;
  if (!total) return;

  const scrollRatio = cachedDocScrollable > 0 ? window.scrollY / cachedDocScrollable : 0;
  saveReadingProgress(state.readingComicSlug, {
    chapterSlug: state.readingChapterSlug,
    chapterTitle: state.readingChapterData?.chapterTitle || state.readingChapterSlug,
    pageIndex: currentPageIndex,
    totalPages: total,
    scrollRatio
  });
}

// ==================== Smart Next-Chapter Prefetch ====================

function maybePrefetchNextChapter() {
  if (nextChapterPrefetched) return;
  if (!currentImages.length || !state.readingChapterData?.nextChapterSlug) return;
  if (navigator.connection?.saveData) return;

  const progressRatio = (currentPageIndex + 1) / currentImages.length;
  if (progressRatio < 0.7) return;

  nextChapterPrefetched = true;
  const slug = state.readingComicSlug;
  const nextSlug = state.readingChapterData.nextChapterSlug;

  fetchApi('chapter', { slug, chapter: nextSlug }, { ttlMs: 1800000 })
    .then((nextData) => {
      if (nextData?.images?.length) {
        nextData.images.slice(0, 3).forEach((rawUrl) => {
          const proxied = getProxyImageUrl(rawUrl);
          if (!preloadedUrls.has(proxied)) {
            const img = new Image();
            img.decoding = 'async';
            img.src = proxied;
            preloadedUrls.set(proxied, img);
          }
        });
      }
    })
    .catch(() => {});
}

// ==================== Webtoon Concurrency-Limited Preloader ====================

function disconnectObservers() {
  if (webtoonLoadObserver) {
    webtoonLoadObserver.disconnect();
    webtoonLoadObserver = null;
  }
  if (webtoonTrackObserver) {
    webtoonTrackObserver.disconnect();
    webtoonTrackObserver = null;
  }
}

function renderWebtoonPages(images, token) {
  const container = document.getElementById('reader-images-container');
  if (!container) return;

  disconnectObservers();
  container.innerHTML = '';

  const queue = [];
  const queuedSet = new Set();
  let activeCount = 0;

  function loadImageElement(wrapper, img, rawUrl, attempt = 0) {
    return new Promise((resolve) => {
      if (token !== activeLoadToken) {
        resolve();
        return;
      }

      const proxied = getProxyImageUrl(rawUrl);
      const src =
        attempt === 0
          ? proxied
          : attempt === 1
            ? `${proxied}${proxied.includes('?') ? '&' : '?'}retry=1`
            : rawUrl;

      img.onload = () => {
        wrapper.classList.remove('is-loading');
        wrapper.querySelector('.reader-page-error')?.remove();
        img.classList.remove('hidden');
        scheduleMeasureHeight();
        resolve();
      };

      img.onerror = () => {
        if (token !== activeLoadToken) {
          resolve();
          return;
        }
        if (attempt < 2) {
          loadImageElement(wrapper, img, rawUrl, attempt + 1).then(resolve);
          return;
        }
        wrapper.classList.remove('is-loading');
        img.classList.add('hidden');
        if (!wrapper.querySelector('.reader-page-error')) {
          const errBox = document.createElement('div');
          errBox.className = 'reader-page-error';
          const label = document.createElement('span');
          label.textContent = `Không tải được trang ${Number(wrapper.dataset.index) + 1}`;
          const retryBtn = document.createElement('button');
          retryBtn.className = 'btn btn-sm btn-primary';
          retryBtn.innerHTML = `${ICONS.refresh(14)}<span>Tải lại</span>`;
          retryBtn.onclick = (e) => {
            e.stopPropagation();
            errBox.remove();
            wrapper.classList.add('is-loading');
            loadImageElement(wrapper, img, rawUrl, 0);
          };
          errBox.appendChild(label);
          errBox.appendChild(retryBtn);
          wrapper.appendChild(errBox);
        }
        scheduleMeasureHeight();
        resolve();
      };

      img.src = src;
    });
  }

  function pumpQueue() {
    while (activeCount < MAX_CONCURRENT_IMAGES && queue.length > 0) {
      const task = queue.shift();
      if (!task || task.wrapper.dataset.loaded === '1') continue;
      task.wrapper.dataset.loaded = '1';
      activeCount++;
      loadImageElement(task.wrapper, task.img, task.rawUrl, 0).finally(() => {
        activeCount--;
        pumpQueue();
      });
    }
  }

  function enqueueWrapper(wrapper) {
    if (wrapper.dataset.loaded === '1' || queuedSet.has(wrapper)) return;
    const idx = Number(wrapper.dataset.index);
    const img = wrapper.querySelector('img');
    const rawUrl = images[idx];
    if (!img || !rawUrl) return;

    queuedSet.add(wrapper);
    queue.push({ wrapper, img, rawUrl });
    pumpQueue();
  }

  const frag = document.createDocumentFragment();
  const wrappers = [];

  images.forEach((_, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'reader-page-wrapper is-loading';
    wrapper.dataset.index = String(idx);
    wrapper.dataset.pageLabel = `${idx + 1} / ${images.length}`;

    const img = document.createElement('img');
    img.className = 'reader-page-img';
    img.alt = `Trang ${idx + 1}`;
    img.decoding = 'async';
    if (idx < 4) img.setAttribute('fetchpriority', 'high');

    const badge = document.createElement('span');
    badge.className = 'page-num-badge';
    badge.textContent = `${idx + 1} / ${images.length}`;

    wrapper.appendChild(img);
    wrapper.appendChild(badge);
    frag.appendChild(wrapper);
    wrappers.push(wrapper);
  });

  container.appendChild(frag);

  webtoonLoadObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          enqueueWrapper(entry.target);
          webtoonLoadObserver?.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '2400px 0px' }
  );

  webtoonTrackObserver = new IntersectionObserver(
    (entries) => {
      let bestIdx = null;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const idx = Number(entry.target.dataset.index);
          if (bestIdx === null || idx < bestIdx) bestIdx = idx;
        }
      }
      if (bestIdx !== null) {
        updatePageIndex(bestIdx);
      }
    },
    { threshold: 0.15 }
  );

  wrappers.forEach((w, idx) => {
    if (idx < 5) enqueueWrapper(w);
    else webtoonLoadObserver.observe(w);
    webtoonTrackObserver.observe(w);
  });

  requestAnimationFrame(measureScrollableHeight);
}

// ==================== Paged Mode ====================

function preloadAdjacentPagedImages(idx) {
  const targets = [idx + 1, idx + 2, idx - 1];
  for (const t of targets) {
    if (t >= 0 && t < currentImages.length) {
      const url = getProxyImageUrl(currentImages[t]);
      if (!preloadedUrls.has(url)) {
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        preloadedUrls.set(url, img);
      }
    }
  }
  if (preloadedUrls.size > 40) {
    const first = preloadedUrls.keys().next().value;
    if (first) preloadedUrls.delete(first);
  }
}

function renderPagedPage(index) {
  const imgEl = document.getElementById('paged-current-img');
  const errEl = document.getElementById('paged-page-error');
  const retryBtn = document.getElementById('paged-retry-btn');
  const prevBtn = document.getElementById('paged-prev-btn');
  const nextBtn = document.getElementById('paged-next-btn');

  if (!imgEl || !currentImages.length) return;
  const safeIdx = Math.max(0, Math.min(index, currentImages.length - 1));
  updatePageIndex(safeIdx);

  const rawUrl = currentImages[safeIdx];
  const proxied = getProxyImageUrl(rawUrl);

  errEl?.classList.add('hidden');
  imgEl.classList.remove('hidden');

  let attempt = 0;
  const tryLoad = () => {
    imgEl.src =
      attempt === 0
        ? proxied
        : attempt === 1
          ? `${proxied}${proxied.includes('?') ? '&' : '?'}retry=1`
          : rawUrl;
  };

  imgEl.onload = () => {
    errEl?.classList.add('hidden');
    imgEl.classList.remove('hidden');
  };

  imgEl.onerror = () => {
    if (attempt < 2) {
      attempt++;
      tryLoad();
    } else {
      imgEl.classList.add('hidden');
      errEl?.classList.remove('hidden');
    }
  };

  if (retryBtn) {
    retryBtn.onclick = (e) => {
      e.stopPropagation();
      attempt = 0;
      errEl?.classList.add('hidden');
      imgEl.classList.remove('hidden');
      tryLoad();
    };
  }

  tryLoad();
  preloadAdjacentPagedImages(safeIdx);

  if (prevBtn) prevBtn.style.opacity = safeIdx > 0 ? '0.85' : '0.25';
  if (nextBtn) nextBtn.style.opacity = safeIdx < currentImages.length - 1 ? '0.85' : '0.25';
}

function goToChapter(slug, chapSlug) {
  if (!slug || !chapSlug) return;
  persistCurrentProgress();
  // Always replace history entry when switching chapters inside Reader (zero history bloat / zero loop!)
  navigateTo(`#read/${encodeURIComponent(slug)}/${encodeURIComponent(chapSlug)}`, {
    replace: true
  });
}

function stepPaged(delta) {
  if (!currentImages.length) return;
  const target = currentPageIndex + delta;
  if (target >= 0 && target < currentImages.length) {
    renderPagedPage(target);
  } else if (target >= currentImages.length && state.readingChapterData?.nextChapterSlug) {
    goToChapter(state.readingComicSlug, state.readingChapterData.nextChapterSlug);
  } else if (target < 0 && state.readingChapterData?.prevChapterSlug) {
    goToChapter(state.readingComicSlug, state.readingChapterData.prevChapterSlug);
  }
}

function applyReadModeLayout(restoreTargetIdx = null) {
  const webtoonEl = document.getElementById('reader-images-container');
  const pagedEl = document.getElementById('paged-reader-container');
  const isPaged = state.readerSettings.mode === 'paged';

  if (isPaged) {
    stopAutoScroll();
    webtoonEl?.classList.add('hidden');
    pagedEl?.classList.remove('hidden');
    renderPagedPage(restoreTargetIdx !== null ? restoreTargetIdx : currentPageIndex);
  } else {
    pagedEl?.classList.add('hidden');
    webtoonEl?.classList.remove('hidden');
    if (webtoonEl && webtoonEl.children.length === 0 && currentImages.length > 0) {
      renderWebtoonPages(currentImages, activeLoadToken);
    }
    if (restoreTargetIdx !== null && restoreTargetIdx > 0) {
      jumpToWebtoonPage(restoreTargetIdx);
    }
  }
  syncSettingsSheetUI();
}

function jumpToWebtoonPage(pageIdx) {
  const container = document.getElementById('reader-images-container');
  const target = container?.querySelector(`.reader-page-wrapper[data-index="${pageIdx}"]`);
  if (target) {
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
    updatePageIndex(pageIdx);
  }
}

// ==================== Smooth deltaTime Auto-Scroll ====================

function updateAutoScrollBtnUI(active) {
  const hudBtn = document.getElementById('btn-hud-autoscroll');
  if (hudBtn) {
    hudBtn.classList.toggle('active', active);
    const iconSlot = hudBtn.querySelector('.hud-autoscroll-icon');
    const textSlot = hudBtn.querySelector('.hud-label-hide-sm');
    if (iconSlot) iconSlot.innerHTML = active ? ICONS.pause(15) : ICONS.play(15);
    if (textSlot) textSlot.textContent = active ? 'Dừng' : 'Tự cuộn';
  }
  const toggleBtn = document.getElementById('setting-autoscroll-toggle');
  if (toggleBtn) toggleBtn.textContent = active ? 'Dừng' : 'Bật';
}

export function stopAutoScroll() {
  isAutoScrolling = false;
  if (autoScrollRaf) {
    cancelAnimationFrame(autoScrollRaf);
    autoScrollRaf = null;
  }
  autoScrollLastTs = 0;
  autoScrollAcc = 0;
  updateAutoScrollBtnUI(false);
}

export function startAutoScroll() {
  if (state.readerSettings.mode === 'paged') {
    showToast('Tự động cuộn chỉ dùng trong chế độ Cuộn dọc.');
    return;
  }
  isAutoScrolling = true;
  autoScrollLastTs = 0;
  autoScrollAcc = 0;
  updateAutoScrollBtnUI(true);
  if (hudVisible) setHudVisible(false);

  function tick(ts) {
    if (!isAutoScrolling) return;
    if (!autoScrollLastTs) autoScrollLastTs = ts;
    const dt = Math.min((ts - autoScrollLastTs) / 1000, 0.1);
    autoScrollLastTs = ts;

    const speed = Number(state.readerSettings.autoScrollSpeed || 90);
    autoScrollAcc += speed * dt;
    const wholePx = Math.floor(autoScrollAcc);
    if (wholePx >= 1) {
      autoScrollAcc -= wholePx;
      window.scrollBy(0, wholePx);
    }

    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24) {
      stopAutoScroll();
      return;
    }
    autoScrollRaf = requestAnimationFrame(tick);
  }

  autoScrollRaf = requestAnimationFrame(tick);
}

export function toggleAutoScroll() {
  if (isAutoScrolling) stopAutoScroll();
  else startAutoScroll();
}

// ==================== Chapter Navigation & Chunked Drawer ====================

function bindChapterNavButtons(slug, prevSlug, nextSlug) {
  const prevBtns = [
    document.getElementById('btn-hud-prev'),
    document.getElementById('btn-bottom-prev')
  ];
  const nextBtns = [
    document.getElementById('btn-hud-next'),
    document.getElementById('btn-bottom-next')
  ];

  prevBtns.forEach((btn) => {
    if (!btn) return;
    btn.disabled = !prevSlug;
    btn.onclick = prevSlug ? () => goToChapter(slug, prevSlug) : null;
  });

  nextBtns.forEach((btn) => {
    if (!btn) return;
    btn.disabled = !nextSlug;
    btn.onclick = nextSlug ? () => goToChapter(slug, nextSlug) : null;
  });
}

function renderDrawerChapters(slug, currentChapterSlug, filterText = '') {
  const listEl = document.getElementById('drawer-chap-list');
  const chunksBar = document.getElementById('drawer-chunks-bar');
  if (!listEl) return;

  const chapters = state.chaptersList || [];
  const q = filterText.trim().toLowerCase();
  const filtered = q
    ? chapters.filter((ch) => (ch.name || '').toLowerCase().includes(q))
    : chapters;

  listEl.innerHTML = '';
  if (!filtered.length) {
    chunksBar?.classList.add('hidden');
    listEl.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:16px;">Không tìm thấy chương</div>';
    return;
  }

  let slice = filtered;
  if (!q && filtered.length > DRAWER_CHUNK_SIZE) {
    const numChunks = Math.ceil(filtered.length / DRAWER_CHUNK_SIZE);
    if (drawerChunkIndex >= numChunks) drawerChunkIndex = 0;

    chunksBar.classList.remove('hidden');
    chunksBar.innerHTML = '';
    const cFrag = document.createDocumentFragment();
    for (let i = 0; i < numChunks; i++) {
      const start = i * DRAWER_CHUNK_SIZE + 1;
      const end = Math.min((i + 1) * DRAWER_CHUNK_SIZE, filtered.length);
      const btn = document.createElement('button');
      btn.className = `chunk-tab-btn ${i === drawerChunkIndex ? 'active' : ''}`;
      btn.dataset.chunk = String(i);
      btn.textContent = `${start}–${end}`;
      cFrag.appendChild(btn);
    }
    chunksBar.appendChild(cFrag);

    const start = drawerChunkIndex * DRAWER_CHUNK_SIZE;
    slice = filtered.slice(start, start + DRAWER_CHUNK_SIZE);
  } else {
    chunksBar?.classList.add('hidden');
  }

  const readSet = new Set(state.readChapters[slug] || []);
  const frag = document.createDocumentFragment();
  for (const ch of slice) {
    const item = document.createElement('div');
    const isActive = ch.chapterSlug === currentChapterSlug;
    const isRead = readSet.has(ch.chapterSlug);
    item.className = `drawer-item${isActive ? ' active' : ''}${isRead ? ' is-read' : ''}`;
    item.dataset.chap = ch.chapterSlug;
    item.textContent = ch.name;
    frag.appendChild(item);
  }
  listEl.appendChild(frag);
}

function updateReaderFavIcon(slug) {
  const fav = isBookmarked(slug);
  const btn = document.getElementById('btn-reader-fav');
  if (btn) {
    btn.innerHTML = ICONS.heart(fav, 18);
    btn.style.color = fav ? 'var(--accent-primary)' : '';
  }
}

// ==================== Main Reader Loader ====================

export async function loadReaderView(slug, chapterSlug, ctx) {
  // Save previous chapter progress before switching chapter inside Reader
  if (state.currentView === 'reader' && state.readingComicSlug) {
    persistCurrentProgress();
  }

  stopAutoScroll();
  applyReaderSettings();
  lastScrollY = 0;
  downwardScrollAcc = 0;
  setHudVisible(true);

  state.readingComicSlug = slug;
  state.readingChapterSlug = chapterSlug;
  currentImages = [];
  currentPageIndex = 0;
  nextChapterPrefetched = false;
  activeLoadToken++;
  const myToken = activeLoadToken;

  switchView('reader', `read/${slug}/${chapterSlug}`);
  window.scrollTo({ top: 0, behavior: 'instant' });

  const loadingEl = document.getElementById('reader-loading');
  const webtoonEl = document.getElementById('reader-images-container');
  const pagedEl = document.getElementById('paged-reader-container');
  const endNavEl = document.getElementById('reader-end-nav');

  const isCached = hasCachedApi('chapter', { slug, chapter: chapterSlug }, 1800000);
  if (!isCached) {
    loadingEl?.classList.remove('hidden');
    if (webtoonEl) webtoonEl.innerHTML = '';
    pagedEl?.classList.add('hidden');
  }
  endNavEl?.classList.add('hidden');
  updateReaderFavIcon(slug);

  try {
    const data = await fetchApi(
      'chapter',
      { slug, chapter: chapterSlug },
      { ttlMs: 1800000, signal: ctx.signal }
    );
    loadingEl?.classList.add('hidden');
    if (ctx.isStale() || myToken !== activeLoadToken) return;

    if (!data || !Array.isArray(data.images) || data.images.length === 0) {
      if (webtoonEl) {
        webtoonEl.classList.remove('hidden');
        webtoonEl.innerHTML = `
          <div style="padding: 40px 20px; text-align: center; color: #ff5277;">
            <p style="margin-bottom: 12px;">Không thể tải hình ảnh chương truyện lúc này.</p>
            <button class="btn btn-primary" id="btn-retry-chapter">${ICONS.refresh(15)}<span>Thử lại</span></button>
          </div>
        `;
        document.getElementById('btn-retry-chapter').onclick = () =>
          loadReaderView(slug, chapterSlug, ctx);
      }
      return;
    }

    state.readingChapterData = data;
    currentImages = data.images;

    const cleanChapTitle = data.chapterTitle || data.currentChapter || chapterSlug;
    document.getElementById('reader-comic-title').textContent = data.comicTitle || slug;
    document.getElementById('reader-chapter-title').textContent = cleanChapTitle;

    bindChapterNavButtons(slug, data.prevChapterSlug, data.nextChapterSlug);
    endNavEl?.classList.remove('hidden');

    const saved = getReadingProgress(slug);
    const resumePage =
      saved && saved.chapterSlug === chapterSlug && saved.pageIndex > 0 && saved.pageIndex < currentImages.length
        ? saved.pageIndex
        : 0;

    if (state.readerSettings.mode === 'paged') {
      if (webtoonEl) webtoonEl.innerHTML = '';
      applyReadModeLayout(resumePage);
    } else {
      renderWebtoonPages(currentImages, myToken);
      applyReadModeLayout(resumePage);
    }

    updatePageIndex(resumePage);
    syncHudPageDisplay();
    if (resumePage > 0) {
      showToast(`Tiếp tục từ trang ${resumePage + 1}`);
    }

    markChapterAsRead(slug, chapterSlug);

    const foundCover =
      (state.currentComic?.slug === slug ? state.currentComic.cover : '') ||
      state.loadedComics.find((c) => c.slug === slug)?.cover ||
      state.bookmarks.find((b) => b.slug === slug)?.cover ||
      state.history.find((h) => h.slug === slug)?.cover ||
      '';

    addToHistory({
      slug,
      title: data.comicTitle || slug,
      chapterSlug,
      chapterTitle: cleanChapTitle,
      cover: foundCover,
      time: new Date().toLocaleString('vi-VN')
    });

    if (state.currentComic?.slug === slug && state.chaptersList?.length > 0) {
      const idx = state.chaptersList.findIndex((c) => c.chapterSlug === chapterSlug);
      drawerChunkIndex = idx >= 0 ? Math.floor(idx / DRAWER_CHUNK_SIZE) : 0;
      renderDrawerChapters(slug, chapterSlug, '');
    } else {
      fetchApi('detail', { slug }, { ttlMs: 300000, signal: ctx.signal })
        .then((detail) => {
          if (ctx.isStale() || !detail?.chapters?.length) return;
          state.currentComic = detail;
          state.chaptersList = detail.chapters;
          syncSingleBookmarkFromComic(detail);

          const idx = state.chaptersList.findIndex((c) => c.chapterSlug === chapterSlug);
          drawerChunkIndex = idx >= 0 ? Math.floor(idx / DRAWER_CHUNK_SIZE) : 0;
          renderDrawerChapters(slug, chapterSlug, '');

          if (idx !== -1) {
            const nextChap = idx > 0 ? state.chaptersList[idx - 1].chapterSlug : '';
            const prevChap = idx < state.chaptersList.length - 1 ? state.chaptersList[idx + 1].chapterSlug : '';
            data.nextChapterSlug = nextChap;
            data.prevChapterSlug = prevChap;
            bindChapterNavButtons(slug, prevChap, nextChap);
          }

          if (detail.cover) {
            updateHistoryCover(slug, detail.cover);
          }
        })
        .catch(() => {});
    }
  } catch (err) {
    loadingEl?.classList.add('hidden');
    if (err.name === 'AbortError' || ctx.isStale()) return;
    showToast('Lỗi tải chương: ' + err.message);
  }
}

export function cleanupReader() {
  stopAutoScroll();
  disconnectObservers();
  persistCurrentProgress();
  document.getElementById('settings-sheet-overlay')?.classList.add('hidden');
  document.getElementById('chapter-drawer-overlay')?.classList.add('hidden');
  const bar = document.getElementById('read-progress-bar');
  if (bar) bar.style.transform = 'scaleX(0)';
}

// ==================== Global Reader Event Bindings ====================

export function initReaderInteractions() {
  applyReaderSettings();

  window.addEventListener('resize', scheduleMeasureHeight, { passive: true });

  // Zero-reflow passive scroll handler with downward threshold & idle-only storage saves
  window.addEventListener(
    'scroll',
    () => {
      if (state.currentView !== 'reader') return;
      scheduleIdleProgressSave();
      if (scrollRafPending) return;
      scrollRafPending = true;

      requestAnimationFrame(() => {
        scrollRafPending = false;
        updateProgressBar();

        if (state.readerSettings.mode !== 'paged') {
          const y = window.scrollY;
          const dy = y - lastScrollY;
          if (dy > 0) {
            downwardScrollAcc += dy;
            if (y > 90 && downwardScrollAcc > 80 && hudVisible) {
              setHudVisible(false);
            }
          } else if (dy < 0) {
            downwardScrollAcc = 0;
            if (y <= 8 && !hudVisible) {
              setHudVisible(true);
            }
          }
          lastScrollY = y;
        }
      });
    },
    { passive: true }
  );

  // Pause auto-scroll when user manually scrolls
  window.addEventListener(
    'wheel',
    () => {
      if (isAutoScrolling) stopAutoScroll();
    },
    { passive: true }
  );
  window.addEventListener(
    'touchmove',
    () => {
      if (isAutoScrolling) stopAutoScroll();
    },
    { passive: true }
  );

  window.addEventListener('pagehide', persistCurrentProgress);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.currentView === 'reader') {
      persistCurrentProgress();
    }
  });

  // Clean Tap vs Scroll/Drag recognizer on Webtoon canvas (prevents accidental HUD triggers during drag)
  const webtoonContainer = document.getElementById('reader-images-container');
  if (webtoonContainer) {
    let tapStartX = 0;
    let tapStartY = 0;
    let tapStartTs = 0;
    let tapCandidate = false;

    webtoonContainer.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) {
        tapCandidate = false;
        return;
      }
      if (e.target.closest('button, a, input, .reader-page-error, .page-num-badge')) {
        tapCandidate = false;
        return;
      }
      tapCandidate = true;
      tapStartX = e.clientX;
      tapStartY = e.clientY;
      tapStartTs = performance.now();
    });

    webtoonContainer.addEventListener('pointermove', (e) => {
      if (!tapCandidate) return;
      if (Math.hypot(e.clientX - tapStartX, e.clientY - tapStartY) > 8) {
        tapCandidate = false;
      }
    });

    webtoonContainer.addEventListener('pointercancel', () => {
      tapCandidate = false;
    });

    webtoonContainer.addEventListener('pointerup', (e) => {
      if (!tapCandidate) return;
      tapCandidate = false;
      const dist = Math.hypot(e.clientX - tapStartX, e.clientY - tapStartY);
      const elapsed = performance.now() - tapStartTs;
      if (dist < 8 && elapsed < 280) {
        if (isAutoScrolling) {
          stopAutoScroll();
          return;
        }
        toggleHud();
      }
    });
  }

  // Paged 3-zone tap & swipe gestures
  const tapLeft = document.getElementById('paged-tap-left');
  const tapCenter = document.getElementById('paged-tap-center');
  const tapRight = document.getElementById('paged-tap-right');
  const pagedPrev = document.getElementById('paged-prev-btn');
  const pagedNext = document.getElementById('paged-next-btn');
  const viewport = document.getElementById('paged-img-viewport');

  const isRtl = () => state.readerSettings.direction === 'rtl';
  tapCenter?.addEventListener('click', toggleHud);
  tapLeft?.addEventListener('click', () => stepPaged(isRtl() ? 1 : -1));
  tapRight?.addEventListener('click', () => stepPaged(isRtl() ? -1 : 1));
  pagedPrev?.addEventListener('click', (e) => {
    e.stopPropagation();
    stepPaged(isRtl() ? 1 : -1);
  });
  pagedNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    stepPaged(isRtl() ? -1 : 1);
  });

  if (viewport) {
    let touchStartX = 0;
    let touchStartY = 0;
    viewport.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      },
      { passive: true }
    );
    viewport.addEventListener(
      'touchend',
      (e) => {
        if (e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx < 0) stepPaged(isRtl() ? -1 : 1);
          else stepPaged(isRtl() ? 1 : -1);
        }
      },
      { passive: true }
    );
  }

  // HUD scrubber
  const scrubber = document.getElementById('reader-hud-scrubber');
  scrubber?.addEventListener('input', (e) => {
    const idx = Math.max(0, (parseInt(e.target.value, 10) || 1) - 1);
    if (state.readerSettings.mode === 'paged') {
      renderPagedPage(idx);
    } else {
      jumpToWebtoonPage(idx);
    }
  });

  // Back button (uses zero-loop hierarchical stack)
  document.getElementById('btn-reader-back')?.addEventListener('click', () => {
    persistCurrentProgress();
    goBackFromReader(state.readingComicSlug);
  });

  document.getElementById('btn-reader-fav')?.addEventListener('click', () => {
    const slug = state.readingComicSlug;
    if (!slug) return;
    const comicObj =
      (state.currentComic?.slug === slug ? state.currentComic : null) || {
        slug,
        title: state.readingChapterData?.comicTitle || slug,
        cover: state.history.find((h) => h.slug === slug)?.cover || ''
      };
    const res = toggleFavorite(comicObj);
    updateReaderFavIcon(slug);
    showToast(res.added ? `Đã theo dõi "${comicObj.title}"` : `Đã bỏ theo dõi "${comicObj.title}"`);
  });

  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  document.getElementById('btn-hud-autoscroll')?.addEventListener('click', toggleAutoScroll);

  // Settings Sheet
  const settingsOverlay = document.getElementById('settings-sheet-overlay');
  const openSettings = () => settingsOverlay?.classList.remove('hidden');
  const closeSettings = () => settingsOverlay?.classList.add('hidden');

  document.getElementById('btn-reader-settings')?.addEventListener('click', openSettings);
  document.getElementById('btn-hud-settings')?.addEventListener('click', openSettings);
  document.getElementById('btn-close-settings')?.addEventListener('click', closeSettings);
  settingsOverlay?.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  settingsOverlay?.addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-setting-mode]');
    if (modeBtn) {
      saveReaderSettings({ mode: modeBtn.dataset.settingMode });
      applyReaderSettings();
      applyReadModeLayout(currentPageIndex);
      return;
    }

    const dirBtn = e.target.closest('[data-setting-dir]');
    if (dirBtn) {
      saveReaderSettings({ direction: dirBtn.dataset.settingDir });
      applyReaderSettings();
      return;
    }

    const widthBtn = e.target.closest('[data-setting-width]');
    if (widthBtn) {
      saveReaderSettings({ width: widthBtn.dataset.settingWidth });
      applyReaderSettings();
      return;
    }

    const gapBtn = e.target.closest('[data-setting-gap]');
    if (gapBtn) {
      saveReaderSettings({ gap: gapBtn.dataset.settingGap });
      applyReaderSettings();
      return;
    }

    const themeBtn = e.target.closest('[data-setting-theme]');
    if (themeBtn) {
      saveReaderSettings({ theme: themeBtn.dataset.settingTheme });
      applyReaderSettings();
    }
  });

  document.getElementById('setting-brightness')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10) || 100;
    saveReaderSettings({ brightness: val });
    applyReaderSettings();
  });

  document.getElementById('setting-autoscroll-speed')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10) || 90;
    saveReaderSettings({ autoScrollSpeed: val });
    syncSettingsSheetUI();
  });

  document.getElementById('setting-autoscroll-toggle')?.addEventListener('click', toggleAutoScroll);

  // Chapter Drawer
  const drawerOverlay = document.getElementById('chapter-drawer-overlay');
  const drawerSearch = document.getElementById('drawer-chap-search');
  const drawerChunks = document.getElementById('drawer-chunks-bar');
  const drawerList = document.getElementById('drawer-chap-list');

  document.getElementById('btn-hud-chapters')?.addEventListener('click', () => {
    drawerOverlay?.classList.remove('hidden');
  });
  document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
    drawerOverlay?.classList.add('hidden');
  });
  drawerOverlay?.addEventListener('click', (e) => {
    if (e.target === drawerOverlay) drawerOverlay.classList.add('hidden');
  });

  drawerSearch?.addEventListener(
    'input',
    debounce((e) => {
      drawerChunkIndex = 0;
      renderDrawerChapters(state.readingComicSlug, state.readingChapterSlug, e.target.value);
    }, 150)
  );

  drawerChunks?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chunk-tab-btn');
    if (!btn) return;
    drawerChunkIndex = parseInt(btn.dataset.chunk || '0', 10) || 0;
    renderDrawerChapters(state.readingComicSlug, state.readingChapterSlug, drawerSearch?.value || '');
  });

  drawerList?.addEventListener('click', (e) => {
    const item = e.target.closest('.drawer-item');
    if (!item?.dataset.chap) return;
    drawerOverlay?.classList.add('hidden');
    goToChapter(state.readingComicSlug, item.dataset.chap);
  });
}

export function handleReaderKeydown(e) {
  if (state.currentView !== 'reader') return;
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;

  const settingsOverlay = document.getElementById('settings-sheet-overlay');
  const drawerOverlay = document.getElementById('chapter-drawer-overlay');

  if (e.key === 'Escape') {
    if (settingsOverlay && !settingsOverlay.classList.contains('hidden')) {
      settingsOverlay.classList.add('hidden');
      return;
    }
    if (drawerOverlay && !drawerOverlay.classList.contains('hidden')) {
      drawerOverlay.classList.add('hidden');
      return;
    }
    document.getElementById('btn-reader-back')?.click();
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (state.readerSettings.mode === 'paged') {
      stepPaged(1);
    } else {
      toggleAutoScroll();
    }
    return;
  }

  if (e.key === 'ArrowLeft') {
    if (state.readerSettings.mode === 'paged') {
      stepPaged(state.readerSettings.direction === 'rtl' ? 1 : -1);
    } else if (state.readingChapterData?.prevChapterSlug) {
      goToChapter(state.readingComicSlug, state.readingChapterData.prevChapterSlug);
    }
    return;
  }

  if (e.key === 'ArrowRight') {
    if (state.readerSettings.mode === 'paged') {
      stepPaged(state.readerSettings.direction === 'rtl' ? -1 : 1);
    } else if (state.readingChapterData?.nextChapterSlug) {
      goToChapter(state.readingComicSlug, state.readingChapterData.nextChapterSlug);
    }
    return;
  }

  if (e.key === 'f' || e.key === 'F') {
    document.getElementById('btn-fullscreen')?.click();
  }
}
