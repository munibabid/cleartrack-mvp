# Veridun gap analysis (RN-only)

Written Oct 9, 2026, against `main` at v12.0 (b250f71). Updated with what PR 13 changes. It follows the handoff's order: real verification → policy trust → organization review → notifications → AI extraction → pilot → XRPL Permission Delegation + Batch → API.

**Legend:** ✅ already complete · 🟡 partially complete · ❌ missing. "(PR 13)" marks items this PR adds or moves.

## Already complete

- ✅ **Static app with three roles** (clinician, organization, verifier) and a guided tour. Files: `index.html`, `js/app.js`, `js/roles/*.js`, `js/tour.js`, `js/menu.js`.
- ✅ **RN credential catalog and NLC compact logic.** All 56 jurisdictions, multistate coverage, layered STATE / WORK_TYPE / SPECIALTY / FACILITY requirements. Files: `js/credential-catalog.js`, `js/requirements.js`, `js/specialties.js`.
- ✅ **Readiness engine and the Boston golden path** (11/12 → 12/12 after adding a Massachusetts license). Five demo assignments. Files: `js/readiness-engine.js`, `js/assignments.js`, `js/insights.js`.
- ✅ **Sharing.** Scoped, time-limited share links with revoke and extension requests, both in the demo and server-side. Files: `js/sharing.js`; `public.access_share_by_token`, `get_share_assertions`, `revoke_share_grant`, `resolve_extension_request` in migrations 3 and 4.
- ✅ **Real accounts on Supabase** with magic links, RLS on every table, private document storage, and staging accounts. Files: `js/store.js` (`SupabaseAdapter`), `js/account.js`, migrations 1–4, `docs/BACKEND.md`.
- ✅ **Authenticator 2FA (TOTP, AAL2)** required for privileged actions. Files: `js/account-mfa.js`; `private.privileged_mfa_ok` and `mfa_satisfied` in migration 6.
- ✅ **XRPL Testnet anchors.** SHA-256 commitments (`veridun-verification-v1`) for verification and activity records, re-checked against the ledger. No health data on chain. Files: `js/anchor.js`, `js/xrpl.js`; `attach_verification_anchor`, `share_anchor_disclosure` and `*_activity_anchor` in migration 6.
- ✅ **Analytics and mobile layout.** Files: `js/analytics.js`, `css/app.css`.
- ✅ **(PR 13) Verification Source Registry.** 70 sources: all 56 boards, Nursys QuickConfirm, Nursys e-Notify (pending), AHA eCards/RQI, Red Cross (certificate and Health & Safety Training), AACN, BCEN, NCC, employer, screening vendor, document review, self-attestation, and AI extraction (unapproved). Files: `js/verification-registry.js`; `verification_sources` in migration 7; `seed/03_verification_registry.sql`; the verifier's "Verification Sources" tab (`renderRegistryV13` in `js/roles/verifier.js`).
- ✅ **(PR 13) Seven verification levels.** Upload, self-attestation and AI extraction can never count as primary source. This is enforced in JS (`NEVER_PRIMARY_SOURCE`) and in the database (`verification_sources` checks, `credentials_level_guard`, the restrictive `verifications_no_client_level` policy).
- ✅ **(PR 13) Minimum level per requirement with locked floors.** Licenses need PSV; certifications need Issuer. A facility can raise a floor but not lower a locked one. Files: `kindFloor` / `requiredLevelFor` in `js/verification-registry.js`, `LEVEL_TOO_LOW` in `js/readiness-engine.js`, `private.requirements_level_floor` trigger. Demo: Phoenix's BLS override is kept at Issuer.
- ✅ **(PR 13) An honest manual PSV route.** A verifier at AAL2 checks the board or Nursys QuickConfirm and records the source, check date, status at source, expiration, reference and monitoring state. The credential then shows "PRIMARY SOURCE VERIFIED · Source · Checked". Files: `public.record_source_check` in migration 7, `recordSourceCheck` in `js/store.js`, `acctRenderVerify` in `js/account-mfa.js`, `acctCredStatus` in `js/account.js`.
- ✅ **(PR 13) Provenance and policy traceability.** Each requirement shows a "Why?" with decision, policy id/version, required-by, effective date, required level, validity rule and assignment policy. Each credential shows who/method/source/time/evidence/policy/XRPL. Files: `withPolicy` / `POLICY_VERSIONS` / `assignmentPolicy` in `js/requirements.js`, `requirementWhyHtml` in `js/roles/organization.js`, `provenanceRows` / `PROVENANCE_HELP` in `js/verification.js`, `acctProvenanceHtml` in `js/account.js`.
- ✅ **(PR 13) Licenses follow the assignment.** An RN license is required for the Passport. A state license the assignment needs, and that the home/compact license doesn't cover, is marked Required. Files: `onboarding()` in `js/requirements.js`, `credentialRequirementRole` / `passportLicenseLine` in `js/roles/clinician.js`, `acctPassportLicenseNote` in `js/account.js`.

