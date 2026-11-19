const crawler = require('../crawler.cjs');
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
  const endpoint = pathname.split('/').pop();

  try {
    if (endpoint === 'home') {
      const page = parseInt(urlObj.searchParams.get('page') || '1', 10);
      const sort = parseInt(urlObj.searchParams.get('sort') || '0', 10);
      const status = parseInt(urlObj.searchParams.get('status') || '0', 10);
      const data = await crawler.getHome(page, sort, status);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify(data));
      return;
    }

    if (endpoint === 'search') {
      const q = urlObj.searchParams.get('q') || '';
      const page = parseInt(urlObj.searchParams.get('page') || '1', 10);
      const data = await crawler.searchManga(q, page);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify(data));
      return;
    }

    if (endpoint === 'genre') {
      const slug = urlObj.searchParams.get('slug') || '';
      const page = parseInt(urlObj.searchParams.get('page') || '1', 10);
      const data = await crawler.getGenre(slug, page);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify(data));
      return;
    }

    if (endpoint === 'detail') {
      const slug = urlObj.searchParams.get('slug') || '';
      const data = await crawler.getDetail(slug);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify(data));
      return;
    }

    if (endpoint === 'chapter') {
      const slug = urlObj.searchParams.get('slug') || '';
      const chapter = urlObj.searchParams.get('chapter') || '';
      const data = await crawler.getChapter(slug, chapter);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify(data));
      return;
    }

    if (endpoint === 'image') {
      const imgUrl = urlObj.searchParams.get('url') || '';
      crawler.proxyImageStream(imgUrl, res);
      return;
    }

    res.status(404).json({ error: 'Endpoint not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
