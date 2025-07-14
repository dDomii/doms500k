import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Calendar, 
  PhilippinePeso, 
  Download, 
  Users, 
  Clock, 
  TrendingUp, 
  FileText, 
  Edit3, 
  Save, 
  X, 
  AlertTriangle,
  Filter,
  Search,
  Eye,
  CheckCircle
} from 'lucide-react';

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
}

interface User {
  id: number;
  username: string;
  department: string;
  active: boolean;
}

interface AvailableDate {
  entry_date: string;
  user_count: number;
  total_entries: number;
}

const DEPARTMENTS = [
  'Human Resource',
  'Marketing', 
  'Finance',
  'Account Management',
  'System Automation',
  'Sales',
  'Training',
  'IT Department'
];

export function PayrollReports() {
  const [payrollData, setPayrollData] = useState<PayrollEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);
  const [editForm, setEditForm] = useState({
    clockIn: '',
    clockOut: '',
    totalHours: 0,
    overtimeHours: 0,
    undertimeHours: 0,
    baseSalary: 0,
    overtimePay: 0,
    undertimeDeduction: 0,
    staffHouseDeduction: 0
  });
  const { token } = useAuth();

  useEffect(() => {
    fetchUsers();
    fetchAvailableDates();
  }, []);

  useEffect(() => {
    if (selectedDates.length > 0) {
      fetchPayrollData();
    } else {
      setPayrollData([]);
    }
  }, [selectedDates, selectedUsers]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('http://192.168.100.60:3001/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    }
  };

  const fetchAvailableDates = async () => {
    try {
      const userIdsParam = selectedUsers.length > 0 ? `?userIds=${selectedUsers.join(',')}` : '';
      const response = await fetch(`http://192.168.100.60:3001/api/available-dates${userIdsParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setAvailableDates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching available dates:', error);
      setAvailableDates([]);
    }
  };

  const fetchPayrollData = async () => {
    if (selectedDates.length === 0) {
      setPayrollData([]);
      return;
    }

    setLoading(true);
    try {
      const selectedDatesParam = selectedDates.join(',');
      const response = await fetch(`http://192.168.100.60:3001/api/payroll-report?selectedDates=${selectedDatesParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      console.log('Payroll data received:', await response.clone().json());
      
      if (response.ok) {
        const data = await response.json();
        setPayrollData(Array.isArray(data) ? data : []);
      } else {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        setPayrollData([]);
      }
    } catch (error) {
      console.error('Error fetching payroll data:', error);
      setPayrollData([]);
    }
    setLoading(false);
  };

  const generatePayslips = async () => {
    if (selectedDates.length === 0) {
      alert('Please select at least one date');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch('http://192.168.100.60:3001/api/payslips/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          selectedDates,
          userIds: selectedUsers.length > 0 ? selectedUsers : null
        }),
      });

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        alert(`Successfully generated ${data.length} payslips!`);
        fetchPayrollData();
      } else {
        alert('No payslips were generated. Check if users have valid time entries for the selected dates.');
      }
    } catch (error) {
      console.error('Error generating payslips:', error);
      alert('Failed to generate payslips');
    }
    setGenerating(false);
  };

  const releasePayslips = async () => {
    if (selectedDates.length === 0) {
      alert('Please select dates to release payslips');
      return;
    }

    const confirmRelease = window.confirm(
      `Are you sure you want to release payslips for the selected dates? This action cannot be undone.`
    );

    if (!confirmRelease) return;

    setReleasing(true);
    try {
      const response = await fetch('http://192.168.100.60:3001/api/payslips/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          selectedDates,
          userIds: selectedUsers.length > 0 ? selectedUsers : null
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(data.message || 'Payslips released successfully!');
        fetchPayrollData();
      } else {
        alert(data.message || 'Failed to release payslips');
      }
    } catch (error) {
      console.error('Error releasing payslips:', error);
      alert('Failed to release payslips');
    }
    setReleasing(false);
  };

  const handleDateToggle = (date: string) => {
    setSelectedDates(prev => 
      prev.includes(date) 
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  };

  const handleUserToggle = (userId: number) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleEditEntry = (entry: PayrollEntry) => {
    setEditingEntry(entry);
    setEditForm({
      clockIn: entry.clock_in_time ? new Date(entry.clock_in_time).toISOString().slice(0, 16) : '',
      clockOut: entry.clock_out_time ? new Date(entry.clock_out_time).toISOString().slice(0, 16) : '',
      totalHours: entry.total_hours,
      overtimeHours: entry.overtime_hours,
      undertimeHours: entry.undertime_hours,
      baseSalary: entry.base_salary,
      overtimePay: entry.overtime_pay,
      undertimeDeduction: entry.undertime_deduction,
      staffHouseDeduction: entry.staff_house_deduction
    });
    setShowEditModal(true);
  };

  const calculateFromTimes = () => {
    if (!editForm.clockIn || !editForm.clockOut) return;

    const clockIn = new Date(editForm.clockIn);
    const clockOut = new Date(editForm.clockOut);
    
    // Define shift start time (7:00 AM)
    const shiftStart = new Date(clockIn);
    shiftStart.setHours(7, 0, 0, 0);
    
    // Define shift end time (3:30 PM)
    const shiftEnd = new Date(clockIn);
    shiftEnd.setHours(15, 30, 0, 0);
    
    // Work hours only count from 7:00 AM onwards
    const effectiveClockIn = clockIn < shiftStart ? shiftStart : clockIn;
    
    // Calculate worked hours from 7:00 AM onwards only
    const workedHours = Math.max(0, (clockOut.getTime() - effectiveClockIn.getTime()) / (1000 * 60 * 60));
    
    // Check for late clock in (after 7:00 AM)
    let undertimeHours = 0;
    if (clockIn > shiftStart) {
      undertimeHours = (clockIn.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
    }
    
    // Calculate overtime (after 3:30 PM) - but don't automatically add overtime pay
    // Overtime pay should only be added if there was an approved overtime request
    let overtimeHours = 0;
    if (clockOut > shiftEnd) {
      overtimeHours = Math.max(0, (clockOut.getTime() - shiftEnd.getTime()) / (1000 * 60 * 60));
    }
    
    // Calculate base salary (capped at ₱200 for 8.5 hours)
    const standardHoursPerDay = 8.5;
    const maxBasePay = 200;
    const hourlyRate = 200 / 8.5; // ₱23.53 per hour
    
    const dailyBaseHours = Math.min(workedHours, standardHoursPerDay);
    const baseSalary = Math.min(dailyBaseHours * hourlyRate, maxBasePay);
    
    // Don't automatically calculate overtime pay - it should be manually set based on approved requests
    const overtimePay = 0; // Admin needs to manually set this based on approved overtime requests
    const undertimeDeduction = undertimeHours * hourlyRate;
    
    setEditForm(prev => ({
      ...prev,
      totalHours: parseFloat(workedHours.toFixed(2)),
      overtimeHours: parseFloat(overtimeHours.toFixed(2)),
      undertimeHours: parseFloat(undertimeHours.toFixed(2)),
      baseSalary: parseFloat(baseSalary.toFixed(2)),
      overtimePay: parseFloat(overtimePay.toFixed(2)),
      undertimeDeduction: parseFloat(undertimeDeduction.toFixed(2))
    }));
  };

  const saveEditedEntry = async () => {
    if (!editingEntry) return;

    try {
      const response = await fetch(`http://192.168.100.60:3001/api/payroll/${editingEntry.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });

      const data = await response.json();
      if (data.success) {
        setShowEditModal(false);
        setEditingEntry(null);
        fetchPayrollData();
        alert('Payroll entry updated successfully!');
      } else {
        alert(data.message || 'Failed to update payroll entry');
      }
    } catch (error) {
      console.error('Error updating payroll entry:', error);
      alert('Failed to update payroll entry');
    }
  };

  const exportToCSV = () => {
    if (!Array.isArray(payrollData) || payrollData.length === 0) return;

    const headers = [
      'Date',
      'Employee',
      'Department',
      'Clock In',
      'Clock Out',
      'Total Hours',
      'Overtime Hours',
      'Undertime Hours',
      'Base Salary (₱)',
      'Overtime Pay (₱)',
      'Undertime Deduction (₱)',
      'Staff House Deduction (₱)',
      'Total Salary (₱)',
      'Status'
    ];

    const rows = payrollData.map(entry => [
      entry.week_start,
      entry.username,
      entry.department,
      entry.clock_in_time ? new Date(entry.clock_in_time).toLocaleTimeString() : 'N/A',
      entry.clock_out_time ? new Date(entry.clock_out_time).toLocaleTimeString() : 'N/A',
      entry.total_hours,
      entry.overtime_hours,
      entry.undertime_hours,
      entry.base_salary,
      entry.overtime_pay,
      entry.undertime_deduction,
      entry.staff_house_deduction,
      entry.total_salary,
      entry.status
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payroll_report_${selectedDates.join('_')}.csv`;
    link.click();
  };

  const formatCurrency = (amount: number) => {
    const numAmount = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
    return `₱${numAmount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A';
    return new Date(timeString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Filter payroll data based on search and department
  const filteredPayrollData = Array.isArray(payrollData) ? payrollData.filter(entry => {
    const matchesSearch = entry.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         entry.department.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = selectedDepartment === '' || entry.department === selectedDepartment;
    return matchesSearch && matchesDepartment;
  }) : [];

  // Filter users based on department
  const filteredUsers = Array.isArray(users) ? users.filter(user => {
    const matchesDepartment = selectedDepartment === '' || user.department === selectedDepartment;
    return user.active && matchesDepartment;
  }) : [];

  // Calculate statistics
  const totalPayslips = filteredPayrollData.length;
  const totalSalary = filteredPayrollData.reduce((sum, entry) => sum + (parseFloat(entry.total_salary) || 0), 0);
  const totalHours = filteredPayrollData.reduce((sum, entry) => sum + (parseFloat(entry.total_hours) || 0), 0);
  const totalOvertimeHours = filteredPayrollData.reduce((sum, entry) => sum + (parseFloat(entry.overtime_hours) || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Payroll Management</h2>
          <p className="text-slate-400">Generate and manage daily payslips for employees</p>
        </div>
        <div className="flex items-center gap-4">
          {filteredPayrollData.length > 0 && (
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

      {/* Statistics Cards */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Payslips</p>
              <p className="text-2xl font-bold text-white">{totalPayslips}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 p-3 rounded-lg">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Salary</p>
              <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalSalary)}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/20 p-3 rounded-lg">
              <PhilippinePeso className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Hours</p>
              <p className="text-2xl font-bold text-blue-400">{totalHours.toFixed(1)}h</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 p-3 rounded-lg">
              <Clock className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Overtime Hours</p>
              <p className="text-2xl font-bold text-orange-400">{totalOvertimeHours.toFixed(1)}h</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/20 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Controls Section */}
      <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-6 mb-6 shadow-lg border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Payroll Controls</h3>
        
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Date Selection */}
          <div>
            <h4 className="text-md font-medium text-white mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              Select Dates
            </h4>
            <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600/50 max-h-60 overflow-y-auto">
              {availableDates.length > 0 ? (
                <div className="space-y-2">
                  {availableDates.map((dateInfo) => (
                    <label key={dateInfo.entry_date} className="flex items-center gap-3 p-2 hover:bg-slate-600/30 rounded-lg transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedDates.includes(dateInfo.entry_date)}
                        onChange={() => handleDateToggle(dateInfo.entry_date)}
                        className="rounded border-slate-600 text-emerald-600 focus:ring-emerald-500 bg-slate-700/50"
                      />
                      <div className="flex-1">
                        <span className="text-white font-medium">{formatDate(dateInfo.entry_date)}</span>
                        <div className="text-xs text-slate-400">
                          {dateInfo.user_count} users • {dateInfo.total_entries} entries
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-4">No dates with time entries found</p>
              )}
            </div>
          </div>

          {/* User Selection */}
          <div>
            <h4 className="text-md font-medium text-white mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              Select Users (Optional)
            </h4>
            
            {/* Department Filter */}
            <div className="mb-3">
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white text-sm"
              >
                <option value="">All Departments</option>
                {DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            
            <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600/50 max-h-48 overflow-y-auto">
              {filteredUsers.length > 0 ? (
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2 hover:bg-slate-600/30 rounded-lg transition-colors font-medium text-emerald-400">
                    <input
                      type="checkbox"
                      checked={selectedUsers.length === filteredUsers.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUsers(filteredUsers.map(user => user.id));
                        } else {
                          setSelectedUsers([]);
                        }
                      }}
                      className="rounded border-slate-600 text-emerald-600 focus:ring-emerald-500 bg-slate-700/50"
                    />
                    <span>Select All ({filteredUsers.length})</span>
                  </label>
                  {filteredUsers.map((user) => (
                    <label key={user.id} className="flex items-center gap-3 p-2 hover:bg-slate-600/30 rounded-lg transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => handleUserToggle(user.id)}
                        className="rounded border-slate-600 text-emerald-600 focus:ring-emerald-500 bg-slate-700/50"
                      />
                      <div className="flex-1">
                        <span className="text-white">{user.username}</span>
                        <div className="text-xs text-slate-400">{user.department}</div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-4">
                  {selectedDepartment ? `No active users in ${selectedDepartment}` : 'No active users found'}
                </p>
              )}
            </div>
            
            {selectedUsers.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">
                Leave empty to generate for all users with time entries
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mt-6 pt-4 border-t border-slate-700/50">
          <button
            onClick={generatePayslips}
            disabled={generating || selectedDates.length === 0}
            className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-3 rounded-lg font-medium hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 btn-enhanced flex items-center gap-2 shadow-lg"
          >
            <FileText className="w-4 h-4" />
            {generating ? 'Generating...' : 'Generate Payslips'}
          </button>
          
          <button
            onClick={releasePayslips}
            disabled={releasing || selectedDates.length === 0}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 btn-enhanced flex items-center gap-2 shadow-lg"
          >
            <CheckCircle className="w-4 h-4" />
            {releasing ? 'Releasing...' : 'Release Payslips'}
          </button>
        </div>
      </div>

      {/* Important Notes */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Important Note */}
        <div className="bg-orange-900/20 p-4 rounded-lg border border-orange-800/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orange-400 mb-1">Overtime Pay Policy</p>
              <p className="text-xs text-orange-300">
                Overtime pay should only be added when the employee has submitted an overtime request 
                that was approved by an administrator. Check the overtime requests section to verify 
                approval before adding overtime compensation.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-400 mb-1">Payroll Calculation Rules</p>
              <ul className="text-xs text-blue-300 space-y-1">
                <li>• Work hours only count from 7:00 AM onwards</li>
                <li>• Base pay is capped at ₱200 for 8.5 hours (₱23.53/hour)</li>
                <li>• Overtime pay (₱35/hour) only applies to approved overtime requests</li>
                <li>• Late clock-in (after 7:00 AM) incurs undertime deduction</li>
                <li>• Overtime hours are calculated but pay requires manual approval</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      {filteredPayrollData.length > 0 && (
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 mb-6 shadow-lg border border-slate-700/50">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-slate-400"
                  placeholder="Search by employee name or department..."
                />
              </div>
            </div>
            <div className="w-48">
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                >
                  <option value="">All Departments</option>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payroll Data Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading payroll data...</p>
        </div>
      ) : filteredPayrollData.length > 0 ? (
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden border border-slate-700/50">
          <div className="bg-slate-700/50 px-6 py-4 border-b border-slate-600/50">
            <h3 className="text-lg font-semibold text-white">
              Payroll Report • {filteredPayrollData.length} entries
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Selected dates: {selectedDates.map(date => formatDate(date)).join(', ')}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300">Employee</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300">Date</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-300">Time</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-300">Hours</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-300">Base Pay</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-300">Overtime</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-300">Deductions</th>
                  <th className="text-right py-3 px-4 font-semibold text-slate-300">Total</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-300">Status</th>
                  <th className="text-center py-3 px-4 font-semibold text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredPayrollData.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium text-white">{entry.username}</p>
                        <p className="text-sm text-slate-400">{entry.department}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-white">{formatDate(entry.week_start)}</p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm">
                        <p className="text-slate-300">In: {formatTime(entry.clock_in_time)}</p>
                        <p className="text-slate-400">Out: {formatTime(entry.clock_out_time)}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div>
                        <p className="text-white">{(parseFloat(entry.total_hours) || 0).toFixed(2)}h</p>
                        {(parseFloat(entry.overtime_hours) || 0) > 0 && (
                          <p className="text-sm text-orange-400">+{(parseFloat(entry.overtime_hours) || 0).toFixed(2)}h OT</p>
                        )}
                        {(parseFloat(entry.undertime_hours) || 0) > 0 && (
                          <p className="text-sm text-red-400">-{(parseFloat(entry.undertime_hours) || 0).toFixed(2)}h UT</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-white">
                      {formatCurrency(parseFloat(entry.base_salary) || 0)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-400">
                      {(parseFloat(entry.overtime_pay) || 0) > 0 ? formatCurrency(parseFloat(entry.overtime_pay) || 0) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right text-red-400">
                      {((parseFloat(entry.undertime_deduction) || 0) + (parseFloat(entry.staff_house_deduction) || 0)) > 0 
                        ? formatCurrency((parseFloat(entry.undertime_deduction) || 0) + (parseFloat(entry.staff_house_deduction) || 0)) 
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <p className="font-bold text-white">{formatCurrency(parseFloat(entry.total_salary) || 0)}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        entry.status === 'released' 
                          ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/50'
                          : 'bg-yellow-900/20 text-yellow-400 border border-yellow-800/50'
                      }`}>
                        {entry.status === 'released' ? 'Released' : 'Pending'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleEditEntry(entry)}
                        className="text-blue-400 hover:text-blue-300 p-1.5 rounded-lg hover:bg-blue-900/30 transition-all duration-200"
                        title="Edit Entry"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedDates.length > 0 ? (
        <div className="text-center py-12">
          <div className="bg-slate-700/30 p-4 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <FileText className="w-10 h-10 text-slate-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No Payroll Data</h3>
          <p className="text-slate-400">
            No payroll records found for the selected dates. Generate payslips first.
          </p>
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="bg-slate-700/30 p-4 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <Calendar className="w-10 h-10 text-slate-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Select Dates</h3>
          <p className="text-slate-400">
            Choose dates from the available options to view or generate payroll data.
          </p>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingEntry && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 w-full max-w-2xl border border-slate-700/50 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-6">
              <Edit3 className="w-6 h-6 text-blue-400" />
              <div>
                <h3 className="text-xl font-semibold text-white">Edit Payroll Entry</h3>
                <p className="text-slate-400">{editingEntry.username} - {formatDate(editingEntry.week_start)}</p>
              </div>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Clock In Time
                </label>
                <input
                  type="datetime-local"
                  value={editForm.clockIn}
                  onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
                  className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Clock Out Time
                </label>
                <input
                  type="datetime-local"
                  value={editForm.clockOut}
                  onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
                  className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                />
              </div>
            </div>

            <div className="mb-6">
              <button
                onClick={calculateFromTimes}
                className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:from-purple-600 hover:to-purple-700 transition-all duration-200 flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Calculate from Times
              </button>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Total Hours
                </label>
                <input
                  type="number"
                  value={editForm.totalHours}
                  onChange={(e) => setEditForm({ ...editForm, totalHours: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  step="0.01"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Overtime Hours
                </label>
                <input
                  type="number"
                  value={editForm.overtimeHours}
                  onChange={(e) => setEditForm({ ...editForm, overtimeHours: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  step="0.01"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Undertime Hours
                </label>
                <input
                  type="number"
                  value={editForm.undertimeHours}
                  onChange={(e) => setEditForm({ ...editForm, undertimeHours: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  step="0.01"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Base Salary (₱)
                </label>
                <input
                  type="number"
                  value={editForm.baseSalary}
                  onChange={(e) => setEditForm({ ...editForm, baseSalary: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  step="0.01"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Overtime Pay (₱)
                </label>
                <input
                  type="number"
                  value={editForm.overtimePay}
                  onChange={(e) => setEditForm({ ...editForm, overtimePay: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  step="0.01"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Undertime Deduction (₱)
                </label>
                <input
                  type="number"
                  value={editForm.undertimeDeduction}
                  onChange={(e) => setEditForm({ ...editForm, undertimeDeduction: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  step="0.01"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Staff House Deduction (₱)
                </label>
                <input
                  type="number"
                  value={editForm.staffHouseDeduction}
                  onChange={(e) => setEditForm({ ...editForm, staffHouseDeduction: parseFloat(e.target.value) || 0 })}
                  className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                  step="0.01"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Total Salary (₱)
                </label>
                <div className="w-full p-3 bg-slate-600/30 border border-slate-600 rounded-lg text-white font-bold">
                  {formatCurrency(
                    editForm.baseSalary + editForm.overtimePay - editForm.undertimeDeduction - editForm.staffHouseDeduction
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingEntry(null);
                }}
                className="flex-1 bg-slate-700/50 text-slate-300 py-3 px-4 rounded-lg font-medium hover:bg-slate-600/50 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={saveEditedEntry}
                className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}