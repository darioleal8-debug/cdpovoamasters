const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'app');
const authDir = path.join(appDir, 'auth');
const dashboardDir = path.join(appDir, 'dashboard');

function removeDir(dir) {
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return !fs.existsSync(dir);
}

const authRemoved = removeDir(authDir);
const dashboardRemoved = removeDir(dashboardDir);

console.log('authRemoved:', authRemoved);
console.log('dashboardRemoved:', dashboardRemoved);
console.log('remaining app contents:', fs.existsSync(appDir) ? fs.readdirSync(appDir) : []);
