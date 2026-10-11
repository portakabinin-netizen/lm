const fs = require('fs');
const vm = require('vm');

const files = [
  'C:/Users/herry/Dropbox/webHiBiz/index.html',
  'C:/Users/herry/Dropbox/webHiBiz/attendanceReport.html',
  'C:/Users/herry/Dropbox/webHiBiz/salaryReport.html',
];

files.forEach(file => {
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    console.error(`No script found in ${file}`);
    process.exit(1);
  }
  try {
    new vm.Script(match[1]);
    console.log(`[PASS] ${file} script syntax is clean!`);
  } catch (err) {
    console.error(`[FAIL] ${file}:`, err);
    process.exit(1);
  }
});
