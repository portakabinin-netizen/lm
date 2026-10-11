const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const t = mongoose.connection.useDb('41414546483437393441');
  const sources = await t.collection('leads').aggregate([
    {
      $group: {
        _id: '$source',
        total: { $sum: 1 },
        posCount: { $sum: { $cond: [{ $in: ['$status', ['Accepted', 'Invoice']] }, 1, 0] } },
        recycleCount: { $sum: { $cond: [{ $in: ['$status', ['Recycle', 'Delete']] }, 1, 0] } },
        pendingCount: { $sum: { $cond: [{ $in: ['$status', ['Recent', 'Engaged']] }, 1, 0] } }
      }
    }
  ]).toArray();

  const statuses = await t.collection('leads').aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();

  console.log('SOURCES:', JSON.stringify(sources));
  console.log('STATUSES:', JSON.stringify(statuses));
  process.exit(0);
}

run().catch(console.error);
