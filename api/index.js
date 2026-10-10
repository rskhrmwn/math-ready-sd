'use strict';
// Pintu masuk Vercel: seluruh /api/* dilayani aplikasi Express yang sama dengan mode lokal.
const { app, ready } = require('../server');
module.exports = async (req, res) => {
  try { await ready(); } catch (e) { console.error(e); res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); return res.end('{"error":"Server belum siap"}'); }
  return app(req, res);
};
