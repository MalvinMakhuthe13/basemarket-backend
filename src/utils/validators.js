const mongoose = require('mongoose');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function requireFields(obj = {}, fields = []) {
  const missing = [];
  for (const field of fields) {
    const value = obj[field];
    if (value === undefined || value === null || String(value).trim() === '') missing.push(field);
  }
  return missing;
}

function toMoney(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Number(n.toFixed(2));
}

function toPositiveInt(value, fallback = 1, min = 1, max = 999) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanText(value = '', max = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isNonEmpty(value) {
  return !!cleanText(value);
}

function isFutureDate(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) && d.getTime() > Date.now();
}

module.exports = { isObjectId, requireFields, toMoney, toPositiveInt, cleanText, isNonEmpty, isFutureDate };
