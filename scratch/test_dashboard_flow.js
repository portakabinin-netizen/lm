const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './backend/.env' });

async function run() {
  const token = jwt.sign(
    {
      userId: '69ecaba383301d887245e925',
      userRole: 'CorpAdmin',
      accessAllow: true,
      dbName: '41414546483437393441',
      corporateId: '6aaa79d6a7edfd6caa61e637',
      corporateName: 'portakabin.in',
      corpAdminId: '69ecaba383301d887245e925'
    },
    process.env.JWT_SECRET,
    { expiresIn: '90d' }
  );

  console.log('Testing GET /service/leads/analytics...');
  const analyticsRes = await fetch('http://localhost:5001/api/service/leads/analytics', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const analyticsData = await analyticsRes.json();
  console.log('Analytics status:', analyticsRes.status, 'total:', analyticsData.total, 'data:', JSON.stringify(analyticsData));

  console.log('\nTesting GET /service/leads/project-active...');
  const projRes = await fetch('http://localhost:5001/api/service/leads/project-active', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const projData = await projRes.json();
  console.log('Project Active status:', projRes.status, 'data length:', projData.data?.length);

  console.log('\nTesting GET /service/leads/status/Engaged...');
  const statusRes = await fetch('http://localhost:5001/api/service/leads/status/Engaged', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const statusData = await statusRes.json();
  console.log('Status Engaged status:', statusRes.status, 'data length:', statusData.data?.length);

  process.exit(0);
}

run().catch(console.error);
