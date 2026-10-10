#!/usr/bin/env node
/* v14.8 trust hardening — XRPL credential identity (Anchor + Resolver roles; Sentinel role checks
   readiness did not change). Cross-browser, no network: an in-page, stateful XRPL ledger mock that
   enforces the real CredentialCreate uniqueness rule (one Credential object per
   Subject + Issuer + CredentialType → tecDUPLICATE) and CredentialAccept (lsfAccepted = 0x00010000).
   No Mainnet, no Devnet traffic, no database writes. Synthetic data only.
   Covers: CA RN + MA RN at once; two BLS generations; renewal/replacement; issue → accept →
   Passport → public validation; legacy (pre-v14.8) proofs; duplicate attempts (double issue,
   re-issue after failure, colliding ids); DOM-id uniqueness; readiness unchanged.
   Usage: node backend/tests/p148x.js   (BASE=<url> tests a deployed site; ENGINES=webkit narrows it) */
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
const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (i !== '' && i != null && !c ? ' — ' + String(i).slice(0, 500) : ''); R.push(l); console.log(l); return c; };

/* Stateful XRPL mock. State lives in localStorage ('xl') so it survives navigation to the public
   Passport page in the same tab. */
const LEDGER_MOCK = () => {
  const st = () => JSON.parse(localStorage.getItem('xl') || '{"objs":[],"txs":{},"n":0,"w":0,"log":[]}');
  const put = s => localStorage.setItem('xl', JSON.stringify(s));
  const toHex = s => [...new TextEncoder().encode(s)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const W = seed => ({ seed, address: 'r' + seed, sign: p => { const s = st(); s.n++; const h = 'H' + String(s.n).padStart(4, '0'); put(s); return { hash: h, tx_blob: JSON.stringify(p) }; } });
  class Client { constructor() { this.c = false; } async connect() { this.c = true; } isConnected() { return this.c; } async disconnect() { this.c = false; }
    async getLedgerIndex() { return 1000; }
    async autofill(tx) { return { ...tx, LastLedgerSequence: 2000 }; }
    async fundWallet() { const s = st(); s.w++; put(s); return { wallet: W(s.w === 1 ? 'ISSUER' : s.w === 2 ? 'SUBJECT' : 'W' + s.w) }; }
    async submitAndWait(blob) {
      const tx = JSON.parse(blob), s = st(); const hash = 'H' + String(s.n).padStart(4, '0'); let code = 'tesSUCCESS';
      const ct = String(tx.CredentialType || '');
      if (!ct || ct.length > 128 || ct.length % 2 || !/^[0-9A-F]+$/i.test(ct)) code = 'temMALFORMED';
      else if (tx.TransactionType === 'CredentialCreate' && s.forceFail) { code = 'tecNO_PERMISSION'; s.forceFail = false; }
      else if (tx.TransactionType === 'CredentialCreate') { if (s.objs.some(o => o.Subject === tx.Subject && o.Issuer === tx.Account && o.CredentialType === ct.toUpperCase())) code = 'tecDUPLICATE'; else s.objs.push({ LedgerEntryType: 'Credential', Subject: tx.Subject, Issuer: tx.Account, CredentialType: ct.toUpperCase(), URI: tx.URI || '', Flags: 0 }); }
      else if (tx.TransactionType === 'CredentialAccept') { const o = s.objs.find(o => o.Subject === tx.Account && o.Issuer === tx.Issuer && o.CredentialType === ct.toUpperCase()); if (!o) code = 'tecNO_ENTRY'; else if (o.Flags & 65536) code = 'tecDUPLICATE'; else o.Flags |= 65536; }
      s.log.push({ type: tx.TransactionType, ct: ct.toUpperCase(), uri: tx.URI || '', code, hash }); s.txs[hash] = { code }; put(s);
      return { result: { validated: true, ledger_index: 5000 + s.n, meta: { TransactionResult: code } } };
    }
    async request(q) { const s = st();
      if (q.command === 'account_objects') return { result: { account_objects: s.objs.filter(o => o.Subject === q.account) } };
      if (q.command === 'tx') { const t = s.txs[q.transaction]; if (!t) { const e = new Error('txnNotFound'); e.data = { error: 'txnNotFound' }; throw e; } return { result: { validated: true, ledger_index: 5000, meta: { TransactionResult: t.code } } }; }
      return { result: {} }; } }
  const mock = { Client, Wallet: { fromSeed: W }, convertStringToHex: toHex, isoTimeToRippleTime: () => 1 };
  Object.defineProperty(window, 'xrpl', { get: () => mock, set: () => {}, configurable: false });
};

/* page helpers (run in the page) */
const PAGE_HELPERS = () => {
  window.__mk = (o) => v81Normalize({ id: o.id, name: o.name, kind: o.kind, type: credentialTypeCode(o.kind, o.jur || ''), jurisdiction: o.jur || '', section: catalogKind(o.kind).section, required: false, primary: 'VERIFIED', chain: 'NOT ISSUED', expiration: o.exp || '2029-06-30', file: '', ...(o.renews ? { renews: o.renews } : {}), prov: { source: 'Synthetic issuer (test)', method: 'Demo verification', verifier: 'TEST', verifiedAt: new Date().toISOString(), active: true, lastMonitored: new Date().toISOString() } });
  window.__closeDlg = () => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); };
  window.__issueAccept = async id => { await issue(id); __closeDlg(); const c = creds.find(x => x.id === id); if (c && c.chain === 'SECURING') { await accept(id); __closeDlg(); } return creds.find(x => x.id === id).chain; };
  window.__ledger = () => JSON.parse(localStorage.getItem('xl') || '{"objs":[],"log":[]}');
  window.__unhex = h => new TextDecoder().decode(new Uint8Array((h.match(/../g) || []).map(b => parseInt(b, 16))));
  window.__readiness = () => { const ob = onboarding(); return JSON.stringify({ ok: ob.ok, pct: ob.pct, license: ob.license, ready: ob.ready, req: ob.req.map(c => [c.id, reqSatisfied(c)]), v7: v7Readiness(),
    as: getAssignments().map(a => { const r = v81Assignment(a); return { id: a.id, eligible: r.eligible, ok: r.ok, total: r.total, ready: r.ready, missing: r.missing, items: (r.items || []).map(i => [i.label, i.status]) }; }) }); };
};

