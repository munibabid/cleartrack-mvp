/* PR 14: on-device document extraction, mismatch checks, per-kind source
   routing, assisted AHA verification, extraction accuracy.
   Part A (always, headless phone browser, no network beyond this site):
     A1 catalog walk: every credential kind routes to an appropriate source
        (licenses → board/Nursys only; certifications → their issuing body;
        Nursys never for non-licenses; AHA only for BLS/ACLS/PALS (+ the
        AHA/ASA NIHSS program); employer/vendor/self-attestation otherwise),
        every kind gets a document profile, and every kind gets the
        document-date vs entered-date check.
     A2 parser unit cases (the 06/2028 vs May 8 case, RQI letters, Red Cross,
        NIHSS, license state/multistate, course and name mismatches).
     A3 benchmark on the synthetic documents (all kinds, all variants).
     A4 the account UI against an in-page fake backend (p14-fake.js): scan
        progress, fields with confidence, mismatch + "Use the date from the
        document", private record keeps nothing, re-scan of a saved
        credential, verifier form with the AHA source, double-check, and the
        accuracy panels. Asserts nothing leaves the page during scans.
   Part B (only when the staging database is reachable): migration 9
     present, RLS on extraction_events with throwaway users; Munib unchanged.
   Run: BASE=http://localhost:8765/ node backend/tests/p14.js */
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const EXPOK = () => { const r = document.getElementById('acctExpDateRowV10'), cb = document.getElementById('acctExpOkV147'); if (r && cb && !r.classList.contains('hidden') && !expConfirmValid('acct')) cb.click(); }; /* v14.7: the nurse confirms the expiration */
const BASE = process.env.BASE || 'http://localhost:8765/';
const SH = process.env.SH || '/workspace/pr14-shots/';
const FIX = '/tmp/p14-fixtures';
const VERSION = 'v14.7 demo';
const W = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (i !== '' && i != null ? ' — ' + String(i).slice(0, 300) : ''); R.push(l); console.log(l); };
const step = m => { if (process.env.P14_DEBUG) console.log('  · ' + m); };
const skip = (n, why) => { const l = 'SKIP ' + n + ' — ' + why; R.push(l); console.log(l); };

async function phone(browser) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [], reqs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('dialog', d => d.accept());
  pg.on('request', r => reqs.push(r.url()));
  await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await pg.goto(BASE, { waitUntil: 'networkidle2' });
  return { pg, errs, reqs, ctx };
}

