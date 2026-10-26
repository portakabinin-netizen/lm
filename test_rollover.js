const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/.env' });
const dbConnector = require('./utils/dbConnector');
const { getTenantModels } = require('./models/TenantModels');
const autoEndScheduler = require('./utils/autoEndScheduler');

async function testRollover() {
  try {
    await dbConnector.getMainConnection();
    const dbName = '41444c50503539303542';
    const conn = await dbConnector.getTenantConnection(dbName);
    const { Attendance } = getTenantModels(conn);

    const closedAtt = await Attendance.findById('6adebf994d3039d7e863861b').lean();
    console.log('Testing handleAutoShiftRollover with closed attendance:', closedAtt._id, closedAtt.shiftCode, closedAtt.workerName);

    await autoEndScheduler.handleAutoShiftRollover(closedAtt, Attendance, dbName, null);
    console.log('Finished handleAutoShiftRollover');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

testRollover();
