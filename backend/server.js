const express = require('express');
const cors = require('cors');
const config = require('./config');

const checkMaintenance = require('./middleware/maintenance');
const requestLogger = require('./middleware/logger');

// Route Handlers
const systemRouter = require('./routes/system');
const categoriesRouter = require('./routes/categories');
const adminRouter = require('./routes/admin');

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

app.use(cors({ origin: config.corsOrigins, allowedHeaders: ['Content-Type', 'x-api-key'] }));

// Health Check (Always 200 OK)
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(requestLogger);
app.use('/api', categoriesRouter);
app.use(checkMaintenance);

// Root Info
app.get('/', (req, res) => {
  res.json({
    name: 'RED API Backend Engine',
    version: '2.4.1',
    status: 'running',
    endpoints_count: 0
  });
});

// Mount Routes
app.use('/api/system', systemRouter);
app.use('/api/admin', adminRouter);

// 404 Fallback
app.use((req, res) => {
  res.status(404).json({
    status: false,
    code: 404,
    message: `Endpoint ${req.method} ${req.path} not found in RED API registry.`
  });
});

// Error Handler
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const code = err.status === 413 ? 413 : err.status === 400 ? 400 : 500;
  if (code === 500) console.error('[SERVER_ERROR]', err.name);
  res.status(code).json({
    status: false,
    code,
    message: { 400: 'Invalid request body.', 413: 'Request body too large.', 500: 'Internal server error.' }[code]
  });
});

module.exports = app;
