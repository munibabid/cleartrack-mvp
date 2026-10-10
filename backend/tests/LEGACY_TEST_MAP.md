# Legacy test map: p14 / p142 / p144 / p145 (v14.8 P0, t150u)

These suites were written for v14.4–v14.7. Back then the on-device reader filled in the nurse's form, compared her values with the document, offered "Use the document's date/scope", re-scanned saved files and pre-filled the verifier's evidence. v14.8 stops all of that.

How tests were measured:
- **Before:** each test was run on this branch before the rewrite. The baseline is v14.7 (`/tmp/v147src`), where all four suites pass: p145 28/28, p144 84/84, p142 54/54, p14 59/59.
- **Failures counted:** every test that failed on the branch is listed below, including tests that never ran because the suite crashed earlier. Each crash came from a missing reader UI (`#acctScanBoxV14`) or a removed repair helper (`DocExtract.normCode`).
- **Kept as-is:** tests that still pass unchanged are not listed.

Each failing test is classified as one of:
- **OBSOLETE_BEHAVIOR:** retired. The test is removed from the suite and a comment marks the spot. The replacement is a named `p148.js` test.
- **STILL_VALID_INVARIANT:** rewritten against the screen-only / manual / hold workflow. It is marked `(rewritten v14.8)` in its name and passes.

The p14 live-database part is now opt-in (`P14_LIVE=1`). Default runs never touch a live database.

## p145 (license scope)
| Old test | Class | Reason | Replacement / rewrite |
|---|---|---|---|
| P2 Michigan auto single-state | STILL_VALID_INVARIANT | The scope rule holds. The test crashed waiting for the old scan box. | P2: waits on `#acctScreenBoxV148`. Wording is "Michigan doesn't issue multistate licenses". |
| P3 Michigan explanation | STILL_VALID_INVARIANT | Unreached (crash). | P3 (unchanged assertion) |
| P4 scan box has no own multistate select | STILL_VALID_INVARIANT | The invariant "no second scope source" still holds, and is now stronger. | P4 (rewritten): no scan box, no multistate scan field, expiration empty. |
| P5 saved RN_LICENSE + SINGLE_STATE automatic | STILL_VALID_INVARIANT | Unreached. Now the nurse types the date. | P5: name rendered as `Michigan RN License · Single-state`. |
| P6 multistate prefilled from the document | OBSOLETE_BEHAVIOR | The scanner value must never become canonical. | p148 `site path tx-rn: nothing prefilled (expiration empty, no scope chosen, no read-back values)` |
| P7 scope mismatch note vs document | OBSOLETE_BEHAVIOR | Scanner values are no longer compared with the nurse's choice. | p148 `site path tx-rn: nothing prefilled …` |
| P8 "Use the document's scope" | OBSOLETE_BEHAVIOR | Document-driven scope is removed. | p148 `account: save blocked until the license scope is chosen` |
| P9 saved MULTISTATE from document, name "Multistate RN License (NLC · home: Texas)" | STILL_VALID_INVARIANT | A multistate license saves as RN_LICENSE + MULTISTATE. The source and name changed. | P9a/P9 (rewritten): nothing preselected. The nurse chooses Multistate, which saves as `chosen`, named `Texas RN License · Multistate`. No new metadata keys. |
| P10 default multistate for the residence state | OBSOLETE_BEHAVIOR | Multistate is never inferred from the home state. | p148 `account: no license scope preselected for a license from the primary state of residence`; `no home-state multistate default …` |
| P11 Maine explanation | STILL_VALID_INVARIANT | Unreached. | P11: the note text is current. |
| P12 residence ≠ license state → default single-state | STILL_VALID_INVARIANT | The explanation still applies, but no scope is preselected now. | P12 (rewritten): nothing preselected; the sentence names both states. |
| P13 Massachusetts auto single-state | STILL_VALID_INVARIANT | Unreached. | P13 (unchanged) |
| P14 no residence + Michigan | STILL_VALID_INVARIANT | Unreached. | P14 (unchanged) |
| Q1 license scan fills the expiration | OBSOLETE_BEHAVIOR | Scanner prefill. | p148 `site path *: nothing prefilled …`; `lazy nurse cannot save values she did not type` |
| Q2 type switch clears the document date / "not printed" | OBSOLETE_BEHAVIOR | No document-filled date exists to clear. | p148 `site path rv48-nihss: nothing prefilled …` |
| Q3 NIHSS calculated renewal shown from scan | OBSOLETE_BEHAVIOR | This lived in the reader review box, which is removed. | p148 `site path rv48-nihss: saved with exactly what the nurse typed …` |
| Q4 new file replaces the document date | OBSOLETE_BEHAVIOR | Scanner prefill. | p148 `site path renewed-license: nothing prefilled …` |
| Q5 removing the file clears the document date | STILL_VALID_INVARIANT | No stale values. | Q5 (rewritten): removing the file leaves the nurse's typed date. |
| Q6 typed date kept when a file is scanned | STILL_VALID_INVARIANT | The nurse's value is never replaced. | Q6 (rewritten): no mismatch note required. |
| Q7 typed date survives a type switch + new file | STILL_VALID_INVARIANT | Same as Q6. | Q7 (rewritten) |
| P15 legacy RN_LICENSE_MULTISTATE reads as RN_LICENSE + MULTISTATE | STILL_VALID_INVARIANT | Unreached. This is an in-memory read only. | P15: the name notes that stored records are not rewritten. |
| P16 compact coverage for both storages | STILL_VALID_INVARIANT | Unreached. | P16 (unchanged) |
| P17 shared assertions parse the label to get the kind | OBSOLETE_BEHAVIOR | No logic may parse labels; `assertionLicenseRuleKind` is removed. | p148 `t150u D: no helper derives type/scope by parsing a label` |
| P18 legacy kind never offered; seed RN_LICENSE + scope | STILL_VALID_INVARIANT | Unreached. | P18 (unchanged) |
| P19 demo form: Texas choice with single-state default | STILL_VALID_INVARIANT | A choice is still shown, but with no default. | P19 (rewritten): Texas choice, nothing preselected. |
| P20 old residence wording gone | STILL_VALID_INVARIANT | Unreached. | P20 (unchanged) |
| P21 no page errors | STILL_VALID_INVARIANT | Unreached. | P21 (unchanged) |

