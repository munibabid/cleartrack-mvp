/* PR 13: Verification Source Registry, verification levels, policy "Why",
   provenance, assignment-driven licenses, and the manual PSV route.
   Part A (always): demo regression in a headless phone browser.
   Part B (when staging is reachable: SUPABASE_DB_URL over 5432/6543, or a scoped
   SUPABASE_ACCESS_TOKEN over the Management API, see tests/live-db.js): account verifier records a real
   board check through record_source_check() on staging; throwaway users are
   created in SQL and deleted; Munib's account is checked unchanged.
   Run: BASE=http://localhost:8765/ node backend/tests/p13.js
        BASE=https://munibabid.github.io/cleartrack-mvp/ node backend/tests/p13.js */
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8765/';
const SH = process.env.SH || '/workspace/pr13-shots/';
const VERSION = 'v14.0 demo';
const W = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (i !== '' && i != null ? ' — ' + String(i).slice(0, 240) : ''); R.push(l); console.log(l); };
const skip = (n, why) => { const l = 'SKIP ' + n + ' — ' + why; R.push(l); console.log(l); };

async function partA(browser) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('dialog', d => d.accept());
  await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await pg.goto(BASE, { waitUntil: 'networkidle2' });
  const noSideScroll = () => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const shot = async (file, sel) => { await W(250); const h = sel && await pg.$(sel); if (h) { await pg.evaluate(e => e.scrollIntoView({ block: 'start' }), h); await W(150); await h.screenshot({ path: SH + file }); } else await pg.screenshot({ path: SH + file }); };

  const ver = await pg.evaluate(() => document.documentElement.textContent.includes('v14.0 demo'));
  ok('site shows ' + VERSION, ver);

  const reg = await pg.evaluate(() => ({
    n: VERIFICATION_SOURCES.length,
    boards: VERIFICATION_SOURCES.filter(s => s.type === 'LICENSING_BOARD').length,
    approvedBoards: VERIFICATION_SOURCES.filter(s => s.type === 'LICENSING_BOARD' && s.status === 'APPROVED').length,
    qc: verificationSource('nursys-quickconfirm'), en: verificationSource('nursys-enotify'), ai: verificationSource('ai-extraction'),
    pr: nursysParticipates('US-PR'), levels: Object.keys(VERIFICATION_LEVELS).length,
    never: ['DOCUMENT_REVIEW', 'SELF_ATTESTED', 'AI_EXTRACTION'].map(m => methodLevel(m)),
    neverOk: ['DOCUMENT_REVIEW', 'SELF_ATTESTED', 'AI_EXTRACTION'].every(m => methodLevel(m) == null || levelRank(methodLevel(m)) < levelRank('PRIMARY_SOURCE_VERIFIED')) && ['document-review','self-attestation','ai-extraction'].every(id => !verificationSource(id).level || levelRank(verificationSource(id).level) < levelRank('PRIMARY_SOURCE_VERIFIED')),
    issuers: ['aha-ecards', 'aha-rqi', 'redcross-certificate', 'aacn', 'bcen', 'ncc'].every(id => verificationSource(id)?.type === 'CERTIFYING_BODY')
  }));
  ok('registry has 115 sources incl. 56 approved boards', reg.n === 115 && reg.boards === 56 && reg.approvedBoards === 56, JSON.stringify([reg.n, reg.boards, reg.approvedBoards]));
  ok('QuickConfirm approved, PSV-equivalent, no API', reg.qc.status === 'APPROVED' && reg.qc.method === 'PRIMARY_SOURCE_EQUIVALENT' && !reg.qc.api.available);
  ok('e-Notify is PENDING (not faked as connected)', reg.en.status === 'PENDING' && reg.en.monitoring === true);
  ok('AI extraction is unapproved with no level', reg.ai.status === 'UNAPPROVED' && reg.never[2] == null);
  ok('upload/self-attestation never reach primary source', reg.neverOk, JSON.stringify(reg.never));
  ok('Puerto Rico is not a Nursys participant; issuers present; 7 levels', !reg.pr && reg.issuers && reg.levels === 7);

  // Golden path
  await pg.evaluate(() => { v81ShowRole('clinician'); showV7View('opportunitiesView'); });
  const before = await pg.evaluate(() => { const x = v81Assignment(getAssignment('boston-icu')); return { s: x.ok + '/' + x.total, miss: x.missing }; });
  ok('Boston starts at 11/12 missing the Massachusetts license', before.s === '11/12' && /Massachusetts/.test(before.miss.join()), JSON.stringify(before));
  const reqRole = await pg.evaluate(() => { showV7View('homeView'); render(); return { lic: ($('v7PassportLicV13') || {}).innerText || '' }; });
  await pg.evaluate(() => showV7View('passportView'));
  const lic = await pg.evaluate(() => (document.getElementById('v7PassportLicV13') || {}).innerText || '');
  ok('Passport names the RN license and the state license the assignment requires', /RN license/i.test(lic) && /Massachusetts/.test(lic) && /Required/i.test(lic), lic.slice(0, 200));
  await shot('01-passport-license.png', '#v7PassportLicV13');
  await pg.evaluate(() => { completeMissingRequirement('boston-icu'); $('dt').value = isoDaysFromNow(730); addCredentialFromForm(); });
  await W(300);
  const pend = await pg.evaluate(() => { const c = creds.find(x => x.kind === 'RN_LICENSE' && x.jurisdiction === 'US-MA'); return c && { id: c.id, p: c.primary }; });
  ok('Massachusetts license added and queued', pend && pend.p === 'VERIFYING', JSON.stringify(pend));
  await pg.evaluate(() => { v81ShowRole('verification'); document.querySelector('.verifyTab[data-target="verifyQueueV81"]').click(); });
  await W(250);
  const route = await pg.evaluate(id => { const b = document.querySelector(`.v81Verify[data-id="${id}"]`); return b ? b.closest('.row-v81').innerText : ''; }, pend.id);
  ok('queue shows the registry route for the license', /Massachusetts/.test(route) && /Primary Source/i.test(route), route.replace(/\s+/g, ' ').slice(0, 200));
  await pg.evaluate(id => document.querySelector(`.v81Verify[data-id="${id}"]`).click(), pend.id);
  await W(300);
  const after = await pg.evaluate(id => { const c = creds.find(x => x.id === id); const x = v81Assignment(getAssignment('boston-icu')); return { s: x.ok + '/' + x.total, lvl: c.verificationLevel, src: c.prov.source, sid: c.prov.sourceId, ref: c.prov.reference }; }, pend.id);
  ok('Boston reaches 12/12 after the (demo) PSV check', after.s === '12/12', after.s);
  ok('license level is Primary Source Verified, labelled demo', after.lvl === 'PRIMARY_SOURCE_VERIFIED' && /DEMO/.test(after.src) && /^DEMO-/.test(after.ref || ''), JSON.stringify(after));

  // Provenance dialog
  await pg.evaluate(id => { v81ShowRole('clinician'); showProof(id); }, pend.id);
  await W(300);
  const prov = await pg.evaluate(() => { const d = [...document.querySelectorAll('dialog[open]')].pop(); return d ? d.innerText : ''; });
  ok('provenance dialog: level, source, method, plain explanation', /PRIMARY SOURCE VERIFIED/i.test(prov) && /Provenance/.test(prov) && /Massachusetts/.test(prov), prov.replace(/\s+/g, ' ').slice(0, 220));
  
  await shot('02-provenance.png', 'dialog[open]');
  await pg.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close()));
  const row = await pg.evaluate(() => { showV7View('homeView'); render(); return [...document.querySelectorAll('#rows tr')].map(r => r.innerText).find(t => /Massachusetts/.test(t)) || ''; });
  ok('credential row shows level badge (demo)', /PRIMARY SOURCE VERIFIED · DEMO/i.test(row), row.replace(/\s+/g, ' ').slice(0, 200));

  // Organization Why
  await pg.evaluate(() => { v81ShowRole('organization'); });
  await W(300);
  const why = await pg.evaluate(() => {
    const d = [...document.querySelectorAll('details.why-v13')].find(x => x.offsetParent) || document.querySelector('details.why-v13'); if (!d) return null; d.classList.add('p13-shot');
    d.open = true; d.scrollIntoView({ block: 'center' });
    return { n: document.querySelectorAll('details.why-v13').length, t: d.innerText };
  });
  ok('organization readiness items have a "Why?" with policy trace', why && why.n > 0 && ['Decision', 'Required by', 'Policy', 'Effective', 'Required verification', 'Validity'].every(k => why.t.includes(k)), why && why.t.replace(/\s+/g, ' ').slice(0, 240));
  await shot('03-org-why.png', (await pg.evaluate(() => !!document.querySelector('.p13-shot')?.offsetParent)) ? '.p13-shot' : null);
  const ph = await pg.evaluate(() => { const x = v81Assignment(getAssignment('phoenix-ed'), DEMO_NURSES[1]); const i = x.items.find(i => i.req.kind === 'CERT_BLS'); return { lvl: i.req.minLevel, locked: i.req.levelRule.locked, attempted: i.req.levelRule.attempted, why: i.why || '' }; });
  ok('Phoenix cannot lower BLS below the issuer floor', ph.lvl === 'ISSUER_VERIFIED' && ph.locked && ph.attempted === 'DOCUMENT_REVIEWED', JSON.stringify(ph));
  const policy = await pg.evaluate(() => assignmentPolicy(getAssignment('boston-icu')));
  ok('Boston assignment carries policy id/version/effective', policy && /BHMC-ICU/.test(policy.id) && !!policy.effective, JSON.stringify(policy));

  // Verifier registry tab
  await pg.evaluate(() => { v81ShowRole('verification'); document.querySelector('.verifyTab[data-target="verifySourcesV13"]').click(); });
  await W(300);
  const rows = await pg.evaluate(() => document.querySelectorAll('.reg-row-v13').length);
  await pg.select('#regTypeV13', 'LICENSING_BOARD'); await W(200);
  const boards = await pg.evaluate(() => document.querySelectorAll('.reg-row-v13').length);
  await pg.select('#regTypeV13', ''); await pg.type('#regSearchV13', 'nursys'); await W(300);
  const nurs = await pg.evaluate(() => [...document.querySelectorAll('.reg-row-v13')].map(r => r.dataset.source));
  ok('Verification Sources tab lists 115, filters 56 boards, searches Nursys', rows === 115 && boards === 56 && nurs.includes('nursys-quickconfirm') && nurs.includes('nursys-enotify'), JSON.stringify([rows, boards, nurs.length]));
  ok('no sideways scroll at 390px (registry)', await noSideScroll());
  await shot('04-registry.png', '#verifySourcesBodyV13');

  for (const role of ['clinician', 'organization', 'verification']) {
    await pg.evaluate(r => v81ShowRole(r), role); await W(200);
    ok('no sideways scroll at 390px: ' + role, await noSideScroll());
  }
  ok('demo: no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

async function dbReachable() { return require('./live-db.js').reachable(); }

async function partB(browser) {
  const { client, mask, mode } = require('./live-db.js');
  const { generateSync } = require('otplib');
  const db = await client();
  console.log('staging DB via ' + await mode());
  const PREFIX = 'veridun-pr13-';
  let ids = [];
  const munibBefore = async () => (await db.query(`select u.role::text role,
      (select count(*)::int from public.credentials cr join public.clinicians k on k.id=cr.clinician_id where k.user_id=u.id) creds,
      (select string_agg(cr.status::text||':'||coalesce(cr.verification_level,''),',') from public.credentials cr join public.clinicians k on k.id=cr.clinician_id where k.user_id=u.id) st,
      (select count(*)::int from public.share_grants g join public.clinicians k on k.id=g.clinician_id where k.user_id=u.id) shares
      from public.users u where u.email='munibabid7@gmail.com'`)).rows[0];
  const cleanup = async () => {
    const all = (await db.query(`select id from auth.users where email like $1`, [PREFIX + '%@mailinator.com'])).rows.map(r => r.id);
    if (!all.length) return;
    const clin = (await db.query('select id from public.clinicians where user_id=any($1)', [all])).rows.map(r => r.id);
    const creds = (await db.query('select id from public.credentials where clinician_id=any($1)', [clin])).rows.map(r => r.id);
    await db.query('begin');
    try {
      for (const t of ['audit_events', 'analytics_events', 'monitoring_events']) await db.query(`alter table public.${t} disable trigger ${t}_append_only`);
      await db.query('delete from public.audit_events where actor_user_id=any($1) or clinician_id=any($2) or credential_id=any($3)', [all, clin, creds]);
      await db.query('delete from public.analytics_events where clinician_id=any($1)', [clin]);
      await db.query('delete from public.monitoring_events where actor_user_id=any($1) or credential_id=any($2)', [all, creds]);
      for (const t of ['audit_events', 'analytics_events', 'monitoring_events']) await db.query(`alter table public.${t} enable trigger ${t}_append_only`);
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
  const make = async (label) => {
    const u = { email: `${PREFIX}${label}-${crypto.randomBytes(3).toString('hex')}@mailinator.com`, password: 'T' + crypto.randomBytes(12).toString('base64url') + '9!', id: crypto.randomUUID() };
    await db.query(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
      values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`, [u.id, u.email, u.password]);
    await db.query(`insert into auth.identities (provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values ($1::text,$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text,'email_verified',true),'email',now(),now(),now())`, [u.id, u.email]);
    ids.push(u.id);
    return u;
  };
  try {
    const mig = (await db.query(`select count(*)::int n from pg_proc where proname='record_source_check'`)).rows[0].n;
    if (!mig) { skip('account PSV route', 'migration 7 is not applied to this database'); return; }
    await cleanup();
    const m0 = await munibBefore();
    const nurseU = await make('nurse'), verU = await make('verifier');
    await db.query(`update public.users set role='verifier' where id=$1`, [verU.id]);
    ok('throwaway users created without sending email', true);
    const mk = async () => { const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage(); pg.setDefaultTimeout(120000); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept()); await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await pg.goto(BASE, { waitUntil: 'networkidle2' }); return { pg, errs }; };
    const idle = (pg, ms = 60000) => pg.waitForFunction(() => !document.body.classList.contains('acct-busy-v10'), { timeout: ms });
    const signIn = async (pg, u) => { await pg.evaluate(async (e, p) => { await store.account.signInWithPassword(e, p); }, u.email, u.password); await pg.waitForFunction(() => store.account.signedIn, { timeout: 30000 }); await W(400); await pg.evaluate(() => { if (!accountWorkspace.classList.contains('active')) acctShow(); }); await W(300); };
    const nurse = await mk(), ver = await mk();
    await signIn(nurse.pg, nurseU);
    const cred = await nurse.pg.evaluate(async () => {
      await store.account.saveProfile({ full_name: 'PR13 Test Nurse', post_nominals: 'RN', specialty: 'ICU', home_jurisdiction: 'US-CA' });
      const row = await store.account.addCredential({ kind: 'RN_LICENSE', type_code: 'RN_LICENSE', display_name: 'RN License · California', jurisdiction_code: 'US-CA', expires_on: '2028-03-31' });
      acctRenderAll(); return row.id;
    });
    ok('nurse adds a California RN license', !!cred);
    const forged = await nurse.pg.evaluate(async id => { const { error } = await store.account.client.from('credentials').update({ verification_level: 'PRIMARY_SOURCE_VERIFIED', status: 'VERIFIED' }).eq('id', id); const r = await store.account.client.from('credentials').select('status,verification_level').eq('id', id).maybeSingle(); return { e: error && error.message, r: r.data }; }, cred);
    ok('clinician cannot set their own level', !forged.r || forged.r.verification_level == null, JSON.stringify(forged));
    await signIn(ver.pg, verU);
    await ver.pg.click('.acctTab[data-target="acctSecurityV12"]'); await W(250);
    await ver.pg.click('#acctMfaEnrollBtnV12'); await idle(ver.pg);
    await ver.pg.waitForSelector('#acctMfaSecretV12');
    const secret = await ver.pg.$eval('#acctMfaSecretV12', el => el.textContent.trim().replace(/\s/g, ''));
    await ver.pg.evaluate(c => { document.getElementById('acctMfaFirstV12').value = c; }, generateSync({ secret }));
    await ver.pg.click('#acctMfaConfirmV12 button[type=submit]'); await idle(ver.pg);
    ok('verifier reaches AAL2', await ver.pg.evaluate(() => store.account.mfa?.currentLevel === 'aal2'));
    await ver.pg.click('.acctTab[data-target="acctVerifyV12"]'); await W(300);
    await ver.pg.waitForFunction(id => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), { timeout: 30000 }, cred);
    await ver.pg.click(`.acct-verify-pick-v12[data-id="${cred}"]`);
    await ver.pg.waitForSelector('#acctVerifyFormV12[data-mode="registry"]', { timeout: 15000 });
    const opts = await ver.pg.$$eval('#acctVerifySourceIdV13 option', o => o.map(x => x.value));
    ok('source choices are the California board and Nursys QuickConfirm only', opts.includes('board-US-CA') && opts.includes('nursys-quickconfirm') && !opts.some(v => /board-US-(?!CA)/.test(v)), opts.join(','));
    await ver.pg.select('#acctVerifySourceIdV13', 'board-US-CA');
    await ver.pg.evaluate(() => { const f = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }; f('acctVerifyResultV12', 'VERIFIED'); f('acctVerifyStatusV13', 'ACTIVE'); f('acctVerifyExpV13', '2028-03-31'); f('acctVerifyRefV12', 'PR13-BOARD-REF'); document.getElementById('acctVerifyFormV12').scrollIntoView({ block: 'start' }); });
    await W(200); await ver.pg.screenshot({ path: SH + '05-verifier-psv-form.png' });
    await ver.pg.click('#acctVerifySaveV12'); await idle(ver.pg);
    const rec = await ver.pg.evaluate(() => acctLastRecord && { level: acctLastRecord.level, src: acctLastRecord.source_name, c: acctLastRecord.commitment });
    ok('record_source_check returns PRIMARY_SOURCE_VERIFIED from the board', rec && rec.level === 'PRIMARY_SOURCE_VERIFIED' && /California/.test(rec.src) && /^[0-9a-f]{64}$/.test(rec.c || ''), JSON.stringify(rec));
    const dbrow = (await db.query('select status::text, verification_level, monitoring_state, source_checked_at is not null checked from public.credentials where id=$1', [cred])).rows[0];
    ok('database row: VERIFIED, PSV, MANUAL_RECHECK', dbrow.status === 'VERIFIED' && dbrow.verification_level === 'PRIMARY_SOURCE_VERIFIED' && dbrow.monitoring_state === 'MANUAL_RECHECK' && dbrow.checked, JSON.stringify(dbrow));
    await nurse.pg.evaluate(async () => { await store.account.hydrate(); acctRenderAll(); });
    await W(500);
    const badge = await nurse.pg.evaluate(() => document.getElementById('accountWorkspace').innerText);
    ok('nurse sees PRIMARY SOURCE VERIFIED · Source · Checked', /PRIMARY SOURCE VERIFIED/.test(badge) && /California/.test(badge) && /Checked/.test(badge), badge.replace(/\s+/g, ' ').match(/.{0,60}PRIMARY SOURCE VERIFIED.{0,100}/)?.[0]);
    await nurse.pg.screenshot({ path: SH + '06-account-psv-badge.png' });
    const m1 = await munibBefore();
    ok("Munib's account unchanged", JSON.stringify(m0) === JSON.stringify(m1), JSON.stringify(m1));
    const pageErrs = [...nurse.errs, ...ver.errs];
    ok('account: no page errors', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | '));
  } catch (e) { ok('p13 account run', false, mask(e && e.stack ? e.stack : e)); }
  finally {
    try { await cleanup(); const left = (await db.query('select count(*)::int n from auth.users where email like $1', [PREFIX + '%'])).rows[0].n; ok('test users cleaned up', left === 0, 'left ' + left); }
    catch (e) { ok('cleanup', false, mask(e.message)); }
    await db.end().catch(() => {});
  }
}

(async () => {
  fs.mkdirSync(SH, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  try {
    await partA(browser);
    if (process.env.P13_SKIP_ACCOUNT) skip('account PSV route', 'P13_SKIP_ACCOUNT set');
    else if (await dbReachable()) await partB(browser);
    else skip('account PSV route', 'database not reachable from this machine');
  } catch (e) { ok('p13 run', false, String(e && e.stack || e).replace(/postgres(ql)?:\/\/[^\s'"]+/g, '***')); }
  finally { await browser.close().catch(() => {}); }
  const fails = R.filter(r => r.startsWith('FAIL')).length, skips = R.filter(r => r.startsWith('SKIP')).length;
  console.log(`\n${R.length - fails - skips}/${R.length - skips} passed${skips ? `, ${skips} skipped` : ''}`);
  process.exit(fails ? 1 : 0);
})();
