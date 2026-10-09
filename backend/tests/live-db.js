/* Picks how the live-run harnesses (p12, p13) reach the staging database:
   1. direct Postgres via SUPABASE_DB_URL when port 5432/6543 is reachable, or
   2. the Supabase Management API (HTTPS) via a scoped SUPABASE_ACCESS_TOKEN.
   Both return a pg-like client: query(sql, params) -> {rows}, end().
   Never prints a URL or token. */
const net = require('net');
const api = require('./api-db.js');
const mask = s => api.mask(s);
function pgUrl() { return (process.env.SUPABASE_DB_URL || '').replace(/^(postgres(?:ql)?:\/\/[^:]+:)\[([^@]*)\]@/, (m, a, p) => a + p + '@'); }
function tcpOk() {
  const u0 = pgUrl(); if (!u0) return Promise.resolve(false);
  let host, port; try { const u = new URL(u0); host = u.hostname; port = +u.port || 5432; } catch { return Promise.resolve(false); }
  return new Promise(r => { const s = net.connect({ host, port, timeout: 8000 }); s.on('connect', () => { s.destroy(); r(true); }); s.on('timeout', () => { s.destroy(); r(false); }); s.on('error', () => r(false)); });
}
let picked = null;
async function mode() {
  if (picked) return picked;
  if (process.env.LIVE_DB !== 'api' && await tcpOk()) picked = 'pg';
  else if (api.available()) picked = 'api';
  else picked = 'none';
  return picked;
}
async function reachable() { return (await mode()) !== 'none'; }
async function client() {
  const m = await mode();
  if (m === 'pg') { const { Client } = require('pg'); const c = new Client({ connectionString: pgUrl(), ssl: { rejectUnauthorized: false } }); await c.connect(); return c; }
  if (m === 'api') return api.client();
  throw new Error('staging database not reachable: set SUPABASE_DB_URL (open 5432/6543) or SUPABASE_ACCESS_TOKEN');
}
module.exports = { client, reachable, mode, mask };
