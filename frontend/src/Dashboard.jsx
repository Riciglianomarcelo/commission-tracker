import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Download, RefreshCw } from 'lucide-react';

const money = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const money2 = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n) => `${((n || 0) * 100).toFixed(1)}%`;
const monthLabel = (m) => {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const PAYMENT_LABELS = { cash: 'Paid Cash', financed: 'Financed', other: 'Other' };

// Dimensions the breakdown table can be grouped by
const GROUPS = {
  month: { label: 'Commission month', key: (r) => r.month, fmt: monthLabel, sort: 'key' },
  program: { label: 'Program', key: (r) => r.program || '—' },
  type: { label: 'Enrolled vs graduate', key: (r) => (r.is_graduate ? 'Graduate' : 'Enrolled') },
  payment_type: { label: 'Payment type', key: (r) => PAYMENT_LABELS[r.payment_type] || r.payment_type || '—' },
  status: { label: 'Student status', key: (r) => r.status || '—' },
  start_month: { label: 'Start month', key: (r) => (r.start_date || '').slice(0, 7) || '—', fmt: monthLabel, sort: 'key' },
  commission_pct: { label: 'Commission %', key: (r) => `${r.commission_percentage}%` },
};

const METRICS = {
  commission: { label: 'Commission', get: (g) => g.commission, fmt: money },
  tuition: { label: 'Tuition', get: (g) => g.tuition, fmt: money },
  count: { label: 'Records', get: (g) => g.count, fmt: (n) => n },
};

function aggregate(rows, keyFn) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    const g = map.get(k) || { key: k, count: 0, enrolled: 0, graduates: 0, tuition: 0, commission: 0, dropped: 0 };
    g.count += 1;
    g[r.is_graduate ? 'graduates' : 'enrolled'] += 1;
    g.tuition += r.tuition_amount || 0;
    g.commission += r.commission_amount || 0;
    if (r.status === 'dropped') g.dropped += 1;
    map.set(k, g);
  });
  return [...map.values()];
}

