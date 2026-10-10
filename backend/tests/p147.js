#!/usr/bin/env node
/* v14.7: Munib's v14.6 feedback — cross-browser test.
   1. Scan review: licenses show only "Issue date (if printed on the document)" (printed label kept
      raw), never a completion date, with the note about renewals and the state board; the original
      issue date is a verifier-side field shown in provenance once recorded.
   2. Expiration: the nurse must confirm it ("I confirm this expiration date matches my document" or
      "No expiration date on this document"); changing the date or the file clears the tick; source,
      confirmation and time are recorded.
   3. References are not credentials: not in the Add credential list; readiness reads completed
      references from the References section ("References: 2 of 2 completed"); old reference
      entries are moved out of the credential list without data loss.
   Synthetic data only (fake names, .example domains, "NOT A REAL CREDENTIAL" PDFs).
   Engines: Chromium, WebKit (Safari's engine, iPhone profile), Firefox, each in a phone and a
   desktop viewport, plus Chromium with Microsoft Edge (desktop) and Samsung Internet (Android)
   user agents. Edge and Samsung Internet are Chromium-based; this is UA + viewport emulation on
   Playwright's Chromium, not the vendor browsers themselves.
   All names, emails and phone numbers are fictional (.example domains, 555-01xx numbers).
   Usage: node backend/tests/p147.js   (BASE=<url> tests a deployed site; ENGINES=webkit narrows it) */
const fs = require('fs'), path = require('path');
const pw = require('playwright');
let BASE = process.env.BASE || '';
function serve() {
  const http = require('http'), root = path.resolve(__dirname, '../..');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.pdf': 'application/pdf' };
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]); if (u.endsWith('/')) u += 'index.html';
    const f = path.join(root, u); if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
const UA_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const UA_SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const PROFILES = (process.env.PROFILES || 'chromium/mobile,chromium/desktop,webkit/mobile,webkit/desktop,firefox/mobile,firefox/desktop,edge/desktop,samsung/mobile').split(',');
const ENGINES = process.env.ENGINES ? process.env.ENGINES.split(',') : null;
function ctxOpts(name, vp) {
  if (name === 'edge') return { viewport: { width: 1366, height: 820 }, userAgent: UA_EDGE };
  if (name === 'samsung') return { ...pw.devices['Galaxy S9+'], userAgent: UA_SAMSUNG };
  if (vp === 'desktop') return { viewport: { width: 1280, height: 800 } };
  if (name === 'firefox') return { viewport: { width: 390, height: 844 }, hasTouch: true, userAgent: pw.devices['iPhone 13'].userAgent };
  return { ...pw.devices[name === 'webkit' ? 'iPhone 13' : 'Pixel 7'] };
}
const engineOf = n => (n === 'edge' || n === 'samsung') ? 'chromium' : n;
const R = [];
const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (i !== '' && i != null && !c ? ' — ' + String(i).slice(0, 400) : ''); R.push(l); console.log(l); return c; };

const { buildPdf } = require('./lib/mini-pdf');
const { BANNER } = require('./p144-fixtures.js');
const FAKE = require('./p14-fake.js');
const pdf = lines => buildPdf([{ text: [{ s: BANNER, x: 230, y: 590, size: 10, bold: true }, ...lines.map((s, i) => ({ s, x: 80, y: 520 - i * 28, size: 13 }))] }]);
const FIX = {
  orig: ['Arizona State Board of Nursing', 'Registered Nurse', 'Name: Testa Fakename', 'License Number: RN990011', 'Original Issue Date: 04/02/2019', 'Expiration Date: 01/31/2029'],
  none: ['Arizona State Board of Nursing', 'Registered Nurse', 'Name: Testa Fakename', 'License Number: RN990012', 'Expiration Date: 02/28/2029'],
};
const fixDir = '/tmp/p147-fixtures'; fs.mkdirSync(fixDir, { recursive: true });
const FILES = Object.fromEntries(Object.entries(FIX).map(([k, l]) => { const p = path.join(fixDir, `lic-${k}.pdf`); fs.writeFileSync(p, pdf(l)); return [k, p]; }));

