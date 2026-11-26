/**
 * Source Orchestrator with LRU TTL Caching, Request Coalescing, and Automatic Fallback.
 */
const cache = require('../cache.cjs');
const truyenqq = require('./truyenqq.cjs');
const nettruyen = require('./nettruyen.cjs');
const { GENRES } = require('./genres.cjs');

async function getHome(page = 1, sort = 0, status = 0) {
  const key = `home_${page}_${sort}_${status}`;
  return cache.getOrFetch(
    key,
    180,
    async () => {
      try {
        const res = await truyenqq.getHome(page, sort, status);
        if (res.comics && res.comics.length > 0) return res;
      } catch (err) {
        console.warn('[Source] TruyenQQ getHome fallback:', err.message);
      }
      return nettruyen.getHome(page, sort, status);
    },
    (res) => Boolean(res && res.comics && res.comics.length > 0)
  );
}

async function searchManga(keyword, page = 1) {
  const cleanKw = (keyword || '').trim();
  if (!cleanKw) {
    return {
      keyword: '',
      comics: [],
      pagination: { currentPage: 1, totalPages: 1, hasNext: false, hasPrev: false }
    };
  }

  const key = `search_${cleanKw.toLowerCase()}_${page}`;
  return cache.getOrFetch(
    key,
    180,
    async () => {
      if (page === 1) {
        try {
          const res = await truyenqq.search(cleanKw);
          if (res.comics && res.comics.length > 0) return res;
        } catch (err) {
          console.warn('[Source] TruyenQQ search fallback:', err.message);
        }
      }
      try {
        return await nettruyen.search(cleanKw, page);
      } catch (err2) {
        console.warn('[Source] NetTruyen search failed:', err2.message);
        return {
          keyword: cleanKw,
          comics: [],
          pagination: { currentPage: page, totalPages: 1, hasNext: false, hasPrev: page > 1 }
        };
      }
    },
    (res) => Boolean(res && res.comics && res.comics.length > 0)
  );
}

async function getGenre(genreSlug, page = 1) {
  const cleanSlug = (genreSlug || '').trim();
  const key = `genre_${cleanSlug}_${page}`;
  return cache.getOrFetch(
    key,
    300,
    async () => {
      try {
        const res = await truyenqq.getGenre(cleanSlug, page);
        if (res.comics && res.comics.length > 0) return res;
      } catch (err) {
        console.warn('[Source] TruyenQQ getGenre fallback:', err.message);
      }
      return nettruyen.getGenre(cleanSlug, page);
    },
    (res) => Boolean(res && res.comics && res.comics.length > 0)
  );
}

async function getDetail(slug) {
  const cleanSlug = (slug || '').trim();
  if (!cleanSlug) throw new Error('Missing comic slug');

  const key = `detail_${cleanSlug}`;
  return cache.getOrFetch(
    key,
    300,
    async () => {
      let qqErr = null;
      try {
        const detail = await truyenqq.getDetail(cleanSlug);
        if (detail && detail.chapters && detail.chapters.length > 0) {
          return detail;
        }
        qqErr = 'Empty chapters list';
      } catch (err) {
        qqErr = err.message;
        console.warn('[Source] TruyenQQ getDetail fallback:', err.message);
      }

      try {
        const fallbackDetail = await nettruyen.getDetail(cleanSlug);
        if (fallbackDetail && fallbackDetail.chapters && fallbackDetail.chapters.length > 0) {
          return fallbackDetail;
        }
        throw new Error('Fallback returned empty chapters');
      } catch (err2) {
        throw new Error(`Comic '${cleanSlug}' unavailable. TruyenQQ: ${qqErr} | NetTruyen: ${err2.message}`);
      }
    },
    (res) => Boolean(res && res.chapters && res.chapters.length > 0)
  );
}

async function getChapter(slug, chapterSlug) {
  const cleanSlug = (slug || '').trim();
  const cleanChap = (chapterSlug || '').trim();
  if (!cleanSlug || !cleanChap) throw new Error('Missing comic or chapter slug');

  const key = `chapter_${cleanSlug}_${cleanChap}`;
  return cache.getOrFetch(
    key,
    1800,
    async () => {
      try {
        const chap = await truyenqq.getChapter(cleanSlug, cleanChap);
        if (chap && chap.images && chap.images.length > 0) {
          return chap;
        }
      } catch (err) {
        console.warn('[Source] TruyenQQ getChapter fallback:', err.message);
      }

      const fallbackChap = await nettruyen.getChapter(cleanSlug, cleanChap);
      if (!fallbackChap || !fallbackChap.images || fallbackChap.images.length === 0) {
        throw new Error(`Chapter '${cleanChap}' not found or images unavailable`);
      }
      return fallbackChap;
    },
    (res) => Boolean(res && res.images && res.images.length > 0)
  );
}

function getGenres() {
  return { genres: GENRES };
}

module.exports = {
  getHome,
  searchManga,
  getGenre,
  getDetail,
  getChapter,
  getGenres
};
