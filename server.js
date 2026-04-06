require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectDB, disconnectDB } = require('./src/config/db');
const { createCorsOptions } = require('./src/config/cors');
const { getConfig, collectEnvWarnings } = require('./src/config/env');
const { buildAppMeta } = require('./src/config/app');
const { ensureUploadsDir } = require('./src/config/uploads');
const { notFound, errorHandler } = require('./src/middleware/error');

const authRoutes = require('./src/routes/auth');
const listingRoutes = require('./src/routes/listings');
const orderRoutes = require('./src/routes/orders');
const messageRoutes = require('./src/routes/messages');
const verifyRoutes = require('./src/routes/verify');
const adminRoutes = require('./src/routes/admin');
const aiRoutes = require('./src/routes/ai');
const payfastRoutes = require('./src/routes/payfast');
const recommendationsRoutes = require('./src/routes/recommendations');
const disputesRoutes = require('./src/routes/disputes');
const offersRoutes = require('./src/routes/offers');
const savedSearchesRoutes = require('./src/routes/savedSearches');
const notificationsRoutes = require('./src/routes/notifications');
const homeRoutes = require('./src/routes/home');
const activityRoutes = require('./src/routes/activity');
const { startAlertJobs } = require('./src/utils/alertJobs');
const { startPayoutJobs } = require('./src/utils/payoutJobs');

const app = express();
const config = getConfig();
const meta = buildAppMeta();

for (const warning of collectEnvWarnings()) {
  console.warn(`[startup warning] ${warning}`);
}

ensureUploadsDir(config.uploadsDir);

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors(createCorsOptions(config.frontendOrigins, { isProduction: config.isProduction })));
app.use(express.json({ limit: config.jsonLimit }));
app.use(express.urlencoded({ extended: true, limit: config.jsonLimit }));
app.use(morgan(config.isProduction ? 'combined' : 'dev'));
app.use(rateLimit({
  windowMs: config.globalRateLimit.windowMs,
  limit: config.globalRateLimit.limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}));
app.use('/uploads', express.static(config.uploadsDir));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'BaseMarket API running',
    version: meta.version,
    env: config.env,
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: meta.name,
    version: meta.version,
    env: config.env,
    uptimeSeconds: Math.round(process.uptime()),
    mongoReadyState: require('mongoose').connection.readyState,
    startedAt: meta.startedAt,
    frontendOrigins: config.frontendOrigins,
  });
});

app.get('/pretest', (_req, res) => {
  const readiness = {
    mongo: !!process.env.MONGODB_URI,
    jwt: !!process.env.JWT_SECRET,
    frontendOrigin: !!process.env.FRONTEND_ORIGIN,
    adminKey: !!process.env.ADMIN_KEY,
    payfastCore: !!(process.env.PAYFAST_MERCHANT_ID && process.env.PAYFAST_MERCHANT_KEY && process.env.PUBLIC_BACKEND_URL),
  };
  res.json({
    ok: Object.values(readiness).every(Boolean),
    message: 'Backend pre-test checklist',
    readiness,
    routes: [
      '/api/auth', '/api/listings', '/api/orders', '/api/messages', '/api/payfast',
      '/api/offers', '/api/disputes', '/api/notifications', '/api/admin'
    ]
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/payfast', payfastRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/disputes', disputesRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/saved-searches', savedSearchesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/activity', activityRoutes);

app.use(notFound);
app.use(errorHandler);

let server;
let alertJobHandle;
let payoutJobHandle;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[shutdown] received ${signal}`);

  if (alertJobHandle) clearInterval(alertJobHandle);
  if (payoutJobHandle) clearInterval(payoutJobHandle);

  try {
    await new Promise((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.error('[shutdown] failed', err);
    process.exit(1);
  }
}

async function start() {
  await connectDB();
  server = app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
  alertJobHandle = startAlertJobs();
  payoutJobHandle = startPayoutJobs();
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
