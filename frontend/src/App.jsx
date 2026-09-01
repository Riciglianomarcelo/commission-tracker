import React, { useState, useEffect } from 'react';
import { LogOut, Download, Trash2, CheckCircle2, Clock } from 'lucide-react';
import axios from 'axios';
import './App.css';
import logo4geeks from './assets/4geeks-logo.svg';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('enrolled');
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));

  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [students, setStudents] = useState([]);
  const [reports, setReports] = useState([]);
  const [approvals, setApprovals] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    program: '',
    start_date: '',
    graduation_date: '',
    tuition_amount: '',
    commission_percentage: 5,
    payment_type: 'cash',
    status: 'active',
    email: '',
    is_graduate: false,
  });

  // Load token from localStorage
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      setIsLoggedIn(true);
      setUser(JSON.parse(userData));
      loadStudents();
      loadReports();
    }
  }, []);

  // Auto-reload when month changes
  useEffect(() => {
    if (isLoggedIn) {
      loadStudents();
      loadReports();
    }
  }, [currentMonth]);

  const getAuthHeader = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem('access_token')}`,
    }
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_BASE}/auth/login`, credentials);
      const { access_token } = response.data;

      // Decode JWT to get user info
      const decoded = JSON.parse(atob(access_token.split('.')[1]));
      const userData = { id: decoded.sub, role: decoded.role };

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('user', JSON.stringify(userData));

      setUser(userData);
      setIsLoggedIn(true);
      setCredentials({ username: '', password: '' });
      loadStudents();
      loadReports();
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
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
  };

  const loadStudents = async () => {
    try {
      const response = await axios.get(`${API_BASE}/students?month=${currentMonth}`, getAuthHeader());
      setStudents(response.data);
    } catch (err) {
      console.error('Error loading students:', err);
    }
  };

  const loadReports = async () => {
    try {
      const response = await axios.get(`${API_BASE}/reports/monthly/${currentMonth}`, getAuthHeader());
      setReports([response.data]);
    } catch (err) {
      console.error('Error loading reports:', err);
    }
  };

  const loadApprovals = async () => {
    try {
      const response = await axios.get(`${API_BASE}/approvals/history`, getAuthHeader());
      setApprovals(response.data);
    } catch (err) {
      console.error('Error loading approvals:', err);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        ...formData,
        month: currentMonth,
        tuition_amount: parseFloat(formData.tuition_amount),
        commission_percentage: parseFloat(formData.commission_percentage),
      };

      await axios.post(`${API_BASE}/students`, payload, getAuthHeader());

      setFormData({
        name: '',
        program: '',
        start_date: '',
        graduation_date: '',
        tuition_amount: '',
        commission_percentage: 5,
        payment_type: 'cash',
        status: 'active',
        email: '',
        is_graduate: activeTab === 'graduates',
      });

      loadStudents();
      loadReports();
    } catch (err) {
      setError(err.response?.data?.detail || 'Error adding student');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStudent = async (id) => {
    if (!confirm('Delete this student record?')) return;

    try {
      await axios.delete(`${API_BASE}/students/${id}`, getAuthHeader());
      loadStudents();
      loadReports();
    } catch (err) {
      setError('Error deleting student');
    }
  };

  const handleSubmitForApproval = async () => {
    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_BASE}/approvals/submit`, { month: currentMonth }, getAuthHeader());
      loadReports();
      loadApprovals();
      alert(`Submitted for approval: ${currentMonth}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error submitting');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    setError('');

    try {
      await axios.post(`${API_BASE}/approvals/approve`, { month: currentMonth }, getAuthHeader());
      loadReports();
      loadApprovals();
      alert(`Approved: ${currentMonth}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error approving');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Name', 'Program', 'Start Date', 'Tuition', 'Commission %', 'Commission', 'Status', 'Type'];
    const rows = students.map(s => [
      s.name,
      s.program,
      s.start_date,
      `$${s.tuition_amount.toFixed(2)}`,
      `${s.commission_percentage}%`,
      `$${s.commission_amount.toFixed(2)}`,
      s.status,
      s.is_graduate ? 'Graduate' : 'Enrolled',
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commission_${currentMonth}.csv`;
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
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                  className={`w-full ${inputClass}`}
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

              <button
                type="submit"
                disabled={loading}
                className={`w-full ${primaryBtn}`}
              >
                {loading ? 'Signing in...' : 'Log in'}
              </button>
            </form>

            <div className="mt-6 p-4 bg-blue-tint rounded-[10px] text-sm text-body">
              <p className="font-semibold text-ink mb-2">Demo Credentials</p>
              <p><strong className="text-ink">Rep:</strong> eli / password</p>
              <p><strong className="text-ink">Admin:</strong> admin / password</p>
              <p><strong className="text-ink">Marcelo:</strong> marcelo / password</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const enrolled = students.filter(s => !s.is_graduate);
  const graduates = students.filter(s => s.is_graduate);
  const report = reports[0];

  return (
    <div className="min-h-screen bg-bg-gray">
      {/* Header */}
      <header className="bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div>
            <img src={logo4geeks} alt="4Geeks Academy" className="h-5 mb-2" />
            <h1 className="text-2xl font-extrabold text-ink">Commission Tracker</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted">Logged in as</p>
              <p className="font-semibold text-ink capitalize text-sm">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button
              onClick={handleLogout}
              className={`${secondaryBtn} flex items-center gap-2 !py-2 !px-4`}
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Month Selector */}
        <div className="bg-white rounded-card border border-border shadow-card p-4 mb-6 flex flex-wrap gap-4 justify-between items-center">
          <div className="flex items-center gap-4">
            <label className="font-semibold text-ink text-sm">Month</label>
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            onClick={exportCSV}
            className={`${secondaryBtn} flex items-center gap-2 !py-2 !px-4`}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-soft border border-red/20 text-red px-4 py-3 rounded-[10px] mb-4 text-sm flex justify-between items-center">
            {error}
            <button onClick={() => setError('')} className="font-semibold">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          {['enrolled', 'graduates', 'summary', 'history'].map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'history') loadApprovals();
              }}
              className={`px-5 py-3 text-sm font-semibold border-b-2 transition capitalize ${
                activeTab === tab
                  ? 'border-blue text-blue'
                  : 'border-transparent text-body hover:text-ink'
              }`}
            >
              {tab === 'enrolled' && 'Enrolled Students'}
              {tab === 'graduates' && 'Graduates'}
              {tab === 'summary' && 'Summary'}
              {tab === 'history' && 'History'}
            </button>
          ))}
        </div>

        {/* Enrolled Tab */}
        {activeTab === 'enrolled' && (
          <div className="space-y-6">
            {/* Add Form */}
            <div className="bg-white rounded-card border border-border shadow-card p-6">
              <h2 className="text-lg font-bold text-ink mb-4">Add Enrolled Student</h2>
              <form onSubmit={handleAddStudent} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  placeholder="Program (e.g., ft-ai-engineering-4)"
                  value={formData.program}
                  onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                  className={inputClass}
                  required
                />
                <input
                  type="email"
                  placeholder="Email (for duplicate prevention)"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={inputClass}
                />
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className={inputClass}
                  required
                />
                <input
                  type="date"
                  placeholder="Graduation Date"
                  value={formData.graduation_date}
                  onChange={(e) => setFormData({ ...formData, graduation_date: e.target.value })}
                  className={inputClass}
                />
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

                <button
                  type="submit"
                  disabled={loading}
                  className={`md:col-span-2 ${primaryBtn}`}
                >
                  {loading ? 'Adding...' : '+ Add Student'}
                </button>
              </form>
            </div>

            {/* Students Table */}
            <div className="bg-white rounded-card border border-border shadow-card p-6">
              <h2 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                Enrolled Students
                <span className="text-xs bg-blue-soft text-blue px-2.5 py-1 rounded-pill font-semibold">{enrolled.length}</span>
              </h2>
              {enrolled.length === 0 ? (
                <p className="text-muted text-center py-8 text-sm">No enrolled students yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 font-semibold text-ink">Name</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Program</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Tuition</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Commission</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Status</th>
                        <th className="text-center px-4 py-2 font-semibold text-ink">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolled.map(student => (
                        <tr key={student.id} className="border-b border-border hover:bg-bg-gray">
                          <td className="px-4 py-3 text-ink">{student.name}</td>
                          <td className="px-4 py-3 text-body">{student.program}</td>
                          <td className="px-4 py-3 font-semibold text-ink">${student.tuition_amount.toFixed(2)}</td>
                          <td className="px-4 py-3 font-semibold text-blue">${student.commission_amount.toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-pill text-xs font-semibold ${
                              student.status === 'active' ? 'bg-green-100 text-green-700' :
                              student.status === 'graduated' ? 'bg-blue-soft text-blue' :
                              'bg-red-soft text-red'
                            }`}>
                              {student.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleDeleteStudent(student.id)}
                              className="text-red hover:opacity-70 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Graduates Tab */}
        {activeTab === 'graduates' && (
          <div className="space-y-6">
            {/* Add Form */}
            <div className="bg-white rounded-card border border-border shadow-card p-6">
              <h2 className="text-lg font-bold text-ink mb-4">Add Graduate</h2>
              <form onSubmit={(e) => {
                e.preventDefault();
                setFormData({ ...formData, is_graduate: true });
                handleAddStudent(e);
                setFormData({ ...formData, is_graduate: false });
              }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  placeholder="Program"
                  value={formData.program}
                  onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                  className={inputClass}
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={inputClass}
                />
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className={inputClass}
                  required
                />
                <input
                  type="date"
                  value={formData.graduation_date}
                  onChange={(e) => setFormData({ ...formData, graduation_date: e.target.value })}
                  className={inputClass}
                  required
                />
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

                <button
                  type="submit"
                  disabled={loading}
                  className={`md:col-span-2 ${primaryBtn}`}
                >
                  {loading ? 'Adding...' : '+ Add Graduate'}
                </button>
              </form>
            </div>

            {/* Graduates Table */}
            <div className="bg-white rounded-card border border-border shadow-card p-6">
              <h2 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                Graduates
                <span className="text-xs bg-blue-soft text-blue px-2.5 py-1 rounded-pill font-semibold">{graduates.length}</span>
              </h2>
              {graduates.length === 0 ? (
                <p className="text-muted text-center py-8 text-sm">No graduates yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 font-semibold text-ink">Name</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Program</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Grad Date</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Tuition</th>
                        <th className="text-left px-4 py-2 font-semibold text-ink">Commission</th>
                        <th className="text-center px-4 py-2 font-semibold text-ink">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {graduates.map(student => (
                        <tr key={student.id} className="border-b border-border hover:bg-bg-gray">
                          <td className="px-4 py-3 text-ink">{student.name}</td>
                          <td className="px-4 py-3 text-body">{student.program}</td>
                          <td className="px-4 py-3 text-body">{student.graduation_date}</td>
                          <td className="px-4 py-3 font-semibold text-ink">${student.tuition_amount.toFixed(2)}</td>
                          <td className="px-4 py-3 font-semibold text-blue">${student.commission_amount.toFixed(2)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleDeleteStudent(student.id)}
                              className="text-red hover:opacity-70 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Summary Tab */}
        {activeTab === 'summary' && report && (
          <div className="space-y-6">
            {/* Approval Status */}
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

              {user?.role === 'ADMISSIONS_REP' && report.approval_status === 'draft' && (
                <button
                  onClick={handleSubmitForApproval}
                  disabled={loading || enrolled.length === 0}
                  className={`w-full mt-6 ${primaryBtn}`}
                >
                  Submit for Approval
                </button>
              )}

              {user?.role === 'MARCELO' && report.approval_status === 'submitted' && (
                <button
                  onClick={handleApprove}
                  disabled={loading}
                  className={`w-full mt-6 ${primaryBtn}`}
                >
                  Approve Commission
                </button>
              )}
            </div>

            {/* Summary Cards */}
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
                <p className="text-3xl font-extrabold text-ink">${report.total_enrolled_tuition.toFixed(2)}</p>
              </div>

              <div className="bg-blue-soft rounded-card p-6">
                <p className="text-xs text-blue font-semibold uppercase tracking-wide mb-2">Enrolled Commission</p>
                <p className="text-3xl font-extrabold text-blue">${report.total_enrolled_commission.toFixed(2)}</p>
              </div>

              <div className="bg-white rounded-card border border-border shadow-card p-6">
                <p className="text-xs text-muted font-semibold uppercase tracking-wide mb-2">Graduate Tuition</p>
                <p className="text-3xl font-extrabold text-ink">${report.total_graduate_tuition.toFixed(2)}</p>
              </div>

              <div className="bg-blue-soft rounded-card p-6">
                <p className="text-xs text-blue font-semibold uppercase tracking-wide mb-2">Graduate Commission</p>
                <p className="text-3xl font-extrabold text-blue">${report.total_graduate_commission.toFixed(2)}</p>
              </div>

              <div className="md:col-span-2 bg-blue rounded-card p-6">
                <p className="text-xs text-white/80 font-semibold uppercase tracking-wide mb-2">Total Commission</p>
                <p className="text-4xl font-extrabold text-white">${report.total_commission.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-card border border-border shadow-card p-6">
            <h2 className="text-lg font-bold text-ink mb-4">Approval History</h2>
            {approvals.length === 0 ? (
              <p className="text-muted text-center py-8 text-sm">No approval history yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2 font-semibold text-ink">Month</th>
                      <th className="text-left px-4 py-2 font-semibold text-ink">Status</th>
                      <th className="text-left px-4 py-2 font-semibold text-ink">Total Commission</th>
                      <th className="text-left px-4 py-2 font-semibold text-ink">Submitted</th>
                      <th className="text-left px-4 py-2 font-semibold text-ink">Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvals.map(approval => (
                      <tr key={approval.id} className="border-b border-border hover:bg-bg-gray">
                        <td className="px-4 py-3 font-semibold text-ink">{approval.month}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-pill text-xs font-semibold ${
                            approval.status === 'approved' ? 'bg-green-100 text-green-700' :
                            approval.status === 'submitted' ? 'bg-amber-soft text-amber' :
                            'bg-bg-gray text-body'
                          }`}>
                            {approval.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-blue">${approval.total_commission.toFixed(2)}</td>
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
