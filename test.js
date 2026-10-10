'use strict';
// Uji alur utama dengan database tertanam (memori). Jalankan: npm test
process.env.DATA_DIR = 'memory'; process.env.ADMIN_PASSWORD = 'AdminUji12345';
const assert = require('assert'); const { start } = require('./server');
let base; const jar = {};
async function call(who, method, url, body, hdr = {}) {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', ...(jar[who] ? { cookie: jar[who] } : {}), ...hdr }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
}
const ok = (n) => console.log('  ✓ ' + n);
require('fs').readFileSync; assert.equal(require('./schema.js').trim(), require('fs').readFileSync(__dirname + '/schema.sql', 'utf8').trim(), 'schema.js harus sama dengan schema.sql (jalankan: node tools/embed-schema.js)');
(async () => {
  const { server } = await start(0); base = 'http://127.0.0.1:' + server.address().port;
  let r;
  r = await call('x', 'GET', '/api/me'); assert.equal(r.s, 401); ok('tanpa login ditolak');
  r = await call('x', 'POST', '/api/login', { username: 'admin', password: 'salah' }, {}); assert.equal(r.s, 401); ok('kata sandi salah ditolak');
  r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(r.status, 403); ok('tanpa header anti-CSRF ditolak');
  r = await call('admin', 'POST', '/api/login', { username: 'admin', password: 'AdminUji12345' }); assert.equal(r.s, 200); ok('admin masuk');
  r = await call('admin', 'GET', '/api/admin/stats'); assert.equal(r.j.soal, 68); assert.equal(r.j.soal_siap, 0); ok('68 soal ter-seed, semua belum diperiksa');
  r = await call('admin', 'POST', '/api/admin/users', { username: 'guru6a', display_name: 'Guru 6A', role: 'teacher' }); assert.equal(r.s, 200); const tpw = r.j.password; ok('akun guru dibuat');
  r = await call('guru', 'POST', '/api/login', { username: 'guru6a', password: tpw }); assert.equal(r.s, 200);
  r = await call('guru', 'GET', '/api/admin/stats'); assert.equal(r.s, 403); ok('guru tidak bisa membuka API admin');
  const csv = 'nama_lengkap,nama_panggilan,nisn,kelas,rombel,tahun_ajaran\nAhmad Uji,Ahmad,0099000001,6,6A,2026/2027\nDina Uji,Dina,0099000002,6,6A,2026/2027\nRaka Uji,Raka,12345,6,6A,2026/2027\nBudi Uji,Dina,0099000004,6,6A,2026/2027\nSalsa Uji,Salsa,0099000005,7,6A,2026/2027';
  r = await call('guru', 'POST', '/api/classes/import', { csv: csv + '\n' }); assert.equal(r.j.created.length, 2); assert.equal(r.j.errors.length, 3); ok('impor siswa: 2 dibuat, 3 ditolak (' + r.j.errors.map((e) => e.row).join(',') + ')');
  const cards = r.j.created;
  r = await call('guru', 'POST', '/api/classes/import', { csv: 'nama_lengkap,nik,nisn,kelas,rombel,tahun_ajaran\nA,1,0099000009,6,6A,2026/2027' }); assert.equal(r.s, 400); ok('kolom data pribadi (NIK) ditolak');
  r = await call('guru', 'GET', '/api/classes'); const cid = r.j[0].id; assert.equal(r.j[0].students, 2);
  r = await call('guru', 'GET', '/api/classes/' + cid + '/students'); assert.ok(r.j[0].nisn.startsWith('••')); ok('NISN hanya tampil sebagian di daftar kelas');
  r = await call('guru', 'GET', '/api/packages'); const pid = r.j[0].id; assert.equal(r.j[0].n, 25);
  r = await call('guru', 'POST', '/api/assignments', { package_id: pid, class_id: cid, due: '2099-12-31' }); assert.equal(r.s, 409); ok('tugas ditolak sebelum soal diperiksa');
  r = await call('guru', 'POST', '/api/packages/' + pid + '/mark-reviewed', {}); assert.equal(r.s, 400);
  r = await call('guru', 'POST', '/api/packages/' + pid + '/mark-reviewed', { confirm: true }); assert.equal(r.j.updated, 25); ok('guru menandai paket sudah diperiksa');
  r = await call('guru', 'POST', '/api/assignments', { package_id: pid, class_id: cid, due: '2099-12-31' }); assert.equal(r.s, 200); ok('tugas dibuat');
  const s1 = cards.find((c) => c.nama === 'Ahmad'), s2 = cards.find((c) => c.nama === 'Dina');
  r = await call('s2', 'POST', '/api/login', { username: s2.nisn, password: '000000' }); assert.equal(r.s, 401);
  r = await call('s1', 'POST', '/api/login', { username: s1.nisn, password: s1.pin }); assert.equal(r.s, 200); ok('siswa masuk dengan NISN + PIN');
  r = await call('s1', 'GET', '/api/classes'); assert.equal(r.s, 403); ok('siswa tidak bisa membuka API guru');
  r = await call('s1', 'GET', '/api/student/assignments'); const aid = r.j.assignments[0].id; assert.equal(r.j.assignments.length, 1);
  r = await call('s1', 'POST', '/api/attempts', { assignment_id: aid }); assert.equal(r.s, 200); const at = r.j;
  assert.equal(at.questions.length, 25); assert.ok(!JSON.stringify(at).includes('"answer"') && !JSON.stringify(at).includes('explanation')); ok('soal dikirim tanpa kunci dan pembahasan');
  const q0 = at.questions[0]; r = await call('s1', 'PUT', '/api/attempts/' + at.attempt_id + '/answers', { question_id: q0.id, response: 'Z' }); assert.equal(r.s, 400); ok('format jawaban tidak valid ditolak');
  r = await call('s1', 'PUT', '/api/attempts/' + at.attempt_id + '/answers', { question_id: 'MTH6-XXX-999', response: 'A' }); assert.equal(r.s, 400);
  // jawab benar semua yang PG pertama lewat kunci dari sisi admin
  let benar = 0;
  for (const q of at.questions) {
    const k = (await call('admin', 'GET', '/api/questions/' + q.id)).j.answer; let resp;
    if (q.qtype === 'PG') resp = benar < 10 ? k[0] : 'A'; else if (q.qtype === 'PGK_MCMA') resp = k; else resp = k;
    if (q.qtype === 'PG' && benar < 10) benar++;
    r = await call('s1', 'PUT', '/api/attempts/' + at.attempt_id + '/answers', { question_id: q.id, response: resp }); assert.equal(r.s, 200);
  }
  r = await call('s2', 'GET', '/api/attempts/' + at.attempt_id + '/result'); assert.equal(r.s, 401);
  r = await call('s2', 'POST', '/api/login', { username: s2.nisn, password: s2.pin }); assert.equal(r.s, 200);
  r = await call('s2', 'GET', '/api/attempts/' + at.attempt_id + '/result'); assert.equal(r.s, 404); ok('siswa lain tidak bisa melihat hasil siswa ini');
  r = await call('s2', 'PUT', '/api/attempts/' + at.attempt_id + '/answers', { question_id: q0.id, response: 'A' }); assert.equal(r.s, 404);
  r = await call('s1', 'GET', '/api/attempts/' + at.attempt_id + '/result'); assert.equal(r.s, 409); ok('hasil tidak bisa dilihat sebelum dikumpulkan');
  r = await call('s1', 'POST', '/api/attempts/' + at.attempt_id + '/submit'); assert.equal(r.s, 200); console.log('    skor siswa:', r.j.score, '/', r.j.total);
  assert.ok(r.j.score >= 10 + 7 && r.j.score <= 25 && r.j.items[0].key); ok('dikumpulkan dan dinilai di server');
  r = await call('s1', 'PUT', '/api/attempts/' + at.attempt_id + '/answers', { question_id: q0.id, response: 'A' }); assert.equal(r.s, 409); ok('jawaban tidak bisa diubah setelah dikumpulkan');
  r = await call('s1', 'POST', '/api/attempts', { assignment_id: aid }); assert.equal(r.s, 409);
  r = await call('guru', 'GET', '/api/assignments/' + aid + '/results'); assert.equal(r.j.students.length, 2); assert.ok(r.j.students.some((x) => x.status === 'submitted') && r.j.students.some((x) => x.status === null)); assert.ok(r.j.questions.length === 25); ok('guru melihat hasil kelas dan kesehatan soal');
  { const x = await fetch(base + '/api/assignments/' + aid + '/export', { headers: { cookie: jar.guru, 'x-requested-with': 'fetch' } }); const txt = await x.text(); assert.equal(x.status, 200); assert.ok(txt.includes('nama_panggilan,status,skor,total') && txt.split('\r\n').length === 3 && !txt.includes('0099000001')); ok('guru mengunduh hasil CSV (tanpa NISN)'); }
  r = await call('s1', 'GET', '/api/student/assignments'); assert.ok(r.j.progress.length >= 1); ok('siswa melihat progres per elemen');
  r = await call('guru', 'POST', '/api/students/' + (await call('guru', 'GET', '/api/classes/' + cid + '/students')).j[0].user_id + '/reset-pin'); assert.equal(r.s, 200); ok('guru mereset PIN, sesi siswa dicabut');
  // guru lain tidak boleh melihat kelas ini
  r = await call('admin', 'POST', '/api/admin/users', { username: 'guru5b', display_name: 'Guru 5B', role: 'teacher' }); const t2 = r.j.password;
  await call('guru2', 'POST', '/api/login', { username: 'guru5b', password: t2 });
  r = await call('guru2', 'GET', '/api/classes/' + cid + '/students'); assert.equal(r.s, 403); r = await call('guru2', 'GET', '/api/assignments/' + aid + '/results'); assert.equal(r.s, 404); ok('guru lain tidak bisa mengakses kelas ini');
  // pembatasan percobaan masuk
  for (let i = 0; i < 5; i++) await call('b', 'POST', '/api/login', { username: '0099000002', password: 'x' + i });
  r = await call('b', 'POST', '/api/login', { username: '0099000002', password: s2.pin }); assert.equal(r.s, 429); ok('akun terkunci sementara setelah 5 kali gagal');
  r = await call('admin', 'GET', '/api/admin/audit'); assert.ok(r.j.length > 10 && JSON.stringify(r.j).indexOf(s1.pin) < 0); ok('log aktivitas tercatat tanpa PIN');
  r = await call('admin', 'POST', '/api/questions/MTH6-FRC-101/advance', { to: 'published' }); assert.equal(r.s, 400); ok('alur status soal ditegakkan');
  console.log('\nSEMUA UJI LOLOS'); server.close(); process.exit(0);
})().catch((e) => { console.error('\nGAGAL:', e); process.exit(1); });
