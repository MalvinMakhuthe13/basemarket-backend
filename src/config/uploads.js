const fs = require('fs');

function ensureUploadsDir(dirPath) {
  if (!dirPath) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

module.exports = { ensureUploadsDir };
