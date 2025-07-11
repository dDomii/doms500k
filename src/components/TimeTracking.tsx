import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Play, Square, MessageSquare, AlertCircle, Home, BarChart3, X, Target, TrendingUp, Edit3, Check } from 'lucide-react';
import { PayrollHistory } from './PayrollHistory';

interface TimeEntry {
  id: number;
  clock_in: string;
  clock_out: string | null;
  overtime_requested: boolean;
  overtime_note: string | null;
}

interface HoursProgress {
  requiredHours: number;
  workedHours: number;
  remainingHours: number;
  progressPercentage: number;
  isCompleted: boolean;
}

type TabType = 'time-tracking' | 'payroll-history';

export function TimeTracking() {
  const [activeTab, setActiveTab] = useState<TabType>('time-tracking');
  const [todayEntry, setTodayEntry] = useState<TimeEntry | null>(null);
  const [overtimeNote, setOvertimeNote] = useState('');
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [hoursProgress, setHoursProgress] = useState<HoursProgress | null>(null);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [newRequiredHours, setNewRequiredHours] = useState('');
  const { token, user } = useAuth();

  useEffect(() => {
    fetchTodayEntry();
    fetchOvertimeNotifications();
    fetchHoursProgress();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Check if it's a new day and reset the entry
    const checkNewDay = () => {
      const today = new Date().toISOString().split('T')[0];
      const lastCheck = localStorage.getItem('lastCheckDate');
      
      if (lastCheck !== today) {
        localStorage.setItem('lastCheckDate', today);
        // If it's a new day, refresh the today entry
        fetchTodayEntry();
      }
    };

    checkNewDay();
    // Check every minute for new day
    const dayCheckInterval = setInterval(checkNewDay, 60000);
    
    return () => clearInterval(dayCheckInterval);
  }, []);

  const fetchTodayEntry = async () => {
    try {
      const response = await fetch('http://192.168.100.60:3001/api/today-entry', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setTodayEntry(data);
    } catch (error) {
      console.error('Error fetching today entry:', error);
    }
  };

  const fetchHoursProgress = async () => {
    try {
      const response = await fetch('http://192.168.100.60:3001/api/user-hours-progress', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setHoursProgress(data);
    } catch (error) {
      console.error('Error fetching hours progress:', error);
    }
  };

  const updateRequiredHours = async () => {
    const hours = parseFloat(newRequiredHours);
    if (isNaN(hours) || hours < 0) {
      alert('Please enter a valid number of hours');
      return;
    }

    try {
      const response = await fetch('http://192.168.100.60:3001/api/user-required-hours', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requiredHours: hours }),
      });

      const data = await response.json();
      if (data.success) {
        setShowHoursModal(false);
        setNewRequiredHours('');
        fetchHoursProgress();
        alert('Required hours updated successfully!');
      } else {
        alert(data.message || 'Failed to update required hours');
      }
    } catch (error) {
      console.error('Error updating required hours:', error);
      alert('Failed to update required hours');
    }
  };

  const fetchOvertimeNotifications = async () => {
    try {
      const response = await fetch('http://192.168.100.60:3001/api/overtime-notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.length > 0) {
        setNotifications(data);
        setShowNotifications(true);
      }
    } catch (error) {
      console.error('Error fetching overtime notifications:', error);
    }
  };

  const handleClockIn = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://192.168.100.60:3001/api/clock-in', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (data.success) {
        await fetchTodayEntry();
      } else {
        // If already clocked in, show option to reset only if they don't have an entry
        if (data.message && data.message.includes('Already clocked in') && data.hasEntry) {
          const shouldReset = window.confirm('You already clocked in today. Do you want to start a new clock-in session? This will replace your current entry.');
          if (shouldReset) {
            await resetAndClockIn();
          }
        } else if (data.message && data.message.includes('Already clocked in')) {
          // User is currently clocked in but hasn't clocked out yet
          alert('You are already clocked in. Please clock out first before starting a new session.');
        } else {
          alert(data.message || 'Failed to clock in');
        }
      }
    } catch (error) {
      console.error('Clock in error:', error);
      alert('Failed to clock in');
    }
    setIsLoading(false);
  };

  const resetAndClockIn = async () => {
    try {
      const response = await fetch('http://192.168.100.60:3001/api/reset-clock-in', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      
      if (data.success) {
        await fetchTodayEntry();
      } else {
        alert(data.message || 'Failed to reset clock in');
      }
    } catch (error) {
      console.error('Reset clock in error:', error);
      alert('Failed to reset clock in');
    }
  };

  const handleClockOut = async () => {
    // Simple clock out without overtime logic
    await performClockOut();
  };

  const performClockOut = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://192.168.100.60:3001/api/clock-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ overtimeNote }),
      });
      const data = await response.json();
      
      if (data.success) {
        await fetchTodayEntry();
        setShowOvertimeModal(false);
        setOvertimeNote('');
        
        if (data.overtimeRequested) {
          alert('Overtime request submitted for admin approval!');
        }
      } else {
        alert(data.message || 'Failed to clock out');
      }
    } catch (error) {
      console.error('Clock out error:', error);
      alert('Failed to clock out');
    }
    setIsLoading(false);
  };

  const submitOvertimeRequest = async () => {
    if (!overtimeNote.trim()) {
      alert('Please provide a reason for overtime');
      return;
    }

    setIsLoading(true);
    try {
      // Submit standalone overtime request (separate from clock out)
      const response = await fetch('http://192.168.100.60:3001/api/overtime-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          overtimeNote,
          date: new Date().toISOString().split('T')[0]
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowOvertimeModal(false);
        setOvertimeNote('');
        alert('Overtime request submitted for admin approval!');
        await fetchTodayEntry();
      } else {
        alert(data.message || 'Failed to submit overtime request');
      }
    } catch (error) {
      console.error('Overtime request error:', error);
      alert('Failed to submit overtime request');
    }
    setIsLoading(false);
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatCurrentTime = () => {
    return currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const calculateWorkedTime = () => {
    if (!todayEntry?.clock_in || !todayEntry?.clock_out) return { hours: 0, minutes: 0, seconds: 0 };
    
    const clockIn = new Date(todayEntry.clock_in);
    const clockOut = new Date(todayEntry.clock_out);
    const diff = clockOut.getTime() - clockIn.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return { hours, minutes, seconds };
  };

  const calculateCurrentWorkedTime = () => {
    if (!todayEntry?.clock_in || todayEntry?.clock_out) return { hours: 0, minutes: 0, seconds: 0 };
    
    const clockIn = new Date(todayEntry.clock_in);
    const diff = currentTime.getTime() - clockIn.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return { hours, minutes, seconds };
  };

  const isAfterShiftHours = () => {
    const now = new Date();
    const overtimeThreshold = new Date();
    overtimeThreshold.setHours(16, 0, 0, 0); // 4:00 PM
    return now > overtimeThreshold;
  };

  const getOvertimeTime = () => {
    if (!isAfterShiftHours()) return { hours: 0, minutes: 0, seconds: 0 };
    const now = new Date();
    const overtimeThreshold = new Date();
    overtimeThreshold.setHours(16, 0, 0, 0); // 4:00 PM
    const diff = Math.max(0, now.getTime() - overtimeThreshold.getTime());
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return { hours, minutes, seconds };
  };

  const isLateClockIn = () => {
    if (!todayEntry?.clock_in) return false;
    const clockIn = new Date(todayEntry.clock_in);
    const shiftStart = new Date(clockIn);
    shiftStart.setHours(7, 0, 0, 0); // 7:00 AM
    return clockIn > shiftStart;
  };

  const getLateTime = () => {
    if (!todayEntry?.clock_in || !isLateClockIn()) return { hours: 0, minutes: 0, seconds: 0 };
    const clockIn = new Date(todayEntry.clock_in);
    const shiftStart = new Date(clockIn);
    shiftStart.setHours(7, 0, 0, 0);
    const diff = clockIn.getTime() - shiftStart.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return { hours, minutes, seconds };
  };

  const formatTimeDisplay = (time: { hours: number; minutes: number; seconds: number }) => {
    return `${time.hours}h ${time.minutes}m ${time.seconds}s`;
  };

  const workedTime = todayEntry?.clock_out ? calculateWorkedTime() : calculateCurrentWorkedTime();
  const overtimeTime = getOvertimeTime();
  const lateTime = getLateTime();

  const tabs = [
    { id: 'time-tracking', label: 'Time Tracking', icon: Clock },
    { id: 'payroll-history', label: 'Payroll History', icon: BarChart3 }
  ];

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Tabs */}
      <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg mb-6 border border-slate-700/50">
        <div className="border-b border-slate-700/50">
          <nav className="flex justify-center p-6" aria-label="Tabs">
            <div className="bg-slate-700/30 p-1 rounded-xl flex gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`btn-enhanced ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg transform scale-105'
                      : 'text-slate-300 hover:text-white hover:bg-slate-600/50'
                  } whitespace-nowrap py-3 px-6 rounded-lg font-medium text-sm flex items-center gap-2`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
            </div>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'time-tracking' && (
            <div>
              <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-sm rounded-2xl shadow-lg p-8 border border-slate-700/50">
                <div className="flex items-center gap-3 mb-8">
                  <div className="bg-gradient-to-br from-emerald-400 to-green-500 p-2 rounded-lg shadow-lg">
                    <Clock className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white">Time Tracking</h1>
                    <p className="text-slate-400">Current Time: {formatCurrentTime()}</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  {/* Hours Progress Card */}
                  {hoursProgress && (
                    <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-6 border border-blue-700/30 backdrop-blur-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-white">Hours Progress</h2>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Required Hours:</span>
                          <span className="font-semibold text-blue-400">{hoursProgress.requiredHours.toFixed(1)}h</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Worked Hours:</span>
                          <span className="font-semibold text-emerald-400">{hoursProgress.workedHours.toFixed(1)}h</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Remaining:</span>
                          <span className={`font-semibold ${hoursProgress.isCompleted ? 'text-emerald-400' : 'text-orange-400'}`}>
                            {hoursProgress.isCompleted ? 'Completed!' : `${hoursProgress.remainingHours.toFixed(1)}h left`}
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="mt-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-slate-400">Progress</span>
                            <span className="text-sm font-medium text-white">{hoursProgress.progressPercentage.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-slate-700/50 rounded-full h-3 overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${
                                hoursProgress.isCompleted 
                                  ? 'bg-gradient-to-r from-emerald-500 to-green-600' 
                                  : 'bg-gradient-to-r from-blue-500 to-purple-600'
                              }`}
                              style={{ width: `${Math.min(100, hoursProgress.progressPercentage)}%` }}
                            />
                          </div>
                        </div>
                        
                        {hoursProgress.isCompleted && (
                          <div className="bg-emerald-900/20 p-3 rounded-lg border border-emerald-800/50 mt-4">
                            <div className="flex items-center gap-2">
                              <Target className="w-4 h-4 text-emerald-400" />
                              <p className="text-sm font-medium text-emerald-400">
                                Congratulations! You've completed your required hours!
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {!hoursProgress.isCompleted && hoursProgress.requiredHours > 0 && (
                          <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-800/50 mt-4">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-blue-400" />
                              <p className="text-sm text-blue-400">
                                Keep going! You're {hoursProgress.progressPercentage.toFixed(1)}% of the way there.
                              </p>
                            </div>
                          </div>
                        )}
                        
                        <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-600/30 mt-4">
                          <p className="text-xs text-slate-400">
                            <strong>Note:</strong> Required hours can only be adjusted by an administrator. 
                            Contact your supervisor if you need changes to your hour requirements.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Current Status */}
                  <div className={`bg-gradient-to-br from-emerald-900/30 to-green-900/30 rounded-xl p-6 border border-emerald-700/30 backdrop-blur-sm ${hoursProgress ? '' : 'md:col-span-2'}`}>
                    <h2 className="text-xl font-semibold text-white mb-4">Today's Status</h2>
                    
                    {todayEntry ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Clock In:</span>
                          <span className={`font-semibold ${isLateClockIn() ? 'text-red-400' : 'text-emerald-400'}`}>
                            {formatTime(todayEntry.clock_in)}
                            {isLateClockIn() && <span className="text-xs ml-1">(Late)</span>}
                          </span>
                        </div>

                        {isLateClockIn() && (
                          <div className="bg-red-900/20 p-3 rounded-lg border border-red-800/50">
                            <p className="text-sm text-red-400">
                              <strong>Late Clock In:</strong> {formatTimeDisplay(lateTime)} after 7:00 AM
                            </p>
                            <p className="text-xs text-red-500 mt-1">
                              This will be counted as undertime and cannot be compensated by overtime unless approved.
                            </p>
                          </div>
                        )}
                        
                        {todayEntry.clock_out ? (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Clock Out:</span>
                              <span className="font-semibold text-red-400">
                                {formatTime(todayEntry.clock_out)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Time Worked:</span>
                              <span className="font-semibold text-emerald-400">
                                {formatTimeDisplay(workedTime)}
                              </span>
                            </div>
                            {todayEntry.overtime_requested && (
                              <div className="bg-yellow-900/20 p-3 rounded-lg border border-yellow-800/50">
                                <div className="flex items-center gap-2 mb-2">
                                  <AlertCircle className="w-4 h-4 text-yellow-400" />
                                  <p className="text-sm font-medium text-yellow-400">
                                    {todayEntry.overtime_approved === null || todayEntry.overtime_approved === undefined
                                      ? 'Overtime Request Pending'
                                      : todayEntry.overtime_approved 
                                        ? 'Overtime Request Approved ✓'
                                        : 'Overtime Request Rejected ✗'
                                    }
                                  </p>
                                </div>
                                {todayEntry.overtime_note && (
                                  <p className="text-sm text-yellow-300">
                                    Note: {todayEntry.overtime_note}
                                  </p>
                                )}
                                <p className="text-xs text-yellow-500 mt-1">
                                  {todayEntry.overtime_approved === null || todayEntry.overtime_approved === undefined
                                    ? 'Awaiting admin approval'
                                    : todayEntry.overtime_approved 
                                      ? 'Your overtime has been approved and will be included in payroll'
                                      : 'Your overtime request was not approved'
                                  }
                                </p>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 text-emerald-400 mb-3">
                              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                              <span className="font-semibold">Currently Clocked In</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Time Worked:</span>
                              <span className="font-semibold text-emerald-400">
                                {formatTimeDisplay(workedTime)}
                              </span>
                            </div>
                            {isAfterShiftHours() && (
                              <div className="bg-orange-900/20 p-3 rounded-lg border border-orange-800/50">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-orange-400" />
                                  <p className="text-sm font-medium text-orange-400">
                                    Potential Overtime: {formatTimeDisplay(overtimeTime)} past 4:00 PM
                                  </p>
                                </div>
                                <p className="text-xs text-orange-500 mt-1">
                                  You may request overtime when clocking out
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-500">No time entry for today</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-white mb-4">Actions</h2>
                    
                    {!todayEntry && (
                      <button
                        onClick={handleClockIn}
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white py-4 px-6 rounded-xl font-medium hover:from-emerald-600 hover:to-green-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 btn-enhanced flex items-center justify-center gap-2 shadow-lg"
                      >
                        <Play className="w-5 h-5" />
                        {isLoading ? 'Clocking In...' : 'Clock In'}
                      </button>
                    )}
                    
                    {todayEntry && todayEntry.clock_in && !todayEntry.clock_out && (
                      <button
                        onClick={handleClockOut}
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white py-4 px-6 rounded-xl font-medium hover:from-red-600 hover:to-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 btn-enhanced flex items-center justify-center gap-2 shadow-lg"
                      >
                        <Square className="w-5 h-5" />
                        {isLoading ? 'Clocking Out...' : 'Clock Out'}
                      </button>
                    )}

                    {/* Always show overtime request button */}
                    <div className="space-y-4">
                      {todayEntry && todayEntry.clock_in && todayEntry.clock_out && (
                        <div className="bg-slate-700/50 p-4 rounded-xl text-center border border-slate-600/50">
                          <p className="text-slate-300">You have completed your shift for today.</p>
                          <button
                            onClick={handleClockIn}
                           className="mt-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 btn-enhanced text-sm"
                          >
                            Start New Session
                          </button>
                        </div>
                      )}
                      
                      {/* Manual Overtime Request Button - Always visible */}
                      <button
                        onClick={() => setShowOvertimeModal(true)}
                        className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-3 px-6 rounded-xl font-medium hover:from-orange-600 hover:to-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-800 btn-enhanced flex items-center justify-center gap-2 shadow-lg"
                      >
                        <Clock className="w-5 h-5" />
                        Request Overtime
                      </button>
                    </div>

                   
                    
                  </div>
                </div>

                {/* Shift Information */}
                <div className="mt-8 bg-slate-700/30 rounded-xl p-6 border border-slate-600/50 backdrop-blur-sm">
                  <h3 className="text-lg font-semibold text-white mb-4">Shift Information</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">Regular Hours:</span>
                      <p className="font-semibold text-white">7:00 AM - 3:30 PM (8h work + 30min break)</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Overtime Policy:</span>
                      <p className="font-semibold text-white">After 4:00 PM (+₱35/hour)</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Late Policy:</span>
                      <p className="font-semibold text-white">After 7:00 AM (-₱25/hour)</p>
                    </div>
                    <div>
                      <span className="text-slate-400">Staff House:</span>
                      <div className="flex items-center gap-2">
                        {user?.staff_house ? (
                          <>
                            <Home className="w-4 h-4 text-emerald-400" />
                            <p className="font-semibold text-emerald-400">Yes (-₱250.00/week)</p>
                          </>
                        ) : (
                          <p className="font-semibold text-slate-300">No</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-600/50">
                    <p className="text-xs text-slate-500">
                      <strong>Note:</strong> Regular shift is 8 hours work (30-minute unpaid break) = ₱200/day. 
                      Breaktime inclusion is configurable by admin. Late clock-in (after 7:00 AM) incurs hourly deductions. 
                      Overtime starts after 4:00 PM (30-minute grace period).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'payroll-history' && <PayrollHistory />}
        </div>
      </div>

      {/* Overtime Notifications Modal */}
      {showNotifications && notifications.length > 0 && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 w-full max-w-md border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-emerald-400" />
              <h3 className="text-lg font-semibold text-white">Overtime Updates</h3>
            </div>
            
            <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
              {notifications.map((notification, index) => (
                <div key={index} className={`p-3 rounded-lg border ${
                  notification.overtime_approved 
                    ? 'bg-emerald-900/20 border-emerald-800/50' 
                    : 'bg-red-900/20 border-red-800/50'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-medium ${
                      notification.overtime_approved ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {notification.overtime_approved ? 'Overtime Approved ✓' : 'Overtime Rejected ✗'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Date: {new Date(notification.clock_in).toLocaleDateString()}
                  </p>
                  {notification.overtime_note && (
                    <p className="text-xs text-slate-300 mt-1">
                      Note: {notification.overtime_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
            
            <button
              onClick={() => {
                setShowNotifications(false);
                setNotifications([]);
              }}
              className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white py-2 px-4 rounded-lg font-medium hover:from-emerald-600 hover:to-green-700 transition-all duration-200"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* Overtime Request Modal */}
      {showOvertimeModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-xl p-6 w-full max-w-md border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <MessageSquare className="w-6 h-6 text-orange-400" />
              <h3 className="text-lg font-semibold text-white">Overtime Request</h3>
            </div>
            
            <div className="bg-orange-900/20 p-4 rounded-lg mb-4 border border-orange-800/50">
              <p className="text-sm text-orange-400 mb-2">
                <strong>Overtime Request</strong>
              </p>
              <p className="text-sm text-orange-300">
                {isAfterShiftHours() 
                  ? `Current overtime: ${formatTimeDisplay(overtimeTime)} past 4:00 PM`
                  : 'You can request overtime for work done after 4:00 PM'
                }
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Reason for Overtime <span className="text-red-400">*</span>
              </label>
              <textarea
                value={overtimeNote}
                onChange={(e) => setOvertimeNote(e.target.value)}
                className="w-full p-3 bg-slate-700/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-white placeholder-slate-400"
                rows={3}
                placeholder="Please explain the reason for overtime work..."
                required
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowOvertimeModal(false);
                  setOvertimeNote('');
                }}
                className="flex-1 bg-slate-700/50 text-slate-300 py-2 px-4 rounded-lg font-medium hover:bg-slate-600/50 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={submitOvertimeRequest}
                disabled={!overtimeNote.trim() || isLoading}
               className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 text-white py-2 px-4 rounded-lg font-medium hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 btn-enhanced"
              >
                {isLoading ? 'Processing...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Required Hours Modal */}
    </div>
  );
}