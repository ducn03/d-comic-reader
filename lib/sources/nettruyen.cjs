/**
 * NetTruyen Multi-Mirror Fallback Adapter (Cheerio DOM Parser + Concurrent Mirror Race)
 */
const cheerio = require('cheerio');
const { fetchText } = require('../http-client.cjs');

const NETTRUYEN_MIRRORS = [
  'https://nettruyenar.com',
  'https://nettruyen.ac',
  'https://nettruyenqq.com',
  'https://nettruyentv.me',
  'https://hinettruyen.com'
];

let activeNetTruyenBase = NETTRUYEN_MIRRORS[0];

function getActiveBase() {
  return activeNetTruyenBase;
}

function cleanText(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(raw, base = activeNetTruyenBase) {
  if (!raw) return '';
  const val = raw.trim().replace(/&amp;/g, '&');
  if (!val) return '';
  if (val.startsWith('//')) return `https:${val}`;
  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  return `${base}${val.startsWith('/') ? '' : '/'}${val}`;
}

function isCloudflareChallenge(html) {
  return html.includes('Just a moment...') || html.includes('cf-browser-verification');
}

async function tryMirror(domain, targetPath, signal) {
  const path = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  const html = await fetchText(`${domain}${path}`, {
    headers: { Referer: `${domain}/` },
    timeout: 3500,
    signal
  });
  if (isCloudflareChallenge(html)) {
    throw new Error(`${domain} blocked by Cloudflare`);
  }
  return { domain, html };
}

async function fetchNetTruyenHtml(targetPath) {
  // 1. Try known working mirror first
  try {
    const res = await tryMirror(activeNetTruyenBase, targetPath);
    return res.html;
  } catch {
    // 2. Race remaining mirrors concurrently and abort losers
    const others = NETTRUYEN_MIRRORS.filter((d) => d !== activeNetTruyenBase);
    const controller = new AbortController();
    try {
      const winner = await Promise.any(
        others.map((domain) => tryMirror(domain, targetPath, controller.signal))
      );
      activeNetTruyenBase = winner.domain;
      controller.abort();
      return winner.html;
    } catch {
      controller.abort();
      throw new Error('All NetTruyen fallback mirrors unavailable');
    }
  }
}

function parseList($, currentPage = 1) {
  const comics = [];
  const seen = new Set();

  $('div.item').each((_, div) => {
    const $div = $(div);
    const $titleLink = $div.find('h3 a').first();
    const $imgLink = $div.find('a[href*="/truyen-tranh/"]').first();
    const href = $titleLink.attr('href') || $imgLink.attr('href') || '';
    const slug = href.split('/').filter(Boolean).pop() || '';
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = cleanText($titleLink.text()) || cleanText($imgLink.attr('title'));
    const $img = $div.find('img').first();
    const cover = normalizeUrl(
      $img.attr('data-original') || $img.attr('data-src') || $img.attr('src') || ''
    );

    const chapters = [];
    $div.find('li.chapter').each((__, li) => {
      const $li = $(li);
      const $a = $li.find('a').first();
      const cHref = $a.attr('href') || '';
      const cTitle = cleanText($a.text());
      const cTime = cleanText($li.find('i.time').first().text());
      if (cTitle) {
        chapters.push({
          url: normalizeUrl(cHref),
          chapterSlug: cHref.split('/').filter(Boolean).pop() || '',
          title: cTitle,
          time: cTime
        });
      }
    });

    comics.push({
      title,
      slug,
      url: normalizeUrl(href),
      cover,
      views: '',
      chapters
    });
  });

  let maxPage = currentPage;
  $('.pagination a').each((_, a) => {
    const text = cleanText($(a).text());
    if (/^\d+$/.test(text)) {
      const p = parseInt(text, 10);
      if (p > maxPage) maxPage = p;
    }
  });

  return {
    comics,
    pagination: {
      currentPage,
      totalPages: Math.max(1, maxPage),
      hasNext: currentPage < maxPage || comics.length >= 20,
      hasPrev: currentPage > 1
    }
  };
}

async function getHome(page = 1, sort = 0, status = 0) {
  let targetPath = '/';
  if (status === 2) {
    targetPath = `/tim-truyen?status=2${page > 1 ? `&page=${page}` : ''}`;
  } else if ([10, 11, 12, 20].includes(sort)) {
    targetPath = `/tim-truyen?sort=${sort}${page > 1 ? `&page=${page}` : ''}`;
  } else if (sort === 1) {
    targetPath = `/tim-truyen?sort=10${page > 1 ? `&page=${page}` : ''}`;
  } else {
    targetPath = page > 1 ? `/tim-truyen?page=${page}` : '/';
  }

  const html = await fetchNetTruyenHtml(targetPath);
  const $ = cheerio.load(html);
  return { ...parseList($, page), source: 'nettruyen' };
}

async function getGenre(genreSlug, page = 1) {
  const targetPath = page > 1 ? `/tim-truyen/${genreSlug}?page=${page}` : `/tim-truyen/${genreSlug}`;
  const html = await fetchNetTruyenHtml(targetPath);
  const $ = cheerio.load(html);
  return { genre: genreSlug, ...parseList($, page), source: 'nettruyen' };
}

async function search(keyword, page = 1) {
  const targetPath = `/tim-truyen?keyword=${encodeURIComponent(keyword)}&page=${page}`;
  const html = await fetchNetTruyenHtml(targetPath);
  const $ = cheerio.load(html);
  return { keyword, ...parseList($, page), source: 'nettruyen' };
}

async function getDetail(slug) {
  const cleanSlug = slug.replace(/^\/?truyen-tranh\//, '').replace(/^\/+|\/+$/g, '');
  const html = await fetchNetTruyenHtml(`/truyen-tranh/${cleanSlug}`);
  const $ = cheerio.load(html);

  const title = cleanText($('h1.title-detail, h1').first().text()) || cleanSlug;
  const $img = $('.col-image img').first();
  const cover = normalizeUrl($img.attr('data-original') || $img.attr('src') || '');
  const description = cleanText($('.detail-content p').first().text());
  const author = cleanText($('.author .col-xs-8, .author p').last().text()) || 'Đang cập nhật';
  const status = cleanText($('.status .col-xs-8, .status p').last().text()) || 'Đang cập nhật';

  const genres = [];
  $('.kind a').each((_, a) => {
    const gName = cleanText($(a).text());
    const gSlug = ($(a).attr('href') || '').split('/').filter(Boolean).pop() || '';
    if (gName && gSlug) genres.push({ slug: gSlug, name: gName });
  });

  const chapters = [];
  $('#nt_listchapter li.row, .list-chapter li.row').each((_, li) => {
    const $li = $(li);
    const $a = $li.find('.chapter a').first();
    const cHref = $a.attr('href') || '';
    const cName = cleanText($a.text());
    const cTime = cleanText($li.find('.col-xs-4').first().text());
    const cSlug = cHref.split('/').filter(Boolean).pop() || '';
    if (cSlug && cName) {
      chapters.push({
        name: cName,
        chapterSlug: cSlug,
        time: cTime,
        url: normalizeUrl(cHref)
      });
    }
  });

  return {
    title,
    slug: cleanSlug,
    url: `${activeNetTruyenBase}/truyen-tranh/${cleanSlug}`,
    cover,
    author,
    status,
    views: '',
    genres,
    description,
    chapters,
    source: 'nettruyen'
  };
}

async function getChapter(slug, chapterSlug) {
  const cleanSlug = slug.replace(/^\/?truyen-tranh\//, '').replace(/^\/+|\/+$/g, '');
  const html = await fetchNetTruyenHtml(`/truyen-tranh/${cleanSlug}/${chapterSlug}`);
  const $ = cheerio.load(html);

  const images = [];
  $('.page-chapter img').each((_, img) => {
    const $img = $(img);
    const raw =
      $img.attr('data-src') ||
      $img.attr('data-original') ||
      $img.attr('data-sv1') ||
      $img.attr('src') ||
      '';
    const src = normalizeUrl(raw);
    if (src && !src.includes('logo') && !src.includes('banner')) {
      images.push(src);
    }
  });

  return {
    comicTitle: cleanText($('.txt-primary a').first().text()) || cleanSlug,
    comicSlug: cleanSlug,
    chapterTitle: cleanText($('.txt-primary span').first().text()) || chapterSlug,
    currentChapter: cleanText($('.txt-primary span').first().text()) || chapterSlug,
    chapterSlug,
    images,
    prevChapterSlug: '',
    nextChapterSlug: '',
    source: 'nettruyen'
  };
}

module.exports = {
  getActiveBase,
  getHome,
  getGenre,
  search,
  getDetail,
  getChapter
};
