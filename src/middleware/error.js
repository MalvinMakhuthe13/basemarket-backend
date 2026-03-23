function notFound(req, res) {
  res.status(404).json({ message: `Cannot ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.statusCode || 500;
  res.status(status).json({ message: err.message || "Server error" });
}

module.exports = { notFound, errorHandler };
