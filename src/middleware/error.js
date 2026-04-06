function notFound(req, res) {
  res.status(404).json({
    ok: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
}

function errorHandler(err, req, res, _next) {
  const status = Number(err?.statusCode || err?.status || 500);
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const safeMessage = status >= 500 && isProduction ? 'Internal server error' : (err?.message || 'Server error');

  console.error('[error]', {
    method: req.method,
    path: req.originalUrl,
    status,
    message: err?.message,
    stack: err?.stack,
  });

  res.status(status).json({
    ok: false,
    message: safeMessage,
    ...(isProduction ? {} : { stack: err?.stack }),
  });
}

module.exports = { notFound, errorHandler };
