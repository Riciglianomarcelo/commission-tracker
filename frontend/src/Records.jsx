import React, { useMemo, useState } from 'react';
import { Search, Plus, Pencil, Trash2, GraduationCap, Wallet, AlertTriangle, ArrowUp, ArrowDown, Users } from 'lucide-react';
import { Card, Button, IconButton, Badge, PayBadge, EmptyState, inputCls, money, moneyShort, monthName, fmtDate } from './ui.jsx';

const STATUS_TONE = { active: 'green', graduated: 'blue', dropped: 'red', pending: 'amber' };

export default function Records({
  isGraduate, rows, loading, month, canManage, canAdd, showRepColumn, dupIndex,
  onAdd, onEdit, onDelete, onMarkGraduate, onPay,
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all'); // all | unpaid | paid
  const [sort, setSort] = useState({ key: 'name', dir: 1 });

  const counts = useMemo(() => ({
    all: rows.length,
    unpaid: rows.filter((r) => r.outstanding_amount > 0.005).length,
    paid: rows.filter((r) => r.outstanding_amount <= 0.005).length,
  }), [rows]);

  const totals = useMemo(() => ({
    earned: rows.reduce((s, r) => s + (r.commission_amount || 0), 0),
    paid: rows.reduce((s, r) => s + (r.paid_total || 0), 0),
    left: rows.reduce((s, r) => s + (r.outstanding_amount || 0), 0),
    tuition: rows.reduce((s, r) => s + (r.tuition_amount || 0), 0),
  }), [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) =>
      (filter === 'all' || (filter === 'unpaid' ? r.outstanding_amount > 0.005 : r.outstanding_amount <= 0.005)) &&
      (!needle || r.name?.toLowerCase().includes(needle) || r.email?.toLowerCase().includes(needle) || r.program?.toLowerCase().includes(needle)));
    const get = { name: (r) => (r.name || '').toLowerCase(), tuition: (r) => r.tuition_amount, commission: (r) => r.commission_amount, date: (r) => r.graduation_date || '9999' }[sort.key];
    return [...list].sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * sort.dir);
  }, [rows, q, filter, sort]);

  const th = (key, label, align = 'left') => (
    <th className={`px-4 py-2.5 text-${align} text-[11px] uppercase tracking-wide font-semibold text-muted whitespace-nowrap`}>
      {key ? (
        <button
          onClick={() => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))}
          className="inline-flex items-center gap-1 uppercase hover:text-ink"
        >
          {label}
          {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        </button>
      ) : label}
    </th>
  );

  const noun = isGraduate ? 'graduate' : 'enrolled student';

  return (
    <Card
      title={isGraduate ? 'Graduates' : 'Enrolled students'}
      subtitle={`${monthName(month)} · ${rows.length} ${rows.length === 1 ? noun : noun + 's'}${rows.length ? ` · ${money(totals.earned)} commission` : ''}`}
      actions={canAdd && <Button variant="primary" icon={Plus} onClick={onAdd}>{isGraduate ? 'Add graduate' : 'Add student'}</Button>}
      flush
    >
      {rows.length > 0 && (
        <div className="px-6 pb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or program" className={`${inputCls} pl-10`} aria-label="Search records" />
          </div>
          <div className="flex bg-bg-gray rounded-pill p-1" role="group" aria-label="Payment filter">
            {[['all', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                aria-pressed={filter === k}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-pill transition ${filter === k ? 'bg-white shadow-card text-ink' : 'text-body hover:text-ink'}`}
              >
                {label} <span className="text-muted ml-0.5">{counts[k]}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto text-sm text-body hidden md:block">
            Paid <b className="text-green-700 tabular-nums">{money(totals.paid)}</b>
            <span className="mx-2 text-border">|</span>
            Left to pay <b className="text-ink tabular-nums">{money(totals.left)}</b>
          </div>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="px-6 pb-8 text-sm text-muted">Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={isGraduate ? GraduationCap : Users}
          title={`No ${noun}s recorded for ${monthName(month)}`}
          text={canAdd ? 'Add the first one and it will count toward this month’s commission.' : 'Nothing has been entered for this month yet.'}
          action={canAdd && <Button variant="primary" icon={Plus} onClick={onAdd}>{isGraduate ? 'Add graduate' : 'Add student'}</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title="No matches" text="Try a different search or filter." action={<Button onClick={() => { setQ(''); setFilter('all'); }}>Clear filters</Button>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-y border-border bg-bg-gray/60">
                {th('name', 'Student')}
                {th(null, 'Program')}
                {th('date', isGraduate ? 'Graduated' : 'Expected grad.')}
                {th('tuition', 'Tuition', 'right')}
                {th('commission', 'Commission', 'right')}
                {th(null, 'Payment')}
                {!isGraduate && th(null, 'Status')}
                {th(null, '', 'right')}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const risk = dupIndex?.[r.id];
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-bg-gray/50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">{r.name}</span>
                        {risk && (
                          <span title={risk.reason} className="text-red"><AlertTriangle size={14} aria-label="Possible duplicate" /></span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {[showRepColumn && r.rep_name, r.email].filter(Boolean).join(' · ') || ' '}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-body whitespace-nowrap">{r.program}</td>
                    <td className="px-4 py-3 text-body whitespace-nowrap">{r.graduation_date ? fmtDate(r.graduation_date) : '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink">{moneyShort(r.tuition_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">
                      {money(r.commission_amount)}
                      <div className="text-xs font-normal text-muted">{r.commission_percentage}%</div>
                    </td>
                    <td className="px-4 py-3"><PayBadge student={r} /></td>
                    {!isGraduate && <td className="px-4 py-3"><Badge tone={STATUS_TONE[r.status] || 'gray'}>{r.status}</Badge></td>}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {canManage && <IconButton icon={Wallet} tone="green" label="Record payment" onClick={() => onPay(r)} />}
                      {canAdd && !isGraduate && <IconButton icon={GraduationCap} tone="blue" label="Add graduate record for this student" onClick={() => onMarkGraduate(r)} />}
                      {canManage && <IconButton icon={Pencil} label="Edit" onClick={() => onEdit(r)} />}
                      {canManage && <IconButton icon={Trash2} tone="red" label="Delete" onClick={() => onDelete(r)} />}
                      {!canManage && !(canAdd && !isGraduate) && <span className="text-xs text-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
