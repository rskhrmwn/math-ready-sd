(function () {
'use strict';
const $ = (s) => document.querySelector(s), app = $('#app'), L = 'ABCD';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const A = {}; let ME = null, X = null, TAB = 'hasil', tmr = null;
document.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && A[b.dataset.act]) A[b.dataset.act](b, e); });
document.addEventListener('change', (e) => { const t = e.target; if (t.dataset && t.dataset.chg && A[t.dataset.chg]) A[t.dataset.chg](t, e); });
document.addEventListener('submit', (e) => { const f = e.target; if (f.dataset && f.dataset.sub && A[f.dataset.sub]) { e.preventDefault(); A[f.dataset.sub](f, e); } });
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2800); }
async function api(m, u, b) {
  const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' }, body: b ? JSON.stringify(b) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && u !== '/api/login') { ME = null; login(); throw Object.assign(new Error('auth'), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error((j && j.error) || 'Gagal'), { status: r.status, data: j });
  return j;
}
const fail = (e) => { if (e.status !== 401) toast(e.message); };
const stat = (p) => p < 60 ? ['lo', '▲', 'Perlu Dukungan', 'var(--cor)'] : p < 80 ? ['mid', '◆', 'Berkembang', 'var(--yel)'] : ['hi', '●', 'Kuasai', 'var(--mint)'];
const bars = (rows) => rows.map((r) => { const p = r.n ? Math.round(r.c / r.n * 100) : 0, s = stat(p); return `<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-weight:700"><span>${esc(r.label)}</span><span>${s[1]} ${r.c}/${r.n} · ${s[2]}</span></div><div class="pb"><i style="width:${p}%;background:${s[3]}"></i></div></div>`; }).join('');
const page = (inner, nav) => { app.innerHTML = `<main class="w"><div class="top no-print"><span class="brand">➗ MATH READY SD</span><span class="row" style="margin:0"><span class="sub">${esc(ME ? ME.display_name : '')}</span><button class="btn g s" data-act="logout">Keluar</button></span></div>${nav || ''}${inner}</main>`; };

function login(msg) {
  clearInterval(tmr); X = null;
  app.innerHTML = `<main class="w" style="max-width:420px"><h1 style="margin-top:40px">MATH READY SD</h1><p class="sub">Belajar Sekarang. Kuasai Konsepnya. Siap TKA.</p><form class="c" data-sub="login"><div class="fl"><label for="u">Nama pengguna (siswa: NISN)</label><input id="u" autocomplete="username" required inputmode="text"></div><div class="fl"><label for="p">Kata sandi (siswa: PIN)</label><input id="p" type="password" autocomplete="current-password" required></div>${msg ? `<div class="msg lo" role="alert">${esc(msg)}</div>` : ''}<div class="row"><button class="btn" style="width:100%">Masuk</button></div></form><p class="sub" style="margin-top:14px">Platform latihan matematika. Bukan platform resmi TKA.</p></main>`;
}
A.login = async (f) => { try { await api('POST', '/api/login', { username: $('#u').value, password: $('#p').value }); TAB = 'hasil'; await boot(); } catch (e) { login(e.message); } };
A.logout = async () => { try { await api('POST', '/api/logout'); } catch (e) {} ME = null; login(); };

