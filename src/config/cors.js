function createCorsOptions(frontendOrigins = [], { isProduction = false } = {}) {
  const allowAll = !frontendOrigins.length && !isProduction;
  const allowed = new Set((frontendOrigins || []).map((x) => String(x).trim()).filter(Boolean));

  return {
    origin(origin, callback) {
      if (allowAll) return callback(null, true);
      if (!origin) return callback(null, true);
      if (allowed.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  };
}

module.exports = { createCorsOptions };