async function run(browser, name, vp) {
  const tag = `${name}/${vp}`; let pass = true; const t = (n, c, i) => { pass = ok(`${tag}: ${n}`, c, i) && pass; };
  const ctx = await browser.newContext(ctxOpts(name, vp)); await ctx.addInitScript(LEDGER_MOCK);
  const pg = await ctx.newPage(); pg.setDefaultTimeout(30000); const errs = [], alerts = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => { alerts.push(d.message()); d.accept(); });
  try {
    await pg.goto(BASE, { waitUntil: 'networkidle' }); await pg.evaluate(PAGE_HELPERS);

    /* 8. readiness unchanged (Sentinel role): demo seed readiness is identical before proofs,
       after proofs with ledger ids, and with every ledger field stripped. */
    const rd = await pg.evaluate(async () => {
      const s0 = __readiness(); const ids = creds.filter(eligible).map(c => c.id);
      for (const id of ids) await __issueAccept(id);
      const s1 = __readiness(), accepted = creds.filter(c => c.chain === 'ACCEPTED').length;
      const strip = creds.map(c => { const k = {}; for (const f of ['ledgerCredentialType', 'ledgerSupersedes', 'ledgerProofSchema', 'ledgerIdCreatedAt', 'proofNetwork']) { k[f] = c[f]; delete c[f]; } return k; });
      const s2 = __readiness(); creds.forEach((c, i) => Object.assign(c, strip[i]));
      return { same01: s0 === s1, same12: s1 === s2, n: ids.length, accepted, s0: s0.slice(0, 200), s1: s1.slice(0, 200) };
    });
    t('readiness unchanged by proofs and ledger ids (demo seed: before = after = ledger fields stripped)', rd.same01 && rd.same12 && rd.n > 0 && rd.accepted >= rd.n, JSON.stringify(rd));
    t('every eligible demo credential gets an accepted proof (no tecDUPLICATE across the seed)', rd.accepted >= rd.n && !(await pg.evaluate(() => __ledger().log.some(x => x.code !== 'tesSUCCESS'))), JSON.stringify(await pg.evaluate(() => __ledger().log.filter(x => x.code !== 'tesSUCCESS'))));

    /* fresh credential set for the identity tests */
    await pg.evaluate(() => { localStorage.removeItem('xl'); sessionStorage.clear(); creds.splice(0, creds.length,
      __mk({ id: 9001, kind: 'RN_LICENSE', jur: 'US-CA', name: 'California RN License' }),
      __mk({ id: 9002, kind: 'RN_LICENSE', jur: 'US-MA', name: 'Massachusetts RN License' }),
      __mk({ id: 9003, kind: 'CERT_BLS', name: 'BLS (2024 card)', exp: '2026-12-31' }),
      __mk({ id: 9004, kind: 'CERT_BLS', name: 'BLS (2026 card)', exp: '2028-12-31', renews: 9003 })); save(); });

    /* 1. CA RN + MA RN simultaneously */
    const rn = await pg.evaluate(async () => { const a = await __issueAccept(9001), b = await __issueAccept(9002); const g = id => creds.find(x => x.id === id); const L = __ledger();
      return { a, b, la: g(9001).ledgerCredentialType, lb: g(9002).ledgerCredentialType, objs: L.objs.map(o => ({ ct: __unhex(o.CredentialType), uri: __unhex(o.URI || ''), acc: !!(o.Flags & 65536) })), codes: L.log.map(x => x.code) }; });
    t('CA RN + MA RN: both proofs issued and accepted', rn.a === 'ACCEPTED' && rn.b === 'ACCEPTED' && rn.codes.every(c => c === 'tesSUCCESS'), JSON.stringify(rn));
    t('CA RN + MA RN: distinct opaque ledger ids (vc1_ + 32 hex)', /^vc1_[0-9a-f]{32}$/.test(rn.la || '') && /^vc1_[0-9a-f]{32}$/.test(rn.lb || '') && rn.la !== rn.lb, JSON.stringify(rn));
    t('on-ledger CredentialType and URI carry no semantic type, jurisdiction or name', rn.objs.length === 2 && rn.objs.every(o => /^vc1_[0-9a-f]{32}$/.test(o.ct) && !/RN_LICENSE|US-CA|US-MA|California|Massachusetts|CERT_/i.test(o.ct + ' ' + o.uri)), JSON.stringify(rn.objs));
    t('semantic type stays on the record for readiness (kind RN_LICENSE, type code unchanged)', await pg.evaluate(() => creds.filter(c => c.id === 9001 || c.id === 9002).every(c => c.kind === 'RN_LICENSE' && /^RN_LICENSE/.test(c.type))));

    /* 2+3. two BLS generations; renewal/replacement */
    const bls = await pg.evaluate(async () => { const a = await __issueAccept(9003), b = await __issueAccept(9004); const g = id => creds.find(x => x.id === id);
      return { a, b, la: g(9003).ledgerCredentialType, lb: g(9004).ledgerCredentialType, sup: g(9004).ledgerSupersedes, renews: g(9004).renews, codes: __ledger().log.map(x => x.code), objs: __ledger().objs.length }; });
    t('two BLS generations: both issued and accepted (no tecDUPLICATE)', bls.a === 'ACCEPTED' && bls.b === 'ACCEPTED' && bls.codes.every(c => c === 'tesSUCCESS') && bls.objs === 4, JSON.stringify(bls));
    t('renewal gets its own ledger id and records the one it supersedes', bls.la && bls.lb && bls.la !== bls.lb && bls.sup === bls.la && bls.renews === 9003, JSON.stringify(bls));

    /* 4. issue → accept → Passport → public validation */
    const pay = await pg.evaluate(() => { const p = passPayload(); return { p, code: enc(p) }; });
    const ents = pay.p?.types || [];
    t('Passport payload stores semantic type and ledger id separately for each credential', ents.length === 4 && ents.every(e => e.st && /^vc1_[0-9a-f]{32}$/.test(e.l || '') && e.st !== e.l) && ents.filter(e => e.st === 'RN_LICENSE').length === 2 && ents.filter(e => e.st === 'CERT_BLS').length === 2, JSON.stringify(ents));
    t('Passport payload records network (XRPL_DEVNET), proof schema, tx hash and ledger index', ents.every(e => e.net === 'XRPL_DEVNET' && e.ps === 'veridun.xrpl-credential.v1' && e.tx && e.li), JSON.stringify(ents[0]));
    t('renewal entry links the superseded proof in the Passport', ents.some(e => e.sp && ents.some(o => o.l === e.sp)), JSON.stringify(ents.map(e => [e.st, e.l, e.sp])));
    await pg.goto(BASE + '?passport=' + pay.code, { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => /check complete/i.test($('pubStatus').textContent), null, { timeout: 15000 });
    const pub = await pg.evaluate(() => ({ status: $('pubStatus').textContent, score: $('pubScore').textContent, rows: [...document.querySelectorAll('#pubRows .badge')].map(b => ({ id: b.id, t: b.textContent })), ids: [...document.querySelectorAll('#pubRows [id]')].map(e => e.id) }));
    t('public validation: all 4 proofs found live by ledger id (2 RN licenses + 2 BLS generations)', pub.rows.length === 4 && pub.rows.every(r => /VERIFIED LIVE/.test(r.t) && !/LEGACY/.test(r.t)) && /4\/4/.test(pub.status) && pub.score === '100%', JSON.stringify(pub));
    /* 7. DOM ids */
    t('DOM ids on the public Passport are unique and never built from the semantic type', pub.ids.length >= 4 && new Set(pub.ids).size === pub.ids.length && pub.ids.every(i => !/RN_LICENSE|CERT_|:/.test(i)), JSON.stringify(pub.ids));
    /* tampered / duplicated entries */
    const forged = await pg.evaluate(p => { const q = JSON.parse(JSON.stringify(p)); q.types[0].l = 'vc1_' + '0'.repeat(32); q.types.push({ ...q.types[1] }); q.types.push({ ...q.types[2], l: 'CERT_BLS' }); return enc(q); }, pay.p);
    await pg.goto(BASE + '?passport=' + forged, { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => /check complete/i.test($('pubStatus').textContent), null, { timeout: 15000 });
    const fp = await pg.evaluate(() => ({ status: $('pubStatus').textContent, rows: [...document.querySelectorAll('#pubRows .badge')].map(b => b.textContent), ids: [...document.querySelectorAll('#pubRows [id]')].map(e => e.id) }));
    t('forged ledger id → NOT FOUND; repeated entry → not double-counted; malformed id → invalid (no legacy downgrade)', fp.rows.length === 6 && /NOT FOUND/.test(fp.rows[0]) && /DUPLICATE/i.test(fp.rows[4]) && /INVALID/i.test(fp.rows[5]) && /3\/6/.test(fp.status) && new Set(fp.ids).size === fp.ids.length, JSON.stringify(fp));

    /* 5. legacy proof (issued before v14.8 with the semantic code as CredentialType) */
    await pg.goto(BASE, { waitUntil: 'networkidle' }); await pg.evaluate(PAGE_HELPERS);
    const leg = await pg.evaluate(async () => {
      const s = __ledger(), hx = xrpl.convertStringToHex; const ws = JSON.parse(store.session.xrplWallets()); const I = 'r' + ws.i, S = 'r' + ws.s;
      s.objs.push({ LedgerEntryType: 'Credential', Subject: S, Issuer: I, CredentialType: hx('CERT_ACLS'), URI: '', Flags: 65536 });
      s.objs.push({ LedgerEntryType: 'Credential', Subject: S, Issuer: I, CredentialType: hx('CERT_CCRN'), URI: '', Flags: 0 });
      localStorage.setItem('xl', JSON.stringify(s));
      const a = __mk({ id: 9101, kind: 'CERT_ACLS', name: 'ACLS (legacy proof)' }); Object.assign(a, { chain: 'ACCEPTED', issuer: I, subject: S, issueTx: 'HLEG1', acceptTx: 'HLEG2' });
      const c = __mk({ id: 9102, kind: 'CERT_CCRN', name: 'CCRN (legacy, not yet accepted)' }); Object.assign(c, { chain: 'SECURING', issuer: I, subject: S, issueTx: 'HLEG3' });
      creds.push(a, c); save();
      await accept(9102); __closeDlg();
      const g = id => creds.find(x => x.id === id), p = passPayload();
      return { cChain: g(9102).chain, cLid: g(9102).ledgerCredentialType || null, aLid: g(9101).ledgerCredentialType || null, lastAccept: __unhex(__ledger().log.filter(x => x.type === 'CredentialAccept').pop()?.ct || ''), entA: p.types.find(e => e.n === 'ACLS (legacy proof)'), code: enc(p),
        oldFmt: enc({ issuer: I, subject: S, types: [{ t: 'CERT_ACLS', n: 'ACLS', e: '', s: '', v: '' }], onboarding: { ready: false, pct: 0, required: [] } }) };
    });
    t('legacy SECURING proof is accepted with its original CredentialType (not re-keyed)', leg.cChain === 'ACCEPTED' && leg.lastAccept === 'CERT_CCRN' && !leg.cLid, JSON.stringify(leg));
    t('legacy accepted proof keeps no ledger id; Passport entry is marked legacy', !leg.aLid && leg.entA && !leg.entA.l && leg.entA.lg === 1, JSON.stringify(leg.entA));
    await pg.goto(BASE + '?passport=' + leg.code, { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => /check complete/i.test($('pubStatus').textContent), null, { timeout: 15000 });
    const lp = await pg.evaluate(() => ({ status: $('pubStatus').textContent, rows: [...document.querySelectorAll('#pubRows .passrow')].map(r => r.innerText.replace(/\s+/g, ' ')) }));
    t('mixed Passport (new + legacy proofs) validates; legacy rows labelled legacy', lp.rows.length === 6 && lp.rows.every(r => /VERIFIED LIVE/.test(r)) && lp.rows.filter(r => /LEGACY/i.test(r)).length === 2 && /6\/6/.test(lp.status), JSON.stringify(lp));
    await pg.goto(BASE + '?passport=' + leg.oldFmt, { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => /check complete/i.test($('pubStatus').textContent), null, { timeout: 15000 });
    const op = await pg.evaluate(() => ({ status: $('pubStatus').textContent, rows: [...document.querySelectorAll('#pubRows .badge')].map(b => b.textContent) }));
    t('an old (pre-v14.8) Passport link still validates, labelled legacy', op.rows.length === 1 && /VERIFIED LIVE/.test(op.rows[0]) && /LEGACY/i.test(op.rows[0]) && /1\/1/.test(op.status), JSON.stringify(op));

    /* 6. duplicate attempts */
    await pg.goto(BASE, { waitUntil: 'networkidle' }); await pg.evaluate(PAGE_HELPERS);
    const dup = await pg.evaluate(async () => {
      const before = __ledger().log.filter(x => x.type === 'CredentialCreate').length;
      creds.push(__mk({ id: 9201, kind: 'CERT_PALS', name: 'Dup test A' }), __mk({ id: 9202, kind: 'CERT_PALS', name: 'Dup test B' }), __mk({ id: 9203, kind: 'CERT_PALS', name: 'Dup test C' })); save();
      await Promise.all([issue(9201), issue(9201)]); __closeDlg();
      const creates = __ledger().log.filter(x => x.type === 'CredentialCreate').length - before;
      // re-issue after a failed (rolled back) attempt reuses the same id
      const b = creds.find(x => x.id === 9202);
      LedgerIdentity.ensure(b, creds); const firstId = b.ledgerCredentialType;
      // copied record holding another credential's id (never issued) → gets a fresh id at issue
      const c = creds.find(x => x.id === 9203); c.ledgerCredentialType = creds.find(x => x.id === 9201).ledgerCredentialType; save();
      await issue(9203); __closeDlg();
      { const s = __ledger(); s.forceFail = true; localStorage.setItem('xl', JSON.stringify(s)); }
      await issue(9202); __closeDlg(); const afterFail = { chain: creds.find(x => x.id === 9202).chain, id: creds.find(x => x.id === 9202).ledgerCredentialType };
      await issue(9202); __closeDlg();
      const g = id => creds.find(x => x.id === id);
      return { creates, aChain: g(9201).chain, firstId, afterFail, bId: g(9202).ledgerCredentialType, bChain: g(9202).chain, cId: g(9203).ledgerCredentialType, aId: g(9201).ledgerCredentialType, cChain: g(9203).chain, bad: __ledger().log.filter(x => x.code !== 'tesSUCCESS' && x.code !== 'tecNO_PERMISSION').map(x => x.code) };
    });
    t('double-click issue: exactly one CredentialCreate is submitted', dup.creates === 1 && dup.aChain === 'SECURING', JSON.stringify(dup));
    t('ledger id generated once: a failed issue rolls back, and the retry reuses the same id', dup.firstId && dup.afterFail.chain === 'NOT ISSUED' && dup.afterFail.id === dup.firstId && dup.bId === dup.firstId && dup.bChain === 'SECURING', JSON.stringify(dup));
    t('colliding (copied) ledger id is replaced before issue; no tecDUPLICATE reaches the ledger', dup.cId && dup.cId !== dup.aId && dup.cChain === 'SECURING' && dup.bad.length === 0, JSON.stringify(dup));
    const dupAcc = await pg.evaluate(async () => { const n = __ledger().log.filter(x => x.type === 'CredentialAccept').length; await Promise.all([accept(9201), accept(9201)]); __closeDlg(); return { n: __ledger().log.filter(x => x.type === 'CredentialAccept').length - n, chain: creds.find(x => x.id === 9201).chain, bad: __ledger().log.filter(x => x.code !== 'tesSUCCESS' && x.code !== 'tecNO_PERMISSION').map(x => x.code) }; });
    t('double-click accept: exactly one CredentialAccept is submitted', dupAcc.n === 1 && dupAcc.chain === 'ACCEPTED' && dupAcc.bad.length === 0, JSON.stringify(dupAcc));

    /* 7b. DOM ids in the nurse's credential table + proof details show network/proof id */
    const tbl = await pg.evaluate(() => { v81ShowRole('clinician'); const ids = [...document.querySelectorAll('#rows [id]')].map(e => e.id); showProof(9201); const grid = [...$('proofGrid').children].map(e => e.textContent).join(' | '); __closeDlg(); return { ids, dupData: [...document.querySelectorAll('#rows .details')].map(b => b.dataset.id).length === new Set([...document.querySelectorAll('#rows .details')].map(b => b.dataset.id)).size, grid }; });
    t('credential table: no DOM id built from the semantic type; row buttons keyed by record id', tbl.ids.every(i => !/RN_LICENSE|CERT_|:/.test(i)) && tbl.dupData, JSON.stringify(tbl.ids));
    t('proof details show network, ledger proof id, proof schema and semantic type separately', /XRPL Devnet/.test(tbl.grid) && /vc1_[0-9a-f]{32}/.test(tbl.grid) && /veridun\.xrpl-credential\.v1/.test(tbl.grid) && /CERT_PALS/.test(tbl.grid), JSON.stringify(tbl.grid.slice(0, 900)));
    t('no unexpected alerts (only the one forced tecNO_PERMISSION failure)', alerts.filter(a => /failed|collision|review/i.test(a)).length === 1 && alerts.some(a => /tecNO_PERMISSION/.test(a)), JSON.stringify(alerts));
    t('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) { t('run', false, e.message.split('\n')[0]); }
  await ctx.close(); return pass;
}

(async () => {
  let srv = null;
  if (!BASE) { srv = await serve(); BASE = `http://127.0.0.1:${srv.address().port}/`; }
  console.log('BASE ' + BASE);
  const matrix = {}, browsers = {};
  for (const p of PROFILES) {
    const [name, vp] = p.split('/'), eng = engineOf(name);
    if (ENGINES && !ENGINES.includes(name) && !ENGINES.includes(eng)) continue;
    if (!browsers[eng]) { try { browsers[eng] = await pw[eng].launch(); console.log(`— ${eng} ${browsers[eng].version()}`); } catch (e) { ok(`${eng}: launch`, false, e.message.split('\n')[0]); continue; } }
    matrix[p] = await run(browsers[eng], name, vp);
  }
  for (const b of Object.values(browsers)) await b.close();
  console.log('\nMatrix: ' + Object.entries(matrix).map(([k, v]) => `${k}=${v ? 'pass' : 'FAIL'}`).join('  '));
  if (srv) srv.close();
  const f = R.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${R.length - f}/${R.length} passed`);
  process.exit(f ? 1 : 0);
})();
