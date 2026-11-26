let handleApiRequest = null;
let loadError = null;

try {
  ({ handleApiRequest } = require('./_lib/api-handler.cjs'));
} catch (err) {
  loadError = err;
  console.error('Failed to load ./_lib/api-handler.cjs:', err);
}

module.exports = async (req, res) => {
  if (!handleApiRequest) {
    const payload = JSON.stringify({
      error: 'Serverless init failed',
      detail: loadError ? loadError.message : 'Unknown module load error'
    });
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(500).json(JSON.parse(payload));
      return;
    }
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
    return;
  }

  await handleApiRequest(req, res);
};
