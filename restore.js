'use strict';
// Pemulihan ke database KOSONG: node restore.js backup/backup-xxxx.json
const fs = require('fs'), D = require('./db');
const TABLES = ['users', 'classes', 'students', 'questions', 'packages', 'assignments', 'attempts', 'answers', 'audit_log'];
const JSONCOLS = { questions: ['options', 'answer'], packages: ['question_ids'], answers: ['response'], audit_log: ['detail'] };
(async () => {
  const f = process.argv[2]; if (!f) { console.error('Pemakaian: node restore.js berkas.json'); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(f, 'utf8')); await D.init();
  if ((await D.q('select count(*)::int c from users')).rows[0].c > 0) { console.error('Database tidak kosong. Pemulihan dibatalkan agar data tidak tertimpa.'); process.exit(1); }
  for (const t of TABLES) {
    for (const r of data.tabel[t]) {
      const cols = Object.keys(r), vals = cols.map((c) => (JSONCOLS[t] && JSONCOLS[t].includes(c) && r[c] !== null ? JSON.stringify(r[c]) : r[c]));
      await D.q(`insert into ${t}(${cols.join(',')}) values(${cols.map((_, i) => '$' + (i + 1)).join(',')})`, vals);
    }
    if (['users', 'classes', 'packages', 'assignments', 'attempts', 'answers', 'audit_log'].includes(t)) await D.q(`select setval(pg_get_serial_sequence('${t}','id'), greatest((select coalesce(max(id),1) from ${t}),1))`);
    console.log(t, data.tabel[t].length);
  }
  console.log('Pemulihan selesai.'); await D.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
