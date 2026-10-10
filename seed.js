'use strict';
// Mengisi/menambah bank soal dan paket tryout ke database: node seed.js (butuh DATABASE_URL untuk database sungguhan).
process.env.SEED_FORCE = '1';
const { ready } = require('./server'); const D = require('./db');
ready().then(async (first) => { console.log('Seed selesai.'); if (first) console.log('Admin baru: admin / ' + first.adminPassword); await D.close(); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
