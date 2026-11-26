/**
 * TruyenQQ Source Adapter (Cheerio DOM Parser)
 */
const cheerio = require('cheerio/slim');
const { fetchText } = require('../http-client.cjs');
const { GENRE_MAP } = require('./genres.cjs');

const TRUYENQQ_PRIMARY = 'https://truyenqqko.com';
const TRUYENQQ_BACKUP = 'https://truyenqq.com.vn';

function normalizeUrl(raw, base = TRUYENQQ_PRIMARY) {
  if (!raw) return '';
  const val = raw.trim();
  if (!val) return '';
  if (val.startsWith('//')) return `https:${val}`;
  if (val.startsWith('http://') || val.startsWith('https://')) return val;
  return `${base}${val.startsWith('/') ? '' : '/'}${val}`;
}

function cleanText(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function extractSlugFromHref(href) {
  if (!href) return '';
  return href
    .trim()
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/^\/?truyen-tranh\//, '')
    .replace(/^\/+|\/+$/g, '');
}

async function fetchQQ(pathOrUrl, options = {}) {
  const isFull = pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://');
  const headers = {
    Referer: `${TRUYENQQ_PRIMARY}/`,
    ...(options.headers || {})
  };

  if (isFull) {
    try {
      return await fetchText(pathOrUrl, { ...options, headers });
    } catch (err) {
      if (pathOrUrl.startsWith(TRUYENQQ_PRIMARY)) {
        const alt = pathOrUrl.replace(TRUYENQQ_PRIMARY, TRUYENQQ_BACKUP);
        return await fetchText(alt, {
          ...options,
          headers: { ...headers, Referer: `${TRUYENQQ_BACKUP}/` }
        });
      }
      throw err;
    }
  }

  const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  let lastErr = null;
  for (const base of [TRUYENQQ_PRIMARY, TRUYENQQ_BACKUP]) {
    try {
      return await fetchText(`${base}${cleanPath}`, {
        ...options,
        headers: { ...headers, Referer: `${base}/` }
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Failed to fetch TruyenQQ: ${cleanPath}`);
}

function parsePagination($, currentPage = 1) {
  let maxPage = currentPage;
  let hasNextArrow = false;

  $('.page_redirect a').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const text = cleanText($el.text());

    const hrefMatch = href.match(/trang-(\d+)/i);
    if (hrefMatch) {
      const p = parseInt(hrefMatch[1], 10);
      if (p > maxPage) maxPage = p;
    }
    if (/^\d+$/.test(text)) {
      const p = parseInt(text, 10);
      if (p > maxPage) maxPage = p;
    }
    if ((text === '›' || text === '»' || $el.find('span').length > 0) && href && !href.startsWith('javascript')) {
      hasNextArrow = true;
    }
  });

  if (maxPage === currentPage && hasNextArrow) {
    maxPage = currentPage + 1;
  }

  return {
    currentPage,
    totalPages: Math.max(1, maxPage),
    hasNext: currentPage < maxPage || hasNextArrow,
    hasPrev: currentPage > 1
  };
}

function parseList($) {
  const comics = [];
  const seen = new Set();

  $('ul.list_grid > li').each((_, li) => {
    const $li = $(li);
    const href = $li.find('.book_avatar a').attr('href') || $li.find('.book_info h3 a').attr('href') || '';
    const slug = extractSlugFromHref(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = cleanText($li.find('.book_info h3 a').text()) || cleanText($li.find('.book_avatar img').attr('alt'));
    const $img = $li.find('.book_avatar img').first();
    const rawCover = $img.attr('data-original') || $img.attr('src') || '';
    const cover = normalizeUrl(rawCover);
    const time = cleanText($li.find('.time-ago').first().text());
    const views = cleanText($li.find('.book_avatar .more-info, .book_info .views').first().text()) || '';

    const $chapLink = $li.find('.last_chapter a').first();
    const chapHref = $chapLink.attr('href') || '';
    const chapName = cleanText($chapLink.text());
    const chapSlug = chapHref.split('/').filter(Boolean).pop() || '';

    comics.push({
      title,
      slug,
      url: `${TRUYENQQ_PRIMARY}/truyen-tranh/${slug}`,
      cover,
      views,
      chapters: chapName
        ? [
            {
              title: chapName,
              chapterSlug: chapSlug,
              url: normalizeUrl(chapHref),
              time
            }
          ]
        : []
    });
  });

  // Fallback for legacy .item layout
  if (comics.length === 0) {
    $('div.item').each((_, div) => {
      const $div = $(div);
      const $a = $div.find('a[href*="/truyen-tranh/"]').first();
      const slug = extractSlugFromHref($a.attr('href') || '');
      if (!slug || seen.has(slug)) return;
      seen.add(slug);

      const title = cleanText($div.find('h3').first().text()) || cleanText($a.attr('title'));
      const $img = $div.find('img').first();
      const cover = normalizeUrl($img.attr('data-original') || $img.attr('src') || '');
      const chapText = cleanText($div.find('.caption p').first().text());

      comics.push({
        title,
        slug,
        url: `${TRUYENQQ_PRIMARY}/truyen-tranh/${slug}`,
        cover,
        views: '',
        chapters: chapText ? [{ title: chapText, chapterSlug: '', url: '', time: '' }] : []
      });
    });
  }

  return comics;
}

async function getHome(page = 1, sort = 0, status = 0) {
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
  const $ = cheerio.load(html);
  const comics = parseList($);
  const pagination = parsePagination($, page);

  return { comics, pagination, source: 'truyenqq' };
}

async function getGenre(genreSlug, page = 1) {
  const normalizedGenre = GENRE_MAP[genreSlug] || genreSlug;
  const path = page > 1 ? `/the-loai/${normalizedGenre}/trang-${page}` : `/the-loai/${normalizedGenre}`;
  const html = await fetchQQ(path);
  const $ = cheerio.load(html);
  const comics = parseList($);
  const pagination = parsePagination($, page);

  return { genre: genreSlug, comics, pagination, source: 'truyenqq' };
}

async function search(keyword) {
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

  const $ = cheerio.load(html);
  const comics = [];
  const seen = new Set();

  $('li').each((_, li) => {
    const $li = $(li);
    const $a = $li.find('a').first();
    const slug = extractSlugFromHref($a.attr('href') || '');
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = cleanText($li.find('p.name, .name').first().text());
    const $img = $li.find('img').first();
    let cover = normalizeUrl($img.attr('src') || $img.attr('data-fb') || '');
    if (cover.includes('/ebook/80x105/')) {
      cover = cover.replace('/ebook/80x105/', '/ebook/190x247/');
    }

    const chapName = cleanText(
      $li
        .find('p')
        .not('.name')
        .last()
        .text()
    );

    comics.push({
      title,
      slug,
      url: `${TRUYENQQ_PRIMARY}/truyen-tranh/${slug}`,
      cover,
      views: '',
      chapters: chapName
        ? [{ title: chapName, chapterSlug: '', url: '', time: '' }]
        : []
    });
  });

  return {
    keyword,
    comics,
    pagination: {
      currentPage: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false
    },
    source: 'truyenqq'
  };
}

async function resolveSlug(slug) {
  const clean = extractSlugFromHref(slug);
  const res = await search(clean.replace(/-/g, ' '));
  let list = res.comics || [];
  if (list.length === 0) {
    const words = clean.split('-');
    if (words.length > 2) {
      const res2 = await search(words.slice(0, 2).join(' '));
      list = res2.comics || [];
    }
  }
  const match = list.find((c) => c.slug.startsWith(clean)) || list[0];
  return match ? match.slug : null;
}

async function getDetail(slug) {
  let actualSlug = extractSlugFromHref(slug);
  let html = null;

  try {
    html = await fetchQQ(`/truyen-tranh/${actualSlug}`);
  } catch (err) {
    if (!/-\d+$/.test(actualSlug)) {
      const resolved = await resolveSlug(actualSlug);
      if (resolved) {
        actualSlug = resolved;
        html = await fetchQQ(`/truyen-tranh/${actualSlug}`);
      }
    }
    if (!html) throw err;
  }

  const $ = cheerio.load(html);
  const title = cleanText($('h1').first().text()) || actualSlug;
  const $avatarImg = $('.book_avatar img').first();
  const cover = normalizeUrl($avatarImg.attr('data-original') || $avatarImg.attr('src') || '');

  let author = 'Đang cập nhật';
  let status = 'Đang cập nhật';
  let views = 'Đang cập nhật';
  let follows = '';
  let likes = '';

  $('.list-info li').each((_, li) => {
    const $li = $(li);
    const label = cleanText($li.find('.name, p').first().text()).toLowerCase();
    const val = cleanText($li.find('.col-xs-9, .col-xs-8').first().text());
    if (!val) return;
    if (label.includes('tác giả')) author = val;
    else if (label.includes('tình trạng')) status = val;
    else if (label.includes('lượt xem')) views = val;
    else if (label.includes('theo dõi')) follows = val;
    else if (label.includes('lượt thích')) likes = val;
  });

  const description = cleanText($('.story-detail-info').first().text());

  const genres = [];
  const seenGenres = new Set();
  $('.list01 a[href*="/the-loai/"], .book_detail a[href*="/the-loai/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const gSlug = href.split('/the-loai/').pop()?.split('/')[0]?.trim();
    const gName = cleanText($(a).text());
    if (gSlug && gName && !seenGenres.has(gSlug)) {
      seenGenres.add(gSlug);
      genres.push({ slug: gSlug, name: gName });
    }
  });

  const chapters = [];
  const seenChaps = new Set();
  $('.works-chapter-item').each((_, item) => {
    const $item = $(item);
    const $a = $item.find('a').first();
    const href = $a.attr('href') || '';
    const chapSlug = href.split('/').filter(Boolean).pop() || '';
    const chapName = cleanText($a.text());
    const chapTime = cleanText($item.find('.time-chap').first().text());

    if (chapSlug && chapName && !seenChaps.has(chapSlug)) {
      seenChaps.add(chapSlug);
      chapters.push({
        name: chapName,
        chapterSlug: chapSlug,
        time: chapTime,
        url: normalizeUrl(href)
      });
    }
  });

  // Fallback if works-chapter-item isn't present
  if (chapters.length === 0) {
    $('a[href*="-chap"]').each((_, a) => {
      const href = $(a).attr('href') || '';
      const chapName = cleanText($(a).text());
      if (!chapName || chapName.includes('Đọc từ') || chapName.includes('Đọc tiếp')) return;
      const chapSlug = href.split('/').filter(Boolean).pop() || '';
      if (chapSlug && !seenChaps.has(chapSlug)) {
        seenChaps.add(chapSlug);
        chapters.push({
          name: chapName,
          chapterSlug: chapSlug,
          time: '',
          url: normalizeUrl(href)
        });
      }
    });
  }

  return {
    title,
    slug: actualSlug,
    url: `${TRUYENQQ_PRIMARY}/truyen-tranh/${actualSlug}`,
    cover,
    author,
    status,
    views,
    follows,
    likes,
    genres,
    description,
    chapters,
    source: 'truyenqq'
  };
}

async function getChapter(slug, chapterSlug) {
  const actualSlug = extractSlugFromHref(slug);
  const cleanChap = chapterSlug.replace(/^\/?truyen-tranh\//, '').replace(/^\/+|\/+$/g, '');
  let html = null;

  try {
    html = await fetchQQ(`/truyen-tranh/${cleanChap}`);
  } catch (err) {
    if (!cleanChap.startsWith(actualSlug)) {
      html = await fetchQQ(`/truyen-tranh/${actualSlug}-${cleanChap}`);
    } else {
      throw err;
    }
  }

  const $ = cheerio.load(html);
  const rawHeading = cleanText($('h1').first().text()) || cleanText($('title').first().text());
  let comicTitle = actualSlug;
  let chapterTitle = cleanChap;

  if (rawHeading) {
    const sepIdx = rawHeading.lastIndexOf(' - ');
    if (sepIdx !== -1) {
      comicTitle = rawHeading.slice(0, sepIdx).trim() || actualSlug;
      chapterTitle = rawHeading.slice(sepIdx + 3).trim() || cleanChap;
    } else {
      comicTitle = rawHeading;
    }
  }

  const images = [];
  $('.page-chapter img').each((_, img) => {
    const $img = $(img);
    const raw =
      $img.attr('data-original') ||
      $img.attr('data-cdn') ||
      $img.attr('data-src') ||
      $img.attr('src') ||
      '';
    const src = normalizeUrl(raw);
    if (
      src &&
      !src.includes('placeholder') &&
      !src.includes('loading') &&
      !src.includes('logo')
    ) {
      images.push(src);
    }
  });

  let prevChapterSlug = '';
  let nextChapterSlug = '';

  const $prev = $('a.prev, a[class*="prev"]').filter((_, a) => {
    const href = $(a).attr('href') || '';
    return href && !href.startsWith('javascript:') && !$(a).hasClass('disabled');
  }).first();

  const $next = $('a.next, a[class*="next"]').filter((_, a) => {
    const href = $(a).attr('href') || '';
    return href && !href.startsWith('javascript:') && !$(a).hasClass('disabled');
  }).first();

  if ($prev.length) {
    prevChapterSlug = ($prev.attr('href') || '').split('/').filter(Boolean).pop() || '';
  }
  if ($next.length) {
    nextChapterSlug = ($next.attr('href') || '').split('/').filter(Boolean).pop() || '';
  }

  return {
    comicTitle,
    comicSlug: actualSlug,
    chapterTitle,
    currentChapter: chapterTitle,
    chapterSlug: cleanChap,
    images,
    prevChapterSlug,
    nextChapterSlug,
    source: 'truyenqq'
  };
}

module.exports = {
  getHome,
  getGenre,
  search,
  getDetail,
  getChapter
};
