/* v14.5: ONE "RN License" credential type and ONE license-scope field (multistate vs single-state).
   Synthetic license PDFs only (fake names/numbers/dates, "NOT A REAL CREDENTIAL" banner):
     MI  Michigan (not in the NLC)  → single-state automatically, fixed line, no choice
     TX  Texas, "Multistate License" printed → choice pre-filled from the document
     ME  Maine, scope not printed   → default (multistate for the residence state), marked "not shown on the document"
     TXr Texas, residence Maine     → default single-state, the residence sentence explains why
   Also: stored data compatibility (older RN_LICENSE_MULTISTATE entries), the demo add form, wording.
   Run: BASE=http://localhost:8765/ node backend/tests/p145.js */
const fs = require('fs');
const path = require('path');
const { buildPdf } = require('./lib/mini-pdf');
const { BANNER } = require('./p144-fixtures.js');
const BASE = process.env.BASE || 'http://localhost:8765/';
const R = [];
const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (i !== '' && i != null ? ' — ' + String(i).slice(0, 300) : ''); R.push(l); console.log(l); };
const W = ms => new Promise(r => setTimeout(r, ms));

const LIC = {
  MI: ['STATE OF MICHIGAN', 'Department of Licensing and Regulatory Affairs', 'Michigan Board of Nursing', 'Registered Nurse', 'Name: Testa Fakename', 'License Number: 4799000011', 'Expiration Date: 03/31/2029'],
  TX: ['Texas Board of Nursing', 'Registered Nurse - Multistate License', 'Name: Testa Fakename', 'License Number: 000123456', 'Expiration Date: 01/31/2029'],
  ME: ['STATE OF MAINE', 'Maine State Board of Nursing', 'Registered Professional Nurse', 'Name: Testa Fakename', 'License Number: RN0000777', 'Expiration Date: 11/30/2028'],
  NIH: ['American Heart Association', 'NIH Stroke Scale Recertification', 'Testa Fakename', 'has successfully completed the NIH Stroke Scale', 'Test Group B', 'Date Completed: 02/10/2025', 'Certificate Number: IPA25ZZ00000002'],
  TXN: ['Texas Board of Nursing', 'Registered Nurse', 'Name: Testa Fakename', 'License Number: 000654321', 'Expiration Date: 01/31/2029'],
};
const pdf = lines => buildPdf([{ text: [{ s: BANNER, x: 230, y: 590, size: 10, bold: true }, ...lines.map((s, i) => ({ s, x: 80, y: 520 - i * 28, size: 13 }))] }]);

