/* v14.2: Training Center ID vs eCard code, and per-word OCR confidence.
   A  parser units (Node): label layouts, TC ID / Instructor ID never become the
      eCard code, RQI letter codes are not "digit-fixed", missing code message,
      TC ID typed as the code is flagged, confidence from word confidences.
   B  rendered synthetic cards (p142-fixtures.js) read on-device in headless
      Chrome: text PDF, clean scanned PDF, clean PNG, phone photo.
   C  account UI on a phone with the in-page fake backend (p14-fake.js): the
      nurse's scan box and the verifier's assisted AHA lookup.
   Run: BASE=http://localhost:8765/ node backend/tests/p142.js */
const fs = require('fs');
const EXPOK = () => { const r = document.getElementById('acctExpDateRowV10'), cb = document.getElementById('acctExpOkV147'); if (r && cb && !r.classList.contains('hidden') && !expConfirmValid('acct')) cb.click(); }; /* v14.7: the nurse confirms the expiration */
const BASE = process.env.BASE || 'http://localhost:8765/';
const R = [];
const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (i !== '' && i != null ? ' — ' + String(i).slice(0, 300) : ''); R.push(l); console.log(l); };
const W = ms => new Promise(r => setTimeout(r, ms));

function partA() {
  global.CREDENTIAL_CATALOG = global.CREDENTIAL_CATALOG || [];
  const D = require('../../js/doc-extract.js');
  const P = (t, o = {}) => D.parseCardText(t, { kind: 'CERT_BLS', ...o });
  const head = 'AMERICAN HEART ASSOCIATION\nBLS Provider\nTesta Fakename\nhas successfully completed the cognitive and skills evaluations\nIssue Date 06/03/2026\nRecommended Renewal Date 06/2028\n';
  const L = {
    table: head + 'Training Center Name   Example Valley Training Center\nTraining Center ID   CA00001\nTC City, State   Nowhere, CA\nTraining Site Name   Example Site\nInstructor Name   Example Instructor\nInstructor ID   02150000099\neCard Code   261100000017',
    header: head + 'Training Center ID   Instructor ID   eCard Code\nCA00001   02150000099   261100000017',
    headerMerged: head + 'Training Center ID Instructor ID eCard Code\nCA00001 02150000099 261100000017',
    codeFirst: head + 'eCard Code   TC ID #\n261100000017   CA00001',
    tcOnly: head + 'Training Center Name Example TC\nTC ID # CA00001\nInstructor ID 02150000099',
    tcOnlyLabelledAsCode: head + 'Training Center ID CA00009\neCard Code CA00009',
    sepLine: head + 'Training Center ID\nCA00001\neCard Code\n261100000017',
    rqi: head.replace('AMERICAN HEART ASSOCIATION', 'AMERICAN HEART ASSOCIATION RQI HeartCode Complete') + 'TC ID CA00001\neCard Code\nB7KQ2M4X9TR3SZ8GH5',
    instrOnly: head + 'Instructor ID 261100000099',
    bareCode: head + 'TC ID CA00001\n261100000017'
  };
  const r = Object.fromEntries(Object.entries(L).map(([k, t]) => [k, P(t)]));
  const code = k => r[k].fields.credential_id && r[k].fields.credential_id.value;
  const tc = k => r[k].fields.training_center_id && r[k].fields.training_center_id.value;
  ok('A1 table rows: eCard code and Training Center ID read as separate fields', code('table') === '261100000017' && tc('table') === 'CA00001' && r.table.fields.training_center.value === 'Example Valley Training Center', JSON.stringify([code('table'), tc('table'), r.table.fields.training_center?.value]));
  ok('A2 header row (TC ID first, Munib\'s layout): eCard code is the value under "eCard Code", not CA00001', code('header') === '261100000017' && tc('header') === 'CA00001' && r.header.issuer === 'AHA', JSON.stringify([code('header'), tc('header'), r.header.issuer]));
  ok('A3 header row with columns merged by OCR (single spaces)', code('headerMerged') === '261100000017' && tc('headerMerged') === 'CA00001', JSON.stringify([code('headerMerged'), tc('headerMerged')]));
  ok('A4 eCard Code column before TC ID #', code('codeFirst') === '261100000017' && tc('codeFirst') === 'CA00001', JSON.stringify([code('codeFirst'), tc('codeFirst')]));
  ok('A5 only a TC ID → no eCard code, clear message, source stays AHA eCards (not RQI)', !code('tcOnly') && tc('tcOnly') === 'CA00001' && r.tcOnly.notes.credential_id === D.ECARD_NOT_FOUND && r.tcOnly.source.id === 'aha-ecards', JSON.stringify([code('tcOnly'), r.tcOnly.notes, r.tcOnly.source]));
  ok('A6 a TC-ID-shaped value (2 letters + 5 digits) is never taken as the eCard code, even under an eCard label', !code('tcOnlyLabelledAsCode') && tc('tcOnlyLabelledAsCode') === 'CA00009', JSON.stringify([code('tcOnlyLabelledAsCode')]));
  ok('A7 eCard code on its own line under the label', code('sepLine') === '261100000017' && tc('sepLine') === 'CA00001', JSON.stringify([code('sepLine'), tc('sepLine')]));
  ok('A8 RQI letters-and-digits code kept as printed (no I/O/S/B/Z "digit fixing") → RQI source', code('rqi') === 'B7KQ2M4X9TR3SZ8GH5' && r.rqi.source.id === 'aha-rqi', JSON.stringify([code('rqi'), r.rqi.source]));
  ok('A9 an Instructor ID is never used as the eCard code (even if it has 12 digits)', !code('instrOnly'), JSON.stringify(code('instrOnly')));
  ok('A10 a bare 12-digit AHA code on its own line is still found (pattern, lower confidence)', code('bareCode') === '261100000017' && r.bareCode.fields.credential_id.how === 'pattern', JSON.stringify(r.bareCode.fields.credential_id));
  const cmp = (cid, extra = {}) => D.compareToEntered({ credential_id: cid, renew_by: '2028-06', issued_on: '2026-06-03' }, { kind: 'CERT_BLS', expires_on: '2028-06-30', issuer: 'AHA', ...extra });
  const w1 = cmp('CA00009'), w2 = cmp('261100000017', { trainingCenterId: 'CA00001' }), w3 = cmp('X1234567', { trainingCenterId: 'X1234567' });
  ok('A11 typing the Training Center ID as the eCard code is flagged; a real code is not', w1.some(m => m.field === 'credential_id' && /Training Center ID/.test(m.text)) && !w2.some(m => m.field === 'credential_id') && w3.some(m => m.field === 'credential_id'), JSON.stringify(w1.map(m => m.text)));
  ok('A12 Training Center ID is informational: not in the logged field list', !r.table.fieldsWanted.includes('training_center_id') && r.table.infoFields.includes('training_center_id') && !D.FIELDS.includes('training_center_id'), JSON.stringify(r.table.fieldsWanted));
  // confidence from word confidences
  const words = (txt, c) => txt.split('\n').map(l => l.split(' ').filter(Boolean).map((t, i) => ({ t, c: typeof c === 'function' ? c(t) : c, x0: i * 100, x1: i * 100 + 80, h: 20 })));
  const card = 'AMERICAN HEART ASSOCIATION\nBLS Provider\nMunib Fakename\nhas successfully completed the course\nIssue Date 06/03/2026\nRecommended Renewal Date 06/2028\neCard Code 261100000017';
  const hi = P('', { method: 'PDF_OCR', ocrConf: 87, ocrLines: words(card, 0.95) }).fields;
  ok('A13 clean OCR (word confidence 95): issue date, renewal and course reach high (≥90%)', hi.issued_on.conf >= 0.9 && hi.renew_by.conf >= 0.9 && hi.course.conf >= 0.9 && hi.holder_name.conf >= 0.9, JSON.stringify({ i: hi.issued_on.conf, r: hi.renew_by.conf, c: hi.course.conf, n: hi.holder_name.conf }));
  const smudge = P('', { method: 'PDF_OCR', ocrConf: 87, ocrLines: words(card, t => /\d/.test(t) ? 0.55 : 0.95) }).fields;
  ok('A14 smudged digits (word confidence 55) stay low on the dates', smudge.issued_on.conf < 0.7 && smudge.renew_by.conf < 0.7 && smudge.holder_name.conf >= 0.9, JSON.stringify({ i: smudge.issued_on.conf, r: smudge.renew_by.conf }));
  const amb = P('Example Board\nCCRN\nName: Testa Fakename\nCertification Number 12345678\nEffective Date 04/05/2026\nExpiration Date 04/05/2029', { kind: 'CERT_CCRN', method: 'PDF_TEXT' }).fields;
  const sure = P('Example Board\nCCRN\nName: Testa Fakename\nCertification Number 12345678\nEffective Date 04/25/2026\nExpiration Date 04/25/2029', { kind: 'CERT_CCRN', method: 'PDF_TEXT' }).fields;
  ok('A15 day/month could be swapped (04/05) → "check it"; 04/25 → high', amb.issued_on && amb.issued_on.conf < 0.9 && /swapped/.test(amb.issued_on.how) && sure.issued_on.conf >= 0.9, JSON.stringify({ amb: amb.issued_on, sure: sure.issued_on && sure.issued_on.conf }));
  const txt = P(card, { method: 'PDF_TEXT' }).fields;
  ok('A16 text-layer PDF stays near-certain (≥0.98)', ['issued_on', 'renew_by', 'course', 'credential_id', 'holder_name'].every(k => txt[k] && txt[k].conf >= 0.98), JSON.stringify(Object.fromEntries(Object.entries(txt).map(([k, x]) => [k, x.conf]))));
  const nlText = 'AMERICAN HEART ASSOCIATION\nBLS Provider\nMunib Fakename\nhas successfully completed the course\nExample Program\n06/03/2026\nExample Program\n06/2028';
  const nolab = P('', { method: 'PDF_OCR', ocrConf: 87, ocrLines: words(nlText, 0.95) }).fields;
  // v14.3: two-column card, label above value, read by word positions (synthetic boxes)
  const G = [];
  const put = (t, x, y, c = 0.95) => { let cx = x; for (const w of t.split(' ')) { G.push({ t: w, c, x0: cx, x1: cx + w.length * 9, y0: y, y1: y + 20 }); cx += w.length * 9 + 8; } };
  put('BLS Provider', 140, 160); put('Testa Fakename', 350, 290); put('has successfully completed the cognitive and skills evaluations', 160, 320);
  put('Issue Date', 190, 410); put('Renew By', 525, 410); put('6/3/2026', 205, 440, 0.92); put('06/2028', 540, 440);
  put('Training Center Name', 150, 470); put('Instructor Name', 500, 478); put('Example Permanente Education', 152, 500); put('Example Teacher', 515, 508);
  put('Instructor ID', 515, 538); put('Training Center ID', 163, 548); put('24000000017', 525, 560); put('CA00002', 205, 572);
  put('eCard Code', 520, 586); put('Training Center City, State', 132, 596); put('271100000056', 522, 608); put('Nowhere, CA', 190, 620);
  /* OCR line order on such a card is scrambled: hand the parser the lines as OCR grouped them */
  const lines2 = []; const byLine = {}; G.forEach(w => { const k = Math.round(w.y0 / 10); (byLine[k] = byLine[k] || []).push(w); }); Object.keys(byLine).sort((a, b) => a - b).forEach(k => lines2.push(byLine[k].sort((a, b) => a.x0 - b.x0)));
  const two = P('', { method: 'PDF_OCR', ocrConf: 88, ocrLines: lines2 });
  const tf = k => two.fields[k] && two.fields[k].value;
  ok('A18 two-column card (label above value): eCard code, TC ID = CA-pattern, Instructor ID kept out, TC name not merged with the instructor', tf('credential_id') === '271100000056' && tf('training_center_id') === 'CA00002' && tf('training_center') === 'Example Permanente Education' && !JSON.stringify(two.fields).includes('24000000017'), JSON.stringify({ code: tf('credential_id'), tc: tf('training_center_id'), name: tf('training_center') }));
  const y27 = D.compareToEntered({ credential_id: '271100000056', issued_on: '2026-06-03', renew_by: '2028-06' }, { kind: 'CERT_BLS', expires_on: '2028-06-30', issuer: 'AHA' });
  ok('A19 a 2026 card whose eCard code starts with 27 is not flagged (real cards do this)', !y27.some(m => m.field === 'credential_id') && !two.warnings.some(w => /issue year/.test(w)), JSON.stringify(y27));
  /* v14.8 P0: a date without its label is no longer guessed at all (was: read with a lower score) */
  ok('A17 the same date without its label is not read (v14.8) — never scores as high as with it', !nolab.issued_on || nolab.issued_on.conf < hi.issued_on.conf, JSON.stringify({ nolabel: nolab.issued_on && nolab.issued_on.conf, label: hi.issued_on.conf }));
}

