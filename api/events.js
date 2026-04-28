const { appendJsonLine, sanitizeText } = require('../lib/inquiry-utils');
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
    const eventName = sanitizeText(payload.eventName || payload.event || '', 80).toLowerCase();

    if (!eventName) {
      res.status(400).json({
        success: false,
        error: 'eventName is required.',
      });
      return;
    }

    const properties = payload.properties && typeof payload.properties === 'object' ? payload.properties : {};
    const record = {
      timestamp: new Date().toISOString(),
      eventName,
      properties,
      sourcePage: sanitizeText(payload.sourcePage || '', 300),
      pageUrl: sanitizeText(payload.pageUrl || '', 2000),
      sessionId: sanitizeText(payload.sessionId || '', 120),
      userAgent: sanitizeText(req.headers['user-agent'] || '', 300),
      ip: sanitizeText(getRemoteIp(req), 120),
    };

    const stored = await appendJsonLine('events.jsonl', record);

    res.status(200).json({
      success: true,
      stored: stored !== false,
    });
  } catch (error) {
    console.error('Events API error:', error);
    // Fail-open for tracking so frontend does not surface noisy 500 errors.
    res.status(200).json({
      success: false,
      stored: false,
      dropped: true,
    });
  }
};
