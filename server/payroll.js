import { pool } from './database.js';

// Helper function to recalculate user progress after time changes
async function updateUserProgress(userId) {
  try {
    // Get total worked hours for the user (only completed shifts)
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
    `, [userId]);
    
    return parseFloat(hoursResult[0].total_hours) || 0;
  } catch (error) {
    console.error('Error updating user progress:', error);
    return 0;
  }
}

// Helper function to invalidate and regenerate affected payslips
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
        'UPDATE payslips SET status = "needs_recalculation" WHERE id = ?',
        [payslip.id]
      );
    }
    
    return affectedPayslips.length;
  } catch (error) {
    console.error('Error invalidating payslips:', error);
    return 0;
  }
}

// Helper function to get breaktime setting
async function getBreaktimeSetting() {
  try {
    const [result] = await pool.execute(
      'SELECT setting_value FROM system_settings WHERE setting_key = "breaktime_enabled"'
    );
    return result.length > 0 ? result[0].setting_value === 'true' : false;
  } catch (error) {
    console.error('Error getting breaktime setting:', error);
    return false;
  }
}

export async function calculateWeeklyPayroll(userId, weekStart) {
  try {
    const breaktimeEnabled = await getBreaktimeSetting();
    const standardHoursPerDay = breaktimeEnabled ? 8.5 : 8;
    
    const [entries] = await pool.execute(
      'SELECT * FROM time_entries WHERE user_id = ? AND week_start = ? ORDER BY clock_in',
      [userId, weekStart]
    );

    const [user] = await pool.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (user.length === 0) return null;

    const userData = user[0];
    let totalHours = 0;
    let overtimeHours = 0;
    let undertimeHours = 0;

    // Get first and last clock times for the week
    let firstClockIn = null;
    let lastClockOut = null;

    entries.forEach(entry => {
      const clockIn = new Date(entry.clock_in);
      let clockOut = entry.clock_out ? new Date(entry.clock_out) : null;

      // Skip entries without clock_out when generating payroll
      if (!clockOut) {
        return; // Skip this entry
      }

      const workedHours = (clockOut - clockIn) / (1000 * 60 * 60);

      // Track first clock in and last clock out
      if (!firstClockIn || clockIn < firstClockIn) {
        firstClockIn = clockIn;
      }
      if (!lastClockOut || clockOut > lastClockOut) {
        lastClockOut = clockOut;
      }

      // Check for late clock in (after 7:00 AM) - this counts as undertime
      const shiftStart = new Date(clockIn);
      shiftStart.setHours(7, 0, 0, 0);
      
      if (clockIn > shiftStart) {
        const lateHours = (clockIn - shiftStart) / (1000 * 60 * 60);
        undertimeHours += lateHours;
      }

      // Handle overtime calculation
      if (entry.overtime_requested && entry.overtime_approved) {
        const shiftEndTime = new Date(clockIn);
        shiftEndTime.setHours(15, 30, 0, 0);
        
        if (clockOut > shiftEndTime) {
          // Calculate overtime hours (30 minutes grace period after 3:30 PM = 4:00 PM)
          const overtimeStart = new Date(shiftEndTime.getTime() + 30 * 60 * 1000); // 4:00 PM
          const overtime = Math.max(0, (clockOut - overtimeStart) / (1000 * 60 * 60));
          overtimeHours += overtime;
          totalHours += workedHours; // Count actual worked hours
        } else {
          totalHours += workedHours; // Count actual worked hours
        }
      } else {
        totalHours += workedHours; // Count actual worked hours
      }
    });

    // Calculate based on actual hours worked
    const hourlyRate = breaktimeEnabled ? (200 / 8.5) : 25; // Adjust hourly rate based on breaktime
    const baseSalary = totalHours * hourlyRate;
    const overtimePay = overtimeHours * 35;
    const undertimeDeduction = undertimeHours * hourlyRate;
    const staffHouseDeduction = userData.staff_house ? 250 : 0;
    
    const totalSalary = baseSalary + overtimePay - undertimeDeduction - staffHouseDeduction;

    return {
      totalHours,
      overtimeHours,
      undertimeHours,
      baseSalary,
      overtimePay,
      undertimeDeduction,
      staffHouseDeduction,
      totalSalary,
      clockInTime: firstClockIn ? formatDateTimeForMySQL(firstClockIn) : null,
      clockOutTime: lastClockOut ? formatDateTimeForMySQL(lastClockOut) : null
    };
  } catch (error) {
    console.error('Calculate payroll error:', error);
    return null;
  }
}

// Helper function to format datetime for MySQL
function formatDateTimeForMySQL(date) {
  if (!date) return null;
  
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export async function generatePayslipsForDateRange(startDate, endDate) {
  try {
    // Get all users who have time entries within the date range
    const [users] = await pool.execute(`
      SELECT DISTINCT u.* FROM users u 
      JOIN time_entries te ON u.id = te.user_id
      WHERE u.active = TRUE AND DATE(te.clock_in) BETWEEN ? AND ?
      GROUP BY u.id
    `, [startDate, endDate]);

    const payslips = [];

    for (const user of users) {
      // Calculate payroll for the entire date range
      const payroll = await calculatePayrollForDateRange(user.id, startDate, endDate);
      if (payroll && payroll.totalHours > 0) {
        // Check if payslip already exists for this user and date range
        const [existing] = await pool.execute(
          'SELECT id FROM payslips WHERE user_id = ? AND week_start = ? AND week_end = ?',
          [user.id, startDate, endDate]
        );

        if (existing.length === 0) {
          const [result] = await pool.execute(
            `INSERT INTO payslips (user_id, week_start, week_end, total_hours, overtime_hours, 
             undertime_hours, base_salary, overtime_pay, undertime_deduction, staff_house_deduction, 
             total_salary, clock_in_time, clock_out_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              user.id, startDate, endDate,
              payroll.totalHours, payroll.overtimeHours, payroll.undertimeHours,
              payroll.baseSalary, payroll.overtimePay, payroll.undertimeDeduction,
              payroll.staffHouseDeduction, payroll.totalSalary,
              payroll.clockInTime, payroll.clockOutTime
            ]
          );

          payslips.push({
            id: result.insertId,
            user: user.username,
            department: user.department,
            ...payroll
          });
        }
      }
    }

    return payslips;
  } catch (error) {
    console.error('Generate payslips error:', error);
    return [];
  }
}

