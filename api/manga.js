let crawler;
try {
  crawler = require('./crawler.cjs');
} catch (e1) {
  try {
    crawler = require('../crawler.cjs');
  } catch (e2) {
    try {
      const path = require('path');
      crawler = require(path.join(process.cwd(), 'crawler.cjs'));
    } catch (e3) {
      console.error('Failed to load crawler.cjs:', e3);
    }
  }
}
const { URL } = require('url');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead ? res.writeHead(204) : res.status(204);
    res.end();
    return;
  }

  const hostHeader = req.headers.host || 'localhost';
  const urlObj = new URL(req.url, `https://${hostHeader}`);

  const getParam = (name) => {
    if (req.query && req.query[name] !== undefined) return req.query[name];
    return urlObj.searchParams.get(name) || '';
  };

  // Extract endpoint reliably across all Vercel route/rewrite modes
  let endpoint = getParam('endpoint');
  if (endpoint) {
    endpoint = endpoint.replace(/^manga\/?/, '').replace(/\.js$/, '').trim();
  }

  if (!endpoint || endpoint === 'manga') {
    const parts = decodeURI(urlObj.pathname).split('/').filter(p => Boolean(p) && p !== 'api' && p !== 'manga' && p !== 'manga.js');
    endpoint = parts.pop() || '';
  }

  if (!endpoint || endpoint === 'manga') {
    const originalUrl = req.headers['x-matched-path'] || req.url;
    if (originalUrl) {
      const cleanPath = originalUrl.split('?')[0];
      const match = cleanPath.match(/\/api\/(?:manga\/)?([^\/]+)/);
      if (match && match[1] && match[1] !== 'manga.js' && match[1] !== 'manga') {
        endpoint = match[1];
      }
    }
  }

  if (endpoint) {
    endpoint = endpoint.replace(/^\/+|\/+$/g, '').trim();
  }

  const sendJson = (status, data, maxAge = 120) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (status === 200) {
      res.setHeader('Cache-Control', `public, max-age=${maxAge}, s-maxage=${maxAge * 3}, stale-while-revalidate=86400`);
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store');
    }
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(status).json(data);
      return;
    }
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? `public, max-age=${maxAge}, s-maxage=${maxAge * 3}, stale-while-revalidate=86400` : 'no-cache, no-store'
    });
    res.end(JSON.stringify(data));
  };

  try {
    if (endpoint === 'probe') {
      const domains = [
        'https://truyenqq.com.vn',
        'https://truyenqqviet.com',
        'https://truyenqqno.com',
        'https://truyenqqto.com',
        'https://nettruyennew.com',
        'https://nettruyenviet10.com',
        'https://nettruyenbb.com',
        'https://nettruyentv.me',
        'https://hinettruyen.com',
        'https://gonettruyen.com',
        'https://cuutruyen.net'
      ];
      const results = [];
      for (const d of domains) {
        try {
          const start = Date.now();
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort(), 3500);
          const resp = await fetch(d, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });
          clearTimeout(to);
          const text = await resp.text();
          const isCF = text.includes('Just a moment...') || text.includes('cf-browser-verification');
          results.push({
            url: d,
            status: resp.status,
            ms: Date.now() - start,
            len: text.length,
            isCF,
            sample: text.slice(0, 100).replace(/\s+/g, ' ')
          });
        } catch (e) {
          results.push({ url: d, error: e.message });
        }
      }
      sendJson(200, results, 0);
      return;
    }

    if (endpoint === 'home') {
      const page = parseInt(getParam('page') || '1', 10);
      const sort = parseInt(getParam('sort') || '0', 10);
      const status = parseInt(getParam('status') || '0', 10);
      const data = await crawler.getHome(page, sort, status);
      sendJson(200, data, 180);
      return;
    }

    if (endpoint === 'search') {
      const q = getParam('q');
      const page = parseInt(getParam('page') || '1', 10);
      const data = await crawler.searchManga(q, page);
      sendJson(200, data, 180);
      return;
    }

    if (endpoint === 'genre') {
      const slug = getParam('slug');
      const page = parseInt(getParam('page') || '1', 10);
      const data = await crawler.getGenre(slug, page);
      sendJson(200, data, 300);
      return;
    }

    if (endpoint === 'detail') {
      const slug = getParam('slug');
      const data = await crawler.getDetail(slug);
      sendJson(200, data, 300);
      return;
    }

    if (endpoint === 'chapter') {
      const slug = getParam('slug');
      const chapter = getParam('chapter');
      const data = await crawler.getChapter(slug, chapter);
      sendJson(200, data, 1800);
      return;
    }

    if (endpoint === 'image') {
      const imgUrl = getParam('url');
      crawler.proxyImageStream(imgUrl, res);
      return;
    }

    sendJson(404, {
      error: `Endpoint '${endpoint}' not found`,
      url: req.url,
      query: req.query,
      matched: req.headers['x-matched-path']
    });
  } catch (err) {
    sendJson(500, { error: err.message });
  }
};