async function run(browser, name, vp, shots) {
  const tag = `${name}/${vp}`;
  const ctx = await browser.newContext(ctxOpts(name, vp));
  const pg = await ctx.newPage(); pg.setDefaultTimeout(30000);
  const errs = [], alerts = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => { alerts.push(d.message()); d.accept(); });
  let pass = true; const t = (n, c, i) => { pass = ok(`${tag}: ${n}`, c, i) && pass; };
  const shot = async (n, sel) => { if (!shots) return; const p = path.join(shots, `${name}-${vp}-${n}.png`); if (sel) await pg.locator(sel).screenshot({ path: p }); else await pg.screenshot({ path: p, fullPage: true }); };
  const ctr = sel => pg.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  const noOverflow = () => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const lastAlert = () => alerts[alerts.length - 1] || '';
  try {
    await pg.goto(BASE, { waitUntil: 'networkidle' });
    t('version label v14.7', await pg.evaluate(() => document.documentElement.textContent.includes('v14.7 demo')));

    /* ---------- 3. References are not credentials ---------- */
    const pick = await pg.evaluate(() => ({ picker: pickerCatalog().some(k => k.kind === 'REF_SPECIALTY' || /refer/i.test(k.label)), list: [...document.querySelectorAll('#kindListV82 option')].filter(o => /refer/i.test(o.value)).length, acct: /REF_SPECIALTY|Reference/i.test(acctKindOptions()), resolve: resolveCatalogKind('Specialty Reference Evaluation (manager or charge nurse)'), resolve2: resolveCatalogKind('REF_SPECIALTY') }));
    t('Add credential lists (demo + account) have no reference types', !pick.picker && pick.list === 0 && !pick.acct && !pick.resolve && !pick.resolve2, JSON.stringify(pick));
    const seed = await pg.evaluate(() => ({ cred: creds.some(c => c.kind === 'REF_SPECIALTY'), refs: loadReferences().filter(r => refStatus(r) === 'COMPLETED').length }));
    t('demo seed: no reference in the credential list; 2 completed references in the References section', !seed.cred && seed.refs === 2, JSON.stringify(seed));
    const rd = () => pg.evaluate(() => { const a = getAssignments().find(x => /boston/i.test(x.name)), r = v81Assignment(a), i = r.items.find(x => x.req.kind === 'REF_SPECIALTY'); return { ok: r.ok, total: r.total, label: i && i.label, status: i && i.status, decision: i && i.decision, why: i && i.why, missing: r.missing }; });
    const r1 = await rd();
    t('readiness: "References: 2 of 2 completed" (met); Boston stays 11/12', r1.label === 'References: 2 of 2 completed' && r1.status === 'MET' && r1.ok === 11 && r1.total === 12 && /completed reference/.test(r1.why), JSON.stringify(r1));
    const other = await pg.evaluate(() => DEMO_NURSES.filter(n => !n.live).map(n => { const a = getAssignments().find(x => matchedSpecialty(x, n)); if (!a) return null; const i = v81Assignment(a, n).items.find(x => x.req.kind === 'REF_SPECIALTY'); return i && [n.id, i.label, i.status]; }).filter(Boolean));
    t('comparison nurses: references counted from their (static) completed references', other.length >= 1 && other.every(x => x[1] === 'References: 2 of 2 completed' && x[2] === 'MET'), JSON.stringify(other));
    await pg.evaluate(() => { removeReference(loadReferences()[0].id); });
    const r2 = await rd();
    t('one removed → "References: 1 of 2 completed", not met, Boston 10/12', r2.label === 'References: 1 of 2 completed' && r2.status === 'MISSING' && r2.ok === 10 && /References section/.test(r2.why), JSON.stringify(r2));
    const task = await pg.evaluate(() => { v81ShowRole('clinician'); showV7View('homeView'); render(); const b = taskSections().required.find(x => x.item.req.kind === 'REF_SPECIALTY'); return { label: b && b.item.label, btn: document.body.innerHTML.includes('Go to References') }; });
    t('Task Center: the references blocker points to the References section (not the Add credential form)', task.label === 'References: 1 of 2 completed' && task.btn, JSON.stringify(task));
    const rid = await pg.evaluate(() => { const x = addReference({ name: 'Casey Vantreese', title: 'Charge Nurse', facility: 'Eastbay Union Hospital', unit: 'MICU', email: 'c.vantreese@eastbayunion.example' }); requestReference(x.ref.id, 'EMAIL'); return x.ref.id; });
    const r3 = await rd();
    t('a request out → "waiting on references" (plain words)', r3.status === 'WAITING_REFERENCES' && r3.decision === 'Not satisfied — waiting on references' && r3.missing.some(m => /waiting on references/.test(m)), JSON.stringify(r3));
    await pg.evaluate(id => { const r = loadReferences().find(x => x.id === id); submitReferenceByLink(r.token, { fromMonth: 2, fromYear: 2023, current: true, role: 'CHARGE', ratings: { clinical: 5, professionalism: 5, teamwork: 5, reliability: 5, communication: 5 }, rehire: 'YES', comments: 'Synthetic test.', attest: true }); }, rid);
    const r4 = await rd();
    t('completed → back to "References: 2 of 2 completed" and 11/12', r4.label === 'References: 2 of 2 completed' && r4.status === 'MET' && r4.ok === 11, JSON.stringify(r4));
    // typing a reference into the demo Add credential form
    await pg.evaluate(() => { v81ShowRole('clinician'); openAddForm(); $('kindSearchV82').value = 'Specialty Reference'; v81SyncAddForm(); });
    const nCred = await pg.evaluate(() => creds.length);
    await pg.evaluate(() => $('save').click());
    t('typing a reference type in Add credential → told to use the References section; nothing added', /References aren't credentials/.test(lastAlert()) && await pg.evaluate(n => creds.length === n, nCred), lastAlert());
    await pg.evaluate(() => $('add').close());

    /* migration of older "reference" credential entries */
    await pg.evaluate(() => { creds.push(v81Normalize({ id: 990001, name: 'ICU Specialty Reference Evaluation', kind: 'REF_SPECIALTY', type: 'REF_SPECIALTY', jurisdiction: '', section: 'Clinical Requirements', required: true, primary: 'VERIFIED', chain: 'NOT ISSUED', expiration: '', file: '', prov: { source: 'Reference evaluation (specialty manager) (demo seed)', active: true } })); save(); store.references.save([]); store.referenceResponses.save({}); store.referenceLegacy.save([]); });
    await pg.reload({ waitUntil: 'networkidle' });
    const m1 = await pg.evaluate(() => ({ cred: creds.some(c => c.kind === 'REF_SPECIALTY'), legacy: store.referenceLegacy.load().map(x => x.credential.name), refs: loadReferences().filter(r => refStatus(r) === 'COMPLETED').length, ev: v81Events().some(e => e.event_type === 'REFERENCE_CREDENTIAL_MOVED') }));
    t('migration: an old demo reference entry leaves the credential list, is kept (not deleted), and is replaced by 2 completed example references', !m1.cred && m1.legacy.length === 1 && m1.legacy[0] === 'ICU Specialty Reference Evaluation' && m1.refs === 2 && m1.ev, JSON.stringify(m1));
    t('after migration, readiness is unchanged (11/12, references 2 of 2)', (await rd()).ok === 11);
    await pg.evaluate(() => { v81ShowRole('clinician'); showV7View('referencesView'); });
    const note = await pg.textContent('#refLegacyNoteV147').catch(() => '');
    t('References section explains the move in plain words', /Moved here from your credentials/.test(note) && /ICU Specialty Reference Evaluation/.test(note) && /not deleted/.test(note), note);
    await shot('3-references-moved');
    t('no horizontal overflow (References)', await noOverflow());
    await ctr('#refLegacyOkV147'); await pg.click('#refLegacyOkV147');
    t('"OK" hides the note; the old entry is still kept', await pg.evaluate(() => !$('refLegacyNoteV147') && store.referenceLegacy.load().length === 1 && store.referenceLegacy.load()[0].noteDismissed));
    await pg.evaluate(() => { creds.push(v81Normalize({ id: 990002, name: 'My reference letter', kind: 'REF_SPECIALTY', type: 'REF_SPECIALTY', jurisdiction: '', section: 'Clinical Requirements', required: false, primary: 'VERIFYING', chain: 'NOT ISSUED', expiration: '', file: 'letter.pdf', prov: { source: '', active: false } })); save(); store.references.save([]); store.referenceResponses.save({}); });
    await pg.reload({ waitUntil: 'networkidle' });
    const m2 = await pg.evaluate(() => ({ cred: creds.some(c => c.kind === 'REF_SPECIALTY'), legacy: store.referenceLegacy.load().map(x => [x.credential.name, x.credential.file, x.noteDismissed]), refs: loadReferences().length }));
    t('a nurse-added reference entry is moved and kept as is (file name too); no example references are invented for it', !m2.cred && m2.legacy.some(x => x[0] === 'My reference letter' && x[1] === 'letter.pdf' && x[2] === false) && m2.refs === 0, JSON.stringify(m2));

    /* ---------- 2. Expiration confirmation (demo Add credential form) ---------- */
    await pg.evaluate(() => { initNewcomer(true); v81ShowRole('clinician'); render(); openAddForm({ kind: 'CERT_BLS' }); });
    const box = () => pg.evaluate(() => ({ vis: !!$('addExpConfirmV147').offsetParent, txt: $('addExpOkTextV147').textContent, on: $('addExpOkV147').checked, st: $('addExpOkStateV147').textContent }));
    let b = await box();
    t('expiration field has a confirmation; empty → "No expiration date on this document", unticked', b.vis && b.txt === 'No expiration date on this document' && !b.on, JSON.stringify(b));
    const n0 = await pg.evaluate(() => creds.length);
    await pg.evaluate(() => $('save').click());
    t('Save is blocked until confirmed (empty field)', /No expiration date on this document/.test(lastAlert()) && await pg.evaluate(n => creds.length === n, n0), lastAlert());
    await pg.fill('#dt', '2028-05-31');
    b = await box();
    t('a typed date → "I confirm this expiration date matches my document", unticked', b.txt === 'I confirm this expiration date matches my document' && !b.on && /Required before saving/.test(b.st), JSON.stringify(b));
    await pg.evaluate(() => $('save').click());
    t('Save is blocked until the date is confirmed', /Confirm the expiration date/.test(lastAlert()) && await pg.evaluate(n => creds.length === n, n0), lastAlert());
    await ctr('#addExpOkV147'); await pg.check('#addExpOkV147');
    b = await box(); t('ticking records the confirmation', b.on && /Confirmed by you/.test(b.st), JSON.stringify(b));
    await shot('1-add-expiration-confirm', '#add');
    await pg.fill('#dt', '2028-06-30');
    b = await box(); t('changing the date clears the confirmation', !b.on && /Required before saving/.test(b.st), JSON.stringify(b));
    await ctr('#addExpOkV147'); await pg.check('#addExpOkV147');
    await pg.setInputFiles('#fl', { name: 'card.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic') });
    b = await box(); t('choosing a new file clears the confirmation', !b.on, JSON.stringify(b));
    await ctr('#addExpOkV147'); await pg.check('#addExpOkV147');
    await pg.evaluate(() => $('save').click());
    const sv = await pg.evaluate(() => { const c = creds[creds.length - 1]; return { kind: c.kind, exp: c.expiration, ec: c.expConfirm, ev: v81Events().filter(e => e.credential_id === c.id).map(e => e.event_type), prov: provenanceRows(c).map(r => r.join(': ')).join(' | ') }; });
    t('saved with provenance: typed, confirmed by the nurse, time; event logged; shown in provenance', sv.kind === 'CERT_BLS' && sv.exp === '2028-06-30' && sv.ec && sv.ec.source === 'TYPED' && sv.ec.has_expiration === true && sv.ec.confirmed_by === 'CLINICIAN' && !isNaN(Date.parse(sv.ec.confirmed_at)) && sv.ev.includes('EXPIRATION_CONFIRMED') && /Expiration confirmed by the nurse: Confirmed by the nurse · typed by you/.test(sv.prov), JSON.stringify(sv));
    await pg.evaluate(() => openAddForm({ kind: 'CERT_TNCC' }));
    await ctr('#addExpOkV147'); await pg.check('#addExpOkV147'); await pg.evaluate(() => $('save').click());
    const sv2 = await pg.evaluate(() => { const c = creds[creds.length - 1]; return { kind: c.kind, exp: c.expiration, ec: c.expConfirm }; });
    t('"No expiration date on this document" confirmed → saved with no expiration, source "none printed"', sv2.kind === 'CERT_TNCC' && !sv2.exp && sv2.ec && sv2.ec.source === 'NONE_PRINTED' && sv2.ec.has_expiration === false, JSON.stringify(sv2));
    t('no confirmation needed where there is no expiration field (experience)', await pg.evaluate(() => { openAddForm({ kind: 'EMP_ICU_VERIFIED' }); const r = !expConfirmNeeded('add') && expConfirmBlocker('add') === null; $('add').close(); return r; }));

    /* ---------- 1. Issue date wording + verifier-side original issue date ---------- */
    const lb = await pg.evaluate(() => ({
      lic: scanIssueDateLabel({ profile: 'license', fields: {} }, 'RN_LICENSE'),
      licRaw: scanIssueDateLabel({ profile: 'license', fields: { issued_on: { label: 'Effective Date' } } }, 'RN_LICENSE'),
      licPlain: scanIssueDateLabel({ profile: 'license', fields: { issued_on: { label: 'Date Issued' } } }, 'RN_LICENSE'),
      nihss: scanIssueDateLabel({ profile: 'cert', fields: {} }, 'CERT_NIHSS'), bls: scanIssueDateLabel({ profile: 'aha_resus', fields: {} }, 'CERT_BLS'),
      course: scanIssueDateLabel({ profile: 'cert', fields: {} }, 'CERT_ENPC'), skills: scanIssueDateLabel({ profile: 'dates_only', fields: {} }, 'SKILLS_ICU') }));
    t('license: only "Issue date (if printed on the document)"; a different printed label is kept raw; never "completion"', lb.lic === 'Issue date (if printed on the document)' && lb.licRaw === 'Date printed as “Effective Date” (if printed on the document)' && lb.licPlain === lb.lic && ![lb.lic, lb.licRaw].some(x => /complet/i.test(x)), JSON.stringify(lb));
    t('completion date only where it applies (NIHSS, skills checklists, courses); BLS reads "Issue date"', lb.nihss === 'Completion date' && /completion/.test(lb.skills) && /completion/.test(lb.course) && lb.bls === 'Issue date', JSON.stringify(lb));
    // demo verifier: original issue date from the state board, kept apart from printed dates
    await pg.evaluate(() => { openAddForm({ kind: 'RN_LICENSE', jurisdiction: 'US-NV' }); });
    await pg.fill('#dt', '2028-10-31'); await ctr('#addExpOkV147'); await pg.check('#addExpOkV147'); await pg.evaluate(() => $('save').click());
    const lid = await pg.evaluate(() => { const c = creds[creds.length - 1]; v81ShowRole('verifier'); v81RenderRoles(); return c.kind === 'RN_LICENSE' ? c.id : null; });
    t('verifier queue: optional "Original issue date from the state board" field on licenses', !!lid && await pg.evaluate(id => !!$('origIssueV147-' + id), lid), String(lid));
    await pg.evaluate(id => { const e = $('origIssueV147-' + id); e.value = '2016-07-15'; }, lid);
    if (shots) { await ctr(`#origIssueV147-${lid}`); await shot('4-verifier-original-issue'); }
    await pg.evaluate(id => document.querySelector(`.v81Verify[data-id="${id}"]`).click(), lid);
    const vo = await pg.evaluate(id => { const c = creds.find(x => x.id === id); return { p: c.prov.originalIssueDate, prov: provenanceRows(c).map(r => r.join(': ')).join(' | '), ev: v81Events().some(e => e.event_type === 'ORIGINAL_ISSUE_DATE_RECORDED' && e.credential_id === id), exp: c.expiration }; }, lid);
    t('recorded by the verifier → shown in provenance as "Original issue date (state board)"; expiration untouched', vo.p === '2016-07-15' && /Original issue date \(state board\): .*recorded by the verifier/.test(vo.prov) && vo.ev && vo.exp === '2028-10-31', JSON.stringify(vo));

    /* ---------- account (signed-in) scan form, with the in-page fake backend ---------- */
    await pg.evaluate(FAKE);
    await pg.evaluate(async () => { await store.account.hydrate(); acctShow('acctPassportV10'); });
    await pg.waitForSelector('[data-act="toggle-add"]'); await pg.evaluate(() => document.querySelector('[data-act="toggle-add"]').click());
    await pg.waitForSelector('#acctKindV10'); await pg.selectOption('#acctKindV10', 'RN_LICENSE');
    await pg.evaluate(() => { const s = $('acctJurV10'); s.value = 'US-AZ'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    const waitScan = () => pg.waitForFunction(() => { const b = document.getElementById('acctScanBoxV14'); return b && ['done', 'error', 'unsupported'].includes(b.dataset.state); }, null, { timeout: 120000 });
    await pg.setInputFiles('#acctFileV10', FILES.orig); await waitScan();
    const sc = () => pg.evaluate(() => { const row = document.querySelector('#acctScanBoxV14 .scan-row-v14[data-field="issued_on"]'); return { state: $('acctScanBoxV14').dataset.state, lbl: row && row.querySelector('.scan-lbl-v14').textContent, val: $('acctScanF-issued_on') && $('acctScanF-issued_on').value, note: $('acctScanIssueNoteV147') && $('acctScanIssueNoteV147').textContent, box: $('acctScanBoxV14').innerText, exp: $('acctExpV10').value, ctxt: $('acctExpOkTextV147').textContent, on: $('acctExpOkV147').checked }; });
    const s1 = await sc();
    t('scan review (license): the printed label is kept ("Original Issue Date"), marked optional; no completion date anywhere', s1.state === 'done' && /Date printed as “Original Issue Date” \(if printed on the document\)/.test(s1.lbl) && s1.val === '2019-04-02' && !/complet/i.test(s1.box), JSON.stringify(s1));
    t('note: original issue date may differ from the card (latest renewal); the verifier confirms it with the state board', /may differ from the date on this card/.test(s1.note) && /latest renewal/.test(s1.note) && /verifier confirms the original issue date with the state board/.test(s1.note) && /Not required/.test(s1.note), s1.note);
    t('expiration pre-filled from the scan, and needs the nurse\'s confirmation', s1.exp === '2029-01-31' && s1.ctxt === 'I confirm this expiration date matches my document' && !s1.on, JSON.stringify(s1));
    await shot('2-scan-license', '#acctAddFormV10');
    await pg.evaluate(() => { const c = $('acctScanConfirmV14'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
    const nA = await pg.evaluate(() => __fakeDb.credentials.length);
    await pg.evaluate(() => document.querySelector('#acctAddFormV10 button[type=submit]').click()); await pg.waitForTimeout(500);
    t('account save is blocked until the expiration is confirmed', await pg.evaluate(n => __fakeDb.credentials.length === n, nA) && /Confirm the expiration date/.test(await pg.textContent('#acctWsMsgV10')), await pg.textContent('#acctWsMsgV10'));
    await ctr('#acctExpOkV147'); await pg.check('#acctExpOkV147');
    await pg.setInputFiles('#acctFileV10', FILES.none); await waitScan(); await pg.waitForTimeout(200);
    const s2 = await sc();
    t('a new file clears the confirmation; no issue date printed → "Issue date (if printed on the document)" · "not printed · optional"', !s2.on && /^Issue date \(if printed on the document\)/.test(s2.lbl) && /not printed · optional/.test(s2.lbl) && s2.exp === '2029-02-28', JSON.stringify(s2));
    await pg.evaluate(() => { const c = $('acctScanConfirmV14'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await ctr('#acctExpOkV147'); await pg.check('#acctExpOkV147');
    await pg.evaluate(() => document.querySelector('#acctAddFormV10 button[type=submit]').click());
    await pg.waitForFunction(n => __fakeDb.credentials.length > n, nA);
    await pg.waitForTimeout(400);
    const as = await pg.evaluate(() => { const c = __fakeDb.credentials[__fakeDb.credentials.length - 1]; return { exp: c.expires_on, ec: c.metadata.exp_confirm, ev: __fakeDb.audit_events.filter(e => e.credential_id === c.id).map(e => [e.event_type, e.result]), row: (document.querySelector(`.acct-expprov-v147[data-cred="${c.id}"]`) || {}).textContent || '' }; });
    t('account save: provenance = document scan + confirmed by the nurse + time (no date copied into metadata); event logged; shown on the credential', as.exp === '2029-02-28' && as.ec && as.ec.source === 'DOCUMENT_SCAN' && as.ec.confirmed_by === 'CLINICIAN' && !JSON.stringify(as.ec).includes('2029') && as.ev.some(e => e[0] === 'EXPIRATION_CONFIRMED' && e[1] === 'DOCUMENT_SCAN') && /Confirmed by the nurse · read from the document scan/.test(as.row), JSON.stringify(as));
    const vo2 = await pg.evaluate(async () => { const c = __fakeDb.credentials[__fakeDb.credentials.length - 1]; await acct().log('ORIGINAL_ISSUE_DATE_RECORDED', { actor_type: 'VERIFIER', credential_id: c.id, clinician_id: c.clinician_id, result: 'RECORDED', detail: { original_issue_date: '2017-03-09', source: 'Arizona State Board of Nursing' } }); await acct().hydrate(); acctRenderAll(); const e = __fakeDb.audit_events.find(x => x.event_type === 'ORIGINAL_ISSUE_DATE_RECORDED'); return { cl: e.clinician_id === c.clinician_id, row: (document.querySelector(`.acct-expprov-v147[data-cred="${c.id}"]`) || {}).textContent || '' }; });
    t('account: an original issue date recorded by a verifier shows on the credential, apart from the printed dates', vo2.cl && /Original issue date: .*2017.* — recorded by the verifier from Arizona State Board of Nursing/.test(vo2.row), JSON.stringify(vo2));
    t('no horizontal overflow (account)', await noOverflow());
    t('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) { t('run', false, e.message.split('\n')[0]); }
  await ctx.close(); return pass;
}

(async () => {
  let srv = null;
  if (!BASE) { srv = await serve(); BASE = `http://127.0.0.1:${srv.address().port}/`; }
  const shots = process.env.SHOTS || ''; if (shots) fs.mkdirSync(shots, { recursive: true });
  console.log('BASE ' + BASE);
  const matrix = {}, browsers = {};
  for (const p of PROFILES) {
    const [name, vp] = p.split('/'), eng = engineOf(name);
    if (ENGINES && !ENGINES.includes(name) && !ENGINES.includes(eng)) continue;
    if (!browsers[eng]) { try { browsers[eng] = await pw[eng].launch(); console.log(`— ${eng} ${browsers[eng].version()}`); } catch (e) { ok(`${eng}: launch`, false, e.message.split('\n')[0]); continue; } }
    matrix[p] = await run(browsers[eng], name, vp, shots);
  }
  for (const b of Object.values(browsers)) await b.close();
  console.log('\nMatrix: ' + Object.entries(matrix).map(([k, v]) => `${k}=${v ? 'pass' : 'FAIL'}`).join('  '));
  if (srv) srv.close();
  const f = R.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${R.length - f}/${R.length} passed`);
  process.exit(f ? 1 : 0);
})();
