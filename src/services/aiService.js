const OpenAI = require("openai");
const { generateFallbackListing, suggestPrice, detectScamSignals, inferCatalog, inferCondition } = require("../utils/marketAi");

function getClient() {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || process.env.FRONTEND_ORIGIN || "https://basemarket.co.za",
      "X-Title": process.env.OPENROUTER_APP_NAME || "BaseMarket",
    },
  });
}

async function generateListing({ title = '', category = '', condition = '', location = '' }) {
  const fallback = generateFallbackListing(title, category, condition);
  const client = getClient();
  if (!client) return { description: fallback, source: 'fallback' };

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const prompt = [
    'Write a concise South African marketplace listing description.',
    'Keep it honest, readable, and under 90 words.',
    'Do not invent accessories or specs that were not provided.',
    'End with one trust-building sentence about secure delivery or Secure Deal.',
    `Title: ${title || 'Item'}`,
    `Category: ${category || inferCatalog(title)}`,
    `Condition: ${condition || inferCondition(title)}`,
    location ? `Location: ${location}` : '',
  ].filter(Boolean).join('\n');

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: 'You write polished marketplace copy for BaseMarket.' },
        { role: 'user', content: prompt },
      ],
    });
    const text = completion.choices?.[0]?.message?.content?.trim();
    return { description: text || fallback, source: text ? 'openrouter' : 'fallback' };
  } catch (error) {
    return { description: fallback, source: 'fallback', warning: error?.message || 'AI generation failed' };
  }
}

async function analyzeScamRisk({ text = '' }) {
  const heuristic = detectScamSignals(text);
  const client = getClient();
  if (!client || !text.trim()) return { ...heuristic, source: 'heuristic' };

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return strict JSON with keys riskScore (0-100 integer), risky (boolean), flags (string array), advice (string).',
        },
        {
          role: 'user',
          content: `Analyse this marketplace message for scam risk:\n${text}`,
        },
      ],
    });
    const content = completion.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return {
      riskScore: Math.max(0, Math.min(100, Number(parsed.riskScore || heuristic.riskScore || 0))),
      risky: Boolean(parsed.risky),
      flags: Array.isArray(parsed.flags) ? parsed.flags.slice(0, 5) : heuristic.flags,
      advice: String(parsed.advice || heuristic.advice || ''),
      source: 'openrouter',
    };
  } catch (error) {
    return { ...heuristic, source: 'heuristic', warning: error?.message || 'AI scam analysis failed' };
  }
}

async function buildAssistant(payload = {}) {
  const title = String(payload.title || '').trim();
  const category = String(payload.category || '').trim();
  const condition = String(payload.condition || '').trim();
  const location = String(payload.location || '').trim();
  const description = await generateListing({ title, category, condition, location });
  const priceGuide = suggestPrice(title, category);
  return {
    description: description.description,
    descriptionSource: description.source,
    warning: description.warning || '',
    priceGuide,
    category: category || inferCatalog(title),
    condition: condition || inferCondition(title),
  };
}

module.exports = { buildAssistant, generateListing, analyzeScamRisk, suggestPrice };
