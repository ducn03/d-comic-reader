/**
 * Unified Multi-Source Real-Time Crawler & API Module
 * Primary Source: TruyenQQ (Real-time updates, chapters from minutes ago, no Cloudflare datacenter blocks)
 * Secondary / Fallback Source: NetTruyen / Hinettruyen multi-mirror engine
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TRUYENQQ_BASE = 'https://truyenqq.com.vn';

const NETTRUYEN_MIRRORS = [
  'https://hinettruyen.com',
  'https://gonettruyen.com',
  'https://nettruyenbb.com',
  'https://nettruyentv.me'
];
let activeNetTruyenBase = NETTRUYEN_MIRRORS[0];

const GENRE_MAP = {
  'action': 'action',
  'comedy': 'comedy',
  'drama': 'drama',
  'fantasy': 'fantasy',
  'manga': 'manga',
  'manhwa': 'manhwa',
  'manhua': 'manhua',
  'romance': 'romance',
  'shoujo-ai': 'shoujo-ai',
  'shounen': 'shounen',
  'tragedy': 'tragedy',
  'chuyen-sinh': 'chuyen-sinh',
  'co-dai': 'co-dai',
  'xuyen-khong': 'xuyen-khong',
  'mecha': 'mecha',
  'truyen-mau': 'truyen-mau',
  'webtoon': 'webtoon',
  'martial-arts': 'martial-arts',
  'ngon-tinh': 'ngon-tinh',
  'dam-my': 'dam-my',
  'huyen-huyen': 'huyen-huyen',
  'trong-sinh': 'trong-sinh'
};

// ==================== In-Memory Fast Cache ====================
const memoryCache = new Map();

function getCache(key, ttlSeconds = 180) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > ttlSeconds * 1000) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  if (memoryCache.size > 800) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { time: Date.now(), data });
}

function decodeHtml(html) {
  if (!html) return '';
  return html
    .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function cleanSlug(slug) {
  if (!slug) return '';
  return slug.replace(/-\d+(?:-\d+)*$/, '');
}

// ==================== TruyenQQ Engine ====================

let lastQQRequestTime = 0;
async function fetchQQ(url) {
  const now = Date.now();
  const waitMs = Math.max(0, 350 - (now - lastQQRequestTime));
  lastQQRequestTime = now + waitMs;
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${TRUYENQQ_BASE}/`
      }
    });
    clearTimeout(to);
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return await res.text();
  } catch (err) {
    clearTimeout(to);
    throw err;
  }
}

function parseQQComics(html) {
  const comics = [];
  const seen = new Set();

  // Pattern A: Feed items (Home new updates)
  const patternA = /<div class="item">[\s\S]*?<div class="cover">[\s\S]*?<a href="([^"]+)">[\s\S]*?<img [^>]*src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?<h3 class="name">[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="latest">([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = patternA.exec(html)) !== null) {
    const rawUrl = match[1];
    const rawCover = match[2];
    const rawTitle = match[4];
    const latestBlock = match[5];
    const slug = rawUrl.replace(/^\/+|\.html$/g, '');
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const chapMatches = [...latestBlock.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span class="time">([\s\S]*?)<\/span>/gi)];
    const chapters = chapMatches.map(c => ({
      url: `${TRUYENQQ_BASE}${c[1].startsWith('/') ? c[1] : '/' + c[1]}`,
      chapterSlug: c[1].split('/').pop(),
      title: decodeHtml(c[2]),
      time: decodeHtml(c[3])
    }));

    comics.push({
      title: decodeHtml(rawTitle),
      slug,
      url: `${TRUYENQQ_BASE}${rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl}`,
      cover: rawCover.startsWith('http') ? rawCover : `${TRUYENQQ_BASE}${rawCover}`,
      views: 'Hot',
      chapters
    });
  }

  // Pattern B: Grid & Slider & Top items
  const patternB = /<div class="item">\s*<a href="([^"]+)"[^>]*title="([^"]*)"\s*><img [^>]*src="([^"]+)"[^>]*>\s*<div class="caption">\s*<h3>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
  while ((match = patternB.exec(html)) !== null) {
    const rawUrl = match[1];
    const rawCover = match[3];
    const rawTitle = match[4];
    const chapText = match[5];
    const slug = rawUrl.replace(/^\/+|\.html$/g, '');
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const chapSlug = `chapter-${(chapText.match(/\d+(?:\.\d+)?/)?.[0] || '1')}`;
    comics.push({
      title: decodeHtml(rawTitle),
      slug,
      url: `${TRUYENQQ_BASE}${rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl}`,
      cover: rawCover.startsWith('http') ? rawCover : `${TRUYENQQ_BASE}${rawCover}`,
      views: 'Hot',
      chapters: [{
        url: `${TRUYENQQ_BASE}/${slug}/${chapSlug}`,
        chapterSlug: chapSlug,
        title: decodeHtml(chapText),
        time: ''
      }]
    });
  }

  // Pattern C: Search Results
  const patternC = /<div class="item">[\s\S]*?<div class="cover">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<img [^>]*src="([^"]+)"[\s\S]*?<div class="info">[\s\S]*?<h3>[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = patternC.exec(html)) !== null) {
    const rawUrl = match[1];
    const rawCover = match[2];
    const rawTitle = match[3];
    const slug = rawUrl.replace(/^\/+|\.html$/g, '');
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    comics.push({
      title: decodeHtml(rawTitle),
      slug,
      url: `${TRUYENQQ_BASE}${rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl}`,
      cover: rawCover.startsWith('http') ? rawCover : `${TRUYENQQ_BASE}${rawCover}`,
      views: 'Hot',
      chapters: []
    });
  }

  return comics;
}

function parseQQDetail(html, slug) {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '')) : slug;

  const imgMatch = html.match(/<div class="book_avatar"[^>]*>[\s\S]*?<img [^>]*src="([^"]+)"/i);
  let cover = imgMatch ? imgMatch[1].trim() : '';
  if (cover && !cover.startsWith('http')) cover = `${TRUYENQQ_BASE}${cover}`;

  const authorMatch = html.match(/Tác giả[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  const author = authorMatch ? decodeHtml(authorMatch[1].replace(/<[^>]+>/g, '')) : 'Đang cập nhật';

  const statusMatch = html.match(/Tình trạng[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  const status = statusMatch ? decodeHtml(statusMatch[1].replace(/<[^>]+>/g, '')) : 'Đang cập nhật';

  const descMatch = html.match(/<div class="story-detail-info"[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch ? decodeHtml(descMatch[1].replace(/<[^>]+>/g, '\n').replace(/\s+/g, ' ')) : '';

  const genres = [];
  const genreMatches = [...html.matchAll(/<a[^>]*href="[^"]*\/the-loai\/([^"\/]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const seenGenres = new Set();
  for (const gm of genreMatches) {
    const gSlug = gm[1];
    if (!seenGenres.has(gSlug)) {
      seenGenres.add(gSlug);
      genres.push({
        slug: gSlug,
        name: decodeHtml(gm[2].replace(/<[^>]+>/g, ''))
      });
    }
  }

  const chapters = [];
  const chapMatches = [...html.matchAll(/<a[^>]*href="([^"]*\/chapter-[^"\/]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const seenChaps = new Set();
  for (const cm of chapMatches) {
    const cUrl = cm[1];
    const chapName = decodeHtml(cm[2].replace(/<[^>]+>/g, ''));
    if (chapName.includes('Đọc từ') || chapName.includes('Đọc tiếp')) continue;

    const cSlug = cUrl.split('/').pop();
    if (!seenChaps.has(cSlug)) {
      seenChaps.add(cSlug);
      chapters.push({
        id: 0,
        name: chapName,
        chapterSlug: cSlug,
        time: '',
        url: `${TRUYENQQ_BASE}${cUrl.startsWith('/') ? cUrl : '/' + cUrl}`
      });
    }
  }

  return {
    title,
    slug,
    url: `${TRUYENQQ_BASE}/${slug}`,
    cover,
    author,
    status,
    genres,
    views: 'Hot',
    rating: '5.0',
    description,
    chapters
  };
}

function parseQQChapter(html, slug, chapterSlug) {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
  const rawTitle = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '')) : '';
  const comicTitle = rawTitle.split('-')[0]?.trim() || slug;
  const currentChapter = rawTitle.split('-')[1]?.trim() || chapterSlug;

  const startIdx = html.indexOf('class="reading-content"');
  const endIdx = html.indexOf('class="comment-box"') > -1
    ? html.indexOf('class="comment-box"')
    : (html.indexOf('id="comment"') > -1 ? html.indexOf('id="comment"') : html.length);
  const section = startIdx > -1 ? html.slice(startIdx, endIdx) : html;

  const images = [...section.matchAll(/<img[^>]+data-src="([^"]+)"|<img[^>]+src="([^"]+)"/gi)]
    .map(m => m[1] || m[2])
    .filter(u => u && !u.includes('placeholder') && !u.includes('loading.svg') && !u.includes('logo') && !u.includes('/media/images/'))
    .map(u => u.startsWith('//') ? 'https:' + u : u);

  // Prev & Next navigation
  const prevMatch = html.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*prev[^"]*"/i)
    || html.match(/<a[^>]*class="[^"]*prev[^"]*"[^>]*href="([^"]+)"/i);
  const nextMatch = html.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*next[^"]*"/i)
    || html.match(/<a[^>]*class="[^"]*next[^"]*"[^>]*href="([^"]+)"/i);

  const prevSlug = prevMatch && !prevMatch[1].includes('javascript:') ? prevMatch[1].split('/').filter(Boolean).pop() : '';
  const nextSlug = nextMatch && !nextMatch[1].includes('javascript:') ? nextMatch[1].split('/').filter(Boolean).pop() : '';

  return {
    comicTitle,
    comicSlug: slug,
    currentChapter,
    chapterSlug,
    images,
    prevChapterSlug: prevSlug,
    nextChapterSlug: nextSlug
  };
}

// ==================== NetTruyen Fallback Engine ====================

async function fetchNetTruyenHtml(targetPath) {
  const domainsToTry = [activeNetTruyenBase, ...NETTRUYEN_MIRRORS.filter(d => d !== activeNetTruyenBase)];
  const errors = [];

  for (const domain of domainsToTry) {
    const url = `${domain}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': `${domain}/`
        }
      });
      clearTimeout(to);
      const text = await res.text();
      if (res.ok && !text.includes('Just a moment...') && !text.includes('cf-browser-verification')) {
        activeNetTruyenBase = domain;
        return text;
      }
      errors.push(`${domain} => ${res.status}`);
    } catch (e) {
      clearTimeout(to);
      errors.push(`${domain} => ${e.message}`);
    }
  }
  throw new Error(`NetTruyen mirrors unavailable: ${errors.join(' | ')}`);
}

function parseNetTruyenList(html) {
  const comics = [];
  const itemBlocks = html.split('<div class="item"');
  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i];
    const titleMatch = block.match(/<h3>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const fullUrl = titleMatch[1].trim();
    const title = decodeHtml(titleMatch[2].replace(/<[^>]+>/g, ''));
    const slug = fullUrl.match(/\/truyen-tranh\/([^\/?#]+)/i)?.[1] || fullUrl.split('/').filter(Boolean).pop() || '';

    const imgMatch = block.match(/<img[^>]*?(?:data-src|data-original|data-retries|src)=['"]([^'"]+)['"]/i);
    let cover = imgMatch ? imgMatch[1].trim().replace(/&amp;/g, '&') : '';
    if (cover.startsWith('//')) cover = 'https:' + cover;

    const chapters = [];
    const chapMatches = [...block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const cm of chapMatches) {
      const cUrl = cm[1];
      if (cUrl.includes('chap') || cUrl.includes('chuong')) {
        chapters.push({
          url: cUrl,
          chapterSlug: cUrl.split('/').filter(Boolean).pop(),
          title: decodeHtml(cm[2].replace(/<[^>]+>/g, '')),
          time: ''
        });
      }
    }

    comics.push({
      title,
      slug,
      url: fullUrl,
      cover,
      views: 'Hot',
      chapters: chapters.slice(0, 3)
    });
  }

  return comics;
}

// ==================== Master Public Methods ====================

async function getHome(page = 1, sort = 0, status = 0) {
  const cacheKey = `home_${page}_${sort}_${status}`;
  const cached = getCache(cacheKey, 180);
  if (cached) return cached;

  let comics = [];
  // 1. Try TruyenQQ Primary
  try {
    let url = TRUYENQQ_BASE;
    if (sort === 1) {
      url = `${TRUYENQQ_BASE}/truyen-hot${page > 1 ? `?page=${page}` : ''}`;
    } else {
      url = page > 1 ? `${TRUYENQQ_BASE}/trang-${page}.html` : TRUYENQQ_BASE;
    }
    const html = await fetchQQ(url);
    comics = parseQQComics(html);
  } catch (err) {
    console.warn('TruyenQQ getHome fallback to NetTruyen:', err.message);
  }

  // 2. Fallback to NetTruyen if TruyenQQ empty
  if (comics.length === 0) {
    try {
      const targetPath = page > 1 ? `/tim-truyen?page=${page}` : '/trang-chu/';
      const html = await fetchNetTruyenHtml(targetPath);
      comics = parseNetTruyenList(html);
    } catch (err2) {
      console.error('All home sources failed:', err2.message);
    }
  }

  const result = {
    comics,
    pagination: {
      currentPage: page,
      totalPages: 100,
      hasNext: page < 100,
      hasPrev: page > 1
    }
  };

  if (comics.length > 0) {
    setCache(cacheKey, result);
  }
  return result;
}

async function searchManga(keyword, page = 1) {
  const cleanKw = keyword.trim();
  const cacheKey = `search_${cleanKw.toLowerCase()}_${page}`;
  const cached = getCache(cacheKey, 180);
  if (cached) return cached;

  let comics = [];
  // 1. Try TruyenQQ Primary
  try {
    const searchUrl = `${TRUYENQQ_BASE}/tim-kiem?s=${encodeURIComponent(cleanKw)}${page > 1 ? `&page=${page}` : ''}`;
    const html = await fetchQQ(searchUrl);
    comics = parseQQComics(html);
  } catch (err) {
    console.warn('TruyenQQ search fallback to NetTruyen:', err.message);
  }

  // 2. Fallback to NetTruyen
  if (comics.length === 0) {
    try {
      const ntHtml = await fetchNetTruyenHtml(`/tim-truyen?keyword=${encodeURIComponent(cleanKw)}&page=${page}`);
      comics = parseNetTruyenList(ntHtml);
    } catch (err2) {
      console.warn('NetTruyen search failed:', err2.message);
    }
  }

  const result = {
    keyword: cleanKw,
    comics,
    pagination: {
      currentPage: page,
      totalPages: 20,
      hasNext: comics.length >= 10,
      hasPrev: page > 1
    }
  };

  if (comics.length > 0) {
    setCache(cacheKey, result);
  }
  return result;
}

async function getGenre(genreSlug, page = 1) {
  const normalizedGenre = GENRE_MAP[genreSlug] || genreSlug;
  const cacheKey = `genre_${normalizedGenre}_${page}`;
  const cached = getCache(cacheKey, 300);
  if (cached) return cached;

  let comics = [];
  try {
    const genreUrl = `${TRUYENQQ_BASE}/the-loai/${normalizedGenre}${page > 1 ? `?page=${page}` : ''}`;
    const html = await fetchQQ(genreUrl);
    comics = parseQQComics(html);
  } catch (err) {
    console.warn('TruyenQQ genre fallback to NetTruyen:', err.message);
  }

  if (comics.length === 0) {
    try {
      const ntHtml = await fetchNetTruyenHtml(`/tim-truyen/${normalizedGenre}?page=${page}`);
      comics = parseNetTruyenList(ntHtml);
    } catch (err2) {
      console.warn('NetTruyen genre failed:', err2.message);
    }
  }

  const result = {
    slug: genreSlug,
    comics,
    pagination: {
      currentPage: page,
      totalPages: 50,
      hasNext: comics.length >= 10,
      hasPrev: page > 1
    }
  };

  if (comics.length > 0) {
    setCache(cacheKey, result);
  }
  return result;
}

async function getDetail(slug) {
  const cacheKey = `detail_${slug}`;
  const cached = getCache(cacheKey, 600);
  if (cached) return cached;

  const actualSlug = cleanSlug(slug);
  let detail = null;
  let qqError = null;
  let ntError = null;

  // 1. Try TruyenQQ Primary
  try {
    const qqHtml = await fetchQQ(`${TRUYENQQ_BASE}/${actualSlug}`);
    const parsed = parseQQDetail(qqHtml, actualSlug);
    if (parsed && parsed.chapters.length > 0) {
      detail = parsed;
    } else {
      qqError = 'Chapters length is 0';
    }
  } catch (err) {
    qqError = err.message;
    console.warn('TruyenQQ detail fallback to NetTruyen:', err.message);
  }

  // 2. Fallback to NetTruyen
  if (!detail || !detail.chapters || detail.chapters.length === 0) {
    try {
      const ntHtml = await fetchNetTruyenHtml(`/truyen-tranh/${actualSlug}`);
      const titleMatch = ntHtml.match(/<h1 class="title-detail">([\s\S]*?)<\/h1>/i) || ntHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const title = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '')) : actualSlug;

      const imgMatch = ntHtml.match(/<div class="col-xs-4 col-image">[\s\S]*?<img[^>]*src="([^"]+)"/i)
        || ntHtml.match(/<div class="col-xs-4 col-image">[\s\S]*?<img[^>]*data-original="([^"]+)"/i);
      let cover = imgMatch ? imgMatch[1].trim().replace(/&amp;/g, '&') : '';
      if (cover.startsWith('//')) cover = 'https:' + cover;

      const descMatch = ntHtml.match(/<div class="detail-content">[\s\S]*?<p>([\s\S]*?)<\/p>/i);
      const description = descMatch ? decodeHtml(descMatch[1].replace(/<[^>]+>/g, '\n').trim()) : '';

      const chapters = [];
      const chapMatches = [...ntHtml.matchAll(/<div class="col-xs-5 chapter">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="col-xs-4[^>]*>([\s\S]*?)<\/div>/gi)];
      for (const cm of chapMatches) {
        const cUrl = cm[1].trim();
        chapters.push({
          id: 0,
          name: decodeHtml(cm[2].replace(/<[^>]+>/g, '')),
          chapterSlug: cUrl.split('/').filter(Boolean).pop(),
          time: cm[3].replace(/<[^>]+>/g, '').trim(),
          url: cUrl
        });
      }

      detail = {
        title,
        slug: actualSlug,
        url: `${activeNetTruyenBase}/truyen-tranh/${actualSlug}`,
        cover,
        author: 'Đang cập nhật',
        status: 'Đang cập nhật',
        genres: [],
        views: 'Hot',
        rating: '5.0',
        description,
        chapters
      };
    } catch (err2) {
      ntError = err2.message;
      console.warn('NetTruyen detail failed:', err2.message);
    }
  }

  if (!detail) {
    throw new Error(`Comic '${slug}' not found. TruyenQQ error: ${qqError || 'none'} | NetTruyen error: ${ntError || 'none'}`);
  }

  setCache(cacheKey, detail);
  return detail;
}

async function getChapter(slug, chapterSlug) {
  const cacheKey = `chapter_${slug}_${chapterSlug}`;
  const cached = getCache(cacheKey, 3600);
  if (cached) return cached;

  const actualSlug = cleanSlug(slug);
  let chapterData = null;

  // 1. Try TruyenQQ Primary
  try {
    const cleanChap = chapterSlug.replace(/^chapter-/, 'chapter-');
    const qqUrl = `${TRUYENQQ_BASE}/${actualSlug}/${cleanChap}`;
    const qqHtml = await fetchQQ(qqUrl);
    const parsed = parseQQChapter(qqHtml, actualSlug, cleanChap);
    if (parsed && parsed.images.length > 0) {
      chapterData = parsed;
    }
  } catch (err) {
    console.warn('TruyenQQ chapter fallback to NetTruyen:', err.message);
  }

  // 2. Fallback to NetTruyen
  if (!chapterData || !chapterData.images || chapterData.images.length === 0) {
    try {
      const ntUrl = `/truyen-tranh/${actualSlug}/${chapterSlug}`;
      const ntHtml = await fetchNetTruyenHtml(ntUrl);
      const images = [];
      const imgMatches = [...ntHtml.matchAll(/<div[^>]*class=['"]?page-chapter['"]?[^>]*>[\s\S]*?<img[^>]*?(?:data-src|data-original|data-sv1|src)=['"]([^'"]+)['"]/gi)];
      for (const im of imgMatches) {
        let src = im[1].trim().replace(/&amp;/g, '&');
        if (src && !src.includes('logo') && !src.includes('banner')) {
          if (src.startsWith('//')) src = 'https:' + src;
          images.push(src);
        }
      }

      chapterData = {
        comicTitle: actualSlug,
        comicSlug: actualSlug,
        currentChapter: chapterSlug,
        chapterSlug,
        images,
        prevChapterSlug: '',
        nextChapterSlug: ''
      };
    } catch (err2) {
      console.warn('NetTruyen chapter failed:', err2.message);
    }
  }

  if (!chapterData || !chapterData.images || chapterData.images.length === 0) {
    throw new Error(`Chapter '${chapterSlug}' not found or images unavailable`);
  }

  setCache(cacheKey, chapterData);
  return chapterData;
}

function proxyImageStream(imageUrl, clientRes) {
  if (!imageUrl) {
    clientRes.writeHead(400);
    clientRes.end('Missing image URL');
    return;
  }

  try {
    const parsed = new URL(imageUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const isQQDomain = parsed.hostname.includes('truyenqq') || parsed.hostname.includes('cc3t.net');
    const referer = isQQDomain ? `${TRUYENQQ_BASE}/` : `${activeNetTruyenBase}/`;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': referer,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      }
    };

    const req = client.request(options, (remoteRes) => {
      if (remoteRes.statusCode >= 400) {
        clientRes.writeHead(remoteRes.statusCode, { 'Content-Type': 'text/plain' });
        remoteRes.pipe(clientRes);
        return;
      }

      const headers = {
        'Content-Type': remoteRes.headers['content-type'] || 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, immutable',
        'Access-Control-Allow-Origin': '*'
      };
      if (remoteRes.headers['content-length']) {
        headers['Content-Length'] = remoteRes.headers['content-length'];
      }
      clientRes.writeHead(200, headers);
      remoteRes.pipe(clientRes);
    });

    req.on('error', (err) => {
      if (!clientRes.headersSent) clientRes.writeHead(502);
      clientRes.end(`Proxy error: ${err.message}`);
    });

    req.setTimeout(12000, () => {
      req.destroy();
      if (!clientRes.headersSent) clientRes.writeHead(504);
      clientRes.end('Image proxy timeout');
    });

    req.end();
  } catch (err) {
    clientRes.writeHead(500);
    clientRes.end(`Invalid URL: ${err.message}`);
  }
}

module.exports = {
  getHome,
  searchManga,
  getGenre,
  getDetail,
  getChapter,
  proxyImageStream
};
