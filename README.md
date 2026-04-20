<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-4.17-000000?style=flat&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.9+-3776AB?style=flat&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?style=flat&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat" />
</p>

<h1 align="center">TechCatcher</h1>

<p align="center">
  <strong>Patent intelligence for energy technology — from search to signal.</strong><br>
  Dual-source patent analysis (EPO OPS + Google Patents) with AI-scored competitor mapping, ecosystem visualization, and gap analysis.
</p>

<p align="center">
  <a href="#-features">Features</a> ·
  <a href="#-screenshots">Screenshots</a> ·
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-api-reference">API</a>
</p>

---

## Why TechCatcher

Patent databases are powerful. They're also slow to navigate, rate-limited, and full of noise.

TechCatcher takes the pain out of energy patent research. Type a topic, get suggested search strategies, and pull results from **two independent data sources** — the official EPO OPS API and Google Patents (via anti-bot scraping). Results get scored, ranked, and mapped across four dimensions: technical fit, innovation strength, commercialization readiness, and global coverage.

It's built for teams that need to move faster than the EPO website allows.

## ✦ Features

<table>
<tr>
<td width="50%">

### 🔍 Smart Search
Enter any energy topic — "green hydrogen", "sodium-ion battery", "offshore wind" — and get **5 auto-generated search angles**. The system expands your keyword into precise CQL queries (EPO) and keyword combinations (Google Patents).

</td>
<td width="50%">

### ⚡ Dual Data Sources
**EPO OPS** — structured CQL with IPC classification, ideal for precise filtering. **Google Patents** — large-scale scanning via Scrapling's StealthyFetcher, bypassing anti-bot systems. One toggle switches between them.

</td>
</tr>
<tr>
<td width="50%">

### 📊 Innovation Scoring
Every patent gets an innovation score based on citation density, technology specificity, and commercial indicators. Top candidates surface with actionable recommendations: *Initiate BD Call*, *Monitor M&A Potential*, *Schedule Deep Dive*.

</td>
<td width="50%">

### 🗺️ Gap Analysis
Compare your portfolio against any competitor. See shared capabilities side-by-side with their unique strengths. The complementarity score tells you at a glance whether a partnership or acquisition makes sense.

</td>
</tr>
<tr>
<td width="50%">

### 🌐 Ecosystem Mapping
Enter a company name, get their co-applicant network. Who are they filing with? Which inventors are moving between companies? The relationship graph reveals partnership dynamics the raw patents won't.

</td>
<td width="50%">

### 👤 Inventor Intelligence
Rank inventors by patent count, influence, and affiliation. Spot the key researchers in any domain — useful for recruitment, licensing conversations, or competitive monitoring.

</td>
</tr>
</table>

## 📸 Screenshots

<p align="center">
  <img src="docs/screenshots/dashboard.png" width="90%" alt="Dashboard with patent analysis"/>
  <br><em>Dashboard — real-time patent scoring with radar comparison and partner pipeline</em>
</p>

<p align="center">
  <img src="docs/screenshots/search.png" width="90%" alt="Smart search with suggestions"/>
  <br><em>Smart search — topic expansion with clickable CQL/keyword suggestions</em>
</p>

<p align="center">
  <img src="docs/screenshots/gap.png" width="90%" alt="Gap analysis"/>
  <br><em>Gap analysis — competitor complementarity with technology overlap mapping</em>
</p>

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/sinonchum/tech-catcher.git
cd tech-catcher

# 2. Frontend
npm install
npm run dev                  # → http://localhost:3000

# 3. Backend
cd server
cp config.example.json config.json
# Edit config.json with your EPO credentials
npm install
node index.js                # → http://localhost:3001

# 4. Google Patents scraper (optional)
pip install scrapling
```

**EPO OPS credentials** — register at [developers.epo.org](https://developers.epo.org/). Free tier supports 4 requests/2.5s.

Google Patents works out of the box — no API key needed. The Scrapling scraper handles Cloudflare and bot detection automatically.

## 🏗 Architecture

```
┌─────────────────────────────────────────────────┐
│              React 18 + Tailwind 3              │
│         Recharts · Lucide · Vite 5 HMR          │
│                   Port 3000                      │
└──────────────────────┬──────────────────────────┘
                       │ REST / JSON
┌──────────────────────▼──────────────────────────┐
│              Express (ESM) · Port 3001           │
│  ┌───────────────┐  ┌────────────────────────┐  │
│  │ SQLite Cache  │  │ Rate Limiter           │  │
│  │ 24h TTL, WAL  │  │ 2.5s delay, burst=4    │  │
│  └───────────────┘  └────────────────────────┘  │
├─────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────────┐  │
│  │ EPO OPS         │  │ Google Patents       │  │
│  │ OAuth2 + CQL    │  │ Scrapling + Chromium │  │
│  │ Structured      │  │ Anti-bot bypass      │  │
│  │ Precise         │  │ Large-scale          │  │
│  └─────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────┘
```

| Layer | Stack |
|-------|-------|
| Frontend | React 18, Tailwind CSS 3, Recharts, Lucide icons |
| Backend | Express (ESM), better-sqlite3, fast-xml-parser |
| Scraping | Scrapling StealthyFetcher, regex DOM parser |
| Build | Vite 5, PostCSS, Autoprefixer |

## 📡 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/suggest` | `POST` | Expand topic → 5 search angle suggestions |
| `/api/patents/search` | `GET` | EPO OPS patent search (CQL) |
| `/api/patents/google` | `GET` | Google Patents scraper (Scrapling) |
| `/api/analysis/gap` | `GET` | Competitor gap analysis |
| `/api/analysis/ecosystem` | `GET` | Co-applicant + inventor network |
| `/api/analysis/inventors` | `GET` | Inventor leaderboard |
| `/api/settings` | `GET` / `PUT` | Configuration management |
| `/api/db/stats` | `GET` | Cache hit rates, API call counts |
| `/api/export/json` | `GET` | Export patents as JSON |
| `/api/export/csv` | `GET` | Export patents as CSV |

## ⚙️ Rate Limiting & Caching

EPO OPS enforces strict rate limits. TechCatcher handles this transparently:

- **Request delay**: configurable, default 2500ms between calls
- **Burst protection**: max 4 requests, then 10s cooldown
- **Exponential backoff**: retries with increasing delay on `RobotDetected`
- **SQLite cache**: results cached for 24h, served instantly on repeat queries

Google Patents has no API quota — the Scrapling scraper handles Cloudflare, Datadome, and custom bot detection via headless Chromium with fingerprint randomization.

## 🔒 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EPO_CONSUMER_KEY` | Yes (for EPO) | Your EPO OPS consumer key |
| `EPO_CONSUMER_SECRET` | Yes (for EPO) | Your EPO OPS consumer secret |
| `PYTHON` | No | Python binary path (default: `python3`) |

Or configure via the Settings page in the UI, or edit `server/config.json` directly.

## 📄 License

MIT — do whatever you want.

---

<p align="center">
  Built with <a href="https://developers.epo.org/">EPO OPS</a> and <a href="https://github.com/niespodd/scrapling">Scrapling</a>.<br>
  Not affiliated with the European Patent Office.
</p>
