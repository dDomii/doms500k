import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './database.js';
import { loginUser, verifyToken, createUser, updateUser, deleteUser } from './auth.js';
import { clockIn, clockOut, getTodayEntry, getOvertimeRequests, approveOvertime } from './timeTracking.js';
import { generateWeeklyPayslips, generatePayslipsForDateRange, generatePayslipsForSpecificDays, getPayrollReport, updatePayrollEntry } from './payroll.js';
import { pool } from './database.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize database
await initializeDatabase();

// Authentication middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  req.user = decoded;
  next();
};

// Routes
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await loginUser(username, password);
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(401).json(result);
  }
});

app.post('/api/clock-in', authenticate, async (req, res) => {
  const result = await clockIn(req.user.userId);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

app.post('/api/reset-clock-in', authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Delete existing entry for today
    await pool.execute(
      'DELETE FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ?',
      [req.user.userId, today]
    );
    
    // Create new clock in entry
    const result = await clockIn(req.user.userId);
    res.json(result);
  } catch (error) {
    console.error('Reset clock in error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/clock-out', authenticate, async (req, res) => {
  const { overtimeNote } = req.body;
  const result = await clockOut(req.user.userId, overtimeNote);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

app.get('/api/today-entry', authenticate, async (req, res) => {
  const entry = await getTodayEntry(req.user.userId);
  res.json(entry);
});

app.get('/api/user-payroll-history', authenticate, async (req, res) => {
  const { weekStart, weekEnd, specificDay, status } = req.query;
  
  try {
    let query, params;
    
    if (specificDay) {
      // Get specific day
      query = `SELECT * FROM payslips 
               WHERE user_id = ? AND DATE(week_start) <= ? AND DATE(week_end) >= ? AND status = ?
               ORDER BY week_start DESC`;
      params = [req.user.userId, specificDay, specificDay, status || 'released'];
    } else if (weekStart && weekEnd) {
      // Get specific week
      query = `SELECT * FROM payslips 
               WHERE user_id = ? AND week_start = ? AND week_end = ? AND status = ?
               ORDER BY week_start DESC`;
      params = [req.user.userId, weekStart, weekEnd, status || 'released'];
    } else {
      // Get current year if no specific week
      query = `SELECT * FROM payslips 
               WHERE user_id = ? AND YEAR(week_start) = ? AND status = ?
               ORDER BY week_start DESC`;
      params = [req.user.userId, new Date().getFullYear(), status || 'released'];
    }
    
    const [payslips] = await pool.execute(query, params);
    res.json(payslips);
  } catch (error) {
    console.error('Error fetching user payroll history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/users', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  try {
    const [users] = await pool.execute(
      'SELECT id, username, role, department, staff_house, gcash_number, required_hours, active, created_at FROM users ORDER BY department, username'
    );
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/user-hours-progress', authenticate, async (req, res) => {
  try {
    // Get user's required hours
    const [userResult] = await pool.execute(
      'SELECT required_hours FROM users WHERE id = ?',
      [req.user.userId]
    );
    
    if (userResult.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const requiredHours = parseFloat(userResult[0].required_hours) || 0;
    
    // Get progress data from the new progress table
    const [progressResult] = await pool.execute(`
      SELECT 
        total_worked_hours,
        total_overtime_hours,
        total_days_worked,
        total_late_instances,
        last_updated
      FROM user_progress 
      WHERE user_id = ?
    `, [req.user.userId]);
    
    let workedHours = 0;
    let additionalStats = {};
    
    if (progressResult.length > 0) {
      workedHours = parseFloat(progressResult[0].total_worked_hours) || 0;
      additionalStats = {
        totalOvertimeHours: parseFloat(progressResult[0].total_overtime_hours) || 0,
        totalDaysWorked: progressResult[0].total_days_worked || 0,
        totalLateInstances: progressResult[0].total_late_instances || 0,
        lastUpdated: progressResult[0].last_updated
      };
    } else {
      // Fallback to calculating from time_entries if no progress record exists
      const [hoursResult] = await pool.execute(`
        SELECT 
          COALESCE(SUM(
            CASE 
              WHEN clock_out IS NOT NULL THEN 
                TIMESTAMPDIFF(SECOND, clock_in, clock_out) / 3600
              ELSE 0 
            END
          ), 0) as total_hours
        FROM time_entries 
        WHERE user_id = ?
      `, [req.user.userId]);
      
      workedHours = parseFloat(hoursResult[0].total_hours) || 0;
      
      // Create initial progress record
      await updateUserProgressData(req.user.userId);
    }
    
    const remainingHours = Math.max(0, requiredHours - workedHours);
    const progressPercentage = requiredHours > 0 ? Math.min(100, (workedHours / requiredHours) * 100) : 0;
    
    res.json({
      requiredHours,
      workedHours,
      remainingHours,
      progressPercentage,
      isCompleted: workedHours >= requiredHours,
      ...additionalStats
    });
  } catch (error) {
    console.error('Error fetching user hours progress:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/user-required-hours', authenticate, async (req, res) => {
  const { requiredHours } = req.body;
  
  if (typeof requiredHours !== 'number' || requiredHours < 0) {
    return res.status(400).json({ message: 'Invalid required hours value' });
  }
  
  try {
    await pool.execute(
      'UPDATE users SET required_hours = ? WHERE id = ?',
      [requiredHours, req.user.userId]
    );
    
    res.json({ success: true, message: 'Required hours updated successfully' });
  } catch (error) {
    console.error('Error updating required hours:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/users', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const result = await createUser(req.body);
  res.json(result);
});

app.put('/api/users/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  // Check if this is just a required_hours update
  if (req.body.required_hours !== undefined && Object.keys(req.body).length === 1) {
    try {
      await pool.execute(
        'UPDATE users SET required_hours = ? WHERE id = ?',
        [req.body.required_hours, req.params.id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating required hours:', error);
      res.json({ success: false, message: 'Server error' });
    }
  } else {
    const result = await updateUser(req.params.id, req.body);
    res.json(result);
  }
});

app.delete('/api/users/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const result = await deleteUser(req.params.id);
  res.json(result);
});

app.post('/api/users/:id/adjust-time', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { id } = req.params;
  const { date, clockIn, clockOut } = req.body;

  try {
    // Get old values for logging
    const [oldEntry] = await pool.execute(
      'SELECT * FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ?',
      [id, date]
    );
    
    const weekStart = getWeekStart(new Date(date));
    
    // Delete existing entry for this date
    await pool.execute(
      'DELETE FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ?',
      [id, date]
    );

    // Also update/create user_daily_data
    await pool.execute(
      'DELETE FROM user_daily_data WHERE user_id = ? AND date = ?',
      [id, date]
    );

    // Create new entry with adjusted times
    const clockInDateTime = new Date(`${date}T${clockIn}:00`);
    let clockOutDateTime = null;
    
    if (clockOut) {
      clockOutDateTime = new Date(`${date}T${clockOut}:00`);
    }

    await pool.execute(
      'INSERT INTO time_entries (user_id, clock_in, clock_out, date, week_start) VALUES (?, ?, ?, ?, ?)',
      [id, clockInDateTime, clockOutDateTime, date, weekStart]
    );

    // Calculate hours and update daily data
    let totalHours = 0;
    let overtimeHours = 0;
    let undertimeHours = 0;
    let lateMinutes = 0;
    
    if (clockOutDateTime) {
      totalHours = (clockOutDateTime - clockInDateTime) / (1000 * 60 * 60);
      
      // Check for late clock in (after 7:00 AM)
      const shiftStart = new Date(clockInDateTime);
      shiftStart.setHours(7, 0, 0, 0);
      if (clockInDateTime > shiftStart) {
        lateMinutes = Math.floor((clockInDateTime - shiftStart) / (1000 * 60));
        undertimeHours = lateMinutes / 60;
      }
      
      // Check for overtime (after 4:00 PM)
      const overtimeStart = new Date(clockInDateTime);
      overtimeStart.setHours(16, 0, 0, 0);
      if (clockOutDateTime > overtimeStart) {
        overtimeHours = Math.max(0, (clockOutDateTime - overtimeStart) / (1000 * 60 * 60));
      }
    }

    // Insert/update daily data
    await pool.execute(`
      INSERT INTO user_daily_data 
      (user_id, date, clock_in, clock_out, total_hours, overtime_hours, undertime_hours, late_minutes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      clock_in = VALUES(clock_in),
      clock_out = VALUES(clock_out),
      total_hours = VALUES(total_hours),
      overtime_hours = VALUES(overtime_hours),
      undertime_hours = VALUES(undertime_hours),
      late_minutes = VALUES(late_minutes),
      status = VALUES(status),
      updated_at = CURRENT_TIMESTAMP
    `, [id, date, clockInDateTime, clockOutDateTime, totalHours, overtimeHours, undertimeHours, lateMinutes, clockOutDateTime ? 'completed' : 'active']);

    // Update user progress
    await updateUserProgressData(id);
    
    // Invalidate affected payslips
    const affectedPayslips = await invalidateAffectedPayslips(id, date);
    
    // Log the change
    await pool.execute(`
      INSERT INTO data_sync_log (user_id, action_type, affected_date, old_values, new_values, triggered_by)
      VALUES (?, 'admin_adjustment', ?, ?, ?, ?)
    `, [
      id, 
      date, 
      JSON.stringify(oldEntry[0] || {}),
      JSON.stringify({ clockIn, clockOut, totalHours, overtimeHours, undertimeHours }),
      req.user.userId
    ]);
    res.json({ success: true });
  } catch (error) {
    console.error('Time adjustment error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Helper function to update user progress data
async function updateUserProgressData(userId) {
  try {
    // Calculate total worked hours, overtime, days worked, etc.
    const [progressData] = await pool.execute(`
      SELECT 
        COALESCE(SUM(total_hours), 0) as total_worked_hours,
        COALESCE(SUM(overtime_hours), 0) as total_overtime_hours,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as total_days_worked,
        COUNT(CASE WHEN late_minutes > 0 THEN 1 END) as total_late_instances,
        MAX(clock_in) as last_clock_in,
        MAX(clock_out) as last_clock_out
      FROM user_daily_data 
      WHERE user_id = ?
    `, [userId]);
    
    const data = progressData[0];
    
    // Update or insert progress record
    await pool.execute(`
      INSERT INTO user_progress 
      (user_id, total_worked_hours, total_overtime_hours, total_days_worked, total_late_instances, last_clock_in, last_clock_out)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
      total_worked_hours = VALUES(total_worked_hours),
      total_overtime_hours = VALUES(total_overtime_hours),
      total_days_worked = VALUES(total_days_worked),
      total_late_instances = VALUES(total_late_instances),
      last_clock_in = VALUES(last_clock_in),
      last_clock_out = VALUES(last_clock_out),
      last_updated = CURRENT_TIMESTAMP
    `, [
      userId,
      data.total_worked_hours,
      data.total_overtime_hours,
      data.total_days_worked,
      data.total_late_instances,
      data.last_clock_in,
      data.last_clock_out
    ]);
    
    return true;
  } catch (error) {
    console.error('Error updating user progress:', error);
    return false;
  }
}

// Helper function to invalidate affected payslips
async function invalidateAffectedPayslips(userId, date) {
  try {
    // Find all payslips that might be affected by this time change
    const [affectedPayslips] = await pool.execute(`
      SELECT id, week_start, week_end 
      FROM payslips 
      WHERE user_id = ? 
      AND (
        (DATE(?) BETWEEN week_start AND week_end) OR
        (week_start <= DATE(?) AND week_end >= DATE(?))
      )
    `, [userId, date, date, date]);
    
    // Mark these payslips as needing recalculation
    for (const payslip of affectedPayslips) {
      await pool.execute(
        'UPDATE payslips SET status = "needs_recalculation", last_updated = CURRENT_TIMESTAMP WHERE id = ?',
        [payslip.id]
      );
    }
    
    return affectedPayslips.length;
  } catch (error) {
    console.error('Error invalidating payslips:', error);
    return 0;
  }
}
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

app.get('/api/overtime-requests', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const requests = await getOvertimeRequests();
  res.json(requests);
});

app.post('/api/overtime-requests/:id/approve', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { approved } = req.body;
  const result = await approveOvertime(req.params.id, approved, req.user.userId);
  res.json(result);
});

app.post('/api/overtime-request', authenticate, async (req, res) => {
  const { overtimeNote, date } = req.body;
  
  try {
    const weekStart = getWeekStart(new Date(date));
    
    // Check if user already has a time entry for this date
    const [existingEntry] = await pool.execute(
      'SELECT * FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ?',
      [req.user.userId, date]
    );
    
    if (existingEntry.length > 0) {
      // Update existing entry with overtime request
      await pool.execute(
        `UPDATE time_entries 
         SET overtime_requested = TRUE, overtime_note = ?, overtime_approved = NULL
         WHERE id = ?`,
        [overtimeNote, existingEntry[0].id]
      );
    } else {
      // Create a new overtime-only entry for admin review
      const clockIn = new Date(`${date}T16:00:00`); // 4 PM start for manual OT
      const clockOut = new Date(`${date}T18:00:00`); // 2 hours of OT
      
      await pool.execute(
        `INSERT INTO time_entries (user_id, clock_in, clock_out, date, week_start, overtime_requested, overtime_note, overtime_approved) 
         VALUES (?, ?, ?, ?, ?, TRUE, ?, NULL)`,
        [req.user.userId, clockIn, clockOut, date, weekStart, overtimeNote]
      );
    }

    res.json({ 
      success: true, 
      message: 'Time adjusted successfully',
      affectedPayslips,
      updatedProgress: true
    });
  } catch (error) {
    console.error('Manual overtime request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/payslips/generate', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { weekStart, startDate, endDate, selectedDates, userIds } = req.body;
  
  try {
    // Support multiple generation modes
    let payslips;
    if (selectedDates && selectedDates.length > 0) {
      // Generate for specific selected days
      payslips = await generatePayslipsForSpecificDays(selectedDates, userIds);
    } else if (startDate && endDate) {
      // Generate for date range
      payslips = await generatePayslipsForDateRange(startDate, endDate);
    } else if (weekStart) {
      // Generate for week (backward compatibility)
      payslips = await generateWeeklyPayslips(weekStart);
    } else {
      return res.status(400).json({ message: 'Either weekStart, startDate/endDate, or selectedDates is required' });
    }
    
    res.json(payslips);
    
    // Log the payslip generation
    await logPayslipAction(req.user.userId, 'generated', selectedDates || [startDate || weekStart], payslips.length, userIds);
  } catch (error) {
    console.error('Error generating payslips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/payroll-report', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { weekStart, startDate, endDate, selectedDates } = req.query;
  
  console.log('Payroll report request:', { weekStart, startDate, endDate, selectedDates });
  
  let report;
  if (selectedDates) {
    // Handle specific dates - parse the comma-separated string
    const datesArray = selectedDates.split(',');
    const sortedDates = datesArray.sort();
    console.log('Fetching report for dates:', sortedDates);
    report = await getPayrollReport(sortedDates[0], sortedDates[sortedDates.length - 1]);
  } else if (startDate && endDate) {
    report = await getPayrollReport(startDate, endDate);
  } else if (weekStart) {
    report = await getPayrollReport(weekStart);
  } else {
    return res.status(400).json({ message: 'Either weekStart, startDate/endDate, or selectedDates is required' });
  }
  
  console.log('Payroll report result:', report.length, 'entries');
  res.json(report);
});

app.get('/api/overtime-notifications', authenticate, async (req, res) => {
  try {
    const [notifications] = await pool.execute(`
      SELECT te.*, u.username 
      FROM time_entries te 
      JOIN users u ON te.user_id = u.id 
      WHERE te.user_id = ? AND te.overtime_approved IS NOT NULL AND te.overtime_notification_sent = FALSE
      ORDER BY te.updated_at DESC
    `, [req.user.userId]);

    // Mark notifications as sent
    if (notifications.length > 0) {
      const entryIds = notifications.map(n => n.id);
      await pool.execute(
        `UPDATE time_entries SET overtime_notification_sent = TRUE WHERE id IN (${entryIds.map(() => '?').join(',')})`,
        entryIds
      );
    }

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching overtime notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/time-logs', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { weekStart } = req.query;
  
  try {
    let query = `
      SELECT te.*, u.username, u.department 
      FROM time_entries te 
      JOIN users u ON te.user_id = u.id 
    `;
    let params = [];
    
    if (weekStart) {
      query += ' WHERE te.week_start = ?';
      params.push(weekStart);
    }
    
    query += ' ORDER BY te.date DESC, u.department, u.username';
    
    const [logs] = await pool.execute(query, params);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching time logs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/payroll/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const result = await updatePayrollEntry(req.params.id, req.body);
  res.json(result);
});

app.post('/api/payslips/release', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { selectedDates, userIds } = req.body;
  
  try {
    let whereClause = '';
    let params = [];
    
    if (selectedDates && selectedDates.length > 0) {
      whereClause = 'WHERE week_start = ? AND week_end = ?';
      params = [selectedDates[0], selectedDates[selectedDates.length - 1]];
    }
    
    if (userIds && userIds.length > 0) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += `user_id IN (${userIds.map(() => '?').join(',')})`;
      params.push(...userIds);
    }
    
    // Update payslips to released status
    const [result] = await pool.execute(
      `UPDATE payslips SET status = 'released' ${whereClause} AND status = 'pending'`,
      params
    );
    
    res.json({ 
      success: true, 
      releasedCount: result.affectedRows,
      message: `Successfully released ${result.affectedRows} payslips`
    });
    
    // Log the payslip release
    await logPayslipAction(req.user.userId, 'released', selectedDates || [], result.affectedRows, userIds);
  } catch (error) {
    console.error('Error releasing payslips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to log payslip actions
async function logPayslipAction(adminId, action, dates, payslipCount, userIds = null) {
  try {
    const periodStart = dates[0];
    const periodEnd = dates[dates.length - 1] || dates[0];
    const userIdsJson = userIds ? JSON.stringify(userIds) : null;
    
    await pool.execute(
      'INSERT INTO payslip_logs (admin_id, action, period_start, period_end, payslip_count, user_ids) VALUES (?, ?, ?, ?, ?, ?)',
      [adminId, action, periodStart, periodEnd, payslipCount, userIdsJson]
    );
  } catch (error) {
    console.error('Error logging payslip action:', error);
  }
}

app.post('/api/payslip-logs', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  const { action, selectedDates, payslipCount, userIds } = req.body;
  
  try {
    const periodStart = selectedDates[0];
    const periodEnd = selectedDates[selectedDates.length - 1];
    const userIdsJson = userIds ? JSON.stringify(userIds) : null;
    
    await pool.execute(
      'INSERT INTO payslip_logs (admin_id, action, period_start, period_end, payslip_count, user_ids) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.userId, action, periodStart, periodEnd, payslipCount, userIdsJson]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging payslip action:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/payslip-logs', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  try {
    const [logs] = await pool.execute(`
      SELECT pl.*, u.username as admin_username 
      FROM payslip_logs pl 
      JOIN users u ON pl.admin_id = u.id 
      ORDER BY pl.created_at DESC 
      LIMIT 50
    `);
    
    res.json(logs);
  } catch (error) {
    console.error('Error fetching payslip logs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/payslip-logs/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  try {
    const [result] = await pool.execute(
      'DELETE FROM payslip_logs WHERE id = ?',
      [req.params.id]
    );
    
    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Payslip log deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Payslip log not found' });
    }
  } catch (error) {
    console.error('Error deleting payslip log:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/active-users', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const [activeUsers] = await pool.execute(`
      SELECT 
        u.id,
        u.username,
        u.department,
        te.clock_in
      FROM users u
      JOIN time_entries te ON u.id = te.user_id
      WHERE DATE(te.clock_in) = ? 
        AND te.clock_out IS NULL
        AND u.active = TRUE
      ORDER BY u.department, te.clock_in ASC
    `, [today]);

    res.json(activeUsers);
  } catch (error) {
    console.error('Error fetching active users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// New endpoint to get real-time user dashboard data
app.get('/api/user-dashboard-data', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get today's entry
    const today = new Date().toISOString().split('T')[0];
    const [todayEntry] = await pool.execute(
      'SELECT * FROM user_daily_data WHERE user_id = ? AND date = ?',
      [userId, today]
    );
    
    // Get user progress
    const [progressData] = await pool.execute(
      'SELECT * FROM user_progress WHERE user_id = ?',
      [userId]
    );
    
    // Get user required hours
    const [userData] = await pool.execute(
      'SELECT required_hours FROM users WHERE id = ?',
      [userId]
    );
    
    // Get recent payslips
    const [recentPayslips] = await pool.execute(`
      SELECT * FROM payslips 
      WHERE user_id = ? AND status = 'released'
      ORDER BY week_start DESC 
      LIMIT 5
    `, [userId]);
    
    const requiredHours = parseFloat(userData[0]?.required_hours) || 0;
    const workedHours = parseFloat(progressData[0]?.total_worked_hours) || 0;
    
    res.json({
      todayEntry: todayEntry[0] || null,
      progress: {
        requiredHours,
        workedHours,
        remainingHours: Math.max(0, requiredHours - workedHours),
        progressPercentage: requiredHours > 0 ? Math.min(100, (workedHours / requiredHours) * 100) : 0,
        isCompleted: workedHours >= requiredHours,
        totalOvertimeHours: parseFloat(progressData[0]?.total_overtime_hours) || 0,
        totalDaysWorked: progressData[0]?.total_days_worked || 0,
        totalLateInstances: progressData[0]?.total_late_instances || 0
      },
      recentPayslips,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching user dashboard data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// New endpoint to get admin dashboard overview
app.get('/api/admin-dashboard-overview', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  
  try {
    // Get payslips that need recalculation
    const [needsRecalc] = await pool.execute(
      'SELECT COUNT(*) as count FROM payslips WHERE status = "needs_recalculation"'
    );
    
    // Get today's active users
    const today = new Date().toISOString().split('T')[0];
    const [activeToday] = await pool.execute(
      'SELECT COUNT(*) as count FROM user_daily_data WHERE date = ? AND status = "active"',
      [today]
    );
    
    // Get pending overtime requests
    const [pendingOT] = await pool.execute(
      'SELECT COUNT(*) as count FROM time_entries WHERE overtime_requested = TRUE AND overtime_approved IS NULL'
    );
    
    // Get recent data sync issues
    const [syncIssues] = await pool.execute(
      'SELECT COUNT(*) as count FROM data_sync_log WHERE sync_status = "failed" AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)'
    );
    
    res.json({
      payslipsNeedingRecalculation: needsRecalc[0].count,
      activeUsersToday: activeToday[0].count,
      pendingOvertimeRequests: pendingOT[0].count,
      recentSyncIssues: syncIssues[0].count,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching admin dashboard overview:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// New endpoint to recalculate payslips
app.post('/api/recalculate-payslips', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  
  try {
    // Get all payslips that need recalculation
    const [payslipsToRecalc] = await pool.execute(
      'SELECT * FROM payslips WHERE status = "needs_recalculation"'
    );
    
    let recalculatedCount = 0;
    
    for (const payslip of payslipsToRecalc) {
      // Recalculate the payslip based on current time entries
      const newPayrollData = await calculatePayrollForDateRange(
        payslip.user_id, 
        payslip.week_start, 
        payslip.week_end
      );
      
      if (newPayrollData) {
        await pool.execute(`
          UPDATE payslips SET 
          total_hours = ?, overtime_hours = ?, undertime_hours = ?,
          base_salary = ?, overtime_pay = ?, undertime_deduction = ?,
          staff_house_deduction = ?, total_salary = ?,
          clock_in_time = ?, clock_out_time = ?,
          status = 'pending', last_updated = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          newPayrollData.totalHours, newPayrollData.overtimeHours, newPayrollData.undertimeHours,
          newPayrollData.baseSalary, newPayrollData.overtimePay, newPayrollData.undertimeDeduction,
          newPayrollData.staffHouseDeduction, newPayrollData.totalSalary,
          newPayrollData.clockInTime, newPayrollData.clockOutTime,
          payslip.id
        ]);
        
        recalculatedCount++;
      }
    }
    
    res.json({
      success: true,
      recalculatedCount,
      message: `Successfully recalculated ${recalculatedCount} payslips`
    });
  } catch (error) {
    console.error('Error recalculating payslips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.listen(port, '192.168.100.60', () => {
  console.log(`Server running at http://192.168.100.60:${port}`);
});