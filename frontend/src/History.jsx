import React from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { Card, ApprovalBadge, EmptyState, money, fmtDate, monthName } from './ui.jsx';

export default function History({ approvals, canManage, repFilter, location, onOpen }) {
  const rows = (approvals || []).filter((a) => !canManage || repFilter === 'all' || String(a.rep_id) === String(repFilter));
  return (
    <Card title="Approval history" subtitle={canManage ? `${location} · every month a rep has submitted` : 'Every month you have submitted'} flush>
      {rows.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="No approvals yet" text="Months show up here once a rep submits them." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-y border-border bg-bg-gray/60 text-[11px] uppercase tracking-wide text-muted">
                <th className="px-6 py-2.5 text-left font-semibold">Month</th>
                {canManage && <th className="px-4 py-2.5 text-left font-semibold">Rep</th>}
                <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Commission</th>
                <th className="px-4 py-2.5 text-left font-semibold">Submitted</th>
                <th className="px-6 py-2.5 text-left font-semibold">Approved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-bg-gray/50">
                  <td className="px-6 py-3">
                    {onOpen ? <button onClick={() => onOpen(a)} className="font-semibold text-ink hover:text-blue">{monthName(a.month)}</button> : <span className="font-semibold">{monthName(a.month)}</span>}
                  </td>
                  {canManage && <td className="px-4 py-3 text-body">{a.rep_name || '—'}</td>}
                  <td className="px-4 py-3"><ApprovalBadge status={a.status} /></td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{money(a.total_commission)}</td>
                  <td className="px-4 py-3 text-body">{fmtDate(a.rep_submitted_at)}</td>
                  <td className="px-6 py-3 text-body">{fmtDate(a.marcelo_approved_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
