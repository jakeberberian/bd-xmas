'use strict';
// Session cookies and PIN hashing. Uses only Node's built-in crypto.
const crypto = require('crypto');

function sign(payload, secret) {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.createHmac('sha256', secret).update(p).digest('base64url');
  return p + '.' + s;
}

function verify(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const i = token.indexOf('.');
  if (i < 1) return null;
  const p = token.slice(0, i);
  const s = token.slice(i + 1);
  const want = crypto.createHmac('sha256', secret).update(p).digest('base64url');
  const a = Buffer.from(s);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (!o || typeof o.n !== 'string' || typeof o.e !== 'number' || o.e < Date.now()) return null;
    return o;
  } catch (e) {
    return null;
  }
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pin), salt, 32);
  return 's1$' + salt.toString('hex') + '$' + key.toString('hex');
}

function checkPin(pin, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 's1') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const want = Buffer.from(parts[2], 'hex');
  const got = crypto.scryptSync(String(pin), salt, 32);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(function (kv) {
    const i = kv.indexOf('=');
    if (i > 0) out[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  return out;
}

module.exports = { sign, verify, hashPin, checkPin, parseCookies };
