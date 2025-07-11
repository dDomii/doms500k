import { pool } from './database.js';

export async function clockIn(userId) {
  try {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const weekStart = getWeekStart(now);

    // Check if user is already clocked in
    const [existing] = await pool.execute(
      'SELECT id FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ? AND clock_out IS NULL',
      [userId, date]
    );

    if (existing.length > 0) {
      return { success: false, message: 'Already clocked in today' };
    }

    // Check if user has any entry for today (including completed ones)
    const [todayEntries] = await pool.execute(
      'SELECT id FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ?',
      [userId, date]
    );

    if (todayEntries.length > 0) {
      return { success: false, message: 'Already clocked in today', hasEntry: true };
    }
    const [result] = await pool.execute(
      'INSERT INTO time_entries (user_id, clock_in, date, week_start) VALUES (?, ?, ?, ?)',
      [userId, now, date, weekStart]
    );

    // Calculate late minutes
    const shiftStart = new Date(now);
    shiftStart.setHours(7, 0, 0, 0);
    const lateMinutes = now > shiftStart ? Math.floor((now - shiftStart) / (1000 * 60)) : 0;
    
    // Create/update daily data record
    await pool.execute(`
      INSERT INTO user_daily_data (user_id, date, clock_in, late_minutes, status)
      VALUES (?, ?, ?, ?, 'active')
      ON DUPLICATE KEY UPDATE
      clock_in = VALUES(clock_in),
      late_minutes = VALUES(late_minutes),
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
    `, [userId, date, now, lateMinutes]);
    
    // Update user progress
    await updateUserProgressData(userId);
    return { success: true, entryId: result.insertId };
  } catch (error) {
    console.error('Clock in error:', error);
    return { success: false, message: 'Server error' };
  }
}

export async function clockOut(userId, overtimeNote = null) {
  try {
    const now = new Date();
    const date = now.toISOString().split('T')[0];

    // Find active time entry
    const [entries] = await pool.execute(
      'SELECT * FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ? AND clock_out IS NULL',
      [userId, date]
    );

    if (entries.length === 0) {
      return { success: false, message: 'No active clock in found' };
    }

    const entry = entries[0];

    // Update the entry with clock out time
    await pool.execute(
      'UPDATE time_entries SET clock_out = ? WHERE id = ?',
      [now, entry.id]
    );

    // Calculate worked hours and overtime
    const clockIn = new Date(entry.clock_in);
    const totalHours = (now - clockIn) / (1000 * 60 * 60);
    
    // Check for overtime (after 4:00 PM)
    const overtimeStart = new Date(clockIn);
    overtimeStart.setHours(16, 0, 0, 0);
    const overtimeHours = now > overtimeStart ? Math.max(0, (now - overtimeStart) / (1000 * 60 * 60)) : 0;
    
    // Update daily data
    await pool.execute(`
      UPDATE user_daily_data 
      SET clock_out = ?, total_hours = ?, overtime_hours = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND date = ?
    `, [now, totalHours, overtimeHours, userId, date]);
    
    // Update user progress
    await updateUserProgressData(userId);
    
    // Log the change
    await pool.execute(`
      INSERT INTO data_sync_log (user_id, action_type, affected_date, new_values)
      VALUES (?, 'time_entry', ?, ?)
    `, [userId, date, JSON.stringify({ action: 'clock_out', totalHours, overtimeHours })]);
    return { success: true };
  } catch (error) {
    console.error('Clock out error:', error);
    return { success: false, message: 'Server error' };
  }
}

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
export async function getTodayEntry(userId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [entries] = await pool.execute(
      'SELECT * FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ? ORDER BY clock_in DESC LIMIT 1',
      [userId, today]
    );

    return entries[0] || null;
  } catch (error) {
    console.error('Get today entry error:', error);
    return null;
  }
}

export async function getOvertimeRequests() {
  try {
    const [requests] = await pool.execute(`
      SELECT te.*, u.username, u.department 
      FROM time_entries te 
      JOIN users u ON te.user_id = u.id 
      WHERE te.overtime_requested = TRUE AND te.overtime_approved IS NULL
      ORDER BY te.created_at DESC
    `);

    return requests;
  } catch (error) {
    console.error('Get overtime requests error:', error);
    return [];
  }
}

export async function approveOvertime(entryId, approved, adminId) {
  try {
    await pool.execute(
      'UPDATE time_entries SET overtime_approved = ?, overtime_approved_by = ?, overtime_notification_sent = FALSE WHERE id = ?',
      [approved, adminId, entryId]
    );

    return { success: true };
  } catch (error) {
    console.error('Approve overtime error:', error);
    return { success: false, message: 'Server error' };
  }
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}