// ---------- SISWA ----------
async function studentHome() {
  clearInterval(tmr); X = null;
  try {
    const d = await api('GET', '/api/student/assignments');
    const items = d.assignments.map((a) => { const t = a.attempt; const act = !t ? ['go', 'Mulai'] : t.status === 'submitted' ? ['res', 'Lihat hasil'] : ['go', 'Lanjutkan'];
      return `<div class="c"><h2>${esc(a.name)}</h2><p class="sub">${a.n} soal · ${a.duration_min} menit · tenggat ${esc(a.due)}</p>${t && t.status === 'submitted' ? `<p style="margin-top:8px"><b>${t.score} dari ${t.total}</b> soal benar penuh</p>` : ''}<div class="row"><button class="btn" data-act="${act[0]}" data-id="${t && act[0] === 'res' ? t.id : a.id}">${act[1]}</button></div></div>`; }).join('');
    page(`<h1>Halo, ${esc(ME.display_name)}!</h1><p class="sub">Kerjakan tugas dari gurumu. Ini latihan, bukan nilai TKA.</p>${items || '<div class="c sub">Belum ada tugas. Tunggu tugas dari gurumu.</div>'}${d.progress.length ? `<div class="c"><h2>Penguasaanmu per elemen</h2>${bars(d.progress.map((p) => ({ label: p.domain, c: p.c, n: p.n })))}<p class="sub" style="margin-top:10px">Dihitung dari semua tryout yang sudah kamu kumpulkan.</p></div>` : ''}`);
  } catch (e) { fail(e); }
}
A.go = async (b) => {
  try {
    const d = await api('POST', '/api/attempts', { assignment_id: +b.dataset.id });
    X = { id: d.attempt_id, qs: d.questions, ans: d.answers || {}, flag: {}, cur: 0, end: d.deadline_ms + (Date.now() - d.server_now_ms), sure: false };
    clearInterval(tmr); tmr = setInterval(tick, 1000); examView(); tick();
  } catch (e) { if (e.status === 409 && e.data && e.data.attempt_id) { A.res({ dataset: { id: e.data.attempt_id } }); } else fail(e); }
};
const done = (q) => { const a = X.ans[q.id]; return q.qtype === 'PG' ? typeof a === 'string' : q.qtype === 'PGK_MCMA' ? Array.isArray(a) && a.length > 0 : Array.isArray(a) && a.length === 4 && a.every((x) => x); };
const TY = { PG: 'Pilih satu jawaban', PGK_MCMA: 'Pilih semua jawaban yang benar', PGK_KATEGORI: 'Tentukan Benar atau Salah untuk setiap pernyataan' };
function tick() { const s = Math.max(0, Math.round((X.end - Date.now()) / 1000)), t = $('#tm'); if (t) t.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); if (s <= 0) finishExam(); }
function examView() {
  app.innerHTML = `<main class="w" style="max-width:760px"><div class="bar"><span id="no"></span><span>Sisa waktu <span id="tm">--:--</span></span></div><div class="c" id="card"></div><details class="c"><summary style="font-weight:800;cursor:pointer;min-height:40px">Daftar soal</summary><div class="nv" id="nv"></div></details><div id="rv"></div><div class="ft"><button class="btn g s" data-act="prev">Sebelumnya</button><button class="btn g s" data-act="flag" id="fl">Tandai ragu</button><button class="btn s" data-act="next" id="nx">Selanjutnya</button></div></main>`;
  drawQ();
}
function drawQ() {
  const q = X.qs[X.cur], a = X.ans[q.id]; $('#rv').innerHTML = '';
  let h = `<span class="chip">${TY[q.qtype]}</span><p class="q">${esc(q.stem)}</p>${q.image ? `<div class="im">${q.image}</div>` : ''}`;
  if (q.qtype === 'PGK_KATEGORI') h += q.options.map((t, j) => `<fieldset class="pn"><legend>${j + 1}. ${esc(t)}</legend><label><input type="radio" name="s${j}" value="B" data-chg="ans" ${a && a[j] === 'B' ? 'checked' : ''}> Benar</label><label><input type="radio" name="s${j}" value="S" data-chg="ans" ${a && a[j] === 'S' ? 'checked' : ''}> Salah</label></fieldset>`).join('');
  else h += q.options.map((t, j) => `<label class="op"><input type="${q.qtype === 'PG' ? 'radio' : 'checkbox'}" name="o" value="${L[j]}" data-chg="ans" ${q.qtype === 'PG' ? (a === L[j] ? 'checked' : '') : (a && a.includes(L[j]) ? 'checked' : '')}><span><b>${L[j]}.</b> ${esc(t)}</span></label>`).join('');
  $('#card').innerHTML = h; $('#no').textContent = `Soal ${X.cur + 1} dari ${X.qs.length}`; $('#fl').textContent = X.flag[q.id] ? 'Batal ragu' : 'Tandai ragu'; $('#nx').textContent = X.cur === X.qs.length - 1 ? 'Tinjau jawaban' : 'Selanjutnya'; nav();
}
function nav() { $('#nv').innerHTML = X.qs.map((q, i) => `<button data-act="jump" data-i="${i}" class="${done(q) ? 'a ' : ''}${X.flag[q.id] ? 'f ' : ''}${i === X.cur ? 'cu' : ''}" aria-label="Soal ${i + 1}${done(q) ? ', sudah dijawab' : ', belum dijawab'}${X.flag[q.id] ? ', ditandai ragu' : ''}">${i + 1}${done(q) ? ' ✓' : ''}${X.flag[q.id] ? ' ⚑' : ''}</button>`).join(''); }
A.ans = async (t) => {
  const q = X.qs[X.cur]; let r;
  if (q.qtype === 'PG') r = t.value; else if (q.qtype === 'PGK_MCMA') r = [...document.querySelectorAll('#card input:checked')].map((x) => x.value);
  else { r = (X.ans[q.id] || [null, null, null, null]).slice(); r[+t.name.slice(1)] = t.value; }
  X.ans[q.id] = r; nav();
  try { await api('PUT', `/api/attempts/${X.id}/answers`, { question_id: q.id, response: r }); } catch (e) { if (e.status === 409) { toast('Waktu habis. Jawabanmu sudah dikumpulkan.'); finishExam(); } else fail(e); }
};
A.prev = () => { if (X.cur > 0) { X.cur--; drawQ(); scrollTo(0, 0); } };
A.next = () => { if (X.cur < X.qs.length - 1) { X.cur++; drawQ(); scrollTo(0, 0); } else review(); };
A.jump = (b) => { X.cur = +b.dataset.i; drawQ(); scrollTo(0, 0); };
A.flag = () => { const id = X.qs[X.cur].id; X.flag[id] = !X.flag[id]; drawQ(); };
function review() {
  const un = X.qs.map((q, i) => [q, i]).filter(([q]) => !done(q)); X.sure = false;
  $('#card').innerHTML = `<h2>Tinjau jawaban</h2><p style="margin-top:8px"><b>${X.qs.length - un.length}</b> dari ${X.qs.length} soal sudah dijawab.</p>${un.length ? `<p class="sub" style="margin-top:8px">Belum dijawab atau belum lengkap: ${un.map(([, i]) => i + 1).join(', ')}</p>` : ''}<div class="row"><button class="btn g" data-act="jump" data-i="0">Kembali ke soal</button><button class="btn" data-act="submit" id="sb">Kumpulkan jawaban</button></div><p class="sub" id="sm"></p>`;
}
A.submit = (b) => { if (!X.sure) { X.sure = true; b.textContent = 'Yakin? Tekan lagi untuk mengumpulkan'; $('#sm').textContent = 'Setelah dikumpulkan, jawaban tidak bisa diubah.'; } else finishExam(); };
async function finishExam() { if (!X || X.done) return; X.done = true; clearInterval(tmr); try { showResult(await api('POST', `/api/attempts/${X.id}/submit`)); } catch (e) { X.done = false; fail(e); } }
A.res = async (b) => { try { showResult(await api('GET', `/api/attempts/${b.dataset.id}/result`)); } catch (e) { fail(e); } };
const keyTxt = (it) => it.qtype === 'PGK_KATEGORI' ? it.key.map((k, j) => `${j + 1} ${k === 'B' ? 'Benar' : 'Salah'}`).join('; ') : it.key.map((k) => `${k}. ${it.options[L.indexOf(k)]}`).join('; ');
const ansTxt = (it) => { const r = it.response; if (r == null || (Array.isArray(r) && !r.length)) return 'tidak dijawab'; return it.qtype === 'PGK_KATEGORI' ? r.map((x, j) => `${j + 1} ${x === 'B' ? 'Benar' : x === 'S' ? 'Salah' : 'kosong'}`).join('; ') : [].concat(r).map((k) => `${k}. ${it.options[L.indexOf(k)]}`).join('; '); };
function showResult(r) {
  clearInterval(tmr); const wr = r.items.filter((i) => !i.correct);
  page(`<h1>Hasil tryout</h1><div class="c"><div class="big">${r.score} / ${r.total}</div><p class="sub" style="margin-top:8px">soal benar penuh (${Math.round(r.score / r.total * 100)}%). Soal PGK dianggap benar bila semua bagian tepat. Skor ini indikator latihan, <b>bukan nilai TKA</b>.</p></div><div class="c"><h2>Per elemen</h2>${bars(Object.keys(r.domains).map((d) => ({ label: d, c: r.domains[d].benar, n: r.domains[d].total })))}</div><div class="c"><h2>Soal yang perlu dipelajari lagi</h2>${wr.map((i) => `<div class="rr"><b>${esc(i.topic)}</b><p style="margin-top:4px">${esc(i.stem)}</p><small>Jawabanmu: ${esc(ansTxt(i))}</small><small>Kunci: ${esc(keyTxt(i))}</small><p style="margin-top:6px">${esc(i.explanation)}</p></div>`).join('') || '<p class="sub">Semua soal benar. Hebat!</p>'}</div><div class="row"><button class="btn" data-act="home">Kembali</button></div>`);
}
A.home = () => home();

