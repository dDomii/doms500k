import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Calendar, 
  PhilippinePeso, 
  Users, 
  Download, 
  FileText, 
  Edit3, 
  Save, 
  X, 
  AlertTriangle,
  Eye,
  Clock,
  CheckCircle,
  RefreshCw,
  Play,
  Filter,
  Search
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

interface AvailableDate {
  entry_date: string;
  user_count: number;
  total_entries: number;
}

interface TimeEntry {
  id: number;
  user_id: number;
  username: string;
  department: string;
  clock_in: string;
  clock_out: string;
  overtime_requested: boolean;
  overtime_approved: boolean;
  overtime_note: string;
}

type GenerationMode = 'specific-dates' | 'date-range' | 'weekly';

export function PayrollReports() {
  const [payrollData, setPayrollData] = useState<PayrollEntry[]>([]);
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('specific-dates');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingEntry, setEditingEntry] = useState<PayrollEntry | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<TimeEntry[]>([]);
  const [previewDate, setPreviewDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
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

  useEffect(() => {
    fetchAvailableDates();
    // Set current week as default
    const today = new Date();
    const currentWeekStart = getWeekStart(today);
    setWeekStart(currentWeekStart);
  }, []);

  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
  };

  const fetchAvailableDates = async () => {
    try {
      const response = await fetch('http://192.168.100.60:3001/api/available-dates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setAvailableDates(data);
    } catch (error) {
      console.error('Error fetching available dates:', error);
    }
  };

  const previewTimeEntries = async (date: string) => {
    try {
      setPreviewDate(date);
      const response = await fetch(`http://192.168.100.60:3001/api/time-entries-for-date?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setPreviewEntries(data);
      setShowPreviewModal(true);
    } catch (error) {
      console.error('Error fetching time entries:', error);
    }
  };

  const generatePayslips = async () => {
    setGenerating(true);
    try {
      let requestBody: any = {};
      
      if (generationMode === 'specific-dates' && selectedDates.length > 0) {
        requestBody.selectedDates = selectedDates;
      } else if (generationMode === 'date-range' && startDate && endDate) {
        requestBody.startDate = startDate;
        requestBody.endDate = endDate;
      } else if (generationMode === 'weekly' && weekStart) {
        requestBody.weekStart = weekStart;
      } else {
        alert('Please select dates or date range for payslip generation');
        setGenerating(false);
        return;
      }

      console.log('Generating payslips with:', requestBody);

      const response = await fetch('http://192.168.100.60:3001/api/payslips/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log('Generated payslips:', data);
        alert(`Successfully generated ${data.length} payslips!`);
        // Refresh the payroll data
        await fetchPayrollData();
      } else {
        console.error('Generation failed:', data);
        alert(data.message || 'Failed to generate payslips');
      }
    } catch (error) {
      console.error('Error generating payslips:', error);
      alert('Failed to generate payslips');
    }
    setGenerating(false);
  };

  const fetchPayrollData = async () => {
    if ((!selectedDates.length && generationMode === 'specific-dates') && 
        (!startDate || !endDate) && generationMode === 'date-range' && 
        (!weekStart && generationMode === 'weekly')) {
      return;
    }

    setLoading(true);
    try {
      let url = 'http://192.168.100.60:3001/api/payroll-report';
      const params = new URLSearchParams();

      if (generationMode === 'specific-dates' && selectedDates.length > 0) {
        params.append('selectedDates', selectedDates.join(','));
      } else if (generationMode === 'date-range' && startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      } else if (generationMode === 'weekly' && weekStart) {
        params.append('weekStart', weekStart);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      console.log('Fetching payroll data from:', url);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      console.log('Payroll data received:', data);
      setPayrollData(data);
    } catch (error) {
      console.error('Error fetching payroll data:', error);
      setPayrollData([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPayrollData();
  }, [selectedDates, startDate, endDate, weekStart, generationMode]);

  const handleDateToggle = (date: string) => {
    setSelectedDates(prev => 
      prev.includes(date) 
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  };

  const handleEditStart = (entry: PayrollEntry) => {
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

  const handleEditSave = async () => {
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
        await fetchPayrollData();
        setEditingEntry(null);
        alert('Payroll entry updated successfully!');
      } else {
        alert(data.message || 'Failed to update payroll entry');
      }
    } catch (error) {
      console.error('Error updating payroll entry:', error);
      alert('Failed to update payroll entry');
    }
  };

  const releasePayslips = async () => {
    if (generationMode === 'specific-dates' && selectedDates.length === 0) {
      alert('Please select dates to release payslips');
      return;
    }

    if (generationMode === 'date-range' && (!startDate || !endDate)) {
      alert('Please select start and end dates');
      return;
    }

    if (generationMode === 'weekly' && !weekStart) {
      alert('Please select a week');
      return;
    }

    try {
      let requestBody: any = {};
      
      if (generationMode === 'specific-dates') {
        requestBody.selectedDates = selectedDates;
      } else if (generationMode === 'date-range') {
        requestBody.startDate = startDate;
        requestBody.endDate = endDate;
      } else if (generationMode === 'weekly') {
        requestBody.weekStart = weekStart;
      }

      const response = await fetch('http://192.168.100.60:3001/api/payslips/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (data.success) {
        alert(data.message);
        await fetchPayrollData();
      } else {
        alert(data.message || 'Failed to release payslips');
      }
    } catch (error) {
      console.error('Error releasing payslips:', error);
      alert('Failed to release payslips');
    }
  };

  const exportToCSV = () => {
    if (payrollData.length === 0) return;

    const headers = [
      'Employee',
      'Department',
      'Date',
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
      entry.username,
      entry.department,
      entry.week_start === entry.week_end ? entry.week_start : `${entry.week_start} to ${entry.week_end}`,
      entry.clock_in_time ? new Date(entry.clock_in_time).toLocaleString() : 'N/A',
      entry.clock_out_time ? new Date(entry.clock_out_time).toLocaleString() : 'N/A',
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
    link.download = `payroll_report_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const formatCurrency = (amount: number) => {
    return `₱${amount.toFixed(2)}`;
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

  // Filter available dates based on search
  const filteredAvailableDates = availableDates.filter(date => 
    date.entry_date.includes(searchTerm) ||
    formatDate(date.entry_date).toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter payroll data based on search and department
  if (payrollData && typeof payrollData === 'object') {
  const payrollArray = Object.values(payrollData);
  const filteredPayrollData = payrollArray.filter(entry => {
    const matchesSearch = entry.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          entry.department.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = departmentFilter === '' || entry.department === departmentFilter;
    return matchesSearch && matchesDepartment;
  });
} else {
  console.error('payrollData is not an object:', payrollData);
}

  const totalSalary = filteredPayrollData.reduce((sum, entry) => sum + entry.total_salary, 0);
  const totalHours = filteredPayrollData.reduce((sum, entry) => sum + entry.total_hours, 0);
  const pendingCount = filteredPayrollData.filter(entry => entry.status === 'pending').length;
  const releasedCount = filteredPayrollData.filter(entry => entry.status === 'released').length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Payroll Management</h2>
          <p className="text-slate-400">Generate and manage employee payslips</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchAvailableDates}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center gap-2 shadow-lg"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {filteredPayrollData.length > 0 && (
            <button
              onClick={exportToCSV}
              className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-4 py-2 rounded-lg font-medium hover:from-emerald-600 hover:to-green-700 transition-all duration-200 flex items-center gap-2 shadow-lg"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Generation Mode Selector */}
      <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-6 mb-6 shadow-lg border border-slate-700/50">
        <h3 className="text-lg font-semibold text-white mb-4">Payslip Generation</h3>
        
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => setGenerationMode('specific-dates')}
            className={`p-4 rounded-lg border transition-all duration-200 ${
              generationMode === 'specific-dates'
                ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400'
                : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-slate-600/30'
            }`}
          >
            <Calendar className="w-6 h-6 mx-auto mb-2" />
            <p className="font-medium">Specific Dates</p>
            <p className="text-xs opacity-75">Select individual dates</p>
          </button>
          
          <button
            onClick={() => setGenerationMode('date-range')}
            className={`p-4 rounded-lg border transition-all duration-200 ${
              generationMode === 'date-range'
                ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400'
                : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-slate-600/30'
            }`}
          >
            <Calendar className="w-6 h-6 mx-auto mb-2" />
            <p className="font-medium">Date Range</p>
            <p className="text-xs opacity-75">Select start and end dates</p>
          </button>
          
          <button
            onClick={() => setGenerationMode('weekly')}
            className={`p-4 rounded-lg border transition-all duration-200 ${
              generationMode === 'weekly'
                ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400'
                : 'bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-slate-600/30'
            }`}
          >
            <Calendar className="w-6 h-6 mx-auto mb-2" />
            <p className="font-medium">Weekly</p>
            <p className="text-xs opacity-75">Traditional weekly payroll</p>
          </button>
        </div>

        {/* Specific Dates Mode */}
        {generationMode === 'specific-dates' && (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Search Available Dates
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-slate-400"
                    placeholder="Search dates..."
                  />
                </div>
              </div>
            </div>
            
            <div className="bg-slate-700/30 p-4 rounded-lg mb-4">
              <h4 className="font-medium text-white mb-3">Available Dates with Time Entries</h4>
              {filteredAvailableDates.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto">
                  {filteredAvailableDates.map((date) => (
                    <div
                      key={date.entry_date}
                      className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                        selectedDates.includes(date.entry_date)
                          ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400'
                          : 'bg-slate-800/50 border-slate-600/50 text-slate-300 hover:bg-slate-700/50'
                      }`}
                      onClick={() => handleDateToggle(date.entry_date)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{formatDate(date.entry_date)}</p>
                          <p className="text-xs opacity-75">
                            {date.user_count} users • {date.total_entries} entries
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              previewTimeEntries(date.entry_date);
                            }}
                            className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-900/30"
                            title="Preview Time Entries"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {selectedDates.includes(date.entry_date) && (
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-center py-4">
                  {searchTerm ? 'No dates match your search.' : 'No available dates with time entries found.'}
                </p>
              )}
            </div>
            
            {selectedDates.length > 0 && (
              <div className="bg-emerald-900/20 p-3 rounded-lg border border-emerald-800/50">
                <p className="text-emerald-400 text-sm">
                  Selected {selectedDates.length} date{selectedDates.length > 1 ? 's' : ''}: {selectedDates.map(formatDate).join(', ')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Date Range Mode */}
        {generationMode === 'date-range' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
              />
            </div>
          </div>
        )}

        {/* Weekly Mode */}
        {generationMode === 'weekly' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Week Start Date
            </label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
            />
          </div>
        )}

        <div className="flex gap-4 mt-6">
          <button
            onClick={generatePayslips}
            disabled={generating || 
              (generationMode === 'specific-dates' && selectedDates.length === 0) ||
              (generationMode === 'date-range' && (!startDate || !endDate)) ||
              (generationMode === 'weekly' && !weekStart)
            }
            className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-3 rounded-lg font-medium hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 shadow-lg"
          >
            <Play className="w-4 h-4" />
            {generating ? 'Generating...' : 'Generate Payslips'}
          </button>
          
          <button
            onClick={releasePayslips}
            disabled={pendingCount === 0}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 shadow-lg"
          >
            <FileText className="w-4 h-4" />
            Release Payslips ({pendingCount})
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Payslips</p>
              <p className="text-2xl font-bold text-white">{filteredPayrollData.length}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 p-3 rounded-lg">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Amount</p>
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
              <p className="text-sm text-slate-400">Released</p>
              <p className="text-2xl font-bold text-orange-400">{releasedCount}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/20 p-3 rounded-lg">
              <Users className="w-6 h-6 text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      {filteredPayrollData.length > 0 && (
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-6 mb-6 shadow-lg border border-slate-700/50">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Search Employees
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-slate-400"
                  placeholder="Search by name or department..."
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Filter by Department
              </label>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
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

      {/* Important Note */}
      <div className="bg-orange-900/20 p-4 rounded-lg mb-6 border border-orange-800/50">
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

      <div className="bg-blue-900/20 p-4 rounded-lg mb-6 border border-blue-800/50">
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

      {/* Payroll Data Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading payroll data...</p>
        </div>
      ) : filteredPayrollData.length > 0 ? (
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg overflow-hidden border border-slate-700/50">
          <div className="bg-slate-700/50 px-6 py-4 border-b border-slate-600/50">
            <h3 className="text-lg font-semibold text-white">Payroll Entries</h3>
            <p className="text-sm text-slate-400">
              Showing {filteredPayrollData.length} entries • 
              Pending: {pendingCount} • Released: {releasedCount}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-700/30">
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
                      <p className="text-white">
                        {entry.week_start === entry.week_end 
                          ? formatDate(entry.week_start)
                          : `${formatDate(entry.week_start)} - ${formatDate(entry.week_end)}`
                        }
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm">
                        <p className="text-slate-300">In: {formatTime(entry.clock_in_time)}</p>
                        <p className="text-slate-400">Out: {formatTime(entry.clock_out_time)}</p>
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
                    <td className="py-3 px-4 text-right text-white">
                      {formatCurrency(entry.base_salary)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-400">
                      {entry.overtime_pay > 0 ? formatCurrency(entry.overtime_pay) : '-'}
                    </td>
                    <td className="py-3 px-4 text-right text-red-400">
                      {(entry.undertime_deduction + entry.staff_house_deduction) > 0 
                        ? formatCurrency(entry.undertime_deduction + entry.staff_house_deduction) 
                        : '-'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <p className="font-bold text-white">{formatCurrency(entry.total_salary)}</p>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        entry.status === 'released' 
                          ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-800/50'
                          : 'bg-yellow-900/20 text-yellow-400 border border-yellow-800/50'
                      }`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleEditStart(entry)}
                        className="text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-900/30 transition-all duration-200"
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
      ) : (
        <div className="text-center py-12">
          <div className="bg-slate-700/30 p-4 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <FileText className="w-10 h-10 text-slate-500" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">No Payroll Data</h3>
          <p className="text-slate-400">
            {generationMode === 'specific-dates' && selectedDates.length === 0
              ? 'Select dates to view or generate payslips.'
              : generationMode === 'date-range' && (!startDate || !endDate)
              ? 'Select start and end dates to view payroll data.'
              : generationMode === 'weekly' && !weekStart
              ? 'Select a week to view payroll data.'
              : 'No payroll data found for the selected period. Generate payslips first.'}
          </p>
        </div>
      )}

      {/* Time Entries Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden border border-slate-700/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-white">Time Entries Preview</h3>
                <p className="text-slate-400">{formatDate(previewDate)} • {previewEntries.length} entries</p>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="overflow-y-auto max-h-96">
              <table className="min-w-full">
                <thead className="bg-slate-700/50 sticky top-0">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-slate-300">Employee</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-300">Department</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-300">Clock In</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-300">Clock Out</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-300">Overtime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {previewEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-white">{entry.username}</td>
                      <td className="py-3 px-4 text-slate-300">{entry.department}</td>
                      <td className="py-3 px-4 text-emerald-400">{formatTime(entry.clock_in)}</td>
                      <td className="py-3 px-4 text-red-400">
                        {entry.clock_out ? formatTime(entry.clock_out) : 'Still active'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {entry.overtime_requested ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            entry.overtime_approved === null
                              ? 'bg-yellow-900/20 text-yellow-400'
                              : entry.overtime_approved
                              ? 'bg-emerald-900/20 text-emerald-400'
                              : 'bg-red-900/20 text-red-400'
                          }`}>
                            {entry.overtime_approved === null ? 'Pending' : entry.overtime_approved ? 'Approved' : 'Rejected'}
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 w-full max-w-2xl border border-slate-700/50 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-white">Edit Payroll Entry</h3>
                <p className="text-slate-400">{editingEntry.username} • {formatDate(editingEntry.week_start)}</p>
              </div>
              <button
                onClick={() => setEditingEntry(null)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Time Section */}
              <div className="bg-slate-700/30 p-4 rounded-lg">
                <h4 className="font-medium text-white mb-4">Time Information</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Clock In
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.clockIn}
                      onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Clock Out
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.clockOut}
                      onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                    />
                  </div>
                </div>
                <button
                  onClick={calculateFromTimes}
                  className="mt-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
                >
                  Calculate from Times
                </button>
              </div>

              {/* Hours Section */}
              <div className="bg-slate-700/30 p-4 rounded-lg">
                <h4 className="font-medium text-white mb-4">Hours Breakdown</h4>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Total Hours
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.totalHours}
                      onChange={(e) => setEditForm({ ...editForm, totalHours: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Overtime Hours
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.overtimeHours}
                      onChange={(e) => setEditForm({ ...editForm, overtimeHours: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Undertime Hours
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.undertimeHours}
                      onChange={(e) => setEditForm({ ...editForm, undertimeHours: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Salary Section */}
              <div className="bg-slate-700/30 p-4 rounded-lg">
                <h4 className="font-medium text-white mb-4">Salary Breakdown</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Base Salary (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.baseSalary}
                      onChange={(e) => setEditForm({ ...editForm, baseSalary: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Overtime Pay (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.overtimePay}
                      onChange={(e) => setEditForm({ ...editForm, overtimePay: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Undertime Deduction (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.undertimeDeduction}
                      onChange={(e) => setEditForm({ ...editForm, undertimeDeduction: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Staff House Deduction (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.staffHouseDeduction}
                      onChange={(e) => setEditForm({ ...editForm, staffHouseDeduction: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Total Calculation */}
              <div className="bg-emerald-900/20 p-4 rounded-lg border border-emerald-800/50">
                <div className="flex justify-between items-center">
                  <span className="text-emerald-400 font-medium">Total Salary:</span>
                  <span className="text-2xl font-bold text-emerald-400">
                    {formatCurrency(editForm.baseSalary + editForm.overtimePay - editForm.undertimeDeduction - editForm.staffHouseDeduction)}
                  </span>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setEditingEntry(null)}
                  className="flex-1 bg-slate-700/50 text-slate-300 py-3 px-4 rounded-lg font-medium hover:bg-slate-600/50 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 text-white py-3 px-4 rounded-lg font-medium hover:from-emerald-600 hover:to-green-700 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}