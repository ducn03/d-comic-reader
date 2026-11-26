/**
 * Async Image Proxy with Keep-Alive Pooling, Redirect Handling,
 * SSRF Protection, MIME & Size Guards, and Long-Term Cache Headers.
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');
const unwrap = (m) => (m && m.default && typeof m.default === 'object' ? { ...m.default, ...m } : m);
const { USER_AGENT, httpAgent, httpsAgent, validateExternalUrl } = unwrap(require('./http-client.cjs'));

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

function getRefererForHost(hostname, fallbackBase = 'https://nettruyenar.com') {
  const host = hostname.toLowerCase();
  if (
    host.includes('truyenqq') ||
    host.includes('truyenvua') ||
    host.includes('hinhhinh') ||
    host.includes('tintruyen') ||
    host.includes('cc3t.net')
  ) {
    return 'https://truyenqqko.com/';
  }
  return fallbackBase.endsWith('/') ? fallbackBase : `${fallbackBase}/`;
}

function sendError(clientRes, status, message) {
  if (!clientRes.headersSent && !clientRes.writableEnded) {
    clientRes.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store'
    });
    clientRes.end(message);
  } else if (!clientRes.writableEnded) {
    clientRes.end();
  }
}

/**
 * Proxies an external comic image stream to the HTTP response.
 * Always returns a Promise that resolves once streaming completes or aborts,
 * ensuring serverless runtimes (Vercel) do not terminate prematurely.
 */
function proxyImageStream(imageUrl, clientReq, clientRes, options = {}, redirectDepth = 0) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    if (!imageUrl) {
      sendError(clientRes, 400, 'Missing image URL');
      finish();
      return;
    }

    let parsed;
    try {
      parsed = validateExternalUrl(imageUrl);
    } catch (err) {
      sendError(clientRes, 403, `Blocked image URL: ${err.message}`);
      finish();
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const referer = getRefererForHost(parsed.hostname, options.fallbackReferer);

    const headers = {
      'User-Agent': USER_AGENT,
      'Referer': referer,
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site'
    };

    if (clientReq?.headers) {
      if (clientReq.headers['if-none-match']) {
        headers['If-None-Match'] = clientReq.headers['if-none-match'];
      }
      if (clientReq.headers['if-modified-since']) {
        headers['If-Modified-Since'] = clientReq.headers['if-modified-since'];
      }
    }

    let activeReq = null;

    const onClientClose = () => {
      if (activeReq && !activeReq.destroyed) {
        activeReq.destroy();
      }
      finish();
    };

    clientRes.once('close', onClientClose);
    clientRes.once('finish', finish);
    clientRes.once('error', onClientClose);

    activeReq = client.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        agent: isHttps ? httpsAgent : httpAgent,
        headers,
        timeout: 12000
      },
      (remoteRes) => {
        // Handle redirects
        if (REDIRECT_STATUSES.has(remoteRes.statusCode) && remoteRes.headers.location) {
          remoteRes.resume();
          clientRes.removeListener('close', onClientClose);
          clientRes.removeListener('finish', finish);
          clientRes.removeListener('error', onClientClose);

          if (redirectDepth >= 3) {
            sendError(clientRes, 502, 'Too many image redirects');
            finish();
            return;
          }

          let nextUrl;
          try {
            nextUrl = new URL(remoteRes.headers.location, parsed.href).href;
          } catch {
            sendError(clientRes, 502, 'Invalid redirect URL');
            finish();
            return;
          }

          proxyImageStream(nextUrl, clientReq, clientRes, options, redirectDepth + 1).then(finish);
          return;
        }

        // Pass 304 Not Modified cleanly
        if (remoteRes.statusCode === 304) {
          remoteRes.resume();
          if (!clientRes.headersSent) {
            clientRes.writeHead(304, {
              'Cache-Control': 'public, max-age=604800, s-maxage=2592000, immutable',
              'Access-Control-Allow-Origin': '*'
            });
            clientRes.end();
          }
          finish();
          return;
        }

        // Reject upstream errors without caching
        if (remoteRes.statusCode >= 400) {
          remoteRes.resume();
          sendError(clientRes, remoteRes.statusCode, `Upstream image error: HTTP ${remoteRes.statusCode}`);
          finish();
          return;
        }

        // Validate Content-Type
        const contentType = (remoteRes.headers['content-type'] || '').toLowerCase();
        const isImageType =
          !contentType ||
          contentType.startsWith('image/') ||
          contentType.includes('application/octet-stream');

        if (!isImageType) {
          remoteRes.resume();
          sendError(clientRes, 502, `Invalid image Content-Type: ${contentType}`);
          finish();
          return;
        }

        // Validate Content-Length guard
        const contentLength = parseInt(remoteRes.headers['content-length'] || '0', 10);
        if (contentLength > MAX_IMAGE_BYTES) {
          remoteRes.resume();
          sendError(clientRes, 413, 'Image exceeds maximum allowed size');
          finish();
          return;
        }

        const respHeaders = {
          'Content-Type': remoteRes.headers['content-type'] || 'image/jpeg',
          'Cache-Control': 'public, max-age=604800, s-maxage=2592000, immutable',
          'Access-Control-Allow-Origin': '*',
          'X-Content-Type-Options': 'nosniff'
        };
        if (remoteRes.headers['content-length']) {
          respHeaders['Content-Length'] = remoteRes.headers['content-length'];
        }
        if (remoteRes.headers['etag']) {
          respHeaders['ETag'] = remoteRes.headers['etag'];
        }
        if (remoteRes.headers['last-modified']) {
          respHeaders['Last-Modified'] = remoteRes.headers['last-modified'];
        }

        if (!clientRes.headersSent) {
          clientRes.writeHead(200, respHeaders);
        }

        let streamedBytes = 0;
        remoteRes.on('data', (chunk) => {
          streamedBytes += chunk.length;
          if (streamedBytes > MAX_IMAGE_BYTES) {
            remoteRes.destroy(new Error('Image stream exceeded size limit'));
          }
        });

        remoteRes.on('error', (err) => {
          if (!clientRes.headersSent) {
            sendError(clientRes, 502, err.message);
          } else if (!clientRes.writableEnded) {
            clientRes.destroy();
          }
          finish();
        });

        remoteRes.pipe(clientRes);
      }
    );

    activeReq.on('error', (err) => {
      sendError(clientRes, 502, `Proxy error: ${err.message}`);
      finish();
    });

    activeReq.on('timeout', () => {
      activeReq.destroy();
      sendError(clientRes, 504, 'Image proxy timeout');
      finish();
    });

    activeReq.end();
  });
}

exports.proxyImageStream = proxyImageStream;
exports.getRefererForHost = getRefererForHost;
