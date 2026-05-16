/**
 * Cloudinary config + upload helper
 * Falls back to local disk serving if CLOUDINARY_URL is not set.
 * This means dev / early testing works without a Cloudinary account,
 * and you flip to cloud storage by adding one env var on Render.
 */
const cloudinary = require('cloudinary').v2;

const CLOUDINARY_URL = process.env.CLOUDINARY_URL || '';
const USE_CLOUDINARY = !!CLOUDINARY_URL;

if (USE_CLOUDINARY) {
  // CLOUDINARY_URL format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
  cloudinary.config({ secure: true }); // SDK auto-reads CLOUDINARY_URL from env
}

/**
 * Upload a buffer to Cloudinary (or skip and return a local URL).
 * @param {Buffer} buffer  - image bytes
 * @param {string} folder  - Cloudinary folder (e.g. 'listings')
 * @param {object} req     - Express request (used to build local fallback URL)
 * @param {string} filename - original filename (used for local fallback)
 * @returns {Promise<string>} public URL
 */
async function uploadImage(buffer, folder, req, filename) {
  if (!USE_CLOUDINARY) {
    // Local fallback — write to disk and return a URL served by express.static
    const fs = require('fs');
    const path = require('path');
    const uploadDir = path.join(process.cwd(), 'uploads', folder);
    fs.mkdirSync(uploadDir, { recursive: true });
    const safeExt = path.extname(filename || '').toLowerCase() || '.jpg';
    const saveName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    const savePath = path.join(uploadDir, saveName);
    fs.writeFileSync(savePath, buffer);
    const base = `${req.protocol}://${req.get('host')}`;
    return `${base}/uploads/${folder}/${saveName}`;
  }

  // Cloudinary upload via stream
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `basemarket/${folder}`,
        resource_type: 'image',
        transformation: [
          { quality: 'auto:good', fetch_format: 'auto' },
          { width: 1200, height: 1200, crop: 'limit' },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Delete an image from Cloudinary by its public URL.
 * Silently succeeds if URL is not a Cloudinary URL.
 */
async function deleteImage(url) {
  if (!USE_CLOUDINARY || !url || !url.includes('cloudinary.com')) return;
  try {
    // Extract public_id from URL: .../basemarket/listings/filename.ext → basemarket/listings/filename
    const match = url.match(/\/v\d+\/(.+)\.[a-z]+$/i);
    if (match) await cloudinary.uploader.destroy(match[1]);
  } catch (_) { /* silent */ }
}

module.exports = { uploadImage, deleteImage, USE_CLOUDINARY };
