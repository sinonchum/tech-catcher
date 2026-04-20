import React, { useState, useEffect, useCallback } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import {
  Zap, Sparkles, FileText, Target,
  Phone, Eye, ExternalLink, RefreshCw, AlertCircle, Loader2, CheckCircle,
  LayoutDashboard, Search, BarChart3, Users, Settings,
  Bell, TrendingUp, Building2, Hash, Activity,
  ChevronDown, ArrowUpDown, Network, UserCircle,
  GitBranch, Layers, Lightbulb, MapPin, BookOpen, Award, Star,
  Database, Download, Key, Shield, Clock, User, Save, TestTube,
} from 'lucide-react';

// ─── API helpers ──────────────────────────────────────────────────────────────
const API = '/api';
async function apiFetch(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Fallback data ────────────────────────────────────────────────────────────
const FALLBACK = {
  summary: { total_patents_analyzed: 1240, high_potential_startups: 5, tech_domain: 'Solid-State Batteries' },
  radar_data: [
    { subject: 'IP Moat', Company_A: 90, Target_Startup: 85, fullMark: 100 },
    { subject: 'Tech Overlap', Company_A: 40, Target_Startup: 95, fullMark: 100 },
    { subject: 'Commercialization', Company_A: 80, Target_Startup: 60, fullMark: 100 },
    { subject: 'Global Coverage', Company_A: 95, Target_Startup: 50, fullMark: 100 },
  ],
  bar_data: [
    { name: 'VoltCore', score: 92, fill: '#14b8a6' },
    { name: 'AeroLithium', score: 88, fill: '#06b6d4' },
    { name: 'IonForge', score: 81, fill: '#8b5cf6' },
    { name: 'NanoCell', score: 76, fill: '#a78bfa' },
    { name: 'SolidVolt', score: 71, fill: '#c4b5fd' },
  ],
  startups: [
    { name: 'VoltCore Solutions', innovation_score: 92, core_patent: 'EP3456781: Novel solid electrolyte interphase (SEI) stabilization.', ai_insight: 'Strong IP barrier in electrolyte formulation.', action: 'Initiate BD Call' },
    { name: 'AeroLithium Tech', innovation_score: 88, core_patent: 'EP9876543: Scalable roll-to-roll manufacturing for solid cathodes.', ai_insight: 'High commercial readiness.', action: 'Monitor M&A Potential' },
    { name: 'IonForge Energy', innovation_score: 81, core_patent: 'US11223344: Garnet-type oxide electrolyte.', ai_insight: 'Niche expertise in oxide electrolytes.', action: 'Monitor M&A Potential' },
    { name: 'NanoCell Dynamics', innovation_score: 76, core_patent: 'WO2025123456: Nano-structured silicon anode.', ai_insight: 'Unique anode approach.', action: 'Initiate BD Call' },
    { name: 'SolidVolt Systems', innovation_score: 71, core_patent: 'EP4455667: Hybrid polymer-ceramic electrolyte.', ai_insight: 'Polymer blending technique.', action: 'Schedule Deep Dive' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// TOPIC SEARCH — user enters a topic, gets CQL suggestions, picks one
// ═══════════════════════════════════════════════════════════════════════════════

function TopicSearch({ onSearch, loading, source, onSourceChange }) {
  const [topic, setTopic] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);

  const handleSuggest = async () => {
    if (!topic.trim() || topic.trim().length < 2) return;
    setSuggesting(true); setError(null); setSuggestions([]);
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      if (!res.ok) throw new Error(`Suggest failed: ${res.status}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setSuggesting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !suggesting) handleSuggest();
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900">Search Patent Domain</h3>
        </div>
        {/* Data source toggle */}
        <div className="flex items-center gap-1 bg-zinc-100 rounded-xl p-1">
          <button
            onClick={() => onSourceChange('epo')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              source === 'epo' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            EPO OPS
          </button>
          <button
            onClick={() => onSourceChange('google')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              source === 'google' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Google Patents
          </button>
        </div>
      </div>
      <p className="text-[11px] text-zinc-400 mb-4">
        {source === 'epo'
          ? 'Precise queries via EPO OPS API — structured CQL search'
          : 'Large-scale scan via Google Patents — broader coverage, anti-bot bypass'}
      </p>

      <div className="flex gap-2">
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={source === 'epo'
            ? 'e.g. green hydrogen, offshore wind, sodium-ion battery...'
            : 'e.g. solid electrolyte manufacturing, PEM fuel cell catalyst...'}
          className="flex-1 px-3 py-2.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300"
        />
        <button
          onClick={handleSuggest}
          disabled={suggesting || !topic.trim() || topic.trim().length < 2}
          className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
        >
          {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Suggest
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5" />{error}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Search angles ({source === 'epo' ? 'CQL queries' : 'keyword search'}) — click one to run:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSearch(s.cql, s.label, topic)}
                disabled={loading}
                className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-100 hover:border-emerald-200 hover:bg-emerald-50/50 transition-all text-left disabled:opacity-40"
              >
                <span className="text-[11px] font-medium text-zinc-900 group-hover:text-emerald-700">{s.label}</span>
                <span className="text-[10px] text-zinc-400 px-1.5 py-0.5 rounded bg-white border border-zinc-100">{s.angle}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', id: 'dashboard' },
  { icon: Layers, label: 'Gap Analysis', id: 'gap' },
  { icon: Network, label: 'Ecosystem', id: 'ecosystem' },
  { icon: UserCircle, label: 'Inventors', id: 'inventors' },
  { icon: Settings, label: 'Settings', id: 'settings' },
];

function Sidebar({ active, onNav }) {
  return (
    <aside className="w-56 shrink-0 bg-white border-r border-zinc-100 flex flex-col h-screen sticky top-0">
      <div className="px-5 h-16 flex items-center gap-2.5 border-b border-zinc-100">
        <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center">
          <Zap className="w-4 h-4 text-emerald-400" />
        </div>
        <span className="font-semibold text-sm text-zinc-900 tracking-tight">TechCatcher</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ icon: Icon, label, id }) => (
          <button key={id} onClick={() => onNav(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
              id === active ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
            }`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-zinc-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
            <span className="text-xs font-semibold text-white">SQ</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-900 truncate">Simon Qin</p>
            <p className="text-[11px] text-zinc-400 truncate">Energy BD Manager</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════════════════════════════════════

function TopBar({ title, subtitle, dataSource, onRefresh, loading }) {
  return (
    <header className="h-16 bg-white border-b border-zinc-100 flex items-center justify-between px-6 sticky top-0 z-10">
      <div>
        <h1 className="text-base font-semibold text-zinc-900 tracking-tight">{title}</h1>
        <p className="text-[11px] text-zinc-400 -mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium ${
          dataSource === 'live' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${dataSource === 'live' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {dataSource === 'live' ? 'Live' : 'Demo'}
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="p-2 rounded-lg hover:bg-zinc-50 text-zinc-400 hover:text-zinc-600 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function MetricCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className={`rounded-2xl border p-5 transition-all duration-150 hover:shadow-sm ${accent ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-100'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-[11px] font-medium uppercase tracking-wider ${accent ? 'text-zinc-400' : 'text-zinc-400'}`}>{label}</p>
          <p className={`text-2xl font-bold mt-1.5 tracking-tight ${accent ? 'text-white' : 'text-zinc-900'}`}>{value}</p>
          {sub && <p className={`text-[11px] mt-1 ${accent ? 'text-zinc-500' : 'text-zinc-400'}`}>{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent ? 'bg-zinc-800' : 'bg-zinc-50'}`}>
          <Icon className={`w-4 h-4 ${accent ? 'text-emerald-400' : 'text-zinc-400'}`} />
        </div>
      </div>
    </div>
  );
}

function RadarPanel({ data }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div><h3 className="text-sm font-semibold text-zinc-900">Technical Fit</h3><p className="text-[11px] text-zinc-400 mt-0.5">Our profile vs. top target</p></div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-900" /><span className="text-[11px] text-zinc-500">Us</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[11px] text-zinc-500">Target</span></div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart cx="50%" cy="50%" outerRadius="72%" data={data}>
          <PolarGrid stroke="#f4f4f5" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 500 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="Our Company" dataKey="Company_A" stroke="#18181b" fill="#18181b" fillOpacity={0.06} strokeWidth={1.5} />
          <Radar name="Target" dataKey="Target_Startup" stroke="#10b981" fill="#10b981" fillOpacity={0.08} strokeWidth={1.5} />
          <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f4f4f5', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RankingPanel({ barData }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-5 flex flex-col">
      <div className="mb-4"><h3 className="text-sm font-semibold text-zinc-900">Innovation Ranking</h3><p className="text-[11px] text-zinc-400 mt-0.5">AI-scored patent strength</p></div>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 8 }}>
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="name" width={72} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={12}>
              {barData.map((e, i) => <Cell key={i} fill={e.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 pt-4 border-t border-zinc-50">
        <div className="flex items-start gap-2">
          <div className="w-5 h-5 rounded-md bg-violet-50 flex items-center justify-center mt-0.5 shrink-0"><Sparkles className="w-3 h-3 text-violet-500" /></div>
          <div>
            <p className="text-[11px] text-zinc-600 leading-relaxed">Dual partnership with top 2 candidates could accelerate solid-state production by <strong className="text-zinc-900">14-18 months</strong>.</p>
            <p className="text-[10px] text-zinc-400 mt-1.5">Confidence: 87%</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline (fixed alignment) ───────────────────────────────────────────────

function ScorePill({ score }) {
  const cls = score >= 90 ? 'bg-emerald-50 text-emerald-600' : score >= 80 ? 'bg-cyan-50 text-cyan-600' : score >= 70 ? 'bg-violet-50 text-violet-600' : 'bg-zinc-100 text-zinc-500';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>{score}</span>;
}

function ActionChip({ label }) {
  const styles = {
    'Initiate BD Call': 'bg-zinc-900 text-white hover:bg-zinc-800',
    'Monitor M&A Potential': 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50',
    'Schedule Deep Dive': 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  };
  const icons = { 'Initiate BD Call': Phone, 'Monitor M&A Potential': Eye, 'Schedule Deep Dive': ExternalLink };
  const Icon = icons[label] || ChevronDown;
  return (
    <button className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${styles[label] || styles['Schedule Deep Dive']}`}>
      <Icon className="w-3 h-3" />{label}
    </button>
  );
}

function PipelineSection({ startups }) {
  const [sortBy, setSortBy] = useState('score');
  const [filterAction, setFilterAction] = useState(null);
  const [expandedIdx, setExpandedIdx] = useState(null);

  let displayed = [...startups];
  if (filterAction) displayed = displayed.filter(s => s.action === filterAction);
  if (sortBy === 'score') displayed.sort((a, b) => b.innovation_score - a.innovation_score);
  if (sortBy === 'name') displayed.sort((a, b) => a.name.localeCompare(b.name));

  const actions = [...new Set(startups.map(s => s.action))];

  const getRef = (s) => {
    const m = s.core_patent?.match(/^([A-Z]{2}\s[\d\w]+\s[A-Z\d]+):/);
    return m ? m[1] : s.core_patent?.slice(0, 24) || '';
  };
  const getTitle = (s) => (s.core_patent || '').replace(/^[^:]+:\s*/, '');

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-50">
        <div><h3 className="text-sm font-semibold text-zinc-900">Partner Pipeline</h3><p className="text-[11px] text-zinc-400 mt-0.5">{displayed.length} candidates ranked by AI</p></div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSortBy(sortBy === 'score' ? 'name' : 'score')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 transition-colors">
            <ArrowUpDown className="w-3 h-3" />{sortBy === 'score' ? 'Score' : 'Name'}
          </button>
          <button onClick={() => setFilterAction(null)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${!filterAction ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>All</button>
          {actions.map(a => (
            <button key={a} onClick={() => setFilterAction(filterAction === a ? null : a)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors hidden md:block ${filterAction === a ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}>
              {a.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers — fixed widths for alignment */}
      <div className="flex items-center px-5 py-2 border-b border-zinc-50 bg-zinc-50/30">
        <span className="w-6 text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-right">#</span>
        <span className="w-12 text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-center ml-2">Score</span>
        <span className="w-[260px] text-[10px] font-medium text-zinc-400 uppercase tracking-wider ml-4">Company</span>
        <span className="w-[180px] text-[10px] font-medium text-zinc-400 uppercase tracking-wider hidden lg:block">Patent Ref</span>
        <span className="flex-1 text-[10px] font-medium text-zinc-400 uppercase tracking-wider hidden xl:block">Title</span>
        <span className="w-[148px] text-[10px] font-medium text-zinc-400 uppercase tracking-wider text-right">Action</span>
      </div>

      {/* Rows — all elements in fixed-width slots */}
      <div>
        {displayed.map((s, i) => (
          <div key={s.name + i} className="border-b border-zinc-50 last:border-0">
            <div className="flex items-center px-5 py-3 hover:bg-zinc-50/50 transition-colors">
              <span className="w-6 text-right text-[11px] font-medium text-zinc-400 tabular-nums shrink-0">{i + 1}</span>
              <div className="w-12 flex justify-center ml-2 shrink-0"><ScorePill score={s.innovation_score} /></div>
              <div className="w-[260px] min-w-0 ml-4 shrink-0">
                <p className="text-sm font-medium text-zinc-900 truncate">{s.name}</p>
              </div>
              <span className="w-[180px] shrink-0 text-[11px] font-mono text-zinc-400 truncate hidden lg:block">{getRef(s)}</span>
              <p className="flex-1 text-[11px] text-zinc-500 truncate hidden xl:block min-w-0">{getTitle(s)}</p>
              <div className="w-[148px] flex justify-end shrink-0">
                <ActionChip label={s.action} />
              </div>
            </div>
            {/* Expandable insight row */}
            <div className="px-5 pb-3 pl-[92px]">
              <button onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 flex items-center gap-1 transition-colors">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <span className="truncate max-w-[500px]">{(s.ai_insight || '').slice(0, 100)}...</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${expandedIdx === i ? 'rotate-180' : ''}`} />
              </button>
              {expandedIdx === i && (
                <p className="text-[11px] text-zinc-500 leading-relaxed mt-2 max-w-[600px]">{s.ai_insight}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Context Panel ────────────────────────────────────────────────────────────

function ContextPanel({ topStartup, radarData }) {
  if (!topStartup) return null;
  return (
    <div className="w-72 shrink-0 space-y-4">
      <div className="bg-white rounded-2xl border border-zinc-100 p-5">
        <div className="flex items-center gap-2 mb-4"><Star className="w-4 h-4 text-amber-400" /><h3 className="text-sm font-semibold text-zinc-900">Top Match</h3></div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center"><Building2 className="w-5 h-5 text-white" /></div>
          <div className="min-w-0"><p className="text-sm font-semibold text-zinc-900 truncate">{topStartup.name}</p><p className="text-[11px] text-zinc-400">Score: {topStartup.innovation_score}/100</p></div>
        </div>
        <div className="mb-4">
          <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1.5"><span>Innovation Score</span><span className="font-semibold text-zinc-900">{topStartup.innovation_score}</span></div>
          <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full" style={{ width: `${topStartup.innovation_score}%` }} /></div>
        </div>
        <button className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"><Phone className="w-3.5 h-3.5" />Initiate BD Call</button>
      </div>
      <div className="bg-white rounded-2xl border border-zinc-100 p-5">
        <h3 className="text-sm font-semibold text-zinc-900 mb-3">Coverage</h3>
        {(radarData || []).map(({ subject, Target_Startup: val }) => (
          <div key={subject} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-zinc-500">{subject}</span><span className="font-medium text-zinc-900 tabular-nums">{val}</span></div>
            <div className="h-1 bg-zinc-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${val}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE A: GAP ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

const COMPETITORS = ['CATL', 'LG Energy Solution', 'Samsung SDI', 'Panasonic', 'BYD'];

function GapAnalysisPage({ domain, source }) {
  const [competitor, setCompetitor] = useState(COMPETITORS[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (comp) => {
    setLoading(true); setError(null);
    try {
      if (source === 'google') {
        // Google Patents: fetch competitor patents and compare with our domain patents
        const [compResult, ourResult] = await Promise.all([
          apiFetch(`/patents/google?query=${encodeURIComponent(comp + ' ' + domain)}&count=10`),
          apiFetch(`/patents/google?query=${encodeURIComponent(domain)}&count=10`),
        ]);
        const compPatents = compResult.patents || [];
        const ourPatents = ourResult.patents || [];

        // Build comparison data from real patents
        const compKeywords = new Set();
        compPatents.forEach(p => {
          const words = `${p.title} ${p.abstract}`.toLowerCase().split(/\W+/).filter(w => w.length > 4);
          words.forEach(w => compKeywords.add(w));
        });
        const ourKeywords = new Set();
        ourPatents.forEach(p => {
          const words = `${p.title} ${p.abstract}`.toLowerCase().split(/\W+/).filter(w => w.length > 4);
          words.forEach(w => ourKeywords.add(w));
        });
        const overlap = [...ourKeywords].filter(w => compKeywords.has(w));
        const gap = [...compKeywords].filter(w => !ourKeywords.has(w)).slice(0, 8);

        setData({
          competitor: comp,
          analysis: {
            complementarityScore: Math.max(30, Math.min(90, 70 - overlap.length)),
            techOverlap: overlap.slice(0, 8),
            techGap: gap,
            recommendation: `${comp} has ${compPatents.length} patents in "${domain}". ${overlap.length > 3 ? 'Significant overlap' : 'Limited overlap'} detected. ${gap.length > 0 ? 'Gap areas: ' + gap.slice(0, 3).join(', ') : ''}`,
          },
          competitorSample: compPatents.slice(0, 5).map((p, i) => ({
            ref: p.ref, title: p.title, score: p.innovation_score || (70 - i * 3),
          })),
          ourSample: ourPatents.slice(0, 5).map((p, i) => ({
            ref: p.ref, title: p.title, score: p.innovation_score || (75 - i * 3),
          })),
        });
      } else {
        const result = await apiFetch(`/analysis/gap?competitor=${encodeURIComponent(comp)}&ourDomain=${encodeURIComponent(domain)}`);
        setData(result);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [domain, source]);

  useEffect(() => { run(competitor); }, [run, competitor]);

  return (
    <div className="space-y-6">
      {/* Competitor selector */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Compare against:</span>
        {COMPETITORS.map(c => (
          <button key={c} onClick={() => { setCompetitor(c); run(c); }}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${competitor === c ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}>
            {c}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-3"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-xs text-red-700">{error}</p><button onClick={() => run(competitor)} className="text-[11px] font-medium text-red-600">Retry</button></div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-zinc-400 animate-spin" /></div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-4">
          {/* Complementarity Score */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-1">Complementarity Score</h3>
            <p className="text-[11px] text-zinc-400 mb-4">vs. {data.competitor}</p>
            <div className="text-5xl font-bold text-zinc-900 mb-2">{data.analysis?.complementarityScore || 0}<span className="text-lg text-zinc-400">%</span></div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">{data.analysis?.recommendation}</p>
          </div>

          {/* Tech Overlap vs Gap */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Technology Map</h3>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider mb-2">Shared Capabilities</p>
                <div className="flex flex-wrap gap-1.5">
                  {(data.analysis?.techOverlap || []).map(k => (
                    <span key={k} className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-medium">{k}</span>
                  ))}
                  {(!data.analysis?.techOverlap?.length) && <span className="text-[11px] text-zinc-400">No significant overlap</span>}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium text-amber-600 uppercase tracking-wider mb-2">Gap Areas (Their Strengths)</p>
                <div className="flex flex-wrap gap-1.5">
                  {(data.analysis?.techGap || []).map(k => (
                    <span key={k} className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-medium">{k}</span>
                  ))}
                  {(!data.analysis?.techGap?.length) && <span className="text-[11px] text-zinc-400">No significant gaps</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Their sample patents */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">{data.competitor} Sample Patents</h3>
            <div className="space-y-2">
              {(data.competitorSample || []).map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-zinc-50 last:border-0">
                  <ScorePill score={p.score} />
                  <div className="min-w-0"><p className="text-[11px] font-medium text-zinc-900 truncate">{p.title}</p><p className="text-[10px] text-zinc-400 font-mono">{p.ref}</p></div>
                </div>
              ))}
            </div>
          </div>

          {/* Our sample patents */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Our Sample Patents</h3>
            <div className="space-y-2">
              {(data.ourSample || []).map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-zinc-50 last:border-0">
                  <ScorePill score={p.score} />
                  <div className="min-w-0"><p className="text-[11px] font-medium text-zinc-900 truncate">{p.title}</p><p className="text-[10px] text-zinc-400 font-mono">{p.ref}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE B: COMPETITOR ECOSYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

function EcosystemPage({ domain, source }) {
  const [company, setCompany] = useState('CATL');
  const [inputVal, setInputVal] = useState('CATL');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (c) => {
    setLoading(true); setError(null);
    try {
      if (source === 'google') {
        const result = await apiFetch(`/patents/google?query=${encodeURIComponent(c + ' ' + domain)}&count=10`);
        const patents = result.patents || [];

        // Extract co-applicants and inventors from real patents
        const partnerMap = {};
        const inventorMap = {};
        patents.forEach(p => {
          (p.applicants || []).forEach(a => {
            const name = a.trim();
            if (name && name !== c && name.length > 3 && !name.match(/^[A-Z]{2}\d/)) {
              partnerMap[name] = (partnerMap[name] || 0) + 1;
            }
          });
          (p.inventors || []).forEach(inv => {
            const name = inv.trim();
            if (name && name.length > 3 && !name.match(/^[A-Z]{2}\d/)) {
              inventorMap[name] = (inventorMap[name] || 0) + 1;
            }
          });
        });

        // Tech focus from title keywords
        const techWords = {};
        patents.forEach(p => {
          const words = `${p.title}`.toLowerCase().split(/\W+/).filter(w => w.length > 5);
          words.forEach(w => { techWords[w] = (techWords[w] || 0) + 1; });
        });
        const topTech = Object.entries(techWords)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([area, count]) => ({ area, patentCount: count }));

        setData({
          company: c,
          partners: Object.entries(partnerMap)
            .map(([name, count]) => ({ name, collaborationCount: count }))
            .sort((a, b) => b.collaborationCount - a.collaborationCount)
            .slice(0, 8),
          topInventors: Object.entries(inventorMap)
            .map(([name, count]) => ({ name, patentCount: count, influence: count > 2 ? 'High' : count > 1 ? 'Medium' : 'Low', companies: [c] }))
            .sort((a, b) => b.patentCount - a.patentCount)
            .slice(0, 8),
          topTech,
        });
      } else {
        const result = await apiFetch(`/analysis/ecosystem?company=${encodeURIComponent(c)}`);
        setData(result);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [domain, source]);

  useEffect(() => { run(company); }, [run, company]);

  return (
    <div className="space-y-6">
      {/* Company search */}
      <div className="flex items-center gap-2">
        <input value={inputVal} onChange={e => setInputVal(e.target.value)} placeholder="Enter company name..."
          className="px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 w-64" />
        <button onClick={() => { setCompany(inputVal); run(inputVal); }}
          className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors">Analyze</button>
      </div>

      {error && <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-3"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-xs text-red-700">{error}</p></div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-zinc-400 animate-spin" /></div>
      ) : data ? (
        <div className="grid grid-cols-3 gap-4">
          {/* Partner Network */}
          <div className="col-span-2 bg-white rounded-2xl border border-zinc-100 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-1">Partner Network</h3>
            <p className="text-[11px] text-zinc-400 mb-4">Co-applicants with {data.company}</p>
            {data.partners?.length > 0 ? (
              <div className="space-y-2">
                {data.partners.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-zinc-50 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0"><Building2 className="w-4 h-4 text-zinc-500" /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-zinc-900 truncate">{p.name}</p></div>
                    <div className="flex items-center gap-1.5"><span className="text-[11px] text-zinc-400">{p.collaborationCount} co-patents</span>
                      <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, p.collaborationCount * 30)}%` }} /></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-zinc-400 py-8 text-center">No co-applicants found in battery patents</p>}
          </div>

          {/* Top Inventors */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Key Inventors</h3>
            <div className="space-y-2">
              {data.topInventors?.slice(0, 8).map((inv, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-zinc-50 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center shrink-0"><span className="text-[10px] font-medium text-zinc-500">{i + 1}</span></div>
                  <div className="flex-1 min-w-0"><p className="text-[11px] font-medium text-zinc-900 truncate">{inv.name}</p></div>
                  <span className="text-[10px] text-zinc-400 shrink-0">{inv.patentCount} patents</span>
                </div>
              ))}
              {(!data.topInventors?.length) && <p className="text-sm text-zinc-400 py-4 text-center">No inventor data</p>}
            </div>
          </div>

          {/* Tech Focus */}
          <div className="col-span-3 bg-white rounded-2xl border border-zinc-100 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Technology Focus Areas</h3>
            <div className="flex flex-wrap gap-2">
              {(data.topTech || []).map((t, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-100">
                  <span className="text-[11px] font-mono text-zinc-600">{t.area}</span>
                  <span className="text-[10px] text-zinc-400">{t.patentCount} patents</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE C: INVENTORS / KOL
// ═══════════════════════════════════════════════════════════════════════════════

function InventorsPage({ domain, source }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (source === 'google') {
        const result = await apiFetch(`/patents/google?query=${encodeURIComponent(domain)}&count=10`);
        const patents = result.patents || [];

        // Extract inventors and company network from real data
        const inventorMap = {};
        const companyPairs = {};
        patents.forEach(p => {
          const inventors = (p.inventors || []).filter(n => n && n.length > 3 && !n.match(/^[A-Z]{2}\d/));
          const applicants = (p.applicants || []).filter(n => n && n.length > 3 && !n.match(/^[A-Z]{2}\d/));

          inventors.forEach(inv => {
            if (!inventorMap[inv]) inventorMap[inv] = { name: inv, patentCount: 0, companies: [] };
            inventorMap[inv].patentCount++;
            applicants.forEach(a => {
              if (!inventorMap[inv].companies.includes(a)) inventorMap[inv].companies.push(a);
            });
          });

          // Company pairs from co-applicants
          for (let i = 0; i < applicants.length; i++) {
            for (let j = i + 1; j < applicants.length; j++) {
              const pair = [applicants[i], applicants[j]].sort().join(' + ');
              companyPairs[pair] = (companyPairs[pair] || 0) + 1;
            }
          }
        });

        const inventors = Object.values(inventorMap)
          .map(inv => ({ ...inv, influence: inv.patentCount > 2 ? 'High' : inv.patentCount > 1 ? 'Medium' : 'Low' }))
          .sort((a, b) => b.patentCount - a.patentCount)
          .slice(0, 15);

        setData({
          domain,
          inventors,
          companyNetwork: Object.entries(companyPairs)
            .map(([pair, count]) => ({ pair, coPatents: count }))
            .sort((a, b) => b.coPatents - a.coPatents)
            .slice(0, 8),
        });
      } else {
        const result = await apiFetch(`/analysis/inventors?domain=${encodeURIComponent(domain)}&count=15`);
        setData(result);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [domain, source]);

  useEffect(() => { run(); }, [run]);

  const influenceColor = (level) => level === 'High' ? 'bg-emerald-50 text-emerald-700' : level === 'Medium' ? 'bg-cyan-50 text-cyan-700' : 'bg-zinc-100 text-zinc-500';

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-3"><AlertCircle className="w-4 h-4 text-red-500" /><p className="text-xs text-red-700">{error}</p><button onClick={run} className="text-[11px] font-medium text-red-600">Retry</button></div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-zinc-400 animate-spin" /></div>
      ) : data ? (
        <div className="grid grid-cols-3 gap-4">
          {/* Inventor Leaderboard */}
          <div className="col-span-2 bg-white rounded-2xl border border-zinc-100 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-1">Inventor Leaderboard</h3>
            <p className="text-[11px] text-zinc-400 mb-4">Top patent contributors in {data.domain}</p>
            <div className="space-y-0">
              {/* Header */}
              <div className="flex items-center px-3 py-2 border-b border-zinc-100">
                <span className="w-6 text-[10px] font-medium text-zinc-400 uppercase">#</span>
                <span className="w-[200px] text-[10px] font-medium text-zinc-400 uppercase">Inventor</span>
                <span className="w-20 text-[10px] font-medium text-zinc-400 uppercase text-center">Patents</span>
                <span className="w-24 text-[10px] font-medium text-zinc-400 uppercase text-center">Influence</span>
                <span className="flex-1 text-[10px] font-medium text-zinc-400 uppercase">Affiliation</span>
              </div>
              {data.inventors?.map((inv, i) => (
                <div key={i} className="flex items-center px-3 py-2.5 border-b border-zinc-50 last:border-0 hover:bg-zinc-50/50 transition-colors">
                  <span className="w-6 text-[11px] font-medium text-zinc-400">{i + 1}</span>
                  <div className="w-[200px] min-w-0 flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center shrink-0"><UserCircle className="w-4 h-4 text-zinc-400" /></div>
                    <span className="text-sm font-medium text-zinc-900 truncate">{inv.name}</span>
                  </div>
                  <span className="w-20 text-center text-[11px] font-semibold text-zinc-700 tabular-nums">{inv.patentCount}</span>
                  <div className="w-24 flex justify-center"><span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${influenceColor(inv.influence)}`}>{inv.influence}</span></div>
                  <span className="flex-1 text-[11px] text-zinc-500 truncate">{(inv.companies || [])[0] || 'N/A'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Company Network */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Company Network</h3>
            <p className="text-[11px] text-zinc-400 mb-4">Co-applicant relationships</p>
            <div className="space-y-2">
              {(data.companyNetwork || []).map((cn, i) => (
                <div key={i} className="py-2 border-b border-zinc-50 last:border-0">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                    <p className="text-[11px] text-zinc-700 leading-relaxed">{cn.pair}</p>
                  </div>
                  <p className="text-[10px] text-zinc-400 ml-5 mt-0.5">{cn.coPatents} joint patents</p>
                </div>
              ))}
              {(!data.companyNetwork?.length) && <p className="text-sm text-zinc-400 py-4 text-center">No co-applicant data</p>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsPage() {
  const [dbStats, setDbStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const [showSecret, setShowSecret] = useState(false);

  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [requestDelay, setRequestDelay] = useState(2500);
  const [maxRetries, setMaxRetries] = useState(3);
  const [burstLimit, setBurstLimit] = useState(4);
  const [burstPause, setBurstPause] = useState(10000);

  useEffect(() => {
    (async () => {
      try {
        const [s, db] = await Promise.all([
          apiFetch('/settings'),
          apiFetch('/db/stats').catch(() => null),
        ]);
        setUserName(s.user?.name || '');
        setUserRole(s.user?.role || '');
        setConsumerKey(s.epo?.consumerKey || '');
        setConsumerSecret(s.epo?.consumerSecret || '');
        setRequestDelay(s.rateLimit?.requestDelayMs || 2500);
        setMaxRetries(s.rateLimit?.maxRetries || 3);
        setBurstLimit(s.rateLimit?.burstLimit || 4);
        setBurstPause(s.rateLimit?.burstPauseMs || 10000);
        setDbStats(db);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: { name: userName, role: userRole },
          epo: { consumerKey, consumerSecret },
          rateLimit: { requestDelayMs: requestDelay, maxRetries, burstLimit, burstPauseMs: burstPause },
        }),
      });
      const data = await res.json();
      setSaveMsg({ ok: data.ok, msg: data.message || data.error });
      if (data.ok) setTimeout(() => setSaveMsg(null), 3000);
    } catch (e) { setSaveMsg({ ok: false, msg: e.message }); }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epo: { consumerKey, consumerSecret: consumerSecret.startsWith('\u2022') ? undefined : consumerSecret } }),
      });
      setTestResult(await res.json());
    } catch (e) { setTestResult({ ok: false, message: e.message }); }
    setTesting(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-zinc-400 animate-spin" /></div>;

  return (
    <div className="max-w-3xl space-y-6">
      {/* User Profile */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center"><User className="w-4 h-4 text-zinc-500" /></div>
          <h3 className="text-sm font-semibold text-zinc-900">User Profile</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Name</label>
            <input value={userName} onChange={e => setUserName(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Role</label>
            <input value={userRole} onChange={e => setUserRole(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300" />
          </div>
        </div>
      </div>

      {/* EPO OPS API */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><Key className="w-4 h-4 text-blue-500" /></div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">EPO OPS API</h3>
              <p className="text-[11px] text-zinc-400">European Patent Office credentials</p>
            </div>
          </div>
          <button onClick={handleTest} disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-[11px] font-medium hover:bg-blue-100 transition-colors disabled:opacity-50">
            <TestTube className="w-3 h-3" />{testing ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        {testResult && (
          <div className={`mb-4 px-3 py-2.5 rounded-xl flex items-center gap-2 text-xs ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.ok ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            <span>{testResult.message}</span>
            {testResult.responseMs && <span className="ml-auto text-[10px] opacity-60">{testResult.responseMs}ms</span>}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Consumer Key</label>
            <input value={consumerKey} onChange={e => setConsumerKey(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Consumer Secret</label>
            <div className="relative mt-1.5">
              <input value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)}
                type={showSecret ? 'text' : 'password'}
                className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 pr-16" />
              <button onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-600">
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rate Limiting */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center"><Shield className="w-4 h-4 text-amber-500" /></div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Anti-Robot Protection</h3>
            <p className="text-[11px] text-zinc-400">Prevent EPO OPS from blocking your requests</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Request Delay (ms)</label>
            <p className="text-[10px] text-zinc-400 mb-1">Min 1500ms recommended</p>
            <input type="number" value={requestDelay} onChange={e => setRequestDelay(parseInt(e.target.value) || 2500)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Max Retries</label>
            <p className="text-[10px] text-zinc-400 mb-1">On RobotDetected error</p>
            <input type="number" value={maxRetries} onChange={e => setMaxRetries(parseInt(e.target.value) || 3)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Burst Limit</label>
            <p className="text-[10px] text-zinc-400 mb-1">Max requests before pause</p>
            <input type="number" value={burstLimit} onChange={e => setBurstLimit(parseInt(e.target.value) || 4)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Burst Pause (ms)</label>
            <p className="text-[10px] text-zinc-400 mb-1">Pause after burst limit</p>
            <input type="number" value={burstPause} onChange={e => setBurstPause(parseInt(e.target.value) || 10000)}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300" />
          </div>
        </div>
      </div>

      {/* Database */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center"><Database className="w-4 h-4 text-violet-500" /></div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Local Database</h3>
            <p className="text-[11px] text-zinc-400">SQLite cache for patent data</p>
          </div>
        </div>
        {dbStats && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-zinc-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-zinc-900">{dbStats.total_patents || 0}</p>
              <p className="text-[10px] text-zinc-400">Cached Patents</p>
            </div>
            <div className="bg-zinc-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-zinc-900">{dbStats.cached_searches || 0}</p>
              <p className="text-[10px] text-zinc-400">Cached Searches</p>
            </div>
            <div className="bg-zinc-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-zinc-900">{dbStats.total_api_calls || 0}</p>
              <p className="text-[10px] text-zinc-400">API Calls</p>
            </div>
            <div className="bg-zinc-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-red-500">{dbStats.robot_detections || 0}</p>
              <p className="text-[10px] text-zinc-400">Robot Blocks</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <a href="/api/export/json" target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-700 text-[11px] font-medium hover:bg-zinc-200 transition-colors">
            <Download className="w-3 h-3" />Export JSON
          </a>
          <a href="/api/export/csv" target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-700 text-[11px] font-medium hover:bg-zinc-200 transition-colors">
            <Download className="w-3 h-3" />Export CSV
          </a>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
          <Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saveMsg && (
          <span className={`text-xs font-medium ${saveMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {saveMsg.ok ? '\u2713 ' : '\u2717 '}{saveMsg.msg}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

function LoadingSpinner({ source }) {
  const label = source === 'google' ? 'Google Patents' : 'EPO OPS';
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center"><Loader2 className="w-6 h-6 text-zinc-400 animate-spin" /></div>
      <div className="text-center"><p className="text-sm font-medium text-zinc-700">Querying {label}</p><p className="text-xs text-zinc-400 mt-1">Searching patent database...</p></div>
    </div>
  );
}

const PAGE_TITLES = {
  dashboard: { title: 'Patent Intelligence', sub: 'EPO OPS — search any energy domain' },
  gap: { title: 'Gap Analysis', sub: 'Compare our tech portfolio against competitors' },
  ecosystem: { title: 'Competitor Ecosystem', sub: 'Map partnership networks via co-applicant analysis' },
  inventors: { title: 'Inventor Network', sub: 'Identify key technical experts (KOLs) in the domain' },
  settings: { title: 'Settings', sub: 'Configure search parameters and preferences' },
};

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState('loading');
  const [currentDomain, setCurrentDomain] = useState('solid-state battery');
  const [searchSource, setSearchSource] = useState('epo');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await apiFetch('/patents/search?query=ta%3D%22solid-state%22+AND+ta%3Dbattery&range=1-10');
      // Transform to dashboard format
      const patents = result.patents || [];
      const scored = patents.map(p => ({
        name: p.applicants?.[0] || p.ref,
        innovation_score: p.innovation_score || 50,
        core_patent: `${p.ref}: ${p.title}`,
        ai_insight: p.ai_insight || '',
        action: p.action || 'Schedule Deep Dive',
      }));

      const totalResults = result.totalResults || patents.length;
      const countries = new Set(patents.map(p => p.country));

      setData({
        summary: { total_patents_analyzed: totalResults, high_potential_startups: scored.filter(s => s.innovation_score >= 70).length, tech_domain: 'Solid-State Batteries' },
        radar_data: [
          { subject: 'IP Moat', Company_A: 90, Target_Startup: Math.min(95, 55 + patents.length * 4), fullMark: 100 },
          { subject: 'Tech Overlap', Company_A: 40, Target_Startup: Math.min(95, 60), fullMark: 100 },
          { subject: 'Commercialization', Company_A: 80, Target_Startup: Math.min(90, 50), fullMark: 100 },
          { subject: 'Global Coverage', Company_A: 95, Target_Startup: Math.min(80, 25 + countries.size * 12), fullMark: 100 },
        ],
        bar_data: scored.slice(0, 5).map(s => ({
          name: s.name.length > 14 ? s.name.slice(0, 12) + '\u2026' : s.name,
          score: s.innovation_score,
          fill: s.innovation_score >= 90 ? '#14b8a6' : s.innovation_score >= 80 ? '#06b6d4' : s.innovation_score >= 70 ? '#8b5cf6' : '#a78bfa',
        })),
        startups: scored,
      });
      setDataSource('live');
      setCurrentDomain('solid-state battery');
    } catch (err) {
      console.warn('[Fallback]', err.message);
      setError(err.message);
      setData(FALLBACK);
      setDataSource('demo');
    } finally {
      setLoading(false);
    }
  }, []);

  // Called when user picks a suggestion from TopicSearch
  const handleSearch = useCallback(async (cql, label, topic) => {
    setLoading(true); setError(null);
    try {
      // Route to correct API based on searchSource
      let result;
      if (searchSource === 'google') {
        // Google Patents: use the label as a keyword search query
        const searchQuery = label.replace(/\s*\(.*?\)\s*/g, '').trim() || topic;
        result = await apiFetch(`/patents/google?query=${encodeURIComponent(searchQuery)}&count=10`);
      } else {
        // EPO OPS: use the CQL query
        result = await apiFetch(`/patents/search?query=${encodeURIComponent(cql)}&range=1-10`);
      }
      const patents = result.patents || [];
      const scored = patents.map(p => ({
        name: p.applicants?.[0] || p.ref,
        innovation_score: p.innovation_score || 50,
        core_patent: `${p.ref}: ${p.title}`,
        ai_insight: p.ai_insight || '',
        action: p.action || 'Schedule Deep Dive',
      }));

      const totalResults = result.totalResults || patents.length;
      const countries = new Set(patents.map(p => p.country));

      setData({
        summary: { total_patents_analyzed: totalResults, high_potential_startups: scored.filter(s => s.innovation_score >= 70).length, tech_domain: topic || label },
        radar_data: [
          { subject: 'IP Moat', Company_A: 90, Target_Startup: Math.min(95, 55 + patents.length * 4), fullMark: 100 },
          { subject: 'Tech Overlap', Company_A: 40, Target_Startup: Math.min(95, 60), fullMark: 100 },
          { subject: 'Commercialization', Company_A: 80, Target_Startup: Math.min(90, 50), fullMark: 100 },
          { subject: 'Global Coverage', Company_A: 95, Target_Startup: Math.min(80, 25 + countries.size * 12), fullMark: 100 },
        ],
        bar_data: scored.slice(0, 5).map(s => ({
          name: s.name.length > 14 ? s.name.slice(0, 12) + '\u2026' : s.name,
          score: s.innovation_score,
          fill: s.innovation_score >= 90 ? '#14b8a6' : s.innovation_score >= 80 ? '#06b6d4' : s.innovation_score >= 70 ? '#8b5cf6' : '#a78bfa',
        })),
        startups: scored,
      });
      setDataSource('live');
      setCurrentDomain(topic || label);
    } catch (err) {
      console.warn('[Search Error]', err.message);
      setError(err.message);
      setDataSource('demo');
    } finally {
      setLoading(false);
    }
  }, [searchSource]);

  useEffect(() => { load(); }, [load]);

  const displayData = data || FALLBACK;
  const topStartup = displayData.startups?.[0];
  const domainSub = currentDomain ? `${currentDomain} · ${searchSource === 'google' ? 'Google Patents' : 'EPO OPS'}` : sub;
  const { title } = PAGE_TITLES[page] || PAGE_TITLES.dashboard;

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <Sidebar active={page} onNav={setPage} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={title} subtitle={page === 'dashboard' ? domainSub : (PAGE_TITLES[page] || PAGE_TITLES.dashboard).sub} dataSource={dataSource} onRefresh={page === 'dashboard' ? load : undefined} loading={loading} />
        <main className="flex-1 px-6 py-6">
          {error && page === 'dashboard' && (
            <div className="mb-6 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700 flex-1">{error}</p>
              <button onClick={load} className="text-[11px] font-medium text-red-600">Retry</button>
            </div>
          )}

          {loading && page === 'dashboard' ? <LoadingSpinner source={searchSource} /> : (
            <>
              {page === 'dashboard' && (
                <div className="flex gap-6">
                  <div className="flex-1 min-w-0 space-y-6">
                    <TopicSearch onSearch={handleSearch} loading={loading} source={searchSource} onSourceChange={setSearchSource} />
                    <div className="grid grid-cols-3 gap-4">
                      <MetricCard label="Patents Analyzed" value={displayData.summary.total_patents_analyzed.toLocaleString()} sub="2023-2025 EPO database" icon={FileText} accent />
                      <MetricCard label="Partners Found" value={displayData.summary.high_potential_startups} sub="Score > 70 by AI" icon={Sparkles} />
                      <MetricCard label="Tech Domain" value={displayData.summary.tech_domain?.length > 18 ? displayData.summary.tech_domain.slice(0, 16) + '\u2026' : displayData.summary.tech_domain} sub="Current search scope" icon={Target} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <RadarPanel data={displayData.radar_data} />
                      <RankingPanel barData={displayData.bar_data} />
                    </div>
                    <PipelineSection startups={displayData.startups} />
                  </div>
                  <ContextPanel topStartup={topStartup} radarData={displayData.radar_data} />
                </div>
              )}
              {page === 'gap' && <GapAnalysisPage domain={currentDomain} source={searchSource} />}
              {page === 'ecosystem' && <EcosystemPage domain={currentDomain} source={searchSource} />}
              {page === 'inventors' && <InventorsPage domain={currentDomain} source={searchSource} />}
              {page === 'settings' && <SettingsPage />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
