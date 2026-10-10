'use strict';
const express = require('express'), crypto = require('crypto'), path = require('path'), { promisify } = require('util');
const D = require('./db'), B = require('./bootstrap'), { parseCSV, headers, pin, password } = require('./util');
const scrypt = promisify(crypto.scrypt);
const SECURE = process.env.COOKIE_SECURE === '1';
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
async function hash(pw) { const s = crypto.randomBytes(16); const k = await scrypt(pw, s, 32); return 's1$' + s.toString('hex') + '$' + k.toString('hex'); }
async function verify(pw, h) { try { const [, s, k] = h.split('$'); const d = await scrypt(pw, Buffer.from(s, 'hex'), 32); return crypto.timingSafeEqual(d, Buffer.from(k, 'hex')); } catch { return false; } }
let DUMMY; // hash palsu agar waktu respons login tidak membocorkan keberadaan akun
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set({ 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('x-requested-with') !== 'fetch') return res.status(403).json({ error: 'Permintaan ditolak' });
  next();
});
const w = (f) => (req, res, next) => f(req, res, next).catch(next);
// Pembatas percobaan masuk disimpan di database agar bekerja juga di Vercel (tiap permintaan bisa dilayani instans berbeda).
const locked = async (k) => (await D.q("select count(*)::int c from login_attempts where key=$1 and at>now()-interval '15 minutes'", [k])).rows[0].c >= (k.startsWith('ip:') ? 40 : 5);
const fail = (k) => D.q('insert into login_attempts(key) values($1)', [k]);
const cookie = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((s) => s.trim().split('=')).filter((a) => a[0]));
const audit = (req, uid, action, detail) => D.q('insert into audit_log(user_id,action,detail,ip) values($1,$2,$3::jsonb,$4)', [uid, action, JSON.stringify(detail || {}), req.ip]);
async function newSession(res, uid) {
  const t = crypto.randomBytes(32).toString('hex');
  await D.q("insert into sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '8 hours')", [sha(t), uid]);
  res.setHeader('Set-Cookie', `sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${SECURE ? '; Secure' : ''}`);
}
async function auth(req, res, next) {
  try {
    const t = cookie(req).sid; if (!t) return res.status(401).json({ error: 'Belum masuk' });
    const r = await D.q('select u.id,u.role,u.username,u.display_name from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and u.active', [sha(t)]);
    if (!r.rows.length) return res.status(401).json({ error: 'Sesi berakhir' });
    req.user = r.rows[0]; next();
  } catch (e) { next(e); }
}
const need = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Tidak diizinkan' });
const STAFF = ['teacher', 'admin', 'super_admin'], ADMIN = ['admin', 'super_admin'];
const isAdmin = (u) => ADMIN.includes(u.role);
async function classOK(u, cid) { if (isAdmin(u)) return true; const r = await D.q('select 1 from classes where id=$1 and teacher_id=$2', [cid, u.id]); return r.rows.length > 0; }
const mask = (n) => '••••••' + String(n).slice(-4);

