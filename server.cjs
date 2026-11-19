/**
 * Standalone MangaFlow Server
 * Runs on Port 3000 (or next available port)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const crawler = require('./crawler.cjs');

let PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public'))
  ? path.join(__dirname, 'public')
  : __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const urlObj = new URL(req.url, `http://${hostHeader}`);
  const pathname = decodeURI(urlObj.pathname);

  // API Endpoints
  if (pathname.startsWith('/api/manga/') || pathname.startsWith('/api/')) {
    const endpoint = pathname.startsWith('/api/manga/')
      ? pathname.replace('/api/manga/', '')
      : pathname.replace('/api/', '');

    try {
      if (endpoint === 'home') {
        const page = parseInt(urlObj.searchParams.get('page') || '1', 10);
        const sort = parseInt(urlObj.searchParams.get('sort') || '0', 10);
        const status = parseInt(urlObj.searchParams.get('status') || '0', 10);
        const data = await crawler.getHome(page, sort, status);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }

      if (endpoint === 'search') {
        const q = urlObj.searchParams.get('q') || '';
        const page = parseInt(urlObj.searchParams.get('page') || '1', 10);
        const data = await crawler.searchManga(q, page);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }

      if (endpoint === 'genre') {
        const slug = urlObj.searchParams.get('slug') || '';
        const page = parseInt(urlObj.searchParams.get('page') || '1', 10);
        const data = await crawler.getGenre(slug, page);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }

      if (endpoint === 'detail') {
        const slug = urlObj.searchParams.get('slug') || '';
        const data = await crawler.getDetail(slug);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }

      if (endpoint === 'chapter') {
        const slug = urlObj.searchParams.get('slug') || '';
        const chapter = urlObj.searchParams.get('chapter') || '';
        const data = await crawler.getChapter(slug, chapter);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }

      if (endpoint === 'image') {
        const imgUrl = urlObj.searchParams.get('url') || '';
        crawler.proxyImageStream(imgUrl, res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
      return;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
  }

  // Static File Serving
  let relativePath = pathname;
  if (relativePath === '/' || relativePath === '') {
    relativePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Length': stats.size,
      'Content-Type': contentType
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

function startServer(port) {
  server.listen(port, '0.0.0.0', () => {
    PORT = port;
    const ip = getLocalIP();
    console.log('===========================================================');
    console.log('📖 MANGAFLOW - WEB DOC TRUYEN (CRAWL HINETTRUYEN.COM)');
    console.log('===========================================================');
    console.log('');
    console.log('  👉 May tinh truy cap: http://localhost:' + port);
    console.log(`  👉 Dien thoai truy cap (cung Wi-Fi): http://${ip}:${port}`);
    console.log('');
    console.log('===========================================================');
    console.log('Nhan Ctrl + C de dung server.');
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} dang ban, thu port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);