export async function generatePayslipsForSpecificDays(selectedDates, userIds = null) {
  try {
    // Build date conditions for specific days
    const dateConditions = selectedDates.map(() => 'DATE(te.clock_in) = ?').join(' OR ');
    
    let userCondition = '';
    let queryParams = [...selectedDates];
    
    if (userIds && userIds.length > 0) {
      userCondition = ` AND u.id IN (${userIds.map(() => '?').join(',')})`;
      queryParams.push(...userIds);
    }

    // Get all users who have time entries on the selected dates
    const [users] = await pool.execute(`
      SELECT DISTINCT u.* FROM users u 
      JOIN time_entries te ON u.id = te.user_id
      WHERE u.active = TRUE AND (${dateConditions})${userCondition}
      GROUP BY u.id
    `, queryParams);

    const payslips = [];

    for (const user of users) {
      // Calculate payroll for the specific selected days
      const payroll = await calculatePayrollForSpecificDays(user.id, selectedDates);
      if (payroll && payroll.totalHours > 0) {
        // Create a unique identifier for this payslip based on selected dates
        const dateRange = `${selectedDates[0]}_to_${selectedDates[selectedDates.length - 1]}`;
        
        // Check if payslip already exists for this user and date combination
        const [existing] = await pool.execute(
          'SELECT id FROM payslips WHERE user_id = ? AND week_start = ? AND week_end = ?',
          [user.id, selectedDates[0], selectedDates[selectedDates.length - 1]]
        );

        if (existing.length === 0) {
          const [result] = await pool.execute(
            `INSERT INTO payslips (user_id, week_start, week_end, total_hours, overtime_hours, 
             undertime_hours, base_salary, overtime_pay, undertime_deduction, staff_house_deduction, 
             total_salary, clock_in_time, clock_out_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              user.id, selectedDates[0], selectedDates[selectedDates.length - 1],
              payroll.totalHours, payroll.overtimeHours, payroll.undertimeHours,
              payroll.baseSalary, payroll.overtimePay, payroll.undertimeDeduction,
              payroll.staffHouseDeduction, payroll.totalSalary,
              payroll.clockInTime, payroll.clockOutTime
            ]
          );

          payslips.push({
            id: result.insertId,
            user: user.username,
            department: user.department,
            selectedDates: selectedDates,
            ...payroll
          });
        }
      }
    }

    return payslips;
  } catch (error) {
    console.error('Generate payslips for specific days error:', error);
    return [];
  }
}

export async function calculatePayrollForSpecificDays(userId, selectedDates) {
  try {
    const breaktimeEnabled = await getBreaktimeSetting();
    const hourlyRate = breaktimeEnabled ? (200 / 8.5) : 25;
    
    // Build date conditions for specific days
    const dateConditions = selectedDates.map(() => 'DATE(clock_in) = ?').join(' OR ');
    
    const [entries] = await pool.execute(
      `SELECT * FROM time_entries WHERE user_id = ? AND (${dateConditions}) ORDER BY clock_in`,
      [userId, ...selectedDates]
    );

    const [user] = await pool.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (user.length === 0) return null;

    const userData = user[0];
    let totalHours = 0;
    let overtimeHours = 0;
    let undertimeHours = 0;

    // Get first and last clock times for the selected days
    let firstClockIn = null;
    let lastClockOut = null;

    entries.forEach(entry => {
      const clockIn = new Date(entry.clock_in);
      let clockOut = entry.clock_out ? new Date(entry.clock_out) : null;

      // Skip entries without clock_out when generating payroll
      if (!clockOut) {
        return; // Skip this entry
      }

      const workedHours = (clockOut - clockIn) / (1000 * 60 * 60);

      // Track first clock in and last clock out
      if (!firstClockIn || clockIn < firstClockIn) {
        firstClockIn = clockIn;
      }
      if (!lastClockOut || clockOut > lastClockOut) {
        lastClockOut = clockOut;
      }

      // Check for late clock in (after 7:00 AM)
      const shiftStart = new Date(clockIn);
      shiftStart.setHours(7, 0, 0, 0);
      
      if (clockIn > shiftStart) {
        const lateHours = (clockIn - shiftStart) / (1000 * 60 * 60);
        undertimeHours += lateHours;
      }

      // Handle overtime calculation
      if (entry.overtime_requested && entry.overtime_approved) {
        const shiftEndTime = new Date(clockIn);
        shiftEndTime.setHours(15, 30, 0, 0);
        
        if (clockOut > shiftEndTime) {
          // Calculate overtime hours (subtract 30 minutes grace period)
          const overtimeStart = new Date(Math.max(shiftEndTime.getTime() + 30 * 60 * 1000, shiftEndTime.getTime()));
          const overtime = Math.max(0, (clockOut - overtimeStart) / (1000 * 60 * 60));
          overtimeHours += overtime;
          totalHours += workedHours; // Count actual worked hours
        } else {
          totalHours += workedHours; // Count actual worked hours
        }
      } else {
        totalHours += workedHours; // Count actual worked hours
      }
    });

    // Calculate based on actual hours worked
    const baseSalary = totalHours * hourlyRate;
    const overtimePay = overtimeHours * 35;
    const undertimeDeduction = undertimeHours * hourlyRate;
    
    // Count actual working days from selected dates
    const workingDays = entries.filter(entry => entry.clock_out).length;
    const staffHouseDeduction = userData.staff_house ? (250 * workingDays / 5) : 0; // Prorated based on actual working days
    
    const totalSalary = baseSalary + overtimePay - undertimeDeduction - staffHouseDeduction;

    return {
      totalHours,
      overtimeHours,
      undertimeHours,
      baseSalary,
      overtimePay,
      undertimeDeduction,
      staffHouseDeduction,
      totalSalary,
      clockInTime: firstClockIn ? formatDateTimeForMySQL(firstClockIn) : null,
      clockOutTime: lastClockOut ? formatDateTimeForMySQL(lastClockOut) : null
    };
  } catch (error) {
    console.error('Calculate payroll for specific days error:', error);
    return null;
  }
}

export async function calculatePayrollForDateRange(userId, startDate, endDate) {
  try {
    const breaktimeEnabled = await getBreaktimeSetting();
    const hourlyRate = breaktimeEnabled ? (200 / 8.5) : 25;
    
    const [entries] = await pool.execute(
      'SELECT * FROM time_entries WHERE user_id = ? AND DATE(clock_in) BETWEEN ? AND ? ORDER BY clock_in',
      [userId, startDate, endDate]
    );

    const [user] = await pool.execute(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (user.length === 0) return null;

    const userData = user[0];
    let totalHours = 0;
    let overtimeHours = 0;
    let undertimeHours = 0;

    // Get first and last clock times for the date range
    let firstClockIn = null;
    let lastClockOut = null;

    entries.forEach(entry => {
      const clockIn = new Date(entry.clock_in);
      let clockOut = entry.clock_out ? new Date(entry.clock_out) : null;

      // Skip entries without clock_out when generating payroll
      if (!clockOut) {
        return; // Skip this entry
      }

      const workedHours = (clockOut - clockIn) / (1000 * 60 * 60);

      // Track first clock in and last clock out
      if (!firstClockIn || clockIn < firstClockIn) {
        firstClockIn = clockIn;
      }
      if (!lastClockOut || clockOut > lastClockOut) {
        lastClockOut = clockOut;
      }

      // Check for late clock in (after 7:00 AM)
      const shiftStart = new Date(clockIn);
      shiftStart.setHours(7, 0, 0, 0);
      
      if (clockIn > shiftStart) {
        const lateHours = (clockIn - shiftStart) / (1000 * 60 * 60);
        undertimeHours += lateHours;
      }

      // NO EARLY CLOCK OUT DEDUCTION - removed this logic

      // Handle overtime calculation
      if (entry.overtime_requested && entry.overtime_approved) {
        const shiftEndTime = new Date(clockIn);
        shiftEndTime.setHours(15, 30, 0, 0);
        
        if (clockOut > shiftEndTime) {
          // Calculate overtime hours (subtract 30 minutes grace period)
          const overtimeStart = new Date(Math.max(shiftEndTime.getTime() + 30 * 60 * 1000, shiftEndTime.getTime()));
          const overtime = Math.max(0, (clockOut - overtimeStart) / (1000 * 60 * 60));
          overtimeHours += overtime;
          totalHours += workedHours; // Count actual worked hours
        } else {
          totalHours += workedHours; // Count actual worked hours
        }
      } else {
        totalHours += workedHours; // Count actual worked hours
      }
    });

    // Calculate based on actual hours worked
    const baseSalary = totalHours * hourlyRate;
    const overtimePay = overtimeHours * 35;
    const undertimeDeduction = undertimeHours * hourlyRate;
    
    // Calculate number of working days for staff house deduction
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const staffHouseDeduction = userData.staff_house ? (250 * daysDiff / 5) : 0; // Prorated
    
    const totalSalary = baseSalary + overtimePay - undertimeDeduction - staffHouseDeduction;

    return {
      totalHours,
      overtimeHours,
      undertimeHours,
      baseSalary,
      overtimePay,
      undertimeDeduction,
      staffHouseDeduction,
      totalSalary,
      clockInTime: firstClockIn ? formatDateTimeForMySQL(firstClockIn) : null,
      clockOutTime: lastClockOut ? formatDateTimeForMySQL(lastClockOut) : null
    };
  } catch (error) {
    console.error('Calculate payroll for date range error:', error);
    return null;
  }
}

// Keep the original function for backward compatibility
export async function generateWeeklyPayslips(weekStart) {
  try {
    // Get all users who have time entries for this week OR are currently active
    const [users] = await pool.execute(`
      SELECT DISTINCT u.* FROM users u 
      LEFT JOIN time_entries te ON u.id = te.user_id AND te.week_start = ?
      WHERE u.active = TRUE AND (te.user_id IS NOT NULL OR u.id IN (
        SELECT DISTINCT user_id FROM time_entries 
        WHERE DATE(clock_in) BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
      ))
    `, [weekStart, weekStart, weekStart]);

    const payslips = [];

    for (const user of users) {
      const payroll = await calculateWeeklyPayroll(user.id, weekStart);
      if (payroll && payroll.totalHours > 0) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        // Check if payslip already exists for this user and week
        const [existing] = await pool.execute(
          'SELECT id FROM payslips WHERE user_id = ? AND week_start = ?',
          [user.id, weekStart]
        );

        if (existing.length === 0) {
          const [result] = await pool.execute(
            `INSERT INTO payslips (user_id, week_start, week_end, total_hours, overtime_hours, 
             undertime_hours, base_salary, overtime_pay, undertime_deduction, staff_house_deduction, 
             total_salary, clock_in_time, clock_out_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              user.id, weekStart, weekEnd.toISOString().split('T')[0],
              payroll.totalHours, payroll.overtimeHours, payroll.undertimeHours,
              payroll.baseSalary, payroll.overtimePay, payroll.undertimeDeduction,
              payroll.staffHouseDeduction, payroll.totalSalary,
              payroll.clockInTime, payroll.clockOutTime
            ]
          );

          payslips.push({
            id: result.insertId,
            user: user.username,
            department: user.department,
            ...payroll
          });
        }
      }
    }

    return payslips;
  } catch (error) {
    console.error('Generate payslips error:', error);
    return [];
  }
}

