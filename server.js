const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const adminHandler = require('./api/admin');
const careersHandler = require('./api/careers');
const contactHandler = require('./api/contact');
const eventsHandler = require('./api/events');
const healthHandler = require('./api/health');
const metricsHandler = require('./api/metrics');
const routeEstimateHandler = require('./api/route-estimate');
const { applySecurityHeaders } = require('./lib/http-security');
const { adaptServerlessHandler } = require('./lib/serverless-adapter');

const app = express();
const PORT = process.env.PORT || 3000;
const isLocalDev = process.env.NODE_ENV !== 'production' &&
  process.env.VERCEL !== '1' &&
  !process.env.VERCEL_ENV;

// Trust the loopback reverse proxy (OpenLiteSpeed / Nginx / Apache on the same server).
// This makes Express respect X-Forwarded-Host, X-Forwarded-Proto, and X-Real-IP.
app.set('trust proxy', 'loopback');

app.disable('x-powered-by');

app.use((req, res, next) => {
  applySecurityHeaders(req, res);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON payload.',
    });
    return;
  }
  next(err);
});

app.all('/api/contact', adaptServerlessHandler(contactHandler));
app.all('/api/events', adaptServerlessHandler(eventsHandler));
app.all('/api/metrics', adaptServerlessHandler(metricsHandler));
app.all('/api/route-estimate', adaptServerlessHandler(routeEstimateHandler));
app.all('/api/careers', adaptServerlessHandler(careersHandler));
app.all('/api/health', adaptServerlessHandler(healthHandler));
app.all(['/api/admin', '/api/admin/*'], adaptServerlessHandler(adminHandler));

if (isLocalDev) {
  app.use(express.static('.', {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      const extension = path.extname(filePath).toLowerCase();
      if (extension === '.html') {
        const fileName = path.basename(filePath).toLowerCase();
        if (fileName === 'admin.html' || fileName === 'insights.html') {
          res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
        return;
      }

      if (/\.(js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|map)$/.test(extension)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      }
    },
  }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }

    if (req.path === '/') {
      next();
      return;
    }

    const cleanPath = req.path.replace(/^\/+|\/+$/g, '');
    const directHtml = path.join(__dirname, `${cleanPath}.html`);
    const nestedIndex = path.join(__dirname, cleanPath, 'index.html');

    if (fs.existsSync(directHtml)) {
      res.sendFile(directHtml);
      return;
    }

    if (fs.existsSync(nestedIndex)) {
      res.sendFile(nestedIndex);
      return;
    }

    next();
  });
}

module.exports = app;

if (isLocalDev) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}
