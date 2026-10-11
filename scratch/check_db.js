const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('scratch/RKStorage');

db.get("SELECT value FROM catalystLocalStorage WHERE key='userSession'", (err, row) => {
  if (err) return console.error(err);
  const session = JSON.parse(row.value);
  console.log('User session:', {
    userId: session.user?._id || session.userId,
    corporateName: session.user?.corporateName,
    companyName: session.user?.companyName,
    role: session.user?.userRole || session.user?.role,
    pan: session.user?.panNumber,
    token: session.token ? session.token.substring(0, 30) + '...' : null
  });

  // Now test the API request
  const axios = require('axios');
  const token = session.token;
  const baseUrl = 'https://hipk-gsz6.onrender.com/api';

  const selectedYear = 2026;
  const selectedMonth = 8; // September
  const startOfMonth = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
  const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);

  console.log('Fetching logs for range:', startOfMonth.toISOString(), 'to', endOfMonth.toISOString());

  axios.get(`${baseUrl}/service/hr/attendance`, {
    params: {
      from_date: startOfMonth.toISOString(),
      to_date: endOfMonth.toISOString(),
    },
    headers: { Authorization: `Bearer ${token}` }
  }).then(res => {
    console.log('Response status:', res.status);
    console.log('Success:', res.data?.success);
    const logs = res.data?.data || res.data || [];
    console.log('Total attendance logs returned:', logs.length);
    if (logs.length > 0) {
      console.log('Sample log:', JSON.stringify(logs[0], null, 2));
    }
  }).catch(err => {
    console.error('API Error:', err.response?.status, err.response?.data || err.message);
  });

  // Also fetch clients/leads
  axios.get(`${baseUrl}/service/leads`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(res => {
    const leads = res.data?.data || res.data || [];
    console.log('Total leads/clients returned:', leads.length);
    if (leads.length > 0) {
      console.log('Sample lead statuses:', leads.slice(0, 5).map(l => ({ name: l.sender_name, status: l.status, shifts: l.siteShifts?.length || l.shifts?.length })));
    }
  }).catch(err => {
    console.error('Leads Error:', err.response?.status, err.response?.data || err.message);
  });
});
