'use strict';
const crypto = require('crypto');
// Pembaca CSV (RFC 4180 sederhana): mendukung tanda kutip, koma, dan pemisah titik koma.
function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const d = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === d) { r.push(f.trim()); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; r.push(f.trim()); f = ''; if (r.join('') !== '') rows.push(r); r = []; }
    else f += c;
  }
  r.push(f.trim()); if (r.join('') !== '') rows.push(r);
  if (!rows.length) return [];
  const h = rows[0].map((x) => x.toLowerCase());
  return rows.slice(1).map((c, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => { o[k] = c[j] || ''; }); return o; });
}
function headers(text) { return (String(text).replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '').split(/[,;]/).map((x) => x.trim().toLowerCase()); }
const pin = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
function password(n = 12) { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += a[crypto.randomInt(a.length)]; return s; }
module.exports = { parseCSV, headers, pin, password };
