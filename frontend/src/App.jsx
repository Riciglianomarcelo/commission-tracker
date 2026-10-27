import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import {
  LayoutDashboard, Users as UsersIcon, GraduationCap, AlertTriangle, BarChart3, History as HistoryIcon,
  Settings, ClipboardList, KeyRound, LogOut, ChevronLeft, ChevronRight, Download, ChevronDown,
} from 'lucide-react';
import './App.css';
import logo4geeks from './assets/4geeks-logo.svg';
import Dashboard from './Dashboard.jsx';
import Users from './Users.jsx';
import Overview from './Overview.jsx';
import Records from './Records.jsx';
import Duplicates from './Duplicates.jsx';
import MyMonth from './MyMonth.jsx';
import History from './History.jsx';
import PaymentModal from './PaymentModal.jsx';
import StudentForm from './StudentForm.jsx';
import { API_BASE, authHeader, makeApi, errMsg, reportError, duplicateWarning } from './api.js';
import {
  UIProvider, useUI, Button, IconButton, Modal, Badge, inputCls, labelCls,
  money, monthName, shiftMonth, thisMonth,
} from './ui.jsx';

const LOCATIONS = ['USA', 'LATAM'];
const readStored = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};
const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } };

// Which controls each screen needs in the top bar
const NAV = {
  overview: { label: 'Overview', icon: LayoutDashboard, roles: ['manager'], ctx: { loc: true, month: true }, sub: 'Where the month stands and what needs you' },
  mymonth: { label: 'My month', icon: ClipboardList, roles: ['rep'], ctx: { month: true }, sub: 'Your commission and approval status' },
  enrolled: { label: 'Enrolled', icon: UsersIcon, roles: ['manager', 'rep'], ctx: { loc: true, month: true }, sub: 'Students who enrolled this month' },
  graduates: { label: 'Graduates', icon: GraduationCap, roles: ['manager', 'rep'], ctx: { loc: true, month: true }, sub: 'Students who graduated this month' },
  duplicates: { label: 'Duplicates', icon: AlertTriangle, roles: ['manager'], ctx: {}, sub: 'Catch double payments before they happen' },
  trends: { label: 'Trends', icon: BarChart3, roles: ['manager'], ctx: { loc: true }, sub: 'Commission over time, by rep, program and more' },
  history: { label: 'History', icon: HistoryIcon, roles: ['manager', 'rep'], ctx: { loc: true }, sub: 'Approvals month by month' },
  users: { label: 'Users', icon: Settings, roles: ['super'], ctx: {}, sub: 'Create reps and manage accounts' },
};
const SECTIONS = [
  ['This month', ['overview', 'mymonth', 'enrolled', 'graduates']],
  ['Insights', ['duplicates', 'trends', 'history']],
  ['Admin', ['users']],
];

const roleLabel = { ADMISSIONS_REP: 'Admissions rep', ADMIN: 'Reviewer', MARCELO: 'Super admin' };

export default function App() {
  return (
    <UIProvider>
      <Shell />
    </UIProvider>
  );
}

