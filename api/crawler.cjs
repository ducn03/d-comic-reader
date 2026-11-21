/**
 * Crawler & API Module for NetTruyen & Hinettruyen
 * Multi-domain fallback to bypass datacenter blocks
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

const MIRROR_DOMAINS = [
  'https://nettruyentv.me',
  'https://nettruyenbb.com',
  'https://nettruyen.info'
];
let BASE_URL = MIRROR_DOMAINS[0];
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// In-Memory Fast Cache with TTL
const memoryCache = new Map();
function getCache(key, ttlSeconds = 300) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > ttlSeconds * 1000) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  if (memoryCache.size > 500) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(key, { time: Date.now(), data });
}

async function fetchHtml(targetUrl) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  const domainsToTry = [BASE_URL, ...MIRROR_DOMAINS.filter(d => d !== BASE_URL)];
  const allErrors = [];

  for (const domain of domainsToTry) {
    let url = targetUrl;
    try {
      const parsed = new URL(targetUrl);
      url = `${domain}${parsed.pathname}${parsed.search}`;
    } catch (e) {
      url = `${domain}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    try {
      const res = await fetch(url, { headers: { ...headers, 'Referer': domain + '/' } });
      const text = await res.text();
      if (res.ok && !text.includes('Just a moment...') && !text.includes('cf-browser-verification')) {
        BASE_URL = domain;
        return text;
      }
      allErrors.push(`${domain} => ${res.status}: ${text.slice(0, 100).replace(/\s+/g, ' ')}`);
    } catch (e) {
      allErrors.push(`${domain} => ${e.message}`);
    }
  }

  throw new Error(`All mirrors blocked: ${allErrors.join(' | ')}`);
}

function extractSlug(url) {
  if (!url) return '';
  const match = url.match(/\/truyen-tranh\/([^\/?#]+)/i);
  if (match) return match[1];
  const parts = url.split('/').filter(Boolean);
  return parts.pop() || '';
}

function parseComicsList(html) {
  const comics = [];
  let itemBlocks = html.split('<div class="item"');
  if (itemBlocks.length <= 1 && html.includes('<div class="book_avatar"')) {
    itemBlocks = html.split('<div class="book_avatar"');
  }

  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i];

    // Title & Link
    const titleMatch = block.match(/<h3>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const fullUrl = titleMatch[1].trim();
    const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
    const slug = extractSlug(fullUrl);

    // Cover Image
    const imgMatch = block.match(/<img[^>]*?(?:data-src|data-original|data-retries|src)="([^"]+)"/i);
    let cover = imgMatch ? imgMatch[1].trim().replace(/&amp;/g, '&') : '';
    if (cover.startsWith('//')) cover = 'https:' + cover;

    // View info
    const viewMatch = block.match(/<div class="view clearfix">([\s\S]*?)<\/div>/i);
    let views = '';
    if (viewMatch) {
      views = viewMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Chapters
    const chapters = [];
    const chapMatches = [
      ...block.matchAll(/<li class="chapter clearfix">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<i class="time">([\s\S]*?)<\/i>/gi),
      ...block.matchAll(/<a[^>]*href="([^"]+)"[^>]*title="([^"]*Chapter[^"]*|[^"]*Chap[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)
    ];
    for (const cm of chapMatches) {
      const cUrl = cm[1].trim();
      const cSlugMatch = cUrl.match(/\/(chuong-[^\/?#]+)/i) || cUrl.match(/\/(chapter-[^\/?#]+)/i) || cUrl.match(/\/([^/?#]+-chap-[^/?#]+)/i);
      chapters.push({
        url: cUrl,
        chapterSlug: cSlugMatch ? (cSlugMatch[1] || cSlugMatch[0].replace('/', '')) : cUrl.split('/').filter(Boolean).pop(),
        title: (cm[3] || cm[2] || '').replace(/<[^>]+>/g, '').trim(),
        time: (cm[4] || '').trim()
      });
    }

    comics.push({
      title,
      slug,
      url: fullUrl,
      cover,
      views,
      chapters: chapters.slice(0, 3)
    });
  }

  // Pagination
  let currentPage = 1;
  let totalPages = 1;
  const pageMatch = html.match(/<li class="active">[\s\S]*?<a[^>]*>(\d+)<\/a>/i);
  if (pageMatch) currentPage = parseInt(pageMatch[1], 10);

  const allPageMatches = [...html.matchAll(/<ul class="pagination">[\s\S]*?<a[^>]*href="[^"]*page=(\d+)"/gi)];
  for (const pm of allPageMatches) {
    const p = parseInt(pm[1], 10);
    if (p > totalPages) totalPages = p;
  }
  if (totalPages < currentPage) totalPages = currentPage;

  return {
    comics,
    pagination: {
      currentPage,
      totalPages,
      hasNext: currentPage < totalPages,
      hasPrev: currentPage > 1
    }
  };
}

async function getHome(page = 1, sort = 0, status = 0) {
  const cacheKey = `home_${page}_${sort}_${status}`;
  const cached = getCache(cacheKey, 120);
  if (cached) return cached;

  let url;
  if (BASE_URL.includes('nettruyentv')) {
    url = page > 1 ? `${BASE_URL}/?page=${page}` : `${BASE_URL}/`;
  } else {
    url = `${BASE_URL}/trang-chu/`;
    if (page > 1 || sort || status) {
      url = `${BASE_URL}/tim-truyen?page=${page}${sort ? `&sort=${sort}` : ''}${status ? `&status=${status}` : ''}`;
    }
  }
  const html = await fetchHtml(url);
  const result = parseComicsList(html);
  setCache(cacheKey, result);
  return result;
}

async function searchManga(keyword, page = 1) {
  const cacheKey = `search_${keyword.toLowerCase().trim()}_${page}`;
  const cached = getCache(cacheKey, 120);
  if (cached) return cached;

  const enc = encodeURIComponent(keyword);
  let url = BASE_URL.includes('nettruyentv')
    ? `${BASE_URL}/tim-kiem?keyword=${enc}&page=${page}`
    : `${BASE_URL}/tim-truyen?keyword=${enc}&page=${page}`;
  const html = await fetchHtml(url);
  const result = parseComicsList(html);
  setCache(cacheKey, result);
  return result;
}

async function getGenre(genreSlug, page = 1) {
  const cacheKey = `genre_${genreSlug}_${page}`;
  const cached = getCache(cacheKey, 180);
  if (cached) return cached;

  const enc = encodeURIComponent(genreSlug);
  let url = BASE_URL.includes('nettruyentv')
    ? `${BASE_URL}/the-loai/${enc}?page=${page}`
    : `${BASE_URL}/tim-truyen/${enc}?page=${page}`;
  const html = await fetchHtml(url);
  const result = parseComicsList(html);
  setCache(cacheKey, result);
  return result;
}

async function getDetail(slug) {
  const cacheKey = `detail_${slug}`;
  const cached = getCache(cacheKey, 300);
  if (cached) return cached;

  let url = BASE_URL.includes('nettruyentv')
    ? `${BASE_URL}/${slug}`
    : `${BASE_URL}/truyen-tranh/${slug}`;
  const html = await fetchHtml(url);

  // Title
  const titleMatch = html.match(/<h1 class="title-detail">([\s\S]*?)<\/h1>/i)
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // Cover Image
  const imgMatch = html.match(/<div class="col-xs-4 col-image">[\s\S]*?<img[^>]*src="([^"]+)"/i)
    || html.match(/<div class="col-xs-4 col-image">[\s\S]*?<img[^>]*data-original="([^"]+)"/i);
  let cover = imgMatch ? imgMatch[1].trim().replace(/&amp;/g, '&') : '';
  if (cover.startsWith('//')) cover = 'https:' + cover;

  // Author
  const authorMatch = html.match(/<li class="author[^>]*>[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  const author = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Đang cập nhật';

  // Status
  const statusMatch = html.match(/<li class="status[^>]*>[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  const status = statusMatch ? statusMatch[1].replace(/<[^>]+>/g, '').trim() : 'Đang cập nhật';

  // Genres
  const genres = [];
  const genreBlock = html.match(/<li class="kind[^>]*>[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  if (genreBlock) {
    const genreMatches = [...genreBlock[1].matchAll(/<a[^>]*href="[^"]*\/([^\/?#]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const gm of genreMatches) {
      genres.push({
        slug: gm[1],
        name: gm[2].replace(/<[^>]+>/g, '').trim()
      });
    }
  }

  // Views & Rating
  const viewMatch = html.match(/<li[^>]*>[\s\S]*?<p class="col-xs-4">Lượt xem<\/p>[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  const views = viewMatch ? viewMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  const ratingMatch = html.match(/<span itemprop="ratingValue">([\s\S]*?)<\/span>/i);
  const rating = ratingMatch ? ratingMatch[1].trim() : '5.0';

  // Description
  const descMatch = html.match(/<div class="detail-content">[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '\n').trim() : '';

  // Chapters - optimize regex by restricting search to chapter container
  let chapters = [];
  const listStart = html.indexOf('id="nt_listchapter"');
  const chapterBlock = listStart !== -1 ? html.slice(listStart) : html;
  const chapMatches = [...chapterBlock.matchAll(/<div class="col-xs-5 chapter">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="col-xs-4[^>]*>([\s\S]*?)<\/div>/gi)];
  for (const cm of chapMatches) {
    const cUrl = cm[1].trim();
    const cSlug = cUrl.split('/').filter(Boolean).pop();
    chapters.push({
      id: 0,
      name: cm[2].replace(/<[^>]+>/g, '').trim(),
      chapterSlug: cSlug,
      time: cm[3].replace(/<[^>]+>/g, '').trim(),
      url: cUrl
    });
  }

  const result = {
    title,
    slug,
    url,
    cover,
    author,
    status,
    genres,
    views,
    rating,
    description,
    chapters
  };
  setCache(cacheKey, result);
  return result;
}

async function getChapter(slug, chapterSlug) {
  const cacheKey = `chapter_${slug}_${chapterSlug}`;
  const cached = getCache(cacheKey, 3600);
  if (cached) return cached;

  let url = BASE_URL.includes('nettruyentv')
    ? `${BASE_URL}/${slug}/${chapterSlug}`
    : `${BASE_URL}/truyen-tranh/${slug}/${chapterSlug}`;
  const html = await fetchHtml(url);

  // Comic Title & Chapter Title
  const breadcrumbs = [...html.matchAll(/<li itemprop="itemListElement"[\s\S]*?<a[^>]*>[\s\S]*?<span itemprop="name">([\s\S]*?)<\/span>/gi)];
  const comicTitle = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2][1].trim() : slug;
  const currentChapter = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1][1].trim() : chapterSlug;

  // Chapter Images
  const images = [];
  const imgMatches = [...html.matchAll(/<div class="page-chapter">[\s\S]*?<img[^>]*?(?:data-src|data-original|src)="([^"]+)"/gi)];
  for (const im of imgMatches) {
    let src = im[1].trim().replace(/&amp;/g, '&');
    if (src && !src.includes('logo') && !src.includes('brandview') && !src.includes('banner')) {
      if (src.startsWith('//')) src = 'https:' + src;
      images.push(src);
    }
  }

  // Prev / Next Chapter Navigation
  const prevMatch = html.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*prev[^"]*"/i)
    || html.match(/<a[^>]*class="[^"]*prev[^"]*"[^>]*href="([^"]+)"/i);
  const nextMatch = html.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*next[^"]*"/i)
    || html.match(/<a[^>]*class="[^"]*next[^"]*"[^>]*href="([^"]+)"/i);

  const prevSlug = prevMatch && !prevMatch[1].includes('#') ? prevMatch[1].split('/').filter(Boolean).pop() : '';
  const nextSlug = nextMatch && !nextMatch[1].includes('#') ? nextMatch[1].split('/').filter(Boolean).pop() : '';

  const chapterResult = {
    comicTitle,
    comicSlug: slug,
    currentChapter,
    chapterSlug,
    images,
    prevChapterSlug: prevSlug,
    nextChapterSlug: nextSlug
  };
  setCache(cacheKey, chapterResult);
  return chapterResult;
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

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': BASE_URL + '/',
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
      if (!clientRes.headersSent) {
        clientRes.writeHead(502);
      }
      clientRes.end(`Proxy error: ${err.message}`);
    });

    req.setTimeout(12000, () => {
      req.destroy();
      if (!clientRes.headersSent) {
        clientRes.writeHead(504);
      }
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