## p144 (state RN licenses, CCRN, expiration field)
| Old test | Class | Reason | Replacement / rewrite |
|---|---|---|---|
| E14 scan box renders NIHSS group/module | OBSOLETE_BEHAVIOR | `scanBoxHtml` (the reader review box) is removed. | p148 `site path rv48-nihss: nothing prefilled …` |
| F4 one expiration field pre-filled "from document" | OBSOLETE_BEHAVIOR | Scanner prefill. | p148 `site path *: nothing prefilled …` |
| F5 scan box doesn't repeat the expiration | OBSOLETE_BEHAVIOR | The scan box is removed. | p148 `site path *: nothing prefilled …` |
| F6 certificate number filled from the scan | OBSOLETE_BEHAVIOR | Scanner prefill; the number is not a DB field. | p148 `site path *: saved with exactly what the nurse typed; only database fields …` |
| F7 typed date ≠ document → mismatch note | OBSOLETE_BEHAVIOR | No scanner comparison on the nurse form. | p148 `verifier: the nurse's date is shown beside the field for comparison only` |
| F8 "Use the document's date" | OBSOLETE_BEHAVIOR | Removed. | p148 `site path *: lazy nurse cannot save values she did not type` |
| F9 saved with document date (DOCUMENT_DATE_APPLIED) | OBSOLETE_BEHAVIOR | Scanner value becoming canonical. | p148 `site path *: lazy nurse cannot save values she did not type` |
| F10 typed date never overwritten | STILL_VALID_INVARIANT | The nurse's value is never replaced. | F10 (rewritten): no "Use the document's date" offer. |
| F11 saved as typed, flagged DOCUMENT_MISMATCH | STILL_VALID_INVARIANT | Saving as typed still holds; mismatch flagging is gone. | F11 (rewritten): saved as typed, not VERIFIED, no DOCUMENT_DATE_APPLIED, no document values in metadata. |
| F12 no page errors | STILL_VALID_INVARIANT | Unreached (crash). | F12 (unchanged) |
| B `ny-text.pdf` / `ny.png` dates | STILL_VALID_INVARIANT | NY prints "Date of registration" and "Registered through". Strict date labels (v14.8) had dropped them. | Reader fix: "Registered through" / "Registration valid through" read as the expiration (current-practice-through), and "Date of registration" as the issue date. New p148 unit `t150u A: … "Registered through" …`. This is reader-only: nothing reaches the nurse form or the DB. |

