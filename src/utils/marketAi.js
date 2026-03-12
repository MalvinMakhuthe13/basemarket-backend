const PRICE_GUIDE = [
  { key: /iphone 15/i, min: 12000, max: 19000, label: "iPhone 15" },
  { key: /iphone 1[2-4]/i, min: 5500, max: 13000, label: "Recent iPhone" },
  { key: /ps5|playstation 5/i, min: 7500, max: 12000, label: "PlayStation 5" },
  { key: /xbox series x/i, min: 7000, max: 11000, label: "Xbox Series X" },
  { key: /tv|smart tv/i, min: 1800, max: 9000, label: "TV" },
  { key: /fridge|refrigerator/i, min: 1800, max: 8000, label: "Fridge" },
  { key: /couch|sofa/i, min: 1500, max: 9500, label: "Couch" },
  { key: /laptop|macbook/i, min: 3500, max: 22000, label: "Laptop" },
  { key: /bed/i, min: 1500, max: 9000, label: "Bed" },
  { key: /sneaker|shoe/i, min: 350, max: 3000, label: "Shoes" },
];

const KEYWORDS = {
  electronics: ["iphone","samsung","tv","playstation","ps5","xbox","laptop","macbook","ipad","camera","speaker","monitor","router","console"],
  furniture: ["couch","sofa","chair","table","desk","bed","wardrobe","fridge","cupboard","mirror"],
  vehicles: ["car","bike","bicycle","motorbike","scooter","trailer","rim","tyre"],
  fashion: ["dress","jacket","hoodie","sneaker","shoes","shirt","jeans","bag","watch"],
  home: ["microwave","kettle","air fryer","washing machine","stove","mattress"],
};

function titleCase(v = "") {
  return String(v || '').replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function inferCatalog(title = '') {
  const lower = String(title || '').toLowerCase();
  for (const [catalog, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return catalog;
  }
  return 'general';
}

function inferCondition(title = '', explicitCondition = '') {
  const base = String(explicitCondition || title || '').toLowerCase();
  if (/brand new|sealed|unused|new/.test(base)) return 'new';
  if (/excellent|like new|mint/.test(base)) return 'excellent';
  if (/fair|used|second hand/.test(base)) return 'used';
  return explicitCondition || 'good';
}

function suggestPrice(title = '', category = '') {
  const lower = `${title} ${category}`.toLowerCase();
  const match = PRICE_GUIDE.find((row) => row.key.test(lower));
  if (match) {
    const suggested = Math.round(((match.min + match.max) / 2) / 50) * 50;
    return { min: match.min, max: match.max, suggested, confidence: 'high', label: match.label };
  }
  const inferred = inferCatalog(lower);
  const fallback = {
    electronics: { min: 1500, max: 7500 },
    furniture: { min: 900, max: 6000 },
    vehicles: { min: 2500, max: 45000 },
    fashion: { min: 250, max: 1800 },
    home: { min: 700, max: 5500 },
    general: { min: 400, max: 3500 },
  }[inferred] || { min: 400, max: 3500 };
  const suggested = Math.round(((fallback.min + fallback.max) / 2) / 50) * 50;
  return { ...fallback, suggested, confidence: 'medium', label: titleCase(inferred) };
}

function generateFallbackListing(title = '', category = '', condition = '') {
  const niceTitle = titleCase(title || 'Item');
  const catalog = inferCatalog(`${title} ${category}`);
  const cond = inferCondition(title, condition);
  const intros = {
    electronics: `${niceTitle} available in ${cond} condition. Fully functional and ready for its next owner.`,
    furniture: `${niceTitle} available in ${cond} condition. Solid value for a home, office, or apartment setup.`,
    fashion: `${niceTitle} available in ${cond} condition. Clean, stylish, and ready to wear.`,
    vehicles: `${niceTitle} available in ${cond} condition. Serious buyers are welcome to enquire for more details.`,
    home: `${niceTitle} available in ${cond} condition. Practical and ready for everyday use.`,
    general: `${niceTitle} available in ${cond} condition and ready for a smooth sale.`,
  };
  const close = `Collection or secure delivery can be arranged through BaseMarket. Serious buyers can use Secure Deal for extra peace of mind.`;
  return `${intros[catalog] || intros.general} ${close}`;
}

function detectScamSignals(text = '') {
  const lower = String(text || '').toLowerCase();
  const matches = [];
  const patterns = [
    [/pay outside|outside the app|outside basemarket/, 'Payment requested outside BaseMarket'],
    [/bank transfer only|eft only|crypto only/, 'Unsafe payment instruction'],
    [/whatsapp only|telegram|move to whatsapp immediately/, 'Attempt to move the deal off-platform'],
    [/urgent payment|send proof now|release before delivery/, 'Pressure tactic'],
    [/too good to be true|100% guaranteed return/, 'Suspicious offer wording'],
  ];
  for (const [regex, label] of patterns) if (regex.test(lower)) matches.push(label);
  const riskScore = Math.min(100, matches.length * 28 + (/(gift card|western union|binance|usdt)/.test(lower) ? 22 : 0));
  return {
    risky: riskScore >= 28,
    riskScore,
    flags: matches,
    advice: matches.length ? 'Keep payment, delivery, and messaging inside BaseMarket Secure Deal.' : 'No obvious high-risk pattern detected.',
  };
}

module.exports = { titleCase, inferCatalog, inferCondition, suggestPrice, generateFallbackListing, detectScamSignals };