async function partA1(pg) {
  ok('site shows ' + VERSION, await pg.evaluate(v => document.documentElement.textContent.includes(v), VERSION));
  const walk = await pg.evaluate(() => {
    const out = [];
    for (const k of CREDENTIAL_CATALOG) {
      const jur = k.jurisdiction ? 'US-CA' : '';
      const srcs = sourcesForCredential(k.kind, jur), route = primaryRouteFor(k.kind, jur);
      const prof = DocExtract.profileFor(k.kind);
      const lic = RN_LICENSE_KINDS.includes(k.kind);
      const ids = srcs.map(s => s.id), types = srcs.map(s => s.type);
      const problems = [];
      if (!route) problems.push('no route');
      if (lic) { if (!srcs.every(s => s.type === 'LICENSING_BOARD' || /^nursys/.test(s.id))) problems.push('license has non-board source ' + ids); if (!(route.type === 'LICENSING_BOARD' || /^nursys/.test(route.id))) problems.push('license route ' + route.id); }
      else { if (ids.some(id => /nursys/.test(id)) || types.includes('LICENSING_BOARD')) problems.push('Nursys/board offered for a non-license: ' + ids); }
      const aha = ids.filter(id => /^aha-/.test(id));
      if (['CERT_BLS', 'CERT_ACLS', 'CERT_PALS'].includes(k.kind)) { if (route.id !== 'aha-ecards' || !ids.includes('aha-rqi') || !ids.includes('redcross-certificate')) problems.push('BLS/ACLS/PALS route ' + route.id + ' ' + ids); }
      else if (k.kind === 'CERT_NIHSS') { if (aha.some(id => id !== 'aha-asa-nihss')) problems.push('NIHSS AHA ' + aha); }
      else if (aha.length) problems.push('AHA source on ' + k.kind + ': ' + aha);
      if (k.category === 'Certifications' && route.type !== 'CERTIFYING_BODY') problems.push('certification routed to ' + route.id + ' (' + route.type + ')');
      if (k.category === 'Certifications' && !route.kinds.includes(k.kind)) problems.push('route does not list the kind');
      if (/^(EMP|COMP|REF)_/.test(k.kind) && route.id !== 'employer-hr') problems.push('employer kind route ' + route.id);
      if (/^SCREEN_/.test(k.kind) && route.id !== 'screening-vendor') problems.push('screening route ' + route.id);
      if (/^SKILLS_/.test(k.kind) && !['document-review', 'self-attestation'].includes(route.id)) problems.push('skills route ' + route.id);
      if (k.privacy === 'PRIVATE' && prof !== 'dates_only') problems.push('private kind profile ' + prof);
      if (/^SKILLS_/.test(k.kind) && prof !== 'dates_only') problems.push('skills profile ' + prof);
      if (lic && prof !== 'license') problems.push('license profile ' + prof);
      if (k.category === 'Certifications' && !['cert', 'aha_resus'].includes(prof)) problems.push('cert profile ' + prof);
      // the date check runs for every kind
      /* v14.8 (rewritten): only a printed expiration is compared; a "Renew By" month is never turned into one */
      const m = DocExtract.compareToEntered({ expires_on: '2028-06-30' }, { kind: k.kind, expires_on: '2028-05-08' });
      if (!m.some(x => x.field === 'expires_on' && x.document === '2028-06-30')) problems.push('no date mismatch check');
      if (prof === 'aha_resus' && DocExtract.compareToEntered({ renew_by: '2028-06' }, { kind: k.kind, expires_on: '2028-05-08' }).some(x => x.field === 'expires_on')) problems.push('renew-by treated as an expiration');
      // certification document patterns: the kind's own pattern exists
      if (k.category === 'Certifications' && !DocExtract.kindPattern(k)) problems.push('no document pattern');
      out.push({ kind: k.kind, route: route && route.id, problems });
    }
    return out;
  });
  const bad = walk.filter(w => w.problems.length);
  ok(`catalog walk: all ${walk.length} kinds route to an appropriate source`, bad.length === 0, bad.slice(0, 6).map(b => b.kind + ': ' + b.problems.join('; ')).join(' | '));
  ok('catalog walk covers 200+ kinds', walk.length >= 200, walk.length);
  const spot = Object.fromEntries(walk.filter(w => ['CERT_BLS', 'CERT_NIHSS', 'CERT_NRP', 'CERT_TNCC', 'CERT_ENPC', 'CERT_FETAL_MONITORING', 'CERT_CCRN', 'CERT_PCCN', 'CERT_CEN', 'CERT_C_EFM', 'RN_LICENSE', 'RN_LICENSE_MULTISTATE', 'HEALTH_TB_CURRENT'].includes(w.kind)).map(w => [w.kind, w.route]));
  ok('spot routes: BLS→AHA eCards, NIHSS→APEX, NRP→AAP, TNCC/ENPC→ENA, FHM→AWHONN, CCRN/PCCN→AACN, CEN→BCEN, C-EFM→NCC, licenses→board/Nursys',
    spot.CERT_BLS === 'aha-ecards' && spot.CERT_NIHSS === 'apex-nihss' && spot.CERT_NRP === 'aap-nrp' && spot.CERT_TNCC === 'ena-tncc' && spot.CERT_ENPC === 'ena-enpc' && spot.CERT_FETAL_MONITORING === 'awhonn-fhm' && spot.CERT_CCRN === 'aacn' && spot.CERT_PCCN === 'aacn' && spot.CERT_CEN === 'bcen' && spot.CERT_C_EFM === 'ncc' && /^board-US-CA$/.test(spot.RN_LICENSE) && spot.RN_LICENSE_MULTISTATE === 'nursys-quickconfirm', JSON.stringify(spot));
  const urls = await pg.evaluate(() => ['apex-nihss', 'nihss-plus', 'aap-nrp', 'ena-tncc', 'ena-enpc', 'aha-ecards', 'aha-rqi'].map(id => [id, verificationSource(id)?.lookupUrl || '']));
  ok('NIHSS/NRP/ENA/AHA sources carry their real verification URLs', urls.every(([, u]) => /^https:\/\//.test(u)) && urls.find(u => u[0] === 'apex-nihss')[1].includes('apexinnovations.com/verifyCertificate') && urls.find(u => u[0] === 'aha-rqi')[1].includes('heart.org/RQIverify'), JSON.stringify(urls));
  const lazy = await pg.evaluate(() => ({ t: typeof window.Tesseract, q: typeof window.jsQR, s: [...document.scripts].filter(s => /vendor\/(tesseract|jsqr|pdfjs)/.test(s.src)).length }));
  ok('readers are lazy: nothing loaded before a scan', lazy.t === 'undefined' && lazy.q === 'undefined' && lazy.s === 0, JSON.stringify(lazy));
}

async function partA2(pg) {
  const r = await pg.evaluate(() => {
    const P = (t, kind, o = {}) => DocExtract.parseCardText(t, { kind, ...o });
    const v = res => Object.fromEntries(Object.entries(res.fields).map(([k, x]) => [k, x.value]));
    const out = {};
    // Munib's case: card renews 06/2028, he typed May 8, 2028
    const bls = P('AMERICAN HEART ASSOCIATION\nBLS Provider\nTesta Fakename\nhas successfully completed the cognitive and skills evaluations\n06/12/2026   06/2028\nIssue Date   Recommended Renewal Date\neCard Code 261100000017', 'CERT_BLS');
    out.bls = { v: v(bls), src: bls.source && bls.source.id };
    const rqi = P('American Heart Association\nRQI HeartCode Complete\nACLS Provider\nName: Mock Clinician\nIssue Date 01/15/2026\nRenew By 01/2028\neCard Code AB12CD34EF56', 'CERT_ACLS');
    out.rqi = { src: rqi.source && rqi.source.id, code: rqi.fields.credential_id && rqi.fields.credential_id.value };
    const rc = P('American Red Cross\nAdult and Pediatric First Aid/CPR/AED\nBasic Life Support\nThis certifies that\nImaginary Person\nhas successfully completed\nDate Completed 03/01/2026\nValid for 2 years 03/01/2028\nCertificate ID: 01ABCD2', 'CERT_BLS');
    out.rc = { src: rc.source && rc.source.id, issuer: rc.issuer };
    const acls = P('AMERICAN HEART ASSOCIATION\nACLS Provider\nTesta Fakename\nhas successfully completed\n02/03/2026 02/2028\neCard Code 262200000025', 'CERT_ACLS');
    out.course = DocExtract.compareToEntered(v(acls), { kind: 'CERT_BLS', expires_on: '2028-02-29', profileName: 'Testa Fakename' }).map(x => x.field);
    out.name = DocExtract.compareToEntered(v(bls), { kind: 'CERT_BLS', expires_on: '2028-06-30', profileName: 'Somebody Else' }).map(x => x.field);
    out.nameOk = DocExtract.compareToEntered(v(bls), { kind: 'CERT_BLS', expires_on: '2028-06-30', profileName: 'TESTA FAKENAME' }).map(x => x.field);
    const nih = P('APEX INNOVATIONS\nNIH Stroke Scale Certification\nThis certifies that\nTesta Fakename\nhas successfully completed the NIHSS Group B\nTest ID 99000123\nCompletion Date 03/14/2026\nExpiration Date 03/14/2028', 'CERT_NIHSS');
    out.nih = { v: v(nih), src: nih.source && nih.source.id, m: DocExtract.compareToEntered(v(nih), { kind: 'CERT_NIHSS', expires_on: '2028-03-31', profileName: 'Testa Fakename' }).map(x => x.field) };
    const tnccOnNrp = DocExtract.compareToEntered(v(P('Emergency Nurses Association\nTrauma Nursing Core Course\nSample Q. Notreal\nhas successfully completed\nCourse Date 05/02/2025\nExpiration Date 05/31/2029', 'CERT_NRP')), { kind: 'CERT_NRP', expires_on: '2029-05-31' });
    out.tnccOnNrp = tnccOnNrp.map(x => x.field);
    const lic = P('STATE OF OREGON\nOregon State Board of Nursing\nName: Demo Nurse-Example\nLicense Number: 000999111RN\nSingle-state license\nIssue Date: 01/10/2021\nExpiration Date: 06/30/2027', 'RN_LICENSE_MULTISTATE');
    out.lic = { v: v(lic), src: lic.source && lic.source.id, m: DocExtract.compareToEntered(v(lic), { kind: 'RN_LICENSE_MULTISTATE', expires_on: '2027-06-30', profileName: 'Demo Nurse-Example', jurisdiction: 'US-WA' }).map(x => x.field) };
    const tb = P('Occupational Health\nEmployee Fakey McTestface\nTest Date 04/01/2026\nNext Due 04/01/2027', 'HEALTH_TB_CURRENT');
    out.tb = { profile: tb.profile, keys: Object.keys(tb.fields).sort().join(','), m: DocExtract.compareToEntered(v(tb), { kind: 'HEALTH_TB_CURRENT', expires_on: '2027-01-01', profileName: 'Testa Fakename' }).map(x => x.field) };
    out.never = [bls, nih, lic, tb].every(x => !('verified' in x) && !/verified/i.test(JSON.stringify(x.fields)));
    return out;
  });
  /* v14.8: "06/2028 card vs typed May 8 → expiration mismatch" and "renewal month = end of month" retired:
     a Renew By month is never an expiration (p148 '"Renew By" never becomes the expiration'). */
  ok('BLS card suggests AHA eCards (never Nursys)', r.bls.src === 'aha-ecards', r.bls.src);
  ok('code with letters → AHA RQI', r.rqi.src === 'aha-rqi' && r.rqi.code === 'AB12CD34EF56', JSON.stringify(r.rqi));
  ok('Red Cross certificate → Red Cross source', r.rc.src === 'redcross-certificate' && r.rc.issuer === 'RED_CROSS', JSON.stringify(r.rc));
  ok('ACLS card on a BLS credential → course mismatch', r.course.includes('course'), JSON.stringify(r.course));
  ok('name mismatch flagged; case differences are not', r.name.includes('holder_name') && !r.nameOk.includes('holder_name'), JSON.stringify([r.name, r.nameOk]));
  ok('NIHSS: Test ID, dates, APEX source, date mismatch', r.nih.v.credential_id === '99000123' && r.nih.v.issued_on === '2026-03-14' && r.nih.v.expires_on === '2028-03-14' && r.nih.src === 'apex-nihss' && r.nih.m.includes('expires_on'), JSON.stringify(r.nih));
  ok('TNCC document on an NRP credential → course mismatch', r.tnccOnNrp.includes('course'), JSON.stringify(r.tnccOnNrp));
  ok('license: number, state, single-state; state and multistate mismatches; board/Nursys source', r.lic.v.credential_id === '000999111RN' && r.lic.v.jurisdiction === 'US-OR' && r.lic.v.multistate === 'single-state' && r.lic.m.includes('jurisdiction') && r.lic.m.includes('multistate') && /^(nursys|board-)/.test(r.lic.src), JSON.stringify(r.lic));
  ok('private TB record: dates only, date check still runs', r.tb.profile === 'dates_only' && r.tb.keys === 'expires_on,issued_on' && r.tb.m.includes('expires_on') && !r.tb.m.includes('holder_name'), JSON.stringify(r.tb));
  /* v14.8: "OCR digit fixes in codes" retired: identifiers are never transformed (p148 'no O/0, I/1, L swaps', 'repair helpers are gone'). */
  ok('a parse result never claims "verified"', r.never);
}

async function partA3(browser) {
  const { run } = require('./p14-benchmark.js');
  const { summary } = await run(browser, { write: !!process.env.P14_WRITE_BENCH, log: () => {} });
  const f = summary.fields, pct = x => (x * 100).toFixed(1) + '%';
  console.log('  benchmark:', summary.allRequired + '/' + summary.documents, Object.entries(f).map(([k, s]) => k + ' ' + pct(s.accuracy)).join(', '));
  console.log('  per kind:', summary.kinds.map(k => `${k.label} ${k.allRequired}/${k.n} (${pct(k.accuracy)})`).join('; '));
  ok('benchmark covers AHA + NIHSS + at least 2 other non-AHA kinds', summary.kinds.filter(k => !/AHA/.test(k.label)).length >= 3 && summary.kinds.some(k => /NIHSS/.test(k.label)), summary.kinds.map(k => k.label).join(', '));
  /* v14.8: "≥ 90% of documents need no correction" and "every required field ≥ 90%" retired: they measured pre-fill
     quality, and nothing is pre-filled any more. Unlabelled/ordering-guessed dates are deliberately left unread, so
     recall dropped; the invariant that remains is that the reader is never wrong on dates or identifiers. */
  const wrong = k => (f[k] && f[k].wrong) || 0;
  ok('(rewritten v14.8) benchmark: dates and identifiers are never read wrong (left unread instead)', ['issued_on', 'expires_on', 'renew_by', 'credential_id'].every(k => wrong(k) === 0), JSON.stringify(Object.fromEntries(Object.entries(f).map(([k, s]) => [k, { correct: s.correct, wrong: s.wrong, notFound: s.n - s.found }]))));
  ok('benchmark: text PDFs 100%', summary.variants.find(v => v.variant === 'PDF (text)').allRequired === summary.variants.find(v => v.variant === 'PDF (text)').n);
  return summary;
}

async function partA4(browser) {
  step('A4 start'); const { pg, errs, reqs } = await phone(browser); step('A4 page');
  const shot = async (file, sel) => { await W(250); const h = sel && await pg.$(sel); if (h) { await pg.evaluate(e => e.scrollIntoView({ block: 'start' }), h); await W(150); await h.screenshot({ path: SH + file }); } else await pg.screenshot({ path: SH + file }); };
  const idle = (ms = 60000) => pg.waitForFunction(() => !document.body.classList.contains('acct-busy-v10'), { timeout: ms });
  /* v14.8 (t150u): the reader only screens the file on the device (#acctScreenBoxV148). It never fills, compares
     or re-scans; the verifier types the evidence. Retired tests are listed in LEGACY_TEST_MAP.md. */
  const waitScan = (ms = 90000) => pg.waitForFunction(() => { const b = document.getElementById('acctScreenBoxV148'); return b && b.dataset.state && b.dataset.state !== 'checking'; }, { timeout: ms });
  const tap = async sel => { await pg.waitForSelector(sel, { timeout: 15000 }); await pg.evaluate(s => { const e = document.querySelector(s); e.scrollIntoView({ block: 'center' }); }, sel); await W(120); await pg.evaluate(s => document.querySelector(s).click(), sel); };
  const setVal = (id, v) => pg.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, id, v);
  await pg.evaluate(require('./p14-fake.js')); step('fake in');
  const blsPdf = fs.readFileSync(FIX + '/01-bls-text.pdf').toString('base64');
  const seeded = await pg.evaluate(async b64 => {
    const f = new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'BLS- exp 6-2028.pdf', { type: 'application/pdf' });
    const id = __fakeSeed({ kind: 'CERT_BLS', type_code: 'CERT_BLS', display_name: 'BLS — Basic Life Support', expires_on: '2028-05-08', jurisdiction_code: null }, f);
    const lic = __fakeSeed({ kind: 'RN_LICENSE', type_code: 'RN_LICENSE_CA', display_name: 'RN License · California', expires_on: '2027-03-31', jurisdiction_code: 'US-CA' });
    await store.account.hydrate(); acctShow('acctPassportV10'); return { id, lic };
  }, blsPdf);
  await W(400); step('seeded');
  const reqStart = reqs.length;
  // ---- add a new credential with a document: the nurse types, the device only screens the file ----
  await tap('[data-act="toggle-add"]'); await W(200);
  await pg.select('#acctKindV10', 'CERT_BLS'); await W(150);
  await setVal('acctExpV10', '2028-05-08');
  await (await pg.$('#acctFileV10')).uploadFile(FIX + '/01-bls-skewed-noisy.jpg');
  await waitScan();
  await shot('01-screen-on-device.png', '#acctAddFormV10');
  const sc = await pg.evaluate(() => ({ screen: document.getElementById('acctScreenBoxV148').dataset.state, exp: document.getElementById('acctExpV10').value, scanBox: !!document.getElementById('acctScanBoxV14'), useDoc: !!document.getElementById('acctUseDocDateV14'), mm: !!document.getElementById('acctExpMismatchV144') }));
  ok('(rewritten v14.8) typed May 8 date kept; the file is only screened (no read-back box, no "Use the document\'s date", no document comparison)', sc.exp === '2028-05-08' && ['clear', 'unreadable'].includes(sc.screen) && !sc.scanBox && !sc.useDoc && !sc.mm, JSON.stringify(sc));
  await pg.evaluate(EXPOK); await tap('#acctAddFormV10 button[type=submit]'); await idle();
  const saved = await pg.evaluate(() => { const c = __fakeDb.credentials.filter(x => x.kind === 'CERT_BLS').pop(); return { c, ev: __fakeDb.audit_events.filter(e => e.credential_id === c.id).map(e => e.event_type), xe: (__fakeDb.extraction_events || []).filter(e => e.credential_id === c.id), msg: document.getElementById('acctWsMsgV10')?.textContent || document.getElementById('acctMsgV10')?.textContent || '' }; });
  ok('(rewritten v14.8) saved: VERIFYING, expires as typed (May 8, 2028), no document values in metadata, never DOCUMENT_DATE_APPLIED', saved.c.status === 'VERIFYING' && saved.c.expires_on === '2028-05-08' && !saved.c.metadata.doc && !saved.ev.includes('DOCUMENT_DATE_APPLIED'), JSON.stringify({ st: saved.c.status, exp: saved.c.expires_on, meta: saved.c.metadata, ev: saved.ev, msg: saved.msg }));
  const leak = JSON.stringify([saved.xe, saved.c.metadata, (await pg.evaluate(() => __fakeDb.audit_events.map(e => e.detail)))]);
  ok('extracted values stay off the server: metadata, audit and telemetry hold no document values', !/Testa|Fakename|261100000017|2026-06-12|2028-06-/.test(leak.replace(/2028-05-08/g, '')), leak.slice(0, 160));
  const badge = await pg.evaluate(id => document.querySelector(`[data-cred="${id}"] .badge`)?.textContent, saved.c.id);
  ok('(rewritten v14.8) credential row badge says not verified (never VERIFIED)', /NOT VERIFIED|AWAITING VERIFICATION/.test(badge) && !/^VERIFIED/.test(badge), badge);
  // ---- private record: only the date the nurse typed is kept ----
  await tap('[data-act="toggle-add"]'); await W(200);
  await pg.select('#acctKindV10', 'HEALTH_TB_CURRENT');
  await (await pg.$('#acctFileV10')).uploadFile(FIX + '/tb-private-text.pdf'); await waitScan();
  await setVal('acctExpV10', '2027-04-01');
  await pg.evaluate(EXPOK); await tap('#acctAddFormV10 button[type=submit]'); await idle();
  const tb = await pg.evaluate(() => { const c = __fakeDb.credentials.filter(x => x.kind === 'HEALTH_TB_CURRENT').pop(); return c && { meta: c.metadata, exp: c.expires_on }; });
  ok('(rewritten v14.8) private TB record saved with the typed date and no document data in metadata', tb && tb.exp === '2027-04-01' && !Object.keys(tb.meta || {}).some(k => k !== 'exp_confirm'), JSON.stringify(tb));
  const rescan = await pg.evaluate(id => !!document.querySelector(`[data-act="doc-rescan"][data-id="${id}"]`), seeded.id);
  const outside = reqs.slice(reqStart).filter(u => !u.startsWith(BASE) && !u.startsWith('blob:') && !u.startsWith('data:'));
  ok('nothing left the page while screening (no outside AI, no upload)', outside.length === 0, outside.slice(0, 3).join(' '));
  // ---- verifier form: the verifier types what the source shows ----
  await tap('.acctTab[data-target="acctVerifyV12"]'); await W(300);
  await pg.waitForFunction(id => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), { timeout: 20000 }, seeded.id);
  await tap(`.acct-verify-pick-v12[data-id="${seeded.id}"]`);
  await pg.waitForSelector('#acctVerifyFormV12[data-mode="registry"]', { timeout: 15000 });
  const vf = await pg.evaluate(() => ({ opts: [...document.querySelectorAll('#acctVerifySourceIdV13 option')].map(o => o.value), sel: document.getElementById('acctVerifySourceIdV13').value, applies: document.getElementById('acctVerifyAppliesV14').innerText, mon: [...document.querySelectorAll('#acctVerifyMonV13 option')].map(o => o.value), foot: document.getElementById('acctVerifyFootV14')?.innerText || '', exp: document.getElementById('acctVerifyExpV13').value, ref: document.getElementById('acctVerifyRefV12').value, aha: document.getElementById('acctOpenAhaV14')?.href || '', reader: !!document.getElementById('acctVReadV14'), side: document.documentElement.scrollWidth <= window.innerWidth + 1 }));
  ok('BLS verifier form: AHA eCards preselected; RQI and Red Cross offered; no Nursys', vf.sel === 'aha-ecards' && vf.opts.includes('aha-rqi') && vf.opts.includes('redcross-certificate') && !vf.opts.some(o => /nursys|board-/.test(o)), JSON.stringify(vf.opts));
  ok('form text names the applicable source and says Nursys does not apply', /AHA eCards/.test(vf.applies) && /Nursys does not apply/.test(vf.applies) && /not a license/.test(vf.foot));
  ok('no Nursys e-Notify monitoring option for BLS', !vf.mon.includes('ENROLLED'), vf.mon.join());
  ok('(rewritten v14.8) verifier form: expiration and reference start empty, no on-device reader; the official AHA lookup link is offered', vf.exp === '' && vf.ref === '' && !vf.reader && /ecards\.heart\.org/.test(vf.aha), JSON.stringify({ exp: vf.exp, ref: vf.ref, aha: vf.aha, reader: vf.reader }));
  ok('verifier form fits a phone (no sideways scroll)', vf.side);
  await shot('04-verifier-aha-source.png', '#acctVerifyFormV12');
  await setVal('acctVerifyExpV13', '2028-06-30'); await setVal('acctVerifyRefV12', '261100000017');
  await setVal('acctVerifyResultV12', 'VERIFIED');
  await tap('#acctVerifySaveV12'); await idle();
  const vc = await pg.evaluate(id => ({ lvl: __fakeDb.credentials.find(x => x.id === id).verification_level, st: __fakeDb.credentials.find(x => x.id === id).status }), seeded.id);
  ok('(rewritten v14.8) the verifier records what the source showed; the level comes from the registry (AHA eCards → ISSUER_VERIFIED)', vc.lvl === 'ISSUER_VERIFIED' && vc.st === 'VERIFIED', JSON.stringify(vc));
  // license credential still routes to the board / Nursys
  await pg.evaluate(() => { acctVerifyRows = null; acctRenderVerify(); }); await W(300);
  await pg.waitForFunction(id => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), { timeout: 20000 }, seeded.lic);
  await tap(`.acct-verify-pick-v12[data-id="${seeded.lic}"]`); await W(300);
  const lf = await pg.evaluate(() => ({ opts: [...document.querySelectorAll('#acctVerifySourceIdV13 option')].map(o => o.value), mon: [...document.querySelectorAll('#acctVerifyMonV13 option')].map(o => o.value), applies: document.getElementById('acctVerifyAppliesV14').innerText }));
  ok('RN license form: board + Nursys only, e-Notify listed', lf.opts.every(o => /^(board-US-CA|nursys-quickconfirm)$/.test(o)) && lf.mon.includes('ENROLLED') && /board of nursing or Nursys/.test(lf.applies), JSON.stringify(lf.opts));
  // ---- live accuracy panel: reads extraction_events, falls back to the audit log without migration 9 ----
  await tap('[data-act="acc-load"]'); await idle();
  const acc = await pg.evaluate(() => ({ from: acctAccStatsV14 && acctAccStatsV14.from, panel: !!document.getElementById('acctAccuracyV14') }));
  ok('(rewritten v14.8) live accuracy panel loads from extraction_events', acc.from === 'extraction_events' && acc.panel, JSON.stringify(acc));
  await pg.evaluate(() => { __fakeOpts.extractionTable = false; store.account.extractionTable = undefined; });
  await tap('[data-act="acc-load"]'); await idle();
  const fb = await pg.evaluate(() => ({ from: acctAccStatsV14.from }));
  ok('(rewritten v14.8) without migration 9 the panel falls back to the audit log', fb.from === 'audit_events', JSON.stringify(fb));
  ok('(v14.8) no "Re-scan document" on saved credentials', !rescan);
  ok('account UI: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await pg.close();
}