## p142 (AHA eCard / Training Center ID)
| Old test | Class | Reason | Replacement / rewrite |
|---|---|---|---|
| C1 nurse: "eCard code not found" note | OBSOLETE_BEHAVIOR | Reader review box removed. | p148 `site path bls-ok: nothing prefilled …` |
| C2 nurse: TC ID shown separately | OBSOLETE_BEHAVIOR | Same. | p148 `site path bls-ok: nothing prefilled …` |
| C3 nurse: confidence chip per field | OBSOLETE_BEHAVIOR | Same; reader confidence is covered at unit level. | p148 `confidence words: High confidence / Please check / Could not read reliably` |
| C4 typing TC ID into the eCard box is flagged | OBSOLETE_BEHAVIOR | Depended on scanner read-back; the eCard code is not a DB field. | p148 `site path bls-ok: saved with exactly what the nurse typed; only database fields …` |
| C5 real eCard code clears the note | OBSOLETE_BEHAVIOR | Same. | Same as C4 |
| C6 saved: no values on the server | STILL_VALID_INVARIANT | Privacy invariant. | C6 (rewritten): only typed fields; no TC ID / code / name anywhere on the server. |
| C7 verifier reference/Copy = eCard code | OBSOLETE_BEHAVIOR | The verifier types evidence; no reader prefill. | p148 `verifier: "Expiration shown by the source" and "Reference" start empty (no prefill)` |
| C8 verifier sees TC ID context | OBSOLETE_BEHAVIOR | Verifier on-device reader removed. | p148 `verifier: no on-device reader filling evidence` |
| C9 TC-ID-only card → nothing prefilled, no Copy | STILL_VALID_INVARIANT | "Nothing prefilled" still holds. | C9 (rewritten): reference empty, no reader, no Copy. |
| C10 no page errors | STILL_VALID_INVARIANT | Unreached. | C10 (unchanged) |

