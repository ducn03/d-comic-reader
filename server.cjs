/**
 * Standalone MangaFlow Local Server
 * Serves static frontend from public/ (with Gzip/Brotli & ETag) and API via lib/api-handler.cjs
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { URL } = require('url');
const { handleApiRequest } = require('./api/_lib/api-handler.cjs');

process.on('uncaughtException', (err) => {
  console.error('Server process caught unhandled exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Server process caught unhandled rejection:', reason);
});

let PORT = parseInt(process.env.PORT || '3000', 10) || 3000;
const PUBLIC_DIR = path.resolve(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);

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

function serveStatic(req, res, pathname) {
  let relativePath = pathname === '/' || pathname === '' ? '/index.html' : pathname;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(relativePath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('400 Bad Request');
    return;
  }

  const normalizedRel = path.normalize(decodedPath).replace(/^([/\\])+/, '');
  const filePath = path.resolve(PUBLIC_DIR, normalizedRel);

  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('403 Forbidden');
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
    const etag = `W/"${stats.size}-${Math.floor(stats.mtimeMs)}"`;

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      res.end();
      return;
    }

    const cacheControl =
      ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=3600';

    const headers = {
      'Content-Type': contentType,
      'ETag': etag,
      'Cache-Control': cacheControl,
      'Vary': 'Accept-Encoding'
    };

    const acceptEncoding = String(req.headers['accept-encoding'] || '');
    const canCompress = COMPRESSIBLE_EXTS.has(ext) && stats.size > 512;

    if (canCompress && acceptEncoding.includes('br')) {
      headers['Content-Encoding'] = 'br';
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(zlib.createBrotliCompress()).pipe(res);
      return;
    }

    if (canCompress && acceptEncoding.includes('gzip')) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
      return;
    }

    headers['Content-Length'] = stats.size;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const urlObj = new URL(req.url, `http://${hostHeader}`);
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/api/')) {
    await handleApiRequest(req, res);
    return;
  }

  serveStatic(req, res, pathname);
});

function startServer(port) {
  server
    .listen(port, '0.0.0.0', () => {
      PORT = port;
      const ip = getLocalIP();
      console.log('===========================================================');
      console.log('  MANGAFLOW - WEB DOC TRUYEN (TRUYENQQ / NETTRUYEN)');
      console.log('===========================================================');
      console.log('');
      console.log('  May tinh truy cap: http://localhost:' + port);
      console.log(`  Dien thoai truy cap (cung Wi-Fi): http://${ip}:${port}`);
      console.log('');
      console.log('===========================================================');
      console.log('Nhan Ctrl + C de dung server.');
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} dang ban, thu port ${port + 1}...`);
        startServer(port + 1);
      } else {
        console.error('Server error:', err);
      }
    });
}

startServer(PORT);