// ---------- Auth ----------
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.post('/api/login', w(async (req, res) => {
  const u = String(req.body.username || '').trim().toLowerCase().slice(0, 64), p = String(req.body.password || '').slice(0, 128);
  const ik = ('ip:' + req.ip).slice(0, 80), uk = ('u:' + u).slice(0, 80);
  if ((await locked(ik)) || (await locked(uk))) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' });
  const r = await D.q('select id,role,pass_hash,display_name,active from users where username=$1', [u]);
  const row = r.rows[0];
  const ok = row && row.active ? await verify(p, row.pass_hash) : (await verify(p, DUMMY), false);
  if (!ok) { await fail(ik); await fail(uk); await audit(req, null, 'login_gagal', { username: u.slice(0, 20) }); return res.status(401).json({ error: 'Nama pengguna atau kata sandi salah' }); }
  await D.q('delete from login_attempts where key=$1', [uk]); await D.q("delete from login_attempts where at<now()-interval '1 day'"); await D.q('delete from sessions where expires_at<now()'); await newSession(res, row.id); await audit(req, row.id, 'login', {});
  res.json({ ok: true, user: { role: row.role, display_name: row.display_name } });
}));
app.post('/api/logout', auth, w(async (req, res) => {
  await D.q('delete from sessions where token_hash=$1', [sha(cookie(req).sid)]);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); res.json({ ok: true });
}));
app.get('/api/me', auth, (req, res) => res.json({ role: req.user.role, display_name: req.user.display_name, username: isAdmin(req.user) || req.user.role === 'teacher' ? req.user.username : undefined }));
app.post('/api/me/password', auth, need(...STAFF), w(async (req, res) => {
  const { old_password, new_password } = req.body;
  const r = await D.q('select pass_hash from users where id=$1', [req.user.id]);
  if (!(await verify(String(old_password || ''), r.rows[0].pass_hash))) return res.status(400).json({ error: 'Kata sandi lama salah' });
  if (typeof new_password !== 'string' || new_password.length < 10) return res.status(400).json({ error: 'Kata sandi baru minimal 10 karakter' });
  await D.q('update users set pass_hash=$1 where id=$2', [await hash(new_password), req.user.id]);
  await D.q('delete from sessions where user_id=$1 and token_hash<>$2', [req.user.id, sha(cookie(req).sid)]);
  await audit(req, req.user.id, 'ganti_password', {}); res.json({ ok: true });
}));

// ---------- Penilaian ----------
const VALID = { PG: (r) => typeof r === 'string' && /^[A-D]$/.test(r), PGK_MCMA: (r) => Array.isArray(r) && r.length <= 4 && r.every((x) => /^[A-D]$/.test(x)) && new Set(r).size === r.length, PGK_KATEGORI: (r) => Array.isArray(r) && r.length === 4 && r.every((x) => x === 'B' || x === 'S' || x === null) };
function isCorrect(type, key, r) {
  if (type === 'PG') return r === key[0];
  if (type === 'PGK_MCMA') return Array.isArray(r) && r.length === key.length && r.every((x) => key.includes(x));
  return Array.isArray(r) && r.length === 4 && r.every((x, i) => x === key[i]);
}
async function getAttempt(id) { const r = await D.q('select *, (extract(epoch from deadline_at)*1000)::float8 as deadline_ms from attempts where id=$1', [id]); return r.rows[0]; }
async function gradeAttempt(at) {
  const pk = await D.q('select question_ids from packages where id=$1', [at.package_id]); const ids = pk.rows[0].question_ids;
  const qs = await D.q('select id,qtype,answer from questions where id = any($1::text[])', [ids]);
  const an = await D.q('select question_id,response from answers where attempt_id=$1', [at.id]); const sv = Object.fromEntries(an.rows.map((a) => [a.question_id, a.response]));
  let score = 0;
  for (const q of qs.rows) {
    const r = sv[q.id] === undefined ? null : sv[q.id], ok = r !== null && isCorrect(q.qtype, q.answer, r); if (ok) score++;
    await D.q('insert into answers(attempt_id,question_id,response,is_correct) values($1,$2,$3::jsonb,$4) on conflict(attempt_id,question_id) do update set is_correct=excluded.is_correct', [at.id, q.id, JSON.stringify(r), ok]);
  }
  await D.q("update attempts set status='submitted',submitted_at=now(),score=$1,total=$2 where id=$3", [score, ids.length, at.id]);
}
async function closeIfExpired(at) { if (at.status === 'in_progress' && Date.now() > at.deadline_ms + 15000) { await gradeAttempt(at); return await getAttempt(at.id); } return at; }
async function resultOf(id) {
  const at = await getAttempt(id);
  const d = await D.q(`select q.id,q.qtype,q.stem,q.options,q.domain,q.topic,q.answer,q.explanation,a.response,a.is_correct from answers a join questions q on q.id=a.question_id where a.attempt_id=$1 order by a.id`, [id]);
  const dom = {}; d.rows.forEach((x) => { dom[x.domain] = dom[x.domain] || { benar: 0, total: 0 }; dom[x.domain].total++; if (x.is_correct) dom[x.domain].benar++; });
  return { score: at.score, total: at.total, domains: dom, items: d.rows.map((x) => ({ id: x.id, qtype: x.qtype, stem: x.stem, options: x.options, topic: x.topic, domain: x.domain, key: x.answer, response: x.response, correct: x.is_correct, explanation: x.explanation })) };
}

