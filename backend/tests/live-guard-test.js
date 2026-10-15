#!/usr/bin/env node
/* Munib t151u E: the staging guard refuses loudly. Spawns the live-capable suites with FAKE
   credentials (an unroutable 127.0.0.1:9 URL, a dummy token) and no opt-in: each must exit non-zero
   with "REFUSING TO RUN" before any browser or database work. Also checks the guard's rules directly
   and that the CI workflow never sets a P*_LIVE flag. Never contacts any database. */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const G = require('./lib/live-guard.js');
const R = []; const ok = (n, c, i = '') => { const l = (c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''); R.push(l); console.log(l); };
const FAKE = { SUPABASE_DB_URL: 'postgres://fake:fake@127.0.0.1:9/none', SUPABASE_ACCESS_TOKEN: 'sbp_fake_not_a_token' };
const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !G.CRED_VARS.includes(k) && !G.LIVE_FLAGS.includes(k) && k !== 'CI' && k !== 'GITHUB_ACTIONS'));
// rules
ok('creds + no opt-in → refuse', !G.check('x', 'P12_LIVE', { ...FAKE }).ok);
ok('only an access token + no opt-in → refuse', !G.check('x', 'P13_LIVE', { SUPABASE_ACCESS_TOKEN: 'sbp_x' }).ok);
ok('opt-in for a different suite does not count', !G.check('x', 'P14_LIVE', { ...FAKE, P12_LIVE: '1' }).ok);
ok('no creds, no opt-in → allowed, live part off', (r => r.ok && !r.live)(G.check('x', 'P12_LIVE', {})));
ok('opt-in in CI → refuse', !G.check('x', 'P12_LIVE', { ...FAKE, P12_LIVE: '1', CI: 'true' }).ok);
ok('creds + explicit opt-in outside CI → live', (r => r.ok && r.live)(G.check('x', 'P12_LIVE', { ...FAKE, P12_LIVE: '1' })));
const savedEnv = { ...process.env }; for (const k of [...G.LIVE_FLAGS, 'CI', 'GITHUB_ACTIONS']) delete process.env[k];
let threw = ''; try { G.assertOptedIn('db client'); } catch (e) { threw = e.message; }
ok('database helper refuses without an opt-in', /REFUSING/.test(threw), threw);
Object.assign(process.env, savedEnv);
// suites, spawned
for (const s of ['p12', 'p13', 'p14']) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, s + '.js')], { env: { ...base, ...FAKE }, encoding: 'utf8', timeout: 60000 });
  const out = (r.stdout || '') + (r.stderr || '');
  ok(`${s}: credentials without ${s.toUpperCase()}_LIVE=1 → refuses, non-zero exit, before any work`, r.status !== 0 && r.status !== null && /REFUSING TO RUN/.test(out) && !/PASS /.test(out), `exit=${r.status} ${Date.now() - t0}ms`);
  ok(`${s}: no credential value is printed`, !out.includes('sbp_fake_not_a_token') && !out.includes('fake:fake@'));
}
// CI never opts in
const wf = path.join(__dirname, '../../.github/workflows');
const yml = fs.readdirSync(wf).map(f => fs.readFileSync(path.join(wf, f), 'utf8')).join('\n');
ok('CI workflows never set P*_LIVE', !/P1[0-9]_LIVE/.test(yml));
const fails = R.filter(l => l.startsWith('FAIL')).length;
console.log(`\n${R.length - fails}/${R.length} passed`);
process.exit(fails ? 1 : 0);
