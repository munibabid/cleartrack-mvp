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
- Clinician: Home (onboarding progress), Credential Requirements table, **Passport**, **Tasks**, **Opportunities** (readiness matching), Menu
- **Add Credential**: structured credential type + RN license jurisdiction; enters *Verifying* and appears in the Verification Console queue
- **Assignment readiness** (Organization → Assignments): compares verified credentials against each assignment's requirements, including whether credentials stay current through the assignment end date. XRPL proof is not required.
- **Provenance** record per credential (source, method, verifier, timestamps, status) in the Details / proof dialog
- **XRPL proof (optional):** real `CredentialCreate` / `CredentialAccept` transactions on the **XRPL Devnet test network** using disposable, faucet-funded wallets, plus a live on-chain check when a Passport QR link is opened
- **QR codes** for the Passport, onboarding completion and selective share links
- **Append-only event log** (localStorage) feeding the Verification Console audit log and some metrics

### Simulated (looks real, isn't)
- **Primary-source verification.** "Run Simulated Primary-Source Check" marks a credential verified locally. No licensing board, Nursys, AHA or issuer is contacted. Provenance records the method as `Simulated primary-source check (DEMO)`.
- Credential classification (`SIMULATED_CLASSIFICATION`) and uploads: only the **file name** is kept; file contents are never read or uploaded.
- Verification duration is a fixed demo value (2m 14s).

### Demo data
- Alex Morgan's seed credentials; 11 are pre-marked verified as `DEMO SEED (not a real verification)`, logged as a `DEMO_SEEDED` event.
- Boston Travel ICU and California Strike ICU assignments, the candidates Jamie Smith and Taylor Reed, requirement templates, and the "92% credential reuse" and "100% monitoring" figures are static placeholders.
- The landing-page dashboard preview is an illustrative static example.

### Not built yet (future)
- RN credential catalog with searchable dropdowns and automatic privacy rules (data-driven, US state-level jurisdictions plus the NLC compact privilege)
- Assignment-scoped selective sharing with access lasting "through assignment end" or "until revoked", clinician revocation, and organization extension requests that the nurse approves
- Share-view logging and fully event-derived analytics
- Real authentication, back end, primary-source integrations, continuous monitoring and notifications

## Privacy notes (demo)
- Credential metadata (names, types, expirations, file names, provenance) and the event log are stored unencrypted in `localStorage` (`nursecredx_v2`, `nursecredx_v81_events`) on this site's origin.
- XRPL **Devnet** wallet seeds are stored in `sessionStorage` (`nursecredx_wallets_v2`). They are disposable test-network wallets and are not suitable for production.
- Private items (health, screening) are never sent to XRPL. Only minimal credential-type proofs are.
- Passport QR links carry a readable (unsigned) base64 summary, including Devnet wallet addresses.

## Project structure

```
index.html                 markup only; loads css/ and js/ with plain <script> tags
css/app.css                all styles
js/credential-model.js     shared state (creds), persistence, status/format helpers (load first)
js/credential-catalog.js   stub: RN credential catalog (PR 2)
js/demo-data.js            demo seed credentials + demo seeding
js/requirements.js         newcomer onboarding requirement evaluation
js/assignments.js          assignment definitions (demo)
js/readiness-engine.js     assignment readiness matching
js/analytics.js            event log + event-derived metrics
js/verification.js         simulated verification + provenance/proof dialog
js/xrpl.js                 XRPL Devnet issue/accept/live check
js/sharing.js              Passport QR + selective share links
js/roles/clinician.js      clinician workspace views
js/roles/organization.js   organization workspace
js/roles/verifier.js       Verification Console
js/app.js                  role routing, event wiring, boot (load last)
archive/                   older single-file prototypes (see below)
```

The files are classic scripts that share the global scope, so load order matters (see `index.html`). Third-party libraries are pinned with Subresource Integrity: `xrpl@5.3.0` and `qrcode@1.5.1`.

## Archive

`archive/` holds the earlier single-file prototypes (`indexV3`–`indexV7`). They are kept for reference and are not maintained. Each shows an "ARCHIVED PROTOTYPE" banner and uses its own storage key, so it can't overwrite the live demo's data. See `archive/README.md`.
