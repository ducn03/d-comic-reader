/**
 * Unified API Request Handler shared by Local Server (server.cjs)
 * and Vercel Serverless Function (api/manga.js).
 */
const { URL } = require('url');
const sources = require('./sources/index.cjs');
const { proxyImageStream } = require('./image-proxy.cjs');
const nettruyen = require('./sources/nettruyen.cjs');

function sendJson(res, status, data, maxAge = 120) {
  const cacheControl =
    status === 200
      ? `public, max-age=${maxAge}, s-maxage=${maxAge * 3}, stale-while-revalidate=86400`
      : 'no-cache, no-store';

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', cacheControl);
    res.status(status).json(data);
    return;
  }

  if (!res.headersSent) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl
    });
  }
  res.end(JSON.stringify(data));
}

function extractEndpoint(req, urlObj) {
  const getParam = (name) => {
    if (req.query && req.query[name] !== undefined) return String(req.query[name]);
    return urlObj.searchParams.get(name) || '';
  };

  let endpoint = getParam('endpoint');
  if (endpoint) {
    endpoint = endpoint.replace(/^manga\/?/, '').replace(/\.js$/, '').trim();
  }

  if (!endpoint || endpoint === 'manga') {
    const parts = decodeURI(urlObj.pathname)
      .split('/')
      .filter((p) => Boolean(p) && p !== 'api' && p !== 'manga' && p !== 'manga.js');
    endpoint = parts.pop() || '';
  }

  if (!endpoint || endpoint === 'manga') {
    const originalUrl = req.headers['x-matched-path'] || req.url || '';
    const cleanPath = originalUrl.split('?')[0];
    const match = cleanPath.match(/\/api\/(?:manga\/)?([^/]+)/);
    if (match && match[1] && match[1] !== 'manga.js' && match[1] !== 'manga') {
      endpoint = match[1];
    }
  }

  return {
    endpoint: endpoint.replace(/^\/+|\/+$/g, '').split('?')[0].trim(),
    getParam
  };
}

async function handleApiRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    if (typeof res.writeHead === 'function') res.writeHead(204);
    else if (typeof res.status === 'function') res.status(204);
    res.end();
    return;
  }

  const hostHeader = req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const urlObj = new URL(req.url, `${proto}://${hostHeader}`);
  const { endpoint, getParam } = extractEndpoint(req, urlObj);

  try {
    if (endpoint === 'ping') {
      sendJson(res, 200, {
        ok: true,
        version: '3.2',
        node: process.version
      }, 0);
      return;
    }

    if (endpoint === 'home') {
      const page = Math.max(1, parseInt(getParam('page') || '1', 10) || 1);
      const sort = parseInt(getParam('sort') || '0', 10) || 0;
      const status = parseInt(getParam('status') || '0', 10) || 0;
      const data = await sources.getHome(page, sort, status);
      sendJson(res, 200, data, 180);
      return;
    }

    if (endpoint === 'search') {
      const q = getParam('q');
      const page = Math.max(1, parseInt(getParam('page') || '1', 10) || 1);
      const data = await sources.searchManga(q, page);
      sendJson(res, 200, data, 180);
      return;
    }

    if (endpoint === 'genre') {
      const slug = getParam('slug');
      const page = Math.max(1, parseInt(getParam('page') || '1', 10) || 1);
      const data = await sources.getGenre(slug, page);
      sendJson(res, 200, data, 300);
      return;
    }

    if (endpoint === 'genres') {
      sendJson(res, 200, sources.getGenres(), 3600);
      return;
    }

    if (endpoint === 'detail') {
      const slug = getParam('slug');
      const data = await sources.getDetail(slug);
      sendJson(res, 200, data, 300);
      return;
    }

    if (endpoint === 'chapter') {
      const slug = getParam('slug');
      const chapter = getParam('chapter');
      const data = await sources.getChapter(slug, chapter);
      sendJson(res, 200, data, 1800);
      return;
    }

    if (endpoint === 'image') {
      const imgUrl = getParam('url');
      await proxyImageStream(imgUrl, req, res, {
        fallbackReferer: nettruyen.getActiveBase()
      });
      return;
    }

    sendJson(res, 404, { error: `Endpoint '${endpoint}' not found` });
  } catch (err) {
    console.error(`[API Error] ${endpoint}:`, err.message);
    sendJson(res, 500, { error: err.message });
  }
}

module.exports = {
  handleApiRequest,
  extractEndpoint
};
