#!/usr/bin/env node
/* t151u C: the proof dialog labels an RN license's date "Current-practice-through date", never
   "Expiration"; other credentials keep "Expiration". Rendering does not mutate the record.
   No network, no database. Usage: node backend/tests/proof-label-test.js */
const fs = require('fs'), path = require('path'), http = require('http');
const pw = require('playwright');
const root = path.resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const srv = http.createServer((req, res) => { let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(root, u); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); } fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); });
const R = []; const t = (n, c, i) => { const l = (c ? 'PASS ' : 'FAIL ') + n + (!c && i ? ' — ' + String(i).slice(0, 400) : ''); R.push(l); console.log(l); };
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${srv.address().port}/`;
  const b = await pw.chromium.launch(); const pg = await (await b.newContext()).newPage();
  await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.request().url().includes('unpkg.com') || r.request().url().includes('jsdelivr') ? r.continue() : r.abort());
  try {
    await pg.goto(BASE, { waitUntil: 'networkidle' });
    const out = await pg.evaluate(() => {
      const mk = (id, kind, jur, exp) => v81Normalize({ id, name: kind + ' (SYNTHETIC)', kind, type: credentialTypeCode(kind, jur), jurisdiction: jur, section: catalogKind(kind).section, required: false, primary: 'VERIFIED', chain: 'NOT ISSUED', expiration: exp, file: '', prov: { source: 'Synthetic', method: 'Demo', verifier: 'TEST', verifiedAt: '2026-10-01T00:00:00Z', active: true } });
      creds.splice(0, creds.length, mk(7001, 'RN_LICENSE', 'US-CA', '2028-04-30'), mk(7002, 'CERT_BLS', '', '2027-11-12'));
      const before = JSON.stringify(creds);
      const rows = id => { showProof(id); const g = [...document.querySelectorAll('#proofGrid > div')].map(x => x.textContent); document.querySelectorAll('dialog[open]').forEach(d => d.close()); const o = []; for (let i = 0; i < g.length; i += 2) o.push([g[i], g[i + 1]]); return o; };
      return { rn: rows(7001), bls: rows(7002), unchanged: JSON.stringify(creds) === before };
    });
    const lab = rs => rs.map(r => r[0]);
    t('RN license proof row reads "Current-practice-through date"', lab(out.rn).includes('Current-practice-through date'), JSON.stringify(out.rn));
    t('RN license proof dialog has no bare "Expiration" row', !lab(out.rn).includes('Expiration'), JSON.stringify(lab(out.rn)));
    t('RN date value shown unchanged', out.rn.some(r => r[0] === 'Current-practice-through date' && /2028/.test(r[1])), JSON.stringify(out.rn));
    t('BLS keeps "Expiration"', lab(out.bls).includes('Expiration') && !lab(out.bls).includes('Current-practice-through date'), JSON.stringify(lab(out.bls)));
    t('rendering does not mutate stored records', out.unchanged);
  } catch (e) { t('ran without exception', false, e.stack); } finally { await b.close(); srv.close(); }
  const f = R.filter(l => l.startsWith('FAIL')).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