export default function Dashboard({ apiBase, getAuthHeader, onAuthError }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');
  const [program, setProgram] = useState('all');
  const [type, setType] = useState('all');
  const [payment, setPayment] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const [groupBy, setGroupBy] = useState('program');
  const [trendMetric, setTrendMetric] = useState('commission');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${apiBase}/dashboard/data`, getAuthHeader());
      setData(res.data);
    } catch (err) {
      if (!onAuthError(err)) setError(err?.response?.data?.detail || 'Could not load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const records = data?.records || [];
  const programs = useMemo(() => [...new Set(records.map((r) => r.program).filter(Boolean))].sort(), [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) =>
      (!fromMonth || r.month >= fromMonth) &&
      (!toMonth || r.month <= toMonth) &&
      (program === 'all' || r.program === program) &&
      (type === 'all' || (type === 'graduate') === r.is_graduate) &&
      (payment === 'all' || r.payment_type === payment) &&
      (status === 'all' || r.status === status) &&
      (!q || r.name?.toLowerCase().includes(q) || r.email?.toLowerCase().includes(q))
    );
  }, [records, fromMonth, toMonth, program, type, payment, status, search]);

  const kpis = useMemo(() => {
    const enrolled = filtered.filter((r) => !r.is_graduate);
    const grads = filtered.filter((r) => r.is_graduate);
    const tuition = filtered.reduce((s, r) => s + (r.tuition_amount || 0), 0);
    const commission = filtered.reduce((s, r) => s + (r.commission_amount || 0), 0);
    const dropped = enrolled.filter((r) => r.status === 'dropped').length;
    return {
      enrolled: enrolled.length,
      graduates: grads.length,
      tuition,
      commission,
      avgTuition: enrolled.length ? enrolled.reduce((s, r) => s + (r.tuition_amount || 0), 0) / enrolled.length : 0,
      effectiveRate: tuition ? commission / tuition : 0,
      dropRate: enrolled.length ? dropped / enrolled.length : 0,
      dropped,
      enrolledCommission: enrolled.reduce((s, r) => s + (r.commission_amount || 0), 0),
      gradCommission: grads.reduce((s, r) => s + (r.commission_amount || 0), 0),
    };
  }, [filtered]);

  const trend = useMemo(() => aggregate(filtered, (r) => r.month).sort((a, b) => a.key.localeCompare(b.key)), [filtered]);

  const breakdown = useMemo(() => {
    const g = GROUPS[groupBy];
    const rows = aggregate(filtered, g.key);
    return g.sort === 'key' ? rows.sort((a, b) => String(b.key).localeCompare(String(a.key))) : rows.sort((a, b) => b.commission - a.commission);
  }, [filtered, groupBy]);

  const resetFilters = () => {
    setFromMonth(''); setToMonth(''); setProgram('all'); setType('all'); setPayment('all'); setStatus('all'); setSearch('');
  };

  const exportCSV = () => {
    const headers = ['Month', 'Name', 'Email', 'Program', 'Type', 'Start Date', 'Graduation Date', 'Tuition', 'Commission %', 'Commission', 'Payment', 'Status', 'Approval'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filtered.map((r) => [
      r.month, r.name, r.email, r.program, r.is_graduate ? 'Graduate' : 'Enrolled', r.start_date, r.graduation_date,
      r.tuition_amount, r.commission_percentage, r.commission_amount, r.payment_type, r.status, data?.approvals?.[r.month] || 'draft',
    ]);
    const csv = [headers, ...rows].map((row) => row.map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `commission_dashboard_${fromMonth || 'all'}_${toMonth || 'all'}.csv`;
    a.click();
  };

  const inputClass = 'px-3 py-2 border border-border rounded-[10px] text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent transition';
  const card = 'bg-white rounded-card border border-border shadow-card p-6';

  if (!data && loading) return <div className={`${card} text-center text-sm text-muted py-16`}>Loading dashboard…</div>;
  if (error) return <div className="bg-red-soft border border-red/20 text-red px-4 py-3 rounded-[10px] text-sm">{String(error)}</div>;
  if (!data) return null;

  const trendMax = Math.max(1, ...trend.map((t) => METRICS[trendMetric].get(t)));
  const breakdownMax = Math.max(1, ...breakdown.map((b) => b.commission));

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className={card}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-ink">Filters</h2>
          <div className="flex gap-4 text-sm">
            <button onClick={resetFilters} className="font-semibold text-body hover:text-ink">Reset</button>
            <button onClick={load} className="font-semibold text-blue flex items-center gap-1"><RefreshCw size={14} /> Refresh</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <label className="text-xs font-semibold text-muted">From month
            <input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className={`w-full mt-1 ${inputClass}`} />
          </label>
          <label className="text-xs font-semibold text-muted">To month
            <input type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} className={`w-full mt-1 ${inputClass}`} />
          </label>
          <label className="text-xs font-semibold text-muted">Program
            <select value={program} onChange={(e) => setProgram(e.target.value)} className={`w-full mt-1 ${inputClass}`}>
              <option value="all">All programs</option>
              {programs.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">Type
            <select value={type} onChange={(e) => setType(e.target.value)} className={`w-full mt-1 ${inputClass}`}>
              <option value="all">All</option>
              <option value="enrolled">Enrolled</option>
              <option value="graduate">Graduates</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">Payment
            <select value={payment} onChange={(e) => setPayment(e.target.value)} className={`w-full mt-1 ${inputClass}`}>
              <option value="all">All</option>
              <option value="cash">Paid Cash</option>
              <option value="financed">Financed</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={`w-full mt-1 ${inputClass}`}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="graduated">Graduated</option>
              <option value="dropped">Dropped</option>
              <option value="pending">Pending</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">Search
            <input type="text" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} className={`w-full mt-1 ${inputClass}`} />
          </label>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['Enrollments', kpis.enrolled, `${kpis.dropped} dropped · ${pct(kpis.dropRate)}`],
          ['Graduates', kpis.graduates, money(kpis.gradCommission) + ' commission'],
          ['Tuition booked', money(kpis.tuition), `Avg enrollment ${money(kpis.avgTuition)}`],
          ['Total commission', money2(kpis.commission), `Effective rate ${pct(kpis.effectiveRate)}`],
        ].map(([label, value, sub], i) => (
          <div key={label} className={i === 3 ? 'bg-blue rounded-card p-5' : 'bg-white rounded-card border border-border shadow-card p-5'}>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${i === 3 ? 'text-white/80' : 'text-muted'}`}>{label}</p>
            <p className={`text-2xl md:text-3xl font-extrabold ${i === 3 ? 'text-white' : 'text-ink'}`}>{value}</p>
            <p className={`text-xs mt-1 ${i === 3 ? 'text-white/80' : 'text-body'}`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Monthly trend */}
      <div className={card}>
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <h2 className="text-lg font-bold text-ink">By commission month</h2>
          <div className="flex gap-1 bg-bg-gray rounded-pill p-1">
            {Object.entries(METRICS).map(([k, m]) => (
              <button key={k} onClick={() => setTrendMetric(k)}
                className={`px-3 py-1 text-xs font-semibold rounded-pill transition ${trendMetric === k ? 'bg-white text-ink shadow-card' : 'text-body'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {trend.length === 0 ? (
          <p className="text-muted text-center py-8 text-sm">No records match these filters</p>
        ) : (
          <>
            <div className="flex items-end gap-2 h-56 overflow-x-auto pb-1">
              {trend.map((t) => {
                const total = METRICS[trendMetric].get(t);
                // split each bar into enrolled / graduate portions
                const gradShare = trendMetric === 'count' ? t.graduates / (t.count || 1) : 0;
                const rows = filtered.filter((r) => r.month === t.key);
                const gradVal = trendMetric === 'count' ? t.graduates
                  : rows.filter((r) => r.is_graduate).reduce((s, r) => s + (trendMetric === 'commission' ? r.commission_amount : r.tuition_amount), 0);
                const share = trendMetric === 'count' ? gradShare : (total ? gradVal / total : 0);
                const h = (total / trendMax) * 100;
                const approval = data.approvals?.[t.key] || 'draft';
                return (
                  <div key={t.key} className="flex-1 min-w-[44px] flex flex-col items-center justify-end h-full group"
                    title={`${monthLabel(t.key)}: ${METRICS[trendMetric].fmt(total)} (${t.enrolled} enrolled, ${t.graduates} graduates) — ${approval}`}>
                    <span className="text-[11px] font-semibold text-ink mb-1 whitespace-nowrap">{METRICS[trendMetric].fmt(total)}</span>
                    <div className="w-full max-w-[48px] flex flex-col justify-end rounded-t-md overflow-hidden" style={{ height: `${Math.max(h, 2)}%` }}>
                      <div className="bg-amber" style={{ height: `${share * 100}%` }} />
                      <div className="bg-blue flex-1" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {trend.map((t) => {
                const approval = data.approvals?.[t.key] || 'draft';
                return (
                  <div key={t.key} className="flex-1 min-w-[44px] text-center">
                    <p className="text-xs text-ink font-semibold">{monthLabel(t.key)}</p>
                    <span className={`inline-block mt-1 w-2 h-2 rounded-full ${approval === 'approved' ? 'bg-green-600' : approval === 'submitted' ? 'bg-amber' : 'bg-border'}`} title={approval} />
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-body">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue" /> Enrolled</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber" /> Graduates</span>
              <span className="flex items-center gap-1.5 ml-auto"><span className="w-2 h-2 rounded-full bg-green-600" /> Approved</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber" /> Submitted</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-border" /> Draft</span>
            </div>
          </>
        )}
      </div>

      {/* Flexible breakdown */}
      <div className={card}>
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h2 className="text-lg font-bold text-ink">Breakdown</h2>
          <label className="text-xs font-semibold text-muted flex items-center gap-2">Group by
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={inputClass}>
              {Object.entries(GROUPS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 font-semibold text-ink">{GROUPS[groupBy].label}</th>
                <th className="text-right px-3 py-2 font-semibold text-ink">Enrolled</th>
                <th className="text-right px-3 py-2 font-semibold text-ink">Graduates</th>
                <th className="text-right px-3 py-2 font-semibold text-ink">Dropped</th>
                <th className="text-right px-3 py-2 font-semibold text-ink">Tuition</th>
                <th className="text-right px-3 py-2 font-semibold text-ink">Commission</th>
                <th className="px-3 py-2 font-semibold text-ink w-1/4">Share of commission</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((b) => (
                <tr key={b.key} className="border-b border-border hover:bg-bg-gray">
                  <td className="px-3 py-2.5 text-ink font-medium">{(GROUPS[groupBy].fmt || String)(b.key)}</td>
                  <td className="px-3 py-2.5 text-right text-body tabular-nums">{b.enrolled}</td>
                  <td className="px-3 py-2.5 text-right text-body tabular-nums">{b.graduates}</td>
                  <td className="px-3 py-2.5 text-right text-body tabular-nums">{b.dropped}</td>
                  <td className="px-3 py-2.5 text-right text-ink tabular-nums">{money(b.tuition)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-blue tabular-nums">{money2(b.commission)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-bg-gray rounded-pill overflow-hidden">
                        <div className="h-full bg-blue rounded-pill" style={{ width: `${(b.commission / breakdownMax) * 100}%` }} />
                      </div>
                      <span className="text-xs text-body w-12 text-right tabular-nums">{pct(kpis.commission ? b.commission / kpis.commission : 0)}</span>
                    </div>
                  </td>
                </tr>
              ))}
              {breakdown.length > 0 && (
                <tr className="font-semibold">
                  <td className="px-3 py-2.5 text-ink">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{kpis.enrolled}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{kpis.graduates}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{breakdown.reduce((s, b) => s + b.dropped, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(kpis.tuition)}</td>
                  <td className="px-3 py-2.5 text-right text-blue tabular-nums">{money2(kpis.commission)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record-level detail */}
      <div className={card}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            Records
            <span className="text-xs bg-blue-soft text-blue px-2.5 py-1 rounded-pill font-semibold">{filtered.length}</span>
          </h2>
          <button onClick={exportCSV} className="bg-white border border-border hover:border-blue text-ink font-semibold py-2 px-4 rounded-pill transition flex items-center gap-2 text-sm">
            <Download size={16} /> Export filtered CSV
          </button>
        </div>
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-border">
                {['Month', 'Name', 'Program', 'Type', 'Start', 'Tuition', 'Comm. %', 'Commission', 'Payment', 'Status'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-semibold text-ink whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...filtered].sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name)).map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-bg-gray">
                  <td className="px-3 py-2 text-body whitespace-nowrap">{monthLabel(r.month)}</td>
                  <td className="px-3 py-2 text-ink">{r.name}</td>
                  <td className="px-3 py-2 text-body">{r.program}</td>
                  <td className="px-3 py-2 text-body">{r.is_graduate ? 'Graduate' : 'Enrolled'}</td>
                  <td className="px-3 py-2 text-body whitespace-nowrap">{r.start_date}</td>
                  <td className="px-3 py-2 text-ink tabular-nums">{money(r.tuition_amount)}</td>
                  <td className="px-3 py-2 text-body tabular-nums">{r.commission_percentage}%</td>
                  <td className="px-3 py-2 font-semibold text-blue tabular-nums">{money2(r.commission_amount)}</td>
                  <td className="px-3 py-2 text-body">{PAYMENT_LABELS[r.payment_type] || r.payment_type}</td>
                  <td className="px-3 py-2 text-body">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
