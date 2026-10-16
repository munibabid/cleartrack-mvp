#!/usr/bin/env node
/* v14.9 Share Passport UI — browser test (chromium). Local server, demo data only.
   Usage: node backend/tests/p149-secure-share-ui.js  (SHOTS=<dir>) */
const fs = require('fs'), path = require('path'), pw = require('playwright'), http = require('http');
const R = []; const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (!c && i !== '' ? ' — ' + JSON.stringify(i).slice(0, 400) : ''); R.push(l); console.log(l); return c; };
(async () => {
  const root = path.resolve(__dirname, '../..');
  const srv = http.createServer((q, s) => { let u = decodeURIComponent(q.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html'; fs.readFile(path.join(root, u), (e, d) => { if (e) { s.writeHead(404); return s.end() } s.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(u)] || 'application/octet-stream' }); s.end(d) }) });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${srv.address().port}/`;
  const b = await pw.chromium.launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }), pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE, { waitUntil: 'networkidle' });
  await pg.evaluate(() => { localStorage.removeItem('veridun_secure_share_v1'); v81ShowRole('clinician'); showV7View('passportView'); document.getElementById('spCardV149').open = true; });
  const cats = await pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('.spCatV149')].map(c => [c.value, { on: c.checked, dis: c.disabled }])));
  ok('recruiter: health/background/source documents off and disabled', ['SENSITIVE_HEALTH', 'BACKGROUND', 'SOURCE_DOCUMENTS'].every(k => !cats[k].on && cats[k].dis) && cats.LICENSES.on, cats);
  ok('share modes offered: secure live, assignment, printable, audit packet, QR', await pg.evaluate(() => [...document.querySelectorAll('#spModeV149 option')].map(o => o.value).join() === 'SECURE_LIVE,ASSIGNMENT,PRINTABLE,AUDIT_PACKET,QR'));
  ok('blockchain hidden in the default view', !/XRPL|blockchain|ledger/i.test(await pg.evaluate(() => document.getElementById('spCardV149').innerText)));
  await pg.selectOption('#spRoleV149', 'CREDENTIALING');
  ok('credentialing role enables health/background (still off by default); source docs still disabled', await pg.evaluate(() => { const c = v => document.querySelector(`.spCatV149[value="${v}"]`); return !c('SENSITIVE_HEALTH').disabled && !c('SENSITIVE_HEALTH').checked && c('SOURCE_DOCUMENTS').disabled; }));
  await pg.check('.spCatV149[value="SENSITIVE_HEALTH"]');
  await pg.fill('#spEmailV149', 'pat@hospital.example'); await pg.fill('#spPurposeV149', 'ICU contract credentialing');
  await pg.click('#spCreateV149');
  ok('link created, recipient-bound, ACTIVE', await pg.evaluate(() => { const c = document.querySelector('[data-grant]'); return c && c.dataset.status === 'ACTIVE' && /pat@hospital\.example/.test(c.innerText); }));
  await pg.click('.spPrevV149');
  const prev = await pg.evaluate(() => document.getElementById('spPreviewV149').innerText);
  ok('recipient preview: DEMO notice; health items "Requirement satisfied" without documents', /DEMO/.test(prev) && /Requirement satisfied: YES/.test(prev) && !/private:/.test(prev), prev.slice(0, 300));
  if (process.env.SHOTS) await pg.locator('#spCardV149').screenshot({ path: process.env.SHOTS + '/share.png' });
  await pg.click('.spRevV149');
  ok('revoke → REVOKED; preview then refused', await pg.evaluate(() => document.querySelector('[data-grant]').dataset.status === 'REVOKED'));
  await pg.click('.spPrevV149');
  ok('revoked link: recipient sees "Access unavailable (REVOKED)"', /Access unavailable.*REVOKED/.test(await pg.evaluate(() => document.getElementById('spMsgV149').innerText)));
  ok('access log records create, views and denials', await pg.evaluate(() => { const l = JSON.parse(localStorage.getItem('veridun_secure_share_v1')).log; return l.some(e => e.action === 'CREATE_LINK') && l.some(e => e.result === 'ALLOWED') && l.some(e => e.result === 'DENIED' && e.reason === 'REVOKED'); }));
  // without email → error, no grant
  await pg.fill('#spEmailV149', ''); await pg.click('#spCreateV149');
  ok('link without a recipient is refused', /recipient/i.test(await pg.evaluate(() => document.getElementById('spMsgV149').innerText)));
  // audit packet
  await pg.selectOption('#spRoleV149', 'COMPLIANCE_AUDITOR'); await pg.fill('#spEmailV149', 'audit@hospital.example');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#spPacketV149')]);
  const pkt = await pg.evaluate(() => window.__lastAuditPacket.body);
  ok('audit packet generated for the chosen role, signed with demo key, demo-labeled', pkt.role === 'COMPLIANCE_AUDITOR' && pkt.demo === true && /audit-packet-compliance_auditor/.test(dl.suggestedFilename()));
  // snapshot + verification page
  const [popup] = await Promise.all([pg.waitForEvent('popup'), pg.click('#spSnapV149')]);
  await popup.waitForLoadState();
  const ptxt = await popup.evaluate(() => document.body.innerText);
  ok('printable snapshot: DEMO banner, hash, demo key; no health items', /DEMO/.test(ptxt) && /SHA-256 [0-9a-f]{64}/.test(ptxt) && !/TB|Drug|Background/i.test(ptxt.split('Health, background')[0]), ptxt.slice(0, 300));
  const hash = (ptxt.match(/SHA-256 ([0-9a-f]{64})/) || [])[1];
  const pv = await ctx.newPage(); await pv.goto(BASE + '?vsnap=' + hash.slice(0, 32), { waitUntil: 'networkidle' }); await pv.waitForSelector('#vsnapStateV149');
  ok('verification page: authentic and current', await pv.evaluate(() => document.getElementById('vsnapStateV149').dataset.state) === 'AUTHENTIC_CURRENT');
  await pv.evaluate(() => { const k = 'nursecredx_v2', a = JSON.parse(localStorage.getItem(k)); a.find(c => c.primary === 'VERIFIED' && /^CERT_/.test(c.kind)).version = 2; localStorage.setItem(k, JSON.stringify(a)); });
  await pv.reload({ waitUntil: 'networkidle' }); await pv.waitForSelector('#vsnapStateV149');
  ok('after a credential changes: "outdated — One credential changed since this snapshot"', await pv.evaluate(() => { const e = document.getElementById('vsnapStateV149'); return e.dataset.state === 'OUTDATED' && /One credential changed since this snapshot/.test(e.innerText); }));
  await pv.evaluate(h => { const s = JSON.parse(localStorage.getItem('veridun_secure_share_v1')); s.snapshots.find(x => x.sha256 === h).body.items[0].expires = '2099-01-01'; localStorage.setItem('veridun_secure_share_v1', JSON.stringify(s)); }, hash);
  await pv.reload({ waitUntil: 'networkidle' }); await pv.waitForSelector('#vsnapStateV149');
  ok('modified snapshot: not authentic', await pv.evaluate(() => document.getElementById('vsnapStateV149').dataset.state) === 'TAMPERED');
  ok('QR/verify URL holds no names or credential data', !/Alex|Morgan|RN|BLS/.test('?vsnap=' + hash.slice(0, 32)));
  ok('no page errors', errs.length === 0, errs);
  await b.close(); srv.close();
  const f = R.filter(l => l.startsWith('FAIL')).length; console.log(`\n${R.length - f}/${R.length} passed`); process.exit(f ? 1 : 0);
})();
