# Veridun demo: RN credential portability + assignment readiness

**Live demo:** https://munibabid.github.io/cleartrack-mvp/ (fork) · upstream: https://couragewolf666.github.io/cleartrack-mvp/

Veridun (formerly NurseCredX, which grew out of ClearTrack) is a **portable, continuously verified credential passport for registered nurses** plus an **assignment-readiness engine**. The product answers one question:

> **Can this nurse start this assignment?**

It is aimed at travel, rapid-response, strike, per-diem/agency and local-contract RNs. APRN, NP, CRNA, physician and PA credentialing are out of scope.

> ⚠️ **This is a demo plus a staging account backend.** In the demo, verification is **simulated**, all data is demo data stored only in your browser, and the role picker is **not** real authentication. **Your account** (email sign-in, since PR 10) stores your own data in a **pre-compliance Supabase staging project**: don't put real PHI or real health records in it yet. Demo verification is simulated. In accounts, a verifier with 2FA records a real **manual** lookup on the board, Nursys QuickConfirm or the issuer's page. Nothing is automated yet.

## Run it

- **Online:** open the live demo link above.
- **Locally:** open `index.html` in a modern browser. No build step is needed.
  - Optionally serve the folder instead: `python3 -m http.server 8000`, then open http://localhost:8000.
  - An internet connection is needed for the two CDN libraries (XRPL and QR code).

**New here?** Click **▶ Start Demo Tour** on the entry screen (or Clinician → Home). It's optional and takes about 75 seconds: 11 steps through the Boston golden path on fresh demo data. Use **Next ▸** or **Auto-play** (7 s per step), and **✕** to exit at any time. The tour resets demo data first, and asks before doing so.

Pick a workspace on the entry screen (Clinician, Organization, or Verification Console). **Switch Role** in each workspace returns you to the picker. **Reset Demo Data** (Clinician → Home) restores the starting demo state.

## Your account (staging, PR 10)

The entry screen has a **Your account · staging** card under the three demo workspaces.

