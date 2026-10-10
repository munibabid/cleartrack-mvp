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
const PDF = b64('xb-bls-card.pdf'), PNG = b64('xb-nihss.png'), TCID = b64('xb-bls-tcid.png'), TWOCOL = b64('xb-bls-2col.png'), MAFORM = b64('xb-ma-form.pdf'), MAFLAT = b64('xb-ma-flat.pdf'), NIHSS = b64('xb-nihss-aha.pdf'), CCRN = b64('xb-ccrn.pdf'), LMI = b64('xb-lic-mi.pdf'), LTX = b64('xb-lic-tx.pdf'), LNIH = b64('xb-lic-nih.pdf');

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
    // v14.4: state license as a fillable-form PDF, a flattened scan (thin text layer → OCR), and an AHA/ASA NIHSS certificate
    const rd = (b, name, type, kind) => pg.evaluate(async ([b, name, type, kind]) => {
      try { const r = await DocExtract.extractFromFile(new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], name, { type }), { kind }); const o = { ok: true, m: r.method, src: r.source && r.source.id }; for (const [k, x] of Object.entries(r.fields)) o[k] = x.value; o.suggested = r.calculated && r.calculated.suggested_renewal && r.calculated.suggested_renewal.value; const cm = DocExtract.compareToEntered({ jurisdiction: o.jurisdiction }, { kind, jurisdiction: 'US-ME' }).find(x => x.field === 'jurisdiction'); o.cmp = cm && cm.text; return o; }
      catch (e) { return { ok: false, err: String(e && e.message || e) }; }
    }, [b, name, type, kind]);
    const mf = await rd(MAFORM, 'ma-form.pdf', 'application/pdf', 'RN_LICENSE');
    t('v14.4 form-field license PDF: name, number, MA (not WA), expiration; mismatch says MA', mf.ok && mf.m === 'PDF_TEXT' && mf.holder_name === 'Testa Fakename' && mf.credential_id === 'RN0000099' && mf.jurisdiction === 'US-MA' && mf.expires_on === '2029-02-14' && !mf.issued_on && !mf.multistate && /from MA, but you selected ME/.test(mf.cmp || ''), JSON.stringify(mf));
    const fl = await rd(MAFLAT, 'ma-flat.pdf', 'application/pdf', 'RN_LICENSE');
    t('v14.4 thin text layer falls back to OCR: MA + name + expiration', fl.ok && fl.m === 'PDF_OCR' && fl.jurisdiction === 'US-MA' && fl.holder_name === 'Testa Fakename' && fl.expires_on === '2029-02-14', JSON.stringify(fl));
    const nh = await rd(NIHSS, 'nihss.pdf', 'application/pdf', 'CERT_NIHSS');
    t('v14.4 NIHSS: certificate # by its label (not the footer code), AHA/ASA verifier, group C, no printed expiration', nh.ok && nh.credential_id === 'IPA24Z9QbXY00001' && nh.src === 'aha-asa-nihss' && nh.test_group === 'C' && !nh.expires_on && nh.suggested === '2025-03-07' && !nh.suggested_renewal, JSON.stringify(nh));
    const cc = await rd(CCRN, 'ccrn.pdf', 'application/pdf', 'CERT_CCRN');
    t('v14.4 CCRN: unlabelled 10-digit number read only beside the verification address (not the decoy); Certified through = expiration', cc.ok && cc.credential_id === '1234567890' && cc.holder_name === 'Testa Fakename' && cc.expires_on === '2028-02-28', JSON.stringify(cc));
    // v14.4: experience + skills checklists show calculated dates, never an expiration; checklists are never verified
    const ck = await pg.evaluate(() => {
      const c = { kind: 'SKILLS_ICU', completed: '2025-01-15', primary: 'VERIFIED', prov: { active: true } };
      $('kindSearchV82').value = catalogKind('SKILLS_ICU').label; v81SyncAddForm();
      const form = [$('dtRowV144').classList.contains('hidden'), !$('skillsRowV144').classList.contains('hidden')];
      $('kindSearchV82').value = ''; v81SyncAddForm();
      return { redo: skillsRedoBy('2025-01-15'), recent: experienceRecentUntil('2025-01-15'), badge: verificationBadge(c).text, per: evaluateSkills({ skills: { perAssignment: true } }, c, { id: 'x' }).status, form };
    });
    t('v14.4 checklist: completed + suggested redo (calculated), per-assignment rule, self-attested badge; experience counts-as-recent date', ck.redo === '2026-01-15' && ck.recent === '2027-01-15' && /NOT VERIFIED/.test(ck.badge) && ck.per === 'NEEDS_REVIEW' && ck.form.every(Boolean), JSON.stringify(ck));
    // ---- account UI through the in-page fake backend ----
    await pg.evaluate(FAKE);
    const id = await pg.evaluate(async b => {
      const f = new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], 'BLS- exp 6-2028.pdf', { type: 'application/pdf' });
      const id = __fakeSeed({ kind: 'CERT_BLS', type_code: 'CERT_BLS', display_name: 'BLS — Basic Life Support', expires_on: '2028-05-08', jurisdiction_code: null }, f);
      await store.account.hydrate(); acctShow('acctPassportV10'); return id;
    }, PDF);
    await pg.waitForTimeout(300);
    /* v14.8 P0 (safety stops): the document reader no longer fills anything. These checks replace the
       v14.4–v14.7 prefill checks ("Re-scan document", "from document, check it", scope "from document",
       verifier "Read the document on this device" / date preferred from the document) with their inverse. */
    const FINAL = ['clear', 'blocked', 'unreadable', 'unsupported', 'error'];
    const screenDone = () => pg.waitForFunction(f => { const b = document.getElementById('acctScreenBoxV148'); return b && f.includes(b.dataset.state); }, FINAL, { timeout: 120000 });
    t('v14.8 no "Re-scan document" on saved credentials (the reader never fills a saved credential)', await pg.evaluate(id => !document.querySelector(`[data-act="doc-rescan"][data-id="${id}"]`) && !document.getElementById('acctScanBoxV14'), id));
    await pg.evaluate(() => { acctRenderAll(); document.querySelector('[data-act="toggle-add"]').click(); });
    await pg.waitForSelector('#acctKindV10'); await pg.selectOption('#acctKindV10', 'CERT_CCRN');
    await pg.setInputFiles('#acctFileV10', { name: 'ccrn.pdf', mimeType: 'application/pdf', buffer: Buffer.from(CCRN, 'base64') });
    await screenDone();
    const pf = await pg.evaluate(() => ({ exp: $('acctExpV10').value, src: $('acctExpSrcV144').innerText, box: $('acctScreenBoxV148').innerText, st: $('acctScreenBoxV148').dataset.state, form: $('acctAddFormV10').innerText }));
    t('v14.8 add form: the expiration is NOT pre-filled from the document; no read-back values; the box says to type details as printed', pf.exp === '' && !/from document/.test(pf.src) && !/1234567890|2028-02-28|Feb 28, 2028/.test(pf.form) && /type them exactly as printed/.test(pf.box), JSON.stringify({ exp: pf.exp, src: pf.src, st: pf.st }));
    await pg.evaluate(() => { acctScreenReset(); acctRenderAll(); });
    const upl = async (b, n) => { await pg.setInputFiles('#acctFileV10', { name: n, mimeType: 'application/pdf', buffer: Buffer.from(b, 'base64') }); await pg.waitForTimeout(150); await screenDone(); await pg.waitForTimeout(150); };
    await pg.evaluate(() => { acct().cache.profile.home_jurisdiction = 'US-ME'; document.querySelector('[data-act="toggle-add"]').click(); });
    await pg.waitForSelector('#acctKindV10'); await pg.selectOption('#acctKindV10', 'RN_LICENSE'); await pg.selectOption('#acctJurV10', 'US-MI');
    await upl(LMI, 'mi.pdf');
    const l1 = await pg.evaluate(() => ({ opts: [...$('acctKindV10').options].filter(o => /^RN_LICENSE/.test(o.value)).map(o => o.textContent), fixed: !$('acctLicScopeFixedV145').classList.contains('hidden'), choice: !$('acctLicScopeChoiceV145').classList.contains('hidden'), note: $('acctLicenseNoteV10').innerText, exp: $('acctExpV10').value }));
    t('v14.5 one "RN License" type; Michigan → single-state automatically (no choice); text about Michigan; v14.8: expiration not pre-filled', l1.opts.join() === 'RN License' && l1.fixed && !l1.choice && /This license is from Michigan, so it covers Michigan only/.test(l1.note) && !/Maine is a compact state/.test(l1.note) && l1.exp === '', JSON.stringify(l1));
    await pg.selectOption('#acctJurV10', 'US-TX'); await pg.evaluate(() => { acct().cache.profile.home_jurisdiction = 'US-TX'; acctLicenseNote(); });
    await upl(LTX, 'tx.pdf');
    const l2 = await pg.evaluate(() => ({ choice: !$('acctLicScopeChoiceV145').classList.contains('hidden'), checked: (document.querySelector('input[name=acctLicTypeV10]:checked') || {}).value || null, src: $('acctLicScopeSrcV145').innerText, exp: $('acctExpV10').value }));
    t('v14.8 Texas license with printed multistate: the scope is NOT pre-filled from the document or the home state; the nurse chooses', l2.choice && l2.checked === null && !/from document/.test(l2.src) && /Choose the scope printed on your license/.test(l2.src) && l2.exp === '', JSON.stringify(l2));
    await pg.selectOption('#acctKindV10', 'CERT_NIHSS'); await pg.waitForTimeout(200);
    await upl(LNIH, 'nihss.pdf');
    const l3 = await pg.evaluate(() => ({ exp: $('acctExpV10').value, src: $('acctExpSrcV144').innerText, sug: !!$('acctScanSuggestV144') }));
    t('v14.8 NIHSS with no printed expiration: nothing filled, no "not printed" claim, no suggested date', l3.exp === '' && !/not printed/.test(l3.src) && !l3.sug, JSON.stringify(l3));
    await pg.evaluate(() => { acct().cache.profile.home_jurisdiction = 'US-CA'; acctScreenReset(); acctRenderAll(); });
    await pg.evaluate(() => document.querySelector('.acctTab[data-target="acctVerifyV12"]').click());
    await pg.waitForFunction(id => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), id, { timeout: 30000 });
    await pg.evaluate(id => document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`).click(), id);
    await pg.waitForSelector('#acctVerifyFormV12[data-mode="registry"]');
    const vf = await pg.evaluate(() => ({ exp: document.getElementById('acctVerifyExpV13').value, ref: document.getElementById('acctVerifyRefV12').value, note: document.getElementById('acctVerifyExpNoteV14').innerText, reader: !!document.getElementById('acctVReadV14'), aha: !!document.getElementById('acctOpenAhaV14'), side: document.documentElement.scrollWidth <= window.innerWidth + 1 }));
    t('v14.8 verifier: expiration and reference start empty; the nurse\'s date is shown beside the field for comparison only', vf.exp === '' && vf.ref === '' && /nurse entered/.test(vf.note) && /May 8, 2028/.test(vf.note), JSON.stringify(vf));
    t('v14.8 verifier: no on-device reader; AHA eCards lookup link offered', !vf.reader && vf.aha, JSON.stringify(vf));
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
    /* v14.8: saved credentials have no re-scan; the add form's on-device safety check degrades instead */
    const screenIn = async (b, n, ty) => { await pg.evaluate(() => { acctScreenReset(); acctRenderAll(); const w = $('acctAddWrapV10'); if (w.classList.contains('hidden')) document.querySelector('[data-act="toggle-add"]').click(); }); await pg.waitForSelector('#acctKindV10'); await pg.selectOption('#acctKindV10', 'CERT_BLS'); await pg.setInputFiles('#acctFileV10', { name: n, mimeType: ty, buffer: Buffer.from(b, 'base64') }); await pg.waitForFunction(() => { const x = document.getElementById('acctScreenBoxV148'); return x && ['clear', 'blocked', 'unreadable', 'unsupported', 'error'].includes(x.dataset.state); }); return pg.evaluate(() => ({ st: $('acctScreenBoxV148').dataset.state, txt: $('acctScreenBoxV148').innerText, exp: $('acctExpV10').value })); };
    const img = await screenIn(PNG, 'nihss.png', 'image/png');
    t('no WebAssembly: image gets a friendly message; the nurse types the details; nothing blocked or filled', ['unsupported', 'unreadable', 'error'].includes(img.st) && /type them exactly as printed/i.test(img.txt) && !RAW.test(img.txt) && img.exp === '', JSON.stringify(img));
    const pdf = await screenIn(PDF, 'bls.pdf', 'application/pdf');
    t('PDF reader cannot load: friendly message, no raw JS error; the nurse types the details', ['error', 'unreadable', 'unsupported'].includes(pdf.st) && /type them exactly as printed/i.test(pdf.txt) && !RAW.test(pdf.txt) && pdf.exp === '', JSON.stringify(pdf));
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
