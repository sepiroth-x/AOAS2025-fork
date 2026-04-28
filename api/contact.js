const { handleContactSubmission } = require('../lib/contact-handler');
require('dotenv').config();
const {
  applySecurityHeaders,
  setCors,
} = require('../lib/http-security');

function getRemoteIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

function parseBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  if (typeof body === 'object') {
    return body;
  }

  return {};
}

module.exports = async (req, res) => {
  applySecurityHeaders(req, res);
  setCors(req, res, 'GET,OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
    return;
  }

  try {
    const payload = parseBody(req.body);
    const result = await handleContactSubmission(payload, {
      remoteIp: getRemoteIp(req),
      userAgent: req.headers['user-agent'] || '',
      path: req.url || '/',
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Contact API error:', error);
    res.status(500).json({
      success: false,
      error: 'Unexpected server error while handling inquiry.',
    });
  }
};
