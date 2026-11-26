let handleApiRequest = null;
let loadError = null;

try {
  ({ handleApiRequest } = require('../lib/api-handler.cjs'));
} catch (err) {
  loadError = err;
  console.error('Failed to load ../lib/api-handler.cjs:', err);
}

function sendFallbackError(res, message, detail) {
  const body = { error: message, detail: detail || 'Unknown error' };
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(500).json(body);
    return;
  }
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
  }
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (!handleApiRequest) {
    sendFallbackError(res, 'Serverless init failed', loadError?.message);
    return;
  }

  try {
    await handleApiRequest(req, res);
  } catch (err) {
    console.error('Unhandled API error:', err);
    sendFallbackError(res, 'Unhandled serverless error', err?.message);
  }
};
