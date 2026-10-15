/* v14.8 (Munib t151u E): hard guard for suites that can reach the staging/live database.
   - Credentials in the environment WITHOUT the suite's explicit opt-in (P12_LIVE=1 / P13_LIVE=1 / P14_LIVE=1)
     → the suite REFUSES to run and exits non-zero (2). Never a silent skip, never a silent live run.
   - The opt-in is refused in CI (CI / GITHUB_ACTIONS set): normal CI must never run live parts.
   - No credentials and no opt-in → the live part is skipped (the offline part still runs).
   Values are never printed, only variable names. */
const CRED_VARS = ['SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'DATABASE_URL'];
const LIVE_FLAGS = ['P12_LIVE', 'P13_LIVE', 'P14_LIVE'];
function credsPresent(env = process.env) { return CRED_VARS.filter(v => env[v] && String(env[v]).trim()); }
function check(suite, flag, env = process.env) {
  const present = credsPresent(env), optIn = env[flag] === '1', ci = !!(env.CI || env.GITHUB_ACTIONS);
  if (optIn && ci) return { ok: false, live: false, msg: `REFUSING TO RUN ${suite}: ${flag}=1 is set in CI. Normal CI must never run live/staging tests.` };
  if (present.length && !optIn) return { ok: false, live: false, msg: `REFUSING TO RUN ${suite}: staging/live credentials are in the environment (${present.join(', ')}) but ${flag}=1 is not set. Unset them, or opt in explicitly with ${flag}=1 for a deliberate staging run.` };
  return { ok: true, live: optIn };
}
/* Call FIRST in a suite, before any browser or database work. */
function guard(suite, flag) {
  const r = check(suite, flag);
  if (!r.ok) { console.error('\n' + r.msg + '\n\nFAIL live-guard: ' + suite); process.exit(2); }
  return r.live;
}
/* For the database helpers: refuse to open a live connection unless some suite opted in. */
function assertOptedIn(what) {
  if (!LIVE_FLAGS.some(f => process.env[f] === '1')) throw new Error(`REFUSING ${what}: no live opt-in (${LIVE_FLAGS.join('/')}=1) is set. Live/staging access is never implicit.`);
  if (process.env.CI || process.env.GITHUB_ACTIONS) throw new Error(`REFUSING ${what}: live/staging access is never allowed in CI.`);
}
module.exports = { CRED_VARS, LIVE_FLAGS, credsPresent, check, guard, assertOptedIn };
