const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'app');
const legacyDir = path.join(root, 'legacy-app');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function moveDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(path.dirname(dest));
  const entries = fs.readdirSync(src);
  if (!entries.length) return;
  fs.renameSync(src, dest);
}

ensureDir(legacyDir);
moveDir(path.join(appDir, 'auth'), path.join(legacyDir, 'auth'));
moveDir(path.join(appDir, 'dashboard'), path.join(legacyDir, 'dashboard'));

console.log('Moved legacy folders:', fs.existsSync(path.join(legacyDir, 'auth')) ? 'auth' : '', fs.existsSync(path.join(legacyDir, 'dashboard')) ? 'dashboard' : '');
console.log('Remaining app contents:', fs.existsSync(appDir) ? fs.readdirSync(appDir) : []);
