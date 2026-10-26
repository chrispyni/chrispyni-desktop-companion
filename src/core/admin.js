// Admin / dev "cheat" mode gate. NOT real security: anyone who can edit the config can become admin.
// It only hides test cheats from normal users (e.g. a viewer edition).
'use strict';
const crypto = require('crypto');

function hashPassphrase(pass, salt = crypto.randomBytes(12).toString('hex')) {
  const h = crypto.scryptSync(String(pass), salt, 32).toString('hex');
  return { salt, hash: h };
}
function checkPassphrase(pass, rec) {
  if (!rec || !rec.salt || !rec.hash || !pass) return false;
  const h = crypto.scryptSync(String(pass), rec.salt, 32);
  const want = Buffer.from(rec.hash, 'hex');
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}
/** cfg: { usernames:[], hostnames:[], passphrase:{salt,hash} }  who: {username, hostname} */
function isAdminByIdentity(cfg = {}, who = {}) {
  const lc = (a) => (a || []).map((x) => String(x).toLowerCase()).filter((x) => x && !x.startsWith('your-'));
  return lc(cfg.usernames).includes(String(who.username || '').toLowerCase()) ||
         lc(cfg.hostnames).includes(String(who.hostname || '').toLowerCase());
}
module.exports = { hashPassphrase, checkPassphrase, isAdminByIdentity };