## p14 (catalog routing, reader units, account flow, accuracy panels)
| Old test | Class | Reason | Replacement / rewrite |
|---|---|---|---|
| catalog walk: all kinds route … ("no date mismatch check" on BLS/ACLS/PALS) | STILL_VALID_INVARIANT | Routing holds. The AHA check compared a Renew-By month as an expiration. | Rewritten: compares a printed expiration only, and asserts Renew-By is never treated as one. |
| 06/2028 card vs typed May 8 → mismatch June 30 | OBSOLETE_BEHAVIOR | Renew-By was converted to an expiration. | p148 `"Renew By" never becomes the expiration` |
| renewal month explained as end of month | OBSOLETE_BEHAVIOR | Same. | p148 `"Renew By" never becomes the expiration` |
| OCR digit fixes in codes (I→1, O→0) | OBSOLETE_BEHAVIOR | Identifier transformation. | p148 `no O/0, I/1, L swaps …`; `repair helpers are gone from the reader API` |
| BLS→eCards, RQI, Red Cross, course/name mismatch, NIHSS, TNCC-on-NRP, license, TB, never "verified" | STILL_VALID_INVARIANT | Unreached (A2 crashed on `normCode`). | Unchanged; pass. |
| benchmark: ≥ 90% documents need no correction | OBSOLETE_BEHAVIOR | Pre-fill quality metric; nothing is pre-filled. Unlabelled dates are left unread on purpose. | p148 `site path synthetic set: UNSAFE ACCEPTANCES = 0`; p14 `(rewritten v14.8) benchmark: dates and identifiers are never read wrong` |
| benchmark: every required field ≥ 90% | STILL_VALID_INVARIANT (reformulated) | The safety part of accuracy is "never wrong". | `(rewritten v14.8) benchmark: dates and identifiers are never read wrong (left unread instead)`. Result: 0 wrong for issued_on, expires_on, renew_by and credential_id. |
| scan reads the BLS card: code, course, dates, name | OBSOLETE_BEHAVIOR | Nurse-side read-back. | p148 `site path bls-ok: nothing prefilled …` |
| each field shows a confidence | OBSOLETE_BEHAVIOR | Reader review box. | p148 `confidence words …` |
| scan box no longer repeats the expiration | OBSOLETE_BEHAVIOR | Scan box removed. | p148 `site path *: nothing prefilled …` |
| typed May 8 kept; mismatch note | STILL_VALID_INVARIANT | The typed value is never replaced; the mismatch note is gone. | Rewritten: typed date kept; file only screened; no comparison. |
| save refused until the nurse confirms the scanned details | OBSOLETE_BEHAVIOR | No scanned details to confirm; the expiration confirm stays (p147). | p148 `site path *: lazy nurse cannot save values she did not type` |
| "Use the document's date" sets June 30 | OBSOLETE_BEHAVIOR | Removed. | p148 `site path *: lazy nurse cannot save …` |
| expiration field marked "from document" | OBSOLETE_BEHAVIOR | Scanner prefill. | p148 `site path *: nothing prefilled …` |
| saved VERIFYING, metadata.doc confirmed | STILL_VALID_INVARIANT | Saved awaiting verification still holds. | Rewritten: VERIFYING, typed date, no `metadata.doc`, no DOCUMENT_DATE_APPLIED. |
| audit DOCUMENT_SCANNED + DATE_APPLIED + CONFIRM | OBSOLETE_BEHAVIOR | Scan-confirm telemetry no longer exists. | p148 `site path *: saved with exactly what the nurse typed …` |
| extracted values stay off the server | STILL_VALID_INVARIANT | Privacy. | Rewritten: no document values in metadata/audit/telemetry. |
| row badge DETAILS CAPTURED · AWAITING VERIFICATION | STILL_VALID_INVARIANT | "Never VERIFIED" holds; the "details captured" wording belonged to the scan path. | Rewritten: badge says NOT VERIFIED / AWAITING VERIFICATION, never VERIFIED. |
| NIHSS scan values / NIHSS mismatch / saved with mismatch flag | OBSOLETE_BEHAVIOR | Read-back and comparison. | p148 `site path rv48-nihss: *` |
| private TB record shows dates only | OBSOLETE_BEHAVIOR | Reader review box. | p148 `site path *: nothing prefilled …` |
| private TB saved with empty metadata + document date | STILL_VALID_INVARIANT | Privacy of private records. | Rewritten: typed date, no document data in metadata (only the approved exp-confirm key allowed). |
| Re-scan reads the saved PDF / re-scan saves the document date | OBSOLETE_BEHAVIOR | Re-scan removed. | p148 `account: no "Re-scan document" …`; p14 `(v14.8) no "Re-scan document" on saved credentials` |
| nothing left the page while scanning | STILL_VALID_INVARIANT | On-device only. | Rewritten for screening. |
| queue lists the mismatched credential first | OBSOLETE_BEHAVIOR | Mismatch flags came from the scanner comparison. | p148 `verifier: the nurse's date is shown beside the field for comparison only` |
| BLS verifier sources / applies text / no e-Notify / fits a phone / RN license board+Nursys | STILL_VALID_INVARIANT | Registry routing. | Unchanged assertions; the verifier form opens without the reader. |
| expiration prefilled from document; reference = eCard; copy + open AHA | STILL_VALID_INVARIANT (partly) | Prefill is gone; the AHA lookup link stays. | Rewritten: expiration and reference empty, no reader, AHA link offered. |
| verifier reads document on own device | OBSOLETE_BEHAVIOR | Verifier reader removed. | p148 `verifier: no on-device reader filling evidence` |
| verifier double-check logged; level from registry | STILL_VALID_INVARIANT | Level-from-registry holds. The double-check list needs `metadata.doc`, which no longer exists. | Rewritten: verifier types evidence; level ISSUER_VERIFIED from AHA eCards. |
| live accuracy panel from extraction_events (4 scans) | STILL_VALID_INVARIANT | The panel's data path holds; nurse-scan counts no longer exist. | Rewritten: loads from extraction_events. |
| without migration 9 falls back to audit log | STILL_VALID_INVARIANT | Fallback logic. | Rewritten: `from === 'audit_events'`. |
| account UI / console / Try a document / benchmark coverage / text PDFs | STILL_VALID_INVARIANT | Unreached. | Unchanged; pass. |
| live: … (partB) | not run | Writes to a live database; out of scope ("never write to live DB in tests"). | Opt-in only (`P14_LIVE=1`). |

## Counts (failing or unreached tests on the branch before this rewrite)
| Suite | OBSOLETE_BEHAVIOR | STILL_VALID_INVARIANT | After |
|---|---|---|---|
| p145 | 9 (P6, P7, P8, P10, P17, Q1–Q4) | 18 | 20/20 |
| p144 | 7 (E14, F4–F9) | 5 (F10, F11, F12, B ny-text, B ny.png) | 77/77 |
| p142 | 7 (C1–C5, C7, C8) | 3 (C6, C9, C10) | 47/47 |
| p14 | 19 | 35 | 41/41 (+1 skipped: live, opt-in) |
