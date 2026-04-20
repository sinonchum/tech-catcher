/**
 * EPO OPS data fetching + transformation layer.
 *
 * The backend proxy returns: { totalResults, patents[], query, fetchedAt }
 * Each patent: { docId, country, docNumber, kind, title, applicants[], abstract, ref, innovation_score }
 */

const API_BASE = '/api';

// ─── Search queries for our tech domain ───────────────────────────────────────
// CQL queries — date range pd is added server-side
const QUERIES = [
  'ta="solid-state" AND ta=battery',
  'ta="solid electrolyte" AND ta=battery',
];

// ─── Fetch patents from proxy ────────────────────────────────────────────────

async function searchPatents(query, range = '1-10') {
  const res = await fetch(
    `${API_BASE}/patents/search?query=${encodeURIComponent(query)}&range=${range}`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Score already computed server-side, but we add UI-level adjustments ──────

function actionForScore(score) {
  if (score >= 88) return 'Initiate BD Call';
  if (score >= 78) return 'Monitor M&A Potential';
  return 'Schedule Deep Dive';
}

function insightForPatent(p) {
  const abs = (p.abstract || 'No abstract available.').slice(0, 140);
  const who = p.applicants?.[0] || p.ref;
  if (p.innovation_score >= 90)
    return `High-potential IP from ${who}. ${abs}... Strong candidate for immediate BD outreach.`;
  if (p.innovation_score >= 80)
    return `${who}'s approach shows promise. ${abs}... Worth monitoring for M&A or licensing opportunities.`;
  return `Emerging technology from ${who}. ${abs}... Consider for long-term portfolio watch.`;
}

// ─── Build radar data from patent stats ───────────────────────────────────────

function buildRadar(patents) {
  let techOverlap = 40;
  let commercialization = 40;
  let globalCov = 30;

  for (const p of patents) {
    const t = `${p.title} ${p.abstract}`.toLowerCase();
    if (t.includes('solid-state') || t.includes('electrolyte')) techOverlap += 8;
    if (t.includes('manufactur') || t.includes('scalab') || t.includes('production')) commercialization += 10;
  }

  const countries = new Set(patents.map(p => p.country));
  globalCov += countries.size * 10;

  return [
    { subject: 'IP Moat',          Company_A: 90, Target_Startup: Math.min(95, 60 + patents.length * 4), fullMark: 100 },
    { subject: 'Tech Overlap',     Company_A: 40, Target_Startup: Math.min(95, techOverlap), fullMark: 100 },
    { subject: 'Commercialization',Company_A: 80, Target_Startup: Math.min(90, commercialization), fullMark: 100 },
    { subject: 'Global Coverage',  Company_A: 95, Target_Startup: Math.min(80, globalCov), fullMark: 100 },
  ];
}

// ─── Main: fetch all queries, merge, return dashboard data ───────────────────

export async function fetchDashboardData() {
  // Fire all queries in parallel
  const results = await Promise.all(QUERIES.map(q => searchPatents(q)));

  // Merge + deduplicate by docId
  const seen = new Set();
  const allPatents = [];
  for (const r of results) {
    for (const p of (r.patents || [])) {
      if (!seen.has(p.docId)) {
        seen.add(p.docId);
        allPatents.push(p);
      }
    }
  }

  // Sort by score (already sorted server-side, but re-sort after merge)
  allPatents.sort((a, b) => (b.innovation_score || 0) - (a.innovation_score || 0));

  // Total from all queries (approximate — we take the max)
  const totalAnalyzed = Math.max(...results.map(r => r.totalResults || 0));

  // Top 5 for display
  const top5 = allPatents.slice(0, 5);

  // Transform into dashboard shapes
  const startups = top5.map(p => ({
    name: p.applicants?.[0] || p.ref,
    innovation_score: p.innovation_score || 50,
    core_patent: `${p.ref}: ${p.title}`,
    ai_insight: insightForPatent(p),
    action: actionForScore(p.innovation_score || 50),
    rawPatent: p,
  }));

  const bar_data = top5.map(p => {
    const name = (p.applicants?.[0] || p.ref);
    return {
      name: name.length > 12 ? name.slice(0, 12) + '…' : name,
      score: p.innovation_score || 50,
      fill: (p.innovation_score || 0) >= 90 ? '#0d9488'
        : (p.innovation_score || 0) >= 80 ? '#0891b2'
        : (p.innovation_score || 0) >= 70 ? '#6366f1'
        : '#8b5cf6',
    };
  });

  return {
    summary: {
      total_patents_analyzed: totalAnalyzed,
      high_potential_startups: top5.filter(p => (p.innovation_score || 0) >= 70).length,
      tech_domain: 'Solid-State Batteries',
    },
    radar_data: buildRadar(allPatents),
    bar_data,
    startups,
    _meta: {
      queries: QUERIES,
      patentsRetrieved: allPatents.length,
      fetchedAt: new Date().toISOString(),
    },
  };
}
