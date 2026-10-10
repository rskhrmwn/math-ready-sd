'use strict';
// Adaptor database: PostgreSQL asli bila DATABASE_URL diisi; bila tidak, Postgres tertanam (PGlite) untuk uji coba lokal.
const fs = require('fs'), path = require('path');
const SCHEMA = require('./schema.js'), VERSION = '2';
let impl, initP;
async function open() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: process.env.VERCEL ? 2 : 10, idleTimeoutMillis: 10000,
      ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: true } : undefined });
    pool.on('error', (e) => console.error('pool', e.message));
    return { kind: 'postgres', query: (t, p) => pool.query(t, p), exec: (t) => pool.query(t), close: () => pool.end() };
  }
  const { PGlite } = require('@electric-sql/pglite');
  let pg;
  if (process.env.DATA_DIR === 'memory') pg = new PGlite();
  else {
    const dir = process.env.DATA_DIR || path.join(__dirname, 'data', 'pgdata');
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    pg = new PGlite(dir);
  }
  await pg.waitReady;
  return { kind: 'pglite', query: (t, p) => pg.query(t, p), exec: (t) => pg.exec(t), close: () => pg.close() };
}
// Skema hanya dibuat bila belum ada atau versinya berbeda (menghemat waktu start dingin di Vercel).
function init() {
  if (!initP) initP = (async () => {
    impl = await open();
    const r = await impl.query("select to_regclass('public.meta') as m");
    if (r.rows[0].m) { const v = await impl.query("select value from meta where key='schema'"); if (v.rows[0] && v.rows[0].value === VERSION) return impl; }
    await impl.exec(SCHEMA);
    await impl.query("insert into meta(key,value) values('schema',$1) on conflict(key) do update set value=excluded.value", [VERSION]);
    return impl;
  })().catch((e) => { initP = null; throw e; });
  return initP;
}
module.exports = { init, q: (t, p) => impl.query(t, p), close: () => impl && impl.close(), kind: () => impl.kind };
