function notFound(req, res) {
  res.status(404).json({ message: `Cannot ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const name = String(err?.name || '');
  const rawMessage = String(err?.message || 'Server error');

  if (name === 'CastError') {
    return res.status(400).json({ message: 'Invalid record id supplied.' });
  }
  if (name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ message: first?.message || 'Validation failed.' });
  }
  if (name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'Upload too large. Maximum file size is 6MB.'
      : err.code === 'LIMIT_FILE_COUNT'
        ? 'Too many files selected. Maximum is 6 images.'
        : 'Upload failed.';
    return res.status(400).json({ message });
  }

  const status = Number(err?.statusCode || err?.status || 500);
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ message: rawMessage || 'Server error' });
}

module.exports = { notFound, errorHandler };