// ---------- Siswa ----------
app.get('/api/student/assignments', auth, need('student'), w(async (req, res) => {
  const r = await D.q(`select a.id, to_char(a.due,'YYYY-MM-DD') as due, p.name, p.duration_min, jsonb_array_length(p.question_ids)::int as n,
    (select json_build_object('id',t.id,'status',t.status,'score',t.score,'total',t.total) from attempts t where t.assignment_id=a.id and t.student_id=$1) as attempt
    from assignments a join packages p on p.id=a.package_id where a.class_id=(select class_id from students where user_id=$1) order by a.due, a.id`, [req.user.id]);
  const pr = await D.q(`select q.domain, count(*)::int n, sum(case when a.is_correct then 1 else 0 end)::int c from attempts t join answers a on a.attempt_id=t.id join questions q on q.id=a.question_id where t.student_id=$1 and t.status='submitted' group by q.domain`, [req.user.id]);
  res.json({ assignments: r.rows, progress: pr.rows });
}));
app.post('/api/attempts', auth, need('student'), w(async (req, res) => {
  const aid = parseInt(req.body.assignment_id, 10);
  const a = await D.q(`select a.id,a.package_id,p.duration_min,(a.due >= current_date) as open from assignments a join packages p on p.id=a.package_id where a.id=$1 and a.class_id=(select class_id from students where user_id=$2)`, [aid, req.user.id]);
  if (!a.rows.length) return res.status(404).json({ error: 'Tugas tidak ditemukan' });
  let at = (await D.q('select id from attempts where assignment_id=$1 and student_id=$2', [aid, req.user.id])).rows[0];
  if (at) { at = await closeIfExpired(await getAttempt(at.id)); if (at.status === 'submitted') return res.status(409).json({ error: 'Tugas ini sudah dikumpulkan', attempt_id: at.id }); }
  else {
    if (!a.rows[0].open) return res.status(409).json({ error: 'Tenggat tugas sudah lewat' });
    const ins = await D.q(`insert into attempts(student_id,assignment_id,package_id,deadline_at) values($1,$2,$3, now() + ($4 || ' minutes')::interval) returning id`, [req.user.id, aid, a.rows[0].package_id, String(a.rows[0].duration_min)]);
    at = await getAttempt(ins.rows[0].id); await audit(req, req.user.id, 'mulai_tryout', { attempt: at.id });
  }
  const pk = await D.q('select name,question_ids from packages where id=$1', [at.package_id]); const ids = pk.rows[0].question_ids;
  const qs = await D.q('select id,qtype,stem,options,image,domain,topic from questions where id = any($1::text[])', [ids]); const m = Object.fromEntries(qs.rows.map((q) => [q.id, q]));
  const an = await D.q('select question_id,response from answers where attempt_id=$1', [at.id]);
  res.json({ attempt_id: at.id, deadline_ms: at.deadline_ms, server_now_ms: Date.now(), name: pk.rows[0].name, questions: ids.map((i) => m[i]), answers: Object.fromEntries(an.rows.map((x) => [x.question_id, x.response])) });
}));
app.put('/api/attempts/:id/answers', auth, need('student'), w(async (req, res) => {
  let at = await getAttempt(parseInt(req.params.id, 10)); if (!at || at.student_id !== req.user.id) return res.status(404).json({ error: 'Tidak ditemukan' });
  at = await closeIfExpired(at); if (at.status === 'submitted') return res.status(409).json({ error: 'Waktu habis atau sudah dikumpulkan' });
  const { question_id, response } = req.body;
  const q = await D.q(`select q.qtype from questions q join packages p on p.question_ids ? q.id where q.id=$1 and p.id=$2`, [String(question_id), at.package_id]);
  if (!q.rows.length) return res.status(400).json({ error: 'Soal bukan bagian dari paket ini' });
  if (response !== null && !VALID[q.rows[0].qtype](response)) return res.status(400).json({ error: 'Format jawaban tidak valid' });
  await D.q('insert into answers(attempt_id,question_id,response) values($1,$2,$3::jsonb) on conflict(attempt_id,question_id) do update set response=excluded.response', [at.id, question_id, JSON.stringify(response)]);
  res.json({ ok: true });
}));
app.post('/api/attempts/:id/submit', auth, need('student'), w(async (req, res) => {
  const at = await getAttempt(parseInt(req.params.id, 10)); if (!at || at.student_id !== req.user.id) return res.status(404).json({ error: 'Tidak ditemukan' });
  if (at.status === 'in_progress') { await gradeAttempt(at); await audit(req, req.user.id, 'kumpul_tryout', { attempt: at.id }); }
  res.json(await resultOf(at.id));
}));
app.get('/api/attempts/:id/result', auth, w(async (req, res) => {
  let at = await getAttempt(parseInt(req.params.id, 10)); if (!at) return res.status(404).json({ error: 'Tidak ditemukan' });
  if (req.user.role === 'student') { if (at.student_id !== req.user.id) return res.status(404).json({ error: 'Tidak ditemukan' }); }
  else { const c = await D.q('select class_id from students where user_id=$1', [at.student_id]); if (!STAFF.includes(req.user.role) || !(await classOK(req.user, c.rows[0].class_id))) return res.status(403).json({ error: 'Tidak diizinkan' }); }
  at = await closeIfExpired(at); if (at.status !== 'submitted') return res.status(409).json({ error: 'Belum dikumpulkan' });
  res.json(await resultOf(at.id));
}));

