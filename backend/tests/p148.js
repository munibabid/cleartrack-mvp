#!/usr/bin/env node
/* v14.8 P0 SAFETY STOPS — cross-browser test, written BEFORE the fix (it fails on v14.7).
   Rules encoded (Munib t149u):
   1. The on-device scanner never fills a value or picks a type, on nurse AND verifier screens.
      It may still open/preview the file and check it for safety signals that can only BLOCK.
   2. No identifier repair or normalization anywhere (RN prefix, whitespace strip, O/0 I/1 L swaps,
      TC-ID fix, format repair).
   3. The verifier's evidence fields start empty (no scanner or nurse prefill).
   4. Dates: Renew By / Recommended Renewal / Renewed never become the expiration; no issue/expiration
      swaps; no "No expiration printed" claim the document didn't make; RN licenses need a typed expiration.
   5. Wrong-type and merged saves are blocked: multi-credential file → "Please upload each credential
      separately"; LVN/LPN → "Veridun Passport currently supports RN licenses."; Red Cross "Advanced Life
      Support" is not ACLS; PALS/TNCC/NRP/CEN/ENPC are held as unsupported in the RN pilot.
   6. Readiness counts the requirement set, not the credentials the nurse happens to hold (delete,
      renewal, multistate contradiction, stale widgets).
   7. No home-state multistate default; no "Multistate RN License" name (RN License + state + scope).
   8. No internal jargon on nurse screens; confidence words High confidence / Please check / Could not read reliably.
   9. The interim save stores only fields the database already has (no number/name/issue date in metadata).
   t150u adjustments (Munib, PR #23 review):
   A. RN current-practice-through date: a license without an authoritative date never gets full RN readiness;
      "not printed" capture is allowed and shows "Awaiting primary-source verification"; the generic
      "No expiration date on this document" never completes RN readiness; the nurse is never forced to invent a date.
   B. Scope: compact → the nurse chooses; non-compact → automatically single-state with a short explanation.
   C. Insufficient recognition (unreadable / unrecognized / unchecked file type) → safe manual path, awaiting
      verification, no readiness; positive conflict → hard block as the claimed type.
   D. Display names are rendered from structured state + scope; stored records are byte-identical after load;
      no logic parses labels.
   E. Hard hold: the primary save button is disabled/replaced by the corrective action; UI never contradicts the engine.
   Plus the site-path synthetic set (p148-fixtures.js, public synthetic only) with an UNSAFE ACCEPTANCES count.
   Usage: node backend/tests/p148.js   (BASE=<url>; ENGINES=webkit; PROFILES=chromium/desktop) */
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

const FAKE = require('./p14-fake.js');
const { CASES, pdf } = require('./p148-fixtures.js');
const B64 = Object.fromEntries(CASES.map(c => [c.id, c.pdf.toString('base64')]));
const CASE = id => CASES.find(c => c.id === id);
const JARGON = /\bRN_LICENSE\b|\bCERT_[A-Z]+|\bUS-[A-Z]{2}\b|Devnet|localStorage|Supabase|CATALOG_REVIEW|Classified as|Classification:|NLC member|Multistate RN License|\bVERIFYING\b|PENDING_VERIFICATION|ONBOARDING READY|60-second/;
const META_OK = ['compact_privilege_type', 'compact_privilege_source', 'exp_confirm'];
const FINAL = ['clear', 'blocked', 'unreadable', 'unsupported', 'error'];
const SCREEN_MS = +process.env.SCREEN_MS || 120000;
const UNSAFE = []; // site-path unsafe acceptances (any profile)

