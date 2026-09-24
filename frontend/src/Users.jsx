import React, { useState } from 'react';
import axios from 'axios';
import { Pencil, Check, X, UserPlus } from 'lucide-react';

const ROLE_LABELS = { ADMISSIONS_REP: 'Admissions Rep', ADMIN: 'Admin', MARCELO: 'Super Admin' };
const LOCATIONS = ['USA', 'LATAM'];

const blankUser = { full_name: '', username: '', email: '', password: '', role: 'ADMISSIONS_REP', location: 'LATAM' };

export default function Users({ apiBase, getAuthHeader, onAuthError, users, currentUserId, onChanged, getErrorMessage }) {
  const [form, setForm] = useState(blankUser);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});

  const inputClass = 'px-3 py-2 border border-border rounded-[10px] text-sm text-ink bg-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue focus:border-transparent transition';
  const primaryBtn = 'bg-blue hover:bg-blue-hover text-white font-semibold py-2.5 px-6 rounded-pill transition disabled:opacity-50 disabled:cursor-not-allowed';
  const card = 'bg-white rounded-card border border-border shadow-card p-6';

  const fail = (err, fallback) => { if (!onAuthError(err)) setError(getErrorMessage(err, fallback)); };

  const createUser = async (e) => {
    e.preventDefault();
    setError(''); setMessage('');
    setSaving(true);
    try {
      const res = await axios.post(`${apiBase}/users`, form, getAuthHeader());
      setMessage(`Created ${res.data.display_name} — username "${res.data.username}". Share the password with them privately; they can change it after logging in.`);
      setForm({ ...blankUser, role: form.role, location: form.location });
      onChanged();
    } catch (err) {
      fail(err, 'Could not create user');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEdit({ full_name: u.full_name || '', email: u.email || '', role: u.role, location: u.location || 'USA', new_password: '' });
    setError(''); setMessage('');
  };

  const saveEdit = async (u) => {
    setError(''); setMessage('');
    const payload = {};
    if ((edit.full_name || '') !== (u.full_name || '')) payload.full_name = edit.full_name;
    if (edit.email !== u.email) payload.email = edit.email;
    if (edit.role !== u.role) payload.role = edit.role;
    if (edit.location !== u.location) payload.location = edit.location;
    if (edit.new_password) payload.new_password = edit.new_password;
    if (payload.location && u.role === 'ADMISSIONS_REP' &&
        !confirm(`Move ${u.display_name} to ${payload.location}? Their existing records move with them.`)) return;
    try {
      if (Object.keys(payload).length) await axios.patch(`${apiBase}/users/${u.id}`, payload, getAuthHeader());
      setEditingId(null);
      if (payload.new_password) setMessage(`Password reset for ${u.display_name}.`);
      onChanged();
    } catch (err) {
      fail(err, 'Could not update user');
    }
  };

  const toggleActive = async (u) => {
    const verb = u.is_active ? 'Deactivate' : 'Reactivate';
    if (!confirm(`${verb} ${u.display_name}?${u.is_active ? ' They will no longer be able to log in. Their records stay.' : ''}`)) return;
    setError(''); setMessage('');
    try {
      await axios.patch(`${apiBase}/users/${u.id}`, { is_active: !u.is_active }, getAuthHeader());
      onChanged();
    } catch (err) {
      fail(err, `Could not ${verb.toLowerCase()} user`);
    }
  };

  const groups = [
    ...LOCATIONS.map((loc) => ({ title: `${loc} admissions reps`, rows: users.filter((u) => u.role === 'ADMISSIONS_REP' && u.location === loc) })),
    { title: 'Reviewers & admins (see both locations)', rows: users.filter((u) => u.role !== 'ADMISSIONS_REP') },
  ];

  return (
    <div className="space-y-6">
      <div className={card}>
        <h2 className="text-lg font-bold text-ink mb-1 flex items-center gap-2"><UserPlus size={18} /> Add a user</h2>
        <p className="text-sm text-body mb-4">Admissions reps only see and submit their own commissions. Admin and Super Admin review both locations.</p>
        <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs font-semibold text-muted">Full name
            <input className={`w-full mt-1 ${inputClass}`} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Ana Pérez" required />
          </label>
          <label className="text-xs font-semibold text-muted">Username (for login)
            <input className={`w-full mt-1 ${inputClass}`} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.trim().toLowerCase() })} placeholder="e.g. ana" autoCapitalize="none" required />
          </label>
          <label className="text-xs font-semibold text-muted">Email
            <input type="email" className={`w-full mt-1 ${inputClass}`} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ana@4geeksacademy.com" required />
          </label>
          <label className="text-xs font-semibold text-muted">Role
            <select className={`w-full mt-1 ${inputClass}`} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">Location
            <select className={`w-full mt-1 ${inputClass}`} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={form.role !== 'ADMISSIONS_REP'}>
              {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">Temporary password
            <input type="text" className={`w-full mt-1 ${inputClass}`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="at least 6 characters" minLength={6} required />
          </label>
          <div className="md:col-span-3">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Creating…' : 'Create user'}</button>
          </div>
        </form>
        {message && <div className="mt-4 bg-green-100 border border-green-700/20 text-green-700 px-4 py-3 rounded-[10px] text-sm">{message}</div>}
        {error && <div className="mt-4 bg-red-soft border border-red/20 text-red px-4 py-3 rounded-[10px] text-sm flex justify-between"><span>{error}</span><button onClick={() => setError('')} className="font-semibold">✕</button></div>}
      </div>

      {groups.map((g) => (
        <div key={g.title} className={card}>
          <h2 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
            {g.title}
            <span className="text-xs bg-blue-soft text-blue px-2.5 py-1 rounded-pill font-semibold">{g.rows.filter((u) => u.is_active).length}</span>
          </h2>
          {g.rows.length === 0 ? (
            <p className="text-muted text-sm py-4">None yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 font-semibold text-ink">Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-ink">Username</th>
                    <th className="text-left px-3 py-2 font-semibold text-ink">Email</th>
                    <th className="text-left px-3 py-2 font-semibold text-ink">Role</th>
                    <th className="text-left px-3 py-2 font-semibold text-ink">Location</th>
                    <th className="text-left px-3 py-2 font-semibold text-ink">Status</th>
                    <th className="text-right px-3 py-2 font-semibold text-ink">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((u) => editingId === u.id ? (
                    <tr key={u.id} className="border-b border-border bg-blue-tint align-top">
                      <td className="px-3 py-2"><input className={`w-full ${inputClass}`} value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></td>
                      <td className="px-3 py-2 text-body pt-4">{u.username}</td>
                      <td className="px-3 py-2"><input type="email" className={`w-full ${inputClass}`} value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></td>
                      <td className="px-3 py-2">
                        <select className={inputClass} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} disabled={u.id === currentUserId}>
                          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select className={inputClass} value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} disabled={edit.role !== 'ADMISSIONS_REP'}>
                          {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" className={`w-40 ${inputClass}`} placeholder="New password (optional)" value={edit.new_password} onChange={(e) => setEdit({ ...edit, new_password: e.target.value })} />
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap pt-4">
                        <button onClick={() => saveEdit(u)} className="text-blue hover:opacity-70 mr-3" title="Save"><Check size={16} /></button>
                        <button onClick={() => setEditingId(null)} className="text-muted hover:opacity-70" title="Cancel"><X size={16} /></button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={u.id} className={`border-b border-border hover:bg-bg-gray ${u.is_active ? '' : 'opacity-60'}`}>
                      <td className="px-3 py-3 text-ink font-medium">{u.display_name}</td>
                      <td className="px-3 py-3 text-body">{u.username}</td>
                      <td className="px-3 py-3 text-body">{u.email}</td>
                      <td className="px-3 py-3 text-body">{ROLE_LABELS[u.role] || u.role}</td>
                      <td className="px-3 py-3 text-body">{u.role === 'ADMISSIONS_REP' ? u.location : 'All'}</td>
                      <td className="px-3 py-3">
                        <span className={`px-2.5 py-1 rounded-pill text-xs font-semibold ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-bg-gray text-body'}`}>
                          {u.is_active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <button onClick={() => startEdit(u)} className="text-blue hover:opacity-70 mr-3" title="Edit / reset password"><Pencil size={16} /></button>
                        {u.id !== currentUserId && (
                          <button onClick={() => toggleActive(u)} className={`text-xs font-semibold ${u.is_active ? 'text-red' : 'text-blue'} hover:opacity-70`}>
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
