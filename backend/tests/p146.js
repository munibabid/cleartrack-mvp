#!/usr/bin/env node
/* v14.6: Professional references (demo only) — cross-browser flow test.
   Engines: Chromium, WebKit (Safari's engine, iPhone profile), Firefox, each in a phone and a
   desktop viewport, plus Chromium with Microsoft Edge (desktop) and Samsung Internet (Android)
   user agents. Edge and Samsung Internet are Chromium-based; this is UA + viewport emulation on
   Playwright's Chromium, not the vendor browsers themselves.
   All names, emails and phone numbers are fictional (.example domains, 555-01xx numbers).
   Usage: node backend/tests/p146.js   (BASE=<url> tests a deployed site; ENGINES=webkit narrows it) */
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
const SECRET = 'ZQX-private-comment-7731';

async function run(browser, name, vp, shots) {
  const tag = `${name}/${vp}`;
  const ctx = await browser.newContext(ctxOpts(name, vp));
  const pg = await ctx.newPage(); pg.setDefaultTimeout(30000);
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  let pass = true; const t = (n, c, i) => { pass = ok(`${tag}: ${n}`, c, i) && pass; };
  const shot = async n => { if (shots) await pg.screenshot({ path: path.join(shots, `${name}-${vp}-${n}.png`), fullPage: true }); };
  /* Centre the control first: on small phones the fixed bottom nav can sit over the lowest row. */
  const ctr = sel => pg.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
  const chk = async sel => { await ctr(sel); await pg.check(sel); };
  const noOverflow = () => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const refs = () => pg.evaluate(() => loadReferences().map(r => ({ id: r.id, name: r.name, status: refStatus(r), channel: r.channel, token: r.token })));
  const byName = async n => (await refs()).find(r => r.name === n);
  const goRefs = async () => { await pg.evaluate(() => { v81ShowRole('clinician'); showV7View('referencesView'); }); await pg.waitForSelector('#refListV146'); };
  const fillAnswers = async (p, comment) => {
    await pg.selectOption(`#${p}FromM`, '3'); await pg.selectOption(`#${p}FromY`, String(new Date().getFullYear() - 3));
    await chk(`#${p}Current`); await pg.selectOption(`#${p}Role`, 'MANAGER');
    for (const k of ['clinical', 'professionalism', 'teamwork', 'reliability', 'communication']) await chk(`input[name="${p}R_${k}"][value="${k === 'teamwork' ? 4 : 5}"]`);
    await chk(`input[name="${p}Rehire"][value="YES"]`); await pg.fill(`#${p}Comments`, comment); await chk(`#${p}Attest`);
  };
  try {
    await pg.goto(BASE, { waitUntil: 'networkidle' });
    t('version label v14.6', await pg.evaluate(() => document.documentElement.textContent.includes('v14.6 demo')));
    // v14.6: landing sample table comes from the demo seed; no stuck "Proof: securing…"; plain "Proof in progress"
    const land = await pg.evaluate(() => { const t = $('landingLicTableV146'), rows = [...t.querySelectorAll('tr')].map(r => [...r.cells].map(c => c.textContent.trim())); const want = DEMO_SEED.filter(([k]) => ['Licenses', 'Certifications'].includes(catalogKind(k)?.category)).map(([k, j, , , x]) => x?.name || credentialDisplayName(k, j)); return { rows, want, any: /securing/i.test(document.body.innerText + document.body.innerHTML), pl: proofLabel({ chain: 'SECURING' }), pl2: proofLabel({ chain: 'XRPL ISSUED' }), uc: userChain({ chain: 'SECURING' }) }; });
    t('landing Licenses & Certifications table is built from the demo seed (same names as the Passport)', land.rows.length === land.want.length && land.rows.every((r, i) => r[0] === land.want[i]) && land.rows.some(r => /NIHSS/.test(r[0])), JSON.stringify(land.rows));
    t('landing NIHSS row matches the others (VERIFIED · DEMO, Proof ✓); no "securing" text anywhere', land.rows.every(r => r[1] === 'VERIFIED · DEMO' && r[2] === 'Proof ✓') && !land.any, JSON.stringify(land));
    t('proof wording is plain: issued → "Proof issued — accept to finish", submitting → "Proof in progress" (internal state names unchanged)', land.pl === 'Proof issued — accept to finish' && land.pl2 === 'Proof in progress' && land.uc === 'PROOF ISSUED — ACCEPT TO FINISH', JSON.stringify(land));
    await pg.click('#roleClinician');
    // Reach References the way a nurse would: Menu on phones, sidebar on desktop
    if (vp === 'mobile') { await pg.click('.mobile-nav .v7nav[data-view="menuView"]'); await pg.click('.menuLinkV11[data-menu="references"]'); }
    else await pg.click('aside .v7nav[data-view="referencesView"]');
    await pg.waitForSelector('#refListV146');
    const empty = await pg.textContent('#referencesView');
    t('References page reachable; plain words; demo notice; empty state', /Professional References/.test(empty) && /nothing is actually sent/i.test(empty) && /No references yet/.test(empty) && !/token|localStorage|adapter|REF_|undefined|null/.test(empty), empty.slice(0, 200));
    // Add form: validation, phone-gated text/call boxes, live email hint
    await pg.click('#refAddBtnV146');
    t('text/call boxes disabled until a phone number is typed', await pg.isDisabled('#refAllowTextV146') && await pg.isDisabled('#refAllowCallV146'));
    await pg.fill('#refNameV146', 'Jordan Ellison'); await pg.fill('#refTitleV146', 'ICU Nurse Manager'); await pg.fill('#refFacilityV146', 'Saguaro Valley Medical Center');
    await pg.click('#refSaveV146');
    t('work email is required', /Enter their work email/.test(await pg.textContent('#refAddErrV146')));
    await pg.fill('#refEmailV146', 'not-an-email'); await pg.click('#refSaveV146');
    t('invalid email rejected', /valid email/.test(await pg.textContent('#refAddErrV146')));
    await pg.fill('#refEmailV146', 'j.ellison@saguarovalley.example');
    t('live hint: work email matches the facility domain on file (no identity overclaim)', /email domain on file \(saguarovalley\.example\)/.test(await pg.textContent('#refEmailHintV146')) && /does not prove who/.test(await pg.textContent('#refEmailHintV146')));
    await pg.fill('#refUnitV146', 'Medical ICU'); await pg.click('#refSaveV146');
    await pg.waitForSelector('.ref-card-v146');
    // second reference: personal email + phone (text + call)
    await pg.click('#refAddBtnV146');
    await pg.fill('#refNameV146', 'Priya Natarajan'); await pg.fill('#refTitleV146', 'Charge Nurse'); await pg.fill('#refFacilityV146', 'Copper Mesa Hospital');
    await pg.fill('#refEmailV146', 'priya.natarajan.rn@gmail.com');
    t('live hint flags a personal email as weaker', /Personal email address \(gmail\.com\).*weaker/.test(await pg.textContent('#refEmailHintV146')));
    await pg.fill('#refPhoneV146', '12'); await chk('#refAllowTextV146'); await pg.click('#refSaveV146');
    t('short phone number rejected', /10 to 15 digits/.test(await pg.textContent('#refAddErrV146')));
    await pg.fill('#refPhoneV146', '(555) 010-0147'); await chk('#refAllowCallV146'); await pg.click('#refSaveV146');
    await pg.waitForFunction(() => document.querySelectorAll('.ref-card-v146').length === 2);
    // third reference: unknown facility domain, no phone
    await pg.click('#refAddBtnV146');
    await pg.fill('#refNameV146', 'Marcus Bell'); await pg.fill('#refTitleV146', 'Clinical Educator'); await pg.fill('#refFacilityV146', 'Desert Plains Hospital'); await pg.fill('#refEmailV146', 'mbell@desertplains.example');
    await pg.click('#refSaveV146'); await pg.waitForFunction(() => document.querySelectorAll('.ref-card-v146').length === 3);
    await pg.click('#refAddBtnV146'); await pg.fill('#refNameV146', 'Dup'); await pg.fill('#refTitleV146', 'RN'); await pg.fill('#refFacilityV146', 'X'); await pg.fill('#refEmailV146', 'MBELL@desertplains.example'); await pg.click('#refSaveV146');
    t('duplicate email rejected', /already added/.test(await pg.textContent('#refAddErrV146'))); await pg.click('#refCancelV146');
    const btns = await pg.evaluate(() => [...document.querySelectorAll('.ref-card-v146')].map(c => ({ n: c.querySelector('b').textContent, b: [...c.querySelectorAll('button,a')].map(x => x.textContent) })));
    const jb = btns.find(x => x.n === 'Jordan Ellison').b, pb = btns.find(x => x.n === 'Priya Natarajan').b;
    t('text/call buttons only when a phone was given, labelled demo', !jb.some(x => /text|call/i.test(x)) && pb.some(x => /Send link by text \(demo — not sent\)/.test(x)) && pb.some(x => /Ask a recruiter to call \(demo — no call is made\)/.test(x)), JSON.stringify(btns));
    const mb = await pg.textContent(`.ref-card-v146[data-ref="${(await byName('Marcus Bell')).id}"]`);
    t('unknown facility domain is not treated as a match', /Facility email domain not on file/.test(mb));
    if (vp === 'mobile') t('references page fits the phone width', await noOverflow());
    await shot('1-list');
    // Email request → Requested (demo, not sent)
    const J = await byName('Jordan Ellison');
    await pg.click(`.ref-card-v146[data-ref="${J.id}"] .refAct[data-act="send-EMAIL"]`);
    const jc = await pg.textContent(`.ref-card-v146[data-ref="${J.id}"]`);
    t('email request: status Requested, labelled DEMO · NOT SENT, expiry shown', /REQUESTED/.test(jc) && /DEMO · NOT SENT/.test(jc) && /expires/.test(jc) && /14 days left|13 days left/.test(jc), jc);
    await pg.click(`.ref-card-v146[data-ref="${J.id}"] .refAct[data-act="remind"]`);
    t('reminder recorded (demo)', /1 reminder sent \(demo\)/.test(await pg.textContent(`.ref-card-v146[data-ref="${J.id}"]`)));
    // Reference opens the private link (same app) and answers
    await pg.click(`.ref-card-v146[data-ref="${J.id}"] .ref-open-v146`);
    await pg.waitForSelector('#refAnswerFormV146');
    t('private link opens the reference form; status becomes Opened', (await byName('Jordan Ellison')).status === 'OPENED' && /can't see your answers/.test(await pg.textContent('#refPublicBodyV146')));
    if (vp === 'mobile') t('reference form fits the phone width', await noOverflow());
    await shot('2-form');
    await pg.click('#refSubmitV146');
    const ve = await pg.textContent('#refAnswerErrV146');
    t('empty form: friendly validation (dates, role, all 5 ratings, rehire, attestation)', /started working together/.test(ve) && /role relative/.test(ve) && (ve.match(/Rate:/g) || []).length === 5 && /rehire/.test(ve) && /answers are your own/.test(ve), ve);
    await fillAnswers('refQ', SECRET);
    await pg.click('#refSubmitV146'); await pg.waitForSelector('#refPubStateV146[data-state="SUBMITTED"]');
    t('submitted: thank-you screen', /Your reference was submitted/.test(await pg.textContent('#refPublicBodyV146')));
    const tokenJ = J.token || (await pg.evaluate(() => new URLSearchParams(location.search).get('ref')));
    await pg.goto(BASE + '?ref=' + tokenJ, { waitUntil: 'networkidle' });
    const again = await pg.textContent('#refPublicBodyV146');
    t('re-opening a completed link shows no answers', /already submitted/.test(again) && !again.includes(SECRET) && !/Very good|Excellent/.test(again), again);
    await pg.click('#refPublicBackV146'); await pg.waitForSelector('#refListV146');
    const jd = await pg.textContent(`.ref-card-v146[data-ref="${J.id}"]`);
    t('nurse sees Completed + how confirmed (work email at facility domain), not the answers', /COMPLETED/.test(jd) && /Work email at Saguaro Valley Medical Center's email domain on file/.test(jd) && /no email was actually sent/.test(jd) && !jd.includes(SECRET) && !/★|Very good|Excellent|Would work with/.test(jd), jd);
    // Text request → skip 15 days → Expired → resend → old link replaced
    const P = await byName('Priya Natarajan');
    await pg.click(`.ref-card-v146[data-ref="${P.id}"] .refAct[data-act="send-TEXT"]`);
    const p1 = await byName('Priya Natarajan');
    t('text request (demo): Requested by text message', p1.status === 'REQUESTED' && p1.channel === 'TEXT' && /Text message request sent/.test(await pg.textContent(`.ref-card-v146[data-ref="${P.id}"]`)));
    await pg.click(`.ref-card-v146[data-ref="${P.id}"] .refAct[data-act="skip"]`);
    const pe = await pg.textContent(`.ref-card-v146[data-ref="${P.id}"]`);
    t('after 14 days without an answer the request is Expired (demo time skip)', /EXPIRED/.test(pe) && /expired after 14 days/.test(pe) && (await byName('Priya Natarajan')).status === 'EXPIRED', pe);
    await pg.goto(BASE + '?ref=' + p1.token, { waitUntil: 'networkidle' });
    t('expired link tells the reference it expired', /This request has expired/.test(await pg.textContent('#refPublicBodyV146')));
    await goRefs();
    await pg.click(`.ref-card-v146[data-ref="${P.id}"] .refAct[data-act="send-TEXT"]`);
    const p2 = await byName('Priya Natarajan');
    t('resend: Requested again with a new link', p2.status === 'REQUESTED' && p2.token && p2.token !== p1.token);
    await pg.goto(BASE + '?ref=' + p1.token, { waitUntil: 'networkidle' });
    t('old link says it was replaced', /replaced by a newer one/.test(await pg.textContent('#refPublicBodyV146')));
    // Ask a recruiter to call → Verification Console › Reference Calls → record the call
    await goRefs();
    await pg.click(`.ref-card-v146[data-ref="${P.id}"] .refAct[data-act="send-CALL"]`);
    t('call request: waiting for a recruiter call', (await byName('Priya Natarajan')).channel === 'CALL' && /Waiting for a recruiter or verifier to call/.test(await pg.textContent(`.ref-card-v146[data-ref="${P.id}"]`)));
    await pg.evaluate(() => { v81ShowRole('verification'); v81Tabs('verifyTab', 'verifyPanel', 'verifyRefCallsV146'); });
    await pg.click(`.refCallAct[data-act="record"][data-id="${P.id}"]`);
    await pg.waitForSelector('#refCallFormV146');
    await pg.click('#refCallSaveV146');
    t('call form requires caller, organization, how reached', /who made the call/.test(await pg.textContent('#refCallErrV146')) && /how you confirmed|reach/i.test(await pg.textContent('#refCallErrV146')));
    await pg.fill('#refCallerV146', 'Casey Recruiter'); await pg.fill('#refCallerOrgV146', 'Northstar Travel Nursing, recruiter'); await pg.selectOption('#refCallConfirmV146', 'NURSE_NUMBER');
    await fillAnswers('refC', 'Phone comment 4410');
    if (vp === 'mobile') t('call form fits the phone width', await noOverflow());
    await shot('3-call');
    await pg.click('#refCallSaveV146');
    await pg.waitForFunction(id => refStatus(loadReferences().find(r => r.id === id)) === 'COMPLETED', P.id);
    const pc = await pg.textContent(`[data-refcall="${P.id}"]`);
    t('phone reference completed; record shows who called and when', /Called by Casey Recruiter/.test(pc), pc);
    // Decline through the link
    const M = await byName('Marcus Bell');
    await goRefs();
    await pg.click(`.ref-card-v146[data-ref="${M.id}"] .refAct[data-act="send-EMAIL"]`);
    await pg.goto(BASE + '?ref=' + (await byName('Marcus Bell')).token, { waitUntil: 'networkidle' });
    await pg.click('#refDeclineV146'); await pg.waitForSelector('#refPubStateV146[data-state="DECLINED"]');
    await goRefs();
    t('declined: nurse sees Declined, no reason', /DECLINED/.test(await pg.textContent(`.ref-card-v146[data-ref="${M.id}"]`)));
    // Nothing the nurse can see contains the answers (references page, passport, share & access, activity, events log)
    await pg.evaluate(() => showV7View('passportView'));
    const pp = await pg.textContent('#v7PassportRefsV146');
    t('Passport shows a references summary (2 completed, answers private)', /2 completed/.test(pp) && /Answers stay private/.test(pp), pp);
    await pg.evaluate(() => showV7View('shareView'));
    const nurseText = await pg.evaluate(() => [...document.querySelectorAll('#app .view')].map(v => { v.classList.add('active'); const t = v.innerText; v.classList.remove('active'); return t; }).join('\n'));
    const ev = await pg.evaluate(() => JSON.stringify(store.events.list()) + JSON.stringify(loadReferences()));
    t('answers never reach the nurse screens, the activity log or the reference list', !nurseText.includes(SECRET) && !nurseText.includes('Phone comment 4410') && !ev.includes(SECRET) && !ev.includes('Phone comment 4410') && /completed a reference/.test(nurseText));
    // Share with an organization: summary only
    await pg.evaluate(() => showV7View('shareView')); await pg.click('#shareNewV83');
    await pg.waitForSelector('#shareRefScopeV146');
    t('share dialog: references default to not included', await pg.inputValue('#shareRefScopeV146') === 'NONE' && /\(2 completed\)/.test(await pg.textContent('#shareRefRowV146')));
    await pg.selectOption('#shareRefScopeV146', 'SUMMARY');
    t('share review mentions what references are shared', /Professional references: .*no answers/.test(await pg.textContent('#shareReviewV83')));
    await pg.click('#generateV7Share'); await pg.waitForSelector('#shareV7Result:not(.hidden)');
    const sh = await pg.evaluate(() => loadShares().slice(-1)[0]);
    await pg.evaluate(() => $('shareV7').close());
    const orgView = async () => { await pg.evaluate(id => { v81ShowRole('organization'); orgViewAs = loadShares().find(s => s.id === id).orgId; v81RenderRoles(); orgOpenShare(id); }, sh.id); await pg.waitForSelector('#orgShareViewDlgV83[open]'); const x = await pg.textContent('#orgShareViewBodyV83'); await pg.evaluate(() => $('orgShareViewDlgV83').close()); return x; };
    const o1 = await orgView();
    t('organization (summary): 2 completed references with who, channel, times, how confirmed; no answers', /Professional references · 2 completed/.test(o1) && /Jordan Ellison/.test(o1) && /Priya Natarajan/.test(o1) && /Called by:.*Casey Recruiter/.test(o1) && /number the nurse provided/.test(o1) && /Work email at Saguaro Valley/.test(o1) && !o1.includes(SECRET) && !/★/.test(o1) && !/Marcus Bell/.test(o1), o1);
    const dlgShot = async n => { if (!shots) return; await pg.evaluate(id => { orgOpenShare(id); document.querySelector('.ref-share-block-v146')?.scrollIntoView({ block: 'start' }); }, sh.id); await pg.locator('#orgShareViewDlgV83').screenshot({ path: path.join(shots, `${name}-${vp}-${n}.png`) }); await pg.evaluate(() => $('orgShareViewDlgV83').close()); };
    await dlgShot('4-org-summary');
    t('reference page is hidden once back in the app', await pg.evaluate(() => $('refPublic').classList.contains('hidden')));
    // Nurse allows answers → organization sees them
    await pg.evaluate(id => { v81ShowRole('clinician'); showV7View('shareView'); openModifyShare(id); }, sh.id);
    t('modify access keeps the chosen references level', await pg.inputValue('#shareRefScopeV146') === 'SUMMARY');
    await pg.selectOption('#shareRefScopeV146', 'ANSWERS'); await pg.click('#generateV7Share');
    const o2 = await orgView();
    await dlgShot('5-org-answers');
    t('organization (answers allowed): sees ratings, rehire and comments', o2.includes(SECRET) && /★/.test(o2) && /Would work with or rehire again:\s*Yes/.test(o2) && /clinician has not seen them/.test(o2), o2.slice(0, 300));
    // Public share link view respects the same scope
    await pg.goto(BASE + '?share=' + sh.token, { waitUntil: 'networkidle' });
    t('share link page includes references at the allowed level', (await pg.textContent('#pubRows')).includes(SECRET));
    // Revoke → no references
    await pg.goto(BASE, { waitUntil: 'networkidle' });
    await pg.evaluate(id => { v81ShowRole('clinician'); revokeShare(id); }, sh.id);
    const o3 = await orgView();
    t('revoked share: organization sees no references', /REVOKED/.test(o3) && !o3.includes(SECRET) && !/Professional references/.test(o3), o3);
    await pg.evaluate(() => { v81ShowRole('verification'); $('auditFilterV85').value = 'REF'; v81RenderRoles(); });
    const au = await pg.textContent('#verifyAuditBodyV81');
    t('audit log has reference events (no answers)', /REFERENCE_COMPLETED/.test(au) && /REFERENCE_EXPIRED/.test(au) && /REFERENCE_DECLINED/.test(au) && !au.includes(SECRET));
    // Names and notes are shown as text, never as markup
    const xss = await pg.evaluate(async () => { addReference({ name: '<img src=x onerror="window.__x=1">', title: 'RN', facility: '<b>F</b>', email: 'x@y.example' }); v81ShowRole('clinician'); showV7View('referencesView'); await new Promise(r => setTimeout(r, 300)); return { fired: !!window.__x, img: !!document.querySelector('#referencesView img'), shown: document.getElementById('referencesView').innerText.includes('<img src=x') }; });
    t('reference details are escaped (no markup injection)', !xss.fired && !xss.img && xss.shown, JSON.stringify(xss));
    // Reset demo clears references
    await pg.evaluate(() => { v81ShowRole('clinician'); $('resetDemo').click(); });
    t('Reset Demo Data clears references and answers', await pg.evaluate(() => loadReferences().length === 0 && Object.keys(loadRefResponses()).length === 0));
    t('golden path unaffected: Boston Travel ICU still 11/12 before the MA license', await pg.evaluate(() => { const a = getAssignments().find(x => /Boston/.test(x.name)); const r = v81Assignment(a); return r.ok === 11 && r.total === 12; }));
    t('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) { t('run', false, e.message.split('\n')[0]); }
  await ctx.close();
  return pass;
}

/* v14.6: a proof never sits "in progress": after 30 s it says "Proof delayed — retrying" and the
   transaction is looked up by hash on a validated ledger; stale ones are re-checked on load.
   Uses an in-page XRPL mock (no network). */
const XRPL_MOCK = () => {
  const cfg = () => JSON.parse(localStorage.getItem('xr_mock') || '{}');
  const log = x => { const l = JSON.parse(localStorage.getItem('xr_log') || '[]'); l.push(x); localStorage.setItem('xr_log', JSON.stringify(l)); };
  class Client { constructor() { this.c = false; } async connect() { this.c = true; } isConnected() { return this.c; } async disconnect() { this.c = false; }
    async getLedgerIndex() { return cfg().ledger || 10; }
    async request(q) { log({ cmd: q.command, hash: q.transaction }); const t = (cfg().tx || {})[q.transaction]; if (!t) { const e = new Error('txnNotFound'); e.data = { error: 'txnNotFound' }; throw e; } return { result: { validated: !!t.validated, ledger_index: 77, meta: { TransactionResult: t.code || 'tesSUCCESS' } } }; }
    async autofill(tx) { return { ...tx, LastLedgerSequence: 50 }; }
    async fundWallet() { return { wallet: W('s') }; }
    submitAndWait() { log({ cmd: 'submitAndWait' }); return new Promise(() => {}); } }
  const W = s => ({ seed: s, address: 'rMock' + s, sign: () => ({ hash: cfg().nextHash || 'HNEXT', tx_blob: 'BLOB' }) });
  const mock = { Client, Wallet: { fromSeed: W }, convertStringToHex: s => [...s].map(c => c.charCodeAt(0).toString(16)).join('').toUpperCase(), isoTimeToRippleTime: () => 1 };
  Object.defineProperty(window, 'xrpl', { get: () => mock, set: () => {}, configurable: false });
};
async function proofCheck(browser, name, vp) {
  const tag = `${name}/${vp}/proof`; let pass = true; const t = (n, c, i) => { pass = ok(`${tag}: ${n}`, c, i) && pass; };
  const ctx = await browser.newContext(ctxOpts(name, vp)); await ctx.addInitScript(XRPL_MOCK);
  const pg = await ctx.newPage(); pg.setDefaultTimeout(60000); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  try {
    await pg.goto(BASE, { waitUntil: 'networkidle' });
    const ids = await pg.evaluate(() => {
      localStorage.setItem('xr_mock', JSON.stringify({ ledger: 120, tx: { H1: { validated: true, code: 'tesSUCCESS' }, H3: { validated: false }, H5: { validated: true, code: 'tesSUCCESS' } } })); localStorage.setItem('xr_log', '[]');
      const pick = k => creds.find(c => c.kind === k), old = new Date(Date.now() - 60000).toISOString();
      const a = pick('CERT_BLS'), b = pick('CERT_ACLS'), c = pick('CERT_CCRN'), d = pick('CERT_TNCC'), e = creds.find(x => ![a, b, c, d].includes(x));
      Object.assign(a, { chain: 'XRPL ISSUED', proofPending: { kind: 'ISSUE', hash: 'H1', startedAt: old, lastLedger: 100, issuer: 'rI', subject: 'rS', proofRef: 'x' } });
      Object.assign(b, { chain: 'XRPL ISSUED', proofPending: { kind: 'ISSUE', hash: 'H2', startedAt: old, lastLedger: 100 } });
      Object.assign(c, { chain: 'XRPL ISSUED', proofPending: { kind: 'ISSUE', hash: 'H3', startedAt: old, lastLedger: 500 } });
      Object.assign(d, { chain: 'XRPL ISSUED', proofPending: { kind: 'ISSUE', hash: 'H9', startedAt: new Date().toISOString(), lastLedger: 500 } });
      Object.assign(e, { chain: 'SECURING', issueTx: 'HX', proofPending: { kind: 'ACCEPT', hash: 'H5', startedAt: old, lastLedger: 100 } });
      save(); return { e: e.id, a: a.id, b: b.id, c: c.id, d: d.id, la: proofLabel(a), ua: userChain(a), ld: proofLabel(d) };
    });
    t('pending > 30 s reads "Proof delayed — retrying"; a fresh one "Proof in progress"', ids.la === 'Proof delayed — retrying' && ids.ua === 'PROOF DELAYED — RETRYING' && ids.ld === 'Proof in progress', JSON.stringify(ids));
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.waitForFunction(id => { const c = creds.find(x => x.id === id); return c && !c.proofPending; }, ids.a);
    const r = await pg.evaluate(ids => { const g = id => creds.find(x => x.id === id); const lg = JSON.parse(localStorage.getItem('xr_log')); return { a: [g(ids.a).chain, g(ids.a).issueTx, proofLabel(g(ids.a))], b: [g(ids.b).chain, !!g(ids.b).proofPending, proofLabel(g(ids.b)), eligible(g(ids.b))], c: [g(ids.c).chain, g(ids.c).proofPending?.checks, proofLabel(g(ids.c))], looked: lg.filter(x => x.cmd === 'tx').map(x => x.hash), e: [g(ids.e).chain, !!g(ids.e).proofPending] }; }, ids);
    t('a stale Accept that validated → accepted', r.e[0] === 'ACCEPTED' && !r.e[1], JSON.stringify(r.e));
    t('on load: stale proofs are looked up by transaction hash on a validated ledger', ['H1', 'H2', 'H3'].every(h => r.looked.includes(h)), JSON.stringify(r));
    t('validated success → issued, waiting for the nurse to accept ("Proof issued — accept to finish")', r.a[0] === 'SECURING' && r.a[1] === 'H1' && r.a[2] === 'Proof issued — accept to finish', JSON.stringify(r.a));
    t('not found after its last ledger → rolled back, "try again", can be issued again', r.b[0] === 'NOT ISSUED' && !r.b[1] && /didn't go through/.test(r.b[2]) && r.b[3], JSON.stringify(r.b));
    t('not validated yet → stays pending, keeps retrying, "Proof delayed — retrying"', r.c[0] === 'XRPL ISSUED' && r.c[1] >= 1 && r.c[2] === 'Proof delayed — retrying', JSON.stringify(r.c));
    t('no stuck "securing" wording on screen', !/securing/i.test(await pg.evaluate(() => document.body.innerText)));
    // Live: a submission that never confirms switches to "delayed — retrying" after 30 s and is re-checked
    const live = await pg.evaluate(() => { const c = creds.find(x => eligible(x) && x.kind === 'CERT_ACLS'); store.session.setXrplWallets(JSON.stringify({ i: 'i', s: 's' })); localStorage.setItem('xr_mock', JSON.stringify({ ledger: 20, nextHash: 'H4', tx: {} })); localStorage.setItem('xr_log', '[]'); issue(c.id); return c.id; });
    await pg.waitForFunction(id => creds.find(x => x.id === id)?.proofPending?.hash === 'H4', live);
    t('while submitting: "Proof in progress" with the hash saved before submit', await pg.evaluate(id => proofLabel(creds.find(x => x.id === id)), live) === 'Proof in progress');
    await pg.waitForTimeout(31500);
    const d1 = await pg.evaluate(id => ({ l: proofLabel(creds.find(x => x.id === id)), looked: JSON.parse(localStorage.getItem('xr_log')).filter(x => x.cmd === 'tx').map(x => x.hash), busy: $('busy').textContent }), live);
    t('after 30 s without confirmation: "Proof delayed — retrying" and the hash is looked up', d1.l === 'Proof delayed — retrying' && d1.looked.includes('H4'), JSON.stringify(d1));
    await pg.evaluate(() => localStorage.setItem('xr_mock', JSON.stringify({ ledger: 20, tx: { H4: { validated: true, code: 'tesSUCCESS' } } })));
    await pg.evaluate(() => recheckStaleProofs({ force: true }));
    t('once the ledger shows it validated, the proof moves on (issued, accept to finish)', await pg.evaluate(id => { const c = creds.find(x => x.id === id); return c.chain === 'SECURING' && c.issueTx === 'H4' && !c.proofPending; }, live));
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
    matrix[p + '/proof'] = await proofCheck(browsers[eng], name, vp);
  }
  for (const b of Object.values(browsers)) await b.close();
  console.log('\nMatrix: ' + Object.entries(matrix).map(([k, v]) => `${k}=${v ? 'pass' : 'FAIL'}`).join('  '));
  if (srv) srv.close();
  const f = R.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${R.length - f}/${R.length} passed`);
  process.exit(f ? 1 : 0);
})();
