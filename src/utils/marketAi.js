/**
 * marketAi.js — BaseMarket AI utility layer
 * Used by aiService.js as the fallback when OpenRouter is unavailable.
 * Also used directly for price suggestions and scam detection.
 */

/* ── Price database — ZA market data, condition-aware ─────────────────────── */
const PRICE_GUIDE = [
  // iPhones
  { key: /iphone\s*16\s*pro\s*max/i, label:'iPhone 16 Pro Max', new:[28000,36000], good:[20000,27000], used:[14000,19000] },
  { key: /iphone\s*16\s*pro/i,        label:'iPhone 16 Pro',    new:[24000,30000], good:[17000,23000], used:[12000,16000] },
  { key: /iphone\s*16/i,               label:'iPhone 16',        new:[19000,25000], good:[13000,18000], used:[9000,12500]  },
  { key: /iphone\s*15\s*pro\s*max/i,  label:'iPhone 15 Pro Max',new:[22000,29000], good:[15000,21000], used:[10000,14000] },
  { key: /iphone\s*15\s*pro/i,         label:'iPhone 15 Pro',   new:[18000,24000], good:[12000,17000], used:[8000,11500]  },
  { key: /iphone\s*15/i,               label:'iPhone 15',        new:[14000,19000], good:[9500,13500],  used:[6500,9000]   },
  { key: /iphone\s*14\s*pro\s*max/i,  label:'iPhone 14 Pro Max',new:[17000,22000], good:[11000,16000], used:[7500,10500]  },
  { key: /iphone\s*14\s*pro/i,         label:'iPhone 14 Pro',   new:[14000,18000], good:[9000,13000],  used:[6000,8500]   },
  { key: /iphone\s*14/i,               label:'iPhone 14',        new:[11000,15000], good:[7500,10500],  used:[5000,7000]   },
  { key: /iphone\s*1[23]/i,            label:'iPhone 12/13',     new:[7000,13000],  good:[4500,8500],   used:[3000,5800]   },
  { key: /iphone\s*1[01]/i,            label:'iPhone 10/11',     new:[4500,8000],   good:[2800,5000],   used:[1800,3400]   },
  // Samsung
  { key: /samsung\s*s24\s*ultra/i,    label:'Samsung S24 Ultra',new:[26000,33000], good:[18000,25000], used:[12000,17000] },
  { key: /samsung\s*s24/i,             label:'Samsung S24',      new:[17000,26000], good:[11000,19000], used:[7000,12500]  },
  { key: /samsung\s*s23\s*ultra/i,    label:'Samsung S23 Ultra',new:[18000,24000], good:[12000,17000], used:[8000,11500]  },
  { key: /samsung\s*s2[23]/i,          label:'Samsung S22/S23',  new:[9000,17000],  good:[5500,11500],  used:[3500,7800]   },
  { key: /samsung\s*a5[45]/i,          label:'Samsung A54/A55',  new:[7000,10000],  good:[4500,6500],   used:[3000,4200]   },
  { key: /samsung\s*a3[45]/i,          label:'Samsung A34/A35',  new:[5500,8000],   good:[3500,5500],   used:[2200,3400]   },
  // Consoles
  { key: /ps5|playstation\s*5/i,       label:'PlayStation 5',    new:[9000,12000],  good:[7000,9000],   used:[5500,7000]   },
  { key: /ps4|playstation\s*4/i,       label:'PlayStation 4',    new:[4500,7000],   good:[2800,4200],   used:[1800,2800]   },
  { key: /xbox\s*series\s*x/i,        label:'Xbox Series X',    new:[8500,12000],  good:[6500,8500],   used:[5000,6500]   },
  { key: /xbox\s*series\s*s/i,        label:'Xbox Series S',    new:[6000,8000],   good:[4500,5800],   used:[3200,4500]   },
  { key: /nintendo\s*switch/i,         label:'Nintendo Switch',  new:[4500,7500],   good:[3000,5500],   used:[2000,4000]   },
  // Laptops
  { key: /macbook\s*pro\s*m[23]/i,    label:'MacBook Pro M2/M3',new:[28000,45000], good:[20000,32000], used:[14000,22000] },
  { key: /macbook\s*pro/i,             label:'MacBook Pro',      new:[18000,32000], good:[12000,22000], used:[7500,14000]  },
  { key: /macbook\s*air\s*m[23]/i,    label:'MacBook Air M2/M3',new:[18000,26000], good:[12000,18000], used:[8000,12000]  },
  { key: /macbook/i,                    label:'MacBook',          new:[12000,30000], good:[7500,20000],  used:[4000,12000]  },
  { key: /gaming\s*laptop|asus\s*rog|msi/i, label:'Gaming Laptop',new:[15000,40000],good:[10000,28000],used:[7000,18000] },
  { key: /laptop|notebook/i,            label:'Laptop',           new:[6000,22000],  good:[3500,14000],  used:[2000,9000]   },
  // TVs
  { key: /(?:65|75)\s*(?:inch|\").*tv/i, label:'65-75" Smart TV',new:[8000,22000],good:[5000,14000],  used:[3000,9000]  },
  { key: /55\s*(?:inch|\").*tv/i,     label:'55" Smart TV',     new:[5000,14000],  good:[3000,9000],   used:[1800,5500]  },
  { key: /43\s*(?:inch|\").*tv/i,     label:'43" Smart TV',     new:[3500,9000],   good:[2000,6000],   used:[1200,3500]  },
  { key: /smart\s*tv|\btv\b/i,       label:'Smart TV',         new:[1800,18000],  good:[1000,11000],  used:[600,7000]   },
  // Appliances
  { key: /fridge|refrigerator/i,        label:'Fridge',           new:[3500,15000],  good:[2000,9000],   used:[1200,5500]  },
  { key: /washing\s*machine/i,         label:'Washing Machine',  new:[4500,14000],  good:[2800,8500],   used:[1500,5000]  },
  { key: /stove|oven/i,                 label:'Stove/Oven',       new:[3500,12000],  good:[2000,7000],   used:[1200,4000]  },
  { key: /microwave/i,                  label:'Microwave',        new:[800,4500],    good:[500,2800],    used:[300,1600]   },
  { key: /air\s*fryer/i,               label:'Air Fryer',        new:[600,2500],    good:[400,1500],    used:[250,900]    },
  // Furniture
  { key: /couch|sofa|lounge\s*suite/i, label:'Couch/Sofa',       new:[3000,15000],  good:[1500,8000],   used:[800,4500]   },
  { key: /dining\s*(table|set)/i,      label:'Dining Table',     new:[2500,12000],  good:[1200,7000],   used:[700,4000]   },
  { key: /queen\s*bed|king\s*bed|bed\s*frame/i, label:'Bed Frame',new:[2500,10000],good:[1200,6000],  used:[700,3500]   },
  { key: /mattress/i,                   label:'Mattress',         new:[2000,12000],  good:[800,5000],    used:[400,2500]   },
  { key: /wardrobe|cupboard/i,          label:'Wardrobe',         new:[2000,9000],   good:[900,5000],    used:[500,2800]   },
  // Sneakers / fashion
  { key: /nike\s*air|yeezy|jordan/i,   label:'Premium Sneakers', new:[1800,8000],   good:[1000,5000],   used:[600,3000]   },
  { key: /sneaker|trainer|running\s*shoe/i, label:'Sneakers',    new:[900,4000],    good:[500,2500],    used:[300,1400]   },
  // Services (no condition, flat range)
  { key: /tutor/i,                      label:'Tutoring',         service:[150,500],  unit:'per hour'    },
  { key: /graphic\s*design|logo/i,     label:'Graphic Design',   service:[500,8000], unit:'per project' },
  { key: /web\s*(design|dev)|website/i,label:'Web Design',       service:[3000,25000],unit:'per project'},
  { key: /cleaning\s*service/i,        label:'Cleaning Service', service:[250,800],  unit:'per session' },
  { key: /plumb/i,                      label:'Plumber',          service:[400,1500], unit:'per callout' },
  { key: /electrician/i,                label:'Electrician',      service:[500,2000], unit:'per callout' },
  { key: /photography/i,                label:'Photography',      service:[1500,8000],unit:'per shoot'   },
  { key: /personal\s*trainer|gym/i,    label:'Personal Trainer', service:[200,500],  unit:'per session' },
  // Rentals
  { key: /bachelor|studio\s*flat/i,    label:'Bachelor Flat',    rental:[3500,7000], unit:'per month'   },
  { key: /1\s*bed|one\s*bed/i,         label:'1-Bedroom',        rental:[5000,9000], unit:'per month'   },
  { key: /2\s*bed|two\s*bed/i,         label:'2-Bedroom',        rental:[6500,13000],unit:'per month'   },
  { key: /3\s*bed|three\s*bed/i,       label:'3-Bedroom',        rental:[8000,18000],unit:'per month'   },
  { key: /room\s*to\s*rent/i,          label:'Room to Rent',     rental:[2000,4500], unit:'per month'   },
  { key: /toyota|volkswagen|vw|polo|corolla|bmw|mercedes|audi|honda|ford|hyundai|kia|nissan|mazda/i, label:'Car Hire', rental:[350,900], unit:'per day' },
  { key: /office\s*space/i,             label:'Office Space',     rental:[3000,25000],unit:'per month'   },
  // Jobs
  { key: /developer|software\s*eng/i,  label:'Developer',        job:[25000,70000],  unit:'per month'   },
  { key: /graphic\s*designer/i,        label:'Graphic Designer', job:[12000,35000],  unit:'per month'   },
  { key: /driver|delivery\s*driver/i,  label:'Driver',           job:[6000,15000],   unit:'per month'   },
  { key: /cleaner|domestic/i,           label:'Cleaner',          job:[4000,8000],    unit:'per month'   },
  { key: /teacher|tutor\s*job/i,       label:'Teacher',          job:[15000,35000],  unit:'per month'   },
];

const CONDITION_MULT = { new:1.0, excellent:0.82, good:0.68, used:0.52, parts:0.28 };

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function titleCase(v = '') {
  return String(v || '').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function inferCatalog(title = '') {
  const t = String(title || '').toLowerCase();
  const map = {
    electronics: ['phone','iphone','samsung','android','laptop','macbook','computer','tablet','ipad','tv','monitor','camera','speaker','headphone','airpod','console','ps5','xbox','playstation','router','smartwatch'],
    furniture:   ['couch','sofa','chair','table','desk','bed','wardrobe','cupboard','shelf','mattress','ottoman'],
    vehicles:    ['car','vehicle','bike','bicycle','motorbike','scooter','trailer','rim','tyre','bakkie','truck','van','suv'],
    fashion:     ['dress','jacket','hoodie','sneaker','shoe','shirt','jeans','pants','skirt','bag','handbag','watch','jewellery','ring','necklace'],
    home:        ['microwave','kettle','air fryer','washing machine','stove','oven','fridge','dishwasher','blender','toaster','vacuum','iron'],
    food:        ['food','meal','catering','dish','grocery','vegetable','fruit','meat','baked','cake','spice','cook'],
    services:    ['service','fix','repair','install','tutor','coach','clean','design','develop','build','paint','plumb','electric'],
    property:    ['apartment','flat','house','room','office','space','bedroom','garage'],
  };
  for (const [cat, words] of Object.entries(map)) {
    if (words.some(w => t.includes(w))) return cat;
  }
  return 'general';
}

function inferCondition(title = '', explicit = '') {
  const t = String(explicit || title || '').toLowerCase();
  if (/brand\s*new|sealed|unopened|in\s*box|bnib/.test(t)) return 'new';
  if (/excellent|like\s*new|mint|barely\s*used|lightly\s*used/.test(t)) return 'excellent';
  if (/good\s*condition|good\s*working|works\s*well|clean/.test(t)) return 'good';
  if (/fair|used|second\s*hand|pre.?owned|some\s*wear/.test(t)) return 'used';
  if (/for\s*parts|not\s*working|damaged|cracked|broken/.test(t)) return 'parts';
  return explicit || 'good';
}

/* ── Price suggestion — condition-adjusted ────────────────────────────────── */
function suggestPrice(title = '', category = '', condition = null) {
  const text = `${title} ${category}`.toLowerCase();
  const cond = condition || inferCondition(title);
  const mult = CONDITION_MULT[cond] ?? 0.65;

  for (const row of PRICE_GUIDE) {
    if (!row.key.test(text)) continue;
    // Service price
    if (row.service) {
      return { min: row.service[0], max: row.service[1],
        suggested: Math.round((row.service[0]+row.service[1])/2/50)*50,
        label: row.label, unit: row.unit, confidence: 'high', conditionUsed: null };
    }
    // Rental price
    if (row.rental) {
      return { min: row.rental[0], max: row.rental[1],
        suggested: Math.round((row.rental[0]+row.rental[1])/2/50)*50,
        label: row.label, unit: row.unit, confidence: 'high', conditionUsed: null };
    }
    // Job salary
    if (row.job) {
      return { min: row.job[0], max: row.job[1],
        suggested: Math.round((row.job[0]+row.job[1])/2/50)*50,
        label: row.label, unit: row.unit, confidence: 'high', conditionUsed: null };
    }
    // Buy/sell — condition band
    const band = row[cond] || row.good || row.used || [Math.round(row.new[0]*mult), Math.round(row.new[1]*mult)];
    const min  = Math.round(band[0]/50)*50;
    const max  = Math.round(band[1]/50)*50;
    return { min, max, suggested: Math.round((min+max)/2/50)*50,
      label: row.label, unit: '', confidence: 'high', conditionUsed: cond };
  }

  // Category fallback
  const cat = inferCatalog(text);
  const fallbacks = {
    electronics: { min:1500, max:7500 }, furniture: { min:900, max:6000 },
    vehicles:    { min:2500, max:45000 }, fashion:   { min:250, max:1800 },
    home:        { min:700,  max:5500 },  food:       { min:50,  max:500  },
    services:    { min:300,  max:3000 },  property:   { min:2500,max:9000 },
    general:     { min:400,  max:3500 },
  };
  const fb = fallbacks[cat] || fallbacks.general;
  const adjMin = Math.round(fb.min*mult/50)*50;
  const adjMax = Math.round(fb.max*mult/50)*50;
  return { min:adjMin, max:adjMax, suggested:Math.round((adjMin+adjMax)/2/50)*50,
    label: titleCase(cat), unit:'', confidence:'medium', conditionUsed:cond };
}

/* ── Fallback description — used when OpenRouter is unavailable ───────────── */
function generateFallbackListing(title = '', category = '', condition = '') {
  const name  = titleCase(title || 'Item');
  const cat   = String(category || '').toLowerCase().trim();
  const cond  = inferCondition(title, condition);
  const catalog = inferCatalog(`${title} ${category}`);

  // Normalise category key
  const catKey = {
    'for sale':'sell','buy & sell':'sell','sale':'sell',
    'rental':'rentals','rent':'rentals',
    'work & gigs':'jobs','gigs':'jobs','work':'jobs',
    'trade & swap':'trade','swap':'trade',
    'event':'events','ticket':'events',
    'food & market':'food','market':'food',
    'services':'service','service':'service',
    'request':'request','requests':'request','wanted':'request',
    'auction':'auction','auctions':'auction',
    'place':'places','venue':'places','places':'places',
  }[cat] || cat;

  const condLabel = {
    new:'brand new / sealed', excellent:'excellent condition',
    good:'good condition', used:'used / pre-owned', parts:'for parts',
  }[cond] || 'good condition';

  switch (catKey) {
    case 'sell': {
      const intros = {
        electronics: `${name} available — ${condLabel}. All functions working as expected.`,
        furniture:   `${name} up for sale — ${condLabel}. Clean and solid, ready for its next home.`,
        fashion:     `${name} for sale — ${condLabel}. Clean and ready to wear.`,
        vehicles:    `${name} for sale — ${condLabel}. Inspection and test drives welcome.`,
        home:        `${name} for sale — ${condLabel}. Practical and in full working order.`,
        general:     `${name} for sale — ${condLabel} and ready for a new owner.`,
      };
      return `${intros[catalog] || intros.general} Collection or delivery through BaseMarket. Use Secure Deal at checkout for full payment protection.`;
    }
    case 'auction':
      return `${name} — ${condLabel}. Now up for auction on BaseMarket. Place your bid and win at a fair price. All bids are binding. Item can be collected or couriered after payment clears.`;
    case 'request': {
      // Strip common search prefixes so description reads naturally
      // Strip "looking for a/an", "wanted:", "need a", "wtb" prefixes
      let searchTerm = title
        .replace(/^(i\s+am\s+looking\s+for\s+an?|i\s+am\s+looking\s+for|looking\s+for\s+an?|looking\s+for|i\s+want\s+an?|i\s+want|i\s+need\s+an?|i\s+need|searching\s+for\s+an?|searching\s+for|seeking|want\s+to\s+buy\s+an?|want\s+to\s+buy|wtb\s+an?|wtb|wanted[^a-z]|wanted|want\s+an?|want|need\s+an?|need)[:\s-]*/i, '')
        .replace(/^[:\-\s]+/, '')   // strip any leftover colon, dash, space
        .replace(/^(a|an)\s+/i, '')
        .trim() || title;
      const niceSearch = titleCase(searchTerm);
      // Use "an" before vowel sounds
      const article = /^[aeiou]/i.test(niceSearch) ? 'an' : 'a';
      return `I am looking for ${article} ${niceSearch} in good working condition. Please message me with photos, the asking price, and your location. Serious buyer — can move quickly on the right deal.`;
    }
    case 'trade':
      return `I have a ${name} available for trade — ${condLabel}. All working. Looking to swap — message me with what you have and we can discuss a fair exchange. Meetup preferred so both sides can inspect.`;
    case 'service':
      return `Professional ${name} available. Reliable, on-time, and quality-focused. Message me with your requirements and I will send a custom quote. Available for once-off and ongoing work.`;
    case 'rentals': {
      const t = String(name).toLowerCase();
      if (/car|vehicle|bakkie|truck|van|suv|motorbike|corolla|polo|toyota|volkswagen|bmw|honda|ford|hyundai|kia|nissan|mazda|mercedes|audi/i.test(t))
        return `${name} available for hire. Well-maintained and roadworthy. Valid licence required. Deposit applies. Message me with your rental dates to confirm availability.`;
      if (/tool|drill|ladder|generator|compressor|scaffold|equipment/i.test(t))
        return `${name} available for hire. In good working order and ready for your project. Deposit required. Message me with the duration you need.`;
      return `${name} available to rent. Well-maintained and ready to move in. Message me to arrange a viewing and discuss lease terms, deposit, and availability.`;
    }
    case 'events':
      return `Join us for ${name}. Tickets available now through BaseMarket. Secure your spot early — limited availability. Message the organiser with any questions about the event.`;
    case 'food':
      return `Fresh ${name} available. Homemade with quality ingredients. Order through BaseMarket for a safe, trackable transaction. Delivery or collection available. Message me with your order.`;
    case 'jobs':
      return `${name} position available. We are looking for a motivated, reliable individual to join our team. Message us with your CV and a short motivation. We respond to all serious applicants.`;
    case 'places':
      return `${name} available for enquiry. Message us with your requirements, preferred date, and number of guests and we will get back to you promptly.`;
    default: {
      const intros = {
        electronics:`${name} available — ${condLabel}. Fully functional and ready for its next owner.`,
        furniture:  `${name} available — ${condLabel}. Solid value for any home or office.`,
        general:    `${name} available — ${condLabel} and ready for a smooth sale.`,
      };
      return `${intros[catalog] || intros.general} Collection or delivery can be arranged through BaseMarket.`;
    }
  }
}

/* ── Scam detection ────────────────────────────────────────────────────────── */
function detectScamSignals(text = '') {
  const lower = String(text || '').toLowerCase();
  const patterns = [
    [/pay outside|outside the app|outside basemarket/,          'Payment requested outside BaseMarket'],
    [/bank transfer only|eft only|crypto only|bitcoin only/,    'Unsafe payment instruction'],
    [/whatsapp only|telegram only|move to whatsapp immediately/,'Attempt to move deal off-platform'],
    [/urgent payment|send proof now|release before delivery/,   'Pressure tactic detected'],
    [/gift card|western union|binance|usdt|moneygram/,          'High-risk payment method mentioned'],
    [/100%\s*guaranteed return|double your money/,             'Suspicious investment language'],
    [/too good to be true/,                                     'Suspicious offer wording'],
  ];
  const flags = [];
  for (const [regex, label] of patterns) if (regex.test(lower)) flags.push(label);
  const riskScore = Math.min(100, flags.length * 26 + (/gift card|western union|binance|usdt/.test(lower) ? 22 : 0));
  return {
    risky: riskScore >= 26,
    riskScore,
    flags,
    advice: flags.length
      ? 'Keep all payment, delivery, and messaging inside BaseMarket Secure Deal.'
      : 'No high-risk patterns detected.',
  };
}

module.exports = { titleCase, inferCatalog, inferCondition, suggestPrice, generateFallbackListing, detectScamSignals };
