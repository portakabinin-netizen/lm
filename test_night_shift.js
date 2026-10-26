const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/.env' });
const dbConnector = require('./utils/dbConnector');
const { getTenantModels } = require('./models/TenantModels');
const autoEndScheduler = require('./utils/autoEndScheduler');

async function test() {
  try {
    await dbConnector.getMainConnection();
    const dbName = '41444c50503539303542';
    const conn = await dbConnector.getTenantConnection(dbName);
    const { Attendance, Leads, Employees, SiteRosterHolidays } = getTenantModels(conn);

    console.log('--- TESTING autoStartScheduledShifts DIRECTLY ---');
    
    const now = new Date();
    const istOffsetMs = 5.5 * 3600000;
    const istDate = new Date(now.getTime() + istOffsetMs);
    const todayDateStr = istDate.toISOString().split('T')[0];
    const currentHour = istDate.getUTCHours();
    const currentMin = istDate.getUTCMinutes();
    const currentTotalMins = currentHour * 60 + currentMin;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayOfWeek = days[istDate.getUTCDay()];

    console.log('Current IST Time:', istDate.toISOString(), 'Hour:', currentHour, 'Min:', currentMin, 'TotalMins:', currentTotalMins, 'Day:', currentDayOfWeek);

    const leads = await Leads.find({ 'siteShifts.active': { $ne: false } }).lean();
    console.log(`Found ${leads.length} leads with active siteShifts`);

    for (const lead of leads) {
      const activeShifts = (lead.siteShifts || []).filter(s => s.active !== false);
      for (const shift of activeShifts) {
        const shiftCode = String(shift.shiftCode || 'G').trim().toUpperCase();
        if (shiftCode !== 'N2' && shiftCode !== 'N') continue; // Look at night shifts

        console.log(`\nChecking Site: ${lead.sender_name || lead.name}, Shift: ${shiftCode}`);
        const durationHrs = shift.durationHrs || (shift.shiftType === '12hr' ? 12 : 8);
        const startTimeStr = shift.startTime || (shiftCode === 'N2' || shiftCode === 'N' ? '20:00' : '08:00');
        const [sH, sM] = startTimeStr.split(':').map(Number);
        const shiftStartMins = (isNaN(sH) ? 8 : sH) * 60 + (isNaN(sM) ? 0 : sM);

        let isWithinShift = false;
        const shiftEndMinsRaw = shiftStartMins + durationHrs * 60;
        if (shiftEndMinsRaw <= 1440) {
          isWithinShift = currentTotalMins >= shiftStartMins && currentTotalMins < shiftEndMinsRaw;
        } else {
          const wrappedEndMins = shiftEndMinsRaw % 1440;
          isWithinShift = currentTotalMins >= shiftStartMins || currentTotalMins < wrappedEndMins;
        }

        console.log(`  startTimeStr: ${startTimeStr}, shiftStartMins: ${shiftStartMins}, shiftEndMinsRaw: ${shiftEndMinsRaw}, isWithinShift: ${isWithinShift}`);
        if (!isWithinShift) {
          console.log('  -> SKIPPED: Not within shift window');
          continue;
        }

        const activeCount = await Attendance.countDocuments({
          leadId: lead._id,
          shiftCode: shift.shiftCode,
          $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
        });
        const targetSlots = shift.workerSlots || 1;
        console.log(`  activeCount: ${activeCount}, targetSlots: ${targetSlots}`);
        if (activeCount >= targetSlots) {
          console.log('  -> SKIPPED: activeCount >= targetSlots');
          continue;
        }

        const scheduledStartIst = new Date(todayDateStr + 'T00:00:00.000Z');
        scheduledStartIst.setUTCHours(isNaN(sH) ? 8 : sH, isNaN(sM) ? 0 : sM, 0, 0);
        const scheduledStartUtc = new Date(scheduledStartIst.getTime() - istOffsetMs);
        const scheduledEndUtc = new Date(scheduledStartUtc.getTime() + durationHrs * 3600000);

        console.log(`  scheduledStartUtc: ${scheduledStartUtc.toISOString()}, scheduledEndUtc: ${scheduledEndUtc.toISOString()}, now: ${now.toISOString()}`);

        if (now >= scheduledEndUtc) {
          console.log('  -> SKIPPED: now >= scheduledEndUtc');
          continue;
        }

        const alreadyRanDuty = await Attendance.findOne({
          leadId: lead._id,
          shiftCode: shift.shiftCode,
          dutyStart: { $gte: new Date(scheduledStartUtc.getTime() - 2 * 3600000), $lte: scheduledEndUtc },
        }).lean();

        if (alreadyRanDuty) {
          console.log(`  -> SKIPPED: alreadyRanDuty found (${alreadyRanDuty._id}, dutyStart: ${alreadyRanDuty.dutyStart})`);
          continue;
        }

        let targetWorkerId = shift.boundWorkerId ? String(shift.boundWorkerId) : null;
        let prevDuty = null;
        if (!targetWorkerId) {
          prevDuty = await Attendance.findOne({
            leadId: lead._id,
            shiftCode: shift.shiftCode,
            dutyEnd: { $exists: true, $ne: null },
          }).sort({ dutyStart: -1 }).lean();

          if (prevDuty && prevDuty.employeeId) {
            targetWorkerId = String(prevDuty.employeeId);
          }
        }

        console.log(`  boundWorkerId: ${shift.boundWorkerId}, prevDuty found: ${!!prevDuty}, targetWorkerId: ${targetWorkerId}`);
        if (!targetWorkerId) {
          console.log('  -> SKIPPED: No targetWorkerId resolved!');
          continue;
        }

        const workerBusy = await Attendance.findOne({
          employeeId: targetWorkerId,
          $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
        }).lean();

        if (workerBusy) {
          console.log(`  -> SKIPPED: workerBusy on ${workerBusy._id} (${workerBusy.shiftCode})`);
          continue;
        }

        console.log(`  ===> WOULD AUTO-START SHIFT for worker ${targetWorkerId}!`);
      }
    }

  } catch (err) {
    console.error('Test error:', err);
  } finally {
    process.exit(0);
  }
}

test();
