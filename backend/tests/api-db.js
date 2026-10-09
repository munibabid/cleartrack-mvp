/* Management-API SQL client for when direct Postgres (5432/6543) is blocked.
   Mimics the bits of pg.Client the test harnesses use: query(sql, params) -> {rows}.
   Parameters are inlined as quoted literals (test use only, never user input).
   Each call is its own session, so multi-statement work must go in one query string.
   Needs SUPABASE_ACCESS_TOKEN (scoped, Database read & write) and SUPABASE_PROJECT_REF.
   Never prints the token. */
const REF = process.env.SUPABASE_PROJECT_REF || 'kiwbasfbiarscalzhopy';
const mask = s => String(s).replace(/sbp_[A-Za-z0-9_]+/g, 'sbp_***').replace(/postgres(ql)?:\/\/[^\s'"]+/g, 'postgres://***');
function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.length ? `array[${v.map(lit).join(',')}]` : `'{}'`;
  if (typeof v === 'object') v = JSON.stringify(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}
function inline(sql, params = []) {
  if (!params || !params.length) return sql; // never touch $1 inside function bodies of raw SQL files
  return sql.replace(/\$(\d+)(::[a-z_\[\]]+)?/g, (m, n, cast) => {
    const v = params[+n - 1];
    if (Array.isArray(v) && !cast) {
      const uuid = v.every(x => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x)));
      return v.length ? `array[${v.map(lit).join(',')}]::${uuid ? 'uuid' : 'text'}[]` : `'{}'::uuid[]`;
    }
    return lit(v) + (cast || '');
  });
}
async function query(sql, params) {
  const tok = process.env.SUPABASE_ACCESS_TOKEN;
  if (!tok) throw new Error('SUPABASE_ACCESS_TOKEN not set');
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: inline(sql, params) })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(mask(`Management API ${res.status}: ${text.slice(0, 600)}`));
  let rows; try { rows = JSON.parse(text); } catch { rows = []; }
  return { rows: Array.isArray(rows) ? rows : [] };
}
const available = () => !!process.env.SUPABASE_ACCESS_TOKEN;
/* A pg-like client. begin ... commit is buffered and sent as ONE request
   (begin; ...; commit;) so it stays atomic; statements inside a transaction
   return no rows, so read what you need before begin or after commit.
   rollback discards the buffer (nothing was sent). */
async function client() {
  let tx = null;
  return {
    async query(sql, params) {
      const k = String(sql).trim().toLowerCase().replace(/;$/, '');
      if (k === 'begin') { if (tx) throw new Error('nested begin'); tx = []; return { rows: [] }; }
      if (k === 'commit') { const b = tx || []; tx = null; if (b.length) await query('begin;\n' + b.join(';\n') + ';\ncommit;'); return { rows: [] }; }
      if (k === 'rollback') { tx = null; return { rows: [] }; }
      if (tx) { tx.push(inline(sql, params)); return { rows: [] }; }
      return query(sql, params);
    },
    end: async () => { tx = null; }
  };
}
module.exports = { query, client, available, mask, inline, lit };
if (require.main === module) {
  const fs = require('fs'); const a = process.argv[2];
  const sql = a.startsWith('@') ? fs.readFileSync(a.slice(1), 'utf8') : a;
  query(sql).then(r => console.log(JSON.stringify(r.rows, null, 1))).catch(e => { console.error(mask(e.message)); process.exit(1); });
}