// ---------- Guru dan admin ----------
app.get('/api/classes', auth, need(...STAFF), w(async (req, res) => {
  const r = await D.q(`select c.id,c.name,c.grade,c.year,(select count(*)::int from students s where s.class_id=c.id) as students from classes c ${isAdmin(req.user) ? '' : 'where c.teacher_id=$1'} order by c.name`, isAdmin(req.user) ? [] : [req.user.id]);
  res.json(r.rows);
}));
app.get('/api/classes/:id/students', auth, need(...STAFF), w(async (req, res) => {
  const cid = parseInt(req.params.id, 10); if (!(await classOK(req.user, cid))) return res.status(403).json({ error: 'Tidak diizinkan' });
  const r = await D.q('select s.user_id,s.nickname,s.full_name,s.nisn from students s where s.class_id=$1 order by s.nickname', [cid]);
  res.json(r.rows.map((x) => ({ user_id: x.user_id, nickname: x.nickname, full_name: x.full_name, nisn: mask(x.nisn) })));
}));
const BLOCK = /^(nik|alamat|telp|telepon|no_hp|hp|wa|whatsapp)$/, REQ = ['nama_lengkap', 'nama_panggilan', 'nisn', 'kelas', 'rombel', 'tahun_ajaran'];
app.post('/api/classes/import', auth, need(...STAFF), w(async (req, res) => {
  const csv = String(req.body.csv || ''); const hd = headers(csv);
  const bad = hd.filter((x) => BLOCK.test(x)); if (bad.length) return res.status(400).json({ error: `Kolom "${bad.join('", "')}" tidak boleh diunggah (data pribadi)` });
  const miss = REQ.filter((x) => !hd.includes(x)); if (miss.length) return res.status(400).json({ error: 'Kolom wajib belum ada: ' + miss.join(', ') });
  const rows = parseCSV(csv); if (!rows.length || rows.length > 400) return res.status(400).json({ error: 'Jumlah baris harus 1 sampai 400' });
  let tid = req.user.role === 'teacher' ? req.user.id : null;
  if (isAdmin(req.user) && req.body.teacher_username) { const t = await D.q("select id from users where username=$1 and role='teacher'", [String(req.body.teacher_username).toLowerCase()]); if (!t.rows.length) return res.status(400).json({ error: 'Akun guru tidak ditemukan' }); tid = t.rows[0].id; }
  const created = [], errors = [], seenN = new Set(), seenP = new Set();
  for (const r of rows) {
    const e = [];
    if (!/^[0-9]{10}$/.test(r.nisn)) e.push('NISN harus 10 angka'); else if (seenN.has(r.nisn)) e.push('NISN kembar di file'); 
    if (!['4', '5', '6'].includes(r.kelas)) e.push('kelas harus 4, 5, atau 6'); else if (!/^[456][A-Z]$/.test(r.rombel) || r.rombel[0] !== r.kelas) e.push('rombel harus berbentuk 6A dan cocok dengan kelas');
    if (!r.nama_lengkap || !r.nama_panggilan || !r.tahun_ajaran) e.push('ada kolom kosong');
    const pk = (r.nama_panggilan + '|' + r.rombel).toLowerCase(); if (seenP.has(pk)) e.push('nama panggilan kembar dalam rombel');
    if (e.length) { errors.push({ row: r._row, reason: e.join('; ') }); continue; }
    seenN.add(r.nisn); seenP.add(pk);
    const c = await D.q('select id,teacher_id from classes where name=$1 and year=$2', [r.rombel, r.tahun_ajaran]); let cid;
    if (c.rows.length) { cid = c.rows[0].id; if (!(await classOK(req.user, cid))) { errors.push({ row: r._row, reason: 'kelas milik guru lain' }); continue; } }
    else cid = (await D.q('insert into classes(name,grade,year,teacher_id) values($1,$2,$3,$4) returning id', [r.rombel, +r.kelas, r.tahun_ajaran, tid])).rows[0].id;
    const p = pin(); let uid;
    try { uid = (await D.q("insert into users(role,username,pass_hash,display_name) values('student',$1,$2,$3) returning id", [r.nisn, await hash(p), r.nama_panggilan])).rows[0].id; }
    catch (x) { errors.push({ row: r._row, reason: 'NISN sudah terdaftar' }); continue; }
    try { await D.q('insert into students(user_id,nisn,full_name,nickname,class_id) values($1,$2,$3,$4,$5)', [uid, r.nisn, r.nama_lengkap, r.nama_panggilan, cid]); }
    catch (x) { await D.q('delete from users where id=$1', [uid]); errors.push({ row: r._row, reason: 'nama panggilan sudah ada di kelas ini' }); continue; }
    created.push({ nisn: r.nisn, nama: r.nama_panggilan, nama_lengkap: r.nama_lengkap, kelas: r.rombel, pin: p });
  }
  await audit(req, req.user.id, 'impor_siswa', { dibuat: created.length, gagal: errors.length });
  res.json({ created, errors });
}));
app.post('/api/students/:id/reset-pin', auth, need(...STAFF), w(async (req, res) => {
  const s = await D.q('select user_id,nisn,nickname,full_name,class_id from students where user_id=$1', [parseInt(req.params.id, 10)]);
  if (!s.rows.length || !(await classOK(req.user, s.rows[0].class_id))) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  const p = pin(); await D.q('update users set pass_hash=$1 where id=$2', [await hash(p), s.rows[0].user_id]); await D.q('delete from sessions where user_id=$1', [s.rows[0].user_id]);
  await audit(req, req.user.id, 'reset_pin', { siswa: s.rows[0].user_id }); res.json({ nisn: s.rows[0].nisn, nama: s.rows[0].nickname, nama_lengkap: s.rows[0].full_name, pin: p });
}));
app.get('/api/packages', auth, need(...STAFF), w(async (req, res) => {
  const r = await D.q(`select p.id,p.name,p.duration_min,jsonb_array_length(p.question_ids)::int n,
    (select json_object_agg(s,c) from (select q.status s, count(*)::int c from questions q where p.question_ids ? q.id group by q.status) x) statuses from packages p order by p.id`);
  res.json(r.rows);
}));
app.post('/api/packages/:id/mark-reviewed', auth, need(...STAFF), w(async (req, res) => {
  if (req.body.confirm !== true) return res.status(400).json({ error: 'Konfirmasi diperlukan: Anda menyatakan sudah memeriksa semua soal paket ini' });
  const r = await D.q(`update questions set status='pilot', reviewer_id=$1, updated_at=now() where status in ('draft','review') and id in (select jsonb_array_elements_text(question_ids) from packages where id=$2) returning id`, [req.user.id, parseInt(req.params.id, 10)]);
  await audit(req, req.user.id, 'tandai_diperiksa_paket', { paket: req.params.id, soal: r.rows.length }); res.json({ updated: r.rows.length });
}));
app.get('/api/assignments', auth, need(...STAFF), w(async (req, res) => {
  const r = await D.q(`select a.id,to_char(a.due,'YYYY-MM-DD') as due,p.name package,c.name class,c.id class_id,
    (select count(*)::int from attempts t where t.assignment_id=a.id and t.status='submitted') submitted,(select count(*)::int from students s where s.class_id=c.id) students
    from assignments a join packages p on p.id=a.package_id join classes c on c.id=a.class_id ${isAdmin(req.user) ? '' : 'where c.teacher_id=$1'} order by a.id desc`, isAdmin(req.user) ? [] : [req.user.id]);
  res.json(r.rows);
}));
app.post('/api/assignments', auth, need(...STAFF), w(async (req, res) => {
  const pid = parseInt(req.body.package_id, 10), cid = parseInt(req.body.class_id, 10), due = String(req.body.due || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return res.status(400).json({ error: 'Tenggat tidak valid' });
  if (!(await classOK(req.user, cid))) return res.status(403).json({ error: 'Tidak diizinkan' });
  const st = await D.q(`select count(*)::int c from questions q join packages p on p.question_ids ? q.id where p.id=$1 and q.status not in ('pilot','published')`, [pid]);
  if (st.rows[0].c > 0) return res.status(409).json({ error: `${st.rows[0].c} soal paket ini belum diperiksa (status masih draf atau review). Periksa dulu di menu Soal.` });
  const r = await D.q('insert into assignments(package_id,class_id,due,created_by) values($1,$2,$3,$4) returning id', [pid, cid, due, req.user.id]);
  await audit(req, req.user.id, 'buat_tugas', { tugas: r.rows[0].id, kelas: cid }); res.json({ id: r.rows[0].id });
}));
app.get('/api/assignments/:id/results', auth, need(...STAFF), w(async (req, res) => {
  const id = parseInt(req.params.id, 10); const a = await D.q('select a.class_id from assignments a where a.id=$1', [id]);
  if (!a.rows.length || !(await classOK(req.user, a.rows[0].class_id))) return res.status(404).json({ error: 'Tidak ditemukan' });
  const st = await D.q(`select s.user_id,s.nickname,t.id attempt_id,t.status,t.score,t.total from students s left join attempts t on t.student_id=s.user_id and t.assignment_id=$1 where s.class_id=$2 order by s.nickname`, [id, a.rows[0].class_id]);
  const dm = await D.q(`select q.domain, count(*)::int n, sum(case when a.is_correct then 1 else 0 end)::int c from attempts t join answers a on a.attempt_id=t.id join questions q on q.id=a.question_id where t.assignment_id=$1 and t.status='submitted' group by q.domain`, [id]);
  const qh = await D.q(`select q.id,q.topic,q.domain, count(*)::int n, sum(case when a.is_correct then 1 else 0 end)::int c from attempts t join answers a on a.attempt_id=t.id join questions q on q.id=a.question_id where t.assignment_id=$1 and t.status='submitted' group by q.id,q.topic,q.domain order by (sum(case when a.is_correct then 1 else 0 end)::float/count(*)) asc, q.id`, [id]);
  res.json({ students: st.rows, domains: dm.rows, questions: qh.rows });
}));
app.get('/api/assignments/:id/export', auth, need(...STAFF), w(async (req, res) => {
  const id = parseInt(req.params.id, 10); const a = await D.q('select class_id from assignments where id=$1', [id]);
  if (!a.rows.length || !(await classOK(req.user, a.rows[0].class_id))) return res.status(404).json({ error: 'Tidak ditemukan' });
  const st = await D.q('select s.user_id,s.nickname,t.status,t.score,t.total from students s left join attempts t on t.student_id=s.user_id and t.assignment_id=$1 where s.class_id=$2 order by s.nickname', [id, a.rows[0].class_id]);
  const dm = await D.q(`select t.student_id,q.domain,count(*)::int n,sum(case when a.is_correct then 1 else 0 end)::int c from attempts t join answers a on a.attempt_id=t.id join questions q on q.id=a.question_id where t.assignment_id=$1 and t.status='submitted' group by t.student_id,q.domain`, [id]);
  const doms = [...new Set(dm.rows.map((x) => x.domain))].sort(); const cell = (v) => { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const head = ['nama_panggilan', 'status', 'skor', 'total'].concat(...doms.map((d) => [d + ' benar', d + ' total']));
  const lines = [head.map(cell).join(',')].concat(st.rows.map((s) => [s.nickname, s.status || 'belum_mulai', s.score, s.total].concat(...doms.map((d) => { const x = dm.rows.find((r) => r.student_id === s.user_id && r.domain === d); return [x ? x.c : '', x ? x.n : '']; })).map(cell).join(',')));
  await audit(req, req.user.id, 'ekspor_hasil', { tugas: id });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="hasil-tugas-${id}.csv"` }); res.send('\uFEFF' + lines.join('\r\n'));
}));
// Bank soal (guru dan admin boleh melihat kunci)
app.get('/api/questions', auth, need(...STAFF), w(async (req, res) => {
  const f = [], p = []; if (req.query.status) { p.push(req.query.status); f.push('status=$' + p.length); } if (req.query.qtype) { p.push(req.query.qtype); f.push('qtype=$' + p.length); } if (req.query.topic) { p.push(req.query.topic); f.push('topic=$' + p.length); }
  const r = await D.q(`select id,topic,domain,qtype,cognitive_level,difficulty,label,status,(image is not null) has_image from questions ${f.length ? 'where ' + f.join(' and ') : ''} order by id`, p);
  res.json(r.rows);
}));
app.get('/api/questions/:id', auth, need(...STAFF), w(async (req, res) => {
  const r = await D.q('select id,topic,domain,subtopic,qtype,cognitive_level,difficulty,label,status,stem,options,answer,explanation,rationale,image from questions where id=$1', [req.params.id]);
  r.rows.length ? res.json(r.rows[0]) : res.status(404).json({ error: 'Tidak ditemukan' });
}));
const NEXT = { draft: ['review'], review: ['pilot', 'draft'], pilot: ['published', 'review'], published: ['unpublished'], unpublished: ['draft'] };
app.post('/api/questions/:id/advance', auth, need(...STAFF), w(async (req, res) => {
  const to = String(req.body.to || ''); const q = await D.q('select status from questions where id=$1', [req.params.id]);
  if (!q.rows.length) return res.status(404).json({ error: 'Tidak ditemukan' });
  if (!(NEXT[q.rows[0].status] || []).includes(to)) return res.status(400).json({ error: `Tidak bisa dari ${q.rows[0].status} ke ${to}` });
  await D.q('update questions set status=$1, reviewer_id=case when $1 in (\'pilot\',\'published\') then $2 else reviewer_id end, version=version+1, updated_at=now() where id=$3', [to, req.user.id, req.params.id]);
  await audit(req, req.user.id, 'status_soal', { soal: req.params.id, ke: to }); res.json({ ok: true });
}));
// Admin
app.get('/api/admin/users', auth, need(...ADMIN), w(async (req, res) => { res.json((await D.q("select id,role,username,display_name,active from users where role<>'student' order by id")).rows); }));
app.post('/api/admin/users', auth, need(...ADMIN), w(async (req, res) => {
  const u = String(req.body.username || '').trim().toLowerCase(), role = req.body.role === 'admin' ? 'admin' : 'teacher', dn = String(req.body.display_name || '').trim().slice(0, 60);
  if (!/^[a-z0-9._-]{3,32}$/.test(u) || !dn) return res.status(400).json({ error: 'Nama pengguna 3-32 karakter (huruf kecil, angka, titik, strip) dan nama tampilan wajib' });
  const pw = password(12);
  try { await D.q('insert into users(role,username,pass_hash,display_name) values($1,$2,$3,$4)', [role, u, await hash(pw), dn]); } catch { return res.status(409).json({ error: 'Nama pengguna sudah dipakai' }); }
  await audit(req, req.user.id, 'buat_akun', { username: u, role }); res.json({ username: u, password: pw });
}));
app.post('/api/admin/users/:id/reset-password', auth, need(...ADMIN), w(async (req, res) => {
  const id = parseInt(req.params.id, 10); const r = await D.q("select username from users where id=$1 and role<>'student'", [id]); if (!r.rows.length) return res.status(404).json({ error: 'Tidak ditemukan' });
  const pw = password(12); await D.q('update users set pass_hash=$1 where id=$2', [await hash(pw), id]); await D.q('delete from sessions where user_id=$1', [id]);
  await audit(req, req.user.id, 'reset_password_staf', { id }); res.json({ username: r.rows[0].username, password: pw });
}));
app.post('/api/admin/users/:id/active', auth, need(...ADMIN), w(async (req, res) => {
  const id = parseInt(req.params.id, 10); if (id === req.user.id) return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri' });
  await D.q("update users set active=$1 where id=$2 and role<>'student'", [!!req.body.active, id]); if (!req.body.active) await D.q('delete from sessions where user_id=$1', [id]);
  await audit(req, req.user.id, 'ubah_status_akun', { id, aktif: !!req.body.active }); res.json({ ok: true });
}));
app.get('/api/admin/audit', auth, need(...ADMIN), w(async (req, res) => {
  res.json((await D.q(`select l.id,to_char(l.at,'YYYY-MM-DD HH24:MI:SS') at,l.action,l.detail,coalesce(u.username,'-') username,l.ip from audit_log l left join users u on u.id=l.user_id order by l.id desc limit 100`)).rows);
}));
app.get('/api/admin/stats', auth, need(...ADMIN), w(async (req, res) => {
  const r = await D.q(`select (select count(*)::int from students) siswa,(select count(*)::int from classes) kelas,(select count(*)::int from questions) soal,(select count(*)::int from questions where status in ('pilot','published')) soal_siap,(select count(*)::int from attempts where status='submitted') tryout_selesai`);
  res.json(r.rows[0]);
}));

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use((req, res) => res.status(404).json({ error: 'Tidak ditemukan' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Terjadi kesalahan di server' }); });

let readyP;
// Menyiapkan database dan data awal sekali per instans (aman dipanggil berulang).
function ready() {
  if (!readyP) readyP = (async () => { await D.init(); DUMMY = await hash(crypto.randomBytes(8).toString('hex')); return B.ensure(hash); })().catch((e) => { readyP = null; throw e; });
  return readyP;
}
async function start(port) {
  const first = await ready();
  const server = await new Promise((ok) => { const s = app.listen(port, () => ok(s)); });
  return { server, first, app };
}
module.exports = { start, app, ready };
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  start(port).then(({ first }) => {
    console.log(`MATH READY SD berjalan di http://localhost:${port} (database: ${D.kind()})`);
    if (first) { console.log('\n=== AKUN ADMIN PERTAMA ===\nNama pengguna: admin\nKata sandi: ' + first.adminPassword + (first.generated ? '\n(Simpan sekarang. Kata sandi ini tidak ditampilkan lagi. Ganti setelah masuk.)' : '') + '\n==========================\n'); }
  }).catch((e) => { console.error(e); process.exit(1); });
}
