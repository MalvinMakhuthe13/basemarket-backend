const path = require('path');

const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const isTest = String(process.env.NODE_ENV || '').toLowerCase() === 'test';

function readString(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function readNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readList(name) {
  return readString(name)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function requireInProduction(name, warnings, description = '') {
  const value = readString(name);
  if (!value && isProduction) {
    warnings.push(`${name} is required in production${description ? ` (${description})` : ''}`);
  }
  return value;
}

function collectEnvWarnings() {
  const warnings = [];
  requireInProduction('MONGODB_URI', warnings, 'MongoDB connection string');
  requireInProduction('JWT_SECRET', warnings, 'JWT signing secret');
  requireInProduction('FRONTEND_ORIGIN', warnings, 'frontend URL for CORS and redirects');

  const jwtSecret = readString('JWT_SECRET');
  if (jwtSecret && jwtSecret.length < 32) {
    warnings.push('JWT_SECRET should be at least 32 characters long');
  }

  const frontends = readList('FRONTEND_ORIGIN');
  if (frontends.some((origin) => !/^https?:\/\//i.test(origin))) {
    warnings.push('FRONTEND_ORIGIN should contain absolute URL(s), e.g. https://basemarket.co.za');
  }

  return warnings;
}

function getConfig() {
  return {
    env: readString('NODE_ENV', 'development') || 'development',
    isProduction,
    isTest,
    port: readNumber('PORT', 10000),
    jsonLimit: readString('REQUEST_BODY_LIMIT', '8mb') || '8mb',
    uploadsDir: path.join(process.cwd(), 'uploads'),
    frontendOrigins: readList('FRONTEND_ORIGIN').length
      ? readList('FRONTEND_ORIGIN')
      : readList('CORS_ORIGIN'),
    trustProxy: readNumber('TRUST_PROXY_HOPS', 1),
    globalRateLimit: {
      windowMs: readNumber('GLOBAL_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      limit: readNumber('GLOBAL_RATE_LIMIT_MAX', 600),
    },
  };
}

module.exports = { getConfig, collectEnvWarnings, readString, readNumber, readList };