async function partA5(browser) {
  const { pg, errs } = await phone(browser);
  await pg.evaluate(() => { v81ShowRole('verification'); v81Tabs('verifyTab', 'verifyPanel', 'verifyExtractV14'); v81RenderVerifier(v81RoleContext()); });
  await W(400);
  const t = await pg.evaluate(() => ({ docs: document.getElementById('benchDocsV14')?.textContent, kinds: document.getElementById('benchKindV14')?.innerText || '', side: document.documentElement.scrollWidth <= window.innerWidth + 1 }));
  ok('Verification Console has an Extraction Accuracy panel with per-kind rows', +t.docs >= 60 && /NIHSS/.test(t.kinds) && /TNCC/.test(t.kinds) && /RN license/.test(t.kinds), t.kinds.slice(0, 120));
  ok('accuracy panel fits a phone', t.side);
  await pg.evaluate(() => document.getElementById('verifyExtractV14').scrollIntoView());
  await pg.screenshot({ path: SH + '06-accuracy-console.png' });
  await pg.select('#tryKindV14', 'CERT_TNCC');
  await (await pg.$('#tryFileV14')).uploadFile(FIX + '/tncc-ena-text.pdf');
  await pg.waitForSelector('#tryResultV14', { timeout: 60000 });
  const tr = await pg.evaluate(() => document.getElementById('tryResultV14').innerText);
  ok('"Try a document" reads a TNCC certificate and names ENA as the source', /TN-0000-55501/.test(tr) && /Emergency Nurses Association|ENA/.test(tr), tr.replace(/\s+/g, ' ').slice(0, 160));
  ok('console: no page errors', errs.length === 0, errs.join(' | '));
  await pg.close();
}

