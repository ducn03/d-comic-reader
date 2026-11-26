/**
 * Pooled HTTP/HTTPS Client with Keep-Alive, Compression, Redirects,
 * Per-Host Concurrency Limiting, and SSRF URL Validation.
 */
const http = require('http');
const https = require('https');
const net = require('net');
const zlib = require('zlib');
const { URL } = require('url');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 64,
  keepAliveMsecs: 30000
});

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Per-host soft concurrency limiter
const hostQueues = new Map();
const MAX_CONCURRENT_PER_HOST = 4;

async function withHostLimit(hostname, taskFn, signal) {
  let state = hostQueues.get(hostname);
  if (!state) {
    state = { active: 0, queue: [] };
    hostQueues.set(hostname, state);
  }

  if (state.active >= MAX_CONCURRENT_PER_HOST) {
    await new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Aborted'));
        return;
      }
      const entry = { resolve, reject, onAbort: null };
      if (signal) {
        entry.onAbort = () => {
          const idx = state.queue.indexOf(entry);
          if (idx !== -1) state.queue.splice(idx, 1);
          reject(new Error('Aborted'));
        };
        signal.addEventListener('abort', entry.onAbort, { once: true });
      }
      state.queue.push(entry);
    });
  }

  state.active++;
  try {
    return await taskFn();
  } finally {
    state.active--;
    const next = state.queue.shift();
    if (next) {
      if (signal && next.onAbort) {
        // Note: signal belongs to next waiter if attached inside its entry; handled on wake
      }
      next.resolve();
    } else if (state.active === 0) {
      hostQueues.delete(hostname);
    }
  }
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(n => parseInt(n, 10));
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

function isPrivateIPv6(ip) {
  const clean = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (clean === '::1' || clean === '::') return true;
  if (clean.startsWith('fc') || clean.startsWith('fd')) return true; // ULA fc00::/7
  if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb')) {
    return true; // Link-local fe80::/10
  }
  if (clean.startsWith('::ffff:')) {
    const mapped = clean.slice(7);
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped);
  }
  return false;
}

/**
 * Validates that an external URL uses http(s) and does not target
 * localhost, local domains, or private/reserved IP ranges (SSRF protection).
 */
function validateExternalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL is required');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL format');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  if (!hostname) {
    throw new Error('Missing hostname');
  }

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.arpa')
  ) {
    throw new Error('Blocked local hostname');
  }

  // Block integer/hex/octal IP representations
  if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) {
    throw new Error('Blocked numeric IP hostname');
  }

  const unbracketed = hostname.replace(/^\[|\]$/g, '');
  const ipVersion = net.isIP(unbracketed);
  if (ipVersion === 4 && isPrivateIPv4(unbracketed)) {
    throw new Error('Blocked private IPv4 address');
  }
  if (ipVersion === 6 && isPrivateIPv6(unbracketed)) {
    throw new Error('Blocked private IPv6 address');
  }

  return parsed;
}

function createDecompressStream(res) {
  const encoding = (res.headers['content-encoding'] || '').toLowerCase().trim();
  if (encoding === 'br') return res.pipe(zlib.createBrotliDecompress());
  if (encoding === 'gzip') return res.pipe(zlib.createGunzip());
  if (encoding === 'deflate') return res.pipe(zlib.createInflate());
  return res;
}

function requestOnce(parsedUrl, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const method = (options.method || 'GET').toUpperCase();

    const req = client.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method,
        agent: isHttps ? httpsAgent : httpAgent,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          ...(options.headers || {})
        },
        timeout: options.timeout || 7000
      },
      (res) => {
        if (REDIRECT_STATUSES.has(res.statusCode) && res.headers.location) {
          res.resume();
          resolve({
            redirect: res.headers.location,
            statusCode: res.statusCode
          });
          return;
        }

        const stream = createDecompressStream(res);
        const chunks = [];

        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} on ${parsedUrl.href}`));
          } else {
            resolve({ body, statusCode: res.statusCode });
          }
        });
        stream.on('error', (err) => reject(err));
      }
    );

    const onAbort = () => {
      req.destroy(new Error('Aborted'));
    };

    if (options.signal) {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    req.on('error', (err) => {
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout on ${parsedUrl.href}`));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * Fetches text/HTML using keep-alive connection pooling, gzip/br decompression,
 * automatic redirect following, per-host concurrency limiting, and optional AbortSignal.
 */
async function fetchText(targetUrl, options = {}, redirectDepth = 0) {
  const parsedUrl = validateExternalUrl(targetUrl);

  const response = await withHostLimit(
    parsedUrl.hostname,
    () => requestOnce(parsedUrl, options),
    options.signal
  );

  if (response.redirect) {
    if (redirectDepth >= 4) {
      throw new Error(`Too many redirects for ${targetUrl}`);
    }
    const nextUrl = new URL(response.redirect, parsedUrl.href).href;
    const nextOptions =
      response.statusCode === 303
        ? { ...options, method: 'GET', body: undefined }
        : options;
    return fetchText(nextUrl, nextOptions, redirectDepth + 1);
  }

  return response.body;
}

exports.USER_AGENT = USER_AGENT;
exports.httpAgent = httpAgent;
exports.httpsAgent = httpsAgent;
exports.validateExternalUrl = validateExternalUrl;
exports.fetchText = fetchText;
