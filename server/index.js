import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { execFile } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG — persisted to config.json
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG_PATH = path.join(__dirname, 'config.json');
const DEFAULT_CONFIG = {
  user: { name: '', role: '' },
  epo: {
    consumerKey: process.env.EPO_CONSUMER_KEY || '',
    consumerSecret: process.env.EPO_CONSUMER_SECRET || '',
    authUrl: 'https://ops.epo.org/3.2/auth/accesstoken',
    searchUrl: 'https://ops.epo.org/3.2/rest-services/published-data/search',
    publishedUrl: 'https://ops.epo.org/3.2/rest-services/published-data/publication',
  },
  rateLimit: {
    requestDelayMs: 2500,       // min ms between API requests
    maxRetries: 3,              // retries on RobotDetected
    backoffMultiplier: 2,       // exponential backoff multiplier
    burstLimit: 4,              // max requests before forced pause
    burstPauseMs: 10000,        // pause after burst limit
  },
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      // Deep merge with defaults
      return {
        user: { ...DEFAULT_CONFIG.user, ...raw.user },
        epo: { ...DEFAULT_CONFIG.epo, ...raw.epo },
        rateLimit: { ...DEFAULT_CONFIG.rateLimit, ...raw.rateLimit },
      };
    }
  } catch (e) {
    console.warn('[Config] Load error, using defaults:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

let config = loadConfig();
// Save defaults on first run
if (!fs.existsSync(CONFIG_PATH)) saveConfig(config);

// ═══════════════════════════════════════════════════════════════════════════════
// SQLITE DATABASE — local patent cache
// ═══════════════════════════════════════════════════════════════════════════════

const DB_PATH = path.join(__dirname, 'patents.db');
const db = new Database(DB_PATH);

// WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS patents (
    doc_id TEXT PRIMARY KEY,
    country TEXT,
    doc_number TEXT,
    kind TEXT,
    family_id TEXT,
    title TEXT,
    applicants TEXT,       -- JSON array
    inventors TEXT,        -- JSON array
    abstract TEXT,
    ipc_classes TEXT,      -- JSON array
    date_pub TEXT,
    ref TEXT,
    innovation_score INTEGER,
    ai_insight TEXT,
    action TEXT,
    query TEXT,            -- which CQL query found this
    cached_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_patents_score ON patents(innovation_score DESC);
  CREATE INDEX IF NOT EXISTS idx_patents_query ON patents(query);
  CREATE INDEX IF NOT EXISTS idx_patents_cached ON patents(cached_at DESC);

  CREATE TABLE IF NOT EXISTS search_cache (
    query_key TEXT PRIMARY KEY,
    total_results INTEGER,
    result_count INTEGER,
    result_doc_ids TEXT,   -- JSON array of doc_ids
    cached_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS api_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT,
    status INTEGER,
    response_time_ms INTEGER,
    robot_detected INTEGER DEFAULT 0,
    timestamp TEXT DEFAULT (datetime('now'))
  );
`);

// Prepared statements
const stmts = {
  upsertPatent: db.prepare(`
    INSERT INTO patents (doc_id, country, doc_number, kind, family_id, title, applicants, inventors,
      abstract, ipc_classes, date_pub, ref, innovation_score, ai_insight, action, query, cached_at, updated_at)
    VALUES (@doc_id, @country, @doc_number, @kind, @family_id, @title, @applicants, @inventors,
      @abstract, @ipc_classes, @date_pub, @ref, @innovation_score, @ai_insight, @action, @query, datetime('now'), datetime('now'))
    ON CONFLICT(doc_id) DO UPDATE SET
      title = @title, applicants = @applicants, inventors = @inventors, abstract = @abstract,
      ipc_classes = @ipc_classes, innovation_score = @innovation_score, ai_insight = @ai_insight,
      action = @action, query = @query, updated_at = datetime('now')
  `),

  getPatent: db.prepare('SELECT * FROM patents WHERE doc_id = ?'),

  searchPatents: db.prepare(`
    SELECT * FROM patents
    WHERE (title LIKE ? OR abstract LIKE ? OR applicants LIKE ?)
    ORDER BY innovation_score DESC LIMIT ?
  `),

  getAllPatents: db.prepare('SELECT * FROM patents ORDER BY innovation_score DESC LIMIT ? OFFSET ?'),

  getPatentsByQuery: db.prepare(`
    SELECT p.* FROM patents p
    WHERE p.query LIKE ?
    ORDER BY p.innovation_score DESC LIMIT ?
  `),

  getSearchCache: db.prepare('SELECT * FROM search_cache WHERE query_key = ?'),

  upsertSearchCache: db.prepare(`
    INSERT INTO search_cache (query_key, total_results, result_count, result_doc_ids, cached_at)
    VALUES (@query_key, @total_results, @result_count, @result_doc_ids, datetime('now'))
    ON CONFLICT(query_key) DO UPDATE SET
      total_results = @total_results, result_count = @result_count,
      result_doc_ids = @result_doc_ids, cached_at = datetime('now')
  `),

  logApi: db.prepare(`
    INSERT INTO api_log (endpoint, status, response_time_ms, robot_detected)
    VALUES (@endpoint, @status, @response_time_ms, @robot_detected)
  `),

  getStats: db.prepare(`
    SELECT
      COUNT(*) as total_patents,
      COUNT(DISTINCT query) as unique_queries,
      SUM(CASE WHEN robot_detected = 1 THEN 1 ELSE 0 END) as robot_detections
    FROM patents, api_log
  `),

  getDbStats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM patents) as total_patents,
      (SELECT COUNT(*) FROM search_cache) as cached_searches,
      (SELECT COUNT(*) FROM api_log) as total_api_calls,
      (SELECT SUM(robot_detected) FROM api_log) as robot_detections,
      (SELECT MAX(cached_at) FROM patents) as last_cached
  `),

  exportAll: db.prepare('SELECT * FROM patents ORDER BY innovation_score DESC'),
};

