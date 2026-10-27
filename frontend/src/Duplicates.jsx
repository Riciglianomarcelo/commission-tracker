import React from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, Wallet, Trash2, Info } from 'lucide-react';
import { Card, Button, IconButton, Badge, PayBadge, Skeleton, monthName, money } from './ui.jsx';

const RISK = {
  double_paid: { tone: 'red', label: 'Paid more than once' },
  at_risk: { tone: 'amber', label: 'Would be paid twice' },
  repeat: { tone: 'gray', label: 'Entered twice' },
};

export default function Duplicates({ report, loading, onRefresh, payments, onDelete }) {
  if (!report) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>;
  const groups = report.groups;
  const urgent = groups.filter((g) => g.risk !== 'repeat').length;

  return (
    <div className="space-y-6">
      <Card flush>
        <div className="flex flex-wrap items-center gap-4 px-6 py-5">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center ${groups.length ? 'bg-red-soft text-red' : 'bg-green-100 text-green-700'}`}>
            {groups.length ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}
          </span>
          <div className="flex-1 min-w-[240px]">
            <h2 className="text-base font-bold text-ink">
              {groups.length ? `${groups.length} student${groups.length === 1 ? '' : 's'} to check` : 'No double-payment risks found'}
            </h2>
            <p className="text-sm text-body mt-0.5">
              Checked {report.students_checked} commission record{report.students_checked === 1 ? '' : 's'} across {report.months_checked} month{report.months_checked === 1 ? '' : 's'}, all reps and locations
              {groups.length ? ` — ${urgent} need attention before paying.` : ' — every student appears once per kind of commission.'}
            </p>
          </div>
          <Button icon={RefreshCw} loading={loading} onClick={onRefresh}>Check again</Button>
        </div>
        <div className="border-t border-border bg-bg-gray/50 px-6 py-3 flex items-start gap-2 text-xs text-body">
          <Info size={14} className="mt-0.5 shrink-0 text-muted" />
          <p>
            A student normally has one <b>enrolled</b> commission and one later <b>graduate</b> commission — that’s expected and never flagged.
            Alerts only appear when the same person has the <b>same kind</b> of commission more than once (matched by email or name).
            You also get a warning at the moment you try to pay one.
          </p>
        </div>
      </Card>

      {groups.map((g) => {
        const r = RISK[g.risk];
        return (
          <Card key={`${g.match_type}-${g.match_key}`} flush className={g.risk === 'double_paid' ? 'border-red/40' : g.risk === 'at_risk' ? 'border-amber/60' : ''}>
            <div className="px-6 pt-5 pb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-base font-bold text-ink">{g.records[0].name}</h3>
              <Badge tone={r.tone}>{r.label}</Badge>
              <span className="text-xs text-muted">matched by {g.match_type}{g.match_type === 'email' ? ` · ${g.match_key}` : ''}</span>
            </div>
            <p className="px-6 pb-3 text-sm text-body">{g.reason}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-y border-border bg-bg-gray/60 text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-6 py-2 text-left font-semibold">Month</th>
                    <th className="px-4 py-2 text-left font-semibold">Rep</th>
                    <th className="px-4 py-2 text-left font-semibold">Type</th>
                    <th className="px-4 py-2 text-right font-semibold">Commission</th>
                    <th className="px-4 py-2 text-left font-semibold">Payment</th>
                    <th className="px-6 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {g.records.map((rec) => (
                    <tr key={rec.id} className="border-b border-border last:border-0">
                      <td className="px-6 py-3 font-semibold text-ink">{monthName(rec.month)}</td>
                      <td className="px-4 py-3 text-body">{rec.rep_name || '—'} <span className="text-muted">({rec.location})</span></td>
                      <td className="px-4 py-3 text-body">{rec.is_graduate ? 'Graduate' : 'Enrolled'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(rec.commission_amount)}</td>
                      <td className="px-4 py-3"><PayBadge student={rec} /></td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <IconButton icon={Wallet} tone="green" label="Record payment" onClick={() => payments.open(rec)} />
                        {rec.payment_status === 'pending' && <IconButton icon={Trash2} tone="red" label="Delete this record" onClick={() => onDelete(rec)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
