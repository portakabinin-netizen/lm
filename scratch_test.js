const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/hipk/backend/.env' });
(async () => {
  try {
    const conn = await mongoose.createConnection(process.env.MONGO_URI, { dbName: '41444c50503539303542' }).asPromise();
    const db = conn.db;
    const leads = await db.collection('leads').find(
      { status: { $in: ['Accepted', 'Tax Invoice'] } },
      { projection: { _id: 1, sender_name: 1, siteShifts: 1 } }
    ).toArray();
    console.log('Total accepted leads in tenant db:', leads.length);
    for (const lead of leads) {
      const lastAtt = await db.collection('attendances').find({
        $or: [{ leadId: lead._id }, { leadId: String(lead._id) }]
      }).sort({ dutyStart: -1, createdAt: -1 }).limit(1).toArray();
      console.log('Lead:', lead.sender_name, String(lead._id), 'Last attendance:', lastAtt.length > 0 ? { date: lastAtt[0].date, dutyStart: lastAtt[0].dutyStart, employeeId: lastAtt[0].employeeId, employee_name: lastAtt[0].employee_name } : 'NONE');
    }
    await conn.close();
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
})();
