const mongoose = require('mongoose');
const userMaster = require('./models/userMaster');

async function syncUsers() {
  const uri = "mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority";
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  const empSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'userMaster' },
    userRole: { type: String, trim: true },
    shiftGroupName: { type: String, enum: ['MANG', 'DaNi', null], default: null },
    selectedShift: { type: String, trim: true },
    monthlyRate: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
  }, { strict: false });
  
  const users = await userMaster.find({}).lean();
  console.log(`Found ${users.length} registered users.`);

  let syncedCount = 0;
  
  for (const user of users) {
      if (!user.accessCorporate || user.accessCorporate.length === 0) continue;
      
      for (const access of user.accessCorporate) {
          if (!access.dbName) continue;
          
          const db = mongoose.connection.useDb(access.dbName);
          const Employees = db.model('Employees', empSchema);
          
          // Check if employee already exists via _id
          let emp = await Employees.findById(user._id);
          
          if (!emp) {
              emp = new Employees({
                  _id: user._id, 
                  name: user.userDisplayName || 'User',
                  mobile: user.userMobile || '',
                  email: user.userEmail || '',
                  user_id: user._id,
                  userRole: user.userRole,
                  shiftGroupName: "MANG", // Default
                  selectedShift: "G",     // Default General
                  monthlyRate: 0          // Default
              });
              await emp.save();
              console.log(`Synced user ${user.userDisplayName} to ${access.dbName}`);
              syncedCount++;
          } else {
              // Update existing employee
              let updated = false;
              if (emp.userRole !== user.userRole) { emp.userRole = user.userRole; updated = true; }
              if (!emp.shiftGroupName) { emp.shiftGroupName = "MANG"; updated = true; }
              if (!emp.selectedShift) { emp.selectedShift = "G"; updated = true; }
              if (emp.monthlyRate === undefined) { emp.monthlyRate = 0; updated = true; }
              if (!emp.user_id) { emp.user_id = user._id; updated = true; }
              
              if (updated) {
                  await emp.save();
                  console.log(`Updated user ${user.userDisplayName} in ${access.dbName}`);
              }
          }
      }
  }
  
  console.log(`Sync complete. Synced ${syncedCount} new employees.`);
  process.exit(0);
}

syncUsers().catch(console.error);
