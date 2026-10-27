import React from 'react';
import { Clock, CheckCircle2, Send } from 'lucide-react';
import { Card, Stat, Button, ProgressBar, Skeleton, money, monthName, ApprovalBadge } from './ui.jsx';

// Rep's own month: where it stands in the approval flow, and what has been paid.
export default function MyMonth({ report, month, submitting, onSubmit, hasRecords }) {
  if (!report) return <Skeleton className="h-64" />;
  const st = report.approval_status;
  const steps = [
    { label: 'You submit', done: st === 'submitted' || st === 'approved', icon: Send },
    { label: 'Marcelo approves', done: st === 'approved', icon: CheckCircle2 },
    { label: 'Commission paid', done: report.total_commission > 0 && report.total_outstanding <= 0.005, icon: Clock },
  ];
  return (
    <div className="space-y-6">
      <Card title={`Your ${monthName(month)} commission`} actions={<ApprovalBadge status={st} />}>
        <ol className="flex items-start">
          {steps.map((s, i) => (
            <li key={s.label} className="flex-1 flex flex-col items-center text-center relative">
              {i > 0 && <span className={`absolute top-5 right-1/2 w-full h-0.5 -z-0 ${steps[i - 1].done ? 'bg-blue' : 'bg-border'}`} />}
              <span className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ${s.done ? 'bg-blue text-white' : 'bg-bg-gray text-muted'}`}><s.icon size={18} /></span>
              <span className="text-xs font-semibold text-ink mt-2">{s.label}</span>
            </li>
          ))}
        </ol>
        {st === 'draft' && (
          <Button variant="primary" size="lg" className="w-full mt-6" loading={submitting} disabled={!hasRecords} onClick={onSubmit} icon={Send}>
            Submit {monthName(month)} for approval
          </Button>
        )}
        {st === 'draft' && !hasRecords && <p className="text-xs text-muted text-center mt-2">Add at least one student first.</p>}
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Earned this month" value={money(report.total_commission)} sub={`${report.enrolled_count} enrolled · ${report.graduate_count} graduates`} />
        <Stat label="Paid to you" value={money(report.total_paid)} tone="green">
          <div className="mt-3"><ProgressBar value={report.total_paid} max={report.total_commission} /></div>
        </Stat>
        <Stat label="Still to be paid" value={money(report.total_outstanding)} tone="blue" />
      </div>
    </div>
  );
}
