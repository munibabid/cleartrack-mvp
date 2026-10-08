/* PR 12: authenticator 2FA + XRPL verification anchors against staging.
   Throwaway users are created in SQL (no email) and deleted at the end. */
const fs = require('fs');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const { generateSync } = require('otplib');
const { client, mask } = require('/workspace/pr10/db.js');

const BASE = process.env.BASE || 'http://localhost:8765/';
const SH = process.env.SH || '/workspace/pr12-shots/';
const PDF = fs.readFileSync('/workspace/pr10/test-license.pdf');
const W = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const ok = (n, c, i = '') => {
  const l = (c ? 'PASS ' : 'FAIL ') + n + (i !== '' && i != null ? ' — ' + String(i).slice(0, 240) : '');
  R.push(l);
  console.log(l);
};
const today = () => new Date().toISOString().slice(0, 10);
const REF = 'PR12-LOOKUP-REF';
const NURSE_NAME = 'PR12 Test Nurse';

async function makeUsers(db) {
  const pw = () => 'T' + crypto.randomBytes(12).toString('base64url') + '9!';
  const make = async (label) => {
    const u = {
      email: `veridun-pr12-${label}-${crypto.randomBytes(3).toString('hex')}@mailinator.com`,
      password: pw(),
      id: crypto.randomUUID(),
      label
    };
    await db.query(`insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
      values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`,
      [u.id, u.email, u.password]);
    await db.query(`insert into auth.identities (provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values ($1::text,$3::uuid,jsonb_build_object($4::text,$1::text,$5::text,$2::text,$6::text,true),$7::text,now(),now(),now())`,
      [u.id, u.email, u.id, 'sub', 'email', 'email_verified', 'email']);
    const row = await db.query('select count(*)::int n from public.users where id=$1', [u.id]);
    if (!row.rows[0].n) throw new Error('public user row missing for ' + label);
    return u;
  };
  await db.query('begin');
  const nurse = await make('nurse');
  const verifier = await make('verifier');
  const org = await make('org');
  await db.query(`update public.users set role='verifier' where id=$1`, [verifier.id]);
  await db.query('commit');
  return { nurse, verifier, org };
}


async function wipeStorage(db, ids) {
  const KEY = process.env.SUPABASE_ANON_KEY;
  const URL = 'https://kiwbasfbiarscalzhopy.supabase.co';
  const objs = await db.query(`select name, split_part(name,'/',1) uid from storage.objects where bucket_id='source-documents' and name like any($1)`, [ids.map(id => id + '/%')]);
  const by = {};
  for (const r of objs.rows) (by[r.uid] ||= []).push(r.name);
  for (const uid of Object.keys(by)) {
    const password = 'T' + crypto.randomBytes(9).toString('base64url') + '9!';
    const email = (await db.query('select email from auth.users where id=$1', [uid])).rows[0].email;
    await db.query(`update auth.users set encrypted_password=extensions.crypt($2, extensions.gen_salt('bf')) where id=$1`, [uid, password]);
    await db.query('delete from auth.mfa_factors where user_id=$1', [uid]);
    const login = await fetch(URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const tok = await login.json();
    if (!tok.access_token) throw new Error('storage cleanup sign-in failed');
    const del = await fetch(URL + '/storage/v1/object/source-documents', {
      method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: by[uid] })
    });
    if (!del.ok) throw new Error('storage cleanup ' + del.status);
  }
}

