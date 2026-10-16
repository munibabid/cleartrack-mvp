#!/usr/bin/env node
/* v14.9 Employment & Specialty Experience — browser test (chromium desktop + webkit mobile).
   Local static server, demo data only, no network beyond localhost, no external model.
   Usage: node backend/tests/p149-employment-ui.js   (SHOTS=<dir> to save screenshots) */
const fs = require('fs'), path = require('path'), pw = require('playwright');
function serve() {
  const http = require('http'), root = path.resolve(__dirname, '../..');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
  const srv = http.createServer((req, res) => { let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; const f = path.join(root, u); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); } fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); }); });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
const R = []; const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (!c && i !== '' ? ' — ' + JSON.stringify(i).slice(0, 400) : ''); R.push(l); console.log(l); return c; };
(async () => {
  const srv = await serve(), BASE = `http://127.0.0.1:${srv.address().port}/`;
  const SHOTS = process.env.SHOTS;
  for (const [eng, opts, tag] of [['chromium', { viewport: { width: 1280, height: 900 } }, 'chromium/desktop'], ['webkit', { ...pw.devices['iPhone 13'] }, 'webkit/mobile']]) {
    const b = await pw[eng].launch(); const ctx = await b.newContext(opts); const pg = await ctx.newPage();
    const ext = []; pg.on('request', r => { if (!r.url().startsWith(BASE) && !/unpkg\.com\/xrpl|fonts\./.test(r.url())) ext.push(r.url()); });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const t = (n, c, i) => ok(`[${tag}] ${n}`, c, i);
    await pg.goto(BASE, { waitUntil: 'networkidle' });
    await pg.evaluate(() => { localStorage.removeItem('veridun_employment_v1'); v81ShowRole('clinician'); showV7View('passportView'); });
    await pg.waitForSelector('#empCardV149');
    const card = await pg.evaluate(() => ({ text: document.getElementById('empCardV149').innerText, v: document.getElementById('empVerifiedV149').innerText, c: document.getElementById('empClaimedV149').innerText, r: document.getElementById('empRecentV149').innerText, l: document.getElementById('empLastV149').innerText,
      eps: [...document.querySelectorAll('#empCardV149 .emp-ep-v149')].map(e => ({ s: e.dataset.strength, f: Object.fromEntries([...e.querySelectorAll('.emp-f-v149')].map(x => [x.dataset.field, x.dataset.status])), t: e.innerText })) }));
    const asOf = new Date().toISOString().slice(0, 7);
    t('card shows verified total from the fully verified episode only (Sharp, Jan 2024–Feb 2026 = 2 years 2 months)', card.v === '2 years 2 months', card.v);
    t('claimed total is shown separately and is larger', /year/.test(card.c) && card.c !== card.v, card.c);
    t('recent and last verified ICU work shown', /of previous 24 months/.test(card.r) && /2026/.test(card.l), [card.r, card.l]);
    t('three contributing episodes with different strengths (strong / partial / partial-or-claim)', card.eps.length === 3 && card.eps[0].s === 'strong' && card.eps.slice(1).every(e => e.s !== 'strong'), card.eps.map(e => e.s));
    const xyz = card.eps.find(e => /Hospital XYZ/.test(e.t)), ag = card.eps.find(e => /TravelCo/.test(e.t));
    t('Hospital XYZ: employer/role/dates verified, ICU specialty based on nurse attestation', xyz && xyz.f.employer === 'VERIFIED' && xyz.f.specialty === 'SELF-ATTESTED' && /ICU specialty based on nurse attestation/.test(xyz.t) && /Employment verified/.test(xyz.t) && /RN role verified/.test(xyz.t) && /Employment dates verified/.test(xyz.t), xyz);
    t('agency W-2: corroborated, specialty not provable by pay records', ag && ag.f.employer === 'CORROBORATED' && ag.f.specialty === 'SELF-ATTESTED' && /not provable by this source: specialty/.test(await pg.evaluate(() => document.querySelector('[data-episode="emp-demo-agency"]').innerHTML)), ag);
    t('Sharp: "ICU specialty verified"', /ICU specialty verified/.test(card.eps[0].t));
    t('no vague "verified by employer" wording anywhere on the Passport', !/verified by (an )?employer/i.test(await pg.evaluate(() => document.getElementById('passportView').innerText)));
    t('history table: append-only entries with hash and mock proof refs', await pg.evaluate(() => { const r = document.querySelectorAll('[data-episode="emp-demo-sharp"] .emp-hist-v149 tr'); return r.length === 3 && /MOCK-/.test(r[2].textContent) && /mock-fnv1a32/.test(r[2].textContent); }));
    const reqs = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.emp-req-v149')].map(e => [e.dataset.req, e.dataset.status])));
    t('Hospitals A/B/D/E qualified, C not yet qualified (gap shown)', reqs.A === 'QUALIFIED' && reqs.B === 'QUALIFIED' && reqs.C === 'NOT_YET_QUALIFIED' && reqs.D === 'QUALIFIED' && reqs.E === 'QUALIFIED' && /gap: 10 months/.test(await pg.evaluate(() => document.querySelector('[data-req="C"]').innerText)), reqs);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await pg.locator('#empCardV149').screenshot({ path: `${SHOTS}/${eng}-card.png` }); }
    // custom requirement
    await pg.evaluate(() => { document.getElementById('empCustomV149').open = true; });
    await pg.fill('#empCuTotalV149', '40'); 
    t('custom requirement updates live: ≥40 → NOT YET QUALIFIED with gap 14', await pg.evaluate(() => { const e = document.querySelector('#empCustomResultV149 .emp-req-v149'); return e.dataset.status === 'NOT_YET_QUALIFIED' && /gap: 14 months/.test(e.innerText); }));
    await pg.fill('#empCuTotalV149', '12'); await pg.check('.empCuSubV149[value="CVICU"]');
    t('accepted subspecialties [CVICU] only: plain ICU episode no longer counts', await pg.evaluate(() => document.querySelector('#empCustomResultV149 .emp-req-v149').dataset.status === 'NOT_YET_QUALIFIED'));
    // resume flow
    await pg.evaluate(() => { document.getElementById('empResumeV149').open = true; });
    await pg.fill('#empResumeTextV149', 'Mercy General | CVICU RN | Mar 2019 – Feb 2021');
    await pg.click('#empExtractV149');
    t('mock extraction produces a reviewable draft', await pg.locator('.emp-draft-v149').count() === 1);
    await pg.fill('.emp-draft-v149 .empDEmp', 'Mercy General Hospital');
    const beforeV = await pg.evaluate(() => document.getElementById('empVerifiedV149').innerText);
    await pg.click('#empSaveDraftsV149');
    const after = await pg.evaluate(() => { const e = [...document.querySelectorAll('#empCardV149 .emp-ep-v149')].find(x => /Mercy General Hospital/.test(x.innerText)); return { s: e && e.dataset.strength, t: e && e.innerText, v: document.getElementById('empVerifiedV149').innerText, c: document.getElementById('empClaimedV149').innerText }; });
    t('reviewed resume record saved with the nurse correction, as self-reported claim', after.s === 'claim' && /from resume/.test(after.t) && /self-reported/i.test(after.t), after);
    t('resume record does not change the verified total; claimed total grows', after.v === beforeV && after.c !== card.c, after);
    if (SHOTS) await pg.locator('#empCardV149').screenshot({ path: `${SHOTS}/${eng}-after-resume.png` });
    await pg.reload({ waitUntil: 'networkidle' }); await pg.evaluate(() => { v81ShowRole('clinician'); showV7View('passportView'); });
    t('episodes persist in the browser-only demo store', await pg.evaluate(() => document.querySelectorAll('#empCardV149 .emp-ep-v149').length === 4));
    t('no horizontal page overflow', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    t('no requests to external services (no model, no API)', ext.length === 0, ext);
    t('no page errors', errs.length === 0, errs);
    await b.close();
  }
  srv.close();
  const f = R.filter(l => l.startsWith('FAIL')).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
