# Veridun demo: RN credential portability + assignment readiness

**Live demo:** https://munibabid.github.io/cleartrack-mvp/ (fork) · upstream: https://couragewolf666.github.io/cleartrack-mvp/

Veridun (formerly NurseCredX, which grew out of ClearTrack) is a **portable, continuously verified credential passport for registered nurses** plus an **assignment-readiness engine**. The product answers one question:

> **Can this nurse start this assignment?**

It is aimed at travel, rapid-response, strike, per-diem/agency and local-contract RNs. APRN, NP, CRNA, physician and PA credentialing are out of scope.

> ⚠️ **This is a demo.** Verification is **simulated**, all data is demo data stored only in your browser, and the role picker is **not** real authentication. Nothing here is real primary-source verification.

## Run it

- **Online:** open the live demo link above.
- **Locally:** open `index.html` in a modern browser. No build step is needed.
  - Optionally serve the folder instead: `python3 -m http.server 8000`, then open http://localhost:8000.
  - An internet connection is needed for the two CDN libraries (XRPL and QR code).

**New here?** Click **▶ Start Demo Tour** on the entry screen (or Clinician → Home). It's optional and takes about 75 seconds: 11 steps through the Boston golden path on fresh demo data. Use **Next ▸** or **Auto-play** (7 s per step), and **✕** to exit at any time. The tour resets demo data first, and asks before doing so.

Pick a workspace on the entry screen (Clinician, Organization, or Verification Console). **Switch Role** in each workspace returns you to the picker. **Reset Demo Data** (Clinician → Home) restores the starting demo state.

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

### Simulated (looks real, isn't)
- **Monitoring, revocation and manual review** are simulated local actions. No issuer is polled.
- **Primary-source verification.** "Run Simulated Primary-Source Check" marks a credential verified locally. No licensing board, Nursys, AHA or issuer is contacted. Provenance records the method as `Simulated primary-source check (DEMO)`.
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
- Cross-device sharing. **Demo limitation:** shares and extension requests live in the clinician's browser (`localStorage`), so a share link only opens in the browser that created it, and the organization view is the same browser in a different role. Production needs a backend that serves shares and enforces access on the server.
- Older `?sharev7=` links are retired because they had no expiration or revocation. They now show a "no longer supported" notice.
- Real authentication, back end, primary-source integrations, continuous monitoring and notifications
- A profile editor (specialty is set per demo nurse) and editing the work-type base sets and specialty modules in the UI. The Assignment Builder composes the existing layers.

## Acceptance checklist (handoff §52)

Each item is checked by the headless-Chrome suite `p6` (desktop 1280px + 390px; IDs `AC1`–`AC26`), with p2–p5 as regressions. ✅ = passing on the live site.

> Note: in our copy of the handoff, the text of §52 items 1–6 was cut off. Items 1–6 below are inferred from §53–54 and the "immediate focus" list.

| # | Criterion | Status | Where |
|---|---|---|---|
| 1 | RN-only scope (no APRN/NP/CRNA/physician/PA) | ✅ | Copy, catalog, README |
| 2 | Three-role entry (Clinician / Organization / Verification Console), demo-only note | ✅ | Entry screen, Switch Role |
| 3 | RN credential catalog with all 56 US jurisdictions, boards, NLC status | ✅ | `js/credential-catalog.js` |
| 4 | Searchable dropdowns for credential type and jurisdiction | ✅ | Add Credential |
| 5 | Privacy set automatically; manual required/private checkboxes removed | ✅ | Add Credential |
| 6 | System decides what stays off-chain (private kinds never XRPL-eligible) | ✅ | `catalogPrivacy`, `eligible` |
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

## Privacy notes (demo)
- Credential metadata (names, types, expirations, file names, provenance) and the event log are stored unencrypted in `localStorage` (`nursecredx_v2`, `nursecredx_v81_events`, `veridun_shares`, `veridun_share_requests`, `veridun_custom_assignments`, plus `veridun_demo_anchor` / `veridun_demo_seed_version`). Reset Demo clears shares, requests and published assignments. Storage keys keep their old `nursecredx_*` names so existing demo data still loads. All of it stays on this site's origin.
- XRPL **Devnet** wallet seeds are stored in `sessionStorage` (`nursecredx_wallets_v2`). They are disposable test-network wallets and are not suitable for production.
- Private items (health, screening) are never sent to XRPL. Only minimal credential-type proofs are.
- Passport QR links carry a readable (unsigned) base64 summary, including Devnet wallet addresses.

## Project structure

```
index.html                 markup only; loads css/ and js/ with plain <script> tags
css/app.css                all styles
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
archive/                   older single-file prototypes (see below)
```

The files are classic scripts that share the global scope, so load order matters (see `index.html`). Third-party libraries are pinned with Subresource Integrity: `xrpl@5.3.0` and `qrcode@1.5.1`.

## Archive

`archive/` holds the earlier single-file prototypes (`indexV3`–`indexV7`). They are kept for reference and are not maintained. Each shows an "ARCHIVED PROTOTYPE" banner and uses its own storage key, so it can't overwrite the live demo's data. See `archive/README.md`.