async function run(browser, name, vp, shots) {
  const tag = `${name}/${vp}`;
  const ctx = await browser.newContext(ctxOpts(name, vp));
  const pg = await ctx.newPage(); pg.setDefaultTimeout(30000);
  const errs = [], alerts = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => { alerts.push(d.message()); d.accept(); });
  let pass = true; const t = (n, c, i) => { pass = ok(`${tag}: ${n}`, c, i) && pass; };
  const shot = async (n, sel) => { if (!shots) return; const p = path.join(shots, `${name}-${vp}-${n}.png`); try { if (sel) await pg.locator(sel).screenshot({ path: p }); else await pg.screenshot({ path: p, fullPage: false }); } catch (e) {} };
  const lastAlert = () => alerts[alerts.length - 1] || '';
  const fileOf = id => ({ name: id + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from(B64[id], 'base64') });
  try {
    await pg.goto(BASE, { waitUntil: 'networkidle' });

    /* ---------- 2. no identifier repair; 4. no date misuse (the reader itself) ---------- */
    const pr = await pg.evaluate(() => {
      const P = (txt, kind) => { try { const r = DocExtract.parseCardText(txt, { kind, method: 'PDF_TEXT' }); const o = {}; for (const [k, f] of Object.entries(r.fields || {})) o[k] = f && f.value; o._exp = DocExtract.documentExpiry(r.fields || {}, r.issuer); return o; } catch (e) { return { err: String(e.message || e) }; } };
      const L = 'NOT A REAL CREDENTIAL\nFlorida Board of Nursing\nRegistered Nurse\nName: Testa Fakename\n';
      return {
        spaced: P(L + 'License Number: RN 9518846\nExpires: 04/30/2028', 'RN_LICENSE'),
        swaps: P(L + 'License Number: 1O2I3L4\nExpires: 04/30/2028', 'RN_LICENSE'),
        noprefix: P(L + 'License Number: 990011\nExpires: 04/30/2028', 'RN_LICENSE'),
        smudge: P(L + 'License Number: RN95?8846\nExpires: 04/30/2028', 'RN_LICENSE'),
        ecard: P('American Heart Association\nBLS Provider\nName: Testa Fakename\neCard Code: 2611 0000 0017\nIssue Date: 06/03/2026\nRecommended Renewal Date: 06/2028', 'CERT_BLS'),
        tcid: P('American Heart Association\nBLS Provider\nName: Testa Fakename\nTraining Center ID: CAO0001\neCard Code: 261100000017\nIssue Date: 06/03/2026\nRenew By: 06/2028', 'CERT_BLS'),
        als: P('American Red Cross\nAdvanced Life Support\nName: Testa Fakename\nCertificate ID: 01ABCD2\nCompleted: 05/01/2026', 'CERT_ACLS'),
        alsKinds: DocExtract.detectKinds('American Red Cross\nAdvanced Life Support\nProvider').map(k => k.kind),
        renewBy: P('American Heart Association\nBLS Provider\nName: Testa Fakename\neCard Code: 261100000017\nIssue Date: 06/03/2026\nRenew By: 06/2028', 'CERT_BLS'),
        renewed: P(L + 'License Number: RN.0001234\nRenewed: 01/15/2026\nExpires: 01/31/2028', 'RN_LICENSE'),
        renewedOnly: P(L + 'License Number: RN.765432\nLast Renewed: 10/01/2025\nRenewal Date: 10/31/2027', 'RN_LICENSE'),
        swap: P(L + 'License Number: RN.1\nExpiration Date: 01/31/2024\nIssue Date: 01/31/2026', 'RN_LICENSE'),
        repairFns: ['fixDigits', 'normCode', 'renewToExpiry', 'interpretRenewal'].filter(f => typeof DocExtract[f] === 'function'),
      };
    });
    t('no whitespace strip: "RN 9518846" stays exactly as printed (or is not read)', !pr.spaced.credential_id || pr.spaced.credential_id === 'RN 9518846', JSON.stringify(pr.spaced));
    t('no O/0, I/1, L swaps: "1O2I3L4" stays as printed (or is not read)', !pr.swaps.credential_id || pr.swaps.credential_id === '1O2I3L4', JSON.stringify(pr.swaps));
    t('no RN prefix added: "990011" stays "990011"', !pr.noprefix.credential_id || pr.noprefix.credential_id === '990011', JSON.stringify(pr.noprefix));
    t('smudged number: no digit inferred', !pr.smudge.credential_id || pr.smudge.credential_id === 'RN95?8846', JSON.stringify(pr.smudge));
    t('eCard code: spaces kept as printed (or not read)', !pr.ecard.credential_id || pr.ecard.credential_id === '2611 0000 0017', JSON.stringify(pr.ecard));
    t('Training Center ID: no O→0 "fix"', !pr.tcid.training_center_id || pr.tcid.training_center_id === 'CAO0001', JSON.stringify(pr.tcid));
    t('Red Cross "Advanced Life Support" is never read as ACLS', !pr.alsKinds.includes('CERT_ACLS') && !/ACLS|cardiovascular/i.test(String(pr.als.course || '')), JSON.stringify({ k: pr.alsKinds, c: pr.als.course }));
    t('"Renew By" never becomes the expiration', !pr.renewBy.expires_on && !(pr.renewBy._exp && pr.renewBy._exp.value), JSON.stringify(pr.renewBy));
    t('"Renewed" is not the expiration; the printed Expires date is', pr.renewed.expires_on === '2028-01-31' && pr.renewed.issued_on !== '2026-01-15', JSON.stringify(pr.renewed));
    t('"Last Renewed" / "Renewal Date" alone → no expiration', !pr.renewedOnly.expires_on && !(pr.renewedOnly._exp && pr.renewedOnly._exp.value), JSON.stringify(pr.renewedOnly));
    t('no issue/expiration swap (dates stay under their printed labels)', pr.swap.expires_on === '2024-01-31' && pr.swap.issued_on === '2026-01-31', JSON.stringify(pr.swap));
    t('repair helpers are gone from the reader API', pr.repairFns.length === 0, pr.repairFns.join());

    /* ---------- 8. confidence words; 7. names and scope ---------- */
    const words = await pg.evaluate(() => typeof confidenceWords === 'function' ? [confidenceWords(0.95), confidenceWords(0.8), confidenceWords(0.5), confidenceWords(null, false)] : null);
    t('confidence words: High confidence / Please check / Could not read reliably', JSON.stringify(words) === JSON.stringify(['High confidence', 'Please check', 'Could not read reliably', 'Could not read reliably']), JSON.stringify(words));
    const nm = await pg.evaluate(() => ({
      ms: credentialDisplayName('RN_LICENSE', 'US-AZ', undefined, 'MULTISTATE'), ss: credentialDisplayName('RN_LICENSE', 'US-CA', undefined, 'SINGLE_STATE'), legacy: credentialDisplayName('RN_LICENSE_MULTISTATE', 'US-AZ'),
      parser: typeof assertionLicenseRuleKind !== 'undefined',
      info: (() => { const i = licenseScopeInfo('US-AZ', 'US-AZ'); return { d: i.defaultScope || null, s: i.scope || null, choice: i.choice }; })(),
    }));
    t('names: "<State> RN License · <scope>"; never "Multistate RN License"', nm.ms === 'Arizona RN License · Multistate' && nm.ss === 'California RN License · Single-state' && nm.legacy === 'Arizona RN License · Multistate', JSON.stringify(nm));
    t('t150u D: no helper derives type/scope by parsing a label', !nm.parser, JSON.stringify(nm));
    t('no home-state multistate default (license from the primary state of residence)', nm.info.choice && !nm.info.d && !nm.info.s, JSON.stringify(nm.info));

    /* ---------- t150u D: rendered labels, stored records untouched ---------- */
    await pg.evaluate(() => { initNewcomer(true); v81ShowRole('clinician'); render(); save(); });
    const raw0 = await pg.evaluate(() => { const k = 'nursecredx_v2'; const a = JSON.parse(localStorage.getItem(k)); const l = a.find(c => c.kind === 'RN_LICENSE' || c.kind === 'RN_LICENSE_MULTISTATE'); l.name = 'Multistate RN License (NLC · home: Arizona)'; const s = JSON.stringify(a); localStorage.setItem(k, s); return s; });
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.evaluate(() => { v81ShowRole('clinician'); for (const v of ['homeView', 'passportView', 'tasksView', 'opportunitiesView']) { try { showV7View(v); render(); } catch (e) {} } save(); /* the next ordinary save must not write a display rename back */ });
    const raw1 = await pg.evaluate(() => localStorage.getItem('nursecredx_v2'));
    t('t150u D: stored credentials are byte-identical after page load, rendering and the next save (no rename of historical names)', raw1 === raw0, raw1 === raw0 ? '' : 'changed');
    const lbl = await pg.evaluate(() => { showV7View('passportView'); render(); const l = creds.find(c => isRnLicense(c)); return { stored: l.name, rendered: typeof credLabel === 'function' ? credLabel(l) : null, page: document.body.innerText.includes('Arizona RN License · Multistate'), legacyShown: document.body.innerText.includes('Multistate RN License') }; });
    t('t150u D: the label is rendered from structured state + scope ("Arizona RN License · Multistate"); the stored name is kept', lbl.stored === 'Multistate RN License (NLC · home: Arizona)' && lbl.rendered === 'Arizona RN License · Multistate' && lbl.page && !lbl.legacyShown, JSON.stringify(lbl));

    /* ---------- t150u A: RN current-practice-through date ---------- */
    const rnd = await pg.evaluate(() => { initNewcomer(true); render(); const l = creds.find(c => isRnLicense(c)); const v = { ...l, primary: 'VERIFIED', prov: { ...(l.prov || {}), active: true } }; const noDate = { ...v, expiration: '', official_expiration_date: '', prov: { ...v.prov, sourceExpiration: '' } };
      const before = onboarding().items[0].ok; creds.filter(c => isRnLicense(c)).forEach(x => { x.expiration = ''; x.official_expiration_date = ''; if (x.prov) x.prov.sourceExpiration = ''; }); /* every RN license on the Passport loses its date */ const after = onboarding(); return { dated: credSatisfiesRequirement(v) && isVerifiedActive(v), undated: credSatisfiesRequirement(noDate) || isVerifiedActive(noDate), before, afterLic: after.items[0].ok, afterReady: after.ready }; });
    t('t150u A: a verified RN license with a current-practice-through date counts; without one it never gets RN readiness credit', rnd.dated && !rnd.undated && rnd.before === true && rnd.afterLic === false && rnd.afterReady === false, JSON.stringify(rnd));
    await pg.evaluate(() => { initNewcomer(true); render(); });

    /* ---------- 6. readiness ---------- */
    const R = () => pg.evaluate(() => { const o = onboarding(); const bls = (o.items || []).find(i => i.kind === 'CERT_BLS'); return { pct: o.pct, ready: o.ready, bls: bls ? bls.ok : null, dom: [$('onboardPct').textContent, ($('v7PassportReady') || {}).textContent || null], badge: $('readyBadge').textContent }; });
    await pg.evaluate(() => { initNewcomer(true); v81ShowRole('clinician'); showV7View('homeView'); render(); });
    const r0 = await R();
    t('precondition: the demo baseline is complete (100%, ready)', r0.pct === 100 && r0.ready && r0.bls === true, JSON.stringify(r0));
    await pg.evaluate(() => { const b = creds.find(c => c.kind === 'CERT_BLS'); document.querySelector(`.del[data-id="${b.id}"]`).click(); });
    const r1 = await R();
    t('deleting the required BLS → below 100%, not ready, BLS missing', r1.pct < 100 && !r1.ready && r1.bls === false, JSON.stringify(r1));
    t('all readiness widgets agree after the delete (no stale state)', r1.dom[0] === r1.pct + '%' && (r1.dom[1] == null || r1.dom[1] === r1.pct + '%') && !/^Ready/i.test(r1.badge), JSON.stringify(r1));
    await shot('3-readiness-after-delete');
    await pg.reload({ waitUntil: 'networkidle' }); await pg.evaluate(() => { v81ShowRole('clinician'); render(); });
    const r2 = await R();
    t('after reload the same readiness (recomputed from saved credentials)', r2.pct === r1.pct && !r2.ready, JSON.stringify(r2));
    // renewal: the renewed BLS must still count as required
    await pg.evaluate(() => { initNewcomer(true); v81ShowRole('clinician'); render(); const b = creds.find(c => c.kind === 'CERT_BLS'); openRenewal(b.id); });
    await pg.fill('#dt', '2029-06-30'); await pg.check('#addExpOkV147');
    await pg.evaluate(() => $('save').click()); await pg.waitForTimeout(300);
    const newId = await pg.evaluate(() => { const c = creds.filter(x => x.kind === 'CERT_BLS').sort((a, b) => b.id - a.id)[0]; return c && c.primary !== 'VERIFIED' ? c.id : null; });
    if (newId) { await pg.evaluate(id => v81Verify(id), newId); await pg.waitForFunction(id => { const c = creds.find(x => x.id === id); return c && c.primary === 'VERIFIED' && creds.filter(x => x.kind === 'CERT_BLS').length === 1; }, newId, { timeout: 20000 }).catch(() => {}); }
    const r3 = await pg.evaluate(id => { render(); const c = creds.find(x => x.id === id); const before = onboarding().pct; if (c) document.querySelector(`.del[data-id="${id}"]`).click(); return { v: c && c.primary, n: creds.filter(x => x.kind === 'CERT_BLS').length, before, after: onboarding().pct, ready: onboarding().ready }; }, newId);
    t('renewal: the renewed BLS replaces the old one and still counts (deleting it drops readiness)', !!newId && r3.v === 'VERIFIED' && r3.before === 100 && r3.after < 100 && !r3.ready, JSON.stringify(r3));
    // multistate contradiction
    const ms = await pg.evaluate(() => { initNewcomer(true); v81ShowRole('clinician'); showV7View('passportView'); render(); const pa = practiceAuthorization(); return { az: pa.get('US-AZ') || null, html: document.body.innerHTML.includes('no multistate license'), name: document.body.innerHTML.includes('Multistate RN License') }; });
    t('multistate license is read from its scope: AZ = multistate home; no "no multistate license" contradiction', ms.az === 'multistate home' && !ms.html, JSON.stringify(ms));
    t('no "Multistate RN License" name anywhere on the clinician screens', !ms.name);

    /* ---------- 8. jargon on nurse screens (demo) ---------- */
    const jg = await pg.evaluate(src => { const re = new RegExp(src); const hits = []; for (const v of ['homeView', 'passportView', 'tasksView', 'opportunitiesView']) { try { showV7View(v); render(); } catch (e) {} const m = document.body.innerText.match(re); if (m) hits.push(v + ': ' + m[0] + ' … ' + document.body.innerText.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')); } return hits; }, JARGON.source);
    t('no internal codes / network / storage jargon on clinician screens', jg.length === 0, jg.join(' | '));
    await pg.evaluate(() => { showV7View('passportView'); openAddForm({ kind: 'RN_LICENSE', jurisdiction: 'US-AZ' }); });
    const addTxt = await pg.evaluate(() => $('add').innerText);
    const am = addTxt.match(JARGON);
    t('Add credential dialog: no internal codes ("Classification: RN_LICENSE · US-AZ", "XRPL Devnet")', !am && !/XRPL/.test(addTxt), am && addTxt.slice(Math.max(0, am.index - 60), am.index + 60));

    /* ---------- 7. demo scope must be chosen; name ---------- */
    const scope0 = await pg.evaluate(() => document.querySelectorAll('input[name=licScopeV145]:checked').length);
    t('demo: no license scope preselected for a license from the primary state of residence', scope0 === 0, String(scope0));
    const dtx = await pg.evaluate(() => ({ none: $('addExpOkTextV147').textContent, lbl: (document.querySelector('label[for=dt]') || {}).innerText || '' }));
    t('t150u A (demo): RN date field asks for the current-practice-through date; the "not printed" tick is license-specific, not the generic "No expiration date on this document"', /current-practice-through/i.test(dtx.lbl) && /current-practice-through date isn.t printed/i.test(dtx.none) && !/^No expiration date on this document$/.test(dtx.none), JSON.stringify(dtx));
    await pg.fill('#dt', '2028-10-31'); await pg.check('#addExpOkV147');
    let n0 = await pg.evaluate(() => creds.length); await pg.evaluate(() => $('save').click());
    t('demo: save blocked until the license scope is chosen', await pg.evaluate(n => creds.length === n, n0) && /scope/i.test(lastAlert()), lastAlert());
    await pg.evaluate(() => { const r = document.querySelector('input[name=licScopeV145][value=MULTISTATE]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
    await pg.evaluate(() => $('save').click());
    const sv = await pg.evaluate(() => { const c = creds[creds.length - 1]; return { name: c.name, scope: licenseScopeOf(c), alert: '' }; });
    t('demo: saved as "Arizona RN License · Multistate" with the chosen scope; plain confirmation (no codes)', sv.name === 'Arizona RN License · Multistate' && sv.scope === 'MULTISTATE' && !JARGON.test(lastAlert()), JSON.stringify(sv) + ' ' + lastAlert());

    /* ---------- 5. demo path: blocks ---------- */
    const demoTry = async (cid, kind, jur, scope) => {
      await pg.evaluate(([k, j]) => { if ($('add').open) $('add').close(); v81ShowRole('clinician'); openAddForm({ kind: k, jurisdiction: j || '' }); }, [kind, jur]);
      if (cid) { await pg.setInputFiles('#fl', fileOf(cid)); await pg.waitForFunction(f => { const b = document.getElementById('addScreenV148'); return b && f.includes(b.dataset.state); }, FINAL, { timeout: SCREEN_MS }).catch(() => {}); }
      if (scope) await pg.evaluate(s => { const r = document.querySelector(`input[name=licScopeV145][value=${s}]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }, scope);
      await pg.fill('#dt', '2029-12-31').catch(() => {}); await pg.check('#addExpOkV147').catch(() => {});
      const n = await pg.evaluate(() => creds.length); const a0 = alerts.length;
      const ui = await pg.evaluate(() => { const b = $('save'), f = $('addFixV148'); const vis = e => !!e && !e.classList.contains('hidden') && !e.hidden && getComputedStyle(e).display !== 'none'; return { saveOff: !b || b.disabled || !vis(b), fix: f && vis(f) ? f.textContent.trim() : '', engine: typeof captureSaveBlocker === 'function' ? captureSaveBlocker('add') : null }; });
      await pg.evaluate(() => $('save').click()); await pg.waitForTimeout(150);
      const st = await pg.evaluate(() => { const b = document.getElementById('addScreenV148'); return b ? { state: b.dataset.state, code: b.dataset.code || '', txt: b.innerText } : null; });
      return { saved: await pg.evaluate(n => creds.length > n, n), alert: alerts.slice(a0).join(' | '), st, ui };
    };
    let d = await demoTry('rv06-merged-bls-acls', 'CERT_BLS');
    t('demo: BLS+ACLS in one file → not saved, "Please upload each credential separately"', !d.saved && /Please upload each credential separately/.test(d.alert + (d.st && d.st.txt)), JSON.stringify(d));
    t('t150u E (demo): hard hold → "Add & Submit for Verification" disabled, replaced by "Upload each credential separately"; UI agrees with the engine', d.ui.saveOff && d.ui.fix === 'Upload each credential separately' && !!d.ui.engine, JSON.stringify(d.ui));
    await shot('1-demo-merged-blocked', '#add');
    await shot('5-demo-hard-hold-cta', '#add');
    d = await demoTry('rv46-lvn', 'RN_LICENSE', 'US-TX', 'SINGLE_STATE');
    t('demo: LVN license as RN → not saved, "Veridun Passport currently supports RN licenses."', !d.saved && /Veridun Passport currently supports RN licenses\./.test(d.alert + (d.st && d.st.txt)), JSON.stringify(d));
    t('t150u E (demo): LVN hold → save disabled, "Choose a supported RN credential"', d.ui.saveOff && d.ui.fix === 'Choose a supported RN credential' && !!d.ui.engine, JSON.stringify(d.ui));
    d = await demoTry('rv38-redcross-als', 'CERT_ACLS');
    t('demo: Red Cross "Advanced Life Support" as ACLS → not saved', !d.saved && /Advanced Life Support/.test(d.alert + (d.st && d.st.txt)), JSON.stringify(d));
    t('t150u E (demo): ALS-as-ACLS hold → save disabled, "Upload the correct credential"', d.ui.saveOff && d.ui.fix === 'Upload the correct credential' && !!d.ui.engine, JSON.stringify(d.ui));
    for (const k of ['CERT_PALS', 'CERT_TNCC', 'CERT_NRP', 'CERT_CEN', 'CERT_ENPC']) {
      d = await demoTry(null, k);
      const msg = d.alert + ' ' + (d.st && d.st.txt || '');
      t(`demo: ${k.replace('CERT_', '')} is held as unsupported in the RN pilot (not saved), approved wording, never "invalid"`, !d.saved && /We recognized this credential, but it isn.t supported in the RN Passport pilot yet\./.test(msg) && !/invalid|not valid|fake|fraud/i.test(msg) && !JARGON.test(msg) && d.ui.saveOff && d.ui.fix === 'Choose a supported RN credential', JSON.stringify(d));
    }
    d = await demoTry('bls-ok', 'CERT_BLS');
    t('demo control: a single BLS card is saved, with only what the nurse typed', d.saved && await pg.evaluate(() => { const c = creds[creds.length - 1]; return c.kind === 'CERT_BLS' && c.expiration === '2029-12-31'; }), JSON.stringify(d));
    t('t150u E (demo): no hold → the save button is enabled and no corrective action is shown (UI agrees with the engine)', !d.ui.saveOff && !d.ui.fix && !d.ui.engine, JSON.stringify(d.ui));
    d = await demoTry('unrecognized-doc', 'CERT_BLS');
    t('t150u C (demo): a document the check can\'t identify is not a hard block; manual entry saved, awaiting verification, no readiness credit', d.saved && d.st && d.st.state !== 'blocked' && !d.ui.saveOff && await pg.evaluate(() => { const c = creds[creds.length - 1]; return c.kind === 'CERT_BLS' && c.primary !== 'VERIFIED' && !credSatisfiesRequirement(c) && c.expiration === '2029-12-31'; }), JSON.stringify(d));
    // RN license, current-practice-through date not printed: capture allowed, no invented date, no readiness credit
    await pg.evaluate(() => { if ($('add').open) $('add').close(); openAddForm({ kind: 'RN_LICENSE', jurisdiction: 'US-MI' }); });
    await pg.check('#addExpOkV147');
    const nR = await pg.evaluate(() => creds.length); await pg.evaluate(() => $('save').click()); await pg.waitForTimeout(150);
    const rnN = await pg.evaluate(n => { const c = creds.length > n ? creds[creds.length - 1] : null; if (!c) return null; showV7View('homeView'); render(); return { kind: c.kind, exp: c.expiration || '', scope: licenseScopeOf(c), ok: credSatisfiesRequirement({ ...c, primary: 'VERIFIED', prov: { active: true } }), shown: document.body.innerText.includes('Awaiting primary-source verification') }; }, nR);
    t('t150u A (demo): RN license with no printed date → saved with no date (never invented), shows "Awaiting primary-source verification", no RN readiness even if verified', !!rnN && rnN.exp === '' && rnN.scope === 'SINGLE_STATE' && rnN.ok === false && rnN.shown, JSON.stringify(rnN));
    await pg.evaluate(() => { if ($('add').open) $('add').close(); });

    /* ---------- account (signed-in) path with the in-page fake backend ---------- */
    await pg.evaluate(FAKE);
    await pg.evaluate(async () => { await store.account.hydrate(); acctShow('acctPassportV10'); });
    const openAdd = async (kind, jur) => {
      await pg.evaluate(() => { acctRenderAll(); });
      await pg.waitForSelector('[data-act="toggle-add"]'); await pg.evaluate(() => document.querySelector('[data-act="toggle-add"]').click());
      await pg.waitForSelector('#acctKindV10'); await pg.selectOption('#acctKindV10', kind);
      if (jur) await pg.evaluate(j => { const s = $('acctJurV10'); s.value = j; s.dispatchEvent(new Event('change', { bubbles: true })); }, jur);
    };
    const screen = async id => { await pg.setInputFiles('#acctFileV10', fileOf(id)); await pg.waitForFunction(f => { const b = document.getElementById('acctScreenBoxV148'); return b && f.includes(b.dataset.state); }, FINAL, { timeout: SCREEN_MS }).catch(() => {}); await pg.waitForTimeout(100); return pg.evaluate(() => { const b = document.getElementById('acctScreenBoxV148'); return { state: b && b.dataset.state, code: b && b.dataset.code || '', box: b ? b.innerText : '', exp: $('acctExpV10').value, scopes: document.querySelectorAll('input[name=acctLicTypeV10]:checked').length, fields: document.querySelectorAll('#acctAddFormV10 .scan-field-v14').length, form: $('acctAddFormV10').innerText }; }); };
    const submit = async () => { const n = await pg.evaluate(() => { const m = $('acctWsMsgV10'); if (m) m.textContent = ''; return __fakeDb.credentials.length; }); await pg.evaluate(() => document.querySelector('#acctAddFormV10 button[type=submit]').click()); await pg.waitForTimeout(450); const row = await pg.evaluate(n => __fakeDb.credentials.length > n ? __fakeDb.credentials[__fakeDb.credentials.length - 1] : null, n); return { row, msg: await pg.evaluate(() => ($('acctWsMsgV10') || {}).textContent || '') }; };
    const tick = async () => { await pg.evaluate(() => { const c = $('acctExpOkV147'); if (c && c.offsetParent && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } }); };
    let unsafeHere = 0;
    for (const c of CASES.filter(x => !process.env.ONLY || process.env.ONLY.split(',').includes(x.id))) {
      const blockExp = c.expect !== 'CLEAR';
      // lazy nurse: picks the claimed type, uploads, ticks whatever is there, types nothing
      await openAdd(c.kind, c.jur);
      const s = await screen(c.id);
      const leaked = (c.secrets || []).filter(x => s.form.includes(x));
      const stateOk = blockExp ? (s.state === 'blocked' && (c.expect === 'BLOCK_ANY' || s.code === c.expect)) : s.state === 'clear';
      t(`site path ${c.id}: screening ${blockExp ? 'blocks (' + c.expect + ')' : 'is clear'}`, stateOk, JSON.stringify({ state: s.state, code: s.code, box: s.box.slice(0, 160) }));
      t(`site path ${c.id}: nothing prefilled (expiration empty, no scope chosen, no read-back values)`, s.exp === '' && s.scopes === 0 && s.fields === 0 && leaked.length === 0, JSON.stringify({ exp: s.exp, scopes: s.scopes, fields: s.fields, leaked }));
      const ui = await pg.evaluate(() => { const b = document.querySelector('#acctAddFormV10 button[type=submit]'), f = $('acctFixV148'); const vis = e => !!e && !e.classList.contains('hidden') && !e.hidden && getComputedStyle(e).display !== 'none'; return { saveOff: !b || b.disabled || !vis(b), fix: f && vis(f) ? f.textContent.trim() : '', engine: captureSaveBlocker('acct') }; });
      const CTA = { MULTIPLE: 'Upload each credential separately', LVN_LPN: 'Choose a supported RN credential', UNSUPPORTED_KIND: 'Choose a supported RN credential', ALS_NOT_ACLS: 'Upload the correct credential', TYPE_MISMATCH: 'Upload the correct credential', UNSUPPORTED_DOC: 'Upload the correct credential' };
      t(`site path ${c.id}: t150u E save button and corrective action agree with the safety engine`, s.state === 'blocked' ? (ui.saveOff && ui.fix === CTA[s.code] && !!ui.engine) : (!ui.saveOff && !ui.fix && !ui.engine), JSON.stringify({ ui, state: s.state, code: s.code }));
      if (c.id === 'rv06-merged-bls-acls') { await shot('2-account-merged-blocked', '#acctAddFormV10'); await shot('6-account-hard-hold-cta', '#acctAddFormV10'); }
      if (c.id === 'unrecognized-doc') await shot('7-account-unrecognized-manual', '#acctAddFormV10');
      if (c.id === 'rv46-lvn') await shot('4-account-lvn-blocked', '#acctAddFormV10');
      await tick();
      const lazy = await submit();
      const lazyUnsafe = !!lazy.row && (blockExp || lazy.row.expires_on || (lazy.row.metadata && lazy.row.metadata.compact_privilege_source && lazy.row.metadata.compact_privilege_source !== 'automatic'));
      // t150u A: an RN license may be captured with no date (only after the license-specific "not printed" tick); it never stores an untyped date
      t(`site path ${c.id}: lazy nurse ${blockExp ? 'cannot save' : 'cannot save values she did not type'}`, !lazyUnsafe && (!/RN_LICENSE/.test(c.kind) || !lazy.row || (!lazy.row.expires_on && lazy.row.metadata.compact_privilege_source === 'automatic' && lazy.row.metadata.exp_confirm && lazy.row.metadata.exp_confirm.source === 'NONE_PRINTED')), JSON.stringify({ saved: !!lazy.row, msg: lazy.msg.slice(0, 160) }));
      if (blockExp) t(`site path ${c.id}: plain-language reason shown`, c.expect === 'MULTIPLE' ? /Please upload each credential separately/.test(s.box + lazy.msg) : c.expect === 'LVN_LPN' ? /Veridun Passport currently supports RN licenses\./.test(s.box + lazy.msg) : (s.box + lazy.msg).length > 20 && !JARGON.test(s.box + lazy.msg), (s.box + ' | ' + lazy.msg).slice(0, 300));
      // strict nurse: types the details herself
      let strict = { row: null };
      if (!lazy.row) {
        await pg.fill('#acctExpV10', '2029-12-31').catch(e => { if (process.env.DEBUG) console.log('fill failed', c.id, e.message.slice(0, 300)); });
        await pg.evaluate(() => { const r = document.querySelector('input[name=acctLicTypeV10][value=SINGLE]'); if (r && r.offsetParent) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } });
        await tick(); strict = await submit();
      }
      const row = lazy.row || strict.row;
      if (blockExp) t(`site path ${c.id}: still blocked when the nurse types everything`, !strict.row, JSON.stringify(strict.row));
      else {
        const meta = row ? Object.keys(row.metadata || {}) : [];
        const js = row ? JSON.stringify(row) : '';
        t(`site path ${c.id}: saved with exactly what the nurse typed; only database fields (no number/name/issue date in metadata)`, !!row && (lazy.row ? !row.expires_on : row.expires_on === '2029-12-31') && meta.every(k => META_OK.includes(k)) && !/holder_name|credential_number|issued_on|"doc"/.test(js) && !(c.secrets || []).some(x => js.includes(x)), JSON.stringify({ exp: row && row.expires_on, meta, msg: strict.msg }));
      }
      const unsafe = (blockExp && !!row) || lazyUnsafe || leaked.length > 0 || s.exp !== '' || s.scopes !== 0;
      if (unsafe) { unsafeHere++; UNSAFE.push(`${tag}: ${c.id}`); }
      await pg.evaluate(() => { acctScan = null; if (typeof acctScreenReset === 'function') acctScreenReset(); acctRenderAll(); });
    }
    t(`site path synthetic set: UNSAFE ACCEPTANCES = ${unsafeHere} (target 0)`, unsafeHere === 0, String(unsafeHere));

    // account: license scope from the primary state of residence is not preselected
    await pg.evaluate(() => { acct().cache.profile.home_jurisdiction = 'US-AZ'; });
    await openAdd('RN_LICENSE', 'US-AZ');
    const sc = await pg.evaluate(() => ({ n: document.querySelectorAll('input[name=acctLicTypeV10]:checked').length, src: ($('acctLicScopeSrcV145') || {}).innerText || '' }));
    t('account: no license scope preselected for a license from the primary state of residence', sc.n === 0 && !/default/i.test(sc.src), JSON.stringify(sc));
    await tick(); // expiration left empty here: WebKit can't clear a filled date input reliably under automation
    let sb = await submit();
    t('account: save blocked until the license scope is chosen', !sb.row && /scope/i.test(sb.msg), sb.msg);
    // t150u A: RN date wording; the license-specific "not printed" tick
    await pg.evaluate(() => { const r = document.querySelector('input[name=acctLicTypeV10][value=MULTI]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); });
    const atx = await pg.evaluate(() => ({ none: $('acctExpOkTextV147').textContent, lbl: (document.querySelector('label[for=acctExpV10]') || {}).innerText || '' }));
    t('t150u A (account): the RN date field asks for the current-practice-through date; the tick is license-specific (not "No expiration date on this document")', /current-practice-through/i.test(atx.lbl) && /current-practice-through date isn.t printed/i.test(atx.none), JSON.stringify(atx));
    await pg.fill('#acctExpV10', '2028-10-31'); await tick();
    sb = await submit();
    t('account: saved with the chosen scope; name "Arizona RN License · Multistate"', !!sb.row && sb.row.display_name === 'Arizona RN License · Multistate' && sb.row.metadata.compact_privilege_type === 'MULTISTATE' && sb.row.metadata.compact_privilege_source === 'chosen', JSON.stringify(sb.row && { n: sb.row.display_name, m: sb.row.metadata }));
    await pg.evaluate(() => { acct().cache.profile.home_jurisdiction = 'US-CA'; acctRenderAll(); });
    const card = await pg.evaluate(() => $('acctPassportV10') ? $('acctPassportV10').innerText : document.body.innerText);
    const cm = card.match(JARGON);
    t('account Passport cards: no codes ("US-AZ", "RN_LICENSE", "60-second")', !cm, cm && card.slice(Math.max(0, cm.index - 60), cm.index + 60));
    t('account: no "Re-scan document" (the reader no longer fills saved credentials)', !(await pg.evaluate(() => !!document.querySelector('[data-act="doc-rescan"]'))));

    /* ---------- t150u B: non-compact state → single-state automatically; A: RN date not printed (account) ---------- */
    await openAdd('RN_LICENSE', 'US-MI');
    const nc = await pg.evaluate(() => ({ fixed: !$('acctLicScopeFixedV145').classList.contains('hidden') && !$('acctLicScopeFixedV145').closest('.hidden'), txt: $('acctLicScopeFixedV145').innerText, choice: !$('acctLicScopeChoiceV145').classList.contains('hidden'), checked: document.querySelectorAll('input[name=acctLicTypeV10]:checked').length, scope: acctLicenseScope() }));
    t('t150u B: Michigan (not in the compact) → single-state automatically with a short explanation; nothing to choose', nc.fixed && /Single-state/.test(nc.txt) && /Michigan doesn.t issue multistate licenses/.test(nc.txt) && !nc.choice && nc.checked === 0 && nc.scope === 'SINGLE_STATE', JSON.stringify(nc));
    await shot('8-account-noncompact-single', '#acctAddFormV10');
    await tick(); sb = await submit();
    t('t150u A (account): RN license saved with no date (the nurse ticked "not printed"); scope single-state, automatic; nothing invented', !!sb.row && sb.row.expires_on == null && sb.row.metadata.compact_privilege_type === 'SINGLE_STATE' && sb.row.metadata.compact_privilege_source === 'automatic' && sb.row.metadata.exp_confirm && sb.row.metadata.exp_confirm.source === 'NONE_PRINTED', JSON.stringify(sb.row && { e: sb.row.expires_on, m: sb.row.metadata }));
    const mid = sb.row && sb.row.id;
    const aw = await pg.evaluate(id => { acctRenderAll(); const el = document.querySelector(`[data-cred-card="${id}"]`) || $('acctPassportV10'); return { txt: el ? el.innerText : '' }; }, mid);
    t('t150u A (account): the card shows the date as "Awaiting primary-source verification"', /Awaiting primary-source verification/.test(aw.txt), aw.txt.slice(0, 300));
    await shot('9-account-rn-awaiting-date', '#acctPassportV10');
    // even when verified, a license with no authoritative date gets no RN readiness credit for Michigan
    const vr = await pg.evaluate(async id => { const r = __fakeDb.credentials.find(c => c.id === id); r.status = 'VERIFIED'; r.verification_level = 'PRIMARY_SOURCE_VERIFIED'; await store.account.hydrate(); const it = acctReadinessItems(acct().cache.profile, 'US-MI', 'TRAVEL_RN').items.find(i => i.req && i.req.kind === RN_AUTHORIZATION); r.expires_on = '2029-03-31'; await store.account.hydrate(); const it2 = acctReadinessItems(acct().cache.profile, 'US-MI', 'TRAVEL_RN').items.find(i => i.req && i.req.kind === RN_AUTHORIZATION); return { without: it && it.status, withDate: it2 && it2.status }; }, mid);
    t('t150u A (account): a verified RN license with no current-practice-through date is not MET; with one it is', vr.without !== 'MET' && vr.withDate === 'MET', JSON.stringify(vr));
    await pg.evaluate(id => { const r = __fakeDb.credentials.find(c => c.id === id); r.status = 'VERIFYING'; r.verification_level = null; }, mid);

    /* ---------- t150u C: unchecked file type → manual path (account) ---------- */
    await openAdd('CERT_BLS');
    await pg.setInputFiles('#acctFileV10', { name: 'card.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK synthetic docx, not a real credential') });
    await pg.waitForFunction(f => { const b = document.getElementById('acctScreenBoxV148'); return b && f.includes(b.dataset.state); }, FINAL, { timeout: SCREEN_MS }).catch(() => {});
    const dx = await pg.evaluate(() => ({ st: $('acctScreenBoxV148').dataset.state, txt: $('acctScreenBoxV148').innerText, off: document.querySelector('#acctAddFormV10 button[type=submit]').disabled }));
    await pg.fill('#acctExpV10', '2029-12-31'); await tick(); sb = await submit();
    t('t150u C (account): a file that can\'t be checked → no hard block; typed details saved, awaiting verification', dx.st !== 'blocked' && !dx.off && !!sb.row && sb.row.status !== 'VERIFIED' && sb.row.expires_on === '2029-12-31', JSON.stringify({ dx, row: sb.row && { s: sb.row.status, e: sb.row.expires_on } }));

    /* ---------- t150u D (account): stored display_name untouched; label rendered from structured fields ---------- */
    const ad = await pg.evaluate(async () => { const id = __fakeSeed({ kind: 'RN_LICENSE', type_code: 'RN_LICENSE:US-AZ', display_name: 'Multistate RN License (NLC · home: Arizona)', jurisdiction_code: 'US-AZ', expires_on: '2029-01-31', metadata: { compact_privilege_type: 'MULTISTATE' } }); const before = JSON.stringify(__fakeDb.credentials.find(c => c.id === id)); await store.account.hydrate(); acctRenderAll(); const after = JSON.stringify(__fakeDb.credentials.find(c => c.id === id)); return { same: before === after, page: $('acctPassportV10').innerText.includes('Arizona RN License · Multistate'), legacy: $('acctPassportV10').innerText.includes('Multistate RN License') }; });
    t('t150u D (account): stored record byte-identical after load; card label rendered from state + scope; legacy text not shown', ad.same && ad.page && !ad.legacy, JSON.stringify(ad));

    /* ---------- 3. verifier evidence starts empty ---------- */
    const vid = await pg.evaluate(async b => {
      const f = new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], 'bls.pdf', { type: 'application/pdf' });
      const id = __fakeSeed({ kind: 'CERT_BLS', type_code: 'CERT_BLS', display_name: 'BLS — Basic Life Support', expires_on: '2028-05-08', jurisdiction_code: null }, f);
      await store.account.hydrate(); acctRenderAll(); return id;
    }, B64['bls-ok']);
    await pg.evaluate(() => document.querySelector('.acctTab[data-target="acctVerifyV12"]').click());
    await pg.waitForFunction(id => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), vid, { timeout: 30000 });
    await pg.evaluate(id => document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`).click(), vid);
    await pg.waitForSelector('#acctVerifyFormV12[data-mode="registry"]');
    const vf = await pg.evaluate(() => ({ exp: $('acctVerifyExpV13').value, ref: $('acctVerifyRefV12').value, read: !!$('acctVReadV14'), note: ($('acctVerifyExpNoteV14') || {}).innerText || '' }));
    t('verifier: "Expiration shown by the source" and "Reference" start empty (no prefill)', vf.exp === '' && vf.ref === '', JSON.stringify(vf));
    t('verifier: the nurse\'s date is shown beside the field for comparison only', /May 8, 2028/.test(vf.note) && /nurse/i.test(vf.note), vf.note);
    t('verifier: no on-device reader filling evidence', !vf.read);
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
  console.log(`UNSAFE ACCEPTANCES (site path, synthetic set, all profiles): ${UNSAFE.length}${UNSAFE.length ? ' — ' + UNSAFE.join(', ') : ''}`);
  if (srv) srv.close();
  const f = R.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${R.length - f}/${R.length} passed`);
  process.exit(f ? 1 : 0);
})();
