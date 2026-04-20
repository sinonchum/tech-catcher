# TechCatcher

Patent intelligence dashboard for the energy sector. Searches EPO OPS and Google Patents, surfaces competitors, maps ecosystems, and scores opportunities — all in one view.

Built for BD teams, patent analysts, and anyone who needs to make sense of energy tech IP without drowning in raw patent databases.

## What it does

**Search any energy domain** — type a topic like "green hydrogen" or "sodium-ion battery" and the system suggests search angles (CQL queries for EPO, keyword combos for Google Patents). Pick one, get results.

**Two data sources, one toggle:**

| Source | Use case |
|--------|----------|
| EPO OPS | Structured CQL queries, IPC classification, precise filtering. Rate-limited by EPO. |
| Google Patents | Large-scale scanning via Scrapling anti-bot bypass. Broader coverage, no API quota. |

**Dashboard** — patents analyzed, innovation ranking, radar comparison (IP moat vs tech overlap vs commercialization readiness), partner pipeline with scored candidates.

**Gap Analysis** — pick a competitor, see shared capabilities vs their strengths you're missing. Complementarity score with keyword-level comparison.

**Ecosystem** — enter a company name, get co-applicant networks, key inventors, and technology focus areas from real patent data.

**Inventor Network** — inventor leaderboard, company relationships, influence ranking.

## Architecture

```
┌─────────────────────────────┐
│  React + Tailwind Frontend  │  Port 3000 (Vite dev)
│  recharts / lucide-react    │
└──────────────┬──────────────┘
               │ REST API
┌──────────────▼──────────────┐
│  Express Backend (ESM)      │  Port 3001
│  SQLite cache / rate limit  │
├─────────────────────────────┤
│  EPO OPS (OAuth2 + CQL)    │──→ Official API, structured queries
│  Google Patents (Scrapling) │──→ StealthyFetcher, anti-bot bypass
└─────────────────────────────┘
```

Frontend is React with Tailwind. Backend is Express with SQLite for local caching and rate limiting. Python scraper (Scrapling) handles Google Patents with headless Chromium.

## Quick start

```bash
# Frontend
cd new-energy-tech-catcher
npm install
npm run dev          # → http://localhost:3000

# Backend
cd server
npm install
node index.js        # → http://localhost:3001

# Python deps (for Google Patents scraper)
pip install scrapling
```

Backend needs EPO OPS credentials — get them at [EPO Open Patent Services](https://developers.epo.org/). Configure in Settings or edit `server/config.json` directly.

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/suggest` | POST | Keyword → search angle expansion |
| `/api/patents/search` | GET | EPO OPS patent search (CQL) |
| `/api/patents/google` | GET | Google Patents scraper |
| `/api/analysis/gap` | GET | Competitor gap analysis |
| `/api/analysis/ecosystem` | GET | Company ecosystem mapping |
| `/api/analysis/inventors` | GET | Inventor network analysis |
| `/api/settings` | GET/PUT | Configuration |
| `/api/db/stats` | GET | Cache statistics |
| `/api/export/json` | GET | Export cached patents (JSON) |
| `/api/export/csv` | GET | Export cached patents (CSV) |

## Tech stack

- **Frontend:** React 18, Tailwind CSS 3, Recharts, Lucide icons
- **Backend:** Express (ESM), better-sqlite3, fast-xml-parser
- **Scraping:** Scrapling (StealthyFetcher with Chromium), regex-based DOM parsing
- **Build:** Vite 5, PostCSS, Autoprefixer

## Rate limiting

EPO OPS has strict rate limits. The backend handles this with:
- Configurable request delay (default 2500ms)
- Burst protection (4 requests, then 10s pause)
- Exponential backoff on RobotDetected errors
- Local SQLite cache (24h TTL)

Google Patents has no API quota — the scraper handles anti-bot protection via Scrapling's StealthyFetcher.

## License

MIT