/* Live end-to-end on BASE against staging: throwaway nurse + verifier (mailinator, no email sent),
   NIHSS scanned on the nurse's phone, verifier reads it on their own device and records it at APEX.
   Everything created here is removed at the end (storage file by its owner, rows via SQL). */
async function partC(browser, db, mask) {
  const { generateSync } = require('otplib');
  const PREFIX = 'veridun-pr14-';
  const cleanup = async () => {
    const all = (await db.query(`select id from auth.users where email like $1`, [PREFIX + '%@mailinator.com'])).rows.map(r => r.id);
    if (!all.length) return;
    const clin = (await db.query('select id from public.clinicians where user_id=any($1)', [all])).rows.map(r => r.id);
    const creds = (await db.query('select id from public.credentials where clinician_id=any($1)', [clin])).rows.map(r => r.id);
    await db.query('begin');
    try {
      for (const t of ['audit_events', 'analytics_events', 'monitoring_events', 'extraction_events']) await db.query(`alter table public.${t} disable trigger ${t}_append_only`);
      await db.query('delete from public.extraction_events where actor_user_id=any($1) or clinician_id=any($2) or credential_id=any($3)', [all, clin, creds]);
      await db.query('delete from public.audit_events where actor_user_id=any($1) or clinician_id=any($2) or credential_id=any($3)', [all, clin, creds]);
      await db.query('delete from public.analytics_events where clinician_id=any($1)', [clin]);
      await db.query('delete from public.monitoring_events where actor_user_id=any($1) or credential_id=any($2)', [all, creds]);
      for (const t of ['audit_events', 'analytics_events', 'monitoring_events', 'extraction_events']) await db.query(`alter table public.${t} enable trigger ${t}_append_only`);
      await db.query('delete from public.verification_anchors where credential_id=any($1)', [creds]);
      await db.query('delete from public.credential_verifications where credential_id=any($1)', [creds]);
      await db.query('delete from public.audit_anchors where clinician_id=any($1)', [clin]);
      await db.query('delete from public.credentials where id=any($1)', [creds]);
      await db.query('delete from public.clinicians where id=any($1)', [clin]);
      await db.query('delete from auth.mfa_factors where user_id=any($1)', [all]);
      await db.query('delete from auth.users where id=any($1)', [all]);
      await db.query('commit');
    } catch (e) { await db.query('rollback'); throw e; }
  };
  const make = async label => {
    const u = { email: `${PREFIX}${label}-${crypto.randomBytes(3).toString('hex')}@mailinator.com`, password: 'T' + crypto.randomBytes(12).toString('base64url') + '9!', id: crypto.randomUUID() };
    await db.query(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
      values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`, [u.id, u.email, u.password]);
    await db.query(`insert into auth.identities (provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values ($1::text,$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true),'email',now(),now(),now())`, [u.id, u.email]);
    return u;
  };
  const mk = async () => { const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await pg.goto(BASE, { waitUntil: 'networkidle2' }); return { pg, errs, ctx }; };
  const signIn = async (pg, u) => { await pg.evaluate(async (e, p) => { await store.account.signInWithPassword(e, p); }, u.email, u.password); await pg.waitForFunction(() => store.account.signedIn, { timeout: 30000 }); await W(400); await pg.evaluate(() => { if (!accountWorkspace.classList.contains('active')) acctShow(); }); await W(300); };
  const idle = (pg, ms = 60000) => pg.waitForFunction(() => !document.body.classList.contains('acct-busy-v10'), { timeout: ms });
  const tap = async (pg, sel) => { await pg.waitForSelector(sel, { timeout: 20000 }); await pg.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await W(120); await pg.evaluate(s => document.querySelector(s).click(), sel); };
  const setVal = (pg, id, v) => pg.evaluate((id, v) => { const e = document.getElementById(id); if (!e) return; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, id, v);
  let nurse, ver, docPath = null, docRemoved = false;
  try {
    await cleanup();
    const nurseU = await make('nurse'), verU = await make('verifier');
    await db.query(`update public.users set role='verifier' where id=$1`, [verU.id]);
    ok('live: throwaway nurse + verifier created (no email sent)', true);
    nurse = await mk(); ver = await mk();
    ok('live site shows ' + VERSION, await nurse.pg.evaluate(v => document.documentElement.textContent.includes(v), VERSION), BASE);
    await signIn(nurse.pg, nurseU);
    await nurse.pg.evaluate(async () => { await store.account.saveProfile({ full_name: 'Testa Fakename', post_nominals: 'RN', specialty: 'ICU', home_jurisdiction: 'US-CA' }); acctShow('acctPassportV10'); });
    await W(400);
    await tap(nurse.pg, '[data-act="toggle-add"]'); await W(200);
    await nurse.pg.select('#acctKindV10', 'CERT_NIHSS'); await setVal(nurse.pg, 'acctExpV10', '2028-12-31');
    await (await nurse.pg.$('#acctFileV10')).uploadFile(FIX + '/nihss-apex-text.pdf');
    await nurse.pg.waitForFunction(() => { const b = document.getElementById('acctScanBoxV14'); return b && ['done', 'error', 'unsupported'].includes(b.dataset.state); }, { timeout: 120000 });
    const sc = await nurse.pg.evaluate(() => ({ v: acctScan.values, src: acctScan.res.source && acctScan.res.source.id, mm: (document.getElementById('acctExpMismatchV144') || {}).innerText || '' }));
    ok('live: NIHSS read on the phone, APEX suggested, mismatch vs typed Dec 31', sc.v.credential_id === '99000123' && sc.v.expires_on === '2028-03-14' && sc.src === 'apex-nihss' && /doesn't match the document/.test(sc.mm), JSON.stringify({ src: sc.src, exp: sc.v.expires_on }));
    await tap(nurse.pg, '#acctUseDocDateV14'); await W(200);
    await tap(nurse.pg, '#acctScanConfirmV14');
    await nurse.pg.evaluate(EXPOK); await tap(nurse.pg, '#acctAddFormV10 button[type=submit]'); await idle(nurse.pg);
    const row = (await db.query(`select c.id, c.status::text, c.expires_on::text exp, c.metadata, c.source_document_path p from public.credentials c join public.clinicians k on k.id=c.clinician_id where k.user_id=$1 and c.kind='CERT_NIHSS'`, [nurseU.id])).rows[0];
    docPath = row && row.p;
    ok('live: saved VERIFYING with the document date, document in private storage', row && row.status === 'VERIFYING' && row.exp === '2028-03-14' && !!row.p, JSON.stringify(row && { st: row.status, exp: row.exp }));
    const xe = (await db.query(`select event, kind, profile, source_slug, fields_found, fields_confirmed, confidence from public.extraction_events where credential_id=$1 or (clinician_id=(select id from public.clinicians where user_id=$2))`, [row.id, nurseU.id])).rows;
    ok('live: extraction_events CONFIRM row stored (field names + numbers)', xe.some(e => e.event === 'CONFIRM' && e.kind === 'CERT_NIHSS' && e.source_slug === 'apex-nihss' && e.fields_found.includes('credential_id') && Object.values(e.confidence).every(v => typeof v === 'number')), JSON.stringify(xe.map(e => ({ ev: e.event, k: e.kind, s: e.source_slug, f: e.fields_found }))));
    const au = JSON.stringify((await db.query(`select event_type, detail from public.audit_events where credential_id=$1`, [row.id])).rows);
    const leak = JSON.stringify([row.metadata, xe]) + au;
    ok('live: no extracted value reached the server (metadata, audit, telemetry)', !/99000123|Testa|2026-03-14|apexinnov/i.test(JSON.stringify([row.metadata, xe])) && !/99000123|2026-03-14/.test(au) && row.metadata.doc && row.metadata.doc.confirmed === true, leak.slice(0, 200));
    // verifier on their own device
    await signIn(ver.pg, verU);
    await ver.pg.click('.acctTab[data-target="acctSecurityV12"]'); await W(250);
    await ver.pg.click('#acctMfaEnrollBtnV12'); await idle(ver.pg);
    await ver.pg.waitForSelector('#acctMfaSecretV12');
    const secret = await ver.pg.$eval('#acctMfaSecretV12', el => el.textContent.trim().replace(/\s/g, ''));
    await ver.pg.evaluate(c => { document.getElementById('acctMfaFirstV12').value = c; }, generateSync({ secret }));
    await ver.pg.click('#acctMfaConfirmV12 button[type=submit]'); await idle(ver.pg);
    ok('live: verifier reaches AAL2', await ver.pg.evaluate(() => store.account.mfa?.currentLevel === 'aal2'));
    await tap(ver.pg, '.acctTab[data-target="acctVerifyV12"]'); await W(300);
    await ver.pg.waitForFunction(id => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), { timeout: 30000 }, row.id);
    await tap(ver.pg, `.acct-verify-pick-v12[data-id="${row.id}"]`);
    await ver.pg.waitForSelector('#acctVerifyFormV12[data-mode="registry"]', { timeout: 15000 });
    const vf = await ver.pg.evaluate(() => ({ opts: [...document.querySelectorAll('#acctVerifySourceIdV13 option')].map(o => o.value), sel: document.getElementById('acctVerifySourceIdV13').value, applies: (document.getElementById('acctVerifyAppliesV14') || {}).innerText || '', form: document.getElementById('acctVerifyFormV12').innerText }));
    ok('live: apex-nihss resolves from the live registry and is preselected; no Nursys', vf.sel === 'apex-nihss' && !vf.opts.some(o => /nursys|board-/.test(o)) && !/not in the live registry/i.test(vf.form), JSON.stringify(vf.opts));
    await tap(ver.pg, '#acctVReadV14');
    await ver.pg.waitForSelector('#acctCopyCodeV14', { timeout: 120000 });
    const pre = await ver.pg.evaluate(() => ({ ref: document.getElementById('acctVerifyRefV12')?.value, exp: document.getElementById('acctVerifyExpV13')?.value }));
    ok('live: verifier reads the document on their device via a signed link; ID + expiration prefilled', pre.ref === '99000123' && pre.exp === '2028-03-14', JSON.stringify(pre));
    await ver.pg.evaluate(() => document.querySelectorAll('.acctDblV14').forEach(x => { if (x.value !== 'active') x.checked = true; }));
    await setVal(ver.pg, 'acctVerifyResultV12', 'VERIFIED'); await setVal(ver.pg, 'acctVerifyStatusV13', 'ACTIVE');
    await W(200); await ver.pg.screenshot({ path: SH + '09-live-verifier-nihss.png' });
    await tap(ver.pg, '#acctVerifySaveV12'); await idle(ver.pg);
    const rec = await ver.pg.evaluate(() => typeof acctLastRecord !== 'undefined' && acctLastRecord && { level: acctLastRecord.level, src: acctLastRecord.source_name });
    const dbrow = (await db.query('select status::text, verification_level from public.credentials where id=$1', [row.id])).rows[0];
    ok('live: record_source_check at APEX NIHSS → VERIFIED, ISSUER_VERIFIED', dbrow.status === 'VERIFIED' && dbrow.verification_level === 'ISSUER_VERIFIED' && (!rec || /APEX/i.test(rec.src || '')), JSON.stringify({ rec, dbrow }));
    const vc = (await db.query(`select count(*)::int n from public.extraction_events where credential_id=$1 and event='VERIFIER_CHECK'`, [row.id])).rows[0].n;
    ok('live: VERIFIER_CHECK event logged at aal2', vc === 1, vc);
    await tap(ver.pg, '[data-act="acc-load"]'); await idle(ver.pg);
    const acc = await ver.pg.evaluate(() => ({ from: typeof acctAccStatsV14 !== 'undefined' && acctAccStatsV14 && acctAccStatsV14.from, kinds: document.getElementById('accKindTableV14')?.innerText || '' }));
    ok('live: accuracy panel reads extraction_events', acc.from === 'extraction_events' && /NIHSS/.test(acc.kinds), JSON.stringify(acc).slice(0, 160));
    // the nurse removes the stored document (owner delete policy), then rows are removed below
    const rm = await nurse.pg.evaluate(async p => { const { data, error } = await store.account.client.storage.from('source-documents').remove([p]); return error ? error.message : (data || []).length; }, row.p);
    const objLeft = (await db.query(`select count(*)::int n from storage.objects where bucket_id='source-documents' and name like $1`, [nurseU.id + '/%'])).rows[0].n;
    docRemoved = rm === 1;
    ok('live: test document removed from storage', rm === 1 && objLeft === 0, JSON.stringify({ rm, objLeft }));
    const errs = [...nurse.errs, ...ver.errs];
    ok('live: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) { ok('p14 live end-to-end', false, mask(e && e.stack ? e.stack : e)); }
  finally {
    if (docPath && !docRemoved && nurse) await nurse.pg.evaluate(async p => store.account.client.storage.from('source-documents').remove([p]), docPath).catch(() => {});
    for (const x of [nurse, ver]) if (x) await x.ctx.close().catch(() => {});
    try { await cleanup(); const left = (await db.query('select count(*)::int n from auth.users where email like $1', [PREFIX + '%'])).rows[0].n; ok('live: test users cleaned up', left === 0, 'left ' + left); }
    catch (e) { ok('live cleanup', false, mask(e.message)); }
  }
}

async function partB(browser) {
  const { client, mask } = require('./live-db.js');
  const db = await client();
  try {
    const t = (await db.query(`select to_regclass('public.extraction_events') is not null t, (select relrowsecurity from pg_class where oid = to_regclass('public.extraction_events')) rls, (select count(*)::int from public.verification_sources where slug in ('apex-nihss','ena-tncc','aap-nrp','awhonn-fhm')) src`)).rows[0];
    if (!t.t) { skip('live extraction_events', 'migration 9 not applied to this database'); return; }
    ok('migration 9: extraction_events exists with RLS', t.t && t.rls);
    ok('new issuer sources are in the live registry', t.src === 4, t.src);
    const munib = async () => (await db.query(`select (select count(*)::int from public.credentials cr join public.clinicians k on k.id=cr.clinician_id where k.user_id=u.id) creds, (select string_agg(cr.status::text||':'||coalesce(cr.expires_on::text,'')||':'||md5(cr.metadata::text),',') from public.credentials cr join public.clinicians k on k.id=cr.clinician_id where k.user_id=u.id) st, (select count(*)::int from public.share_grants g join public.clinicians k on k.id=g.clinician_id where k.user_id=u.id) shares from public.users u where u.email='munibabid7@gmail.com'`)).rows[0];
    const m0 = await munib();
    // RLS probes in one transaction, rolled back: a stranger cannot insert for someone else, and confidence values are numbers only.
    const probe = await db.query(`begin;
      select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated','aal','aal1')::text, true);
      set local role authenticated;
      do $$ begin
        begin insert into public.extraction_events(event,kind,profile,clinician_id) values ('SCAN','CERT_BLS','aha_resus',gen_random_uuid()); raise exception 'P14_INSERT_ALLOWED';
        exception when insufficient_privilege or check_violation or foreign_key_violation then null; end;
      end $$;
      reset role;
      do $$ begin
        begin insert into public.extraction_events(event,kind,profile,confidence) values ('SCAN','CERT_BLS','aha_resus','{"holder_name":"Testa Fakename"}'); raise exception 'P14_TEXT_ALLOWED';
        exception when check_violation then null; end;
      end $$;
      rollback;`).then(() => 'ok', e => mask(e.message));
    ok('extraction_events refuses other users\' rows and non-numeric confidences (rolled back)', probe === 'ok', probe);
    if (process.env.P14_SKIP_LIVE_E2E) skip('live end-to-end', 'P14_SKIP_LIVE_E2E set'); else await partC(browser, db, mask);
    const m1 = await munib();
    ok("Munib's account unchanged", JSON.stringify(m0) === JSON.stringify(m1));
  } catch (e) { ok('p14 live run', false, mask(e && e.stack ? e.stack : e)); }
  finally { await db.end().catch(() => {}); }
}

(async () => {
  fs.mkdirSync(SH, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new', protocolTimeout: 180000 });
  try {
    const { pg, errs } = await phone(browser);
    await partA1(pg); await partA2(pg);
    ok('demo page: no page errors', errs.length === 0, errs.join(' | '));
    step('closing demo page'); await pg.close(); step('closed');
    if (process.env.P14_SKIP_BENCH) skip('benchmark', 'P14_SKIP_BENCH set');
    else await partA3(browser);
    if (!fs.existsSync(FIX + '/01-bls-text.pdf')) await require('./p14-fixtures.js').generateOther(browser, FIX).then(() => require('./p14-fixtures.js').generate(browser, BASE, FIX));
    await partA4(browser);
    await partA5(browser);
    /* v14.8: the live-database part is opt-in (P14_LIVE=1). Default runs never touch a live database. */
    const live = process.env.P14_LIVE === '1' && await require('./live-db.js').reachable() && await require('./live-db.js').client().then(async c => { try { await c.query('select 1'); return true; } catch { return false; } finally { await c.end().catch(() => {}); } }).catch(() => false);
    if (live) await partB(browser);
    else skip('live database checks', process.env.P14_LIVE === '1' ? 'database not reachable from this machine (Management API token rejected, Postgres ports closed)' : 'live checks are opt-in (P14_LIVE=1); default runs never touch a live database');
  } catch (e) { if (process.env.P14_DEBUG) console.log(JSON.stringify(String(e && e.message)).slice(0, 800)); ok('p14 run', false, String(e && e.stack || e).replace(/postgres(ql)?:\/\/[^\s'"]+/g, '***').replace(/sbp_[A-Za-z0-9_]+/g, 'sbp_***')); }
  finally { await Promise.race([browser.close().catch(() => {}), W(15000)]); }
  const fails = R.filter(r => r.startsWith('FAIL')).length, skips = R.filter(r => r.startsWith('SKIP')).length;
  console.log(`\n${R.length - fails - skips}/${R.length - skips} passed${skips ? `, ${skips} skipped` : ''}`);
  process.exit(fails ? 1 : 0);
})();
