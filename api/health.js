require('dotenv').config();
const {
  applySecurityHeaders,
  setCors,
} = require('../lib/http-security');

module.exports = async (req, res) => {
  applySecurityHeaders(req, res);
  setCors(req, res, 'GET,OPTIONS');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.json({
    status: 'ok',
    message: 'Server is running',
  });
};

