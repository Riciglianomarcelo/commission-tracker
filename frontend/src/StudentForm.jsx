import React, { useMemo, useState } from 'react';
import { Modal, Button, inputCls, labelCls, money } from './ui.jsx';

const emptyForm = (isGraduate) => ({
  name: '', program: '', email: '', start_date: '', graduation_date: '',
  tuition_amount: '', commission_percentage: 5, payment_type: 'cash',
  status: isGraduate ? 'graduated' : 'active', month: '', rep_id: '',
});

// One form for adding and editing a record, shown in a dialog so the tables stay uncluttered.
export default function StudentForm({
  mode, isGraduate, student, month, reps, canPickRep, defaultRepId, isSuperAdmin, prefill, onClose, onSubmit,
}) {
  const [f, setF] = useState(() => (mode === 'edit' ? {
    name: student.name, program: student.program, email: student.email || '', start_date: student.start_date,
    graduation_date: student.graduation_date || '', tuition_amount: student.tuition_amount,
    commission_percentage: student.commission_percentage, payment_type: student.payment_type,
    status: student.status, month: student.month, rep_id: student.rep_id ? String(student.rep_id) : '',
  } : { ...emptyForm(isGraduate), month, rep_id: defaultRepId || '', ...(prefill || {}) }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const commission = useMemo(() => {
    const t = parseFloat(f.tuition_amount); const p = parseFloat(f.commission_percentage);
    return Number.isFinite(t) && Number.isFinite(p) ? t * (p / 100) : null;
  }, [f.tuition_amount, f.commission_percentage]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        ...f,
        tuition_amount: parseFloat(f.tuition_amount),
        commission_percentage: parseFloat(f.commission_percentage),
        // An untouched date input is '' which the API rejects — send null instead
        graduation_date: f.graduation_date || null,
        email: f.email || null,
      });
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'edit' ? `Edit ${student.name}` : isGraduate ? 'Add graduate' : 'Add enrolled student';
  const isGrad = mode === 'edit' ? student.is_graduate : isGraduate;

  return (
    <Modal
      open
      size="lg"
      title={title}
      subtitle={mode === 'add' ? (prefill ? 'Pre-filled from the enrolled record — adjust the commission % if needed. The enrolled record stays as it is.' : 'Recorded against the commission month currently selected.') : undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="student-form" loading={saving}>
            {mode === 'edit' ? 'Save changes' : isGrad ? 'Add graduate' : 'Add student'}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {mode === 'add' && canPickRep && (
          <div className="sm:col-span-2">
            <label className={labelCls}>Admissions rep</label>
            <select value={f.rep_id} onChange={set('rep_id')} className={inputCls} required>
              <option value="">Choose a rep…</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.display_name} ({r.location})</option>)}
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>Student name</label>
          <input value={f.name} onChange={set('name')} className={inputCls} required autoFocus />
        </div>
        <div>
          <label className={labelCls}>Program</label>
          <input value={f.program} onChange={set('program')} className={inputCls} placeholder="e.g. ft-ai-engineering-4" required />
        </div>
        {mode === 'add' && (
          <>
            <div>
              <label className={labelCls}>Email <span className="font-normal text-muted">(helps catch duplicates)</span></label>
              <input type="email" value={f.email} onChange={set('email')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Start date</label>
              <input type="date" value={f.start_date} onChange={set('start_date')} className={inputCls} required />
            </div>
          </>
        )}
        <div>
          <label className={labelCls}>{isGrad ? 'Graduation date' : 'Expected graduation date'} {!isGrad && <span className="font-normal text-muted">(optional)</span>}</label>
          <input type="date" value={f.graduation_date} onChange={set('graduation_date')} className={inputCls} required={isGrad && mode === 'add'} />
        </div>
        <div>
          <label className={labelCls}>Payment type</label>
          <select value={f.payment_type} onChange={set('payment_type')} className={inputCls}>
            <option value="cash">Paid in cash</option>
            <option value="financed">Financed</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Tuition (USD)</label>
          <input type="number" step="0.01" min="0" value={f.tuition_amount} onChange={set('tuition_amount')} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Commission %</label>
          <input type="number" step="0.01" min="0" value={f.commission_percentage} onChange={set('commission_percentage')} className={inputCls} required />
        </div>
        {mode === 'edit' && (
          <div>
            <label className={labelCls}>Student status</label>
            <select value={f.status} onChange={set('status')} className={inputCls}>
              <option value="active">Active</option>
              <option value="graduated">Graduated</option>
              <option value="dropped">Dropped</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        )}
        {mode === 'edit' && isSuperAdmin && (
          <div>
            <label className={labelCls}>Commission month <span className="font-normal text-muted">(fix a wrong month)</span></label>
            <input type="month" value={f.month} onChange={set('month')} className={inputCls} />
          </div>
        )}
        {mode === 'edit' && reps.length > 0 && (
          <div className={isSuperAdmin ? '' : 'sm:col-span-1'}>
            <label className={labelCls}>Admissions rep</label>
            <select value={f.rep_id} onChange={set('rep_id')} className={inputCls}>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.display_name} ({r.location})</option>)}
            </select>
          </div>
        )}
        <div className="sm:col-span-2 rounded-[12px] bg-blue-tint border border-blue/20 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-body">Commission for this record</span>
          <span className="text-lg font-extrabold text-blue tabular-nums">{commission === null ? '—' : money(commission)}</span>
        </div>
      </form>
    </Modal>
  );
}
