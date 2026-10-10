'use strict';
// Menanam schema.sql ke schema.js (agar ikut terbawa saat dipasang di Vercel). Jalankan: node tools/embed-schema.js
const fs = require('fs'), path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
fs.writeFileSync(path.join(__dirname, '..', 'schema.js'), "'use strict';\n// DIHASILKAN dari schema.sql oleh tools/embed-schema.js. Jangan diedit langsung.\nmodule.exports = " + JSON.stringify(sql) + ";\n");
console.log('schema.js diperbarui');