async function partB(browser) {
  const { generate } = require('./p142-fixtures.js');
  const cases = await generate(browser);
  const pg = await browser.newPage();
  await pg.goto(BASE, { waitUntil: 'networkidle2' });
  const rows = [];
  for (const c of cases) {
    const r = await pg.evaluate(async (b64, name, mime) => {
      const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const res = await DocExtract.extractFromFile(new File([bin], name, { type: mime }), { kind: 'CERT_BLS', profileName: 'Testa Fakename' });
      return { m: res.method, src: res.source && res.source.id, notes: res.notes, f: Object.fromEntries(Object.entries(res.fields).map(([k, x]) => [k, { v: x.value, c: x.conf }])) };
    }, fs.readFileSync(c.file).toString('base64'), c.id, c.mime);
    const got = k => r.f[k] && r.f[k].v;
    const right = ['holder_name', 'course', 'issued_on', 'renew_by', 'training_center_id', 'credential_id', ...(c.truth.training_center ? ['training_center'] : [])].every(k => (got(k) || null) === c.truth[k]);
    const neverTc = got('credential_id') !== c.tcId && got('credential_id') !== c.instrId;
    const highDates = !c.clean || (r.f.issued_on && r.f.issued_on.c >= 0.9 && r.f.renew_by && r.f.renew_by.c >= 0.9 && r.f.course && r.f.course.c >= 0.9);
    const msg = c.code ? true : (r.notes && /eCard code not found/.test(r.notes.credential_id || ''));
    const src = r.src === (c.rqi ? 'aha-rqi' : 'aha-ecards');
    rows.push({ c, r, right, neverTc, highDates, msg, src });
    ok(`B ${c.id.padEnd(30)} ${c.variant}: fields right, eCard ≠ TC/Instructor ID, ${c.clean ? 'dates+course ≥90%, ' : ''}source ${c.rqi ? 'RQI' : 'AHA eCards'}`, right && neverTc && highDates && msg && src,
      JSON.stringify({ code: got('credential_id'), tc: got('training_center_id'), i: r.f.issued_on && +r.f.issued_on.c.toFixed(2), rn: r.f.renew_by && +r.f.renew_by.c.toFixed(2), co: r.f.course && +r.f.course.c.toFixed(2), src: r.src, note: r.notes && r.notes.credential_id }));
  }
  await pg.close();
  ok('B summary: TC ID never read as the eCard code on any of the ' + rows.length + ' synthetic cards', rows.every(x => x.neverTc), rows.filter(x => !x.neverTc).map(x => x.c.id).join());
  return cases;
}

