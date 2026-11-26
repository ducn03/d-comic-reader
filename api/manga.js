const path = require('path');
const { URL } = require('url');

let handleApiRequest = null;
let loadError = null;

try {
  ({ handleApiRequest } = require('../lib/api-handler.cjs'));
} catch (err1) {
  try {
    ({ handleApiRequest } = require(path.join(process.cwd(), 'lib', 'api-handler.cjs')));
  } catch (err2) {
    loadError = err2 || err1;
    console.error('Failed to load lib/api-handler.cjs:', err1?.message, err2?.message);
  }
}

function sendJsonSafe(res, status, body) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(status).json(body);
    return;
  }
  if (!res.headersSent) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  }
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  try {
    const hostHeader = req.headers?.host || 'localhost';
    const urlObj = new URL(req.url || '/', `https://${hostHeader}`);
    const ep = (req.query?.endpoint || urlObj.searchParams.get('endpoint') || '').trim();

    if (ep === 'ping') {
      sendJsonSafe(res, 200, {
        ok: true,
        entry: 'api/manga.js',
        version: '3.2',
        node: process.version,
        loaded: Boolean(handleApiRequest),
        loadError: loadError ? loadError.message : null
      });
      return;
    }

    if (!handleApiRequest) {
      sendJsonSafe(res, 500, {
        error: 'Serverless init failed',
        detail: loadError ? loadError.message : 'Unknown module load error'
      });
      return;
    }

    await handleApiRequest(req, res);
  } catch (err) {
    console.error('Unhandled API error:', err);
    sendJsonSafe(res, 500, {
      error: 'Unhandled serverless error',
      detail: err?.message || String(err)
    });
  }
};
