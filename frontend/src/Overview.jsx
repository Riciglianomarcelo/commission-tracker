import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  CheckCircle2, AlertTriangle, Wallet, Clock, GraduationCap, ChevronRight, Check, RotateCcw, Users, CalendarClock, ShieldCheck,
} from 'lucide-react';
import {
  Card, Stat, Button, Badge, ApprovalBadge, ProgressBar, Skeleton, EmptyState,
  money, moneyShort, monthName, shiftMonth, fmtDate, useUI,
} from './ui.jsx';
import { reportError, duplicateWarning } from './api.js';

const norm = (s) => (s || '').toLowerCase().split(/\s+/).filter(Boolean).join(' ');
const OWES = 0.005;

const TONE = {
  red: { bar: 'bg-red', icon: 'bg-red-soft text-red' },
  amber: { bar: 'bg-amber', icon: 'bg-amber-soft text-[#8A5A00]' },
  blue: { bar: 'bg-blue', icon: 'bg-blue-soft text-blue' },
  gray: { bar: 'bg-border', icon: 'bg-bg-gray text-body' },
  green: { bar: 'bg-green-600', icon: 'bg-green-100 text-green-700' },
};

function AttentionItem({ tone = 'gray', icon: Icon, title, text, actions = [], children }) {
  const t = TONE[tone];
  return (
    <li className="relative flex flex-wrap items-center gap-x-4 gap-y-3 pl-5 pr-4 py-4 border-b border-border last:border-0">
      <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${t.bar}`} />
      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${t.icon}`}><Icon size={18} /></span>
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {text && <p className="text-sm text-body mt-0.5">{text}</p>}
        {children}
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.label} size="sm" variant={a.variant || 'secondary'} icon={a.icon} onClick={a.onClick} disabled={a.disabled}>{a.label}</Button>
        ))}
      </div>
    </li>
  );
}

