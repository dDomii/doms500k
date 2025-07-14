import { pool } from './database.js';

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

export async function calculateDailyPayroll(userId, date) {
  try {
    const breaktimeEnabled = await getBreaktimeSetting();
    const standardHoursPerDay = 8.5; // Always 8.5 hours for ₱200 base pay
    const maxBasePay = 200; // Cap base pay at ₱200
    const hourlyRate = 200 / 8.5; // ₱23.53 per hour
    
    // Get time entry for specific date
    const [entries] = await pool.execute(
      'SELECT * FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ? ORDER BY clock_in',
      [userId, date]
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

    // Get first and last clock times for the day
    let firstClockIn = null;
    let lastClockOut = null;

    entries.forEach(entry => {
      const clockIn = new Date(entry.clock_in);
      let clockOut = entry.clock_out ? new Date(entry.clock_out) : null;

      // Skip entries without clock_out when generating payroll
      if (!clockOut) {
        return; // Skip this entry
      }

      // Define shift start time (7:00 AM)
      const shiftStart = new Date(clockIn);
      shiftStart.setHours(7, 0, 0, 0);
      
      // Define shift end time (3:30 PM)
      const shiftEnd = new Date(clockIn);
      shiftEnd.setHours(15, 30, 0, 0);
      
      // Work hours only count from 7:00 AM onwards
      const effectiveClockIn = clockIn < shiftStart ? shiftStart : clockIn;
      
      // Calculate worked hours from 7:00 AM onwards only
      let workedHours = Math.max(0, (clockOut.getTime() - effectiveClockIn.getTime()) / (1000 * 60 * 60));
      
      // Only count positive worked hours
      if (workedHours <= 0) {
        return; // Skip if no valid work time
      }
      
      // Track first clock in and last clock out
      if (!firstClockIn || clockIn < firstClockIn) {
        firstClockIn = clockIn;
      }
      if (!lastClockOut || clockOut > lastClockOut) {
        lastClockOut = clockOut;
      }

      // Check for late clock in (after 7:00 AM)
      if (clockIn > shiftStart) {
        const lateHours = (clockIn.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);
        undertimeHours += lateHours;
      }

      // Handle overtime calculation
      if (entry.overtime_requested && entry.overtime_approved) {
        if (clockOut > shiftEnd) {
          // Overtime starts immediately at 3:30 PM when approved
          const overtime = Math.max(0, (clockOut.getTime() - shiftEnd.getTime()) / (1000 * 60 * 60));
          overtimeHours += overtime;
        }
      }
      
      // Add to total hours - work hours are already calculated from 7:00 AM
      // Cap at 8.5 hours per day for base pay calculation
      const dailyBaseHours = Math.min(workedHours, standardHoursPerDay);
      totalHours += dailyBaseHours;
    });

    // Calculate base salary (capped at ₱200 for 8.5 hours)
    const baseSalary = Math.min(totalHours * hourlyRate, maxBasePay);
    const overtimePay = overtimeHours * 35;
    const undertimeDeduction = undertimeHours * hourlyRate;
    const staffHouseDeduction = userData.staff_house ? (250 / 5) : 0; // Daily portion of weekly deduction
    
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
    console.error('Calculate daily payroll error:', error);
    return null;
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
      // Generate payslip for each selected date
      for (const date of selectedDates) {
        const payroll = await calculateDailyPayroll(user.id, date);
        if (payroll && payroll.totalHours > 0) {
          // Check if payslip already exists for this user and date
          const [existing] = await pool.execute(
            'SELECT id FROM payslips WHERE user_id = ? AND week_start = ? AND week_end = ?',
            [user.id, date, date]
          );

          if (existing.length === 0) {
            const [result] = await pool.execute(
              `INSERT INTO payslips (user_id, week_start, week_end, total_hours, overtime_hours, 
               undertime_hours, base_salary, overtime_pay, undertime_deduction, staff_house_deduction, 
               total_salary, clock_in_time, clock_out_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                user.id, date, date,
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
              date: date,
              ...payroll
            });
          }
        }
      }
    }

    return payslips;
  } catch (error) {
    console.error('Generate payslips for specific days error:', error);
    return [];
  }
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
      // Get all dates between start and end date
      const dates = [];
      const currentDate = new Date(startDate);
      const endDateObj = new Date(endDate);
      
      while (currentDate <= endDateObj) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Generate payslip for each date that has time entries
      for (const date of dates) {
        const [hasEntry] = await pool.execute(
          'SELECT id FROM time_entries WHERE user_id = ? AND DATE(clock_in) = ? AND clock_out IS NOT NULL',
          [user.id, date]
        );

        if (hasEntry.length > 0) {
          const payroll = await calculateDailyPayroll(user.id, date);
          if (payroll && payroll.totalHours > 0) {
            // Check if payslip already exists for this user and date
            const [existing] = await pool.execute(
              'SELECT id FROM payslips WHERE user_id = ? AND week_start = ? AND week_end = ?',
              [user.id, date, date]
            );

            if (existing.length === 0) {
              const [result] = await pool.execute(
                `INSERT INTO payslips (user_id, week_start, week_end, total_hours, overtime_hours, 
                 undertime_hours, base_salary, overtime_pay, undertime_deduction, staff_house_deduction, 
                 total_salary, clock_in_time, clock_out_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  user.id, date, date,
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
                date: date,
                ...payroll
              });
            }
          }
        }
      }
    }

    return payslips;
  } catch (error) {
    console.error('Generate payslips for date range error:', error);
    return [];
  }
}