## Partially complete

- 🟡 **Nursys automation.** Facts are recorded and the e-Notify registry entry is PENDING. The Edge Function is a stub that refuses to run without NCSBN credentials (`backend/supabase/functions/nursys-enotify/index.ts`). Munib's steps are in `docs/NURSYS-ENOTIFY.md`. "Continuously Monitored" can't be reached until the source is APPROVED.
- 🟡 **Demo verification is simulated.** The demo console (`v81Verify` in `js/verification.js`) now uses the registry route and the correct level, but every result is labelled "simulated lookup (DEMO)". Only the account route records real checks.
- 🟡 **Issuer checks.** AHA, Red Cross, AACN, BCEN and NCC have free web lookups only, with no API. A verifier records them by hand at Issuer Verified. There is no automation, by design.
- 🟡 **Organization view of levels.** The demo organization view shows levels and "Why". The server's `get_share_assertions` (migration 3/4) does **not** yet return `verification_level` or the source, so a real org recipient of a share sees VERIFIED without the level.
- 🟡 **Readiness terminology ladder** (Not Started → In Progress → Ready for Review → Ready for Submission). It isn't in PR 13; it belongs with organization review (step 3) to avoid a half state. Current badges: `ONBOARDING READY` / `ASSIGNMENT READY` (`js/roles/clinician.js`).
- 🟡 **Notification preferences** are stored in `clinicians.preferences` (migration 5), but nothing is sent.
- 🟡 **Expiry re-checks.** `monitoring_state = MANUAL_RECHECK` and `source_checked_at` are stored (migration 7), but there is no scheduled re-check queue yet.
- 🟡 **Regression tests.** `backend/tests/db-test.js` (embedded Postgres), `store-test.js`, `p12.js` and the new `p13.js` are in the repo. The older browser suites p2–p11 lived only in `/tmp/pt` and were lost when the box's `/tmp` was cleared. p13 now covers the demo regression they had.

## Missing

- ❌ **Organization review workflow.** No reviewer queue, no accept/return per requirement, no "Ready for Submission" decision with a named reviewer, and no audit of the org's decision. `org_member` and the `org_role` enum exist (migration 1), but there's no review table or RPC.
- ❌ **Notifications.** No email/SMS for expiring credentials, verification results, share access or extension requests. No scheduled job (Supabase cron / Edge Function).
- ❌ **AI document extraction.** Nothing extracts fields from uploads. The registry already fixes its trust: `ai-extraction` is UNAPPROVED with no level, so it can only pre-fill a form for human review.
- ❌ **Pilot operations.** No org onboarding/invite flow beyond `create_organization`, no data-retention/consent screens, no BAA/HIPAA posture, no support/runbook, and no monitoring.
- ❌ **XRPL Permission Delegation + Batch.** Anchors use a per-verifier Testnet wallet in the browser session or the undeployed `anchor-verification` function. There's no delegated signing (XLS-75 Permission Delegation) and no Batch (XLS-56) of multiple anchors.
- ❌ **Public API** for organizations/ATS (read share assertions, webhooks).
- ❌ **Live database for PR 13.** Migration 7 and seed 03 are written and pass the embedded-Postgres tests, but they could not be applied to the live Supabase project from this environment (outbound Postgres ports 5432/6543 were blocked). See the PR description.

## Recommended next change

**PR 14 — Organization review + readiness ladder + levels in shares:**

1. Add a `requirement_reviews` table and an RPC (org_member with recruiter/admin role, AAL2) to accept or return each requirement with a reason. Show an org review queue.
2. Add the readiness ladder: Not Started → In Progress → Ready for Review (all requirements met at the required level) → Ready for Submission (org reviewer accepted).
3. Return `verification_level`, the source name and the check date from `get_share_assertions`, and show the "Why" grid to real org recipients.
4. Add a scheduled re-check list for `MANUAL_RECHECK` licenses within 30 days of expiry (this sets up notifications in PR 15).

Before that, once Postgres egress is available (or Munib runs it): apply migration 7 + seed 03 to live Supabase and run `backend/tests/p13.js --live`.