async function partC(browser, cases) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await pg.goto(BASE, { waitUntil: 'networkidle2' });
  const tap = async sel => { await pg.waitForSelector(sel, { timeout: 15000 }); await pg.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await W(120); await pg.evaluate(s => document.querySelector(s).click(), sel); };
  const waitScan = () => pg.waitForFunction(() => { const b = document.getElementById('acctScanBoxV14'); return b && ['done', 'error', 'unsupported'].includes(b.dataset.state); }, { timeout: 90000 });
  const setVal = (id, v) => pg.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, id, v);
  await pg.evaluate(require('./p14-fake.js'));
  const file = id => cases.find(c => c.id === id).file;
  const b64 = id => fs.readFileSync(file(id)).toString('base64');
  const seeded = await pg.evaluate(async (h, o) => {
    const mk = (b, n, t) => new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], n, { type: t });
    const hdr = __fakeSeed({ kind: 'CERT_BLS', type_code: 'CERT_BLS', display_name: 'BLS — header layout', expires_on: '2028-06-30', jurisdiction_code: null }, mk(h, 'bls-header.pdf', 'application/pdf'));
    const only = __fakeSeed({ kind: 'CERT_BLS', type_code: 'CERT_BLS', display_name: 'BLS — TC ID only', expires_on: '2028-06-30', jurisdiction_code: null }, mk(o, 'bls-tc-only.pdf', 'application/pdf'));
    await store.account.hydrate(); acctShow('acctPassportV10'); return { hdr, only };
  }, b64('tc-header-scanned-clean.pdf'), b64('tc-only-text.pdf'));
  await W(300);
  // nurse: add a BLS with a card that only shows the TC ID
  await tap('[data-act="toggle-add"]'); await W(200);
  await pg.select('#acctKindV10', 'CERT_BLS'); await setVal('acctExpV10', '2028-06-30');
  await (await pg.$('#acctFileV10')).uploadFile(file('tc-only-clean.png'));
  await pg.waitForSelector('#acctScanBoxV14[data-state="scanning"]', { timeout: 10000 }).catch(() => {}); await waitScan();
  const n1 = await pg.evaluate(() => ({ v: acctScan.values, lbl: [...document.querySelectorAll('#acctScanBoxV14 .scan-lbl-v14')].map(x => x.textContent.trim()), note: document.getElementById('acctScanNote-credential_id')?.textContent || '', info: document.getElementById('acctScanInfo-training_center_id')?.innerText || '', chips: document.querySelectorAll('#acctScanBoxV14 .conf-v14').length, wanted: acctScan.res.fieldsWanted.length }));
  ok('C1 nurse: eCard code left empty with "eCard code not found. Type it from your card; it\'s needed for AHA verification."', n1.v.credential_id === '' && /eCard code not found\. Type it from your card; it's needed for AHA verification\./.test(n1.note), JSON.stringify({ v: n1.v.credential_id, note: n1.note }));
  ok('C2 nurse: Training Center ID shown separately as "not used for verification"; ID label is "eCard code" (not RQI)', /Training Center ID/.test(n1.info) && /CA00001/.test(n1.info) && /Not used for verification/.test(n1.info) && n1.lbl.some(l => /^eCard code/.test(l)) && !n1.lbl.some(l => /RQI/.test(l)), JSON.stringify(n1));
  ok('C3 nurse: every needed field still shows one confidence chip', n1.chips === n1.wanted, n1.chips + '/' + n1.wanted);
  await setVal('acctScanF-credential_id', 'CA00001'); await W(150);
  const n2 = await pg.evaluate(() => document.getElementById('acctScanMismatchBoxV14')?.innerText || '');
  ok('C4 nurse: typing the TC ID into the eCard code box is flagged', /looks like the Training Center ID/.test(n2), n2.replace(/\s+/g, ' ').slice(0, 160));
  await setVal('acctScanF-credential_id', '261100000041'); await W(150);
  ok('C5 nurse: a real eCard code clears that note', !/looks like the Training Center ID/.test(await pg.evaluate(() => document.getElementById('acctScanMismatchBoxV14')?.innerText || '')));
  await tap('#acctScanConfirmV14'); await pg.evaluate(EXPOK); await tap('#acctAddFormV10 button[type=submit]');
  await pg.waitForFunction(() => !document.body.classList.contains('acct-busy-v10'), { timeout: 60000 });
  const saved = await pg.evaluate(() => { const c = __fakeDb.credentials.filter(x => x.kind === 'CERT_BLS').pop(); const xe = __fakeDb.extraction_events.filter(e => e.credential_id === c.id); return { doc: c.metadata.doc, xe, leak: JSON.stringify([c.metadata, xe, __fakeDb.audit_events.map(e => e.detail)]) }; });
  ok('C6 saved: extraction event accepted by the field-name rule (no training_center_id), no values on the server', saved.xe.length === 1 && !saved.xe[0].fields_expected.includes('training_center_id') && !/CA00001|261100000041|Testa/.test(saved.leak), JSON.stringify(saved.xe[0] && saved.xe[0].fields_expected));
  // verifier: header-layout scanned PDF → assisted AHA lookup uses the eCard code
  await tap('.acctTab[data-target="acctVerifyV12"]'); await W(300);
  await pg.waitForFunction(id => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), { timeout: 20000 }, seeded.hdr);
  await tap(`.acct-verify-pick-v12[data-id="${seeded.hdr}"]`);
  await pg.waitForSelector('#acctVerifyFormV12[data-mode="registry"]', { timeout: 15000 });
  await tap('#acctVReadV14'); await pg.waitForSelector('#acctCopyCodeV14', { timeout: 90000 });
  const v1 = await pg.evaluate(() => ({ ref: document.getElementById('acctVerifyRefV12').value, copy: document.getElementById('acctCopyCodeV14').dataset.code, tc: document.getElementById('acctVTcIdV142')?.innerText || '', sel: document.getElementById('acctVerifySourceIdV13').value, aha: !!document.getElementById('acctOpenAhaV14'), box: document.getElementById('acctDocBoxV14').innerText }));
  ok('C7 verifier: reference and Copy use the eCard code (261100000025), never the TC ID; AHA eCards preselected', v1.ref === '261100000025' && v1.copy === '261100000025' && v1.sel === 'aha-ecards' && v1.aha && !/RQI code/.test(v1.box), JSON.stringify({ ref: v1.ref, copy: v1.copy, sel: v1.sel }));
  ok('C8 verifier: Training Center ID shown for context, marked not used for verification', /CA00001/.test(v1.tc) && /Not used for verification/.test(v1.tc), v1.tc);
  // verifier: TC-ID-only card → no code, clear message, reference left empty
  await pg.evaluate(() => { acctVerifyRows = null; acctVScan = null; acctRenderVerify(); }); await W(300);
  await pg.waitForFunction(id => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), { timeout: 20000 }, seeded.only);
  await tap(`.acct-verify-pick-v12[data-id="${seeded.only}"]`);
  await pg.waitForSelector('#acctVerifyFormV12[data-mode="registry"]', { timeout: 15000 });
  await tap('#acctVReadV14'); await pg.waitForSelector('#acctVNoCodeV142', { timeout: 90000 });
  const v2 = await pg.evaluate(() => ({ ref: document.getElementById('acctVerifyRefV12').value, msg: document.getElementById('acctVNoCodeV142').innerText, copy: !!document.getElementById('acctCopyCodeV14') }));
  ok('C9 verifier: card with only a TC ID → "eCard code not found" message, nothing prefilled, no Copy button', v2.ref === '' && !v2.copy && /eCard code not found/.test(v2.msg) && /Training Center ID can't be used/.test(v2.msg), JSON.stringify(v2));
  ok('C10 no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

(async () => {
  partA();
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  try { const cases = await partB(browser); await partC(browser, cases); }
  finally { await browser.close(); }
  const pass = R.filter(l => l.startsWith('PASS')).length, fail = R.filter(l => l.startsWith('FAIL')).length;
  console.log(`\np142: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