export async function getPayrollReport(startDate, endDate = null) {
  try {
    console.log('Getting payroll report for:', startDate, endDate);
    
    let query, params;
    
    if (endDate) {
      // Date range query
      query = `SELECT p.*, u.username, u.department 
               FROM payslips p 
               JOIN users u ON p.user_id = u.id 
               WHERE p.week_start = ? AND p.week_end = ?
               ORDER BY u.department, u.username`;
      params = [startDate, endDate];
    } else {
      // Single week query (backward compatibility)
      query = `SELECT p.*, u.username, u.department 
               FROM payslips p 
               JOIN users u ON p.user_id = u.id 
               WHERE p.week_start = ? 
               ORDER BY u.department, u.username`;
      params = [startDate];
    }
    
    console.log('Executing query:', query, 'with params:', params);
    
    const [payslips] = await pool.execute(
      query,
      params
    );

    console.log('Found payslips:', payslips.length);
    return payslips;
  } catch (error) {
    console.error('Get payroll report error:', error);
    return [];
  }
}

export async function updatePayrollEntry(payslipId, updateData) {
  try {
    const { clockIn, clockOut, totalHours, overtimeHours, undertimeHours, baseSalary, overtimePay, undertimeDeduction, staffHouseDeduction } = updateData;
    
    const totalSalary = baseSalary + overtimePay - undertimeDeduction - staffHouseDeduction;

    // Format datetime values for MySQL
    const formattedClockIn = clockIn ? formatDateTimeForMySQL(new Date(clockIn)) : null;
    const formattedClockOut = clockOut ? formatDateTimeForMySQL(new Date(clockOut)) : null;

    await pool.execute(
      `UPDATE payslips SET 
       clock_in_time = ?, clock_out_time = ?, total_hours = ?, overtime_hours = ?, 
       undertime_hours = ?, base_salary = ?, overtime_pay = ?, undertime_deduction = ?, 
       staff_house_deduction = ?, total_salary = ?
       WHERE id = ?`,
      [formattedClockIn, formattedClockOut, totalHours, overtimeHours, undertimeHours, baseSalary, overtimePay, undertimeDeduction, staffHouseDeduction, totalSalary, payslipId]
    );

    return { success: true };
  } catch (error) {
    console.error('Update payroll entry error:', error);
    return { success: false, message: 'Server error' };
  }
}