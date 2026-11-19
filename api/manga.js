let crawler;
try {
  crawler = require('../crawler.cjs');
} catch (e) {
  try {
    const path = require('path');
    crawler = require(path.join(process.cwd(), 'crawler.cjs'));
  } catch (e2) {
    console.error('Failed to load crawler.cjs:', e2);
  }
}
const { URL } = require('url');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const hostHeader = req.headers.host || 'localhost';
  const urlObj = new URL(req.url, `https://${hostHeader}`);
  const pathname = decodeURI(urlObj.pathname);

  // Extract endpoint reliably across all Vercel route/rewrite modes
  let endpoint = urlObj.searchParams.get('endpoint');
  if (!endpoint && req.query && req.query.endpoint) {
    endpoint = req.query.endpoint;
  }
  if (!endpoint) {
    const parts = pathname.split('/').filter(Boolean);
    const last = parts.pop();
    endpoint = (last === 'manga' || last === 'manga.js') ? (parts.pop() || '') : last;
  }
  if (endpoint) {
    endpoint = endpoint.replace(/^\/+|\/+$/g, '');
  }

  const sendJson = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  try {
    if (endpoint === 'home') {
      const page = parseInt(urlObj.searchParams.get('page') || (req.query && req.query.page) || '1', 10);
      const sort = parseInt(urlObj.searchParams.get('sort') || (req.query && req.query.sort) || '0', 10);
      const status = parseInt(urlObj.searchParams.get('status') || (req.query && req.query.status) || '0', 10);
      const data = await crawler.getHome(page, sort, status);
      sendJson(200, data);
      return;
    }

    if (endpoint === 'search') {
      const q = urlObj.searchParams.get('q') || (req.query && req.query.q) || '';
      const page = parseInt(urlObj.searchParams.get('page') || (req.query && req.query.page) || '1', 10);
      const data = await crawler.searchManga(q, page);
      sendJson(200, data);
      return;
    }

    if (endpoint === 'genre') {
      const slug = urlObj.searchParams.get('slug') || (req.query && req.query.slug) || '';
      const page = parseInt(urlObj.searchParams.get('page') || (req.query && req.query.page) || '1', 10);
      const data = await crawler.getGenre(slug, page);
      sendJson(200, data);
      return;
    }

    if (endpoint === 'detail') {
      const slug = urlObj.searchParams.get('slug') || (req.query && req.query.slug) || '';
      const data = await crawler.getDetail(slug);
      sendJson(200, data);
      return;
    }

    if (endpoint === 'chapter') {
      const slug = urlObj.searchParams.get('slug') || (req.query && req.query.slug) || '';
      const chapter = urlObj.searchParams.get('chapter') || (req.query && req.query.chapter) || '';
      const data = await crawler.getChapter(slug, chapter);
      sendJson(200, data);
      return;
    }

    if (endpoint === 'image') {
      const imgUrl = urlObj.searchParams.get('url') || (req.query && req.query.url) || '';
      crawler.proxyImageStream(imgUrl, res);
      return;
    }

    sendJson(404, { error: `Endpoint '${endpoint}' not found` });
  } catch (err) {
    sendJson(500, { error: err.message });
  }
};