- **Sign in** with your email: Veridun emails a one-time sign-in link (Supabase Auth magic link). Open it on the device you requested it from. There's no password. Request a link on each device you use (phone, laptop).
- **My Passport**: set up your clinician profile (name, credentials after your name, specialty, home state), then add credentials from the same RN catalog the demo uses. Optionally attach a source document (PDF/PNG/JPEG/DOC/DOCX, 10 MB max). It goes to a **private** storage bucket and opens only through a 60-second signed link. Everything you add starts as **Submitted · not verified**. No verifier or issuer is connected in staging, so nothing in an account is ever shown as verified unless a real Veridun verifier marks it server-side (the browser can't).
- **Shares**: share chosen items with an organization for an assignment or purpose, with the same eight access lengths as the demo. You get a link and a code **once** (Veridun stores only a SHA-256 fingerprint). The share is live: the organization sees the current status, only while it's active. You see views and refused attempts, approve or decline extension requests, extend, or revoke. **Revoking is final** and takes effect on every device at once.
- **Organization**: any signed-in user can create an organization (staging limit: 3) and becomes its owner. Members open a share by link or code, see only the items that clinician shared (private health/screening/reference items show only *Requirement satisfied*), and can **request** more time. They can't extend their own access, see documents, or read the credentials table.
- **Activity**: an append-only log stored with your account. Organization views are recorded by the database itself.
- **Sync**: data entered on one device shows up on another after sign-in (use **Refresh** on a device that's already open). Account data is held in memory on the device and in the database, **never in localStorage**. Only Supabase's sign-in session token is kept in the browser. Signing out clears it.
- **Demo vs account**: the demo (Alex Morgan, the Boston tour, simulated verification) is unchanged and never leaves the browser, signed in or not. Account screens are labeled **YOUR ACCOUNT · STAGING**. Demo screens keep their DEMO labels.
- **Not for real PHI yet.** Supabase supports HIPAA only on a paid plan with a signed BAA. Until then, use test data. Details are in [docs/BACKEND.md](docs/BACKEND.md).

## What is real, what is simulated

### Functional (works as described)
- Three-role entry screen and role switching (demo only, no auth)
- Clinician: Home, Credential Requirements table, **Passport**, **Tasks**, **Opportunities** (readiness matching), **Share & Access**, Menu
- **Clinician dashboard** (handoff §37): **Portable Readiness** (how many opportunities that accept your specialty you could submit to today, reusable verified credentials, and the number of US jurisdictions you're authorized to practice in, counting single-state licenses plus NLC privilege), **Current Assignments** (readiness and Passport access for each), and **Needs Attention** (blocking items, expirations, items awaiting verification, revoked or rejected credentials) with one-tap actions.
- **Passport view** (§38), grouped as Licenses & Practice Authorization, Certifications, Clinical Qualifications, Employment Experience, Education, Health & Screening (private; organizations see only *Requirement Satisfied*) and Additional Professional Qualifications. A summary row shows the verified/current, jurisdiction, expiring and private counts.
- **Task Center** (§39), in priority order: **Required Before Submission** (blocking an opportunity that accepts your specialty), **Expiring Within 30 Days**, **Renewal Recommended** (31–90 days), **Awaiting Verification**, **Missing** (onboarding-baseline gaps, plus revoked, rejected or expired credentials), and **Complete** (collapsed). **Renew** opens a pre-filled form. Once the renewed credential is verified, it replaces the old record, re-points any live shares to it, and logs `CREDENTIAL_RENEWED`.
- **RN credential catalog** (`js/credential-catalog.js`): credential kinds, all US states, DC and territories (codes like `US-MA`), the board of nursing for each, NLC compact status, and per-kind privacy policy. Everything below reads from it; nothing is hardcoded to one state.
- **Add Credential**: searchable dropdowns for credential type and jurisdiction. Classification, section and privacy are set automatically from the catalog (the old "required" and "off-chain" checkboxes are gone). The source document is always private. A new credential enters *Pending Verification* and appears in the Verification Console queue.
- **Layered requirement sets** (`js/requirements.js`): a nurse's requirements for an opportunity are built in layers, the way staffing agencies build them:
  1. **State**: RN authorization where the nurse will practice. The authority is that state's board of nursing.
  2. **Work type**: a base set for Travel RN, Strike RN, Rapid Response RN or Per-Diem RN.
  3. **Specialty**: a module for the **nurse's own profile specialty** (ICU, ED, L&D or Med-Surg). It applies only if the opportunity accepts that specialty.
  4. **Facility**: assignment or facility overrides that **add** or **waive** items.
  5. **Dates**: every item has to stay current through the assignment end date.
  Each requirement shows its layer and the authority that requires it ("Required by: …"). All templates are illustrative **demo templates**. They are not any real agency's or facility's requirements.
- **Opportunities** = work type + state + dates + facility, plus the specialties accepted. The engine checks each requirement against verified credentials that stay current through the assignment end, and against experience recency (employer-verified specialty experience within 24 months of the start date). Only missing items show up as work. XRPL proof is not required.
- **Demo nurses by specialty**: Opportunities has a "Viewing opportunities as" selector. **Alex Morgan (ICU)** is the live, editable Passport. **Jordan Rivera (ED)** and **Sam Okafor (L&D)** are read-only demo nurses, evaluated by the same engine. The same **Oakland Strike RN** opportunity asks each of them for a different specialty module: ICU gets ACLS, ICU experience, ICU skills checklist and specialty reference; ED gets ACLS, PALS, TNCC, ED experience, ED skills checklist and reference; L&D gets NRP, fetal monitoring, L&D experience, L&D skills checklist and reference. Opportunities that don't accept the nurse's specialty are listed as not shown.
- **Clinical Qualifications** for experienced RNs: specialty skills checklists (completed and attested), competencies (CRRT, ventilator management), employer-verified specialty experience (for example "ICU Experience — 3 yrs, Employer Verified", with a last-worked date), and a specialty reference evaluation (private, so it's shared only as *Requirement Satisfied*). School clinical hours are not seeded or required. *Clinical education verification* is only an optional catalog item under Education.
- **Organization → Requirement Sets** explains the layers and lists the work-type base sets, specialty modules and facility overrides. It also has an **Assignment Builder**: work type, state (all 56 US jurisdictions), dates, facility, accepted specialties, and add/waive overrides. A live preview shows the merged requirements per specialty with authority, plus each demo nurse's readiness. **Publish demo assignment** saves the assignment in this browser. It then appears in Organization → Assignments and in clinician Opportunities, and logs `ASSIGNMENT_PUBLISHED`.
- **Organization dashboard** (§40): Ready to Submit, Missing One Requirement, Awaiting Verification, Expiring ≤90 Days, Passport Access Active, Median Verification and Credential Reuse. These are computed live for the selected organization across its opportunities × Alex (live) and the demo nurses. Static comparison rows are excluded. Below them are **Needs Attention** (nurse × opportunity pairs one item away, plus expirations) and **Recent Passport & Assignment Activity** from the event log.
- **Verification Console** (§41): metrics for Pending, Verified, Awaiting Manual Review, Mismatch Alerts, Failed / Rejected, Revocations, Median Time and Monitoring coverage. It has tabs for Verification Queue, **Mismatch Alerts**, **Manual Review**, **Monitoring**, **Revocations**, **Audit Logs** (with filters) and Analytics.
  - Mismatch alerts are **rule-derived**: multistate license not from the NLC home state, verified but expired, expired at submission, unclassified type, duplicate record. Flagged items go to Manual Review (approve, or reject with a reason that's logged) instead of a one-click check.
  - Monitoring has **Run Monitoring Check (simulated)**, which marks expired credentials. **Simulate revocation** is clearly labeled as a demo action and asks for confirmation. A revoked credential immediately stops meeting requirements, so Oakland drops from 10/10 to 9/10, and it can be **reinstated**.
- **Organization → Assignments** shows every opportunity with per-nurse readiness. Each nurse is evaluated with their own specialty module, or marked "specialty not accepted".
- **Verification first** (handoff §50): Passport and Home rows show verification status as the primary badge (*VERIFIED · DEMO*, *PENDING VERIFICATION*). The optional XRPL proof appears only as a quiet secondary label (*Proof: optional*, *Proof: on XRPL Devnet ✓*).
- **NLC compact privilege**: an RN authorization requirement is met by a single-state license in that state, or by a multistate license from an NLC home state when that state honors the compact. In the demo, Alex's Arizona multistate license covers Texas but not Massachusetts, where the NLC is enacted but not yet in effect.
- **Golden path**: Opportunities → Boston Travel ICU **11/12** (Travel RN base 7 + ICU module 4 + Massachusetts license) → **COMPLETE MISSING REQUIREMENT** opens the form pre-filled with *RN License — single-state · Massachusetts (US-MA)* → Pending Verification → Verification Console simulated check → Boston **12/12 · ASSIGNMENT READY**.
- **Assignment-scoped Passport sharing** (`js/sharing.js`): **SHARE PROFESSIONAL PASSPORT** picks an organization and one of its assignments, pre-selects only the assertions that assignment needs (health and screening items go out as *Requirement Satisfied* with no results, dates or documents), and shows a review before the nurse approves. Source documents are never shared. A share is a **live grant**: each time it's viewed, it shows the current state of the Passport, not a snapshot.
- **Access durations**: One Time (single view), 24 Hours, 7 Days, 30 Days, Until Assignment Start, **Through Assignment End** (the recommended default, ending 11:59 PM local on the end date), Custom Date, and Until I Revoke Access. Every view is checked in one place (`accessShare`). Expired, used one-time, and revoked shares are refused, and a refused view is logged.
- **Share & Access** page (clinician): Active, Pending Requests, Expired, Revoked and Activity, with View Details, Modify Access, Extend and Revoke Access. Before revoking, the nurse sees a confirmation that access ends immediately and that information the organization already viewed or saved is not erased.
- **Organization access**: a "Viewing as" org selector, Passport Access status per candidate (*ACTIVE*, *EXPIRED*, *PASSPORT ACCESS REVOKED BY CLINICIAN* with timestamp), a Shared Passports tab, **Request Access Extension** (creates a pending request that the nurse approves or declines; an organization cannot extend its own access).
- **Event-derived analytics**: credential reuse, new credentials required, assignment-readiness time, verification time (real elapsed), manual touches, share activity (created, viewed with assertions accessed, scope changes, extension requests, extensions, revocations, expirations), and monitoring coverage. All are computed from the event log, not hardcoded.
- **Provenance** record per credential (source, method, verifier, timestamps, status) in the Details / proof dialog
- **XRPL proof (optional):** real `CredentialCreate` / `CredentialAccept` transactions on the **XRPL Devnet test network** using disposable, faucet-funded wallets, plus a live on-chain check when a Passport QR link is opened
- **QR codes** for the Passport, onboarding completion and assignment share links (an opaque random token; no PII or wallet addresses)
- **Mobile (390px)**: bottom navigation in the Clinician workspace. The Credential Requirements table becomes cards. Workspace tabs scroll horizontally, and the active tab stays in view. Dialog controls fit the screen. No view scrolls sideways.
- **Demo tour** (`js/tour.js`): optional guided walkthrough of the golden path (about 75 seconds), with a highlighted target for each step. It logs `DEMO_TOUR_STARTED` / `DEMO_TOUR_COMPLETED`.
- **Append-only event log** (localStorage) feeding the Verification Console audit log, the dashboards' activity feeds and every metric

### On-device document reading (PR 14)

**v14.2: the eCard code is never the Training Center ID, and confidence means something.** The fix came from Munib's RQI BLS card: the scanner showed `CA0…xx`, the AHA **Training Center ID**, as the eCard code, and clear dates scored only 78%.
- **eCard code:** read only from its own label ("eCard Code", "RQI code", "Certificate ID"), with the value taken from the same cell, the next cell, or the cell under the label in a header row. A value shaped like a TC ID (2 letters + 5 digits) or printed as the Training Center ID / Instructor ID is never used. Standard AHA codes are 12 digits (issue year + course + 7 digits, verified at heart.org/cpr/mycards); codes with letters are RQI codes (heart.org/RQIverify) and are kept exactly as printed. If no code is found the field stays empty with "eCard code not found. Type it from your card; it's needed for AHA verification."
- **Training Center ID** is read as its own field, shown to the nurse and the verifier as "who ran the class, not used for verification". It is not saved or logged. The verifier's assisted AHA lookup (reference + Copy) uses the eCard code only.
- **Confidence:** each field's score now comes from Tesseract's per-word confidence for the words it was read from, plus a label bonus, instead of a page-wide cap plus a date penalty. Formula and before/after numbers: [docs/EXTRACTION-BENCHMARK.md](docs/EXTRACTION-BENCHMARK.md). Tests: `backend/tests/p142.js` and a TC-ID card in `xbrowser.js`.

**v14.1: works in every browser.** The fix came from an iPhone report: on Safari, "Re-scan document" and the verifier's "Read the document on this device" both failed with `undefined is not a function (near '...t of e...')`.
- **Cause:** pdf.js reads PDF text with `for await` over a `ReadableStream`, which older Safari and iOS can't do.
- **Fix:**
  - Veridun now uses the pdf.js *legacy* build.
  - It reads the text stream with an explicit `getReader()` loop.
  - It polyfills `ReadableStream` async iteration, `Promise.withResolvers` and `Blob.arrayBuffer`.
  - It checks for canvas, workers and WebAssembly before reading. If something is missing, or the reader fails, the user sees a plain message and can type the details instead. Raw JS errors are never shown.
- **Verifier form:** once the document has been read, the expiration field uses the document's date, and the form shows both the document date and the date the nurse typed.
- **Test:** `backend/tests/xbrowser.js` (Playwright) runs on every PR via `.github/workflows/browser-tests.yml`.
  - Engines: Chromium, WebKit and Firefox, each at phone and desktop size.
  - Each run happens twice: once as the engine ships, and once with the newer APIs removed, which reproduces the Safari error.

- **Scan on upload, re-scan later:** PDF and image credentials are read **in the browser**: pdf.js text first, then vendored Tesseract.js OCR (scans, photos, rotated images), then QR decoding (BarcodeDetector or jsQR). The readers are lazy-loaded only when a scan starts. No document goes to an outside AI service.
- **Every catalog kind is data-driven** (`DocExtract.profileFor`): AHA BLS/ACLS/PALS cards (name, eCard code, course, issue date, renew-by month, training center), RN licenses (number, state, multistate, dates), other certifications such as NIHSS, NRP, TNCC, ENPC, AWHONN, CCRN, CEN and C-EFM (name, ID, which credential, dates), records (name, dates), and private/skills kinds (**dates only**).
- **Confirm, never verify:** every field shows a confidence and is confirmed or corrected by the nurse. The result is *Details captured, awaiting verification*. **Extracted values stay on the device.** The server keeps only which fields were confirmed or corrected, plus mismatch flags. The verifier reads the document again on their own device.
- **Mismatch checks** for every kind: document date vs entered expiration (a month/year renewal date means the end of that month, and the UI says so), name vs profile, credential on the document vs selected type, and license state and multistate. A mismatch shows **Credential mismatch detected**, offers **Use the date from the document**, and flags the credential first in the verifier queue.
- **Issuer routing:** 115 registry sources. Each certification routes to its issuing body (AHA eCards / RQI / Red Cross, APEX and NIHSS+, AAP NRP, ENA, AWHONN, AACN, BCEN, NCC, ANCC, …). Nursys and boards apply only to licenses. `p14.js` walks all 217 catalog kinds to check this.
- **AHA is assisted, not automatic.** AHA's Terms of Service (§2 and §6.1) forbid exploiting the site or making its services available to others without written authorization, and there is no public API. The verifier gets a copy button, the AHA eCards Employer page, and the RQI route for codes with letters (heart.org/RQIverify), then records what AHA shows. Automating it needs an AHA partner agreement or a vendor such as EverCheck.
- **Extraction accuracy:** a Verification Console tab shows the benchmark on synthetic documents (`docs/EXTRACTION-BENCHMARK.md`). The verifier account shows live per-field and per-kind accuracy, the auto-ready rate, and the verifier-matched rate from `extraction_events` (migration 9; it falls back to the audit log).

### Verification levels and sources (PR 13)
- **Verification Source Registry** (`js/verification-registry.js`, verifier tab **Verification Sources**): 70 sources. That's all 56 boards of nursing, **Nursys QuickConfirm** (approved, manual, primary-source equivalent; every jurisdiction except Puerto Rico), **Nursys e-Notify** (*pending*: needs an institution account and NCSBN API credentials, see `docs/NURSYS-ENOTIFY.md`), the issuers (AHA eCards, AHA RQI, Red Cross certificate and Health & Safety Training lookups, AACN, BCEN, NCC; free web lookups only, no public API), employer, screening vendor, document review, self-attestation, and AI extraction (unapproved, no level).
- **Seven verification levels:** Continuously Monitored › Primary Source Verified › Issuer Verified › Employer Verified / Vendor Verified › Document Reviewed › Self-Attested. Uploads, self-attestation and AI extraction can **never** count as primary source.
- **Minimum level per requirement:** RN licenses need Primary Source Verified, certifications need Issuer Verified (both locked floors), experience, references and competencies need Employer, screening needs Vendor. A facility can raise a minimum but can't go below a locked floor. The Phoenix demo assignment tries to accept a Document Reviewed BLS, and the floor is kept and explained. A verified credential below the minimum shows **Below required level**.
- **Policy "Why?"** on every readiness item (Organization view and account readiness): decision, why, required by, policy id + version, effective date, required verification, level rule, validity rule and assignment policy (e.g. `BHMC-ICU-2026.4`, a demo policy).
- **Provenance** for every credential: level, source, method, verified by, checked, status at source, evidence reference, policy and XRPL anchor, with a plain-words explanation of what provenance means.
- **Licenses follow the assignment:** the Passport needs an RN license. A state license that a pursued assignment needs and that your home/compact license doesn't cover is marked **Required** (e.g. Massachusetts for Boston).
- **Accounts: manual primary-source check.** A verifier at AAL2 picks the approved source for the credential (the board for that state, or Nursys QuickConfirm), opens its lookup, and records the result, status at source, expiration, reference and monitoring state. The **database** sets the level (`record_source_check`), and the credential then shows *PRIMARY SOURCE VERIFIED · Source · Checked*. Nobody can set a level from the browser.

### Simulated (looks real, isn't)
- **Monitoring, revocation and manual review** are simulated local actions. No issuer is polled.
- **Primary-source verification in the demo.** "Run Simulated Primary-Source Check" uses the registry's route and level, but no board, Nursys, AHA or issuer is contacted. Provenance says `simulated lookup (DEMO)` and the reference is `DEMO-…`. In accounts, a verifier records a real manual lookup (PR 12/13). Nothing is automated: Nursys e-Notify is not connected.
- Credential classification (`SIMULATED_CLASSIFICATION`) and uploads: only the **file name** is kept; file contents are never read or uploaded.
- Verification durations are real elapsed times within the demo (seconds), not real-world turnaround.

### Demo data
- Alex Morgan (ICU RN, home state Arizona): 19 seed credentials (seed version 4, which includes a TNCC expiring in 21 days and an NIHSS expiring in 75 days so the expiry sections have content) pre-marked verified as `DEMO SEED (not a real verification)`, logged as a `DEMO_SEEDED` event. Expiration and assignment dates are offsets from the day the demo was seeded, so the demo never goes stale. Data saved by an older demo seed is replaced automatically.
- Five opportunities across four fictional agencies (Northstar, Lone Star, Pacific Strike, Summit Per Diem) and fictional demo facilities: Boston Travel ICU (US-MA, ICU), Houston Rapid Response ICU (US-TX, NLC, ICU; facility adds a ventilator competency), Oakland Strike RN (US-CA; accepts ICU, ED and L&D), Phoenix Travel ED (US-AZ; facility waives the physical) and Denver Per-Diem L&D (US-CO; facility adds Hepatitis B).
- Demo nurses Jordan Rivera (ED, Colorado multistate + California) and Sam Okafor (L&D, California only) have static, read-only credentials.
- Comparison candidates Jamie Smith and Taylor Reed are static rows, labeled STATIC DEMO.
- NLC status and board names are reference data as of 2026-10-08 (NCSBN NLC map, Nursys). They are not an authoritative licensure source.
- The landing-page dashboard preview is an illustrative static example.

### Not built yet (future)
- International jurisdictions
- Cross-device sharing **in the demo**: demo shares live in the clinician's browser (`localStorage`), so a demo share link only opens in the browser that created it. **Account shares (PR 10) work across devices**: see *Your account* above.
- Older `?sharev7=` links are retired because they had no expiration or revocation. They now show a "no longer supported" notice.
- Automated primary-source integrations (Nursys e-Notify is a stub until credentials exist), continuous monitoring, organization review and the Ready for Submission ladder (next PR), notifications (email for extension requests and expirations), and moving the demo's readiness/opportunity views onto account data. Real sign-in and the staging back end shipped in PR 10.
- A profile editor (specialty is set per demo nurse) and editing the work-type base sets and specialty modules in the UI. The Assignment Builder composes the existing layers.

## Acceptance checklist (handoff §52)

Each item is checked by the headless-Chrome suite `p6` (desktop 1280px + 390px; IDs `AC1`–`AC26`), with p2–p5 as regressions. ✅ = passing on the live site.

| # | Criterion | Status | Where |
|---|---|---|---|
| 1 | Three-role entry works (Clinician / Organization / Verification Console), demo-only note | ✅ | Entry screen |
| 2 | Each role can switch back | ✅ | Switch Role in every workspace |
| 3 | Add Credential uses structured searchable selections (category, credential, jurisdiction, issuer) | ✅ | Add Credential |
| 4 | Nurse never types machine-readable credential IDs (custom credentials get an auto-generated `CUSTOM_*` type) | ✅ | Add Credential |
| 5 | Nurse no longer checks "Required for onboarding" (requirements come from the assignment) | ✅ | Add Credential, requirement sets |
| 6 | Nurse no longer decides what is off-chain (catalog decides; private kinds never XRPL-eligible) | ✅ | `catalogPrivacy`, `eligible` |
| 7 | Source documents private by default (file name only, never shared) | ✅ | Add Credential, shares (`documentsShared:false`) |
| 8 | Catalog sets privacy and verification policy | ✅ | Add Credential classification panel |
| 9 | Organizations use the same taxonomy | ✅ | Requirement sets / assignments use catalog kinds |
| 10 | MA RN License added structurally (catalog kind + US-MA) | ✅ | Complete Missing Requirement |
| 11 | New credential enters Pending Verification and the queue | ✅ | Task Center, Verification Console |
| 12 | Clearly simulated source check (method/source say DEMO, real elapsed time) | ✅ | Verification Console, provenance |
| 13 | Boston 11/12 → 12/12 computed by the engine | ✅ | Opportunities, Organization |
| 14 | XRPL proof not required for readiness | ✅ | Readiness engine, onboarding |
| 15 | Share only assignment-relevant assertions | ✅ | Share Professional Passport |
| 16 | Through Assignment End (default, 11:59 PM local on end date) | ✅ | Share durations |
| 17 | Until I Revoke Access | ✅ | Share durations |
| 18 | Nurse can revoke (immediate; confirmation copy) | ✅ | Share & Access |
| 19 | Organization sees revoked status with timestamp | ✅ | Org Passport Access / Candidates |
| 20 | Organization can request an extension (cannot self-extend) | ✅ | Org Shared Passports |
| 21 | Nurse approves or declines the extension | ✅ | Share & Access → Pending Requests |
| 22 | Share views logged with assertions accessed | ✅ | Event log, Activity |
| 23 | Analytics derived from events (no hardcoded metrics) | ✅ | `js/analytics.js`, `js/insights.js` |
| 24 | Demo/simulated results labeled | ✅ | DEMO / SIMULATED / STATIC DEMO tags, landing "Illustrative example" |
| 25 | Existing features still work (Passport QR, provenance, optional XRPL proof, sharing) | ✅ | p2–p5 regressions |
| 26 | Mobile usability (390px: no sideways scroll, card layouts, tap targets ≥28px, nav only in clinician) | ✅ | All workspaces |

## Backend (Supabase staging, connected in PR 10)

`backend/` contains the Postgres/Supabase schema with row-level security, the share-access functions, a private source-document bucket, and seeds generated from the app's own data. Migrations 1–4 and the reference seed are applied to Munib's staging project. The demo seed is not.

The app reads and writes through `js/store.js`:
- `LocalStorageAdapter`: the demo, always browser-only.
- `SupabaseAdapter`: your account. It uses only the publishable key plus your sign-in token, and RLS enforces access on every table.

`supabase-js` 2.117.2 is vendored in `js/vendor/`, pinned with SRI. It's loaded only when you sign in or a saved session exists, so the signed-out demo sends nothing to Supabase. See [docs/BACKEND.md](docs/BACKEND.md) for the architecture, security model, tests, and what's left before real PHI.

## Privacy notes
- Credential metadata (names, types, expirations, file names, provenance) and the event log are stored unencrypted in `localStorage` (`nursecredx_v2`, `nursecredx_v81_events`, `veridun_shares`, `veridun_share_requests`, `veridun_custom_assignments`, plus `veridun_demo_anchor` / `veridun_demo_seed_version`). Reset Demo clears shares, requests and published assignments. Storage keys keep their old `nursecredx_*` names so existing demo data still loads. All of it stays on this site's origin.
- **Account data (PR 10)** is never written to `localStorage`. It lives in memory and in the Supabase staging database. Source documents go straight to the private `source-documents` bucket under `<your user id>/…`. The only account item in browser storage is Supabase's session token (`sb-kiwbasfbiarscalzhopy-auth-token`). One more key, `veridun_pending_share_token`, holds a share token for the moment while you sign in from a share link, and is cleared right after.
- XRPL **Devnet** wallet seeds are stored in `sessionStorage` (`nursecredx_wallets_v2`). They are disposable test-network wallets and are not suitable for production.
- Private items (health, screening) are never sent to XRPL. Only minimal credential-type proofs are.
- Passport QR links carry a readable (unsigned) base64 summary, including Devnet wallet addresses.

## Project structure

```
index.html                 markup only; loads css/ and js/ with plain <script> tags
css/app.css                all styles
js/config.js               config: demo stays browser-only; accounts = Supabase staging URL + publishable key (public by design)
js/store.js                data-access layer: LocalStorageAdapter (demo) + SupabaseAdapter (your account: auth, sync, shares, storage)
js/credential-model.js     shared state (creds), persistence, status/format helpers (load first)
js/credential-catalog.js   RN credential catalog: kinds, US jurisdictions, issuers, NLC, privacy
js/demo-data.js            demo profile, seed credentials, demo nurses (ED, L&D), static candidates, seeding
js/requirements.js         layered requirement sets: work-type bases, specialty modules, layer merge + onboarding baseline
js/assignments.js          organizations + opportunities (work type + state + dates + facility + accepted specialties), builder storage
js/readiness-engine.js     assignment readiness (NLC-aware, full assignment duration)
js/analytics.js            event log + event-derived metrics
js/insights.js             dashboard/task/alert derivations: task sections, mismatch rules, practice authorization, attention lists
js/verification.js         simulated verification + provenance/proof dialog
js/xrpl.js                 XRPL Devnet issue/accept/live check
js/sharing.js              Passport QR + assignment-scoped live shares (durations, enforcement, revoke, extension requests)
js/roles/clinician.js      clinician workspace views
js/roles/organization.js   organization workspace
js/roles/verifier.js       Verification Console
js/app.js                  role routing, event wiring, boot
js/tour.js                 optional golden-demo guided tour (loads after app.js)
js/account.js              Your account (PR 10): sign-in card, My Passport, Shares, Organization, Activity, ?share= links for account shares
js/vendor/                 supabase-js 2.117.2 UMD build (MIT), pinned + SRI, loaded lazily
archive/                   older single-file prototypes (see below)
backend/                   Supabase: SQL migrations 1–4 + RLS, generated seeds, DB/RLS + store tests (applied to the staging project)
docs/BACKEND.md            backend architecture, entity diagram, security model, go-live checklist
```

The files are classic scripts that share the global scope, so load order matters (see `index.html`). Third-party libraries are pinned with Subresource Integrity: `xrpl@5.3.0`, `qrcode@1.5.1`, and the vendored `@supabase/supabase-js@2.117.2`.

## Archive

`archive/` holds the earlier single-file prototypes (`indexV3`–`indexV7`). They are kept for reference and are not maintained. Each shows an "ARCHIVED PROTOTYPE" banner and uses its own storage key, so it can't overwrite the live demo's data. See `archive/README.md`.