(async () => {
  const dir = '/tmp/p145-fixtures'; fs.mkdirSync(dir, { recursive: true });
  const file = k => { const p = path.join(dir, k.toLowerCase() + '.pdf'); fs.writeFileSync(p, pdf(LIC[k])); return p; };
  const files = Object.fromEntries(Object.keys(LIC).map(k => [k, file(k)]));
  if (process.env.WRITE_XB) for (const k of ['MI', 'TX', 'NIH']) fs.copyFileSync(files[k], path.join(__dirname, 'fixtures', 'xb-lic-' + k.toLowerCase() + '.pdf'));
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  try {
    const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
    await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await pg.goto(BASE, { waitUntil: 'networkidle2' });
    const tap = async sel => { await pg.waitForSelector(sel, { timeout: 15000 }); await pg.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await W(100); await pg.evaluate(s => document.querySelector(s).click(), sel); };
    const waitScan = () => pg.waitForFunction(() => { const b = document.getElementById('acctScanBoxV14'); return b && ['done', 'error', 'unsupported'].includes(b.dataset.state); }, { timeout: 90000 });
    await pg.evaluate(require('./p14-fake.js'));
    await pg.evaluate(async () => { await store.account.hydrate(); acctShow('acctPassportV10'); }); await W(300);
    const vis = id => `(()=>{const e=document.getElementById('${id}');return !!e&&!e.closest('.hidden')&&!e.classList.contains('hidden')})()`;
    const state = () => pg.evaluate(new Function(`return {
      fixed: ${vis('acctLicScopeFixedV145')}, fixedText: document.getElementById('acctLicScopeFixedV145').innerText,
      choice: ${vis('acctLicScopeChoiceV145')}, checked: (document.querySelector('input[name=acctLicTypeV10]:checked')||{}).value||null,
      src: document.getElementById('acctLicScopeSrcV145').innerText, doc: document.getElementById('acctLicScopeDocV145').innerText,
      note: document.getElementById('acctLicenseNoteV10').innerText,
      scanMulti: [...document.querySelectorAll('#acctScanBoxV14 .scan-row-v14[data-field="multistate"]')].map(x => !x.classList.contains('hidden')),
      box: (document.getElementById('acctScanBoxV14')||{}).innerText||'',
      scope: acctLicenseScope(), source: acctLicenseScopeSource() }`));
    const open = async (home, jur, f) => {
      await pg.evaluate(h => { acct().cache.profile.home_jurisdiction = h; acctScan = null; acctRenderAll(); }, home); await W(150);
      await tap('[data-act="toggle-add"]'); await W(150);
      await pg.select('#acctKindV10', 'RN_LICENSE'); await W(80);
      await pg.select('#acctJurV10', jur); await W(80);
      if (f) { await (await pg.$('#acctFileV10')).uploadFile(f); await W(200); await waitScan(); await W(200); }
      return state();
    };
    const save = async () => { await tap('#acctScanConfirmV14'); await tap('#acctAddFormV10 button[type=submit]'); await W(700);
      return pg.evaluate(() => { const c = __fakeDb.credentials.filter(x => /^RN_LICENSE/.test(x.kind)).pop(); return c && { kind: c.kind, name: c.display_name, type: c.type_code, scope: c.metadata.compact_privilege_type, src: c.metadata.compact_privilege_source, mm: c.metadata.doc && c.metadata.doc.mismatch_fields }; }); };

    const opts = await pg.evaluate(() => { const host = document.createElement('div'); host.innerHTML = acctAddForm(); return [...host.querySelectorAll('#acctKindV10 option')].map(o => [o.value, o.textContent]).filter(([v]) => /^RN_LICENSE/.test(v)); });
    ok('P1 one credential type "RN License" (no single-state / multistate types offered)', opts.length === 1 && opts[0][0] === 'RN_LICENSE' && opts[0][1] === 'RN License', JSON.stringify(opts));

    const mi = await open('US-ME', 'US-MI', files.MI);
    ok('P2 Michigan (not in the NLC): single-state set automatically, shown once as a fixed line, no choice', mi.fixed && !mi.choice && /Single-state/.test(mi.fixedText) && /set automatically/.test(mi.fixedText) && mi.scope === 'SINGLE_STATE' && mi.source === 'automatic', JSON.stringify(mi));
    ok('P3 Michigan: explanation is about Michigan; residence (Maine) only to say multistate licenses come from it', /Michigan isn't in the Nurse Licensure Compact, so a Michigan license covers Michigan only/.test(mi.note) && /Multistate licenses are issued by your primary state of residence \(Maine\)\. This license is from Michigan, so it covers Michigan only\./.test(mi.note) && !/Maine is a compact state|defaults to multistate|a license from Maine/.test(mi.note), mi.note);
    ok('P4 the scan box no longer has its own "Multistate (compact)" select', mi.scanMulti.length === 1 && !mi.scanMulti[0] && !/Multistate \(compact\)/.test(mi.box), JSON.stringify(mi.scanMulti));
    const sMi = await save();
    ok('P5 saved as RN_LICENSE + compact_privilege_type SINGLE_STATE (automatic); never a separate multistate kind', sMi && sMi.kind === 'RN_LICENSE' && sMi.scope === 'SINGLE_STATE' && sMi.src === 'automatic' && sMi.name === 'Michigan RN License' && sMi.type === 'RN_LICENSE:US-MI', JSON.stringify(sMi));

    const tx = await open('US-TX', 'US-TX', files.TX);
    ok('P6 Texas (compact), "Multistate License" printed: one choice, pre-filled multistate, "from document, check it · NN%"', tx.choice && !tx.fixed && tx.checked === 'MULTI' && /^from document, check it · \d+%$/.test(tx.src.trim()) && !tx.doc, JSON.stringify(tx));
    await tap('input[name=acctLicTypeV10][value=SINGLE]'); await W(150);
    const txc = await state();
    ok('P7 choosing single-state against the document shows a mismatch note under the one field', /The document shows a multistate license, but you chose single-state/.test(txc.doc) && /flagged for the verifier/.test(txc.doc) && !/from document/.test(txc.src), JSON.stringify(txc));
    await tap('#acctLicUseDocScopeV145'); await W(150);
    const txb = await state();
    ok('P8 "Use the document\'s scope" restores multistate and the mark', txb.checked === 'MULTI' && /from document/.test(txb.src) && !txb.doc, JSON.stringify(txb));
    const sTx = await save();
    ok('P9 saved as RN_LICENSE + MULTISTATE (from the document); name "Multistate RN License (NLC · home: Texas)"', sTx && sTx.kind === 'RN_LICENSE' && sTx.scope === 'MULTISTATE' && sTx.src === 'document' && /^Multistate RN License \(NLC · home: Texas\)$/.test(sTx.name) && !(sTx.mm || []).includes('multistate'), JSON.stringify(sTx));

    const me = await open('US-ME', 'US-ME', files.ME);
    ok('P10 Maine (compact), scope not printed: default multistate (residence state), marked "not shown on the document · default"', me.choice && me.checked === 'MULTI' && /not shown on the document · default/.test(me.src) && me.source === 'default', JSON.stringify(me));
    ok('P11 Maine: explanation about Maine as license state and residence; no Michigan/other-state text', /Maine is a compact state and your primary state of residence/.test(me.note) && /Multistate \(compact\): Maine \+/.test(me.note), me.note);
    await pg.evaluate(() => { acctScan = null; acctRenderAll(); });

    const txr = await open('US-ME', 'US-TX', files.TXN);
    ok('P12 residence (Maine) differs from the license state (Texas): default single-state; sentence names both correctly', txr.choice && txr.checked === 'SINGLE' && /Multistate licenses are issued by your primary state of residence \(Maine\)\. This license is from Texas/.test(txr.note) && !/Maine is a compact state/.test(txr.note), JSON.stringify(txr));
    await pg.evaluate(() => { acctScan = null; acctRenderAll(); });

    const ma = await open('US-ME', 'US-MA', null);
    ok('P13 Massachusetts (compact enacted, not implemented): single-state automatically, no choice', ma.fixed && !ma.choice && ma.scope === 'SINGLE_STATE' && /can't issue multistate licenses yet/.test(ma.note), JSON.stringify(ma));
    const none = await pg.evaluate(() => { acct().cache.profile.home_jurisdiction = null; $('acctJurV10').value = 'US-MI'; acctLicenseNote(); return $('acctLicenseNoteV10').innerText; });
    ok('P14 no residence set + Michigan: no residence sentence at all', /covers Michigan only/.test(none) && !/primary state of residence/.test(none), none);
    await pg.evaluate(() => { acct().cache.profile.home_jurisdiction = 'US-CA'; acctScan = null; acctRenderAll(); });

    // v14.5: the expiration field's origin (document vs typed) — no stale values across files / types
    const ex = () => pg.evaluate(() => ({ v: $('acctExpV10').value, o: $('acctExpV10').dataset.origin || null, src: $('acctExpSrcV144').innerText, note: $('acctExpNoteV144').innerText, sug: !!$('acctScanSuggestV144'), kind: acctScan && acctScan.kind }));
    const up = async f => { await (await pg.$('#acctFileV10')).uploadFile(f); await W(200); await waitScan(); await W(250); };
    await open('US-ME', 'US-MI', files.MI);
    const e1 = await ex();
    ok('Q1 license scan fills the expiration (origin: document)', e1.v === '2029-03-31' && e1.o === 'document' && /from document/.test(e1.src), JSON.stringify(e1));
    await pg.select('#acctKindV10', 'CERT_NIHSS'); await W(200); await waitScan(); await W(150);
    await up(files.NIH);
    const e2 = await ex();
    ok('Q2 switch type to NIHSS + upload an NIHSS with no printed expiration: the license date is gone, field empty, "not printed"', e2.kind === 'CERT_NIHSS' && e2.v === '' && !e2.o && /not printed on the document/.test(e2.src) && /No expiration printed on this certificate/.test(e2.note), JSON.stringify(e2));
    ok('Q3 NIHSS: the calculated suggested renewal is still shown separately (not in the expiration field)', e2.sug, JSON.stringify(e2));
    await pg.evaluate(() => { acctScan = null; acctRenderAll(); });
    await open('US-ME', 'US-MI', files.MI);
    await up(files.TXN);
    const e3 = await ex();
    ok('Q4 a new file replaces the previous document-filled date with the new document\'s date', e3.v === '2029-01-31' && e3.o === 'document' && /from document/.test(e3.src), JSON.stringify(e3));
    await pg.evaluate(() => { const f = $('acctFileV10'); f.value = ''; f.dispatchEvent(new Event('change', { bubbles: true })); }); await W(200);
    const e4 = await ex();
    ok('Q5 removing the file clears the document-filled date', e4.v === '' && !e4.o, JSON.stringify(e4));
    await pg.evaluate(() => { acctScan = null; acctRenderAll(); });
    await open('US-ME', 'US-MI', null);
    await pg.evaluate(() => { const e = $('acctExpV10'); e.value = '2030-01-01'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await up(files.MI);
    const e5 = await ex();
    ok('Q6 a typed date is kept when a file is scanned; mismatch note shown', e5.v === '2030-01-01' && e5.o === 'user' && /doesn't match the document/.test(e5.note), JSON.stringify(e5));
    await pg.select('#acctKindV10', 'CERT_NIHSS'); await W(200); await waitScan(); await W(150);
    await up(files.NIH);
    const e6 = await ex();
    ok('Q7 the typed date survives a type switch and a new file with no printed expiration ("the date you typed is kept")', e6.v === '2030-01-01' && e6.o === 'user' && /date you typed is kept/.test(e6.note), JSON.stringify(e6));
    await pg.evaluate(() => { acctScan = null; acctRenderAll(); });
    // stored-data compatibility
    const compat = await pg.evaluate(() => {
      const legacy = v81Normalize({ id: 1, kind: 'RN_LICENSE_MULTISTATE', jurisdiction: 'US-AZ', name: 'x', primary: 'VERIFIED', prov: { active: true } });
      const single = v81Normalize({ id: 2, kind: 'RN_LICENSE', jurisdiction: 'US-CA', name: 'y' });
      const acctLegacy = { kind: 'RN_LICENSE_MULTISTATE', jurisdiction: 'US-AZ' }, acctNew = { kind: 'RN_LICENSE', jurisdiction: 'US-AZ', metadata: { compact_privilege_type: 'MULTISTATE' } };
      const tx = { kind: RN_AUTHORIZATION, jurisdiction: 'US-TX' }, ca = { kind: RN_AUTHORIZATION, jurisdiction: 'US-CA' };
      return { legacy: [legacy.kind, legacy.compact_privilege_type], single: [single.kind, single.compact_privilege_type],
        scopes: [licenseScopeOf(acctLegacy), licenseScopeOf(acctNew), licenseScopeOf({ kind: 'RN_LICENSE' })],
        cover: [!!satisfactionBasis(tx, acctNew), !!satisfactionBasis(tx, acctLegacy), !!satisfactionBasis(ca, acctNew), !!satisfactionBasis(tx, legacy)],
        shared: [assertionLicenseRuleKind({ kind: 'RN_LICENSE', label: 'Multistate RN License (NLC · home: Arizona)' }), assertionLicenseRuleKind({ kind: 'RN_LICENSE', label: 'Arizona RN License' }), assertionLicenseRuleKind({ kind: 'RN_LICENSE_MULTISTATE', label: 'x' })],
        picker: pickerCatalog().some(k => k.kind === 'RN_LICENSE_MULTISTATE'), seed: demoSeedCredentials().filter(c => isRnLicense(c)).map(c => [c.kind, c.compact_privilege_type, c.jurisdiction]) };
    });
    ok('P15 older RN_LICENSE_MULTISTATE entries read as RN_LICENSE + MULTISTATE (demo data migrated on load)', compat.legacy.join() === 'RN_LICENSE,MULTISTATE' && compat.single.join() === 'RN_LICENSE,SINGLE_STATE' && compat.scopes.join() === 'MULTISTATE,MULTISTATE,SINGLE_STATE', JSON.stringify(compat));
    ok('P16 compact coverage works for both storages (AZ multistate covers TX, not CA)', compat.cover.join() === 'true,true,false,true', JSON.stringify(compat.cover));
    ok('P17 shared assertions (kind + label only) keep compact coverage', compat.shared.join() === 'RN_LICENSE_MULTISTATE,RN_LICENSE,RN_LICENSE_MULTISTATE', JSON.stringify(compat.shared));
    ok('P18 the legacy kind is never offered in a picker; demo seed licenses are RN_LICENSE with a scope', !compat.picker && compat.seed.length >= 2 && compat.seed.every(([k, s]) => k === 'RN_LICENSE' && ['MULTISTATE', 'SINGLE_STATE'].includes(s)), JSON.stringify(compat.seed));

    // demo add form
    const demo = await pg.evaluate(() => {
      const labels = [...document.querySelectorAll('#kindListV82 option')].map(o => o.value);
      $('kindSearchV82').value = 'RN License'; $('jurSearchV82').value = 'Michigan'; v81SyncAddForm();
      const mi = { fixed: !$('licScopeFixedV145').classList.contains('hidden'), choice: !$('licScopeChoiceV145').classList.contains('hidden'), note: $('licScopeNoteV145').innerText, hint: $('jurHintV82').innerText };
      $('jurSearchV82').value = 'Texas'; v81SyncAddForm();
      const tx = { fixed: !$('licScopeFixedV145').classList.contains('hidden'), choice: !$('licScopeChoiceV145').classList.contains('hidden'), checked: (document.querySelector('input[name=licScopeV145]:checked') || {}).value };
      return { labels: labels.filter(l => /RN License/.test(l)), mi, tx };
    });
    ok('P19 demo add form: one "RN License" type; Michigan fixed single-state, Texas a choice (residence Arizona → single-state default)', demo.labels.join() === 'RN License' && demo.mi.fixed && !demo.mi.choice && /covers Michigan only/.test(demo.mi.note) && demo.tx.choice && demo.tx.checked === 'SINGLE_STATE', JSON.stringify(demo));
    // wording: no user-facing text talks about the residence state as if it were the license state
    const src = ['account.js', 'credential-catalog.js', 'roles/clinician.js'].map(f => fs.readFileSync(path.join(__dirname, '..', '..', 'js', f), 'utf8')).join('\n');
    ok('P20 the old "Your primary state of residence, X, is a compact state, so a license from X defaults to multistate" text is gone', !/is a compact state, so a license from/.test(src) && !/RN License — single-state/.test(src) && !/choose “RN License — multistate/.test(src));
    ok('P21 no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  } finally { await browser.close(); }
  const pass = R.filter(l => l.startsWith('PASS')).length, fail = R.filter(l => l.startsWith('FAIL')).length;
  console.log(`\np145: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
