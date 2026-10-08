# Veridun (NurseCredX demo): RN credential portability + assignment readiness

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

Pick a workspace on the entry screen (Clinician, Organization, or Verification Console). **Switch Role** in each workspace returns you to the picker. **Reset Demo Data** (Clinician → Home) restores the starting demo state.

## What is real, what is simulated

### Functional (works as described)
- Three-role entry screen and role switching (demo only, no auth)
- Clinician: Home (onboarding progress), Credential Requirements table, **Passport**, **Tasks**, **Opportunities** (readiness matching), **Share & Access**, Menu
- **RN credential catalog** (`js/credential-catalog.js`): credential kinds, all US states, DC and territories (codes like `US-MA`), the board of nursing for each, NLC compact status, and per-kind privacy policy. Everything below reads from it; nothing is hardcoded to one state.
- **Add Credential**: searchable dropdowns for credential type and jurisdiction. Classification, section and privacy are set automatically from the catalog (the old "required" and "off-chain" checkboxes are gone). The source document is always private. A new credential enters *Pending Verification* and appears in the Verification Console queue.
- **Assignment readiness** (Clinician → Opportunities; Organization → Dashboard / Assignments): each assignment is a requirement template plus a jurisdiction. The engine checks every requirement against verified credentials that stay current through the assignment end date, and shows only the missing items as work. XRPL proof is not required.
- **NLC compact privilege**: an RN authorization requirement is met by a single-state license in that state, or by a multistate license from an NLC home state when that state honors the compact. In the demo, Alex's Arizona multistate license covers Texas but not Massachusetts, where the NLC is enacted but not yet in effect.
- **Golden path**: Opportunities → Boston Travel ICU **11/12** → **COMPLETE MISSING REQUIREMENT** opens the form pre-filled with *RN License — single-state · Massachusetts (US-MA)* → Pending Verification → Verification Console simulated check → Boston **12/12 · ASSIGNMENT READY**.
- **Assignment-scoped Passport sharing** (`js/sharing.js`): **SHARE PROFESSIONAL PASSPORT** picks an organization and one of its assignments, pre-selects only the assertions that assignment needs (health and screening items go out as *Requirement Satisfied* with no results, dates or documents), and shows a review before the nurse approves. Source documents are never shared. A share is a **live grant**: each time it's viewed, it shows the current state of the Passport, not a snapshot.
- **Access durations**: One Time (single view), 24 Hours, 7 Days, 30 Days, Until Assignment Start, **Through Assignment End** (the recommended default, ending 11:59 PM local on the end date), Custom Date, and Until I Revoke Access. Every view is checked in one place (`accessShare`). Expired, used one-time, and revoked shares are refused, and a refused view is logged.
- **Share & Access** page (clinician): Active, Pending Requests, Expired, Revoked and Activity, with View Details, Modify Access, Extend and Revoke Access. Before revoking, the nurse sees a confirmation that access ends immediately and that information the organization already viewed or saved is not erased.
- **Organization access**: a "Viewing as" org selector, Passport Access status per candidate (*ACTIVE*, *EXPIRED*, *PASSPORT ACCESS REVOKED BY CLINICIAN* with timestamp), a Shared Passports tab, **Request Access Extension** (creates a pending request that the nurse approves or declines; an organization cannot extend its own access).
- **Event-derived analytics**: credential reuse, new credentials required, assignment-readiness time, verification time (real elapsed), manual touches, share activity (created, viewed with assertions accessed, scope changes, extension requests, extensions, revocations, expirations), and monitoring coverage. All are computed from the event log, not hardcoded.
- **Provenance** record per credential (source, method, verifier, timestamps, status) in the Details / proof dialog
- **XRPL proof (optional):** real `CredentialCreate` / `CredentialAccept` transactions on the **XRPL Devnet test network** using disposable, faucet-funded wallets, plus a live on-chain check when a Passport QR link is opened
- **QR codes** for the Passport, onboarding completion and assignment share links (an opaque random token; no PII or wallet addresses)
- **Append-only event log** (localStorage) feeding the Verification Console audit log and some metrics