// ---------- GURU DAN ADMIN ----------
const isAdm = () => ME && (ME.role === 'admin' || ME.role === 'super_admin');
function staffHome() {
  const tabs = [['hasil', 'Hasil kelas'], ['siswa', 'Siswa'], ['tugas', 'Tugas'], ['soal', 'Soal']].concat(isAdm() ? [['pengguna', 'Pengguna'], ['aktivitas', 'Aktivitas']] : []).concat([['akun', 'Akun saya']]);
  page('<div id="tb"></div>', `<div class="tabs no-print" role="tablist">${tabs.map(([k, v]) => `<button data-act="tab" data-t="${k}" aria-current="${TAB === k}">${v}</button>`).join('')}</div>`);
  ({ hasil: tHasil, siswa: tSiswa, tugas: tTugas, soal: tSoal, pengguna: tPengguna, aktivitas: tAktif, akun: tAkun }[TAB] || tHasil)();
}
A.tab = (b) => { TAB = b.dataset.t; staffHome(); };
const out = (h) => { $('#tb').innerHTML = h; };
const sel = (id, rows, f) => `<select id="${id}">${rows.map((r) => `<option value="${r.id}">${esc(f(r))}</option>`).join('')}</select>`;
async function tHasil() {
  try {
    const as = await api('GET', '/api/assignments');
    out(`<div class="c"><h2>Hasil tryout kelas</h2>${as.length ? `<div class="row"><div class="grow">${sel('as', as, (a) => `${a.class} · ${a.package} (tenggat ${a.due}, terkumpul ${a.submitted}/${a.students})`)}</div><button class="btn" data-act="lihat">Lihat hasil</button></div>` : '<p class="sub" style="margin-top:8px">Belum ada tugas. Buat di tab Tugas.</p>'}</div><div id="hs"></div>`);
  } catch (e) { fail(e); }
}
A.unduh = async (b) => { try { const r = await fetch(`/api/assignments/${b.dataset.id}/export`, { headers: { 'x-requested-with': 'fetch' } }); if (!r.ok) throw new Error('Gagal mengunduh'); const u = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = u; a.download = `hasil-tugas-${b.dataset.id}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); } catch (e) { fail(e); } };
A.lihat = async () => {
  try {
    const r = await api('GET', `/api/assignments/${$('#as').value}/results`);
    const dm = bars(r.domains.map((d) => ({ label: d.domain, c: d.c, n: d.n }))); const aid = $('#as').value;
    $('#hs').innerHTML = `<div class="c"><h2>Siswa</h2><div class="row no-print"><button class="btn g s" data-act="unduh" data-id="${aid}">Unduh hasil (CSV)</button></div><div class="sc"><table><tr><th>Nama panggilan</th><th>Status</th><th>Skor</th></tr>${r.students.map((s) => `<tr><td>${esc(s.nickname)}</td><td>${s.status === 'submitted' ? '<span class="st hi">● Dikumpulkan</span>' : s.status ? '<span class="st mid">◆ Sedang mengerjakan</span>' : '<span class="st">Belum mulai</span>'}</td><td>${s.status === 'submitted' ? s.score + ' / ' + s.total : '-'}</td></tr>`).join('')}</table></div></div><div class="c"><h2>Rata-rata kelas per elemen</h2>${dm || '<p class="sub">Belum ada yang mengumpulkan.</p>'}</div><div class="c"><h2>Kesehatan soal</h2><p class="sub">Soal dengan lebih dari 85% siswa salah perlu ditinjau: siswa memang belum paham, atau soalnya bermasalah. Hasil bermakna bila yang mengumpulkan cukup banyak.</p><div class="sc"><table><tr><th>Soal</th><th>Topik</th><th>Benar</th><th>Status</th></tr>${r.questions.map((q) => { const p = Math.round(q.c / q.n * 100); const bad = (100 - p) > 85; return `<tr><td>${esc(q.id)}</td><td>${esc(q.topic)}</td><td>${q.c}/${q.n} (${p}%)</td><td>${bad ? '<span class="st lo">▲ Tinjau</span>' : p < 50 ? '<span class="st mid">◆ Pantau</span>' : '<span class="st hi">● Sehat</span>'}</td></tr>`; }).join('')}</table></div></div>`;
  } catch (e) { fail(e); }
};
async function tSiswa() {
  try {
    const cl = await api('GET', '/api/classes');
    out(`<div class="c"><h2>Impor daftar siswa</h2><p class="sub">Kolom: nama_lengkap, nama_panggilan, nisn, kelas, rombel, tahun_ajaran. NISN diformat Teks (10 angka). Jangan sertakan NIK, alamat, atau nomor telepon.</p><form data-sub="impor"><div class="fl"><label for="fi">Unggah file CSV</label><input type="file" id="fi" accept=".csv,.txt" data-chg="file"></div><div class="fl"><label for="ci">Atau tempel isi CSV</label><textarea id="ci"></textarea></div>${isAdm() ? '<div class="fl"><label for="tu">Nama pengguna guru pemilik kelas (opsional)</label><input id="tu"></div>' : ''}<div class="row"><button class="btn">Impor siswa</button></div></form><div id="im"></div></div><div class="c"><h2>Siswa per kelas</h2>${cl.length ? `<div class="row"><div class="grow">${sel('cl', cl, (c) => `${c.name} · ${c.year} (${c.students} siswa)`)}</div><button class="btn g" data-act="daftar">Tampilkan</button></div>` : '<p class="sub" style="margin-top:8px">Belum ada kelas.</p>'}<div id="ds"></div></div><div id="kt"></div>`);
  } catch (e) { fail(e); }
}
A.file = (t) => { const f = t.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#ci').value = r.result; }; r.readAsText(f); };
const cards = (rows) => `<div class="c"><h2>Kartu login siswa</h2><div class="msg lo no-print" role="alert">PIN hanya tampil sekali. Cetak atau salin sekarang, lalu bagikan langsung ke tiap siswa (jangan ditempel di papan kelas).</div><div class="kg">${rows.map((c) => `<div class="kd"><b>MATH READY SD</b><div>${esc(c.nama_lengkap || c.nama)}</div><div class="sub">Kelas ${esc(c.kelas || '')}</div><div style="margin-top:6px">Nama pengguna (NISN): <b>${esc(c.nisn)}</b></div><div>PIN: <b>${esc(c.pin)}</b></div></div>`).join('')}</div><div class="row no-print"><button class="btn" data-act="print">Cetak kartu</button></div></div>`;
A.print = () => { try { window.print(); } catch (e) { toast('Cetak tidak tersedia'); } };
A.impor = async () => {
  try {
    const r = await api('POST', '/api/classes/import', { csv: $('#ci').value, teacher_username: $('#tu') ? $('#tu').value : undefined });
    $('#im').innerHTML = `<div class="msg ${r.errors.length ? 'lo' : 'hi'}">${r.created.length} siswa dibuat, ${r.errors.length} baris ditolak.</div>${r.errors.length ? `<div class="sc"><table><tr><th>Baris</th><th>Alasan</th></tr>${r.errors.map((e) => `<tr><td>${e.row}</td><td>${esc(e.reason)}</td></tr>`).join('')}</table></div>` : ''}`;
    $('#ci').value = ''; if (r.created.length) $('#kt').innerHTML = cards(r.created);
  } catch (e) { $('#im').innerHTML = `<div class="msg lo" role="alert">${esc(e.message)}</div>`; }
};
A.daftar = async () => {
  try { const s = await api('GET', `/api/classes/${$('#cl').value}/students`); $('#ds').innerHTML = `<div class="sc"><table><tr><th>Nama panggilan</th><th>Nama lengkap</th><th>NISN</th><th></th></tr>${s.map((x) => `<tr><td>${esc(x.nickname)}</td><td>${esc(x.full_name)}</td><td>${esc(x.nisn)}</td><td><button class="btn g s" data-act="reset" data-id="${x.user_id}">Reset PIN</button></td></tr>`).join('')}</table></div>`; } catch (e) { fail(e); }
};
A.reset = async (b) => { try { const r = await api('POST', `/api/students/${b.dataset.id}/reset-pin`); $('#kt').innerHTML = cards([r]); toast('PIN baru dibuat'); scrollTo(0, document.body.scrollHeight); } catch (e) { fail(e); } };
async function tTugas() {
  try {
    const [pk, cl, as] = await Promise.all([api('GET', '/api/packages'), api('GET', '/api/classes'), api('GET', '/api/assignments')]);
    const d = new Date(); d.setDate(d.getDate() + 7);
    out(`<div class="c"><h2>Paket tryout</h2><div class="sc"><table><tr><th>Paket</th><th>Soal</th><th>Status soal</th><th></th></tr>${pk.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.n} · ${p.duration_min} menit</td><td>${Object.keys(p.statuses || {}).map((k) => `${esc(k)}: ${p.statuses[k]}`).join(', ')}</td><td><button class="btn g s" data-act="periksa" data-id="${p.id}">Tandai sudah diperiksa</button></td></tr>`).join('')}</table></div><p class="sub" style="margin-top:8px">Tugas hanya bisa dibuat bila semua soal paket berstatus pilot atau terbit. Tombol di atas menyatakan Anda sudah memeriksa soalnya (tercatat di log).</p></div><div class="c"><h2>Buat tugas</h2>${cl.length && pk.length ? `<form data-sub="tugas"><div class="fl"><label for="pk">Paket</label>${sel('pk', pk, (p) => p.name)}</div><div class="fl"><label for="kl">Kelas</label>${sel('kl', cl, (c) => c.name + ' · ' + c.year)}</div><div class="fl"><label for="du">Tenggat</label><input id="du" type="date" value="${d.toISOString().slice(0, 10)}" required></div><div class="row"><button class="btn">Buat tugas</button></div></form>` : '<p class="sub" style="margin-top:8px">Impor siswa dulu agar ada kelas.</p>'}</div><div class="c"><h2>Tugas aktif</h2><div class="sc"><table><tr><th>Kelas</th><th>Paket</th><th>Tenggat</th><th>Terkumpul</th></tr>${as.map((a) => `<tr><td>${esc(a.class)}</td><td>${esc(a.package)}</td><td>${esc(a.due)}</td><td>${a.submitted}/${a.students}</td></tr>`).join('')}</table></div></div>`);
  } catch (e) { fail(e); }
}
A.periksa = async (b) => { if (!confirm('Apakah Anda sudah memeriksa semua soal di paket ini (kunci, bahasa, gambar)?')) return; try { const r = await api('POST', `/api/packages/${b.dataset.id}/mark-reviewed`, { confirm: true }); toast(`${r.updated} soal ditandai pilot`); tTugas(); } catch (e) { fail(e); } };
A.tugas = async () => { try { await api('POST', '/api/assignments', { package_id: +$('#pk').value, class_id: +$('#kl').value, due: $('#du').value }); toast('Tugas dibuat'); tTugas(); } catch (e) { fail(e); } };
const SL = { draft: ['', '✎ Draf'], review: ['mid', '◔ Review'], pilot: ['mid', '◑ Pilot'], published: ['hi', '● Terbit'], unpublished: ['lo', '▲ Ditarik'] }, NX = { draft: ['review'], review: ['pilot', 'draft'], pilot: ['published', 'review'], published: ['unpublished'], unpublished: ['draft'] };
async function tSoal() {
  out(`<div class="c"><h2>Bank soal</h2><div class="row"><div class="fl" style="margin:0"><label for="fs">Status</label><select id="fs" data-chg="fsoal"><option value="">Semua</option>${Object.keys(SL).map((k) => `<option value="${k}">${SL[k][1]}</option>`).join('')}</select></div><div class="fl" style="margin:0"><label for="ft">Tipe</label><select id="ft" data-chg="fsoal"><option value="">Semua</option><option>PG</option><option>PGK_MCMA</option><option>PGK_KATEGORI</option></select></div></div><div id="sl"></div></div><div id="sd"></div>`); A.fsoal();
}
A.fsoal = async () => {
  try {
    const q = new URLSearchParams(); if ($('#fs').value) q.set('status', $('#fs').value); if ($('#ft').value) q.set('qtype', $('#ft').value);
    const r = await api('GET', '/api/questions?' + q);
    $('#sl').innerHTML = `<p class="sub" style="margin-top:10px">${r.length} soal</p><div class="sc"><table><tr><th>ID</th><th>Topik</th><th>Tipe</th><th>Status</th><th></th></tr>${r.map((x) => `<tr><td>${esc(x.id)}</td><td>${esc(x.topic)}</td><td>${esc(x.qtype)}${x.has_image ? ' 🖼' : ''}</td><td><span class="st ${SL[x.status][0]}">${SL[x.status][1]}</span></td><td><button class="btn g s" data-act="lihatq" data-id="${esc(x.id)}">Lihat</button> ${NX[x.status].map((n) => `<button class="btn s" data-act="adv" data-id="${esc(x.id)}" data-to="${n}">→ ${n}</button>`).join(' ')}</td></tr>`).join('')}</table></div>`;
  } catch (e) { fail(e); }
};
A.lihatq = async (b) => {
  try { const q = await api('GET', '/api/questions/' + b.dataset.id); $('#sd').innerHTML = `<div class="c"><span class="chip">${esc(q.id)} · ${esc(q.qtype)} · ${esc(q.cognitive_level || '')} · ${esc(q.label)}</span><p class="q">${esc(q.stem)}</p>${q.image ? `<div class="im">${q.image}</div>` : ''}<ul style="padding-left:20px">${q.options.map((t, j) => `<li>${L[j]}. ${esc(t)} <b>${q.qtype === 'PGK_KATEGORI' ? (q.answer[j] === 'B' ? '→ Benar' : '→ Salah') : (q.answer.includes(L[j]) ? '✓ kunci' : '')}</b></li>`).join('')}</ul><p class="sub" style="margin-top:8px">Pembahasan: ${esc(q.explanation)}</p><p class="sub">Jebakan yang diduga: ${esc(q.rationale)}</p></div>`; scrollTo(0, document.body.scrollHeight); } catch (e) { fail(e); }
};
A.adv = async (b) => { try { await api('POST', `/api/questions/${b.dataset.id}/advance`, { to: b.dataset.to }); A.fsoal(); } catch (e) { fail(e); } };
async function tPengguna() {
  try {
    const u = await api('GET', '/api/admin/users');
    out(`<div class="c"><h2>Akun guru dan admin</h2><div class="sc"><table><tr><th>Nama pengguna</th><th>Nama</th><th>Peran</th><th>Aktif</th><th></th></tr>${u.map((x) => `<tr><td>${esc(x.username)}</td><td>${esc(x.display_name)}</td><td>${esc(x.role)}</td><td>${x.active ? 'Ya' : 'Tidak'}</td><td><button class="btn g s" data-act="rpw" data-id="${x.id}">Reset kata sandi</button> <button class="btn g s" data-act="aktif" data-id="${x.id}" data-v="${x.active ? 0 : 1}">${x.active ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>`).join('')}</table></div></div><div class="c"><h2>Tambah akun</h2><form data-sub="buatuser"><div class="fl"><label for="nu">Nama pengguna</label><input id="nu" required pattern="[a-z0-9._-]{3,32}"></div><div class="fl"><label for="nn">Nama tampilan</label><input id="nn" required></div><div class="fl"><label for="nr">Peran</label><select id="nr"><option value="teacher">Guru</option><option value="admin">Admin</option></select></div><div class="row"><button class="btn">Buat akun</button></div></form><div id="np"></div></div>`);
  } catch (e) { fail(e); }
}
const showPw = (r) => { $('#np').innerHTML = `<div class="msg lo" role="alert">Kata sandi untuk <b>${esc(r.username)}</b>: <b>${esc(r.password)}</b><br>Simpan sekarang. Tidak ditampilkan lagi.</div>`; };
A.buatuser = async () => { try { showPw(await api('POST', '/api/admin/users', { username: $('#nu').value, display_name: $('#nn').value, role: $('#nr').value })); } catch (e) { fail(e); } };
A.rpw = async (b) => { try { const r = await api('POST', `/api/admin/users/${b.dataset.id}/reset-password`); showPw(r); scrollTo(0, document.body.scrollHeight); } catch (e) { fail(e); } };
A.aktif = async (b) => { try { await api('POST', `/api/admin/users/${b.dataset.id}/active`, { active: b.dataset.v === '1' }); tPengguna(); } catch (e) { fail(e); } };
async function tAktif() {
  try {
    const [s, a] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', '/api/admin/audit')]);
    out(`<div class="c"><h2>Ringkasan</h2><p>${s.siswa} siswa · ${s.kelas} kelas · ${s.soal} soal (${s.soal_siap} siap dipakai) · ${s.tryout_selesai} tryout selesai</p></div><div class="c"><h2>Catatan aktivitas (100 terakhir)</h2><div class="sc"><table><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Rincian</th></tr>${a.map((l) => `<tr><td>${esc(l.at)}</td><td>${esc(l.username)}</td><td>${esc(l.action)}</td><td>${esc(JSON.stringify(l.detail))}</td></tr>`).join('')}</table></div></div>`);
  } catch (e) { fail(e); }
}
function tAkun() { out(`<div class="c"><h2>Ganti kata sandi</h2><form data-sub="gantipw"><div class="fl"><label for="o">Kata sandi lama</label><input id="o" type="password" required autocomplete="current-password"></div><div class="fl"><label for="n">Kata sandi baru (minimal 10 karakter)</label><input id="n" type="password" required minlength="10" autocomplete="new-password"></div><div class="row"><button class="btn">Simpan</button></div></form></div>`); }
A.gantipw = async () => { try { await api('POST', '/api/me/password', { old_password: $('#o').value, new_password: $('#n').value }); toast('Kata sandi diganti'); $('#o').value = ''; $('#n').value = ''; } catch (e) { fail(e); } };

function home() { ME.role === 'student' ? studentHome() : staffHome(); }
async function boot() { try { ME = await api('GET', '/api/me'); } catch (e) { return login(); } home(); }
boot();
})();
