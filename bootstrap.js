'use strict';
// Mengisi data awal (idempotent): bank soal, paket tryout, dan akun admin pertama.
const fs = require('fs'), path = require('path');
const D = require('./db'), { parseCSV, password } = require('./util');
async function ensure(hash) {
  if (!process.env.SEED_FORCE) {
    const c = (await D.q("select (select count(*)::int from questions) q, (select count(*)::int from packages) p, (select count(*)::int from users where role in ('admin','super_admin')) a")).rows[0];
    if (c.q > 0 && c.p > 0 && c.a > 0) return null;
  }
  const dir = path.join(__dirname, 'data');
  for (const f of ['soal_pecahan_draf', 'soal_tka_lanjutan_draf', 'soal_pgk_draf', 'soal_bergambar_draf']) {
    for (const r of parseCSV(fs.readFileSync(path.join(dir, f + '.csv'), 'utf8'))) {
      const img = r.gambar ? fs.readFileSync(path.join(dir, 'gambar', r.gambar), 'utf8') : null;
      await D.q(`insert into questions(id,framework_version,grade,domain,topic,subtopic,label,cognitive_level,difficulty,qtype,stem,options,answer,explanation,rationale,image)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16) on conflict(id) do nothing`,
        [r.question_id, r.framework_version, +r.grade, r.domain, r.topic, r.subtopic, r.label, r.cognitive_level, +r.difficulty, r.question_type, r.question,
          JSON.stringify([r.option_a, r.option_b, r.option_c, r.option_d]), JSON.stringify(r.correct_answer.split(',')), r.explanation, r.distractor_rationale, img]);
    }
  }
  const t = JSON.parse(fs.readFileSync(path.join(dir, 'tryout1.json'), 'utf8'));
  await D.q('insert into packages(name,duration_min,question_ids) values($1,$2,$3::jsonb) on conflict(name) do nothing', [t.name, t.duration_min, JSON.stringify(t.question_ids)]);
  const a = await D.q("select 1 from users where role in ('admin','super_admin')");
  if (!a.rows.length) {
    const pw = process.env.ADMIN_PASSWORD || password(14);
    await D.q('insert into users(role,username,pass_hash,display_name) values($1,$2,$3,$4)', ['admin', 'admin', await hash(pw), 'Admin']);
    return { adminPassword: pw, generated: !process.env.ADMIN_PASSWORD };
  }
  return null;
}
module.exports = { ensure };
