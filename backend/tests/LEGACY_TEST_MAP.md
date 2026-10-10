# Legacy test map (v14.8 P0 / t150u)

Maps older suite assertions that assumed scanner prefill, on-device verifier reading, or document-driven scope defaults to the v14.8 safety-stop behaviour. Replacement coverage lives in `p148.js` unless noted.

## p142 (AHA eCard / TC ID assisted path)

| Old id | Status | Notes / replacement |
|---|---|---|
| C1–C5 | Retired | Nurse scan review no longer shows eCard/TC-ID read-back, confidence chips, or mismatch notes. Capture is screen-only (`#acctScreenBoxV148`). |
| C6 | Rewritten | Saved credential holds only typed fields; no card values reach the server. |
| C7–C8 | Retired | Verifier on-device reader and Copy-code path removed. |
| C9 | Rewritten | Verifier evidence fields start empty; no prefill. |

## p144 (expiration / issue-date scan UX)

| Old id | Status | Notes / replacement |
|---|---|---|
| E14 | Retired | Reader scan box (`scanBoxHtml`) no longer exists. |
| F4–F9 | Retired | Document pre-fill and "Use the document's date" controls removed. |
| F10–F11 | Rewritten | Nurse types and confirms the date; RN licenses use current-practice-through wording (`p147` / `p148`). |

## p145 (license scope / multistate)

| Old id | Status | Notes / replacement |
|---|---|---|
| P2–P3 | Kept (wording tightened) | Non-compact states stay automatic single-state; no home-state multistate default. |
| P4 | Rewritten | No reader box offers scope or read-back values. |
| P5 | Kept (name render) | Saved as `RN_LICENSE` + `compact_privilege_type`; display is `<State> RN License · …`. |
| P6–P8 | Retired | Document-prefilled multistate / mismatch / "Use the document's scope" removed. |
| P9 | Rewritten | Nurse chooses scope; nothing preselected from the document. |
| P10 | Retired | Home-state multistate default removed. |
| P11–P12 | Rewritten / kept | Explanations kept; nothing preselected when residence ≠ license state. |
| Q1–Q4, P17 | Retired | Prefill / document-driven scope paths gone. |
| Q5–Q7, P19 | Rewritten | Align with chosen-scope + typed date path (`p148`). |

## Cross-suite

Positive conflicts, unsupported pilot families (PALS/TNCC/NRP/CEN/ENPC), LVN/LPN holds, merged-file blocks, identifier non-repair, Renew-By never-as-expiration, and RN current-practice-through readiness gating are owned by `p148.js` (t150u).
