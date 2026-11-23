/**
 * Unified Multi-Source Real-Time Crawler & API Module
 * Primary Source: TruyenQQ Ko (Real-time updates, no Cloudflare datacenter blocks, chapters from minutes ago)
 * Secondary Source: TruyenQQ VN
 * Fallback Source: NetTruyen multi-mirror engine
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TRUYENQQ_PRIMARY = 'https://truyenqqko.com';
const TRUYENQQ_BACKUP = 'https://truyenqq.com.vn';

const NETTRUYEN_MIRRORS = [
  'https://nettruyenar.com',
  'https://nettruyen.ac',
  'https://nettruyenqq.com',
  'https://nettruyentv.me',
  'https://hinettruyen.com'
];
let activeNetTruyenBase = NETTRUYEN_MIRRORS[0];

const GENRE_MAP = {
  'action': 'action-26',
  'adventure': 'adventure-27',
  'anime': 'anime-62',
  'chuyen-sinh': 'chuyen-sinh-91',
  'co-dai': 'co-dai-90',
  'comedy': 'comedy-28',
  'comic': 'comic-60',
  'demons': 'demons-99',
  'detective': 'detective-100',
  'doujinshi': 'doujinshi-96',
  'drama': 'drama-29',
  'fantasy': 'fantasy-30',
  'gender-bender': 'gender-bender-45',
  'harem': 'harem-47',
  'historical': 'historical-51',
  'horror': 'horror-44',
  'huyen-huyen': 'huyen-huyen-468',
  'isekai': 'isekai-85',
  'josei': 'josei-54',
  'mafia': 'mafia-69',
  'magic': 'magic-58',
  'manga': 'manga-469',
  'manhua': 'manhua-35',
  'manhwa': 'manhwa-49',
  'martial-arts': 'martial-arts-41',
  'military': 'military-101',
  'mystery': 'mystery-39',
  'ngon-tinh': 'ngon-tinh-87',
  'one-shot': 'one-shot-95',
  'psychological': 'psychological-40',
  'romance': 'romance-36',
  'school-life': 'school-life-37',
  'sci-fi': 'sci-fi-43',
  'seinen': 'seinen-42',
  'shoujo': 'shoujo-38',
  'shoujo-ai': 'shoujo-ai-98',
  'shounen': 'shounen-31',
  'shounen-ai': 'shounen-ai-86',
  'slice-of-life': 'slice-of-life-46',
  'sports': 'sports-57',
  'supernatural': 'supernatural-32',
  'tragedy': 'tragedy-52',
  'trong-sinh': 'trong-sinh-82',
  'truyen-mau': 'truyen-mau-92',
  'webtoon': 'webtoon-55',
  'xuyen-khong': 'xuyen-khong-88'
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
  if (memoryCache.size > 1000) {
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

// ==================== HTTP Request Helper ====================
let lastQQRequestTime = 0;

function requestHttp(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': `${TRUYENQQ_PRIMARY}/`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...(options.headers || {})
      },
      timeout: options.timeout || 8000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} on ${targetUrl}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout on ${targetUrl}`)); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function fetchQQ(pathOrUrl, options = {}) {
  const now = Date.now();
  const waitMs = Math.max(0, 250 - (now - lastQQRequestTime));
  lastQQRequestTime = now + waitMs;
  if (waitMs > 0) {
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  const bases = [TRUYENQQ_PRIMARY, TRUYENQQ_BACKUP];
  const isFullUrl = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');

  if (isFullUrl) {
    try {
      return await requestHttp(pathOrUrl, options);
    } catch (err) {
      if (pathOrUrl.startsWith(TRUYENQQ_PRIMARY)) {
        const altUrl = pathOrUrl.replace(TRUYENQQ_PRIMARY, TRUYENQQ_BACKUP);
        return await requestHttp(altUrl, options);
      }
      throw err;
    }
  }

  const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  let lastErr = null;
  for (const base of bases) {
    try {
      return await requestHttp(`${base}${cleanPath}`, options);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Failed to fetch QQ path: ${cleanPath}`);
}

// ==================== NetTruyen Fallback Helper ====================
async function fetchNetTruyenHtml(targetPath) {
  const domainsToTry = [activeNetTruyenBase, ...NETTRUYEN_MIRRORS.filter(d => d !== activeNetTruyenBase)];
  const errors = [];

  for (const domain of domainsToTry) {
    const url = `${domain}${targetPath.startsWith('/') ? '' : '/'}${targetPath}`;
    try {
      const text = await requestHttp(url, {
        headers: { 'Referer': `${domain}/` },
        timeout: 4500
      });
      if (!text.includes('Just a moment...') && !text.includes('cf-browser-verification')) {
        activeNetTruyenBase = domain;
        return text;
      }
      errors.push(`${domain} => Cloudflare challenge`);
    } catch (e) {
      errors.push(`${domain} => ${e.message}`);
    }
  }
  throw new Error(`NetTruyen mirrors unavailable: ${errors.join(' | ')}`);
}

// ==================== Parsers ====================
function parseQQComics(html) {
  const comics = [];
  const seen = new Set();

  // Pattern 1: TruyenQQ ko modern list_grid
  const liMatches = [...html.matchAll(/<li>[\s\S]*?<div class="book_avatar">[\s\S]*?<a[^>]*href="([^"]+)"[\s\S]*?<img[^>]*?(?:src|data-original)=["']([^"']+)["'][^>]*?alt="([^"]*)"[\s\S]*?<div class="book_info">[\s\S]*?<h3[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h3>[\s\S]*?(?:<div class="last_chapter">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>)?[\s\S]*?<\/li>/gi)];
  for (const m of liMatches) {
    const rawUrl = m[1].trim();
    const cover = m[2].trim();
    const title = decodeHtml(m[4].replace(/<[^>]+>/g, '').trim());
    const chapUrl = m[5] ? m[5].trim() : '';
    const chapName = m[6] ? decodeHtml(m[6].replace(/<[^>]+>/g, '').trim()) : '';
    const timeMatch = m[0].match(/class="time-ago">([\s\S]*?)<\/span>/i);
    const time = timeMatch ? decodeHtml(timeMatch[1].replace(/<[^>]+>/g, '').trim()) : '';
    const slug = rawUrl.replace(/^\/truyen-tranh\//, '').replace(/^\/+|\/+$/g, '');
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    comics.push({
      title,
      slug,
      url: `${TRUYENQQ_PRIMARY}/truyen-tranh/${slug}`,
      cover: cover.startsWith('//') ? 'https:' + cover : cover,
      views: 'Hot',
      chapters: chapName ? [{
        title: chapName,
        chapterSlug: chapUrl.split('/').filter(Boolean).pop(),
        url: chapUrl.startsWith('http') ? chapUrl : `${TRUYENQQ_PRIMARY}${chapUrl.startsWith('/') ? '' : '/'}${chapUrl}`,
        time: time
      }] : []
    });
  }

  // Pattern 2: Old TruyenQQ / NetTruyen item blocks (fallback)
  if (comics.length === 0) {
    const itemMatches = [...html.matchAll(/<div class="item"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*>[\s\S]*?<img[^>]*?(?:src|data-original)=["']([^"']+)["'][\s\S]*?<div class="caption">[\s\S]*?<h3>([\s\S]*?)<\/h3>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/gi)];
    for (const m of itemMatches) {
      const rawUrl = m[1].trim();
      const rawCover = m[3].trim();
      const rawTitle = decodeHtml(m[4].replace(/<[^>]+>/g, '').trim());
      const chapText = m[5] ? decodeHtml(m[5].replace(/<[^>]+>/g, '').trim()) : '';
      const slug = rawUrl.split('/').filter(Boolean).pop() || '';
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      comics.push({
        title: rawTitle,
        slug,
        url: `${TRUYENQQ_PRIMARY}/truyen-tranh/${slug}`,
        cover: rawCover.startsWith('//') ? 'https:' + rawCover : rawCover,
        views: 'Hot',
        chapters: chapText ? [{
          title: chapText,
          chapterSlug: '',
          url: '',
          time: ''
        }] : []
      });
    }
  }

  return comics;
}

function parseNetTruyenList(html) {
  const comics = [];
  const itemBlocks = html.split('<div class="item"');
  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i];
    const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
    const urlMatch = block.match(/<a[^>]*href="([^"]+)"[^>]*title=/i) || block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/i);
    const imgMatch = block.match(/<img[^>]*?(?:src|data-original|data-src)="([^"]+)"/i);
    if (!titleMatch || !urlMatch) continue;

    const fullUrl = urlMatch[1].trim();
    const slug = fullUrl.split('/').filter(Boolean).pop() || '';
    let cover = imgMatch ? imgMatch[1].trim().replace(/&amp;/g, '&') : '';
    if (cover.startsWith('//')) cover = 'https:' + cover;

    const chapMatches = [...block.matchAll(/<li class="chapter[^"]*">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<i class="time">([\s\S]*?)<\/i>/gi)];
    const chapters = chapMatches.map(c => ({
      url: c[1].trim(),
      chapterSlug: c[1].trim().split('/').filter(Boolean).pop(),
      title: decodeHtml(c[2].replace(/<[^>]+>/g, '')),
      time: decodeHtml(c[3].replace(/<[^>]+>/g, ''))
    }));

    comics.push({
      title: decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '')),
      slug,
      url: fullUrl,
      cover,
      views: 'Hot',
      chapters
    });
  }
  return comics;
}

function parseQQDetail(html, slug) {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? decodeHtml(titleMatch[1].replace(/<[^>]+>/g, '')) : slug;

  const imgMatch = html.match(/<div class="book_avatar"[^>]*>[\s\S]*?<img [^>]*src="([^"]+)"/i);
  let cover = imgMatch ? imgMatch[1].trim() : '';
  if (cover.startsWith('//')) cover = 'https:' + cover;

  const authorMatch = html.match(/Tác giả[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  const author = authorMatch ? decodeHtml(authorMatch[1].replace(/<[^>]+>/g, '')) : 'Đang cập nhật';

  const statusMatch = html.match(/Tình trạng[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  const status = statusMatch ? decodeHtml(statusMatch[1].replace(/<[^>]+>/g, '')) : 'Đang cập nhật';

  const descMatch = html.match(/<div class="story-detail-info"[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch ? decodeHtml(descMatch[1].replace(/<[^>]+>/g, '\n').replace(/\s+/g, ' ').trim()) : '';

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
  const seenChaps = new Set();

  // Pattern 1: TruyenQQ modern works-chapter-item with date
  const worksMatches = [...html.matchAll(/<div class="works-chapter-item">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="[^"]*time-chap[^"]*">([\s\S]*?)<\/div>/gi)];
  for (const wm of worksMatches) {
    const cUrl = wm[1].trim();
    const chapName = decodeHtml(wm[2].replace(/<[^>]+>/g, '').trim());
    const timeChap = decodeHtml(wm[3].replace(/<[^>]+>/g, '').trim());
    const cSlug = cUrl.split('/').filter(Boolean).pop();
    if (cSlug && !seenChaps.has(cSlug)) {
      seenChaps.add(cSlug);
      chapters.push({
        id: 0,
        name: chapName,
        chapterSlug: cSlug,
        time: timeChap,
        url: `${TRUYENQQ_PRIMARY}${cUrl.startsWith('/') ? cUrl : '/' + cUrl}`
      });
    }
  }

  // Pattern 2: Fallback general regex
  if (chapters.length === 0) {
    const chapMatches = [...html.matchAll(/<a[^>]*href="([^"]*[-_\/]chap(?:ter)?[-_][^"\/]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const cm of chapMatches) {
      const cUrl = cm[1].trim();
      const chapName = decodeHtml(cm[2].replace(/<[^>]+>/g, ''));
      if (chapName.includes('Đọc từ') || chapName.includes('Đọc tiếp')) continue;

      const cSlug = cUrl.split('/').filter(Boolean).pop();
      if (!seenChaps.has(cSlug)) {
        seenChaps.add(cSlug);
        chapters.push({
          id: 0,
          name: chapName,
          chapterSlug: cSlug,
          time: '',
          url: `${TRUYENQQ_PRIMARY}${cUrl.startsWith('/') ? cUrl : '/' + cUrl}`
        });
      }
    }
  }

  return {
    title,
    slug,
    url: `${TRUYENQQ_PRIMARY}/truyen-tranh/${slug}`,
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

  const images = [];
  const pageMatches = [...html.matchAll(/<div[^>]*class=["']page-chapter["'][^>]*>[\s\S]*?<img[^>]*?(?:data-original|data-cdn|data-src|src)=["']([^"']+)["']/gi)];
  for (const m of pageMatches) {
    let src = m[1].trim();
    if (src && !src.includes('placeholder') && !src.includes('loading') && !src.includes('logo')) {
      if (src.startsWith('//')) src = 'https:' + src;
      images.push(src);
    }
  }

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

// ==================== Auto-Resolve Slugs ====================
async function resolveSlug(slug) {
  const clean = slug.replace(/^\/truyen-tranh\//, '').replace(/^\/+|\/+$/g, '');
  let searchRes = await searchMangaQQ(clean.replace(/-/g, ' '));
  if (searchRes.length === 0) {
    const words = clean.split('-');
    if (words.length > 2) {
      searchRes = await searchMangaQQ(words.slice(0, 2).join(' '));
    }
  }
  const match = searchRes.find(c => c.slug.startsWith(clean)) || searchRes[0];
  return match ? match.slug : null;
}

// ==================== Public API Methods ====================

async function getHome(page = 1, sort = 0, status = 0) {
  const cacheKey = `home_${page}_${sort}_${status}`;
  const cached = getCache(cacheKey, 180);
  if (cached) return cached;

  let comics = [];
  // 1. Try TruyenQQ Primary
  try {
    let path = '/truyen-moi-cap-nhat';
    if (status === 2) {
      path = page > 1 ? `/truyen-hoan-thanh/trang-${page}` : '/truyen-hoan-thanh';
    } else if (sort === 11) {
      path = page > 1 ? `/top-thang/trang-${page}` : '/top-thang';
    } else if (sort === 12) {
      path = page > 1 ? `/top-tuan/trang-${page}` : '/top-tuan';
    } else if (sort === 20) {
      path = page > 1 ? `/truyen-yeu-thich/trang-${page}` : '/truyen-yeu-thich';
    } else if (sort === 1 || sort === 10) {
      path = page > 1 ? `/top-ngay/trang-${page}` : '/top-ngay';
    } else {
      path = page > 1 ? `/truyen-moi-cap-nhat/trang-${page}` : '/truyen-moi-cap-nhat';
    }
    const html = await fetchQQ(path);
    comics = parseQQComics(html);
  } catch (err) {
    console.warn('TruyenQQ getHome fallback:', err.message);
  }

  // 2. Fallback to NetTruyen if empty
  if (comics.length === 0) {
    try {
      let targetPath = '/';
      if (status === 2) {
        targetPath = `/tim-truyen?status=2${page > 1 ? `&page=${page}` : ''}`;
      } else if (sort === 11) {
        targetPath = `/tim-truyen?sort=11${page > 1 ? `&page=${page}` : ''}`;
      } else if (sort === 12) {
        targetPath = `/tim-truyen?sort=12${page > 1 ? `&page=${page}` : ''}`;
      } else if (sort === 20) {
        targetPath = `/tim-truyen?sort=20${page > 1 ? `&page=${page}` : ''}`;
      } else if (sort === 1 || sort === 10) {
        targetPath = `/tim-truyen?sort=10${page > 1 ? `&page=${page}` : ''}`;
      } else {
        targetPath = page > 1 ? `/tim-truyen?page=${page}` : '/';
      }
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

async function searchMangaQQ(keyword) {
  const postData = 'search=' + encodeURIComponent(keyword) + '&type=0';
  const html = await fetchQQ('/frontend/search/search', {
    method: 'POST',
    body: postData,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(postData),
      'X-Requested-With': 'XMLHttpRequest'
    }
  });

  const comics = [];
  const liMatches = [...html.matchAll(/<li>[\s\S]*?<a[^>]*href="([^"]+)"[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<p class="name">([\s\S]*?)<\/p>[\s\S]*?<p[^>]*>(Chương[^<]*)<\/p>[\s\S]*?<\/li>/gi)];
  for (const m of liMatches) {
    const rawUrl = m[1].trim();
    const cover = m[2].trim();
    const title = decodeHtml(m[3].replace(/<[^>]+>/g, '').trim());
    const chapName = decodeHtml(m[4].replace(/<[^>]+>/g, '').trim());
    const slug = rawUrl.replace(/^https?:\/\/[^\/]+\/truyen-tranh\//, '').replace(/^\/+|\/+$/g, '');
    comics.push({
      title,
      slug,
      url: `${TRUYENQQ_PRIMARY}/truyen-tranh/${slug}`,
      cover: cover.startsWith('//') ? 'https:' + cover : cover,
      views: 'Hot',
      chapters: [{
        title: chapName,
        chapterSlug: '',
        url: '',
        time: ''
      }]
    });
  }
  return comics;
}

async function searchManga(keyword, page = 1) {
  const cleanKw = keyword.trim();
  const cacheKey = `search_${cleanKw.toLowerCase()}_${page}`;
  const cached = getCache(cacheKey, 180);
  if (cached) return cached;

  let comics = [];
  // 1. Try TruyenQQ Search
  try {
    comics = await searchMangaQQ(cleanKw);
  } catch (err) {
    console.warn('TruyenQQ search failed, falling back:', err.message);
  }

  // 2. Fallback to NetTruyen search
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
  // 1. Try TruyenQQ Genre
  try {
    const path = page > 1 
      ? `/the-loai/${normalizedGenre}/trang-${page}` 
      : `/the-loai/${normalizedGenre}`;
    const html = await fetchQQ(path);
    comics = parseQQComics(html);
  } catch (err) {
    console.warn('TruyenQQ getGenre fallback:', err.message);
  }

  // 2. Fallback to NetTruyen Genre
  if (comics.length === 0) {
    try {
      const targetPath = page > 1 
        ? `/tim-truyen/${genreSlug}?page=${page}` 
        : `/tim-truyen/${genreSlug}`;
      const ntHtml = await fetchNetTruyenHtml(targetPath);
      comics = parseNetTruyenList(ntHtml);
    } catch (err2) {
      console.warn('NetTruyen genre failed:', err2.message);
    }
  }

  const result = {
    genre: genreSlug,
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

async function getDetail(slug) {
  const cacheKey = `detail_${slug}`;
  const cached = getCache(cacheKey, 600);
  if (cached) return cached;

  let actualSlug = slug.trim().replace(/^\/truyen-tranh\//, '').replace(/^\/+|\/+$/g, '');
  let detail = null;
  let qqError = null;

  // 1. Try TruyenQQ Primary
  try {
    let qqHtml = null;
    try {
      qqHtml = await fetchQQ(`/truyen-tranh/${actualSlug}`);
    } catch (e1) {
      // Auto-resolve slug if missing numeric ID
      if (!/-\d+$/.test(actualSlug)) {
        const resolved = await resolveSlug(actualSlug);
        if (resolved) {
          actualSlug = resolved;
          qqHtml = await fetchQQ(`/truyen-tranh/${actualSlug}`);
        }
      }
      if (!qqHtml) throw e1;
    }

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
      console.error('All detail sources failed:', err2.message);
      throw new Error(`Comic '${slug}' not found. TruyenQQ: ${qqError || 'failed'} | NetTruyen: ${err2.message}`);
    }
  }

  setCache(cacheKey, detail);
  return detail;
}

async function getChapter(slug, chapterSlug) {
  const cacheKey = `chapter_${slug}_${chapterSlug}`;
  const cached = getCache(cacheKey, 3600);
  if (cached) return cached;

  let actualSlug = slug.trim().replace(/^\/truyen-tranh\//, '').replace(/^\/+|\/+$/g, '');
  let chapterData = null;

  // 1. Try TruyenQQ Primary
  try {
    const chapPath = chapterSlug.startsWith('/truyen-tranh/') 
      ? chapterSlug 
      : `/truyen-tranh/${chapterSlug.replace(/^truyen-tranh\//, '')}`;
    let qqHtml = null;
    try {
      qqHtml = await fetchQQ(chapPath);
    } catch (e1) {
      if (!chapterSlug.startsWith(actualSlug)) {
        qqHtml = await fetchQQ(`/truyen-tranh/${actualSlug}-${chapterSlug}`);
      } else {
        throw e1;
      }
    }

    const parsed = parseQQChapter(qqHtml, actualSlug, chapterSlug);
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

    const isQQDomain = parsed.hostname.includes('truyenqq') || 
                       parsed.hostname.includes('truyenvua') || 
                       parsed.hostname.includes('hinhhinh') || 
                       parsed.hostname.includes('tintruyen') || 
                       parsed.hostname.includes('cc3t.net');
    const referer = isQQDomain ? `${TRUYENQQ_PRIMARY}/` : `${activeNetTruyenBase}/`;

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

    clientRes.on('close', () => {
      try { req.destroy(); } catch (_) {}
    });
    clientRes.on('error', () => {
      try { req.destroy(); } catch (_) {}
    });

    const req = client.request(options, (remoteRes) => {
      remoteRes.on('error', (err) => {
        if (!clientRes.headersSent) {
          try { clientRes.writeHead(502); clientRes.end(err.message); } catch (_) {}
        }
      });

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
    clientRes.end(`Internal proxy error: ${err.message}`);
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
