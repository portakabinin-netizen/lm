const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    const Users = mongoose.model("Users", new mongoose.Schema({}, { strict: false }), "users");

    const users = await Users.find({ "linkedCorporates.0": { $exists: true } });
    console.log(`Found ${users.length} potential users with linkedCorporates.`);

    for (const user of users) {
      let modified = false;
      const validCorporates = [];

      for (const item of (user.linkedCorporates || [])) {
        // Valid corporates must have a name or be a proper subdocument
        if (item.corporateName) {
          validCorporates.push(item);
        } else if (item.userProfileImage) {
          // It's a misplaced user profile image
          console.log(`Found misplaced userProfileImage in linkedCorporates for user ${user._id}`);
          if (!user.userProfileImage) {
            user.userProfileImage = item.userProfileImage;
          }
          modified = true;
        } else {
          // Just a junk object
          console.log(`Found invalid object in linkedCorporates for user ${user._id}:`, item);
          modified = true;
        }
      }

      if (modified || validCorporates.length !== (user.linkedCorporates || []).length) {
        user.linkedCorporates = validCorporates;
        await Users.updateOne({ _id: user._id }, { 
            $set: { 
                linkedCorporates: validCorporates,
                userProfileImage: user.userProfileImage
            }
        });
        console.log(`Cleaned up user ${user._id}`);
      }
    }

    console.log("Cleanup complete.");
    process.exit(0);
  } catch (err) {
    console.error("Cleanup failed:", err);
    process.exit(1);
  }
}

cleanup();
