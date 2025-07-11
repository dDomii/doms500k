import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, PhilippinePeso, Download, Users, Clock, AlertTriangle, RefreshCw, CheckCircle, Edit3, Save, X } from 'lucide-react';

interface PayrollEntry {
  id: number;
  user_id: number;
  username: string;
  department: string;
  week_start: string;
  week_end: string;
  total_hours: number;
  overtime_hours: number;
  undertime_hours: number;
  base_salary: number;
  overtime_pay: number;
  undertime_deduction: number;
  staff_house_deduction: number;
  total_salary: number;
  clock_in_time: string;
  clock_out_time: string;
  status: string;
  last_updated: string;
}

interface AdminOverview {
  payslipsNeedingRecalculation: number;
  activeUsersToday: number;
  pendingOvertimeRequests: number;
  recentSyncIssues: number;
  lastUpdated: string;
}

export function PayrollReports() {
  const [payrollData, setPayrollData] = useState<PayrollEntry[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPayslip, setEditingPayslip] = useState<number | null>(null);
  const [editValues, setEditValues] = useState({
    clockIn: '',
    clockOut: '',
    totalHours: '',
    overtimeHours: '',
    undertimeHours: '',
    baseSalary: '',
    overtimePay: '',
    undertimeDeduction: '',
    staffHouseDeduction: ''
  });
  const [generationMode, setGenerationMode] = useState<'week' | 'dateRange' | 'specificDays'>('week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [specificDays, setSpecificDays] = useState<string[]>([]);
  const [newDayInput, setNewDayInput] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    fetchAdminOverview();
    // Set current week as default
    const today = new Date();
    const currentWeekStart = getWeekStart(today);
    setSelectedWeek(currentWeekStart);
    fetchPayrollData(currentWeekStart);
  }, []);

  const fetchAdminOverview = async () => {
    try {
      const response = await fetch('http://192.168.100.60:3001/api/admin-dashboard-overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setAdminOverview(data);
    } catch (error) {
      console.error('Error fetching admin overview:', error);
    }
  };

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  };

  const getWeekEnd = (weekStart: string) => {
    const start = new Date(weekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end.toISOString().split('T')[0];
  };

  const generateWeekOptions = () => {
    const weeks = [];
    const today = new Date();
    
    for (let i = 0; i < 12; i++) {
      const weekDate = new Date(today);
      weekDate.setDate(today.getDate() - (i * 7));
      const weekStart = getWeekStart(weekDate);
      const weekEnd = getWeekEnd(weekStart);
      
      weeks.push({
        value: weekStart,
        label: `${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
        isCurrent: i === 0
      });
    }
    
    return weeks;
  };

  const fetchPayrollData = async (weekStart?: string, startDate?: string, endDate?: string, selectedDates?: string[]) => {
    setLoading(true);
    try {
      let url = 'http://192.168.100.60:3001/api/payroll-report';
      const params = new URLSearchParams();
      
      if (selectedDates && selectedDates.length > 0) {
        params.append('selectedDates', selectedDates.join(','));
      } else if (startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      } else if (weekStart) {
        params.append('weekStart', weekStart);
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setPayrollData(data);
    } catch (error) {
      console.error('Error fetching payroll data:', error);
    }
    setLoading(false);
  };

  const generatePayslips = async () => {
    setLoading(true);
    try {
      const payload: any = {};
      
      if (generationMode === 'week') {
        payload.weekStart = selectedWeek;
      } else if (generationMode === 'dateRange') {
        payload.startDate = startDate;
        payload.endDate = endDate;
      } else if (generationMode === 'specificDays') {
        payload.selectedDates = specificDays;
      }
      
      const response = await fetch('http://192.168.100.60:3001/api/payslips/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      
      if (Array.isArray(data)) {
        alert(`Generated ${data.length} payslips successfully!`);
        // Refresh the data
        if (generationMode === 'week') {
          fetchPayrollData(selectedWeek);
        } else if (generationMode === 'dateRange') {
          fetchPayrollData(undefined, startDate, endDate);
        } else if (generationMode === 'specificDays') {
          fetchPayrollData(undefined, undefined, undefined, specificDays);
        }
        fetchAdminOverview();
      } else {
        alert(data.message || 'Failed to generate payslips');
      }
    } catch (error) {
      console.error('Error generating payslips:', error);
      alert('Failed to generate payslips');
    }
    setLoading(false);
  };

  const recalculatePayslips = async () => {
    if (!confirm('This will recalculate all payslips that need updates. Continue?')) return;
    
    setLoading(true);
    try {
      const response = await fetch('http://192.168.100.60:3001/api/recalculate-payslips', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await response.json();
      if (data.success) {
        alert(data.message);
        fetchPayrollData(selectedWeek);
        fetchAdminOverview();
      } else {
        alert(data.message || 'Failed to recalculate payslips');
      }
    } catch (error) {
      console.error('Error recalculating payslips:', error);
      alert('Failed to recalculate payslips');
    }
    setLoading(false);
  };

  const releasePayslips = async () => {
    if (!confirm('This will release all pending payslips for the selected period. Continue?')) return;
    
    setLoading(true);
    try {
      const payload: any = {};
      
      if (generationMode === 'specificDays') {
        payload.selectedDates = specificDays;
      }
      
      const response = await fetch('http://192.168.100.60:3001/api/payslips/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      
      if (data.success) {
        alert(data.message);
        // Refresh the data
        if (generationMode === 'week') {
          fetchPayrollData(selectedWeek);
        } else if (generationMode === 'dateRange') {
          fetchPayrollData(undefined, startDate, endDate);
        } else if (generationMode === 'specificDays') {
          fetchPayrollData(undefined, undefined, undefined, specificDays);
        }
      } else {
        alert(data.message || 'Failed to release payslips');
      }
    } catch (error) {
      console.error('Error releasing payslips:', error);
      alert('Failed to release payslips');
    }
    setLoading(false);
  };

  const handleEditPayslip = (payslip: PayrollEntry) => {
    setEditingPayslip(payslip.id);
    setEditValues({
      clockIn: payslip.clock_in_time ? new Date(payslip.clock_in_time).toISOString().slice(0, 16) : '',
      clockOut: payslip.clock_out_time ? new Date(payslip.clock_out_time).toISOString().slice(0, 16) : '',
      totalHours: payslip.total_hours.toString(),
      overtimeHours: payslip.overtime_hours.toString(),
      undertimeHours: payslip.undertime_hours.toString(),
      baseSalary: payslip.base_salary.toString(),
      overtimePay: payslip.overtime_pay.toString(),
      undertimeDeduction: payslip.undertime_deduction.toString(),
      staffHouseDeduction: payslip.staff_house_deduction.toString()
    });
  };

  const savePayslipEdit = async () => {
    if (!editingPayslip) return;
    
    try {
      const response = await fetch(`http://192.168.100.60:3001/api/payroll/${editingPayslip}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editValues),
      });

      const data = await response.json();
      
      if (data.success) {
        alert('Payslip updated successfully!');
        setEditingPayslip(null);
        // Refresh the data
        if (generationMode === 'week') {
          fetchPayrollData(selectedWeek);
        } else if (generationMode === 'dateRange') {
          fetchPayrollData(undefined, startDate, endDate);
        } else if (generationMode === 'specificDays') {
          fetchPayrollData(undefined, undefined, undefined, specificDays);
        }
      } else {
        alert(data.message || 'Failed to update payslip');
      }
    } catch (error) {
      console.error('Error updating payslip:', error);
      alert('Failed to update payslip');
    }
  };

  const addSpecificDay = () => {
    if (newDayInput && !specificDays.includes(newDayInput)) {
      setSpecificDays([...specificDays, newDayInput].sort());
      setNewDayInput('');
    }
  };

  const removeSpecificDay = (day: string) => {
    setSpecificDays(specificDays.filter(d => d !== day));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return `₱${amount.toFixed(2)}`;
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const exportToCSV = () => {
    if (payrollData.length === 0) return;

    const headers = [
      'Employee',
      'Department',
      'Week Start',
      'Week End',
      'Clock In',
      'Clock Out',
      'Total Hours',
      'Overtime Hours',
      'Undertime Hours',
      'Base Salary',
      'Overtime Pay',
      'Undertime Deduction',
      'Staff House Deduction',
      'Total Salary',
      'Status',
      'Last Updated'
    ];

    const rows = payrollData.map(entry => [
      entry.username,
      entry.department,
      entry.week_start,
      entry.week_end,
      formatDateTime(entry.clock_in_time),
      formatDateTime(entry.clock_out_time),
      entry.total_hours,
      entry.overtime_hours,
      entry.undertime_hours,
      entry.base_salary,
      entry.overtime_pay,
      entry.undertime_deduction,
      entry.staff_house_deduction,
      entry.total_salary,
      entry.status,
      formatDateTime(entry.last_updated)
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payroll_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const weekOptions = generateWeekOptions();
  const totalSalary = payrollData.reduce((sum, entry) => sum + entry.total_salary, 0);
  const totalHours = payrollData.reduce((sum, entry) => sum + entry.total_hours, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Payroll Management Center</h2>
          <p className="text-slate-400">Generate, edit, and manage employee payslips with real-time data sync</p>
        </div>
        <div className="flex items-center gap-4">
          {adminOverview && adminOverview.payslipsNeedingRecalculation > 0 && (
            <button
              onClick={recalculatePayslips}
              className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition-all duration-200 flex items-center gap-2 shadow-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Recalculate ({adminOverview.payslipsNeedingRecalculation})
            </button>
          )}
          {payrollData.length > 0 && (
            <button
              onClick={exportToCSV}
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center gap-2 shadow-lg"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Admin Overview Cards */}
      {adminOverview && (
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className={`bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border ${
            adminOverview.payslipsNeedingRecalculation > 0 ? 'border-orange-700/50' : 'border-slate-700/50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Needs Recalculation</p>
                <p className={`text-2xl font-bold ${
                  adminOverview.payslipsNeedingRecalculation > 0 ? 'text-orange-400' : 'text-emerald-400'
                }`}>
                  {adminOverview.payslipsNeedingRecalculation}
                </p>
              </div>
              <div className={`bg-gradient-to-br p-3 rounded-lg ${
                adminOverview.payslipsNeedingRecalculation > 0 
                  ? 'from-orange-500/20 to-orange-600/20' 
                  : 'from-emerald-500/20 to-green-600/20'
              }`}>
                {adminOverview.payslipsNeedingRecalculation > 0 ? (
                  <AlertTriangle className="w-6 h-6 text-orange-400" />
                ) : (
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Active Today</p>
                <p className="text-2xl font-bold text-blue-400">{adminOverview.activeUsersToday}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 p-3 rounded-lg">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </div>

          <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Pending OT</p>
                <p className="text-2xl font-bold text-purple-400">{adminOverview.pendingOvertimeRequests}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 p-3 rounded-lg">
                <Clock className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </div>

          <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Sync Issues</p>
                <p className={`text-2xl font-bold ${
                  adminOverview.recentSyncIssues > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {adminOverview.recentSyncIssues}
                </p>
              </div>
              <div className={`bg-gradient-to-br p-3 rounded-lg ${
                adminOverview.recentSyncIssues > 0 
                  ? 'from-red-500/20 to-red-600/20' 
                  : 'from-emerald-500/20 to-green-600/20'
              }`}>
                {adminOverview.recentSyncIssues > 0 ? (
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                ) : (
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generation Controls */}
      <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-6 mb-6 shadow-lg border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Payslip Generation & Management</h3>
        
        <div className="grid md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Generation Mode</label>
            <select
              value={generationMode}
              onChange={(e) => setGenerationMode(e.target.value as any)}
              className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="week">Weekly</option>
              <option value="dateRange">Date Range</option>
              <option value="specificDays">Specific Days</option>
            </select>
          </div>

          {generationMode === 'week' && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">Select Week</label>
              <select
                value={selectedWeek}
                onChange={(e) => {
                  setSelectedWeek(e.target.value);
                  fetchPayrollData(e.target.value);
                }}
                className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                {weekOptions.map(week => (
                  <option key={week.value} value={week.value}>
                    {week.label} {week.isCurrent ? '(Current Week)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {generationMode === 'dateRange' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          {generationMode === 'specificDays' && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">Add Specific Days</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="date"
                  value={newDayInput}
                  onChange={(e) => setNewDayInput(e.target.value)}
                  className="flex-1 bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  onClick={addSpecificDay}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {specificDays.map(day => (
                  <span key={day} className="bg-slate-700 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
                    {formatDate(day)}
                    <button
                      onClick={() => removeSpecificDay(day)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <button
            onClick={generatePayslips}
            disabled={loading || (generationMode === 'dateRange' && (!startDate || !endDate)) || (generationMode === 'specificDays' && specificDays.length === 0)}
            className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-2 rounded-lg font-medium hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 transition-all duration-200 flex items-center gap-2"
          >
            <PhilippinePeso className="w-4 h-4" />
            {loading ? 'Generating...' : 'Generate Payslips'}
          </button>

          {payrollData.length > 0 && (
            <button
              onClick={releasePayslips}
              disabled={loading}
              className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 transition-all duration-200 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Release Payslips
            </button>
          )}

          <button
            onClick={() => {
              if (generationMode === 'week') {
                fetchPayrollData(selectedWeek);
              } else if (generationMode === 'dateRange') {
                fetchPayrollData(undefined, startDate, endDate);
              } else if (generationMode === 'specificDays') {
                fetchPayrollData(undefined, undefined, undefined, specificDays);
              }
              fetchAdminOverview();
            }}
            disabled={loading}
            className="bg-gradient-to-r from-slate-600 to-slate-700 text-white px-6 py-2 rounded-lg font-medium hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 transition-all duration-200 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {payrollData.length > 0 && (
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
            <div className="text-center">
              <p className="text-sm text-slate-400">Total Employees</p>
              <p className="text-2xl font-bold text-emerald-400">{payrollData.length}</p>
            </div>
          </div>
          <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
            <div className="text-center">
              <p className="text-sm text-slate-400">Total Hours</p>
              <p className="text-2xl font-bold text-blue-400">{totalHours.toFixed(1)}h</p>
            </div>
          </div>
          <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
            <div className="text-center">
              <p className="text-sm text-slate-400">Total Payroll</p>
              <p className="text-2xl font-bold text-purple-400">{formatCurrency(totalSalary)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Payroll Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading payroll data...</p>
        </div>
      ) : payrollData.length > 0 ? (
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden border border-slate-700/50">
          <div className="bg-slate-700/50 px-6 py-4 border-b border-slate-600/50">
            <h3 className="text-lg font-semibold text-white">Payroll Report</h3>
            <p className="text-sm text-slate-400 mt-1">
              {generationMode === 'week' && `Week of ${formatDate(selectedWeek)} - ${formatDate(getWeekEnd(selectedWeek))}`}
              {generationMode === 'dateRange' && `${formatDate(startDate)} - ${formatDate(endDate)}`}
              {generationMode === 'specificDays' && `Selected Days: ${specificDays.map(formatDate).join(', ')}`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300">Employee</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300">Time Period</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-300">Hours</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-300">Earnings</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-300">Deductions</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-300">Total</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-300">Status</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {payrollData.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-white">{entry.username}</p>
                        <p className="text-sm text-slate-400">{entry.department}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm">
                        <p className="text-slate-300">{formatDate(entry.week_start)} - {formatDate(entry.week_end)}</p>
                        <p className="text-slate-400">
                          {formatDateTime(entry.clock_in_time)} - {formatDateTime(entry.clock_out_time)}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div>
                        <p className="text-white">{entry.total_hours.toFixed(2)}h</p>
                        {entry.overtime_hours > 0 && (
                          <p className="text-sm text-orange-400">+{entry.overtime_hours.toFixed(2)}h OT</p>
                        )}
                        {entry.undertime_hours > 0 && (
                          <p className="text-sm text-red-400">-{entry.undertime_hours.toFixed(2)}h UT</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div>
                        <p className="text-white">{formatCurrency(entry.base_salary)}</p>
                        {entry.overtime_pay > 0 && (
                          <p className="text-sm text-emerald-400">+{formatCurrency(entry.overtime_pay)}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div>
                        {entry.undertime_deduction > 0 && (
                          <p className="text-sm text-red-400">-{formatCurrency(entry.undertime_deduction)}</p>
                        )}
                        {entry.staff_house_deduction > 0 && (
                          <p className="text-sm text-purple-400">-{formatCurrency(entry.staff_house_deduction)}</p>
                        )}
                        {entry.undertime_deduction === 0 && entry.staff_house_deduction === 0 && (
                          <p className="text-slate-500">-</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <p className="font-bold text-white">{formatCurrency(entry.total_salary)}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        entry.status === 'released' 
                          ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/50'
                          : entry.status === 'needs_recalculation'
                          ? 'bg-orange-900/20 text-orange-400 border border-orange-800/50'
                          : 'bg-yellow-900/20 text-yellow-400 border border-yellow-800/50'
                      }`}>
                        {entry.status === 'needs_recalculation' ? 'Needs Update' : entry.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {editingPayslip === entry.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={savePayslipEdit}
                            className="text-emerald-400 hover:text-emerald-300 p-1 rounded"
                            title="Save"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingPayslip(null)}
                            className="text-red-400 hover:text-red-300 p-1 rounded"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleEditPayslip(entry)}
                          className="text-blue-400 hover:text-blue-300 p-1 rounded"
                          title="Edit Payslip"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="bg-slate-700/30 p-4 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <PhilippinePeso className="w-10 h-10 text-slate-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No Payroll Data</h3>
          <p className="text-slate-400">Generate payslips for the selected period to view data.</p>
        </div>
      )}

      {/* Edit Modal */}
      {editingPayslip && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 w-full max-w-2xl border border-slate-700/50 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-white mb-6">Edit Payslip</h3>
            
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Clock In</label>
                <input
                  type="datetime-local"
                  value={editValues.clockIn}
                  onChange={(e) => setEditValues({ ...editValues, clockIn: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Clock Out</label>
                <input
                  type="datetime-local"
                  value={editValues.clockOut}
                  onChange={(e) => setEditValues({ ...editValues, clockOut: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Total Hours</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.totalHours}
                  onChange={(e) => setEditValues({ ...editValues, totalHours: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Overtime Hours</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.overtimeHours}
                  onChange={(e) => setEditValues({ ...editValues, overtimeHours: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Undertime Hours</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.undertimeHours}
                  onChange={(e) => setEditValues({ ...editValues, undertimeHours: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Base Salary</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.baseSalary}
                  onChange={(e) => setEditValues({ ...editValues, baseSalary: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Overtime Pay</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.overtimePay}
                  onChange={(e) => setEditValues({ ...editValues, overtimePay: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Undertime Deduction</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.undertimeDeduction}
                  onChange={(e) => setEditValues({ ...editValues, undertimeDeduction: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Staff House Deduction</label>
                <input
                  type="number"
                  step="0.01"
                  value={editValues.staffHouseDeduction}
                  onChange={(e) => setEditValues({ ...editValues, staffHouseDeduction: e.target.value })}
                  className="w-full bg-slate-700/50 border border-slate-600 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setEditingPayslip(null)}
                className="flex-1 bg-slate-700/50 text-slate-300 py-3 px-4 rounded-lg font-medium hover:bg-slate-600/50 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={savePayslipEdit}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 text-white py-3 px-4 rounded-lg font-medium hover:from-emerald-600 hover:to-green-700 transition-all duration-200"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}