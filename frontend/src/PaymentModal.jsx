import React, { useEffect, useState } from 'react';
import { AlertTriangle, Wallet, CircleDashed, CheckCircle2, PieChart } from 'lucide-react';
import { Modal, Button, Badge, inputCls, labelCls, money, monthName, fmtDate } from './ui.jsx';
import { duplicateWarning, errMsg } from './api.js';

const MODES = [
  { key: 'paid', label: 'Paid in full', hint: 'The whole commission has been paid', icon: CheckCircle2 },
  { key: 'partial', label: 'Partly paid', hint: 'Part of it has been paid so far', icon: PieChart },
  { key: 'pending', label: 'Not paid', hint: 'Nothing paid yet (undo a payment)', icon: CircleDashed },
];

// Records a payout on one commission. If the same student was already paid for the same
// kind of commission in another month, the server answers 409 and we show the match(es)
// and make the user explicitly confirm before anything is recorded.
export default function PaymentModal({ student, warning: initialWarning, api, onClose, onSaved }) {
  const [mode, setMode] = useState('paid');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState(initialWarning || null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!student) return;
    setWarning(initialWarning || null);
    setError('');
    if (student.payment_status === 'partial') {
      setMode('partial');
      setAmount(student.paid_total ? String(student.paid_total) : '');
    } else if (student.payment_status === 'paid') {
      setMode('paid');
      setAmount('');
    } else {
      setMode('paid');
      setAmount('');
    }
  }, [student?.id]);

  if (!student) return null;
  const commission = student.commission_amount || 0;
  const amt = parseFloat(amount);
  const partialLeft = Number.isFinite(amt) ? Math.max(commission - amt, 0) : null;
  const partialInvalid = mode === 'partial' && !(amt > 0 && amt < commission);

  const save = async (confirmDuplicate = false) => {
    setSaving(true);
    setError('');
    try {
      const updated = await api.post(`/students/${student.id}/payment`, {
        payment_status: mode,
        paid_amount: mode === 'partial' ? amt : null,
        confirm_duplicate: confirmDuplicate,
      });
      onSaved(updated, student, confirmDuplicate);
    } catch (e) {
      if (e.handled) return;
      const w = duplicateWarning(e);
      if (w) setWarning(w); else setError(errMsg(e, 'Could not record the payment'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Record payment"
      subtitle={`${student.name} · ${student.is_graduate ? 'graduation' : 'enrollment'} commission · ${monthName(student.month)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {warning ? (
            <Button variant="danger" loading={saving} onClick={() => save(true)}>I checked — record anyway</Button>
          ) : (
            <Button variant="primary" loading={saving} disabled={partialInvalid} onClick={() => save(false)}>Save payment</Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3 mb-5 text-center">
        <div className="bg-bg-gray rounded-[12px] py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Commission</p>
          <p className="font-bold text-ink tabular-nums">{money(commission)}</p>
        </div>
        <div className="bg-bg-gray rounded-[12px] py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Paid so far</p>
          <p className="font-bold text-green-700 tabular-nums">{money(student.paid_total)}</p>
        </div>
        <div className="bg-bg-gray rounded-[12px] py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Left</p>
          <p className="font-bold text-ink tabular-nums">{money(student.outstanding_amount)}</p>
        </div>
      </div>

      {warning && (
        <div className="mb-5 rounded-[12px] border border-red/30 bg-red-soft p-4" role="alert">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-red mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-[#B42318] text-sm">Possible double payment</p>
              <p className="text-sm text-[#7A271A] mt-1">{warning.message}</p>
              <ul className="mt-3 space-y-1.5">
                {(warning.matches || []).map((m) => (
                  <li key={m.id} className="text-sm text-ink bg-white/70 rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{monthName(m.month)}</span>
                    <span className="text-body">{m.rep_name || 'rep'}</span>
                    <Badge tone={m.payment_status === 'paid' ? 'green' : 'amber'}>
                      {m.payment_status === 'paid' ? 'Paid' : 'Partial'} {money(m.paid_total)}
                    </Badge>
                    {m.paid_at && <span className="text-xs text-muted">on {fmtDate(m.paid_at)}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-[#7A271A] mt-3">
                If this is the same commission, don't pay it again — cancel and delete the repeated record instead.
                Only continue if this is genuinely a different commission.
              </p>
            </div>
          </div>
        </div>
      )}

      <fieldset className="space-y-2" disabled={saving}>
        <legend className={labelCls}>Payment status</legend>
        {MODES.map(({ key, label, hint, icon: Icon }) => (
          <label
            key={key}
            className={`flex items-center gap-3 rounded-[12px] border px-4 py-3 cursor-pointer transition
              ${mode === key ? 'border-blue bg-blue-tint' : 'border-border hover:border-blue/50'}`}
          >
            <input type="radio" name="pay-mode" checked={mode === key} onChange={() => setMode(key)} className="accent-[#2381FF]" />
            <Icon size={18} className={mode === key ? 'text-blue' : 'text-muted'} />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-ink">{label}</span>
              <span className="block text-xs text-body">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {mode === 'partial' && (
        <div className="mt-4">
          <label className={labelCls} htmlFor="paid-amount">Total paid so far (USD)</label>
          <div className="relative">
            <Wallet size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="paid-amount"
              type="number"
              step="0.01"
              min="0.01"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Less than ${money(commission)}`}
              className={`${inputCls} pl-10`}
            />
          </div>
          {partialLeft !== null && amt > 0 && (
            <p className={`text-xs mt-1.5 ${partialInvalid ? 'text-red' : 'text-body'}`}>
              {partialInvalid ? `Must be more than $0 and less than ${money(commission)}.` : `${money(partialLeft)} will still be left to pay.`}
            </p>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red" role="alert">{error}</p>}
    </Modal>
  );
}
