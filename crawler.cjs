/**
 * Crawler & API Module for hinettruyen.com
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

const BASE_URL = 'https://hinettruyen.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchHtml(targetUrl) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Referer': BASE_URL + '/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8'
  };

  const res = await fetch(targetUrl, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: Failed to fetch ${targetUrl}`);
  }
  return await res.text();
}

function extractSlug(url) {
  if (!url) return '';
  const match = url.match(/\/truyen-tranh\/([^\/?#]+)/i);
  return match ? match[1] : '';
}

function parseComicsList(html) {
  const comics = [];
  const itemBlocks = html.split('<div class="item"');

  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i];

    // Title & Link
    const titleMatch = block.match(/<figcaption>[\s\S]*?<h3>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const fullUrl = titleMatch[1].trim();
    const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
    const slug = extractSlug(fullUrl);

    // Cover Image
    const imgMatch = block.match(/<div class="image">[\s\S]*?<img[^>]*data-original="([^"]+)"/i)
      || block.match(/<div class="image">[\s\S]*?<img[^>]*data-retries="([^"]+)"/i)
      || block.match(/<div class="image">[\s\S]*?<img[^>]*src="([^"]+)"/i);
    let cover = imgMatch ? imgMatch[1].trim() : '';
    if (cover.startsWith('//')) cover = 'https:' + cover;

    // View info
    const viewMatch = block.match(/<div class="view clearfix">([\s\S]*?)<\/div>/i);
    let views = '';
    if (viewMatch) {
      views = viewMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Chapters
    const chapters = [];
    const chapMatches = [...block.matchAll(/<li class="chapter clearfix">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<i class="time">([\s\S]*?)<\/i>/gi)];
    for (const cm of chapMatches) {
      const cUrl = cm[1].trim();
      const cSlugMatch = cUrl.match(/\/chuong-[^\/?#]+/i) || cUrl.match(/\/chapter-[^\/?#]+/i);
      chapters.push({
        url: cUrl,
        chapterSlug: cSlugMatch ? cSlugMatch[0].replace('/', '') : '',
        title: cm[2].replace(/<[^>]+>/g, '').trim(),
        time: cm[3].trim()
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
  let url = `${BASE_URL}/trang-chu/`;
  if (page > 1 || sort || status) {
    url = `${BASE_URL}/tim-truyen?page=${page}${sort ? `&sort=${sort}` : ''}${status ? `&status=${status}` : ''}`;
  }
  const html = await fetchHtml(url);
  return parseComicsList(html);
}

async function searchManga(keyword, page = 1) {
  const enc = encodeURIComponent(keyword);
  const url = `${BASE_URL}/tim-truyen?keyword=${enc}&page=${page}`;
  const html = await fetchHtml(url);
  return parseComicsList(html);
}

async function getGenre(genreSlug, page = 1) {
  const url = `${BASE_URL}/tim-truyen/${encodeURIComponent(genreSlug)}?page=${page}`;
  const html = await fetchHtml(url);
  return parseComicsList(html);
}

async function getDetail(slug) {
  const url = `${BASE_URL}/truyen-tranh/${slug}`;
  const html = await fetchHtml(url);

  // Title
  const titleMatch = html.match(/<h1[^>]*class="title-detail"[^>]*>([\s\S]*?)<\/h1>/i)
    || html.match(/<meta property="og:title" content="([^"]+)"/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : slug;

  // Cover
  const coverMatch = html.match(/<div class="col-xs-4 col-image">[\s\S]*?<img[^>]*src="([^"]+)"/i)
    || html.match(/<meta property="og:image" content="([^"]+)"/i);
  let cover = coverMatch ? coverMatch[1].trim() : '';
  if (cover.startsWith('//')) cover = 'https:' + cover;

  // Description
  const descMatch = html.match(/<div class="detail-content">[\s\S]*?<div class="shortened"[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';

  // Author & Status
  const authorMatch = html.match(/<li class="author row">[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  const statusMatch = html.match(/<li class="status row">[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  const author = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').trim() : 'Đang cập nhật';
  const status = statusMatch ? statusMatch[1].replace(/<[^>]+>/g, '').trim() : 'Đang tiến hành';

  // Genres
  const genres = [];
  const kindMatch = html.match(/<li class="kind row">[\s\S]*?<p class="col-xs-8">([\s\S]*?)<\/p>/i);
  if (kindMatch) {
    const gMatches = [...kindMatch[1].matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi)];
    for (const gm of gMatches) {
      const gSlug = gm[1].split('/').pop();
      genres.push({ name: gm[2].trim(), slug: gSlug });
    }
  }

  // Views & rating
  const ratingMatch = html.match(/<span itemprop="ratingValue">([\d\.]+)<\/span>/i);
  const viewsMatch = html.match(/<li class="row">[\s\S]*?Lượt xem[\s\S]*?<p class="col-xs-8">([\d\.,]+)<\/p>/i);

  // Full Chapter List from API
  let chapters = [];
  try {
    const apiRes = await fetch(`${BASE_URL}/Comic/Services/ComicService.asmx/ChapterList?slug=${slug}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': url,
        'X-Requested-With': 'XMLHttpRequest'
      }
    });
    if (apiRes.ok) {
      const jsonData = await apiRes.json();
      if (jsonData && Array.isArray(jsonData.data) && jsonData.data.length > 0) {
        chapters = jsonData.data.map(item => ({
          id: item.chapter_id,
          name: item.chapter_name,
          chapterSlug: item.chapter_slug || `chuong-${item.chapter_num}`,
          num: item.chapter_num,
          time: item.updated_at,
          views: item.view,
          imageCount: item.image_num,
          url: `/truyen-tranh/${slug}/${item.chapter_slug || ('chuong-' + item.chapter_num)}`
        }));
      }
    }
  } catch (e) {
    console.error('Error fetching chapter list API:', e.message);
  }

  // Fallback to HTML chapters if API failed or empty
  if (chapters.length === 0) {
    const chapBlockMatch = html.match(/<div class="list-chapter"[\s\S]*?<nav>([\s\S]*?)<\/nav>/i);
    if (chapBlockMatch) {
      const chapMatches = [...chapBlockMatch[1].matchAll(/<div class="col-xs-5 chapter">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="col-xs-4[^>]*>([\s\S]*?)<\/div>/gi)];
      for (const cm of chapMatches) {
        const cUrl = cm[1].trim();
        const cSlugMatch = cUrl.match(/\/([^\/?#]+)$/i);
        chapters.push({
          id: 0,
          name: cm[2].replace(/<[^>]+>/g, '').trim(),
          chapterSlug: cSlugMatch ? cSlugMatch[1] : '',
          time: cm[3].replace(/<[^>]+>/g, '').trim(),
          url: cUrl
        });
      }
    }
  }

  return {
    title,
    slug,
    url,
    cover,
    author,
    status,
    rating: ratingMatch ? ratingMatch[1] : '5.0',
    views: viewsMatch ? viewsMatch[1].trim() : '0',
    genres,
    description,
    chapters
  };
}

async function getChapter(slug, chapterSlug) {
  let url = `${BASE_URL}/truyen-tranh/${slug}/${chapterSlug}`;
  const html = await fetchHtml(url);

  // Comic Title & Chapter Title
  const breadcrumbs = [...html.matchAll(/<li itemprop="itemListElement"[\s\S]*?<span itemprop="name">([\s\S]*?)<\/span>/gi)];
  let comicTitle = slug;
  let chapterTitle = chapterSlug;
  if (breadcrumbs.length >= 3) {
    comicTitle = breadcrumbs[2][1].trim();
  }
  if (breadcrumbs.length >= 4) {
    chapterTitle = breadcrumbs[3][1].trim();
  }

  // Images
  const imgMatches = [...html.matchAll(/<div class=['"]page-chapter['"][^>]*>[\s\S]*?<img[^>]*?(?:data-src|data-sv1|src)=['"]([^'"]+)['"]/gi)];
  const rawImages = imgMatches.map(m => m[1].trim()).filter(u => !u.includes('notice-nettruyen') && !u.includes('thumb-default'));

  // Ensure absolute URLs
  const images = rawImages.map(src => {
    if (src.startsWith('//')) return 'https:' + src;
    if (src.startsWith('/')) return BASE_URL + src;
    return src;
  });

  // Prev & Next Chapter URLs
  let prevChapterSlug = null;
  let nextChapterSlug = null;

  const prevMatch = html.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*prev[^"]*"/i) || html.match(/class="[^"]*prev[^"]*"[^>]*href="([^"]+)"/i);
  const nextMatch = html.match(/<a[^>]*href="([^"]+)"[^>]*class="[^"]*next[^"]*"/i) || html.match(/class="[^"]*next[^"]*"[^>]*href="([^"]+)"/i);

  function parseChapterSlugFromUrl(u) {
    if (!u) return null;
    const parts = u.trim().split('/').filter(Boolean);
    return parts[parts.length - 1];
  }

  if (prevMatch && !prevMatch[0].includes('disabled')) {
    prevChapterSlug = parseChapterSlugFromUrl(prevMatch[1]);
  }
  if (nextMatch && !nextMatch[0].includes('disabled')) {
    nextChapterSlug = parseChapterSlugFromUrl(nextMatch[1]);
  }

  // If next/prev points to current chapter or invalid link, nullify it
  if (prevChapterSlug === chapterSlug || prevChapterSlug === '#' || prevChapterSlug === 'javascript:void(0)') {
    prevChapterSlug = null;
  }
  if (nextChapterSlug === chapterSlug || nextChapterSlug === '#' || nextChapterSlug === 'javascript:void(0)') {
    nextChapterSlug = null;
  }

  return {
    comicTitle,
    chapterTitle,
    slug,
    chapterSlug,
    images,
    prevChapterSlug,
    nextChapterSlug
  };
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
      // Forward status code or fallback
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
      console.error('Image proxy error:', err.message);
      if (!clientRes.headersSent) {
        clientRes.writeHead(502);
        clientRes.end('Proxy Image Error: ' + err.message);
      }
    });

    req.end();
  } catch (err) {
    clientRes.writeHead(400);
    clientRes.end('Invalid URL');
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
