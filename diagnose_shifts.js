const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/.env' });
const dbConnector = require('./utils/dbConnector');
const userMaster = require('./models/userMaster');
const { getTenantModels } = require('./models/TenantModels');

async function run() {
  try {
    await dbConnector.getMainConnection();
    console.log('Connected to main DB');

    const dbNames = await userMaster.distinct('accessCorporate.dbName', {
      'accessCorporate.isActive': { $ne: false },
    });
    console.log('Active DBs:', dbNames);

    for (const dbName of dbNames) {
      if (!dbName) continue;
      console.log(`\n=================== CHECKING TENANT: ${dbName} ===================`);
      const conn = await dbConnector.getTenantConnection(dbName);
      const { Attendance, Leads, Employees } = getTenantModels(conn);

      // Check sites with siteShifts
      const sites = await Leads.find({ 'siteShifts.0': { $exists: true } }).lean();
      console.log(`Sites with siteShifts: ${sites.length}`);
      for (const site of sites) {
        console.log(`Site: ${site.sender_name || site.name} (_id: ${site._id})`);
        console.log(`siteShifts:`, JSON.stringify(site.siteShifts, null, 2));
      }

      // Check attendance for today
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todayAttendances = await Attendance.find({
        dutyStart: { $gte: startOfToday }
      }).lean();
      console.log(`Today's Attendance records count: ${todayAttendances.length}`);
      for (const att of todayAttendances) {
        console.log(`Attendance ID: ${att._id}, Worker: ${att.workerName} (${att.employeeId}), Shift: ${att.shiftCode}, DutyStart: ${att.dutyStart}, DutyEnd: ${att.dutyEnd}, Status: ${att.status}, Site: ${att.site_name || att.leadId}`);
      }

      // Check all active attendance (dutyEnd is null or missing)
      const active = await Attendance.find({
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }]
      }).lean();
      console.log(`Currently ACTIVE Attendance records: ${active.length}`);
      for (const att of active) {
        console.log(`  ACTIVE: ${att._id}, Worker: ${att.workerName}, Shift: ${att.shiftCode}, DutyStart: ${att.dutyStart}, Site: ${att.site_name || att.leadId}`);
      }
    }
  } catch (e) {
    console.error('Diagnostic error:', e);
  } finally {
    process.exit(0);
  }
}

run();
