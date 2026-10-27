import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react';

// ---------- formatting ----------

export const money = (n) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const moneyShort = (n) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const monthName = (m, opts = { month: 'long', year: 'numeric' }) => {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', opts);
};

export const shiftMonth = (m, delta) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ---------- shared class strings ----------

export const inputCls =
  'w-full px-3.5 py-2.5 bg-white border border-border rounded-[10px] text-sm text-ink placeholder:text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-blue/40 focus:border-blue transition disabled:bg-bg-gray disabled:text-muted';

export const labelCls = 'block text-xs font-semibold text-body mb-1.5';

// ---------- Button ----------

const BTN = {
  primary: 'bg-blue text-white hover:bg-blue-hover disabled:opacity-50',
  secondary: 'bg-white text-ink border border-border hover:border-blue hover:text-blue disabled:opacity-50',
  ghost: 'bg-transparent text-body hover:bg-bg-gray hover:text-ink disabled:opacity-50',
  danger: 'bg-red text-white hover:opacity-90 disabled:opacity-50',
  success: 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50',
  soft: 'bg-blue-soft text-[#1B5FC7] hover:bg-blue/15 disabled:opacity-50',
};
const BTN_SIZE = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-sm px-6 py-3 gap-2',
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, children, className = '', ...rest }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center font-semibold rounded-pill transition whitespace-nowrap
        disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/50
        ${BTN[variant]} ${BTN_SIZE[size]} ${className}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, tone = 'default', className = '', ...rest }) {
  const tones = {
    default: 'text-body hover:bg-bg-gray hover:text-ink',
    blue: 'text-blue hover:bg-blue-soft',
    green: 'text-green-700 hover:bg-green-100',
    red: 'text-red hover:bg-red-soft',
  };
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={`p-2 rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/50 disabled:opacity-40 ${tones[tone]} ${className}`}
    >
      <Icon size={16} />
    </button>
  );
}

// ---------- Badge ----------

const TONES = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-soft text-[#8A5A00]',
  red: 'bg-red-soft text-[#B42318]',
  blue: 'bg-blue-soft text-[#1B5FC7]',
  gray: 'bg-bg-gray text-body',
};
const DOTS = { green: 'bg-green-600', amber: 'bg-amber', red: 'bg-red', blue: 'bg-blue', gray: 'bg-muted' };

export function Badge({ tone = 'gray', dot = true, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${DOTS[tone]}`} />}
      {children}
    </span>
  );
}

export function PayBadge({ student }) {
  const s = student.payment_status || 'pending';
  if (s === 'paid') return <Badge tone="green">Paid</Badge>;
  if (s === 'partial') {
    return (
      <Badge tone="amber">
        Partial · {moneyShort(student.paid_total)} of {moneyShort(student.commission_amount)}
      </Badge>
    );
  }
  return <Badge tone="gray">Unpaid</Badge>;
}

export function ApprovalBadge({ status }) {
  if (status === 'approved') return <Badge tone="green">Approved</Badge>;
  if (status === 'submitted') return <Badge tone="amber">Awaiting approval</Badge>;
  return <Badge tone="gray">Draft</Badge>;
}

// ---------- Card ----------

export function Card({ title, subtitle, actions, children, className = '', flush = false }) {
  return (
    <section className={`bg-white rounded-card border border-border shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-3">
          <div>
            {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
            {subtitle && <p className="text-sm text-body mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'px-6 pb-6 pt-2'}>{children}</div>
    </section>
  );
}

// ---------- Stat tile ----------

export function Stat({ label, value, sub, tone = 'default', icon: Icon, onClick, children }) {
  const tones = {
    default: 'bg-white border-border',
    blue: 'bg-blue border-blue text-white',
    green: 'bg-white border-border',
    amber: 'bg-white border-border',
  };
  const valueTone = { default: 'text-ink', blue: 'text-white', green: 'text-green-700', amber: 'text-ink' }[tone];
  const labelTone = tone === 'blue' ? 'text-white/80' : 'text-muted';
  const subTone = tone === 'blue' ? 'text-white/80' : 'text-body';
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`text-left rounded-card border shadow-card p-5 ${tones[tone]} ${onClick ? 'hover:shadow-md transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/50' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${labelTone}`}>{label}</p>
        {Icon && <Icon size={16} className={labelTone} />}
      </div>
      <p className={`text-[28px] leading-tight font-extrabold tabular-nums ${valueTone}`}>{value}</p>
      {sub && <p className={`text-xs mt-1.5 ${subTone}`}>{sub}</p>}
      {children}
    </Wrapper>
  );
}

export function ProgressBar({ value, max, tone = 'green' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-pill bg-bg-gray overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-pill transition-all ${tone === 'green' ? 'bg-green-600' : 'bg-blue'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------- Empty / loading ----------

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-bg-gray text-muted flex items-center justify-center mb-4">
          <Icon size={22} />
        </div>
      )}
      <p className="font-semibold text-ink">{title}</p>
      {text && <p className="text-sm text-body mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-border/70 rounded-lg ${className}`} />;
}

// ---------- Modal ----------

export function Modal({ open, title, subtitle, onClose, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div ref={ref} className={`relative w-full ${widths[size]} bg-white sm:rounded-card rounded-t-card shadow-xl max-h-[92vh] flex flex-col`}>
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-ink">{title}</h2>
            {subtitle && <p className="text-sm text-body mt-0.5">{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        <div className="px-6 pb-4 overflow-y-auto">{children}</div>
        {footer && <footer className="px-6 py-4 border-t border-border flex flex-wrap justify-end gap-2">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------- Toasts + confirm dialogs (replace alert()/confirm()) ----------

const UICtx = createContext(null);
export const useUI = () => useContext(UICtx);

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((t) => {
    const id = ++idRef.current;
    const item = typeof t === 'string' ? { title: t } : t;
    setToasts((list) => [...list, { id, tone: 'success', ...item }]);
    setTimeout(() => dismiss(id), item.action ? 8000 : item.tone === 'error' ? 7000 : 4000);
    return id;
  }, [dismiss]);

  const confirm = useCallback((opts) => new Promise((resolve) => setDialog({ ...opts, resolve })), []);
  const answer = (v) => { dialog?.resolve(v); setDialog(null); };

  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  const iconTone = { success: 'text-green-600', error: 'text-red', info: 'text-blue' };

  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.tone] || Info;
          return (
            <div key={t.id} className="bg-ink text-white rounded-[14px] shadow-xl px-4 py-3 flex items-start gap-3">
              <Icon size={18} className={`mt-0.5 shrink-0 ${iconTone[t.tone] || ''}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.text && <p className="text-xs text-white/70 mt-0.5">{t.text}</p>}
              </div>
              {t.action && (
                <button
                  onClick={() => { dismiss(t.id); t.action.onClick(); }}
                  className="text-sm font-bold text-[#7DB5FF] hover:text-white shrink-0"
                >
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-white/60 hover:text-white shrink-0"><X size={16} /></button>
            </div>
          );
        })}
      </div>
      <Modal
        open={!!dialog}
        title={dialog?.title}
        onClose={() => answer(false)}
        size="sm"
        footer={dialog && (
          <>
            <Button variant="secondary" onClick={() => answer(false)}>{dialog.cancelLabel || 'Cancel'}</Button>
            <Button variant={dialog.tone === 'danger' ? 'danger' : 'primary'} onClick={() => answer(true)}>
              {dialog.confirmLabel || 'Confirm'}
            </Button>
          </>
        )}
      >
        {dialog?.message && <div className="text-sm text-body leading-relaxed">{dialog.message}</div>}
      </Modal>
    </UICtx.Provider>
  );
}
