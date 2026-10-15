const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

console.log("=================================================");
console.log("🧹 Expo & Android Asset Cache Cleaner & Restarter");
console.log("=================================================\n");

const root = process.cwd();

// 1. Delete local Metro & Expo build cache directories
const cacheDirs = [".expo", "node_modules/.cache/metro"];
cacheDirs.forEach(dir => {
  const dirPath = path.join(root, dir);
  if (fs.existsSync(dirPath)) {
    console.log(`🗑️  Deleting local cache: ${dir}...`);
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (e) {
      console.warn(`⚠️  Failed to delete ${dir}: ${e.message}`);
    }
  }
});

// 2. Clear Watchman (if installed)
try {
  console.log("⚡ Clearing watchman file watchers...");
  execSync("watchman watch-del-all", { stdio: "ignore" });
} catch (e) {
  // watchman might not be in PATH, ignore silently
}

// 3. Clear storage and force native asset refresh on all active ADB devices
try {
  const devicesOutput = execSync("adb devices").toString();
  const devices = devicesOutput
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("List") && line.includes("device"))
    .map(line => line.split("\t")[0]);

  if (devices.length > 0) {
    console.log(`📱 Found ${devices.length} active Android device(s).`);
    devices.forEach(device => {
      console.log(`🧹 Wiping package asset data on: ${device}...`);
      try {
        execSync(`adb -s ${device} shell pm clear com.hibiz.app`, { stdio: "ignore" });
        console.log(`✅ Cleared com.hibiz.app successfully on ${device}`);
      } catch (err) {
        console.warn(`⚠️  Could not clear com.hibiz.app on device ${device}`);
      }
    });
  } else {
    console.log("ℹ️  No active Android devices connected via ADB.");
  }
} catch (e) {
  console.log("ℹ️  ADB command not found or unavailable. Skipping Android storage flush.");
}

console.log("\n🚀 Starting Expo development server with a clean asset cache...");
try {
  execSync("npx expo start -c", { stdio: "inherit" });
} catch (err) {
  console.error("❌ Expo failed to start:", err.message);
}
