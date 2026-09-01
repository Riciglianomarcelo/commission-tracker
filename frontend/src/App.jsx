import React, { useState, useEffect } from 'react';
import { LogOut, Plus, Download, Trash2, CheckCircle2, Clock } from 'lucide-react';
import axios from 'axios';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

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
      alert(`✅ Submitted for approval: ${currentMonth}`);
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
      alert(`✅ Approved: ${currentMonth}`);
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

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-light-gray to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg shadow-md p-8">
            <h1 className="text-3xl font-bold text-charcoal mb-2 text-center">💰 Commission Tracker</h1>
            <p className="text-center text-gray-600 mb-8">4Geeks Academy</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Username</label>
                <input
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                  className="w-full px-4 py-2 border border-border-gray rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-charcoal mb-2">Password</label>
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  className="w-full px-4 py-2 border border-border-gray rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange hover:bg-orange-hover text-white font-semibold py-2 rounded-lg transition"
              >
                {loading ? 'Loading...' : 'Login'}
              </button>
            </form>

            <div className="mt-6 p-4 bg-light-gray rounded text-sm text-gray-600">
              <p className="font-semibold text-charcoal mb-2">Demo Credentials:</p>
              <p><strong>Rep:</strong> eli / password</p>
              <p><strong>Admin:</strong> admin / password</p>
              <p><strong>Marcelo:</strong> marcelo / password</p>
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
    <div className="min-h-screen bg-gradient-to-br from-light-gray to-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-charcoal to-charcoal-light text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">💰 Commission Tracker</h1>
            <p className="text-gray-300">4Geeks Academy • Manage monthly commissions</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-gray-300">Logged in as</p>
              <p className="font-semibold capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-orange hover:bg-orange-hover px-4 py-2 rounded-lg flex items-center gap-2 transition"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Month Selector */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <label className="font-semibold text-charcoal">Month:</label>
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="px-4 py-2 border border-border-gray rounded-lg focus:outline-none focus:ring-2 focus:ring-blue"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              className="bg-blue hover:bg-blue-hover text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
            >
              <Download size={18} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
            <button onClick={() => setError('')} className="float-right">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border-gray">
          {['enrolled', 'graduates', 'summary', 'history'].map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === 'history') loadApprovals();
              }}
              className={`px-6 py-3 font-semibold border-b-2 transition ${
                activeTab === tab
                  ? 'border-blue text-blue'
                  : 'border-transparent text-gray-600 hover:text-charcoal'
              }`}
            >
              {tab === 'enrolled' && '📚 Enrolled Students'}
              {tab === 'graduates' && '🎓 Graduates'}
              {tab === 'summary' && '📊 Summary'}
              {tab === 'history' && '📋 History'}
            </button>
          ))}
        </div>

        {/* Enrolled Tab */}
        {activeTab === 'enrolled' && (
          <div className="space-y-6">
            {/* Add Form */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-charcoal mb-4">➕ Add Enrolled Student</h2>
              <form onSubmit={handleAddStudent} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Program (e.g., ft-ai-engineering-4)"
                  value={formData.program}
                  onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <input
                  type="email"
                  placeholder="Email (for duplicate prevention)"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                />
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <input
                  type="date"
                  placeholder="Graduation Date"
                  value={formData.graduation_date}
                  onChange={(e) => setFormData({ ...formData, graduation_date: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Tuition Amount"
                  value={formData.tuition_amount}
                  onChange={(e) => setFormData({ ...formData, tuition_amount: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Commission %"
                  value={formData.commission_percentage}
                  onChange={(e) => setFormData({ ...formData, commission_percentage: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <select
                  value={formData.payment_type}
                  onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                >
                  <option value="cash">Paid Cash</option>
                  <option value="financed">Financed</option>
                  <option value="other">Other</option>
                </select>

                <button
                  type="submit"
                  disabled={loading}
                  className="md:col-span-2 bg-orange hover:bg-orange-hover text-white font-semibold py-2 rounded-lg transition"
                >
                  {loading ? 'Adding...' : '+ Add Student'}
                </button>
              </form>
            </div>

            {/* Students Table */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-charcoal mb-4">
                📚 Enrolled Students
                <span className="ml-2 text-sm bg-orange text-white px-3 py-1 rounded-full">{enrolled.length}</span>
              </h2>
              {enrolled.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No enrolled students yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-border-gray">
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Name</th>
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Program</th>
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Tuition</th>
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Commission</th>
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Status</th>
                        <th className="text-center px-4 py-2 font-semibold text-charcoal">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrolled.map(student => (
                        <tr key={student.id} className="border-b border-border-gray hover:bg-light-gray">
                          <td className="px-4 py-3">{student.name}</td>
                          <td className="px-4 py-3">{student.program}</td>
                          <td className="px-4 py-3 font-semibold">${student.tuition_amount.toFixed(2)}</td>
                          <td className="px-4 py-3 font-semibold text-orange">${student.commission_amount.toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              student.status === 'active' ? 'bg-green-100 text-green-700' :
                              student.status === 'graduated' ? 'bg-blue-100 text-blue' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {student.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleDeleteStudent(student.id)}
                              className="text-red-600 hover:text-red-800 transition"
                            >
                              <Trash2 size={18} />
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
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-charcoal mb-4">➕ Add Graduate</h2>
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
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Program"
                  value={formData.program}
                  onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                />
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <input
                  type="date"
                  value={formData.graduation_date}
                  onChange={(e) => setFormData({ ...formData, graduation_date: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Tuition Amount"
                  value={formData.tuition_amount}
                  onChange={(e) => setFormData({ ...formData, tuition_amount: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Commission %"
                  value={formData.commission_percentage}
                  onChange={(e) => setFormData({ ...formData, commission_percentage: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                  required
                />
                <select
                  value={formData.payment_type}
                  onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
                  className="px-4 py-2 border border-border-gray rounded-lg"
                >
                  <option value="cash">Paid Cash</option>
                  <option value="financed">Financed</option>
                  <option value="other">Other</option>
                </select>

                <button
                  type="submit"
                  disabled={loading}
                  className="md:col-span-2 bg-orange hover:bg-orange-hover text-white font-semibold py-2 rounded-lg transition"
                >
                  {loading ? 'Adding...' : '+ Add Graduate'}
                </button>
              </form>
            </div>

            {/* Graduates Table */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-charcoal mb-4">
                🎓 Graduates
                <span className="ml-2 text-sm bg-blue text-white px-3 py-1 rounded-full">{graduates.length}</span>
              </h2>
              {graduates.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No graduates yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-border-gray">
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Name</th>
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Program</th>
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Grad Date</th>
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Tuition</th>
                        <th className="text-left px-4 py-2 font-semibold text-charcoal">Commission</th>
                        <th className="text-center px-4 py-2 font-semibold text-charcoal">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {graduates.map(student => (
                        <tr key={student.id} className="border-b border-border-gray hover:bg-light-gray">
                          <td className="px-4 py-3">{student.name}</td>
                          <td className="px-4 py-3">{student.program}</td>
                          <td className="px-4 py-3">{student.graduation_date}</td>
                          <td className="px-4 py-3 font-semibold">${student.tuition_amount.toFixed(2)}</td>
                          <td className="px-4 py-3 font-semibold text-orange">${student.commission_amount.toFixed(2)}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleDeleteStudent(student.id)}
                              className="text-red-600 hover:text-red-800 transition"
                            >
                              <Trash2 size={18} />
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
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-bold text-charcoal mb-4">📊 Approval Workflow</h2>
              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    report.approval_status === 'submitted' || report.approval_status === 'approved'
                      ? 'bg-blue text-white'
                      : 'bg-light-gray text-gray-600'
                  }`}>
                    <Clock size={24} />
                  </div>
                  <p className="font-semibold text-charcoal">Rep</p>
                  <p className="text-sm text-gray-600">Submitted</p>
                </div>

                <div className={`flex-1 h-1 mx-4 ${report.approval_status === 'approved' ? 'bg-blue' : 'bg-light-gray'}`}></div>

                <div className="text-center flex-1">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                    report.approval_status === 'approved'
                      ? 'bg-blue text-white'
                      : 'bg-light-gray text-gray-600'
                  }`}>
                    <CheckCircle2 size={24} />
                  </div>
                  <p className="font-semibold text-charcoal">Marcelo</p>
                  <p className="text-sm text-gray-600">Approved</p>
                </div>
              </div>

              {user?.role === 'ADMISSIONS_REP' && report.approval_status === 'draft' && (
                <button
                  onClick={handleSubmitForApproval}
                  disabled={loading || enrolled.length === 0}
                  className="w-full mt-6 bg-orange hover:bg-orange-hover text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
                >
                  Submit for Approval
                </button>
              )}

              {user?.role === 'MARCELO' && report.approval_status === 'submitted' && (
                <button
                  onClick={handleApprove}
                  disabled={loading}
                  className="w-full mt-6 bg-blue hover:bg-blue-hover text-white font-semibold py-3 rounded-lg transition"
                >
                  ✓ Approve Commission
                </button>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-orange">
                <p className="text-sm text-gray-600 font-semibold uppercase mb-2">Total Enrolled Students</p>
                <p className="text-3xl font-bold text-charcoal">{report.enrolled_count}</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue">
                <p className="text-sm text-gray-600 font-semibold uppercase mb-2">Total Graduates</p>
                <p className="text-3xl font-bold text-charcoal">{report.graduate_count}</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-orange">
                <p className="text-sm text-gray-600 font-semibold uppercase mb-2">Enrolled Tuition</p>
                <p className="text-3xl font-bold text-charcoal">${report.total_enrolled_tuition.toFixed(2)}</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue">
                <p className="text-sm text-gray-600 font-semibold uppercase mb-2">Enrolled Commission</p>
                <p className="text-3xl font-bold text-orange">${report.total_enrolled_commission.toFixed(2)}</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-orange">
                <p className="text-sm text-gray-600 font-semibold uppercase mb-2">Graduate Tuition</p>
                <p className="text-3xl font-bold text-charcoal">${report.total_graduate_tuition.toFixed(2)}</p>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue">
                <p className="text-sm text-gray-600 font-semibold uppercase mb-2">Graduate Commission</p>
                <p className="text-3xl font-bold text-orange">${report.total_graduate_commission.toFixed(2)}</p>
              </div>

              <div className="md:col-span-2 bg-gradient-to-r from-charcoal to-charcoal-light rounded-lg shadow-sm p-6">
                <p className="text-sm text-gray-300 font-semibold uppercase mb-2">Total Commission</p>
                <p className="text-4xl font-bold text-orange">${report.total_commission.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-bold text-charcoal mb-4">📋 Approval History</h2>
            {approvals.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No approval history yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-border-gray">
                      <th className="text-left px-4 py-2 font-semibold text-charcoal">Month</th>
                      <th className="text-left px-4 py-2 font-semibold text-charcoal">Status</th>
                      <th className="text-left px-4 py-2 font-semibold text-charcoal">Total Commission</th>
                      <th className="text-left px-4 py-2 font-semibold text-charcoal">Submitted</th>
                      <th className="text-left px-4 py-2 font-semibold text-charcoal">Approved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvals.map(approval => (
                      <tr key={approval.id} className="border-b border-border-gray hover:bg-light-gray">
                        <td className="px-4 py-3 font-semibold">{approval.month}</td>
                        <td className="px-4 py-3">
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            approval.status === 'approved' ? 'bg-green-100 text-green-700' :
                            approval.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {approval.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-orange">${approval.total_commission.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm">{approval.rep_submitted_at ? new Date(approval.rep_submitted_at).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3 text-sm">{approval.marcelo_approved_at ? new Date(approval.marcelo_approved_at).toLocaleDateString() : '—'}</td>
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
