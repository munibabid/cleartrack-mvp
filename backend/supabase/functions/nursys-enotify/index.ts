// Nursys e-Notify connector — SERVER-SIDE STUB. NOT DEPLOYED. CANNOT RUN YET.
//
// Nursys e-Notify is free for institutions and has a JSON API to:
//   * build and maintain the institution's Nurse List (enroll / remove licenses),
//   * pull Nurse Report license data for enrolled licenses,
//   * pull license-change notifications,
//   * change the API password (required every 90 days).
// Nursys has NO API for QuickConfirm and NO test environment or sample nurses.
//
// This function refuses to do anything until Munib has (see docs/NURSYS-ENOTIFY.md):
//   1. a free Nursys e-Notify INSTITUTION account, and
//   2. API credentials issued by NCSBN for that account,
// stored as Supabase function secrets (never in the browser or the repo):
//   NURSYS_ENOTIFY_API_BASE      base URL from the e-Notify API specification
//   NURSYS_ENOTIFY_USERNAME      API user name issued by NCSBN
//   NURSYS_ENOTIFY_PASSWORD      API password (rotate every 90 days)
//   NURSYS_ENOTIFY_PASSWORD_SET  date the password was last changed (YYYY-MM-DD)
//
// Honesty rule: this function never invents a license result. With no
// credentials it returns 503 { configured: false }. With credentials but no
// endpoint mapping (the request/response shapes are in the e-Notify API
// specification, available only after signing in to the institution account)
// it returns 501. Nothing is written to the database in either case.
//
// When connected, results are recorded with the registry source
// 'nursys-enotify' (status must first be set to APPROVED by an admin), method
// PRIMARY_SOURCE_EQUIVALENT, monitoring ENROLLED -> Continuously Monitored.
//
// Header: Authorization: Bearer <user JWT> (verifier or admin, at AAL2)
// Body:   { action: "status" | "enroll" | "lookup" | "notifications", ... }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2'

const REQUIRED = ['NURSYS_ENOTIFY_API_BASE', 'NURSYS_ENOTIFY_USERNAME', 'NURSYS_ENOTIFY_PASSWORD', 'NURSYS_ENOTIFY_PASSWORD_SET']
const ACTIONS = ['status', 'enroll', 'lookup', 'notifications']
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function passwordAgeDays(): number | null {
  const set = Deno.env.get('NURSYS_ENOTIFY_PASSWORD_SET') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(set)) return null
  return Math.floor((Date.now() - new Date(set + 'T00:00:00Z').getTime()) / 86400000)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  const auth = req.headers.get('Authorization') || ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }
  })
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) return json(401, { error: 'Sign in required' })
  const { data: role } = await supabase.from('users').select('role').eq('id', userData.user.id).maybeSingle()
  if (!role || !['verifier', 'admin'].includes(role.role)) return json(403, { error: 'Verifier or admin only' })
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') return json(403, { error: 'Enter your authenticator code first (AAL2)' })

  const body = await req.json().catch(() => ({}))
  const action = String(body.action || 'status')
  if (!ACTIONS.includes(action)) return json(400, { error: 'unknown action', actions: ACTIONS })

  const missing = REQUIRED.filter((k) => !Deno.env.get(k))
  if (missing.length) {
    return json(503, {
      configured: false,
      missing,
      message: 'Nursys e-Notify is not connected. Veridun needs a free Nursys e-Notify institution account and API credentials issued by NCSBN. No license data was fetched and nothing was recorded.',
      steps: 'docs/NURSYS-ENOTIFY.md'
    })
  }
  const age = passwordAgeDays()
  if (age === null || age >= 90) {
    return json(503, {
      configured: false,
      message: 'The e-Notify API password must be changed every 90 days. Change it in Nursys (or with the API change-password call), then update NURSYS_ENOTIFY_PASSWORD and NURSYS_ENOTIFY_PASSWORD_SET.',
      password_age_days: age
    })
  }
  if (action === 'status') {
    return json(200, { configured: true, password_age_days: age, password_change_due_in_days: 90 - age, connected: false,
      message: 'Credentials are present. Endpoint mapping is not implemented yet (see docs/NURSYS-ENOTIFY.md, step 5).' })
  }
  // Deliberately not implemented: the request/response shapes come from the
  // e-Notify API specification, which is only available after signing in to
  // the institution account. Never return a guessed or sample result.
  return json(501, {
    configured: true,
    action,
    message: 'Not implemented: map this action to the e-Notify API specification first. No request was sent to Nursys and no result was recorded.'
  })
})
