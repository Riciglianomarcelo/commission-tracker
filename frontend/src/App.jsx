import React, { useState, useEffect, useMemo } from 'react';
import { LogOut, Download, Trash2, Pencil, Check, X, CheckCircle2, Clock, KeyRound, GraduationCap } from 'lucide-react';
import axios from 'axios';
import './App.css';
import logo4geeks from './assets/4geeks-logo.svg';
import Dashboard from './Dashboard.jsx';
import Users from './Users.jsx';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
const LOCATIONS = ['USA', 'LATAM'];

// FastAPI error bodies aren't always a plain string (422 validation errors come back
// as an array of {loc, msg, type} objects). Rendering a non-string directly in JSX
// crashes the whole page, so always coerce to a safe string first.
const getErrorMessage = (err, fallback = 'Something went wrong') => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d))).join(', ');
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  return err?.message || fallback;
};

const fmt = (n) => `$${(n || 0).toFixed(2)}`;
const readStored = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};

const emptyForm = (isGraduate = false) => ({
  name: '',
  program: '',
  start_date: '',
  graduation_date: '',
  tuition_amount: '',
  commission_percentage: 5,
  payment_type: 'cash',
  status: isGraduate ? 'graduated' : 'active',
  email: '',
  rep_id: '',
});

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null); // full profile from /auth/me
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('enrolled');
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));

  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [students, setStudents] = useState([]);
  const [report, setReport] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [repRows, setRepRows] = useState([]); // per-rep status for the month (managers)
  const [allUsers, setAllUsers] = useState([]);

  const isRep = user?.role === 'ADMISSIONS_REP';
  // Only Admin/Marcelo can edit or delete (enforced here and on the backend)
  const canManage = user?.role === 'ADMIN' || user?.role === 'MARCELO';
  // Super admin (Marcelo) can additionally move a record to another month and manage users
  const isSuperAdmin = user?.role === 'MARCELO';

  // Managers look at one location at a time (USA or LATAM), optionally one rep
  const [viewLocation, setViewLocation] = useState(() => readStored('viewLocation', 'USA'));
  const [viewRep, setViewRep] = useState('all');

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  // Shown after a record is moved out of the month/location being viewed
  const [notice, setNotice] = useState(null);

  // Change password modal — any logged-in user can change their own password
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [formData, setFormData] = useState(emptyForm());

  const reps = useMemo(() => allUsers.filter((u) => u.role === 'ADMISSIONS_REP'), [allUsers]);
  const locationReps = useMemo(() => reps.filter((r) => r.location === viewLocation), [reps, viewLocation]);
  const activeLocationReps = locationReps.filter((r) => r.is_active);

  const getAuthHeader = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem('access_token')}`,
    }
  });

  // Query params that scope data to what a manager is looking at (reps are scoped server-side)
  const scopeParams = () => {
    if (!canManage) return '';
    const p = new URLSearchParams({ location: viewLocation });
    if (viewRep !== 'all') p.set('rep_id', viewRep);
    return `&${p.toString()}`;
  };

  const loadProfile = async () => {
    try {
      const res = await axios.get(`${API_BASE}/auth/me`, getAuthHeader());
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
      return res.data;
    } catch (err) {
      handleAuthError(err);
      return null;
    }
  };

  // Restore session
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      setIsLoggedIn(true);
      loadProfile();
    }
  }, []);

  // Load users list for managers (rep pickers, Users tab)
  useEffect(() => {
    if (isLoggedIn && canManage) loadUsers();
  }, [isLoggedIn, canManage]);

  // Reload whenever what we're looking at changes
  useEffect(() => {
    if (isLoggedIn && user) {
      loadStudents();
      loadReport();
      if (canManage) loadRepRows();
      if (activeTab === 'history') loadApprovals();
    }
  }, [currentMonth, viewLocation, viewRep, isLoggedIn, user?.id]);

  useEffect(() => {
    try { localStorage.setItem('viewLocation', viewLocation); } catch { /* ignore */ }
  }, [viewLocation]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE}/auth/login`, credentials);
      localStorage.setItem('access_token', response.data.access_token);
      setCredentials({ username: '', password: '' });
      const profile = await loadProfile();
      if (profile) {
        setIsLoggedIn(true);
        setActiveTab('enrolled');
        setViewRep('all');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setIsLoggedIn(false);
    setUser(null);
    setStudents([]);
    setReport(null);
    setApprovals([]);
    setRepRows([]);
    setAllUsers([]);
  };

  // If a request comes back 401 (expired/invalid session), log the user out cleanly
  // instead of leaving them stuck on a broken dashboard with a cryptic error.
  // Returns true if it handled the error (caller should stop), false otherwise.
  const handleAuthError = (err) => {
    if (err?.response?.status === 401) {
      handleLogout();
      setError('Your session expired — please log in again.');
      return true;
    }
    return false;
  };

  const loadUsers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/users`, getAuthHeader());
      setAllUsers(res.data);
    } catch (err) {
      if (!handleAuthError(err)) console.error('Error loading users:', err);
    }
  };

  const loadStudents = async () => {
    try {
      const response = await axios.get(`${API_BASE}/students?month=${currentMonth}${scopeParams()}`, getAuthHeader());
      setStudents(response.data);
    } catch (err) {
      if (!handleAuthError(err)) console.error('Error loading students:', err);
    }
  };

  const loadReport = async () => {
    try {
      const qs = scopeParams().replace(/^&/, '?');
      const response = await axios.get(`${API_BASE}/reports/monthly/${currentMonth}${qs}`, getAuthHeader());
      setReport(response.data);
    } catch (err) {
      if (!handleAuthError(err)) console.error('Error loading reports:', err);
    }
  };

  const loadRepRows = async () => {
    try {
      const res = await axios.get(`${API_BASE}/approvals/month/${currentMonth}?location=${viewLocation}`, getAuthHeader());
      setRepRows(res.data);
    } catch (err) {
      if (!handleAuthError(err)) console.error('Error loading rep approvals:', err);
    }
  };

  const loadApprovals = async () => {
    try {
      const qs = canManage ? `?location=${viewLocation}` : '';
      const response = await axios.get(`${API_BASE}/approvals/history${qs}`, getAuthHeader());
      setApprovals(response.data);
    } catch (err) {
      if (!handleAuthError(err)) console.error('Error loading approvals:', err);
    }
  };

  const refreshAll = () => {
    loadStudents();
    loadReport();
    if (canManage) loadRepRows();
  };

  // For managers adding a record: the rep being viewed, or the only rep in the location
  const defaultRepId = () => (viewRep !== 'all' ? viewRep : activeLocationReps.length === 1 ? String(activeLocationReps[0].id) : '');

  const handleAddStudent = async (e, isGraduate) => {
    e.preventDefault();
    setError('');

    const repId = canManage ? (formData.rep_id || defaultRepId()) : null;
    if (canManage && !repId) {
      setError('Choose which admissions rep this record belongs to.');
      return;
    }

    setLoading(true);
    try {
      const { rep_id, ...rest } = formData;
      const payload = {
        ...rest,
        is_graduate: isGraduate,
        month: currentMonth,
        tuition_amount: parseFloat(formData.tuition_amount),
        commission_percentage: parseFloat(formData.commission_percentage),
        // Optional date field — the backend expects either a real date or nothing at
        // all, but an empty string from the untouched input is neither, so it must
        // be converted to null before it ever reaches the API.
        graduation_date: formData.graduation_date || null,
        email: formData.email || null,
        ...(canManage ? { rep_id: Number(repId) } : {}),
      };

      await axios.post(`${API_BASE}/students`, payload, getAuthHeader());
      setFormData({ ...emptyForm(isGraduate), rep_id: formData.rep_id });
      refreshAll();
    } catch (err) {
      if (!handleAuthError(err)) setError(getErrorMessage(err, 'Error adding student'));
    } finally {
      setLoading(false);
    }
  };

  const openPasswordModal = () => {
    setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    setPasswordError('');
    setPasswordSuccess('');
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('New password and confirmation do not match');
      return;
    }
    if (passwordForm.new_password.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    setPasswordLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/change-password`, {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      }, getAuthHeader());

      setPasswordSuccess('Password updated successfully');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      if (!handleAuthError(err)) setPasswordError(getErrorMessage(err, 'Error changing password'));
    } finally {
      setPasswordLoading(false);
    }
  };

  // Moves an existing enrolled record into the Graduates tab in place, instead of
  // requiring it to be re-entered from scratch on the Add Graduate form.
  const handleMarkGraduate = async (student) => {
    if (!student.graduation_date) {
      setError(`Set a graduation date for ${student.name} first (click the pencil to edit), then mark them as a graduate.`);
      return;
    }
    if (!confirm(`Move ${student.name} to Graduates?`)) return;

    try {
      await axios.patch(`${API_BASE}/students/${student.id}`, { is_graduate: true, status: 'graduated' }, getAuthHeader());
      refreshAll();
    } catch (err) {
      if (!handleAuthError(err)) setError(getErrorMessage(err, 'Error marking student as graduate'));
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!confirm('Delete this student record?')) return;

    try {
      await axios.delete(`${API_BASE}/students/${id}`, getAuthHeader());
      refreshAll();
    } catch (err) {
      if (!handleAuthError(err)) setError(getErrorMessage(err, 'Error deleting student'));
    }
  };

  const startEdit = (student) => {
    setEditingId(student.id);
    setEditForm({
      name: student.name,
      program: student.program,
      tuition_amount: student.tuition_amount,
      commission_percentage: student.commission_percentage,
      payment_type: student.payment_type,
      status: student.status,
      graduation_date: student.graduation_date || '',
      month: student.month,
      rep_id: student.rep_id ? String(student.rep_id) : '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id) => {
    setError('');
    setNotice(null);
    try {
      const student = students.find((s) => s.id === id);
      const movedTo = isSuperAdmin && editForm.month && editForm.month !== student?.month ? editForm.month : null;
      const newRep = editForm.rep_id && Number(editForm.rep_id) !== student?.rep_id ? Number(editForm.rep_id) : null;
      const { month, rep_id, ...rest } = editForm;
      const payload = {
        ...rest,
        ...(movedTo ? { month: movedTo } : {}),
        ...(newRep ? { rep_id: newRep } : {}),
        tuition_amount: parseFloat(editForm.tuition_amount),
        commission_percentage: parseFloat(editForm.commission_percentage),
        // Same rule as adding a student: an untouched date input is an empty
        // string, which the backend rejects — send null instead when it's blank.
        graduation_date: editForm.graduation_date || null,
      };
      const res = await axios.patch(`${API_BASE}/students/${id}`, payload, getAuthHeader());
      const parts = [];
      if (movedTo) parts.push(`from ${student.month} to ${movedTo}`);
      if (newRep) parts.push(`to ${res.data.rep_name} (${res.data.location})`);
      if (parts.length) {
        const leftLocation = newRep && res.data.location !== viewLocation ? res.data.location : null;
        setNotice({ text: `${student.name} was moved ${parts.join(' and ')}.`, month: movedTo, location: leftLocation });
      }
      cancelEdit();
      refreshAll();
    } catch (err) {
      if (!handleAuthError(err)) setError(getErrorMessage(err, 'Error updating student'));
    }
  };

  const handleSubmitForApproval = async () => {
    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_BASE}/approvals/submit`, { month: currentMonth }, getAuthHeader());
      loadReport();
      loadApprovals();
      alert(`Submitted for approval: ${currentMonth}`);
    } catch (err) {
      if (!handleAuthError(err)) setError(getErrorMessage(err, 'Error submitting'));
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (row) => {
    if (!confirm(`Approve ${row.rep_name}'s commission for ${currentMonth} (${fmt(row.total_commission)})?`)) return;
    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_BASE}/approvals/approve`, { month: currentMonth, rep_id: row.rep_id }, getAuthHeader());
      loadReport();
      loadRepRows();
      loadApprovals();
    } catch (err) {
      if (!handleAuthError(err)) setError(getErrorMessage(err, 'Error approving'));
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Rep', 'Location', 'Name', 'Program', 'Start Date', 'Tuition', 'Commission %', 'Commission', 'Status', 'Type'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = students.map(s => [
      s.rep_name,
      s.location,
      s.name,
      s.program,
      s.start_date,
      s.tuition_amount.toFixed(2),
      s.commission_percentage,
      s.commission_amount.toFixed(2),
      s.status,
      s.is_graduate ? 'Graduate' : 'Enrolled',
    ]);

    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const repSlug = viewRep !== 'all' ? `_${reps.find((r) => String(r.id) === viewRep)?.username || viewRep}` : '';
    const scope = canManage ? `_${viewLocation}${repSlug}` : `_${user?.username || ''}`;
    a.download = `commission_${currentMonth}${scope}.csv`;
    a.click();
  };

  const inputClass = "px-4 py-2.5 border border-border rounded-[10px] text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent transition";
  const primaryBtn = "bg-blue hover:bg-blue-hover text-white font-semibold py-2.5 px-6 rounded-pill transition disabled:opacity-50 disabled:cursor-not-allowed";
  const secondaryBtn = "bg-white border border-border hover:border-blue text-ink font-semibold py-2.5 px-6 rounded-pill transition";

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-bg-gray flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-card border border-border shadow-card p-10">
            <img src={logo4geeks} alt="4Geeks Academy" className="h-7 mx-auto mb-6" />
            <h1 className="text-[28px] font-extrabold text-ink mb-1 text-center">Commission Tracker</h1>
            <p className="text-center text-body text-sm mb-8">Sign in to manage monthly commissions</p>

            {error && (
              <div className="bg-red-soft border border-red/20 text-red px-4 py-3 rounded-[10px] mb-4 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">Username</label>
                <input
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value.trim().toLowerCase() })}
                  className={`w-full ${inputClass}`}
                  autoCapitalize="none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-2">Password</label>
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  className={`w-full ${inputClass}`}
                  required
                />
              </div>

              <button type="submit" disabled={loading} className={`w-full ${primaryBtn}`}>
                {loading ? 'Signing in...' : 'Log in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const enrolled = students.filter(s => !s.is_graduate);
  const graduates = students.filter(s => s.is_graduate);
  const showRepColumn = canManage && viewRep === 'all';
  const viewedRepName = viewRep !== 'all' ? reps.find((r) => String(r.id) === viewRep)?.display_name : null;
  const roleLabel = { ADMISSIONS_REP: 'Admissions Rep', ADMIN: 'Admin', MARCELO: 'Super Admin' }[user?.role] || user?.role;

  const tabs = [
    'enrolled', 'graduates', 'summary', 'history',
    ...(canManage ? ['dashboard'] : []),
    ...(isSuperAdmin ? ['users'] : []),
  ];
  const tabLabels = { enrolled: 'Enrolled Students', graduates: 'Graduates', summary: 'Summary', history: 'History', dashboard: 'Dashboard', users: 'Users' };

  const statusBadge = (status) => (
    <span className={`px-2.5 py-1 rounded-pill text-xs font-semibold ${
      status === 'approved' ? 'bg-green-100 text-green-700' :
      status === 'submitted' ? 'bg-amber-soft text-amber' :
      'bg-bg-gray text-body'
    }`}>
      {status}
    </span>
  );

  // ---------- Add form (shared by Enrolled and Graduates) ----------
  const renderAddForm = (isGraduate) => (
    <div className="bg-white rounded-card border border-border shadow-card p-6">
      <h2 className="text-lg font-bold text-ink mb-4">{isGraduate ? 'Add Graduate' : 'Add Enrolled Student'}</h2>
      <form onSubmit={(e) => handleAddStudent(e, isGraduate)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {canManage && (
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-muted mb-1.5">Admissions rep ({viewLocation})</label>
            <select
              value={formData.rep_id || defaultRepId()}
              onChange={(e) => setFormData({ ...formData, rep_id: e.target.value })}
              className={`w-full ${inputClass}`}
              required
            >
              <option value="">Choose a rep…</option>
              {activeLocationReps.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
            </select>
          </div>
        )}
        <input
          type="text"
          placeholder="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={inputClass}
          required
        />
        <input
          type="text"
          placeholder={isGraduate ? 'Program' : 'Program (e.g., ft-ai-engineering-4)'}
          value={formData.program}
          onChange={(e) => setFormData({ ...formData, program: e.target.value })}
          className={inputClass}
          required
        />
        <input
          type="email"
          placeholder={isGraduate ? 'Email' : 'Email (for duplicate prevention)'}
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className={inputClass}
        />
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">Start Date</label>
          <input
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            className={`w-full ${inputClass}`}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">{isGraduate ? 'Graduation Date' : 'Expected Graduation Date (optional)'}</label>
          <input
            type="date"
            value={formData.graduation_date}
            onChange={(e) => setFormData({ ...formData, graduation_date: e.target.value })}
            className={`w-full ${inputClass}`}
            required={isGraduate}
          />
        </div>
        <input
          type="number"
          step="0.01"
          placeholder="Tuition Amount"
          value={formData.tuition_amount}
          onChange={(e) => setFormData({ ...formData, tuition_amount: e.target.value })}
          className={inputClass}
          required
        />
        <input
          type="number"
          step="0.01"
          placeholder="Commission %"
          value={formData.commission_percentage}
          onChange={(e) => setFormData({ ...formData, commission_percentage: e.target.value })}
          className={inputClass}
          required
        />
        <select
          value={formData.payment_type}
          onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
          className={inputClass}
        >
          <option value="cash">Paid Cash</option>
          <option value="financed">Financed</option>
          <option value="other">Other</option>
        </select>

        <button type="submit" disabled={loading} className={`md:col-span-2 ${primaryBtn}`}>
          {loading ? 'Adding...' : isGraduate ? '+ Add Graduate' : '+ Add Student'}
        </button>
      </form>
    </div>
  );

  // ---------- Records table (shared by Enrolled and Graduates) ----------
  const renderTable = (rows, isGraduate) => (
    <div className="bg-white rounded-card border border-border shadow-card p-6">
      <h2 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
        {isGraduate ? 'Graduates' : 'Enrolled Students'}
        <span className="text-xs bg-blue-soft text-blue px-2.5 py-1 rounded-pill font-semibold">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted text-center py-8 text-sm">{isGraduate ? 'No graduates yet' : 'No enrolled students yet'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {showRepColumn && <th className="text-left px-4 py-2 font-semibold text-ink">Rep</th>}
                <th className="text-left px-4 py-2 font-semibold text-ink">Name</th>
                <th className="text-left px-4 py-2 font-semibold text-ink">Program</th>
                <th className="text-left px-4 py-2 font-semibold text-ink">{isGraduate ? 'Grad Date' : 'Expected Graduation'}</th>
                <th className="text-left px-4 py-2 font-semibold text-ink">Tuition</th>
                <th className="text-left px-4 py-2 font-semibold text-ink">Commission</th>
                {!isGraduate && <th className="text-left px-4 py-2 font-semibold text-ink">Status</th>}
                <th className="text-center px-4 py-2 font-semibold text-ink">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(student => (
                editingId === student.id ? (
                  <tr key={student.id} className="border-b border-border bg-blue-tint align-top">
                    {showRepColumn && <td className="px-4 py-2 text-body text-xs pt-5">{student.rep_name}</td>}
                    <td className="px-4 py-2">
                      <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={`w-full ${inputClass}`} />
                      {isSuperAdmin && (
                        <label className="block mt-2">
                          <span className="block text-[11px] font-semibold text-muted mb-1">Commission month</span>
                          <input type="month" value={editForm.month} onChange={(e) => setEditForm({ ...editForm, month: e.target.value })} className={`w-full ${inputClass}`} />
                        </label>
                      )}
                      <label className="block mt-2">
                        <span className="block text-[11px] font-semibold text-muted mb-1">Rep</span>
                        <select value={editForm.rep_id} onChange={(e) => setEditForm({ ...editForm, rep_id: e.target.value })} className={`w-full ${inputClass}`}>
                          {LOCATIONS.map((loc) => (
                            <optgroup key={loc} label={loc}>
                              {reps.filter((r) => r.location === loc && (r.is_active || String(r.id) === editForm.rep_id)).map((r) => (
                                <option key={r.id} value={r.id}>{r.display_name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                    </td>
                    <td className="px-4 py-2">
                      <input value={editForm.program} onChange={(e) => setEditForm({ ...editForm, program: e.target.value })} className={`w-full ${inputClass}`} />
                    </td>
                    <td className="px-4 py-2">
                      <input type="date" value={editForm.graduation_date} onChange={(e) => setEditForm({ ...editForm, graduation_date: e.target.value })} className={`w-full ${inputClass}`} />
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" step="0.01" value={editForm.tuition_amount} onChange={(e) => setEditForm({ ...editForm, tuition_amount: e.target.value })} className={`w-full ${inputClass}`} />
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" step="0.01" value={editForm.commission_percentage} onChange={(e) => setEditForm({ ...editForm, commission_percentage: e.target.value })} className={`w-24 ${inputClass}`} />
                      <span className="text-xs text-muted ml-1">%</span>
                    </td>
                    {!isGraduate && (
                      <td className="px-4 py-2">
                        <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className={inputClass}>
                          <option value="active">Active</option>
                          <option value="graduated">Graduated</option>
                          <option value="dropped">Dropped</option>
                          <option value="pending">Pending</option>
                        </select>
                      </td>
                    )}
                    <td className="px-4 py-3 text-center whitespace-nowrap pt-5">
                      <button onClick={() => saveEdit(student.id)} className="text-blue hover:opacity-70 transition mr-3" title="Save"><Check size={16} /></button>
                      <button onClick={cancelEdit} className="text-muted hover:opacity-70 transition" title="Cancel"><X size={16} /></button>
                    </td>
                  </tr>
                ) : (
                  <tr key={student.id} className="border-b border-border hover:bg-bg-gray">
                    {showRepColumn && <td className="px-4 py-3 text-body">{student.rep_name || '—'}</td>}
                    <td className="px-4 py-3 text-ink">{student.name}</td>
                    <td className="px-4 py-3 text-body">{student.program}</td>
                    <td className="px-4 py-3 text-body">{student.graduation_date || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{fmt(student.tuition_amount)}</td>
                    <td className="px-4 py-3 font-semibold text-blue">{fmt(student.commission_amount)}</td>
                    {!isGraduate && (
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-pill text-xs font-semibold ${
                          student.status === 'active' ? 'bg-green-100 text-green-700' :
                          student.status === 'graduated' ? 'bg-blue-soft text-blue' :
                          'bg-red-soft text-red'
                        }`}>
                          {student.status}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {canManage ? (
                        <>
                          {!isGraduate && (
                            <button onClick={() => handleMarkGraduate(student)} className="text-blue hover:opacity-70 transition mr-3" title="Mark as Graduate">
                              <GraduationCap size={16} />
                            </button>
                          )}
                          <button onClick={() => startEdit(student)} className="text-blue hover:opacity-70 transition mr-3" title="Edit">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => handleDeleteStudent(student.id)} className="text-red hover:opacity-70 transition" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const summaryCards = report && (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-card border border-border shadow-card p-6">
        <p className="text-xs text-muted font-semibold uppercase tracking-wide mb-2">Total Enrolled Students</p>
        <p className="text-3xl font-extrabold text-ink">{report.enrolled_count}</p>
      </div>
      <div className="bg-white rounded-card border border-border shadow-card p-6">
        <p className="text-xs text-muted font-semibold uppercase tracking-wide mb-2">Total Graduates</p>
        <p className="text-3xl font-extrabold text-ink">{report.graduate_count}</p>
      </div>
      <div className="bg-white rounded-card border border-border shadow-card p-6">
        <p className="text-xs text-muted font-semibold uppercase tracking-wide mb-2">Enrolled Tuition</p>
        <p className="text-3xl font-extrabold text-ink">{fmt(report.total_enrolled_tuition)}</p>
      </div>
      <div className="bg-blue-soft rounded-card p-6">
        <p className="text-xs text-blue font-semibold uppercase tracking-wide mb-2">Enrolled Commission</p>
        <p className="text-3xl font-extrabold text-blue">{fmt(report.total_enrolled_commission)}</p>
      </div>
      <div className="bg-white rounded-card border border-border shadow-card p-6">
        <p className="text-xs text-muted font-semibold uppercase tracking-wide mb-2">Graduate Tuition</p>
        <p className="text-3xl font-extrabold text-ink">{fmt(report.total_graduate_tuition)}</p>
      </div>
      <div className="bg-blue-soft rounded-card p-6">
        <p className="text-xs text-blue font-semibold uppercase tracking-wide mb-2">Graduate Commission</p>
        <p className="text-3xl font-extrabold text-blue">{fmt(report.total_graduate_commission)}</p>
      </div>
      <div className="md:col-span-2 bg-blue rounded-card p-6">
        <p className="text-xs text-white/80 font-semibold uppercase tracking-wide mb-2">
          Total Commission{canManage ? ` — ${viewLocation}${viewedRepName ? ` · ${viewedRepName}` : ''}` : ''}
        </p>
        <p className="text-4xl font-extrabold text-white">{fmt(report.total_commission)}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-gray">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center gap-4">
          <div>
            <img src={logo4geeks} alt="4Geeks Academy" className="h-5 mb-2" />
            <h1 className="text-2xl font-extrabold text-ink">Commission Tracker</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted">Logged in as</p>
              <p className="font-semibold text-ink text-sm">{user?.display_name || user?.username}</p>
              <p className="text-xs text-body">{roleLabel}{isRep ? ` · ${user?.location}` : ''}</p>
            </div>
            <button onClick={openPasswordModal} className={`${secondaryBtn} flex items-center gap-2 !py-2 !px-4`} title="Change Password">
              <KeyRound size={16} />
              <span className="hidden md:inline">Change Password</span>
            </button>
            <button onClick={handleLogout} className={`${secondaryBtn} flex items-center gap-2 !py-2 !px-4`} title="Logout">
              <LogOut size={16} />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-card border border-border shadow-card p-8 w-full max-w-sm">
            <h2 className="text-lg font-bold text-ink mb-1">Change Password</h2>
            <p className="text-sm text-body mb-6">Update the password for your account.</p>

            {passwordError && (
              <div className="bg-red-soft border border-red/20 text-red px-4 py-3 rounded-[10px] mb-4 text-sm">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="bg-green-100 border border-green-700/20 text-green-700 px-4 py-3 rounded-[10px] mb-4 text-sm">
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">Current Password</label>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                  className={`w-full ${inputClass}`}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">New Password</label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  className={`w-full ${inputClass}`}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  className={`w-full ${inputClass}`}
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closePasswordModal} className={`flex-1 ${secondaryBtn}`}>Close</button>
                <button type="submit" disabled={passwordLoading} className={`flex-1 ${primaryBtn}`}>
                  {passwordLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Location switch — managers see USA and LATAM separately */}
        {canManage && activeTab !== 'users' && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex bg-white border border-border rounded-pill p-1 shadow-card" role="tablist" aria-label="Location">
              {LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  role="tab"
                  aria-selected={viewLocation === loc}
                  onClick={() => { setViewLocation(loc); setViewRep('all'); setFormData((f) => ({ ...f, rep_id: '' })); }}
                  className={`px-6 py-2 text-sm font-bold rounded-pill transition ${viewLocation === loc ? 'bg-blue text-white' : 'text-body hover:text-ink'}`}
                >
                  {loc}
                </button>
              ))}
            </div>
            <select
              value={viewRep}
              onChange={(e) => { setViewRep(e.target.value); setFormData((f) => ({ ...f, rep_id: '' })); }}
              className={`${inputClass} !py-2 bg-white`}
              aria-label="Rep"
            >
              <option value="all">All {viewLocation} reps</option>
              {locationReps.map((r) => (
                <option key={r.id} value={r.id}>{r.display_name}{r.is_active ? '' : ' (inactive)'}</option>
              ))}
            </select>
            {locationReps.length === 0 && (
              <span className="text-xs text-body">No {viewLocation} reps yet{isSuperAdmin ? ' — add them in the Users tab.' : '.'}</span>
            )}
          </div>
        )}

        {/* Month Selector */}
        {activeTab !== 'dashboard' && activeTab !== 'users' && (
          <div className="bg-white rounded-card border border-border shadow-card p-4 mb-6 flex flex-wrap gap-4 justify-between items-center">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Commission Month</label>
                <input
                  type="month"
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(e.target.value)}
                  className={inputClass}
                />
              </div>
              <p className="text-xs text-body max-w-xs hidden md:block">
                {isRep
                  ? 'Students you add are recorded against this month for your commission.'
                  : 'New students you add are recorded against this month for commission reporting.'}
              </p>
            </div>
            <button onClick={exportCSV} className={`${secondaryBtn} flex items-center gap-2 !py-2 !px-4`}>
              <Download size={16} />
              Export CSV
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-soft border border-red/20 text-red px-4 py-3 rounded-[10px] mb-4 text-sm flex justify-between items-center">
            {error}
            <button onClick={() => setError('')} className="font-semibold">✕</button>
          </div>
        )}

        {notice && (
          <div className="bg-blue-soft border border-blue/20 text-ink px-4 py-3 rounded-[10px] mb-4 text-sm flex justify-between items-center gap-4">
            <span>{notice.text}</span>
            <span className="flex items-center gap-4 whitespace-nowrap">
              {(notice.month || notice.location) && (
                <button
                  onClick={() => {
                    if (notice.month) setCurrentMonth(notice.month);
                    if (notice.location) { setViewLocation(notice.location); setViewRep('all'); }
                    setNotice(null);
                  }}
                  className="font-semibold text-blue"
                >
                  Go to {[notice.location, notice.month].filter(Boolean).join(' · ')}
                </button>
              )}
              <button onClick={() => setNotice(null)} className="font-semibold">✕</button>
            </span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'history') loadApprovals();
                if (tab === 'summary' && canManage) loadRepRows();
                if (tab === 'users') loadUsers();
              }}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === tab
                  ? 'border-blue text-blue'
                  : 'border-transparent text-body hover:text-ink'
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* Enrolled Tab */}
        {activeTab === 'enrolled' && (
          <div className="space-y-6">
            {renderAddForm(false)}
            {renderTable(enrolled, false)}
          </div>
        )}

        {/* Graduates Tab */}
        {activeTab === 'graduates' && (
          <div className="space-y-6">
            {renderAddForm(true)}
            {renderTable(graduates, true)}
          </div>
        )}

        {/* Summary Tab — reps: their own workflow */}
        {activeTab === 'summary' && isRep && report && (
          <div className="space-y-6">
            <div className="bg-white rounded-card border border-border shadow-card p-6">
              <h2 className="text-lg font-bold text-ink mb-6">Approval Workflow</h2>
              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    report.approval_status === 'submitted' || report.approval_status === 'approved'
                      ? 'bg-blue text-white'
                      : 'bg-bg-gray text-muted'
                  }`}>
                    <Clock size={20} />
                  </div>
                  <p className="font-semibold text-ink text-sm">Rep</p>
                  <p className="text-xs text-body">Submitted</p>
                </div>

                <div className={`flex-1 h-0.5 mx-4 ${report.approval_status === 'approved' ? 'bg-blue' : 'bg-border'}`}></div>

                <div className="text-center flex-1">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    report.approval_status === 'approved'
                      ? 'bg-blue text-white'
                      : 'bg-bg-gray text-muted'
                  }`}>
                    <CheckCircle2 size={20} />
                  </div>
                  <p className="font-semibold text-ink text-sm">Marcelo</p>
                  <p className="text-xs text-body">Approved</p>
                </div>
              </div>

              {report.approval_status === 'draft' && (
                <button
                  onClick={handleSubmitForApproval}
                  disabled={loading || students.length === 0}
                  className={`w-full mt-6 ${primaryBtn}`}
                >
                  Submit for Approval
                </button>
              )}
            </div>
            {summaryCards}
          </div>
        )}

        {/* Summary Tab — managers: per-rep review for the location */}
        {activeTab === 'summary' && canManage && (
          <div className="space-y-6">
            <div className="bg-white rounded-card border border-border shadow-card p-6">
              <h2 className="text-lg font-bold text-ink mb-1">{viewLocation} rep approvals — {currentMonth}</h2>
              <p className="text-sm text-body mb-4">Each rep submits their own month. {isSuperAdmin ? 'Approve each one once reviewed.' : 'Marcelo gives final approval.'}</p>
              {repRows.length === 0 ? (
                <p className="text-muted text-center py-8 text-sm">No {viewLocation} reps yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 font-semibold text-ink">Rep</th>
                        <th className="text-right px-4 py-2 font-semibold text-ink">Enrolled</th>
                        <th className="text-right px-4 py-2 font-semibold text-ink">Graduates</th>
                        <th className="text-right px-4 py-2 font-semibold text-ink">Tuition</th>
                        <th className="text-right px-4 py-2 font-semibold text-ink">Commission</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Status</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Submitted</th>
                        <th className="text-right px-4 py-2 font-semibold text-ink">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repRows.map((row) => (
                        <tr key={row.rep_id} className={`border-b border-border hover:bg-bg-gray ${String(row.rep_id) === viewRep ? 'bg-blue-tint' : ''}`}>
                          <td className="px-4 py-3">
                            <button onClick={() => { setViewRep(String(row.rep_id)); setActiveTab('enrolled'); }} className="font-semibold text-ink hover:text-blue text-left" title="See this rep's records">
                              {row.rep_name}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-body">{row.enrolled_count}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-body">{row.graduate_count}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">{fmt(row.total_tuition)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue">{fmt(row.total_commission)}</td>
                          <td className="px-4 py-3">{statusBadge(row.approval_status)}</td>
                          <td className="px-4 py-3 text-body text-xs">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {isSuperAdmin && row.approval_status === 'submitted' ? (
                              <button onClick={() => handleApprove(row)} disabled={loading} className={`${primaryBtn} !py-1.5 !px-4 text-xs`}>Approve</button>
                            ) : row.approval_status === 'approved' ? (
                              <span className="text-xs text-green-700 font-semibold">Approved {row.approved_at ? new Date(row.approved_at).toLocaleDateString() : ''}</span>
                            ) : row.approval_status === 'draft' ? (
                              <span className="text-xs text-muted">Waiting for rep</span>
                            ) : (
                              <span className="text-xs text-muted">Awaiting Marcelo</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <td className="px-4 py-3 text-ink">Total {viewLocation}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{repRows.reduce((s, r) => s + r.enrolled_count, 0)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{repRows.reduce((s, r) => s + r.graduate_count, 0)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(repRows.reduce((s, r) => s + r.total_tuition, 0))}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-blue">{fmt(repRows.reduce((s, r) => s + r.total_commission, 0))}</td>
                        <td colSpan={3} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {summaryCards}
          </div>
        )}

        {/* Dashboard Tab — all months, not tied to the month selector */}
        {activeTab === 'dashboard' && canManage && (
          <Dashboard
            apiBase={API_BASE}
            getAuthHeader={getAuthHeader}
            onAuthError={handleAuthError}
            location={viewLocation}
            repFilter={viewRep}
          />
        )}

        {/* Users Tab — super admin only */}
        {activeTab === 'users' && isSuperAdmin && (
          <Users
            apiBase={API_BASE}
            getAuthHeader={getAuthHeader}
            onAuthError={handleAuthError}
            users={allUsers}
            currentUserId={user?.id}
            onChanged={loadUsers}
            getErrorMessage={getErrorMessage}
          />
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-card border border-border shadow-card p-6">
            <h2 className="text-lg font-bold text-ink mb-4">Approval History{canManage ? ` — ${viewLocation}${viewedRepName ? ` · ${viewedRepName}` : ''}` : ''}</h2>
            {approvals.length === 0 ? (
              <p className="text-muted text-center py-8 text-sm">No approval history yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2 font-semibold text-ink">Month</th>
                      {canManage && <th className="text-left px-4 py-2 font-semibold text-ink">Rep</th>}
                      <th className="text-left px-4 py-2 font-semibold text-ink">Status</th>
                      <th className="text-left px-4 py-2 font-semibold text-ink">Total Commission</th>
                      <th className="text-left px-4 py-2 font-semibold text-ink">Submitted</th>
                      <th className="text-left px-4 py-2 font-semibold text-ink">Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvals
                      .filter((a) => !canManage || viewRep === 'all' || String(a.rep_id) === viewRep)
                      .map(approval => (
                      <tr key={approval.id} className="border-b border-border hover:bg-bg-gray">
                        <td className="px-4 py-3 font-semibold text-ink">{approval.month}</td>
                        {canManage && <td className="px-4 py-3 text-body">{approval.rep_name || '—'}</td>}
                        <td className="px-4 py-3">{statusBadge(approval.status)}</td>
                        <td className="px-4 py-3 font-semibold text-blue">{fmt(approval.total_commission)}</td>
                        <td className="px-4 py-3 text-body text-xs">{approval.rep_submitted_at ? new Date(approval.rep_submitted_at).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3 text-body text-xs">{approval.marcelo_approved_at ? new Date(approval.marcelo_approved_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
