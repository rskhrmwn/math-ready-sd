'use strict';
// Menguji pintu masuk Vercel (api/index.js) seperti dipanggil platform: start dingin pada database kosong, lalu permintaan biasa.
process.env.ADMIN_PASSWORD = 'AdminUji12345'; process.env.VERCEL = '1';
if (!process.env.DATABASE_URL) process.env.DATA_DIR = 'memory';
const http = require('http'), assert = require('assert'), handler = require('./api/index.js');
const srv = http.createServer((req, res) => handler(req, res));
srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port; let cookie = '';
  const call = async (m, u, b) => { const t0 = Date.now(); const r = await fetch(base + u, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', cookie }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => null), ms: Date.now() - t0 }; };
  try {
    let r = await call('GET', '/api/health'); assert.equal(r.s, 200); console.log('  ✓ start dingin (buat skema + isi data awal): ' + r.ms + ' ms');
    r = await call('GET', '/api/health'); assert.equal(r.s, 200); console.log('  ✓ permintaan berikutnya: ' + r.ms + ' ms');
    r = await call('POST', '/api/login', { username: 'admin', password: 'AdminUji12345' }); assert.equal(r.s, 200);
    r = await call('GET', '/api/admin/stats'); assert.equal(r.j.soal, 68); console.log('  ✓ login admin dan 68 soal tersedia lewat pintu masuk Vercel');
    for (let i = 0; i < 5; i++) await call('POST', '/api/login', { username: 'x', password: 'salah' + i });
    r = await call('POST', '/api/login', { username: 'x', password: 'salah' }); assert.equal(r.s, 429); console.log('  ✓ pembatas login tersimpan di database (bukan memori)');
    console.log('\nUJI VERCEL LOLOS'); process.exit(0);
  } catch (e) { console.error('GAGAL', e); process.exit(1); }
});
