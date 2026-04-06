const express = require("express");
const { buildAssistant, analyzeScamRisk, suggestPrice } = require("../services/aiService");

const router = express.Router();

router.get("/health", async (req, res) => {
  res.json({
    ok: true,
    providerReady: Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY),
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  });
});

router.post("/assist", async (req, res, next) => {
  try {
    const { title = '', category = '', condition = '', location = '' } = req.body || {};
    if (!String(title).trim()) return res.status(400).json({ message: 'Missing title' });
    const result = await buildAssistant({ title, category, condition, location });
    res.json(result);
  } catch (e) { next(e); }
});

router.post("/price-suggestion", async (req, res, next) => {
  try {
    const { title = '', category = '' } = req.body || {};
    if (!String(title).trim()) return res.status(400).json({ message: 'Missing title' });
    res.json({ priceGuide: suggestPrice(title, category) });
  } catch (e) { next(e); }
});

router.post("/scam-check", async (req, res, next) => {
  try {
    const { text = '' } = req.body || {};
    if (!String(text).trim()) return res.status(400).json({ message: 'Missing text' });
    const result = await analyzeScamRisk({ text });
    res.json(result);
  } catch (e) { next(e); }
});

module.exports = router;
