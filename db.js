'use strict';
// Adaptor database: PostgreSQL asli bila DATABASE_URL diisi; bila tidak, Postgres tertanam (PGlite) untuk uji coba lokal.
const fs = require('fs'), path = require('path');
let impl;
async function init() {
  if (impl) return impl;
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10,
      ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: true } : undefined });
    impl = { kind: 'postgres', query: (t, p) => pool.query(t, p), exec: (t) => pool.query(t), close: () => pool.end() };
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    let pg;
    if (process.env.DATA_DIR === 'memory') pg = new PGlite();
    else {
      const dir = process.env.DATA_DIR || path.join(__dirname, 'data', 'pgdata');
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      pg = new PGlite(dir);
    }
    await pg.waitReady;
    impl = { kind: 'pglite', query: (t, p) => pg.query(t, p), exec: (t) => pg.exec(t), close: () => pg.close() };
  }
  await impl.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return impl;
}
module.exports = { init, q: (t, p) => impl.query(t, p), close: () => impl && impl.close(), kind: () => impl.kind };