// Bulk upsert helper
const bulkUpsertPatents = db.transaction((patents) => {
  for (const p of patents) {
    stmts.upsertPatent.run({
      doc_id: p.docId,
      country: p.country,
      doc_number: p.docNumber,
      kind: p.kind,
      family_id: p.familyId || '',
      title: p.title,
      applicants: JSON.stringify(p.applicants || []),
      inventors: JSON.stringify(p.inventors || []),
      abstract: p.abstract || '',
      ipc_classes: JSON.stringify(p.ipcClasses || []),
      date_pub: p.datePub || '',
      ref: p.ref,
      innovation_score: p.innovation_score || 0,
      ai_insight: p.ai_insight || '',
      action: p.action || '',
      query: p._query || '',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITER — anti-robot protection
// ═══════════════════════════════════════════════════════════════════════════════

class RateLimiter {
  constructor(cfg) {
    this.delayMs = cfg.requestDelayMs;
    this.maxRetries = cfg.maxRetries;
    this.backoffMultiplier = cfg.backoffMultiplier;
    this.burstLimit = cfg.burstLimit;
    this.burstPauseMs = cfg.burstPauseMs;
    this.lastRequestTime = 0;
    this.requestCount = 0;
    this.queue = [];
    this.processing = false;
  }

  update(cfg) {
    this.delayMs = cfg.requestDelayMs;
    this.maxRetries = cfg.maxRetries;
    this.backoffMultiplier = cfg.backoffMultiplier;
    this.burstLimit = cfg.burstLimit;
    this.burstPauseMs = cfg.burstPauseMs;
  }

  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    // Burst protection
    this.requestCount++;
    if (this.requestCount > this.burstLimit) {
      console.log(`[RateLimiter] Burst limit reached (${this.burstLimit}), pausing ${this.burstPauseMs}ms`);
      await sleep(this.burstPauseMs);
      this.requestCount = 0;
    }

    // Normal delay
    if (elapsed < this.delayMs) {
      const waitTime = this.delayMs - elapsed;
      await sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  async fetchWithRetry(url, options, retries = 0) {
    await this.wait();

    const start = Date.now();
    try {
      const res = await fetch(url, options);
      const elapsed = Date.now() - start;

      // Check for robot detection
      if (res.status === 403) {
        const text = await res.text();
        const isRobot = text.includes('RobotDetected');

        // Log it
        stmts.logApi.run({
          endpoint: url.split('/rest-services/')[1] || url,
          status: res.status,
          response_time_ms: elapsed,
          robot_detected: isRobot ? 1 : 0,
        });

        if (isRobot && retries < this.maxRetries) {
          const backoff = this.delayMs * Math.pow(this.backoffMultiplier, retries + 1);
          console.warn(`[RobotDetected] Retry ${retries + 1}/${this.maxRetries} after ${backoff}ms`);
          await sleep(backoff);
          return this.fetchWithRetry(url, options, retries + 1);
        }

        if (isRobot) {
          throw new Error('RobotDetected: Max retries exceeded. Try increasing request delay in Settings.');
        }

        // Non-robot 403
        throw new Error(`API ${res.status}: ${text}`);
      }

      // Log successful request
      stmts.logApi.run({
        endpoint: url.split('/rest-services/')[1] || url,
        status: res.status,
        response_time_ms: elapsed,
        robot_detected: 0,
      });

      if (!res.ok) {
        throw new Error(`API ${res.status}: ${await res.text()}`);
      }

      return res;
    } catch (err) {
      if (err.message.startsWith('RobotDetected') || err.message.startsWith('API ')) throw err;
      // Network error
      stmts.logApi.run({
        endpoint: url.split('/rest-services/')[1] || url,
        status: 0,
        response_time_ms: Date.now() - start,
        robot_detected: 0,
      });
      throw err;
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── XML parsing helper (EPO OPS returns XML, not JSON) ────────────────────────
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '$',
  allowBooleanAttributes: true,
  parseTagValue: true,
  trimValues: true,
});

async function fetchXml(url, options) {
  const res = await limiter.fetchWithRetry(url, {
    ...options,
    headers: { ...options?.headers, 'Accept': 'application/xml' },
  });
  const text = await res.text();
  return xmlParser.parse(text);
}

const limiter = new RateLimiter(config.rateLimit);

// ═══════════════════════════════════════════════════════════════════════════════
// EPO OPS HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

let tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;

  const epo = config.epo;
  const cred = Buffer.from(`${epo.consumerKey}:${epo.consumerSecret}`).toString('base64');

  const res = await limiter.fetchWithRetry(epo.authUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${cred}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  console.log(`[OPS] Token: ${data.expires_in}s`);
  return tokenCache.token;
}

// ─── XML/JSON helpers ────────────────────────────────────────────────────────
function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }
function val(obj) { if (!obj) return ''; if (typeof obj === 'string') return obj; return obj['$'] || ''; }
function txt(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (obj['$'] && typeof obj['$'] === 'string') return obj['$'];
  if (obj['$'] && obj['$']['$']) return obj['$']['$'];
  return String(obj);
}
function dig(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

function parseSearchResults(data) {
  const wb = data?.['ops:world-patent-data'] || {};
  const bs = wb?.['ops:biblio-search'] || {};
  const sr = bs?.['ops:search-result'] || {};
  let refs = sr?.['ops:publication-reference'] || [];
  if (!Array.isArray(refs)) refs = refs ? [refs] : [];

  return refs.map(ref => {
    const docId = ref?.['document-id'] || {};
    return {
      country: val(docId?.country),
      docNumber: val(docId?.['doc-number']),
      kind: val(docId?.kind),
      familyId: ref?.['@family-id'] || '',
    };
  }).filter(r => r.country && r.docNumber);
}

function parseBiblio(raw, country, docNumber, kind) {
  const worldData = raw?.['ops:world-patent-data'] || {};
  const exchangeDoc = worldData['exchange-documents']?.['exchange-document'] || {};
  const biblio = exchangeDoc['bibliographic-data'] || {};

  let title = 'Untitled';
  for (const t of arr(biblio['invention-title'])) {
    const v = t?.['$'] || '';
    if (t?.['@lang'] === 'en' && v) { title = v; break; }
    if (v && title === 'Untitled') title = v;
  }

  const applicantNodes = arr(biblio?.parties?.applicants?.applicant);
  const applicants = applicantNodes
    .map(a => { const n = a?.['applicant-name']?.name; return n?.['$'] || txt(n) || ''; })
    .filter(Boolean);

  const inventorNodes = arr(biblio?.parties?.inventors?.inventor);
  const inventors = inventorNodes
    .map(inv => {
      const n = inv?.['inventor-name'];
      if (n?.name) return n.name?.['$'] || txt(n.name) || '';
      return txt(n) || '';
    })
    .filter(Boolean);

  const classNodes = arr(biblio?.['classifications-ipcr']?.['classification-ipcr']);
  const ipcClasses = classNodes.map(c => txt(c?.text)).filter(Boolean).slice(0, 5);

  let abstract = '';
  const absNode = exchangeDoc?.abstract;
  if (absNode) {
    abstract = absNode?.p?.['$'] || txt(absNode?.p) || absNode?.['$'] || txt(absNode) || '';
    abstract = abstract.replace(/\[\d{4}\]\s*/g, '').trim();
  }

  const datePub = biblio?.['date-publ']?.['$'] || '';

  return {
    docId: `${country}${docNumber}${kind}`,
    country, docNumber, kind,
    title, applicants, inventors, abstract, ipcClasses, datePub,
    ref: `${country} ${docNumber} ${kind}`,
  };
}

function scorePatent(p) {
  let score = 50;
  const text = `${p.title} ${p.abstract}`.toLowerCase();
  const bonuses = [
    [/(?:solid[-\s]?state)/, 15], [/electrolyte/, 10],
    [/(?:manufactur|scalab)/, 8], [/(?:solid electrolyte interphase|\bsei\b)/, 12],
    [/(?:cathode|anode)/, 5], [/ionic conductivity/, 8],
    [/(?:polymer|ceramic)/, 5], [/(?:lithium|li[-\s]?ion)/, 5],
    [/(?:energy density|cycle life)/, 6],
  ];
  for (const [re, pts] of bonuses) { if (re.test(text)) score += pts; }
  return Math.min(score, 99);
}

function generateInsight(p, score) {
  const abs = (p.abstract || 'No abstract available.').slice(0, 120);
  const who = p.applicants?.[0] || p.ref;
  if (score >= 90) return `High-potential IP from ${who}. ${abs}... Strong candidate for immediate BD outreach.`;
  if (score >= 80) return `${who}'s approach shows promise. ${abs}... Worth monitoring for M&A or licensing.`;
  return `Emerging technology from ${who}. ${abs}... Consider for long-term portfolio watch.`;
}

function scoreToAction(score) {
  if (score >= 88) return 'Initiate BD Call';
  if (score >= 78) return 'Monitor M&A Potential';
  return 'Schedule Deep Dive';
}

// ─── Cache-aware enrichment ──────────────────────────────────────────────────
async function enrichPatent(token, { country, docNumber, kind }, query) {
  const docId = `${country}${docNumber}${kind}`;

  // Check cache first
  const cached = stmts.getPatent.get(docId);
  if (cached && cached.title !== 'Untitled') {
    return {
      docId: cached.doc_id, country: cached.country, docNumber: cached.doc_number,
      kind: cached.kind, title: cached.title,
      applicants: JSON.parse(cached.applicants || '[]'),
      inventors: JSON.parse(cached.inventors || '[]'),
      abstract: cached.abstract, ipcClasses: JSON.parse(cached.ipc_classes || '[]'),
      datePub: cached.date_pub, ref: cached.ref,
      innovation_score: cached.innovation_score,
      ai_insight: cached.ai_insight,
      action: cached.action,
      _cached: true,
    };
  }

  // Fetch from API
  const url = `${config.epo.publishedUrl}/docdb/${country}.${docNumber}.${kind}/biblio`;
  try {
  const raw = await fetchXml(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const parsed = parseBiblio(raw, country, docNumber, kind);
    if (!parsed) return null;

    const score = scorePatent(parsed);
    const insight = generateInsight(parsed, score);
    const action = scoreToAction(score);

    // Cache to DB
    bulkUpsertPatents([{ ...parsed, innovation_score: score, ai_insight: insight, action, _query: query }]);

    return { ...parsed, innovation_score: score, ai_insight: insight, action, _cached: false };
  } catch {
    return null;
  }
}

async function enrichAll(token, searchResults, query) {
  const seen = new Set();
  const unique = searchResults.filter(r => {
    const k = `${r.country}${r.docNumber}${r.kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const enriched = [];
  for (let i = 0; i < unique.length && enriched.length < 15; i += 5) {
    const batch = unique.slice(i, i + 5);
    const results = await Promise.all(batch.map(r => enrichPatent(token, r, query)));
    for (const r of results) { if (r) enriched.push(r); }
  }

  if (enriched.length === 0 && unique.length > 0) {
    for (const r of unique.slice(0, 10)) {
      enriched.push({
        docId: `${r.country}${r.docNumber}${r.kind}`, ...r,
        title: `Patent ${r.ref}`, applicants: [], inventors: [],
        abstract: '', ipcClasses: [],
        ref: `${r.country} ${r.docNumber} ${r.kind}`,
      });
    }
  }

  return enriched
    .map(p => ({ ...p, innovation_score: p.innovation_score || scorePatent(p), ai_insight: p.ai_insight || generateInsight(p, p.innovation_score || scorePatent(p)), action: p.action || scoreToAction(p.innovation_score || scorePatent(p)) }))
    .sort((a, b) => b.innovation_score - a.innovation_score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEYWORD EXPANSION — turns a free-text topic into CQL query suggestions
// ═══════════════════════════════════════════════════════════════════════════════

const ENERGY_EXPANSIONS = {
  // Battery & storage
  'solid-state battery': ['solid electrolyte', 'lithium solid', 'sulfide electrolyte', 'oxide electrolyte', 'solid-state cell'],
  'battery': ['electrochemical cell', 'lithium-ion', 'anode cathode', 'battery management', 'energy density'],
  'lithium': ['lithium-ion', 'lithium metal', 'lithium sulfur', 'lithium air', 'Li-ion'],
  'sodium-ion': ['sodium battery', 'Na-ion', 'hard carbon anode', 'sodium electrolyte', 'prussian blue cathode'],
  'flow battery': ['vanadium redox', 'zinc bromine', 'redox flow', 'aqueous battery', 'membrane electrolyte'],
  // Hydrogen
  'hydrogen': ['fuel cell', 'electrolyser', 'electrolysis', 'hydrogen storage', 'proton exchange membrane', 'PEM', 'green hydrogen'],
  'electrolyser': ['electrolysis', 'proton exchange', 'solid oxide electrolysis', 'alkaline electrolysis', 'hydrogen production'],
  'fuel cell': ['PEM fuel cell', 'solid oxide fuel cell', 'catalyst electrode', 'membrane electrode', 'bipolar plate'],
  // Solar
  'solar': ['photovoltaic', 'perovskite', 'tandem cell', 'solar panel', 'PV module', 'silicon wafer'],
  'perovskite': ['perovskite solar', 'halide perovskite', 'tandem solar', 'stability perovskite', 'encapsulation'],
  // Wind
  'wind': ['wind turbine', 'offshore wind', 'rotor blade', 'gearbox generator', 'wind farm', 'floating wind'],
  'offshore wind': ['offshore turbine', 'monopile jacket', 'floating platform', 'subsea cable', 'wind farm installation'],
  // EV & charging
  'EV charging': ['electric vehicle charger', 'fast charging', 'V2G', 'charging station', 'battery swapping', 'wireless charging'],
  'electric vehicle': ['EV battery', 'drive train', 'power electronics', 'battery pack', 'thermal management'],
  // Grid & smart
  'smart grid': ['grid storage', 'demand response', 'microgrid', 'virtual power plant', 'grid inverter', 'V2G'],
  'grid storage': ['grid battery', 'energy storage system', 'ESS', 'peak shaving', 'frequency regulation'],
  // Carbon & CCUS
  'carbon capture': ['CCUS', 'CO2 capture', 'carbon dioxide separation', 'direct air capture', 'point source capture', 'DAC'],
  'CCUS': ['carbon capture', 'CO2 storage', 'geological sequestration', 'amine scrubbing', 'mineralization'],
  // Nuclear
  'nuclear': ['nuclear reactor', 'small modular reactor', 'SMR', 'nuclear fuel', 'fusion reactor', 'molten salt reactor'],
  'SMR': ['small modular reactor', 'passive safety', 'modular nuclear', 'integral pressurized water reactor', 'nuclear microreactor'],
  // Heat pump & efficiency
  'heat pump': ['heat exchanger', 'geothermal', 'air source heat pump', 'refrigerant', 'COP coefficient'],
};

function generateSuggestions(topic) {
  const normalized = topic.toLowerCase().trim();
  const suggestions = [];

  // Strategy 1: Check exact/partial match in expansion map
  for (const [key, expansions] of Object.entries(ENERGY_EXPANSIONS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      // Title-abstract search for the main topic
      suggestions.push({
        label: `${topic} (title + abstract)`,
        cql: `ta="${key}"`,
        angle: 'Broad match',
      });

      // Pick 2-3 most relevant expansions for narrower searches
      const picked = expansions.slice(0, 3);
      for (const exp of picked) {
        const words = exp.split(/\s+/);
        if (words.length > 1) {
          suggestions.push({
            label: `${exp}`,
            cql: `ta="${exp}"`,
            angle: 'Narrow focus',
          });
        } else {
          suggestions.push({
            label: `${topic} + ${exp}`,
            cql: `ta="${key}" AND ta=${exp}`,
            angle: 'Cross-topic',
          });
        }
      }
      break; // Use first match
    }
  }

  // Strategy 2: No match — generate generic CQL from raw input
  if (suggestions.length === 0) {
    const words = normalized.split(/\s+/).filter(w => w.length > 2);

    // Title + abstract exact phrase
    suggestions.push({
      label: `${topic} (title + abstract)`,
      cql: `ta="${normalized}"`,
      angle: 'Exact phrase',
    });

    // Title-only
    suggestions.push({
      label: `${topic} (title only)`,
      cql: `ti="${normalized}"`,
      angle: 'Title match',
    });

    // Keyword search
    if (words.length >= 2) {
      suggestions.push({
        label: `${topic} (keywords)`,
        cql: `cl=${words[0]} AND cl=${words[1]}`,
        angle: 'Classify search',
      });
    }

    // Abstract broad
    suggestions.push({
      label: `${topic} (abstract)`,
      cql: `ab="${normalized}"`,
      angle: 'Abstract match',
    });

    // OR combination of individual words in title
    if (words.length >= 2) {
      const orQuery = words.map(w => `ti=${w}`).join(' OR ');
      suggestions.push({
        label: `Any word in title`,
        cql: orQuery,
        angle: 'Loose match',
      });
    }
  }

  // Deduplicate by cql, keep first 5
  const seen = new Set();
  return suggestions.filter(s => {
    if (seen.has(s.cql)) return false;
    seen.add(s.cql);
    return true;
  }).slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Settings API ────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json({
    user: config.user,
    epo: {
      consumerKey: config.epo.consumerKey,
      consumerSecret: config.epo.consumerSecret ? '••••••••' + config.epo.consumerSecret.slice(-8) : '',
      authUrl: config.epo.authUrl,
      searchUrl: config.epo.searchUrl,
      publishedUrl: config.epo.publishedUrl,
    },
    rateLimit: config.rateLimit,
  });
});

app.put('/api/settings', (req, res) => {
  try {
    const { user, epo, rateLimit } = req.body;

    if (user) config.user = { ...config.user, ...user };
    if (epo) {
      // Only update secret if it's not the masked value
      if (epo.consumerSecret && !epo.consumerSecret.startsWith('••••')) {
        config.epo.consumerSecret = epo.consumerSecret;
      }
      if (epo.consumerKey) config.epo.consumerKey = epo.consumerKey;
      if (epo.authUrl) config.epo.authUrl = epo.authUrl;
      if (epo.searchUrl) config.epo.searchUrl = epo.searchUrl;
      if (epo.publishedUrl) config.epo.publishedUrl = epo.publishedUrl;
    }
    if (rateLimit) {
      config.rateLimit = { ...config.rateLimit, ...rateLimit };
      limiter.update(config.rateLimit);
    }

    saveConfig(config);
    // Reset token cache on config change
    tokenCache = { token: null, expiresAt: 0 };
    res.json({ ok: true, message: 'Settings saved. Token cache cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Suggest search angles from free-text topic ──────────────────────────────

app.post('/api/suggest', (req, res) => {
  const { topic } = req.body;
  if (!topic || typeof topic !== 'string' || topic.trim().length < 2) {
    return res.status(400).json({ error: 'topic required (min 2 chars)' });
  }
  const suggestions = generateSuggestions(topic.trim());
  res.json({ topic: topic.trim(), suggestions });
});

// ─── Google Patents scraper (large-scale scan) ───────────────────────────────

const PYTHON = process.env.PYTHON || 'python3';
const SCRAPER_PATH = path.join(__dirname, 'google_patents_scraper.py');

app.get('/api/patents/google', async (req, res) => {
  const { query, count = '10' } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });

  console.log(`[GooglePatents] Scraping: ${query} (max ${count})`);

  try {
    const output = await new Promise((resolve, reject) => {
      const child = execFile(PYTHON, [SCRAPER_PATH, query, String(count)], {
        timeout: 120000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      }, (err, stdout, stderr) => {
        if (stderr) console.log(stderr.trim());
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      });
    });

    const data = JSON.parse(output);
    if (data.error) return res.status(500).json(data);
    res.json(data);
  } catch (err) {
    console.error('[GooglePatents Error]', err.message);
    res.status(500).json({ error: err.message, source: 'google_patents' });
  }
});

// ─── Test EPO connection ─────────────────────────────────────────────────────

app.post('/api/settings/test', async (req, res) => {
  try {
    // Use either provided credentials or existing config
    const testEpo = req.body?.epo ? { ...config.epo, ...req.body.epo } : config.epo;
    const cred = Buffer.from(`${testEpo.consumerKey}:${testEpo.consumerSecret}`).toString('base64');

    const start = Date.now();
    const authRes = await fetch(testEpo.authUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${cred}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const elapsed = Date.now() - start;

    if (!authRes.ok) {
      const text = await authRes.text();
      return res.json({ ok: false, message: `Auth failed (${authRes.status}): ${text}`, responseMs: elapsed });
    }

    const data = await authRes.json();

    // Quick search test
    let searchOk = false;
    try {
      const token = data.access_token;
      const testQuery = 'ta="battery"';
      const testRes = await fetchXml(`${testEpo.searchUrl}?q=${encodeURIComponent(testQuery)}&Range=1-1`,
        { headers: { 'Authorization': `Bearer ${token}` } });
      searchOk = !!(testRes['ops:world-patent-data'] || testRes['world-patent-data']);
    } catch {}

    res.json({
      ok: true,
      message: `Connected! Token expires in ${data.expires_in}s. Search: ${searchOk ? 'OK' : 'Failed'}`,
      responseMs: elapsed,
      tokenExpiresIn: data.expires_in,
      searchOk,
    });
  } catch (err) {
    res.json({ ok: false, message: `Connection failed: ${err.message}` });
  }
});

// ─── Database stats ──────────────────────────────────────────────────────────

app.get('/api/db/stats', (req, res) => {
  const stats = stmts.getDbStats.get();
  res.json(stats);
});

app.get('/api/db/patents', (req, res) => {
  const { search, limit = 50, offset = 0 } = req.query;
  let patents;
  if (search) {
    const term = `%${search}%`;
    patents = stmts.searchPatents.all(term, term, term, parseInt(limit));
  } else {
    patents = stmts.getAllPatents.all(parseInt(limit), parseInt(offset));
  }
  // Parse JSON fields
  const parsed = patents.map(p => ({
    ...p,
    applicants: JSON.parse(p.applicants || '[]'),
    inventors: JSON.parse(p.inventors || '[]'),
    ipc_classes: JSON.parse(p.ipc_classes || '[]'),
  }));
  res.json({ patents: parsed, count: parsed.length });
});

// ─── Export endpoints ────────────────────────────────────────────────────────

app.get('/api/export/json', (req, res) => {
  const patents = stmts.exportAll.all().map(p => ({
    ...p,
    applicants: JSON.parse(p.applicants || '[]'),
    inventors: JSON.parse(p.inventors || '[]'),
    ipc_classes: JSON.parse(p.ipc_classes || '[]'),
  }));
  res.setHeader('Content-Disposition', 'attachment; filename=patents_export.json');
  res.json({ exportedAt: new Date().toISOString(), count: patents.length, patents });
});

app.get('/api/export/csv', (req, res) => {
  const patents = stmts.exportAll.all();
  const headers = ['doc_id', 'country', 'doc_number', 'kind', 'title', 'applicants', 'inventors', 'abstract', 'ipc_classes', 'date_pub', 'ref', 'innovation_score', 'ai_insight', 'action', 'cached_at'];
  const csvRows = [headers.join(',')];

  for (const p of patents) {
    const row = headers.map(h => {
      let val = p[h] || '';
      if (h === 'applicants' || h === 'inventors' || h === 'ipc_classes') {
        val = JSON.parse(val || '[]').join('; ');
      }
      // Escape CSV
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) val = `"${val}"`;
      return val;
    });
    csvRows.push(row.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=patents_export.csv');
  res.send(csvRows.join('\n'));
});

// ─── Main patent search (cache-aware) ────────────────────────────────────────

app.get('/api/patents/search', async (req, res) => {
  try {
    const { query, range = '1-10', pd = '20230101-20251231' } = req.query;
    if (!query) return res.status(400).json({ error: 'query required' });

    const cql = `${query} AND pd within "${pd}"`;
    const cacheKey = `${cql} [${range}]`;

    // Check search cache (valid for 24h)
    const cached = stmts.getSearchCache.get(cacheKey);
    if (cached) {
      const cacheAge = Date.now() - new Date(cached.cached_at).getTime();
      if (cacheAge < 24 * 60 * 60 * 1000) {
        console.log(`[Cache Hit] ${cacheKey} (${Math.round(cacheAge / 60000)}min old)`);
        const docIds = JSON.parse(cached.result_doc_ids || '[]');
        const patents = docIds.map(id => {
          const p = stmts.getPatent.get(id);
          if (!p) return null;
          return {
            ...p, docId: p.doc_id,
            applicants: JSON.parse(p.applicants || '[]'),
            inventors: JSON.parse(p.inventors || '[]'),
            ipcClasses: JSON.parse(p.ipc_classes || '[]'),
            datePub: p.date_pub,
          };
        }).filter(Boolean);

        if (patents.length > 0) {
          return res.json({
            totalResults: cached.total_results,
            patents: patents.map(p => ({ ...p, innovation_score: p.innovation_score || scorePatent(p), ai_insight: p.ai_insight || generateInsight(p, p.innovation_score || scorePatent(p)), action: p.action || scoreToAction(p.innovation_score || scorePatent(p)) })).sort((a, b) => b.innovation_score - a.innovation_score),
            query: cql,
            fetchedAt: cached.cached_at,
            _cached: true,
          });
        }
      }
    }

    // Cache miss — hit the API
    console.log(`[Search] ${cql} [${range}]`);
    const token = await getToken();

    const searchData = await fetchXml(
      `${config.epo.searchUrl}?q=${encodeURIComponent(cql)}&Range=${range}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    const refs = parseSearchResults(searchData);
    console.log(`[Search] Found ${refs.length} refs`);
    const patents = await enrichAll(token, refs, cql);
    console.log(`[Enrich] Got ${patents.length} enriched patents`);

    const totalResults = parseInt(
      dig(searchData, 'ops:world-patent-data.ops:biblio-search.@total-result-count') || '0', 10
    );

    // Cache the search
    bulkUpsertPatents(patents);
    stmts.upsertSearchCache.run({
      query_key: cacheKey,
      total_results: totalResults,
      result_count: patents.length,
      result_doc_ids: JSON.stringify(patents.map(p => p.docId)),
    });

    res.json({ totalResults, patents, query: cql, fetchedAt: new Date().toISOString(), _cached: false });
  } catch (err) {
    console.error('[Error]', err.message);

    // Fallback: try to serve from cache even if expired
    try {
      const { query, range = '1-10', pd = '20230101-20251231' } = req.query;
      const cql = `${query} AND pd within "${pd}"`;
      const cacheKey = `${cql} [${range}]`;
      const cached = stmts.getSearchCache.get(cacheKey);
      if (cached) {
        const docIds = JSON.parse(cached.result_doc_ids || '[]');
        const patents = docIds.map(id => {
          const p = stmts.getPatent.get(id);
          if (!p) return null;
          return {
            ...p, docId: p.doc_id,
            applicants: JSON.parse(p.applicants || '[]'),
            inventors: JSON.parse(p.inventors || '[]'),
            ipcClasses: JSON.parse(p.ipc_classes || '[]'),
            innovation_score: p.innovation_score,
            ai_insight: p.ai_insight,
            action: p.action,
          };
        }).filter(Boolean);
        if (patents.length > 0) {
          return res.json({
            totalResults: cached.total_results,
            patents,
            query: cql,
            fetchedAt: cached.cached_at,
            _cached: true,
            _stale: true,
            _error: err.message,
          });
        }
      }
    } catch {}

    res.status(500).json({ error: err.message });
  }
});

// ─── Gap Analysis ────────────────────────────────────────────────────────────

app.get('/api/analysis/gap', async (req, res) => {
  try {
    const { competitor, ourDomain = 'energy storage system' } = req.query;
    if (!competitor) return res.status(400).json({ error: 'competitor required' });

    const token = await getToken();

    // Search our domain patents
    let ourPatents = [];
    const ourQueries = [`ta="${ourDomain}" AND pd within "20230101-20251231"`, `ta="battery" AND pd within "20230101-20251231"`];
    for (const oq of ourQueries) {
      try {
        const searchData = await fetchXml(`${config.epo.searchUrl}?q=${encodeURIComponent(oq)}&Range=1-10`,
          { headers: { 'Authorization': `Bearer ${token}` } });
        const refs = parseSearchResults(searchData);
        ourPatents = (await Promise.all(refs.slice(0, 5).map(r => enrichPatent(token, r, oq)))).filter(Boolean);
        if (ourPatents.length > 0) break;
      } catch {}
    }

    // Search competitor patents
    let compPatents = [];
    const compQueries = [
      `pa="${competitor}" AND ta="solid-state" AND pd within "20230101-20251231"`,
      `pa="${competitor}" AND ta="battery" AND pd within "20220101-20251231"`,
      `pa="${competitor}" AND ta="battery"`,
    ];
    for (const cq of compQueries) {
      try {
        const searchData = await fetchXml(`${config.epo.searchUrl}?q=${encodeURIComponent(cq)}&Range=1-10`,
          { headers: { 'Authorization': `Bearer ${token}` } });
        const refs = parseSearchResults(searchData);
        compPatents = (await Promise.all(refs.slice(0, 5).map(r => enrichPatent(token, r, cq)))).filter(Boolean);
        if (compPatents.length > 0) break;
      } catch {}
    }

    // Extract IPC classes for gap detection
    const ourClasses = new Set(ourPatents.flatMap(p => p.ipcClasses || []));
    const compClasses = new Set(compPatents.flatMap(p => p.ipcClasses || []));
    const overlap = [...ourClasses].filter(c => compClasses.has(c));
    const uniqueToComp = [...compClasses].filter(c => !ourClasses.has(c));

    const extractKeywords = (patents) => {
      const text = patents.map(p => `${p.title} ${p.abstract}`).join(' ').toLowerCase();
      const keywords = ['electrolyte', 'cathode', 'anode', 'polymer', 'ceramic', 'sulfide',
        'oxide', 'lithium', 'sodium', 'manufacturing', 'scalab', 'conductivity',
        'interface', 'coating', 'separator', 'thermal'];
      return keywords.filter(kw => text.includes(kw));
    };

    const ourKw = extractKeywords(ourPatents);
    const compKw = extractKeywords(compPatents);
    const kwOverlap = ourKw.filter(k => compKw.includes(k));
    const kwGap = compKw.filter(k => !ourKw.includes(k));

    res.json({
      competitor, ourDomain,
      ourPatents: ourPatents.length,
      competitorPatents: compPatents.length,
      analysis: {
        techOverlap: kwOverlap,
        techGap: kwGap,
        ipcOverlap: overlap,
        ipcGap: uniqueToComp,
        complementarityScore: Math.round((kwGap.length / Math.max(compKw.length, 1)) * 100),
        recommendation: kwGap.length > 3
          ? `Strong complementarity. ${competitor} has expertise in ${kwGap.slice(0, 3).join(', ')}.`
          : kwGap.length > 0
            ? `Moderate overlap. Consider partnership in ${kwGap.join(', ')}.`
            : `High overlap with ${competitor}. Focus on differentiation.`,
      },
      competitorSample: compPatents.slice(0, 3).map(p => ({ ref: p.ref, title: p.title, score: p.innovation_score })),
      ourSample: ourPatents.slice(0, 3).map(p => ({ ref: p.ref, title: p.title, score: p.innovation_score })),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Gap Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Ecosystem ───────────────────────────────────────────────────────────────

app.get('/api/analysis/ecosystem', async (req, res) => {
  try {
    const { company } = req.query;
    if (!company) return res.status(400).json({ error: 'company required' });

    const token = await getToken();
    const query = `pa="${company}" AND ta="battery" AND pd within "20220101-20251231"`;

    const searchData = await fetchXml(`${config.epo.searchUrl}?q=${encodeURIComponent(query)}&Range=1-20`,
      { headers: { 'Authorization': `Bearer ${token}` } });
    const refs = parseSearchResults(searchData);

    const patents = [];
    for (let i = 0; i < refs.length && patents.length < 10; i += 5) {
      const batch = refs.slice(i, i + 5);
      const results = await Promise.all(batch.map(r => enrichPatent(token, r, query)));
      for (const r of results) { if (r) patents.push(r); }
    }

    const coApplicants = {};
    const inventorFreq = {};
    const techAreas = {};

    for (const p of patents) {
      for (const app of (p.applicants || [])) {
        const normalized = app.replace(/\s*\[.*?\]\s*/g, '').trim();
        if (normalized.toUpperCase() !== company.toUpperCase()) {
          coApplicants[normalized] = (coApplicants[normalized] || 0) + 1;
        }
      }
      for (const inv of (p.inventors || [])) {
        const name = inv.replace(/\s*\[.*?\]\s*/g, '').trim();
        if (name) inventorFreq[name] = (inventorFreq[name] || 0) + 1;
      }
      for (const ipc of (p.ipcClasses || [])) {
        const section = ipc.slice(0, 4).trim();
        techAreas[section] = (techAreas[section] || 0) + 1;
      }
    }

    const partners = Object.entries(coApplicants)
      .map(([name, count]) => ({ name, collaborationCount: count }))
      .sort((a, b) => b.collaborationCount - a.collaborationCount);

    const topInventors = Object.entries(inventorFreq)
      .map(([name, count]) => ({ name, patentCount: count }))
      .sort((a, b) => b.patentCount - a.patentCount)
      .slice(0, 10);

    const topTech = Object.entries(techAreas)
      .map(([area, count]) => ({ area, patentCount: count }))
      .sort((a, b) => b.patentCount - a.patentCount)
      .slice(0, 8);

    res.json({
      company, totalPatents: patents.length, partners, topInventors, topTech,
      patents: patents.slice(0, 5).map(p => ({
        ref: p.ref, title: p.title, applicants: p.applicants, score: p.innovation_score,
      })),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Ecosystem Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Inventors ───────────────────────────────────────────────────────────────

app.get('/api/analysis/inventors', async (req, res) => {
  try {
    const { domain = 'solid-state battery', count = '15' } = req.query;
    const token = await getToken();
    const query = `ta="${domain}" AND pd within "20220101-20251231"`;

    const searchData = await fetchXml(`${config.epo.searchUrl}?q=${encodeURIComponent(query)}&Range=1-${count}`,
      { headers: { 'Authorization': `Bearer ${token}` } });
    const refs = parseSearchResults(searchData);

    const patents = [];
    for (let i = 0; i < refs.length && patents.length < 12; i += 5) {
      const batch = refs.slice(i, i + 5);
      const results = await Promise.all(batch.map(r => enrichPatent(token, r, query)));
      for (const r of results) { if (r) patents.push(r); }
    }

    const inventorMap = {};
    for (const p of patents) {
      for (const inv of (p.inventors || [])) {
        const name = inv.replace(/\s*\[.*?\]\s*/g, '').trim();
        if (!name) continue;
        if (!inventorMap[name]) {
          inventorMap[name] = { name, patents: [], companies: new Set(), techFocus: new Set() };
        }
        inventorMap[name].patents.push(p.ref);
        for (const app of (p.applicants || [])) {
          inventorMap[name].companies.add(app.replace(/\s*\[.*?\]\s*/g, '').trim());
        }
        for (const ipc of (p.ipcClasses || [])) {
          inventorMap[name].techFocus.add(ipc.slice(0, 6).trim());
        }
      }
    }

    const kolList = Object.values(inventorMap)
      .map(inv => ({
        name: inv.name,
        patentCount: inv.patents.length,
        companies: [...inv.companies].slice(0, 3),
        techFocus: [...inv.techFocus].slice(0, 4),
        patents: inv.patents.slice(0, 3),
        influence: inv.patents.length >= 3 ? 'High' : inv.patents.length >= 2 ? 'Medium' : 'Emerging',
      }))
      .sort((a, b) => b.patentCount - a.patentCount)
      .slice(0, 15);

    const companyNetwork = {};
    for (const p of patents) {
      const apps = (p.applicants || []).map(a => a.replace(/\s*\[.*?\]\s*/g, '').trim()).filter(Boolean);
      for (let i = 0; i < apps.length; i++) {
        for (let j = i + 1; j < apps.length; j++) {
          const key = [apps[i], apps[j]].sort().join(' ↔ ');
          companyNetwork[key] = (companyNetwork[key] || 0) + 1;
        }
      }
    }

    res.json({
      domain, totalPatents: patents.length, inventors: kolList,
      companyNetwork: Object.entries(companyNetwork)
        .map(([pair, count]) => ({ pair, coPatents: count }))
        .sort((a, b) => b.coPatents - a.coPatents)
        .slice(0, 10),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Inventor Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const stats = stmts.getDbStats.get();
  res.json({
    status: 'ok',
    tokenCached: !!tokenCache.token,
    db: stats,
    rateLimit: config.rateLimit,
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[EPO Proxy] http://localhost:${PORT}`);
  console.log(`[DB] SQLite at ${DB_PATH}`);
  console.log(`[RateLimiter] Delay: ${config.rateLimit.requestDelayMs}ms, Burst: ${config.rateLimit.burstLimit}`);
});