### Simulated (looks real, isn't)
- **Primary-source verification.** "Run Simulated Primary-Source Check" marks a credential verified locally. No licensing board, Nursys, AHA or issuer is contacted. Provenance records the method as `Simulated primary-source check (DEMO)`.
- Credential classification (`SIMULATED_CLASSIFICATION`) and uploads: only the **file name** is kept; file contents are never read or uploaded.
- Verification durations are real elapsed times within the demo (seconds), not real-world turnaround.

### Demo data
- Alex Morgan (ICU RN, home state Arizona): 15 seed credentials pre-marked verified as `DEMO SEED (not a real verification)`, logged as a `DEMO_SEEDED` event. Expiration and assignment dates are offsets from the day the demo was seeded, so the demo never goes stale. Data saved by an older demo seed is replaced automatically.
- Three assignments: Boston Travel ICU (US-MA), Houston Rapid Response ICU (US-TX, NLC) and California Strike ICU (US-CA). Four requirement templates.
- Comparison candidates Jamie Smith and Taylor Reed are static rows, labeled STATIC DEMO.
- NLC status and board names are reference data as of 2026-10-08 (NCSBN NLC map, Nursys). They are not an authoritative licensure source.
- The landing-page dashboard preview is an illustrative static example.

### Not built yet (future)
- International jurisdictions
- Cross-device sharing. **Demo limitation:** shares and extension requests live in the clinician's browser (`localStorage`), so a share link only opens in the browser that created it, and the organization view is the same browser in a different role. Production needs a backend that serves shares and enforces access on the server.
- Older `?sharev7=` links are retired because they had no expiration or revocation. They now show a "no longer supported" notice.
- Real authentication, back end, primary-source integrations, continuous monitoring and notifications

## Privacy notes (demo)
- Credential metadata (names, types, expirations, file names, provenance) and the event log are stored unencrypted in `localStorage` (`nursecredx_v2`, `nursecredx_v81_events`, `veridun_shares`, `veridun_share_requests`, plus `veridun_demo_anchor` / `veridun_demo_seed_version`). Reset Demo clears shares and requests. on this site's origin.
- XRPL **Devnet** wallet seeds are stored in `sessionStorage` (`nursecredx_wallets_v2`). They are disposable test-network wallets and are not suitable for production.
- Private items (health, screening) are never sent to XRPL. Only minimal credential-type proofs are.
- Passport QR links carry a readable (unsigned) base64 summary, including Devnet wallet addresses.

## Project structure

```
index.html                 markup only; loads css/ and js/ with plain <script> tags
css/app.css                all styles
js/credential-model.js     shared state (creds), persistence, status/format helpers (load first)
js/credential-catalog.js   RN credential catalog: kinds, US jurisdictions, issuers, NLC, privacy
js/demo-data.js            demo profile, seed credentials, static candidates, seeding
js/requirements.js         requirement templates + newcomer onboarding baseline
js/assignments.js          assignment definitions (template + jurisdiction + dates)
js/readiness-engine.js     assignment readiness (NLC-aware, full assignment duration)
js/analytics.js            event log + event-derived metrics
js/verification.js         simulated verification + provenance/proof dialog
js/xrpl.js                 XRPL Devnet issue/accept/live check
js/sharing.js              Passport QR + assignment-scoped live shares (durations, enforcement, revoke, extension requests)
js/roles/clinician.js      clinician workspace views
js/roles/organization.js   organization workspace
js/roles/verifier.js       Verification Console
js/app.js                  role routing, event wiring, boot (load last)
archive/                   older single-file prototypes (see below)
```

The files are classic scripts that share the global scope, so load order matters (see `index.html`). Third-party libraries are pinned with Subresource Integrity: `xrpl@5.3.0` and `qrcode@1.5.1`.

## Archive

`archive/` holds the earlier single-file prototypes (`indexV3`–`indexV7`). They are kept for reference and are not maintained. Each shows an "ARCHIVED PROTOTYPE" banner and uses its own storage key, so it can't overwrite the live demo's data. See `archive/README.md`.
