const fs = require('fs');
const logFile = '/tmp/tc-dash-debug.log';
function log(msg) {
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
}

log('debug-main.js starting');

const modules = [
  'electron',
  'path',
  'url',
  'dotenv',
  './database.js',
  './ipc-handlers.js',
  './alert-scheduler.js',
  './reminder-scheduler.js',
  './fub-person-sync.js',
  './fub-file-sync.js',
];

for (const mod of modules) {
  try {
    require(mod);
    log(`OK: require('${mod}')`);
  } catch (err) {
    log(`FAIL: require('${mod}'): ${err.message}\n${err.stack}`);
  }
}

log('All requires done, loading main.js...');
try {
  require('./main.js');
  log('main.js loaded OK');
} catch (err) {
  log(`main.js FAILED: ${err.message}\n${err.stack}`);
}
