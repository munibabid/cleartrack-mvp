#!/usr/bin/env node
/* v14.1/v14.2 cross-browser regression test for on-device document reading.
   Runs in Playwright with Chromium, WebKit (Safari's engine) and Firefox, each in a phone
   and a desktop viewport, and each twice: as the engine ships today, and with the newer
   APIs removed that older Safari/iOS lacks (ReadableStream async iteration,
   Promise.withResolvers). That second mode reproduces Munib's iPhone error
   "undefined is not a function (near '...t of e...')" on any engine.
   Checks: PDF text read, image OCR, the clinician's "Re-scan document" (signed URL → fetch),
   the verifier's "Read the document on this device", the verifier expiration note, and
   friendly messages (never a raw JS error) when a needed API is missing or the reader fails.
   Synthetic fixtures with fake names/codes: tests/fixtures/xb-*.  Usage:
     node backend/tests/xbrowser.js   (serves the repo itself; BASE=<url> tests a deployed site;
                                      ENGINES=webkit VIEWPORTS=mobile MODES=older-engine narrows it) */
const fs = require('fs'), path = require('path');
const pw = require('playwright');
let BASE = process.env.BASE || '';
/* With no BASE, serve the repo root ourselves (so CI needs no extra server). */
function serve() {
  const http = require('http'), root = path.resolve(__dirname, '../..');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.gz': 'application/gzip' };
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
    const f = path.join(root, u); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
const FIX = path.join(__dirname, 'fixtures');
const ENGINES = (process.env.ENGINES || 'chromium,webkit,firefox').split(',');
const VIEWPORTS = (process.env.VIEWPORTS || 'mobile,desktop').split(',');
const MODES = (process.env.MODES || 'current,older-engine').split(',');
const FAKE = require('./p14-fake.js');
const R = [], matrix = {};
const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (i !== '' && i != null && !c ? ' — ' + String(i).slice(0, 300) : ''); R.push(l); console.log(l); return c; };
const RAW = /TypeError|ReferenceError|undefined is not|is not a function|is not iterable|async iterable|iterator symbol|dynamically imported|SyntaxError|\bnull\b|\[object /;
const b64 = f => fs.readFileSync(path.join(FIX, f)).toString('base64');
const PDF = b64('xb-bls-card.pdf'), PNG = b64('xb-nihss.png'), TCID = b64('xb-bls-tcid.png'), TWOCOL = b64('xb-bls-2col.png');

function ctxOpts(engine, vp) {
  if (vp === 'desktop') return { viewport: { width: 1280, height: 800 } };
  if (engine === 'firefox') return { viewport: { width: 390, height: 844 }, hasTouch: true, userAgent: pw.devices['iPhone 13'].userAgent };
  return { ...pw.devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 7'] };
}
const OLDER = () => {
  try { delete ReadableStream.prototype[Symbol.asyncIterator]; delete ReadableStream.prototype.values; } catch (e) {}
  try { delete Promise.withResolvers; } catch (e) {}
};

async function run(browser, engine, vp, mode) {
  const tag = `${engine}/${vp}/${mode}`;
  const ctx = await browser.newContext(ctxOpts(engine, vp));
  if (mode === 'older-engine') await ctx.addInitScript(OLDER);
  const pg = await ctx.newPage(); pg.setDefaultTimeout(120000);
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  let pass = true; const t = (n, c, i) => { pass = ok(`${tag}: ${n}`, c, i) && pass; };
  try {
    await pg.goto(BASE, { waitUntil: 'networkidle' });
    if (mode === 'older-engine') t('older-engine emulation active (no ReadableStream async iterator, no Promise.withResolvers)', await pg.evaluate(() => typeof Promise.withResolvers !== 'function' || !!window.DocExtract));
    const read = (b, name, type, kind) => pg.evaluate(async ([b, name, type, kind]) => {
      try { const f = new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], name, { type }); const r = await DocExtract.extractFromFile(f, { kind }); const v = k => r.fields[k] && r.fields[k].value; const c = k => r.fields[k] ? Math.round(r.fields[k].conf * 100) / 100 : null; return { ok: true, method: r.method, id: v('credential_id'), renew: v('renew_by'), exp: v('expires_on'), tc: v('training_center_id'), tcn: v('training_center'), issued: v('issued_on'), ci: c('issued_on'), cr: c('renew_by'), cc: c('course') }; }
      catch (e) { return { ok: false, err: String(e && e.message || e) }; }
    }, [b, name, type, kind]);
    const p = await read(PDF, 'BLS card.pdf', 'application/pdf', 'CERT_BLS');
    t('PDF text layer read (eCard code + renew-by)', p.ok && p.method === 'PDF_TEXT' && p.id === '261100000017' && p.renew === '2028-06', JSON.stringify(p));
    const im = await read(PNG, 'nihss.png', 'image/png', 'CERT_NIHSS');
    t('image OCR read (NIHSS Test ID + expiration)', im.ok && im.method === 'IMAGE_OCR' && im.id === '99000123' && im.exp === '2028-03-14', JSON.stringify(im));
    // v14.2: AHA card with "Training Center ID | Instructor ID | eCard Code" headers and values beneath
    const tc = await read(TCID, 'bls-tcid.png', 'image/png', 'CERT_BLS');
    t('v14.2 eCard code ≠ Training Center ID; clean OCR dates + course ≥90%', tc.ok && tc.id === '261100000025' && tc.tc === 'CA00001' && tc.issued === '2026-06-03' && tc.renew === '2028-06' && tc.ci >= 0.9 && tc.cr >= 0.9 && tc.cc >= 0.9, JSON.stringify(tc));
    // v14.3: two-column AHA card (TC info left, Instructor info right, label above value, grey watermark)
    const tw = await read(TWOCOL, 'bls-2col.png', 'image/png', 'CERT_BLS');
    t('v14.3 two-column card: eCard code found, TC ID = CA pattern, Instructor ID kept out, TC name not merged', tw.ok && tw.id === '271100000056' && tw.tc === 'CA00002' && tw.tcn === 'Example Permanente Education' && tw.issued === '2026-06-03', JSON.stringify(tw));
    // ---- account UI through the in-page fake backend ----
    await pg.evaluate(FAKE);
    const id = await pg.evaluate(async b => {
      const f = new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], 'BLS- exp 6-2028.pdf', { type: 'application/pdf' });
      const id = __fakeSeed({ kind: 'CERT_BLS', type_code: 'CERT_BLS', display_name: 'BLS — Basic Life Support', expires_on: '2028-05-08', jurisdiction_code: null }, f);
      await store.account.hydrate(); acctShow('acctPassportV10'); return id;
    }, PDF);
    await pg.waitForTimeout(300);
    await pg.evaluate(id => document.querySelector(`[data-act="doc-rescan"][data-id="${id}"]`).click(), id);
    await pg.waitForFunction(() => { const b = document.getElementById('acctScanBoxV14'); return b && ['done', 'error', 'unsupported'].includes(b.dataset.state); });
    const rs = await pg.evaluate(() => ({ st: document.getElementById('acctScanBoxV14').dataset.state, v: acctScan.values, txt: document.getElementById('acctScanBoxV14').innerText, mm: (document.getElementById('acctMismatchV14') || {}).innerText || '' }));
    t('"Re-scan document" (signed URL → fetch → read) works', rs.st === 'done' && rs.v.credential_id === '261100000017' && /May 8, 2028/.test(rs.mm), rs.st + ' ' + rs.txt.slice(0, 160));
    await pg.evaluate(() => document.querySelector('.acctTab[data-target="acctVerifyV12"]').click());
    await pg.waitForFunction(id => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), id, { timeout: 30000 });
    await pg.evaluate(id => document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`).click(), id);
    await pg.waitForSelector('#acctVerifyFormV12[data-mode="registry"]');
    const before = await pg.evaluate(() => ({ exp: document.getElementById('acctVerifyExpV13').value, note: document.getElementById('acctVerifyExpNoteV14').innerText }));
    t('before reading: note says the typed date is not compared yet', before.exp === '2028-05-08' && /not compared with the document yet/.test(before.note), JSON.stringify(before));
    await pg.evaluate(() => document.getElementById('acctVReadV14').click());
    await pg.waitForFunction(() => document.getElementById('acctCopyCodeV14') || document.getElementById('acctVScanErrV14'), null, { timeout: 120000 });
    const vf = await pg.evaluate(() => ({ copy: !!document.getElementById('acctCopyCodeV14'), err: (document.getElementById('acctVScanErrV14') || {}).innerText || '', exp: document.getElementById('acctVerifyExpV13').value, note: document.getElementById('acctVerifyExpNoteV14').innerText, side: document.documentElement.scrollWidth <= window.innerWidth + 1 }));
    t('verifier "Read the document on this device" works', vf.copy && !vf.err, vf.err);
    t('verifier expiration prefers the document date and shows both dates', vf.exp === '2028-06-30' && /DATES DIFFER/.test(vf.note) && /Jun 30, 2028/.test(vf.note) && /May 8, 2028/.test(vf.note), JSON.stringify(vf));
    if (vp === 'mobile') t('verifier form fits the phone width', vf.side);
    t('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) { t('run', false, e.message); }
  await ctx.close();
  return pass;
}

/* Feature detection: missing WebAssembly → friendly "type the details"; reader that fails to load → friendly error. */
async function degrade(browser, engine) {
  const tag = `${engine}/degraded`;
  let pass = true; const t = (n, c, i) => { pass = ok(`${tag}: ${n}`, c, i) && pass; };
  const ctx = await browser.newContext(ctxOpts(engine, 'mobile'));
  await ctx.addInitScript(() => { try { delete window.WebAssembly; } catch (e) { window.WebAssembly = undefined; } });
  await ctx.route('**/pdfjs-6.4.299-legacy/pdf.min.mjs', r => r.fulfill({ status: 404, body: 'gone' }));
  const pg = await ctx.newPage(); pg.setDefaultTimeout(60000);
  try {
    await pg.goto(BASE, { waitUntil: 'networkidle' });
    await pg.evaluate(FAKE);
    const ids = await pg.evaluate(async ([pdf, png]) => {
      const mk = (b, n, ty) => new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], n, { type: ty });
      const a = __fakeSeed({ kind: 'CERT_BLS', type_code: 'CERT_BLS', display_name: 'BLS', expires_on: '2028-05-08' }, mk(pdf, 'bls.pdf', 'application/pdf'));
      const b = __fakeSeed({ kind: 'CERT_NIHSS', type_code: 'CERT_NIHSS', display_name: 'NIHSS', expires_on: '2028-03-14' }, mk(png, 'nihss.png', 'image/png'));
      await store.account.hydrate(); acctShow('acctPassportV10'); return { a, b };
    }, [PDF, PNG]);
    await pg.waitForTimeout(300);
    const rescan = async id => { await pg.evaluate(id => document.querySelector(`[data-act="doc-rescan"][data-id="${id}"]`).click(), id); await pg.waitForFunction(() => { const b = document.getElementById('acctScanBoxV14'); return b && ['done', 'error', 'unsupported'].includes(b.dataset.state); }); return pg.evaluate(() => ({ st: document.getElementById('acctScanBoxV14').dataset.state, txt: document.getElementById('acctScanBoxV14').innerText })); };
    const img = await rescan(ids.b);
    t('no WebAssembly: image gets a friendly message offering manual entry', img.st === 'unsupported' && /type the details yourself/i.test(img.txt) && !RAW.test(img.txt), JSON.stringify(img));
    const pdf = await rescan(ids.a);
    t('PDF reader cannot load: friendly error offering manual entry, no raw JS error', pdf.st === 'error' && /type the details yourself/i.test(pdf.txt) && !RAW.test(pdf.txt), JSON.stringify(pdf));
    const msg = await pg.evaluate(() => DocExtract.friendlyError(new TypeError("undefined is not a function (near '...t of e...')")));
    t('friendlyError hides raw JS errors', !RAW.test(msg) && msg.length > 20, msg);
  } catch (e) { t('run', false, e.message); }
  await ctx.close();
  return pass;
}

(async () => {
  let srv = null;
  if (!BASE) { srv = await serve(); BASE = `http://127.0.0.1:${srv.address().port}/`; }
  console.log('BASE ' + BASE);
  for (const engine of ENGINES) {
    let browser;
    try { browser = await pw[engine].launch(); } catch (e) { ok(`${engine}: launch`, false, e.message.split('\n')[0]); matrix[engine] = { launch: false }; continue; }
    const ver = browser.version(); matrix[engine] = { version: ver };
    console.log(`— ${engine} ${ver}`);
    for (const vp of VIEWPORTS) for (const mode of MODES) matrix[engine][`${vp}/${mode}`] = await run(browser, engine, vp, mode);
    matrix[engine].degraded = await degrade(browser, engine);
    await browser.close();
  }
  console.log('\nMatrix:'); for (const [e, m] of Object.entries(matrix)) console.log(`  ${e} ${m.version || ''}: ` + Object.entries(m).filter(([k]) => k !== 'version').map(([k, v]) => `${k}=${v ? 'pass' : 'FAIL'}`).join('  '));
  if (srv) srv.close();
  const f = R.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${R.length - f}/${R.length} passed`);
  process.exit(f ? 1 : 0);
})();