function Shell() {
  const ui = useUI();

  // ---------- session ----------
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!readStored('access_token', ''));
  const [user, setUser] = useState(null);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // ---------- context shared by every screen ----------
  const [view, setView] = useState(null);
  const [month, setMonth] = useState(() => readStored('viewMonth', thisMonth()));
  const [location, setLocation] = useState(() => readStored('viewLocation', 'USA'));
  const [repFilter, setRepFilter] = useState('all');

  // ---------- data ----------
  const [allUsers, setAllUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [report, setReport] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [repRows, setRepRows] = useState(null);
  const [dupReport, setDupReport] = useState(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [approvals, setApprovals] = useState([]);

  // ---------- dialogs ----------
  const [payTarget, setPayTarget] = useState(null); // { student, warning }
  const [formState, setFormState] = useState(null); // { mode, isGraduate, student?, prefill? }
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isRep = user?.role === 'ADMISSIONS_REP';
  const canManage = user?.role === 'ADMIN' || user?.role === 'MARCELO';
  const isSuperAdmin = user?.role === 'MARCELO';
  // The super admin reviews and pays; reps (and the reviewer) are the ones who enter students
  const canAdd = !!user && user.role !== 'MARCELO';

  const handleLogout = () => {
    try { localStorage.removeItem('access_token'); localStorage.removeItem('user'); } catch { /* ignore */ }
    setIsLoggedIn(false);
    setUser(null);
    setView(null);
    setStudents([]); setReport(null); setPortfolio(null); setRepRows(null); setDupReport(null); setApprovals([]); setAllUsers([]);
    setRepFilter('all');
  };

  // A 401 means the session expired: log out cleanly instead of leaving a broken screen
  const api = useMemo(() => makeApi((err) => {
    if (err?.response?.status === 401) {
      handleLogout();
      setLoginError('Your session expired — please sign in again.');
      return true;
    }
    return false;
  }), []);

  const reps = useMemo(() => allUsers.filter((u) => u.role === 'ADMISSIONS_REP'), [allUsers]);
  const locationReps = useMemo(() => reps.filter((r) => r.location === location), [reps, location]);
  const activeLocationReps = locationReps.filter((r) => r.is_active);

  const allowedViews = useMemo(() => {
    const role = isRep ? 'rep' : isSuperAdmin ? 'super' : 'manager';
    return Object.keys(NAV).filter((k) => NAV[k].roles.includes(role) || (role === 'super' && NAV[k].roles.includes('manager')));
  }, [isRep, isSuperAdmin]);

  // ---------- loaders ----------
  const scope = () => {
    if (!canManage) return '';
    return `&location=${location}${repFilter !== 'all' ? `&rep_id=${repFilter}` : ''}`;
  };

  const loadProfile = async () => {
    try {
      const me = await api.get('/auth/me');
      setUser(me);
      return me;
    } catch (e) { return null; }
  };

  const loadMonth = async () => {
    if (!user) return;
    setLoadingStudents(true);
    try {
      const jobs = [api.get(`/students?month=${month}${scope()}`).then(setStudents)];
      if (isRep) jobs.push(api.get(`/reports/monthly/${month}`).then(setReport));
      if (canManage) jobs.push(api.get(`/approvals/month/${month}?location=${location}`).then(setRepRows));
      await Promise.all(jobs);
    } catch (e) { reportError(ui.toast, e, 'Could not load this month'); } finally { setLoadingStudents(false); }
  };
  const loadPortfolio = async () => {
    if (!canManage) return;
    try { setPortfolio(await api.get(`/dashboard/data?location=${location}`)); } catch (e) { reportError(ui.toast, e, 'Could not load the overview'); }
  };
  const loadDuplicates = async () => {
    if (!canManage) return;
    setDupLoading(true);
    try { setDupReport(await api.get('/students/duplicates')); } catch (e) { reportError(ui.toast, e, 'Could not run the duplicate check'); } finally { setDupLoading(false); }
  };
  const loadUsers = async () => {
    if (!canManage) return;
    try { setAllUsers(await api.get('/users')); } catch (e) { if (!e.handled) console.error(e); }
  };
  const loadApprovals = async () => {
    try { setApprovals(await api.get(`/approvals/history${canManage ? `?location=${location}` : ''}`)); } catch (e) { if (!e.handled) console.error(e); }
  };

  const refreshAll = () => { loadMonth(); loadPortfolio(); loadDuplicates(); if (view === 'history') loadApprovals(); };

  // restore session
  useEffect(() => { if (isLoggedIn && !user) loadProfile().then((me) => { if (!me) setIsLoggedIn(!!readStored('access_token', '')); }); }, []);

  // choose the landing screen once we know who this is: managers land on the Overview
  useEffect(() => {
    if (!user || view) return;
    const fromHash = window.location.hash.replace(/^#\/?/, '');
    setView(allowedViews.includes(fromHash) ? fromHash : isRep ? 'enrolled' : 'overview');
  }, [user, allowedViews]);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#\/?/, '');
      if (allowedViews.includes(h)) setView(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [allowedViews]);

  useEffect(() => { if (user) { loadUsers(); loadDuplicates(); } }, [user?.id]);
  useEffect(() => { if (user) loadMonth(); }, [user?.id, month, location, repFilter]);
  useEffect(() => { if (user) { setPortfolio(null); loadPortfolio(); } }, [user?.id, location]);
  useEffect(() => { if (user && view === 'history') loadApprovals(); }, [user?.id, view, location]);
  useEffect(() => { store('viewMonth', month); }, [month]);
  useEffect(() => { store('viewLocation', location); }, [location]);

  // ---------- navigation ----------
  const go = (v, opts = {}) => {
    if (opts.location) setLocation(opts.location);
    if (opts.rep !== undefined) setRepFilter(opts.rep);
    if (opts.month) setMonth(opts.month);
    setView(v);
    window.location.hash = `/${v}`;
    window.scrollTo({ top: 0 });
  };

  // ---------- auth ----------
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const res = await axios.post(`${API_BASE}/auth/login`, credentials);
      localStorage.setItem('access_token', res.data.access_token);
      setCredentials({ username: '', password: '' });
      setView(null);
      setRepFilter('all');
      const me = await loadProfile();
      if (me) setIsLoggedIn(true);
    } catch (err) {
      setLoginError(errMsg(err, 'Sign-in failed'));
    } finally {
      setLoggingIn(false);
    }
  };

  // ---------- payments ----------
  const undoTo = async (prev) => {
    try {
      const partial = prev.payment_status === 'partial' && prev.paid_total > 0;
      await api.post(`/students/${prev.id}/payment`, {
        payment_status: partial || prev.payment_status === 'paid' ? prev.payment_status : 'pending',
        paid_amount: partial ? prev.paid_total : null,
        confirm_duplicate: true,
      });
      ui.toast({ tone: 'info', title: `Undid the payment for ${prev.name}` });
      refreshAll();
    } catch (e) { reportError(ui.toast, e, 'Could not undo'); }
  };

  const describePayment = (u) => (u.payment_status === 'paid' ? 'marked paid' : u.payment_status === 'partial' ? `partly paid (${money(u.paid_total)})` : 'marked unpaid');

  const payments = {
    open: (student, warning) => setPayTarget({ student, warning }),
    quickPay: async (student) => {
      try {
        const u = await api.post(`/students/${student.id}/payment`, { payment_status: 'paid' });
        refreshAll();
        ui.toast({ title: `${student.name} marked paid`, text: `${money(u.paid_total - student.paid_total)} recorded`, action: { label: 'Undo', onClick: () => undoTo(student) } });
      } catch (e) {
        const w = duplicateWarning(e);
        if (w) setPayTarget({ student, warning: w }); else reportError(ui.toast, e, 'Could not record the payment');
      }
    },
  };

  const onPaymentSaved = (updated, prev, confirmed) => {
    setPayTarget(null);
    refreshAll();
    ui.toast({
      title: `${updated.name} ${describePayment(updated)}`,
      text: confirmed ? 'Recorded after the double-payment warning' : undefined,
      action: { label: 'Undo', onClick: () => undoTo(prev) },
    });
  };

  // ---------- records ----------
  const submitForm = async (f) => {
    const st = formState;
    try {
      if (st.mode === 'add') {
        const repId = canManage ? Number(f.rep_id) : null;
        if (canManage && !repId) { ui.toast({ tone: 'error', title: 'Choose which admissions rep this record belongs to.' }); return; }
        const { rep_id, status, ...rest } = f;
        await api.post('/students', { ...rest, status: st.isGraduate ? 'graduated' : 'active', is_graduate: st.isGraduate, month, ...(canManage ? { rep_id: repId } : {}) });
        ui.toast({ title: `${f.name} added`, action: st.prefill ? { label: 'View graduates', onClick: () => go('graduates') } : undefined });
      } else {
        const s = st.student;
        const payload = {
          name: f.name, program: f.program, tuition_amount: f.tuition_amount, commission_percentage: f.commission_percentage,
          payment_type: f.payment_type, status: f.status, graduation_date: f.graduation_date,
        };
        const moved = isSuperAdmin && f.month && f.month !== s.month ? f.month : null;
        const newRep = f.rep_id && Number(f.rep_id) !== s.rep_id ? Number(f.rep_id) : null;
        if (moved) payload.month = moved;
        if (newRep) payload.rep_id = newRep;
        const res = await api.patch(`/students/${s.id}`, payload);
        if (moved || newRep) {
          ui.toast({
            title: `${s.name} moved ${[moved && `to ${monthName(moved)}`, newRep && `to ${res.rep_name}`].filter(Boolean).join(' and ')}`,
            action: moved ? { label: `Go to ${monthName(moved, { month: 'short', year: 'numeric' })}`, onClick: () => go(view, { month: moved }) } : undefined,
          });
        } else ui.toast({ title: 'Changes saved' });
      }
      setFormState(null);
      refreshAll();
    } catch (e) { reportError(ui.toast, e, 'Could not save'); }
  };

  const startGraduate = (s) => {
    setFormState({
      mode: 'add', isGraduate: true,
      prefill: {
        name: s.name, program: s.program, email: s.email || '', start_date: s.start_date, tuition_amount: s.tuition_amount,
        commission_percentage: 2, payment_type: s.payment_type, graduation_date: s.graduation_date || new Date().toISOString().slice(0, 10),
        rep_id: s.rep_id ? String(s.rep_id) : '',
      },
    });
  };

  const deleteRecord = async (s) => {
    const ok = await ui.confirm({
      title: `Delete ${s.name}?`,
      message: <>This removes the {s.is_graduate ? 'graduate' : 'enrolled'} record for <b>{monthName(s.month)}</b> ({money(s.commission_amount)} commission)
        {s.payment_status !== 'pending' && <> — it is currently marked <b>{s.payment_status}</b></>}. This can’t be undone.</>,
      confirmLabel: 'Delete record', tone: 'danger',
    });
    if (!ok) return;
    try { await api.del(`/students/${s.id}`); ui.toast({ title: `${s.name} deleted` }); refreshAll(); } catch (e) { reportError(ui.toast, e, 'Could not delete'); }
  };

  const approve = async (row) => {
    const ok = await ui.confirm({
      title: `Approve ${row.rep_name}’s ${monthName(month)}?`,
      message: <>{money(row.total_commission)} earned · {money(row.total_paid)} already paid · <b>{money(row.total_outstanding)} left to pay</b>.</>,
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    try {
      await api.post('/approvals/approve', { month, rep_id: row.rep_id });
      ui.toast({ title: `${row.rep_name}’s ${monthName(month)} approved` });
      refreshAll();
    } catch (e) { reportError(ui.toast, e, 'Could not approve'); }
  };

  const submitMonth = async () => {
    setSubmitting(true);
    try {
      await api.post('/approvals/submit', { month });
      ui.toast({ title: `${monthName(month)} submitted for approval` });
      refreshAll();
    } catch (e) { reportError(ui.toast, e, 'Could not submit'); } finally { setSubmitting(false); }
  };

  const exportCSV = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Rep', 'Location', 'Student', 'Email', 'Program', 'Type', 'Month', 'Tuition', 'Commission %', 'Commission', 'Payment', 'Paid', 'Left to pay', 'Student status'];
    const rows = students.map((s) => [
      s.rep_name, s.location, s.name, s.email, s.program, s.is_graduate ? 'Graduate' : 'Enrolled', s.month, s.tuition_amount.toFixed(2),
      s.commission_percentage, s.commission_amount.toFixed(2), s.payment_status, (s.paid_total || 0).toFixed(2), (s.outstanding_amount || 0).toFixed(2), s.status,
    ]);
    const blob = new Blob([[head, ...rows].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `commission_${month}${canManage ? `_${location}` : `_${user?.username || ''}`}.csv`;
    a.click();
  };

  // ---------- derived ----------
  const dupIndex = useMemo(() => {
    const idx = {};
    (dupReport?.groups || []).forEach((g) => {
      const enrolled = g.records.filter((r) => !r.is_graduate).length;
      const grads = g.records.length - enrolled;
      g.records.forEach((r) => { if ((r.is_graduate ? grads : enrolled) >= 2) idx[r.id] = { risk: g.risk, reason: g.reason }; });
    });
    return idx;
  }, [dupReport]);
  const alertCount = (dupReport?.groups || []).filter((g) => g.risk !== 'repeat').length;
  const alertTotal = dupReport?.groups?.length || 0;

  const enrolledRows = students.filter((s) => !s.is_graduate);
  const gradRows = students.filter((s) => s.is_graduate);
  const showRepColumn = canManage && repFilter === 'all';

  const formReps = formState?.mode === 'edit' ? reps.filter((r) => r.is_active || r.id === formState.student.rep_id) : activeLocationReps;
  const defaultRepId = repFilter !== 'all' ? repFilter : activeLocationReps.length === 1 ? String(activeLocationReps[0].id) : '';

  // ======================= RENDER =======================

  if (!isLoggedIn || !user) {
    if (isLoggedIn && !loginError) {
      return (
        <div className="min-h-screen bg-bg-gray flex flex-col items-center justify-center gap-3 text-sm text-muted">
          Loading…
          <button onClick={handleLogout} className="text-blue font-semibold hover:underline">Taking too long? Sign in again</button>
        </div>
      );
    }
    return <LoginScreen credentials={credentials} setCredentials={setCredentials} error={loginError} loading={loggingIn} onSubmit={handleLogin} />;
  }

  const cur = NAV[view] || NAV.overview;
  const badge = { duplicates: alertTotal ? { n: alertTotal, tone: alertCount ? 'red' : 'gray' } : null, enrolled: enrolledRows.length ? { n: enrolledRows.length, tone: 'gray' } : null, graduates: gradRows.length ? { n: gradRows.length, tone: 'gray' } : null };

  return (
    <div className="min-h-screen bg-bg-gray lg:flex">
      {/* ----- sidebar (top strip on small screens) ----- */}
      <aside className="bg-white border-b lg:border-b-0 lg:border-r border-border lg:w-60 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center gap-3 px-5 py-4 lg:py-6">
          <img src={logo4geeks} alt="4Geeks Academy" className="h-5" />
          <span className="text-sm font-extrabold text-ink tracking-tight">Commissions</span>
        </div>
        <nav className="px-3 pb-3 lg:pb-6 flex lg:flex-col gap-1 lg:gap-0.5 overflow-x-auto" aria-label="Main">
          {SECTIONS.map(([title, keys]) => {
            const items = keys.filter((k) => allowedViews.includes(k));
            if (!items.length) return null;
            return (
              <React.Fragment key={title}>
                <p className="hidden lg:block px-3 pt-4 pb-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted">{title}</p>
                {items.map((k) => {
                  const n = NAV[k]; const Icon = n.icon; const active = view === k; const b = badge[k];
                  return (
                    <button
                      key={k}
                      onClick={() => go(k)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-semibold whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/50
                        ${active ? 'bg-blue-soft text-[#1B5FC7]' : 'text-body hover:bg-bg-gray hover:text-ink'}`}
                    >
                      <Icon size={18} />
                      <span className="flex-1 text-left">{n.label}</span>
                      {b && (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-pill ${b.tone === 'red' ? 'bg-red text-white' : 'bg-bg-gray text-body'}`}>{b.n}</span>
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {/* ----- context bar ----- */}
        <header className="sticky top-0 z-30 bg-bg-gray/95 backdrop-blur border-b border-border">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="mr-auto min-w-[180px]">
              <h1 className="text-xl font-extrabold text-ink leading-tight">{cur.label}</h1>
              <p className="text-xs text-body">{cur.sub}</p>
            </div>

            {canManage && cur.ctx.loc && (
              <>
                <div className="flex bg-white border border-border rounded-pill p-1 shadow-card" role="group" aria-label="Location">
                  {LOCATIONS.map((loc) => (
                    <button
                      key={loc}
                      aria-pressed={location === loc}
                      onClick={() => { setLocation(loc); setRepFilter('all'); }}
                      className={`px-4 py-1.5 text-sm font-bold rounded-pill transition ${location === loc ? 'bg-blue text-white' : 'text-body hover:text-ink'}`}
                    >{loc}</button>
                  ))}
                </div>
                <select
                  value={repFilter}
                  onChange={(e) => setRepFilter(e.target.value)}
                  aria-label="Admissions rep"
                  className={`${inputCls} !w-auto !py-2 !rounded-pill shadow-card`}
                >
                  <option value="all">All {location} reps</option>
                  {locationReps.map((r) => <option key={r.id} value={r.id}>{r.display_name}{r.is_active ? '' : ' (inactive)'}</option>)}
                </select>
              </>
            )}

            {cur.ctx.month && <MonthStepper month={month} setMonth={setMonth} />}

            {(view === 'enrolled' || view === 'graduates') && students.length > 0 && (
              <Button icon={Download} onClick={exportCSV}>Export</Button>
            )}

            <UserMenu user={user} onPassword={() => setShowPassword(true)} onLogout={handleLogout} isRep={isRep} />
          </div>
        </header>

        {/* ----- screen ----- */}
        <main className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {view === 'overview' && canManage && (
            <Overview
              month={month} location={location} repFilter={repFilter} portfolio={portfolio} repRows={repRows}
              dupReport={dupReport} dupIndex={dupIndex} isSuperAdmin={isSuperAdmin} canAdd={canAdd}
              go={go} onApprove={approve} onGraduate={startGraduate} payments={payments} api={api} onChanged={refreshAll}
            />
          )}

          {view === 'mymonth' && isRep && (
            <MyMonth report={report} month={month} submitting={submitting} onSubmit={submitMonth} hasRecords={students.length > 0} />
          )}

          {(view === 'enrolled' || view === 'graduates') && (
            <Records
              key={view}
              isGraduate={view === 'graduates'}
              rows={view === 'graduates' ? gradRows : enrolledRows}
              loading={loadingStudents} month={month}
              canManage={canManage} canAdd={canAdd} showRepColumn={showRepColumn} dupIndex={dupIndex}
              onAdd={() => setFormState({ mode: 'add', isGraduate: view === 'graduates' })}
              onEdit={(s) => setFormState({ mode: 'edit', isGraduate: s.is_graduate, student: s })}
              onDelete={deleteRecord}
              onMarkGraduate={startGraduate}
              onPay={(s) => payments.open(s)}
            />
          )}

          {view === 'duplicates' && canManage && (
            <Duplicates report={dupReport} loading={dupLoading} onRefresh={loadDuplicates} payments={payments} onDelete={deleteRecord} />
          )}

          {view === 'trends' && canManage && (
            <Dashboard apiBase={API_BASE} getAuthHeader={authHeader} onAuthError={(e) => api && e?.response?.status === 401 && (handleLogout(), true)} location={location} repFilter={repFilter} />
          )}

          {view === 'history' && (
            <History
              approvals={approvals} canManage={canManage} repFilter={repFilter} location={location}
              onOpen={canManage ? (a) => go('overview', { month: a.month, rep: String(a.rep_id) }) : undefined}
            />
          )}

          {view === 'users' && isSuperAdmin && (
            <Users
              apiBase={API_BASE} getAuthHeader={authHeader}
              onAuthError={(e) => e?.response?.status === 401 && (handleLogout(), true)}
              users={allUsers} currentUserId={user?.id} onChanged={loadUsers}
              getErrorMessage={errMsg}
            />
          )}
        </main>
      </div>

      {payTarget && (
        <PaymentModal student={payTarget.student} warning={payTarget.warning} api={api} onClose={() => setPayTarget(null)} onSaved={onPaymentSaved} />
      )}
      {formState && (
        <StudentForm
          mode={formState.mode} isGraduate={formState.isGraduate} student={formState.student} prefill={formState.prefill}
          month={month} reps={formReps} canPickRep={canManage} defaultRepId={defaultRepId} isSuperAdmin={isSuperAdmin}
          onClose={() => setFormState(null)} onSubmit={submitForm}
        />
      )}
      {showPassword && <PasswordModal api={api} onClose={() => setShowPassword(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function MonthStepper({ month, setMonth }) {
  const ref = useRef(null);
  return (
    <div className="inline-flex items-center bg-white border border-border rounded-pill shadow-card">
      <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="!rounded-pill" />
      <label className="relative px-2 min-w-[130px] text-center text-sm font-bold text-ink cursor-pointer">
        {monthName(month)}
        <input
          ref={ref} type="month" value={month} aria-label="Commission month"
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="absolute inset-0 opacity-0 cursor-pointer w-full"
        />
      </label>
      <IconButton icon={ChevronRight} label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className="!rounded-pill" />
      {month !== thisMonth() && (
        <button onClick={() => setMonth(thisMonth())} className="mr-2 ml-1 text-xs font-semibold text-blue hover:underline">Today</button>
      )}
    </div>
  );
}

function UserMenu({ user, onPassword, onLogout, isRep }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const name = user.display_name || user.username;
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-2 bg-white border border-border rounded-pill shadow-card pl-1.5 pr-3 py-1.5 hover:border-blue transition"
      >
        <span className="w-8 h-8 rounded-full bg-blue text-white text-xs font-bold flex items-center justify-center">{initials}</span>
        <span className="text-left hidden sm:block leading-tight">
          <span className="block text-sm font-semibold text-ink">{name}</span>
          <span className="block text-[11px] text-muted">{roleLabel[user.role] || user.role}{isRep ? ` · ${user.location}` : ''}</span>
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 bg-white border border-border rounded-[14px] shadow-xl p-1.5 z-40">
          <button role="menuitem" onClick={() => { setOpen(false); onPassword(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-ink rounded-lg hover:bg-bg-gray">
            <KeyRound size={16} className="text-muted" /> Change password
          </button>
          <button role="menuitem" onClick={() => { setOpen(false); onLogout(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-ink rounded-lg hover:bg-bg-gray">
            <LogOut size={16} className="text-muted" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function PasswordModal({ api, onClose }) {
  const ui = useUI();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (f.next !== f.confirm) { setError('The new password and its confirmation don’t match.'); return; }
    if (f.next.length < 6) { setError('Use at least 6 characters.'); return; }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { current_password: f.current, new_password: f.next });
      ui.toast({ title: 'Password updated' });
      onClose();
    } catch (err) { if (!err.handled) setError(errMsg(err, 'Could not change the password')); } finally { setSaving(false); }
  };
  return (
    <Modal
      open size="sm" title="Change password" subtitle="Update the password for your account." onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="pw-form" loading={saving}>Save</Button></>}
    >
      <form id="pw-form" onSubmit={submit} className="space-y-4">
        {[['current', 'Current password', 'current-password'], ['next', 'New password', 'new-password'], ['confirm', 'Confirm new password', 'new-password']].map(([k, label, ac]) => (
          <div key={k}>
            <label className={labelCls}>{label}</label>
            <input type="password" autoComplete={ac} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={inputCls} required autoFocus={k === 'current'} />
          </div>
        ))}
        {error && <p className="text-sm text-red" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

function LoginScreen({ credentials, setCredentials, error, loading, onSubmit }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-navy text-white p-12">
        <img src={logo4geeks} alt="4Geeks Academy" className="h-6 invert brightness-200" />
        <div>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white">Every commission,<br />reviewed, approved<br />and paid once.</h2>
          <p className="mt-4 text-white/70 max-w-sm">Track enrollments and graduations, approve each rep’s month, and see exactly what’s been paid and what’s left.</p>
        </div>
        <p className="text-xs text-white/50">4Geeks Academy · Commission Tracker</p>
      </div>
      <div className="flex items-center justify-center bg-bg-gray p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-card border border-border shadow-card p-8">
          <img src={logo4geeks} alt="4Geeks Academy" className="h-6 mb-6 lg:hidden" />
          <h1 className="text-2xl font-extrabold text-ink">Sign in</h1>
          <p className="text-sm text-body mt-1 mb-6">Use your username or email.</p>
          {error && <div className="bg-red-soft border border-red/20 text-[#B42318] px-4 py-3 rounded-[10px] mb-4 text-sm" role="alert">{error}</div>}
          <label className={labelCls} htmlFor="u">Username or email</label>
          <input id="u" name="username" autoComplete="username" value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} className={`${inputCls} mb-4`} required autoFocus />
          <label className={labelCls} htmlFor="p">Password</label>
          <input id="p" type="password" name="password" autoComplete="current-password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} className={`${inputCls} mb-6`} required />
          <Button variant="primary" size="lg" type="submit" loading={loading} className="w-full">Sign in</Button>
        </form>
      </div>
    </div>
  );
}
