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

/* ── Per-category writing instructions ─────────────────────────────────────
   Each category gets its own tone, structure, and what to include/exclude.
   This is what makes the AI description actually match the listing type.
──────────────────────────────────────────────────────────────────────────── */
const CATEGORY_PROMPTS = {
  sell: {
    instruction: "Write a short, honest For Sale listing for a South African marketplace. Lead with the item name and condition. Mention what is included (box, accessories, charger, etc.) if relevant. State whether it is tested and working. End with one line about collection, delivery, or Secure Deal.",
    tone: "Direct, factual, and honest. No hype. Buyers trust plain language.",
    avoid: "Do not invent accessories or specs not provided. Do not use exclamation marks.",
    length: "60–90 words.",
  },
  auction: {
    instruction: "Write an auction listing for BaseMarket. Lead with the item and condition. Mention what is included. State that bids are binding and the item can be collected or couriered after payment. Invite bidders to ask questions.",
    tone: "Confident and transparent. Make the bidder feel safe.",
    avoid: "Do not promise a price. Do not use hype language.",
    length: "60–80 words.",
  },
  request: {
    instruction: "Write a Wanted / Request listing from a buyer looking for this item. Use first person. State what condition is acceptable, whether delivery is needed, and invite sellers to respond with photos and price.",
    tone: "Friendly, clear, and buyer-focused. Show you are a serious buyer.",
    avoid: "Do not write as if selling. Do not add a price.",
    length: "50–75 words.",
  },
  trade: {
    instruction: "Write a Trade & Swap listing. State what the person HAS to trade, its condition, and what they are looking for in return. Mention that meetup inspection is preferred. Note if a partial cash top-up is welcome.",
    tone: "Casual but specific. Both sides need to know exactly what is on offer.",
    avoid: "Do not make it sound like a sale. No price line unless mentioning cash top-up.",
    length: "55–80 words.",
  },
  service: {
    instruction: "Write a Services listing for a professional offering their skill. Lead with the service name and a one-line pitch. Mention experience or qualifications briefly. State coverage area, availability, and how to book. End with a line about quotes or WhatsApp.",
    tone: "Professional and approachable. Build confidence in the provider.",
    avoid: "Do not invent qualifications not mentioned. No vague filler.",
    length: "65–90 words.",
  },
  rentals: {
    instruction: "Write a Rental listing. This could be property, a car, a tool, or equipment — adapt accordingly. For property: mention size, key features, what is included (water, wifi, parking). For items: mention condition, rental period, and deposit. End with viewing or enquiry instructions.",
    tone: "Clear and informative. Tenants and renters need facts, not flair.",
    avoid: "Do not over-promise. Do not write generic property copy.",
    length: "65–90 words.",
  },
  events: {
    instruction: "Write an Event listing. Include what the event is, the date and time if provided, the venue or area, what attendees can expect, and how to get tickets. Keep it exciting but accurate.",
    tone: "Warm and inviting. Make the reader want to attend.",
    avoid: "Do not fabricate event details not provided.",
    length: "55–80 words.",
  },
  food: {
    instruction: "Write a Food & Market listing for a home cook, caterer, or food vendor. Describe what is being sold, how it is made (homemade, fresh, etc.), flavours or key ingredients if relevant, and how to order (delivery, collection, pre-order lead time).",
    tone: "Warm, appetising, and honest. Make the food sound real and accessible.",
    avoid: "Do not use stock-image language. Do not invent ingredients.",
    length: "55–75 words.",
  },
  jobs: {
    instruction: "Write a Job listing for Work & Gigs. Lead with the role and company/person if provided. Describe what the job involves, what you are looking for in a candidate (experience, skills), location and work type (remote/hybrid/on-site), and how to apply.",
    tone: "Professional, clear, and welcoming. Encourage good candidates to apply.",
    avoid: "Do not add salary unless provided. Do not use corporate jargon.",
    length: "65–90 words.",
  },
  places: {
    instruction: "Write a Places listing for a venue, location, or spot. Describe what it is, what makes it notable, who it is suited for, and how to enquire or book.",
    tone: "Descriptive and inviting. Paint a picture of the place.",
    avoid: "Do not invent features not mentioned.",
    length: "55–80 words.",
  },
};

function getCategoryPrompt(category) {
  const key = String(category || '').toLowerCase().trim();
  // Normalise aliases
  const map = {
    'for sale': 'sell', 'buy & sell': 'sell', 'sale': 'sell',
    'rental': 'rentals', 'rent': 'rentals',
    'work & gigs': 'jobs', 'gigs': 'jobs', 'work': 'jobs',
    'trade & swap': 'trade', 'swap': 'trade',
    'event': 'events', 'ticket': 'events',
    'food & market': 'food', 'market': 'food',
    'services': 'service',
    'request': 'request', 'requests': 'request', 'wanted': 'request',
    'auction': 'auction', 'auctions': 'auction',
    'place': 'places', 'venue': 'places',
  };
  return CATEGORY_PROMPTS[map[key] || key] || CATEGORY_PROMPTS.sell;
}

async function generateListing({ title = '', category = '', condition = '', location = '' }) {
  const fallback = generateFallbackListing(title, category, condition);
  const client = getClient();
  if (!client) return { description: fallback, source: 'fallback' };

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const cat = getCategoryPrompt(category || inferCatalog(title));
  const resolvedCondition = condition || inferCondition(title);

  const systemPrompt = [
    'You write marketplace listing descriptions for BaseMarket, a South African community marketplace.',
    'Write in South African English. Use Rands (R) for prices if mentioned.',
    'Never invent details not provided by the user.',
    `Tone: ${cat.tone}`,
    `Avoid: ${cat.avoid}`,
    `Length: ${cat.length}`,
    'Output only the description text. No title, no subject line, no hashtags, no markdown.',
  ].join(' ');

  const userPrompt = [
    cat.instruction,
    '',
    `Listing title: ${title}`,
    `Category: ${category || inferCatalog(title)}`,
    resolvedCondition && resolvedCondition !== 'good' ? `Condition: ${resolvedCondition}` : '',
    location ? `Location: ${location}` : '',
  ].filter(Boolean).join('\n');

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.35,
      max_tokens: 180,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
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
          content: `Analyse this South African marketplace message for scam risk:\n${text}`,
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
  const title    = String(payload.title    || '').trim();
  const category = String(payload.category || '').trim();
  const condition= String(payload.condition|| '').trim();
  const location = String(payload.location || '').trim();
  const description = await generateListing({ title, category, condition, location });
  const priceGuide  = suggestPrice(title, category);
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