async function cleanup(db, users, extraIds = []) {
  const ids = [...new Set([...(users ? [users.nurse.id, users.verifier.id, users.org.id] : []), ...extraIds])].filter(Boolean);
  if (!ids.length) return;
  await wipeStorage(db, ids);
  const bad = await db.query(`select email from auth.users where id=any($1) and email not like 'veridun-pr12-%@mailinator.com'`, [ids]);
  if (bad.rows.length) throw new Error('refusing to delete unexpected users');
  const clin = (await db.query(`select id from public.clinicians where user_id=any($1)`, [ids])).rows.map(r => r.id);
  const orgs = (await db.query(`select distinct org_id id from public.organization_members where user_id=any($1)`, [ids])).rows.map(r => r.id);
  const grants = (await db.query(`select id from public.share_grants where clinician_id=any($1) or org_id=any($2)`, [clin, orgs])).rows.map(r => r.id);
  const creds = (await db.query(`select id from public.credentials where clinician_id=any($1)`, [clin])).rows.map(r => r.id);
  await db.query('begin');
  try {
    for (const t of ['audit_events', 'share_access_events', 'analytics_events', 'monitoring_events'])
      await db.query(`alter table public.${t} disable trigger ${t}_append_only`);
    await db.query(`delete from public.audit_events where actor_user_id=any($1) or clinician_id=any($2) or org_id=any($3) or grant_id=any($4) or credential_id=any($5)`, [ids, clin, orgs, grants, creds]);
    await db.query(`delete from public.share_access_events where actor_user_id=any($1) or org_id=any($2) or grant_id=any($3)`, [ids, orgs, grants]);
    await db.query(`delete from public.analytics_events where clinician_id=any($1) or org_id=any($2)`, [clin, orgs]);
    await db.query(`delete from public.monitoring_events where actor_user_id=any($1) or credential_id=any($2)`, [ids, creds]);
    for (const t of ['audit_events', 'share_access_events', 'analytics_events', 'monitoring_events'])
      await db.query(`alter table public.${t} enable trigger ${t}_append_only`);
    await db.query(`delete from public.verification_anchors where credential_id=any($1)`, [creds]);
    await db.query(`delete from public.credential_verifications where credential_id=any($1)`, [creds]);
    await db.query(`delete from public.audit_anchors where clinician_id=any($1)`, [clin]);
    await db.query(`delete from public.share_grant_assertions where grant_id=any($1)`, [grants]);
    await db.query(`delete from public.share_grants where id=any($1)`, [grants]);
    await db.query(`delete from public.credentials where id=any($1)`, [creds]);
    await db.query(`delete from public.clinicians where id=any($1)`, [clin]);
    await db.query(`delete from public.organizations where id=any($1)`, [orgs]);
    await db.query(`delete from auth.mfa_factors where user_id=any($1)`, [ids]);
    await db.query(`delete from auth.users where id=any($1)`, [ids]);
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
  const left = await db.query(`select
    (select count(*) from auth.users where id=any($1)) users,
    (select count(*) from public.credentials where clinician_id=any($2)) creds,
    (select count(*) from public.credentials cr join public.clinicians k on k.id=cr.clinician_id join public.users u on u.id=k.user_id where u.email='munibabid7@gmail.com') munib_creds,
    (select count(*) from public.share_grants g join public.clinicians k on k.id=g.clinician_id join public.users u on u.id=k.user_id where u.email='munibabid7@gmail.com') munib_shares,
    (select role::text from public.users where email='munibabid7@gmail.com') munib_role`, [ids, clin]);
  console.log('cleanup remaining', JSON.stringify(left.rows[0]));
}

(async () => {
  fs.mkdirSync(SH, { recursive: true });
  const db = await client();
  let users = null;
  let browser = null;
  const state = {};
  try {
    const stale = (await db.query(`select id from auth.users where email like 'veridun-pr12-%@mailinator.com'`)).rows.map(r => r.id);
    if (stale.length) await cleanup(db, null, stale);
    users = await makeUsers(db);
    ok('throwaway users created without sending email', true);

    browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
    const mk = async () => {
      const ctx = await browser.createBrowserContext();
      const pg = await ctx.newPage();
      pg.setDefaultTimeout(180000);
      const errs = [];
      pg.on('pageerror', e => errs.push(e.message));
      pg.on('dialog', d => d.accept());
      await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await pg.goto(BASE, { waitUntil: 'networkidle2' });
      return { pg, errs };
    };
    const idle = (pg, ms = 30000) => pg.waitForFunction(() => !document.body.classList.contains('acct-busy-v10'), { timeout: ms });
    const signIn = async (pg, u) => {
      await pg.evaluate(async (e, pw) => { await store.account.signInWithPassword(e, pw); }, u.email, u.password);
      await pg.waitForFunction(() => store.account.signedIn, { timeout: 30000 });
      await W(400);
    };
    const openWs = async pg => { await pg.evaluate(() => { if (!accountWorkspace.classList.contains('active')) acctShow(); }); await W(200); };
    const tab = async (pg, t) => { await pg.click(`.acctTab[data-target="${t}"]`); await W(250); };
    const shot = async (pg, file, sel) => {
      await pg.evaluate((sel) => {
        ['acctEmailShownV10','acctWsEmailV10'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = 'signed-in test account'; });
        if (!sel) return;
        document.querySelectorAll('.acctPanel').forEach(panel => panel.classList.toggle('hidden', panel.id !== 'acctOrgV10' && panel.id !== 'acctSecurityV12' && panel.id !== 'acctVerifyV12' && !panel.contains(document.querySelector(sel))));
        const el = document.querySelector(sel);
        if (el) {
          let panel = el.closest('.acctPanel');
          if (panel) { document.querySelectorAll('.acctPanel').forEach(p => p.classList.add('hidden')); panel.classList.remove('hidden'); }
          el.scrollIntoView({ block: 'center' });
        }
      }, sel || '');
      await W(200);
      if (sel) {
        const handle = await pg.$(sel);
        if (handle) { await handle.screenshot({ path: SH + file }); return; }
      }
      await pg.screenshot({ path: SH + file });
    };
    const totp = secret => generateSync({ secret: String(secret).replace(/\s/g, '') });

    const nurse = await mk();
    const orgP = await mk();
    const ver = await mk();

    await signIn(orgP.pg, users.org);
    await openWs(orgP.pg);
    state.orgId = await orgP.pg.evaluate(async () => {
      const o = await store.account.createOrganization('PR12 Test Agency');
      return o.id;
    });
    ok('org user creates an organization without 2FA', !!state.orgId);

    await signIn(nurse.pg, users.nurse);
    await openWs(nurse.pg);
    state.cred = await nurse.pg.evaluate(async (name, exp, bytes) => {
      await store.account.saveProfile({ full_name: name, post_nominals: 'RN', specialty: 'ICU', home_jurisdiction: 'US-ME' });
      const row = await store.account.addCredential({ kind: 'CERT_BLS', type_code: 'CERT_BLS', display_name: 'BLS', expires_on: exp });
      const file = new File([new Uint8Array(bytes)], 'note.pdf', { type: 'application/pdf' });
      const saved = await store.account.uploadDocument(row.id, file);
      acctRenderAll();
      return { id: saved.id, path: saved.source_document_path, clinician: store.account.cache.profile.id };
    }, NURSE_NAME, '2028-06-01', [...PDF]);
    ok('nurse profile, BLS, and private document saved before 2FA', !!state.cred.path);

    await tab(nurse.pg, 'acctSecurityV12');
    await nurse.pg.click('#acctMfaEnrollBtnV12');
    await idle(nurse.pg);
    await nurse.pg.waitForSelector('#acctMfaSecretV12');
    state.nurseSecret = await nurse.pg.$eval('#acctMfaSecretV12', el => el.textContent.trim());
    const qr = await nurse.pg.$eval('#acctMfaQrV12', el => el.getAttribute('src') || '');
    ok('enroll returns a QR code and a base32 secret', qr.startsWith('data:image/') && state.nurseSecret.length >= 16);
    await nurse.pg.evaluate(() => document.getElementById('acctMfaQrV12').scrollIntoView({ block: 'center' }));
    await shot(nurse.pg, '01-2fa-qr.png');

    await nurse.pg.evaluate((code) => { document.getElementById('acctMfaFirstV12').value = code; }, totp(state.nurseSecret));
    await nurse.pg.click('#acctMfaConfirmV12 button[type=submit]');
    await idle(nurse.pg);
    const enrolled = await nurse.pg.evaluate(() => store.account.mfa?.currentLevel === 'aal2' && store.account.hasVerifiedFactor());
    ok('first authenticator code reaches AAL2', enrolled, await nurse.pg.$eval('#acctWsMsgV10', el => el.textContent).catch(() => ''));

    await nurse.pg.click('#acctWsSignOutV10');
    await idle(nurse.pg);
    await nurse.pg.waitForFunction(() => !store.account.signedIn);
    await signIn(nurse.pg, users.nurse);
    await nurse.pg.waitForSelector('#acctMfaPromptV12', { timeout: 20000 });
    const blockedUi = await nurse.pg.evaluate((name) => {
      const prompt = !!document.getElementById('acctMfaPromptV12');
      const passportHidden = document.getElementById('acctPassportV10').classList.contains('hidden');
      const noName = !document.getElementById('acctPassportV10').innerHTML.includes(name) && !document.getElementById('acctMfaPromptV12').textContent.includes(name);
      return { prompt, passportHidden, noName, creds: store.account.cache.credentials.length };
    }, NURSE_NAME);
    ok('after email sign-in the code prompt shows and account data stays hidden', blockedUi.prompt && blockedUi.passportHidden && blockedUi.noName && blockedUi.creds === 0, JSON.stringify(blockedUi));
    await shot(nurse.pg, '02-code-prompt.png');

    const aal1 = await nurse.pg.evaluate(async (cred, orgId) => {
      const c = store.account.client;
      const rows = await c.from('credentials').select('id,display_name');
      const share = await c.from('share_grants').insert({
        clinician_id: cred.clinician, org_id: orgId, token_hash: 'ab'.repeat(32), duration: 'UNTIL_REVOKED', status: 'ACTIVE'
      }).select('id');
      const signed = await c.storage.from('source-documents').createSignedUrl(cred.path, 60);
      return {
        n: rows.data ? rows.data.length : -1,
        share: share.error ? share.error.message : 'INSERTED',
        signed: signed.error ? signed.error.message : (signed.data?.signedUrl ? 'URL' : 'NONE')
      };
    }, state.cred, state.orgId);
    ok('AAL1 with a factor cannot read credentials', aal1.n === 0, 'rows ' + aal1.n);
    ok('AAL1 with a factor cannot create a share', /row-level security|policy/i.test(aal1.share), aal1.share);
    ok('AAL1 with a factor cannot open a document', aal1.signed !== 'URL', aal1.signed);

    await nurse.pg.evaluate((code) => { document.getElementById('acctMfaCodeV12').value = code; }, totp(state.nurseSecret));
    await nurse.pg.click('#acctMfaGateFormV12 button[type=submit]');
    await idle(nurse.pg);
    await nurse.pg.waitForFunction(() => store.account.cache.credentials.length === 1, { timeout: 20000 });
    const aal2read = await nurse.pg.evaluate(async (path) => {
      const rows = await store.account.client.from('credentials').select('id');
      const signed = await store.account.client.storage.from('source-documents').createSignedUrl(path, 60);
      return { n: rows.data.length, url: !!signed.data?.signedUrl, err: signed.error?.message || '' };
    }, state.cred.path);
    ok('AAL2 can read the credential and open the document', aal2read.n === 1 && aal2read.url, aal2read.err);

    const self = await nurse.pg.evaluate(async (id, day) => {
      const { error } = await store.account.client.rpc('record_verification', {
        p_credential: id, p_result: 'VERIFIED', p_source_name: 'AHA eCard verification', p_reference: 'SHOULD-NOT', p_checked_on: day
      });
      return error ? error.message : 'NO_ERROR';
    }, state.cred.id, today());
    ok('clinician cannot record their own verification', /only a verifier/i.test(self), self);

    state.share = await nurse.pg.evaluate(async (orgId, credId) => {
      return store.account.createShare({
        orgId, duration: 'UNTIL_REVOKED', assignmentLabel: 'PR12 ICU assignment',
        assertions: [{ credentialId: credId, mode: 'VERIFIED_CREDENTIAL', requirementLabel: 'BLS' }]
      });
    }, state.orgId, state.cred.id);
    ok('AAL2 clinician can create a share', /^[0-9a-f]{32}$/.test(state.share.token));

    await signIn(ver.pg, users.verifier);
    await openWs(ver.pg);
    await tab(ver.pg, 'acctSecurityV12');
    await ver.pg.click('#acctMfaEnrollBtnV12');
    await idle(ver.pg);
    await ver.pg.waitForSelector('#acctMfaSecretV12');
    state.verSecret = await ver.pg.$eval('#acctMfaSecretV12', el => el.textContent.trim());
    await ver.pg.evaluate((code) => { document.getElementById('acctMfaFirstV12').value = code; }, totp(state.verSecret));
    await ver.pg.click('#acctMfaConfirmV12 button[type=submit]');
    await idle(ver.pg);
    ok('verifier enrolls an authenticator and reaches AAL2', await ver.pg.evaluate(() => store.account.mfa?.currentLevel === 'aal2'));

    const aal1ver = await (async () => {
      const ctx = await browser.createBrowserContext();
      const pg = await ctx.newPage();
      pg.on('dialog', d => d.accept());
      await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
      await pg.evaluate(async (e, pw) => { await store.account.signInWithPassword(e, pw); }, users.verifier.email, users.verifier.password);
      await pg.waitForFunction(() => store.account.needsMfaChallenge());
      const msg = await pg.evaluate(async (id, day) => {
        const { error } = await store.account.client.rpc('record_verification', {
          p_credential: id, p_result: 'VERIFIED', p_source_name: 'AHA eCard verification', p_reference: 'NOPE', p_checked_on: day
        });
        return error ? error.message : 'NO_ERROR';
      }, state.cred.id, today());
      await ctx.close();
      return msg;
    })();
    ok('verifier at AAL1 cannot record a verification', /authenticator/i.test(aal1ver), aal1ver);

    await tab(ver.pg, 'acctVerifyV12');
    await ver.pg.waitForFunction((id) => !!document.querySelector(`.acct-verify-pick-v12[data-id="${id}"]`), { timeout: 20000 }, state.cred.id);
    await ver.pg.click(`.acct-verify-pick-v12[data-id="${state.cred.id}"]`);
    await ver.pg.waitForSelector('#acctLookupLinkV12');
    await ver.pg.evaluate((id) => {
      document.querySelectorAll('.acct-verify-pick-v12').forEach(b => { if (b.dataset.id !== id) b.remove(); });
    }, state.cred.id);
    await ver.pg.evaluate((ref) => { document.getElementById('acctVerifyRefV12').value = ref; }, REF);
    const href = await ver.pg.$eval('#acctLookupLinkV12', a => a.href);
    ok('BLS lookup link is the AHA eCard page', /ecards\.heart\.org/.test(href), href);
    await ver.pg.evaluate(() => document.getElementById('acctVerifyFormV12').scrollIntoView({ block: 'start' }));
    await shot(ver.pg, '03-verifier-record.png');
    await ver.pg.click('#acctVerifySaveV12');
    await idle(ver.pg);
    const recorded = await ver.pg.evaluate(() => ({
      result: acctLastRecord && acctLastRecord.result,
      commitment: acctLastRecord && acctLastRecord.commitment,
      id: acctLastRecord && acctLastRecord.verification_id
    }));
    ok('verifier records VERIFIED and gets a 64-hex commitment', recorded.result === 'VERIFIED' && /^[0-9a-f]{64}$/.test(recorded.commitment || ''), recorded.commitment);

    await ver.pg.click('#acctAnchorNowV12');
    await idle(ver.pg, 180000);
    state.anchor = await ver.pg.evaluate(() => ({
      tx: acctLastRecord && (acctLastRecord.tx_hash || acctLastRecord.txHash),
      network: acctLastRecord && acctLastRecord.network,
      msg: (document.getElementById('acctWsMsgV10') || {}).textContent || ''
    }));
    ok('anchor transaction stored', /^[0-9A-Fa-f]{64}$/.test(state.anchor.tx || ''), state.anchor.msg + ' ' + (state.anchor.network || ''));

    const memo = await ver.pg.evaluate(async (hash, network, commitment) => {
      const net = XRPL_ANCHOR.nets[network] || XRPL_ANCHOR.nets.XRPL_TESTNET;
      const client = new xrpl.Client(net.ws);
      await client.connect();
      const r = await client.request({ command: 'tx', transaction: hash });
      await client.disconnect();
      const tx = Object.assign({}, r.result, r.result.tx_json || {});
      const memos = (tx.Memos || []).map(m => ({ type: xrplHexToUtf8(m.Memo.MemoType), data: xrplHexToUtf8(m.Memo.MemoData) }));
      return { memos, account: tx.Account || '' };
    }, state.anchor.tx, state.anchor.network, recorded.commitment);
    const blob = JSON.stringify(memo.memos);
    ok('ledger memo is only the commitment and the Veridun label',
      memo.memos.length === 1 && memo.memos[0].type === 'veridun.verification-anchor.v1' && memo.memos[0].data === recorded.commitment,
      JSON.stringify(memo.memos.map(m => m.type + ':' + (m.data || '').slice(0, 16))));
    ok('memo has no reference, name, or email', !blob.includes(REF) && !blob.includes(NURSE_NAME) && !/mailinator|@/.test(blob) && /^r/.test(memo.account));

    await orgP.pg.evaluate(async (token) => { acctOrgResult = await store.account.openShare(token); acctRenderOrg(); }, state.share.token);
    await orgP.pg.waitForSelector('#acctXrplCheckV12');
    await orgP.pg.evaluate(() => document.getElementById('acctXrplCheckV12').click());
    await idle(orgP.pg, 90000);
    await orgP.pg.waitForSelector('[data-xrpl="match"]', { timeout: 20000 });
    const matchText = await orgP.pg.$eval('[data-xrpl="match"]', el => el.innerText);
    ok('organization check shows Matches ledger', /Matches ledger/.test(matchText) && /does not prove the credential is real/i.test(matchText));
    await orgP.pg.evaluate(() => document.querySelector('[data-xrpl="match"]').scrollIntoView({ block: 'center' }));
    await shot(orgP.pg, '04-matches-ledger.png', '[data-xrpl="match"]');

    await db.query('update public.credentials set expires_on = expires_on + 1 where id=$1', [state.cred.id]);
    await orgP.pg.evaluate(() => document.getElementById('acctXrplCheckV12').click());
    await idle(orgP.pg, 90000);
    await orgP.pg.waitForSelector('[data-xrpl="mismatch"]', { timeout: 20000 });
    const misText = await orgP.pg.$eval('[data-xrpl="mismatch"]', el => el.innerText);
    ok('changing expiration makes the org check a mismatch', /Mismatch \/ altered/.test(misText));
    await orgP.pg.evaluate(() => document.querySelector('[data-xrpl="mismatch"]').scrollIntoView({ block: 'center' }));
    await shot(orgP.pg, '05-tamper-mismatch.png', '[data-xrpl="mismatch"]');

    try {
      await tab(nurse.pg, 'acctActivityV10');
      await nurse.pg.click('#acctLogAnchorV12');
      await idle(nurse.pg, 180000);
      await nurse.pg.click('#acctLogCheckV12');
      await idle(nurse.pg, 90000);
      const logText = await nurse.pg.evaluate(() => ((document.getElementById('acctLogResultV12') || {}).textContent || '') + ' || ' + ((document.getElementById('acctWsMsgV10') || {}).textContent || ''));
      ok('activity-log anchor matches on the ledger', /matches the anchored fingerprint/i.test(logText) && /Ledger memo matches/.test(logText), logText.slice(0, 220));
    } catch (e) {
      console.log('NOTE activity-log ledger anchor skipped: ' + mask(e.message).slice(0, 200));
      ok('activity-log anchor (optional)', false, mask(e.message).slice(0, 180));
    }

    const pageErrs = [...nurse.errs, ...ver.errs, ...orgP.errs].filter(e => !/favicon/i.test(e));
    ok('no page errors', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | '));
  } catch (e) {
    ok('p12 run', false, mask(e && e.stack ? e.stack : e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    try { await cleanup(db, users); }
    catch (e) { console.log('CLEANUP FAIL ' + mask(e.message)); }
    await db.end().catch(() => {});
  }
  const fails = R.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${R.length - fails}/${R.length} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(mask(e.stack || e.message || e)); process.exit(1); });
