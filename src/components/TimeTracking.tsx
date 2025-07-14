import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Clock, Play, Square, MessageSquare, AlertCircle, Home, BarChart3, X, Target, TrendingUp, Edit3, Check, Calendar, Timer, Award, Zap } from 'lucide-react';
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

  const formatCurrentDate = () => {
    return currentTime.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header Section */}
      <div className="text-center mb-8">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-emerald-400 to-green-500 p-3 rounded-xl shadow-lg">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Welcome back, {user?.username}
                </h1>
                <p className="text-slate-400">{formatCurrentDate()}</p>
              </div>
            </div>
            
            {/* Live Clock */}
            <div className="text-right">
              <p className="text-sm text-slate-400 mb-1">Current Time</p>
              <div className="text-xl font-mono font-bold text-emerald-400">
                {formatCurrentTime()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700/50 overflow-hidden">
        <div className="border-b border-slate-700/50">
          <nav className="flex justify-center p-6" aria-label="Tabs">
            <div className="bg-slate-700/30 p-1.5 rounded-xl flex gap-2">
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
                  } whitespace-nowrap py-3 px-8 rounded-lg font-medium text-sm flex items-center gap-2 transition-all duration-300`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
            </div>
          </nav>
        </div>

        <div className="p-8">
          {activeTab === 'time-tracking' && (
            <div className="space-y-8">
              {/* Main Dashboard Grid */}
              <div className="grid lg:grid-cols-3 gap-8">
                {/* Hours Progress Card */}
                {hoursProgress && (
                  <div className="lg:col-span-1">
                    <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-2xl p-6 border border-blue-700/30 backdrop-blur-sm h-full">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="bg-gradient-to-br from-blue-500/20 to-purple-600/20 p-3 rounded-xl border border-blue-700/50">
                            <Target className="w-6 h-6 text-blue-400" />
                          </div>
                          <div>
                            <h2 className="text-xl font-semibold text-white">Progress Tracker</h2>
                            <p className="text-sm text-slate-400">Your journey to completion</p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Circular Progress */}
                      <div className="flex justify-center mb-6">
                        <div className="relative w-32 h-32">
                          <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                            <circle
                              cx="60"
                              cy="60"
                              r="50"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className="text-slate-700"
                            />
                            <circle
                              cx="60"
                              cy="60"
                              r="50"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              strokeLinecap="round"
                              className={hoursProgress.isCompleted ? 'text-emerald-400' : 'text-blue-400'}
                              style={{
                                strokeDasharray: `${2 * Math.PI * 50}`,
                                strokeDashoffset: `${2 * Math.PI * 50 * (1 - hoursProgress.progressPercentage / 100)}`,
                                transition: 'stroke-dashoffset 1s ease-in-out'
                              }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                              <div className={`text-2xl font-bold ${hoursProgress.isCompleted ? 'text-emerald-400' : 'text-blue-400'}`}>
                                {hoursProgress.progressPercentage.toFixed(0)}%
                              </div>
                              <div className="text-xs text-slate-400">Complete</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-600/30">
                          <span className="text-slate-400 text-sm">Required Hours:</span>
                          <span className="font-semibold text-blue-400">{hoursProgress.requiredHours.toFixed(1)}h</span>
                        </div>
                        
                        <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-600/30">
                          <span className="text-slate-400 text-sm">Worked Hours:</span>
                          <span className="font-semibold text-emerald-400">{hoursProgress.workedHours.toFixed(1)}h</span>
                        </div>
                        
                        <div className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-600/30">
                          <span className="text-slate-400 text-sm">Remaining:</span>
                          <span className={`font-semibold ${hoursProgress.isCompleted ? 'text-emerald-400' : 'text-orange-400'}`}>
                            {hoursProgress.isCompleted ? 'Completed!' : `${hoursProgress.remainingHours.toFixed(1)}h left`}
                          </span>
                        </div>
                        
                        {hoursProgress.isCompleted && (
                          <div className="bg-gradient-to-r from-emerald-900/30 to-green-900/30 p-4 rounded-xl border border-emerald-800/50 mt-4">
                            <div className="flex items-center gap-3">
                              <Award className="w-5 h-5 text-emerald-400" />
                              <div>
                                <p className="text-sm font-medium text-emerald-400">Congratulations!</p>
                                <p className="text-xs text-emerald-300">You've completed your required hours!</p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {!hoursProgress.isCompleted && hoursProgress.requiredHours > 0 && (
                          <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 p-4 rounded-xl border border-blue-800/50 mt-4">
                            <div className="flex items-center gap-3">
                              <Zap className="w-5 h-5 text-blue-400" />
                              <div>
                                <p className="text-sm font-medium text-blue-400">Keep Going!</p>
                                <p className="text-xs text-blue-300">You're {hoursProgress.progressPercentage.toFixed(1)}% of the way there.</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Today's Activity */}
                <div className={`${hoursProgress ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
                  <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-sm h-full">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/20 p-3 rounded-xl border border-emerald-700/50">
                        <Calendar className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-white">Today's Activity</h2>
                        <p className="text-sm text-slate-400">Track your daily progress</p>
                      </div>
                    </div>
                    
                    {todayEntry ? (
                      <div className="space-y-6">
                        {/* Time Display Grid */}
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="bg-gradient-to-br from-emerald-900/30 to-green-900/30 p-4 rounded-xl border border-emerald-800/50">
                            <div className="flex items-center gap-3 mb-2">
                              <Play className="w-5 h-5 text-emerald-400" />
                              <span className="text-sm font-medium text-emerald-400">Clock In</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-2xl font-mono font-bold ${isLateClockIn() ? 'text-red-400' : 'text-emerald-400'}`}>
                                {formatTime(todayEntry.clock_in)}
                              </span>
                              {isLateClockIn() && (
                                <span className="bg-red-900/30 text-red-400 px-2 py-1 rounded-full text-xs font-medium border border-red-800/50">
                                  Late
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="bg-gradient-to-br from-red-900/30 to-orange-900/30 p-4 rounded-xl border border-red-800/50">
                            <div className="flex items-center gap-3 mb-2">
                              <Square className="w-5 h-5 text-red-400" />
                              <span className="text-sm font-medium text-red-400">Clock Out</span>
                            </div>
                            <div className="text-2xl font-mono font-bold text-red-400">
                              {todayEntry.clock_out ? formatTime(todayEntry.clock_out) : 'Active'}
                            </div>
                          </div>
                        </div>

                        {/* Worked Time Display */}
                        <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 p-6 rounded-xl border border-blue-800/50">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <Timer className="w-6 h-6 text-blue-400" />
                              <span className="text-lg font-semibold text-white">Time Worked</span>
                            </div>
                            {!todayEntry.clock_out && (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                                <span className="text-sm text-emerald-400 font-medium">Live</span>
                              </div>
                            )}
                          </div>
                          <div className="text-4xl font-mono font-bold text-blue-400 mb-2">
                            {formatTimeDisplay(workedTime)}
                          </div>
                          {!todayEntry.clock_out && (
                            <p className="text-sm text-slate-400">Currently active • Updates in real-time</p>
                          )}
                        </div>

                        {/* Action Buttons Section */}
                        <div className="bg-gradient-to-br from-slate-700/30 to-slate-800/30 p-6 rounded-xl border border-slate-600/50">
                          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-emerald-400" />
                            Quick Actions
                          </h3>
                          
                          <div className="grid gap-4">
                            {!todayEntry && (
                              <button
                                onClick={handleClockIn}
                                disabled={isLoading}
                                className="bg-gradient-to-r from-emerald-500 to-green-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-emerald-600 hover:to-green-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 btn-enhanced flex items-center justify-center gap-3 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
                              >
                                <Play className="w-5 h-5" />
                                {isLoading ? 'Clocking In...' : 'Clock In'}
                              </button>
                            )}
                            
                            {todayEntry && todayEntry.clock_in && !todayEntry.clock_out && (
                              <button
                                onClick={handleClockOut}
                                disabled={isLoading}
                                className="bg-gradient-to-r from-red-500 to-red-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-red-600 hover:to-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 btn-enhanced flex items-center justify-center gap-3 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
                              >
                                <Square className="w-5 h-5" />
                                {isLoading ? 'Clocking Out...' : 'Clock Out'}
                              </button>
                            )}

                            {todayEntry && todayEntry.clock_in && todayEntry.clock_out && (
                              <button
                                onClick={handleClockIn}
                                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-blue-600 hover:to-blue-700 btn-enhanced flex items-center justify-center gap-3 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
                              >
                                <Play className="w-5 h-5" />
                                Start New Session
                              </button>
                            )}
                            
                            <button
                              onClick={() => setShowOvertimeModal(true)}
                              className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-orange-600 hover:to-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-800 btn-enhanced flex items-center justify-center gap-3 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
                            >
                              <Clock className="w-5 h-5" />
                              Request Overtime
                            </button>
                          </div>
                        </div>

                        {/* Late Clock In Warning */}
                        {isLateClockIn() && (
                          <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 p-4 rounded-xl border border-red-800/50">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-red-400 mb-1">
                                  Late Clock In: {formatTimeDisplay(lateTime)} after 7:00 AM
                                </p>
                                <p className="text-xs text-red-300">
                                  This will be counted as undertime and may affect your daily pay.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Overtime Display */}
                        {isAfterShiftHours() && !todayEntry.clock_out && (
                          <div className="bg-gradient-to-r from-orange-900/30 to-yellow-900/30 p-4 rounded-xl border border-orange-800/50">
                            <div className="flex items-center gap-3 mb-2">
                              <Clock className="w-5 h-5 text-orange-400" />
                              <span className="text-sm font-medium text-orange-400">Potential Overtime</span>
                            </div>
                            <div className="text-2xl font-mono font-bold text-orange-400 mb-1">
                              {formatTimeDisplay(overtimeTime)}
                            </div>
                            <p className="text-xs text-orange-300">
                              Time worked past 4:00 PM • You may request overtime when clocking out
                            </p>
                          </div>
                        )}

                        {/* Overtime Status */}
                        {todayEntry.overtime_requested && (
                          <div className={`p-4 rounded-xl border ${
                            todayEntry.overtime_approved === null || todayEntry.overtime_approved === undefined
                              ? 'bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border-yellow-800/50'
                              : todayEntry.overtime_approved 
                                ? 'bg-gradient-to-r from-emerald-900/30 to-green-900/30 border-emerald-800/50'
                                : 'bg-gradient-to-r from-red-900/30 to-pink-900/30 border-red-800/50'
                          }`}>
                            <div className="flex items-start gap-3">
                              <AlertCircle className={`w-5 h-5 mt-0.5 ${
                                todayEntry.overtime_approved === null || todayEntry.overtime_approved === undefined
                                  ? 'text-yellow-400'
                                  : todayEntry.overtime_approved 
                                    ? 'text-emerald-400'
                                    : 'text-red-400'
                              }`} />
                              <div className="flex-1">
                                <p className={`text-sm font-medium mb-1 ${
                                  todayEntry.overtime_approved === null || todayEntry.overtime_approved === undefined
                                    ? 'text-yellow-400'
                                    : todayEntry.overtime_approved 
                                      ? 'text-emerald-400'
                                      : 'text-red-400'
                                }`}>
                                  {todayEntry.overtime_approved === null || todayEntry.overtime_approved === undefined
                                    ? 'Overtime Request Pending'
                                    : todayEntry.overtime_approved 
                                      ? 'Overtime Request Approved ✓'
                                      : 'Overtime Request Rejected ✗'
                                  }
                                </p>
                                {todayEntry.overtime_note && (
                                  <p className="text-sm text-slate-300 mb-2">
                                    <strong>Note:</strong> {todayEntry.overtime_note}
                                  </p>
                                )}
                                <p className="text-xs text-slate-400">
                                  {todayEntry.overtime_approved === null || todayEntry.overtime_approved === undefined
                                    ? 'Awaiting admin approval for overtime compensation'
                                    : todayEntry.overtime_approved 
                                      ? 'Your overtime has been approved and will be included in payroll'
                                      : 'Your overtime request was not approved'
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="text-center py-12">
                          <div className="bg-slate-700/30 p-6 rounded-full w-24 h-24 mx-auto mb-4 flex items-center justify-center">
                            <Clock className="w-12 h-12 text-slate-500" />
                          </div>
                          <h3 className="text-lg font-medium text-white mb-2">Ready to Start Your Day?</h3>
                          <p className="text-slate-400 mb-6">Clock in to begin tracking your time</p>
                        </div>

                        {/* Action Buttons for No Entry */}
                        <div className="bg-gradient-to-br from-slate-700/30 to-slate-800/30 p-6 rounded-xl border border-slate-600/50">
                          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-emerald-400" />
                            Quick Actions
                          </h3>
                          
                          <div className="grid gap-4">
                            <button
                              onClick={handleClockIn}
                              disabled={isLoading}
                              className="bg-gradient-to-r from-emerald-500 to-green-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-emerald-600 hover:to-green-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:opacity-50 btn-enhanced flex items-center justify-center gap-3 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
                            >
                              <Play className="w-5 h-5" />
                              {isLoading ? 'Clocking In...' : 'Clock In'}
                            </button>
                            
                            <button
                              onClick={() => setShowOvertimeModal(true)}
                              className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:from-orange-600 hover:to-orange-700 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-slate-800 btn-enhanced flex items-center justify-center gap-3 shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
                            >
                              <Clock className="w-5 h-5" />
                              Request Overtime
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Shift Information */}
              <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
                  <div className="bg-gradient-to-br from-purple-500/20 to-pink-600/20 p-2 rounded-lg border border-purple-700/50">
                    <AlertCircle className="w-5 h-5 text-purple-400" />
                  </div>
                  Shift Information & Policies
                </h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-600/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">Regular Hours</span>
                    </div>
                    <p className="text-white font-semibold">7:00 AM - 3:30 PM</p>
                    <p className="text-xs text-slate-400 mt-1">8h work + 30min break</p>
                  </div>
                  
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-600/30">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-orange-400" />
                      <span className="text-sm font-medium text-orange-400">Overtime Rate</span>
                    </div>
                    <p className="text-white font-semibold">₱35/hour</p>
                    <p className="text-xs text-slate-400 mt-1">After 4:00 PM</p>
                  </div>
                  
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-600/30">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-medium text-red-400">Late Policy</span>
                    </div>
                    <p className="text-white font-semibold">-₱25/hour</p>
                    <p className="text-xs text-slate-400 mt-1">After 7:00 AM</p>
                  </div>
                  
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-600/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Home className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-purple-400">Staff House</span>
                    </div>
                    {user?.staff_house ? (
                      <>
                        <p className="text-emerald-400 font-semibold">Enrolled</p>
                        <p className="text-xs text-slate-400 mt-1">-₱250/week</p>
                      </>
                    ) : (
                      <>
                        <p className="text-slate-300 font-semibold">Not Enrolled</p>
                        <p className="text-xs text-slate-400 mt-1">No deduction</p>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-blue-900/20 rounded-xl border border-blue-800/50">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-400 mb-2">Important Notes</p>
                      <ul className="text-xs text-blue-300 space-y-1">
                        <li>• Base pay is capped at ₱200 for 8.5 hours of work</li>
                        <li>• Work hours only count from 7:00 AM onwards</li>
                        <li>• Late clock-in (after 7:00 AM) incurs hourly deductions</li>
                        <li>• Overtime starts at 3:30 PM and requires approval</li>
                        <li>• All overtime must be pre-approved by administration</li>
                      </ul>
                    </div>
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
    </div>
  );
}