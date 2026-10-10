'use strict';
// Cadangan: node backup.js  -> menulis backup/backup-TANGGAL.json (jaga kerahasiaannya: berisi data siswa).
// Butuh DATABASE_URL (PostgreSQL) atau memakai database tertanam bila kosong.
const fs = require('fs'), path = require('path'), D = require('./db');
const TABLES = ['users', 'classes', 'students', 'questions', 'packages', 'assignments', 'attempts', 'answers', 'audit_log'];
(async () => {
  await D.init(); const out = { versi: 1, dibuat: new Date().toISOString(), tabel: {} };
  for (const t of TABLES) out.tabel[t] = (await D.q(`select * from ${t} order by 1`)).rows;
  const dir = path.join(__dirname, 'backup'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'backup-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16) + '.json');
  fs.writeFileSync(f, JSON.stringify(out), { mode: 0o600 });
  console.log('Cadangan tersimpan:', f, Object.fromEntries(TABLES.map((t) => [t, out.tabel[t].length])));
  await D.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