export default function Overview({
  month, location, repFilter, portfolio, repRows, dupReport, dupIndex, isSuperAdmin, canAdd,
  go, onApprove, onGraduate, payments, api, onChanged,
}) {
  const ui = useUI();
  const [tab, setTab] = useState('month'); // month | earlier | paid
  const [selected, setSelected] = useState(() => new Set());
  const [limit, setLimit] = useState(15);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showGrads, setShowGrads] = useState(false);
  const payRef = useRef(null);

  useEffect(() => { setSelected(new Set()); setLimit(15); }, [tab, month, location, repFilter]);

  const all = useMemo(
    () => (portfolio?.records || []).filter((r) => repFilter === 'all' || String(r.rep_id) === String(repFilter)),
    [portfolio, repFilter],
  );

  const d = useMemo(() => {
    const inMonth = all.filter((r) => r.month === month);
    const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
    const earlier = all.filter((r) => r.month < month && r.outstanding_amount > OWES);
    const prev = all.filter((r) => r.month === shiftMonth(month, -1));
    const unpaid = inMonth.filter((r) => r.outstanding_amount > OWES);
    const paid = inMonth.filter((r) => r.outstanding_amount <= OWES);
    const gradKeys = new Set(all.filter((r) => r.is_graduate).flatMap((r) => [(r.email || '').toLowerCase(), norm(r.name)]).filter(Boolean));
    const gradsDue = all.filter((r) =>
      !r.is_graduate && r.status !== 'dropped' && r.graduation_date && r.graduation_date.slice(0, 7) <= month &&
      !gradKeys.has((r.email || '').toLowerCase()) && !gradKeys.has(norm(r.name)));
    return {
      inMonth, unpaid, paid, earlier, gradsDue,
      earned: sum(inMonth, 'commission_amount'),
      paidSum: sum(inMonth, 'paid_total'),
      left: sum(inMonth, 'outstanding_amount'),
      earlierLeft: sum(earlier, 'outstanding_amount'),
      prevEarned: sum(prev, 'commission_amount'),
      enrolled: inMonth.filter((r) => !r.is_graduate).length,
      grads: inMonth.filter((r) => r.is_graduate).length,
      partialNoAmount: all.filter((r) => r.payment_status === 'partial' && !(r.paid_total > 0)),
    };
  }, [all, month]);

  const rows = useMemo(
    () => (repRows || []).filter((r) => repFilter === 'all' || String(r.rep_id) === String(repFilter)),
    [repRows, repFilter],
  );
  const submitted = rows.filter((r) => r.approval_status === 'submitted');
  const notSubmitted = rows.filter((r) => r.approval_status === 'draft');
  const approvedCount = rows.filter((r) => r.approval_status === 'approved').length;

  const alerts = (dupReport?.groups || []).filter((g) => repFilter === 'all' || g.records.some((r) => String(r.rep_id) === String(repFilter)));
  const hardAlerts = alerts.filter((g) => g.risk !== 'repeat');

  const listFor = { month: d.unpaid, earlier: d.earlier, paid: d.paid }[tab];
  const sorted = useMemo(
    () => [...listFor].sort((a, b) => (tab === 'earlier' ? a.month.localeCompare(b.month) : 0) || (a.rep_name || '').localeCompare(b.rep_name || '') || a.name.localeCompare(b.name)),
    [listFor, tab],
  );
  const shown = sorted.slice(0, limit);
  const selRows = sorted.filter((r) => selected.has(r.id));
  const selTotal = selRows.reduce((s, r) => s + r.outstanding_amount, 0);

  const jumpToPayments = (t) => {
    setTab(t);
    setTimeout(() => payRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => (s.size === shown.length ? new Set() : new Set(shown.map((r) => r.id))));

  const bulkPay = async () => {
    const ok = await ui.confirm({
      title: `Mark ${selRows.length} commission${selRows.length === 1 ? '' : 's'} as paid?`,
      message: <>This records <b>{money(selTotal)}</b> as paid. Anyone who looks like a possible double payment is skipped so you can check them one by one.</>,
      confirmLabel: 'Mark as paid',
    });
    if (!ok) return;
    setBulkBusy(true);
    let done = 0; let skipped = 0; let failed = 0; let amount = 0;
    for (const r of selRows) {
      try {
        const res = await api.post(`/students/${r.id}/payment`, { payment_status: 'paid' });
        done += 1; amount += res.paid_total - r.paid_total;
      } catch (e) {
        if (duplicateWarning(e)) skipped += 1; else failed += 1;
      }
    }
    setBulkBusy(false);
    setSelected(new Set());
    onChanged();
    ui.toast({
      tone: failed ? 'error' : 'success',
      title: `Marked ${done} as paid (${money(amount)})`,
      text: [skipped && `${skipped} skipped — possible double payment, review them individually`, failed && `${failed} failed`].filter(Boolean).join(' · ') || undefined,
    });
  };

  if (!portfolio) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-48" /><Skeleton className="h-64" />
      </div>
    );
  }

  const attention = [];
  submitted.forEach((r) => attention.push(
    <AttentionItem
      key={`sub-${r.rep_id}`} tone="amber" icon={Clock}
      title={`${r.rep_name} submitted ${monthName(month)} for approval`}
      text={`${money(r.total_commission)} earned · ${money(r.total_paid)} already paid · ${money(r.total_outstanding)} left to pay`}
      actions={[
        { label: 'See records', onClick: () => go('enrolled', { rep: String(r.rep_id) }) },
        isSuperAdmin ? { label: 'Approve', variant: 'primary', icon: Check, onClick: () => onApprove(r) } : { label: 'Waiting for Marcelo', disabled: true },
      ]}
    />,
  ));
  if (hardAlerts.length) {
    const dbl = hardAlerts.filter((g) => g.risk === 'double_paid').length;
    attention.push(
      <AttentionItem
        key="dups" tone="red" icon={AlertTriangle}
        title={`${hardAlerts.length} possible double payment${hardAlerts.length === 1 ? '' : 's'}`}
        text={dbl ? `${dbl} already paid more than once. The rest are paid once and have a second record still unpaid — don't pay those without checking.` : 'Already paid once, with a second record for the same student still unpaid — check before paying it.'}
        actions={[{ label: 'Review', variant: 'primary', onClick: () => go('duplicates') }]}
      />,
    );
  }
  if (d.unpaid.length) attention.push(
    <AttentionItem
      key="unpaid" tone="blue" icon={Wallet}
      title={`${d.unpaid.length} commission${d.unpaid.length === 1 ? '' : 's'} from ${monthName(month)} still to pay`}
      text={`${money(d.left)} left${d.paid.length ? ` · ${d.paid.length} already paid` : ''}`}
      actions={[{ label: 'Review & pay', variant: 'primary', icon: ChevronRight, onClick: () => jumpToPayments('month') }]}
    />,
  );
  if (d.earlier.length) attention.push(
    <AttentionItem
      key="earlier" tone="amber" icon={CalendarClock}
      title={`${d.earlier.length} commission${d.earlier.length === 1 ? '' : 's'} from earlier months still unpaid`}
      text={`${money(d.earlierLeft)} carried over`}
      actions={[{ label: 'Show', onClick: () => jumpToPayments('earlier') }]}
    />,
  );
  if (d.partialNoAmount.length) attention.push(
    <AttentionItem
      key="partial" tone="amber" icon={Wallet}
      title={`${d.partialNoAmount.length} partial payment${d.partialNoAmount.length === 1 ? ' has' : 's have'} no amount recorded`}
      text={`${d.partialNoAmount.map((r) => r.name).slice(0, 3).join(', ')}${d.partialNoAmount.length > 3 ? '…' : ''} — enter how much was paid so the balance is right.`}
      actions={[{ label: 'Enter amount', onClick: () => payments.open(d.partialNoAmount[0]) }]}
    />,
  );
  if (notSubmitted.length) attention.push(
    <AttentionItem
      key="draft" tone="gray" icon={Users}
      title={`${notSubmitted.length === 1 ? notSubmitted[0].rep_name : `${notSubmitted.length} reps`} ${notSubmitted.length === 1 ? 'has' : 'have'}n't submitted ${monthName(month)} yet`}
      text={notSubmitted.length > 1 ? notSubmitted.map((r) => r.rep_name).join(', ') : `${notSubmitted[0].enrolled_count + notSubmitted[0].graduate_count} records entered so far`}
      actions={notSubmitted.length === 1 ? [{ label: 'See records', onClick: () => go('enrolled', { rep: String(notSubmitted[0].rep_id) }) }] : []}
    />,
  );
  if (d.gradsDue.length) attention.push(
    <AttentionItem
      key="grads" tone="blue" icon={GraduationCap}
      title={`${d.gradsDue.length} student${d.gradsDue.length === 1 ? '' : 's'} reached the expected graduation date with no graduate record`}
      text="Their graduation commission hasn’t been entered yet."
      actions={[{ label: showGrads ? 'Hide' : 'Show students', onClick: () => setShowGrads((v) => !v) }]}
    >
      {showGrads && (
        <ul className="mt-3 space-y-1.5">
          {d.gradsDue.slice(0, 10).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 text-sm bg-bg-gray rounded-lg px-3 py-2">
              <span className="font-semibold text-ink">{r.name}</span>
              <span className="text-muted">{r.rep_name} · expected {fmtDate(r.graduation_date)}</span>
              {canAdd && <button onClick={() => onGraduate(r)} className="ml-auto text-xs font-semibold text-blue hover:underline">Add graduate record</button>}
            </li>
          ))}
          {d.gradsDue.length > 10 && <li className="text-xs text-muted px-1">…and {d.gradsDue.length - 10} more</li>}
        </ul>
      )}
    </AttentionItem>,
  );

  const deltaPct = d.prevEarned > 0 ? Math.round(((d.earned - d.prevEarned) / d.prevEarned) * 100) : null;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          label="Commission earned"
          value={money(d.earned)}
          sub={`${d.enrolled} enrolled · ${d.grads} graduate${d.grads === 1 ? '' : 's'}${deltaPct !== null ? ` · ${deltaPct >= 0 ? '+' : ''}${deltaPct}% vs last month` : ''}`}
          onClick={() => go('enrolled')}
        />
        <Stat label="Already paid" value={money(d.paidSum)} tone="green" sub={d.earned ? `${Math.round((d.paidSum / d.earned) * 100)}% of this month’s commission` : 'Nothing earned yet'}>
          <div className="mt-3"><ProgressBar value={d.paidSum} max={d.earned} /></div>
        </Stat>
        <Stat
          label="Left to pay"
          value={money(d.left)}
          tone="blue"
          sub={d.earlierLeft > OWES ? `+ ${money(d.earlierLeft)} unpaid from earlier months` : d.left <= OWES && d.earned > 0 ? 'All paid for this month' : 'From this month’s commissions'}
          onClick={() => jumpToPayments(d.unpaid.length || !d.earlier.length ? 'month' : 'earlier')}
        />
        <Stat
          label="Approvals"
          value={rows.length ? `${approvedCount} of ${rows.length}` : '—'}
          sub={submitted.length ? `${submitted.length} waiting for ${isSuperAdmin ? 'you' : 'Marcelo'}` : rows.length ? (approvedCount === rows.length ? 'All reps approved' : 'Waiting for reps to submit') : `No ${location} reps yet`}
          onClick={() => document.getElementById('rep-table')?.scrollIntoView({ behavior: 'smooth' })}
        />
      </div>

      {/* Needs attention */}
      <Card
        title="Needs your attention"
        subtitle={attention.length ? `${attention.length} thing${attention.length === 1 ? '' : 's'} to look at for ${monthName(month)}` : undefined}
        flush
      >
        {attention.length ? (
          <ul className="border-t border-border">{attention}</ul>
        ) : (
          <div className="flex items-center gap-3 px-6 pb-6 pt-1 text-sm text-body">
            <span className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><ShieldCheck size={18} /></span>
            Nothing needs your attention — {monthName(month)} is in good shape.
          </div>
        )}
      </Card>

      {/* Per-rep table */}
      <div id="rep-table">
        <Card title={`${location} reps — ${monthName(month)}`} subtitle="Each rep submits their own month; approve it once you’ve reviewed it." flush>
          {rows.length === 0 ? (
            <EmptyState icon={Users} title={`No ${location} reps to show`} text="Add reps from the Users tab." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="border-y border-border bg-bg-gray/60 text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-6 py-2.5 text-left font-semibold">Rep</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Records</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Earned</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Paid</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Left to pay</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-6 py-2.5 text-right font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rep_id} className="border-b border-border last:border-0 hover:bg-bg-gray/50">
                      <td className="px-6 py-3">
                        <button onClick={() => go('enrolled', { rep: String(r.rep_id) })} className="font-semibold text-ink hover:text-blue">{r.rep_name}</button>
                      </td>
                      <td className="px-4 py-3 text-body">{r.enrolled_count} enrolled · {r.graduate_count} grad.</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink">{money(r.total_commission)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-700">{money(r.total_paid)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">{money(r.total_outstanding)}</td>
                      <td className="px-4 py-3"><ApprovalBadge status={r.approval_status} /></td>
                      <td className="px-6 py-3 text-right">
                        {isSuperAdmin && r.approval_status === 'submitted'
                          ? <Button size="sm" variant="primary" icon={Check} onClick={() => onApprove(r)}>Approve</Button>
                          : r.approval_status === 'approved'
                            ? <span className="text-xs text-muted">{r.approved_at ? `Approved ${fmtDate(r.approved_at)}` : ''}</span>
                            : r.approval_status === 'draft'
                              ? <span className="text-xs text-muted">Waiting for rep</span>
                              : <span className="text-xs text-muted">Awaiting Marcelo</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-bg-gray/60 font-semibold text-ink">
                    <td className="px-6 py-3">Total {location}</td>
                    <td className="px-4 py-3 text-body font-normal">{rows.reduce((s, r) => s + r.enrolled_count, 0)} enrolled · {rows.reduce((s, r) => s + r.graduate_count, 0)} grad.</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(rows.reduce((s, r) => s + r.total_commission, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700">{money(rows.reduce((s, r) => s + r.total_paid, 0))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(rows.reduce((s, r) => s + r.total_outstanding, 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Payments */}
      <div ref={payRef} className="scroll-mt-4">
        <Card
          title="Commissions to pay"
          subtitle="Paid commissions drop out of what’s left to pay. Earned totals above still include them."
          flush
          actions={
            <div className="flex bg-bg-gray rounded-pill p-1" role="tablist">
              {[['month', `${monthName(month, { month: 'short' })} (${d.unpaid.length})`], ['earlier', `Earlier months (${d.earlier.length})`], ['paid', `Paid (${d.paid.length})`]].map(([k, label]) => (
                <button
                  key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-pill transition ${tab === k ? 'bg-white shadow-card text-ink' : 'text-body hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          {selRows.length > 0 && (
            <div className="mx-6 mb-3 flex flex-wrap items-center gap-3 rounded-[12px] bg-blue-tint border border-blue/20 px-4 py-2.5">
              <span className="text-sm text-ink"><b>{selRows.length}</b> selected · {money(selTotal)}</span>
              <Button size="sm" variant="success" icon={Check} loading={bulkBusy} onClick={bulkPay} className="ml-auto">Mark selected as paid</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
          {sorted.length === 0 ? (
            <EmptyState
              icon={tab === 'paid' ? Wallet : CheckCircle2}
              title={tab === 'paid' ? `Nothing paid yet for ${monthName(month)}` : tab === 'earlier' ? 'No unpaid commissions from earlier months' : `Everything for ${monthName(month)} is paid`}
              text={tab === 'month' && d.inMonth.length === 0 ? 'No records have been entered for this month.' : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="border-y border-border bg-bg-gray/60 text-[11px] uppercase tracking-wide text-muted">
                    <th className="pl-6 pr-2 py-2.5 w-8">
                      {tab !== 'paid' && <input type="checkbox" aria-label="Select all" checked={selected.size > 0 && selected.size === shown.length} onChange={toggleAll} className="accent-[#2381FF]" />}
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold">Student</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{tab === 'earlier' ? 'Month' : 'Type'}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Commission</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Paid</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Left</th>
                    <th className="px-6 py-2.5 text-right font-semibold" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const risk = dupIndex?.[r.id];
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-bg-gray/50">
                        <td className="pl-6 pr-2 py-3">
                          {tab !== 'paid' && <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-[#2381FF]" />}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">{r.name}</span>
                            {risk && risk.risk !== 'repeat' && (
                              <button onClick={() => go('duplicates')} title={risk.reason}>
                                <Badge tone="red" dot={false}><AlertTriangle size={12} /> Possible duplicate</Badge>
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-muted">{r.rep_name}{tab === 'paid' && r.paid_at ? ` · paid ${fmtDate(r.paid_at)}` : ''}</div>
                        </td>
                        <td className="px-4 py-3 text-body">
                          {tab === 'earlier' ? <>{monthName(r.month, { month: 'short', year: 'numeric' })} · <span className="text-muted">{r.is_graduate ? 'grad.' : 'enrolled'}</span></> : (r.is_graduate ? 'Graduate' : 'Enrolled')}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink">{money(r.commission_amount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-green-700">{r.paid_total > 0 ? money(r.paid_total) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-ink">{r.outstanding_amount > OWES ? money(r.outstanding_amount) : '—'}</td>
                        <td className="px-6 py-3 text-right whitespace-nowrap">
                          {tab === 'paid' ? (
                            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => payments.open(r)}>Change</Button>
                          ) : (
                            <>
                              <Button size="sm" variant="soft" onClick={() => payments.open(r)} className="mr-2" title="Record a partial payment">Part pay</Button>
                              <Button size="sm" variant="success" icon={Check} onClick={() => payments.quickPay(r)}>Mark paid</Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {sorted.length > limit && (
            <div className="px-6 py-4 text-center border-t border-border">
              <Button variant="ghost" onClick={() => setLimit((l) => l + 25)}>Show more ({sorted.length - limit} more)</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