// Keep the original weekly function for backward compatibility
export async function generateWeeklyPayslips(weekStart) {
  try {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    return await generatePayslipsForDateRange(weekStart, weekEndStr);
  } catch (error) {
    console.error('Generate weekly payslips error:', error);
    return [];
  }
}

export async function getPayrollReport(startDate, endDate = null) {
  try {
    console.log('Getting payroll report for:', startDate, endDate);
    
    let query, params;
    
    if (endDate) {
      // Date range query - get all payslips within the range
      query = `SELECT p.*, u.username, u.department 
               FROM payslips p 
               JOIN users u ON p.user_id = u.id 
               WHERE DATE(p.week_start) BETWEEN ? AND DATE(p.week_end)
               ORDER BY p.week_start DESC, u.department, u.username`;
      params = [startDate, endDate];
    } else {
      // Single date query
      query = `SELECT p.*, u.username, u.department 
               FROM payslips p 
               JOIN users u ON p.user_id = u.id 
               WHERE DATE(p.week_start) = ? 
               ORDER BY u.department, u.username`;
      params = [startDate];
    }
    
    console.log('Executing query:', query, 'with params:', params);
    
    const [payslips] = await pool.execute(query, params);

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

// New function to get available dates with time entries
export async function getAvailableDatesWithEntries(userIds = null) {
  try {
    let query = `
      SELECT DISTINCT DATE(te.clock_in) as entry_date, 
             COUNT(DISTINCT te.user_id) as user_count,
             COUNT(te.id) as total_entries
      FROM time_entries te 
      JOIN users u ON te.user_id = u.id 
      WHERE u.active = TRUE AND te.clock_out IS NOT NULL
    `;
    let params = [];
    
    if (userIds && userIds.length > 0) {
      query += ` AND u.id IN (${userIds.map(() => '?').join(',')})`;
      params.push(...userIds);
    }
    
    query += ` GROUP BY DATE(te.clock_in) ORDER BY entry_date DESC LIMIT 30`;
    
    const [dates] = await pool.execute(query, params);
    return dates;
  } catch (error) {
    console.error('Error getting available dates:', error);
    return [];
  }
}

// New function to get time entries for specific date
export async function getTimeEntriesForDate(date, userIds = null) {
  try {
    let query = `
      SELECT te.*, u.username, u.department 
      FROM time_entries te 
      JOIN users u ON te.user_id = u.id 
      WHERE DATE(te.clock_in) = ? AND u.active = TRUE
    `;
    let params = [date];
    
    if (userIds && userIds.length > 0) {
      query += ` AND u.id IN (${userIds.map(() => '?').join(',')})`;
      params.push(...userIds);
    }
    
    query += ` ORDER BY u.department, u.username, te.clock_in`;
    
    const [entries] = await pool.execute(query, params);
    return entries;
  } catch (error) {
    console.error('Error getting time entries for date:', error);
    return [];
  }
}