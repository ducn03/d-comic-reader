const { handleApiRequest } = require('../lib/api-handler.cjs');

module.exports = async (req, res) => {
  await handleApiRequest(req, res);
};
