# On-device extraction benchmark (PR 14)

Generated 2026-10-09T09:39:38.579Z by `backend/tests/p14-benchmark.js`. Synthetic documents with fake names and IDs (backend/tests/p14-fixtures.js): AHA-style BLS/ACLS/PALS eCards plus NIHSS, TNCC, ENPC, RN license, CCRN, CEN and a TB record. Measured in headless Chrome with the same on-device reader the site uses, with the profile name supplied as on the site. Real documents may differ.

**70 of 72** documents had every field the kind needs read correctly with no correction (training center is optional and not counted).

## By field

| Field | Correct | Read but wrong | Not found | Accuracy |
|---|---|---|---|---|
| holder_name | 68/68 | 0 | 0 | 100.0% |
| credential_id | 68/68 | 0 | 0 | 100.0% |
| course | 60/60 | 0 | 0 | 100.0% |
| issued_on | 70/72 | 0 | 2 | 97.2% |
| renew_by | 36/36 | 0 | 0 | 100.0% |
| expires_on | 36/36 | 0 | 0 | 100.0% |
| jurisdiction | 8/8 | 0 | 0 | 100.0% |
| multistate | 8/8 | 0 | 0 | 100.0% |
| training_center | 30/36 | 5 | 1 | 83.3% |

## By credential kind

| Kind | Documents | All fields right | Fields right | Accuracy | Median time |
|---|---|---|---|---|---|
| BLS (AHA) | 18 | 18/18 | 105/108 | 97.2% | 1.1 s |
| ACLS (AHA) | 12 | 12/12 | 70/72 | 97.2% | 1.0 s |
| PALS (AHA) | 6 | 6/6 | 35/36 | 97.2% | 1.0 s |
| NIHSS (APEX) | 8 | 8/8 | 40/40 | 100.0% | 0.8 s |
| TNCC (ENA) | 4 | 4/4 | 20/20 | 100.0% | 0.8 s |
| ENPC (ENA) | 4 | 4/4 | 20/20 | 100.0% | 0.8 s |
| RN license | 4 | 3/4 | 23/24 | 95.8% | 0.9 s |
| RN license, multistate | 4 | 4/4 | 24/24 | 100.0% | 0.6 s |
| CCRN (AACN) | 4 | 4/4 | 20/20 | 100.0% | 0.8 s |
| CEN (BCEN) | 4 | 4/4 | 20/20 | 100.0% | 0.7 s |
| TB record (private, dates only) | 4 | 3/4 | 7/8 | 87.5% | 0.6 s |

## By file variant

| Variant | Documents | All fields right | Fields right | Accuracy | Median time |
|---|---|---|---|---|---|
| PDF (text) | 15 | 15/15 | 80/80 | 100.0% | 0.5 s |
| PDF (scanned, no text) | 6 | 6/6 | 34/36 | 94.4% | 1.8 s |
| PNG (clean) | 15 | 15/15 | 80/80 | 100.0% | 0.8 s |
| JPEG (skewed, noisy) | 15 | 15/15 | 79/80 | 98.8% | 1.0 s |
| JPEG (low quality) | 15 | 13/15 | 75/80 | 93.8% | 0.9 s |
| JPEG (turned 90°) | 6 | 6/6 | 36/36 | 100.0% | 4.2 s |

## Confidence (v14.2)

Each field’s confidence now comes from the OCR words it was read from, not from a flat cap for the whole page:

- **Text-layer PDF:** 0.98 (the text is exact), ×0.85 if the value had no label.
- **OCR (scanned PDF, photo):** `wordConf = ½·mean + ½·min` of Tesseract’s per-word confidence for the words that make up the value (words on the field’s own line first). Then **+0.03** when the value sits next to its label, or **×0.85** when it was found without one. Capped at 0.97.
- **Field factors:** damaged date (slashes read as digits) ×0.6; a numeric date whose day and month could be swapped ×0.85 (AHA cards are exempt: their documented format is MM/DD/YYYY, and so is any document that also prints a day above 12); course read only from an abbreviation ×0.9; a credential other than the one being added ×0.9; AHA renewal month exactly 24 months after the issue date +0.03 to both, otherwise ×0.8 and a warning; eCard code matching the QR code 0.995, starting with the issue year +0.02, otherwise ×0.85; bare 12-digit code with no label ×0.94.
- Chips: **≥90% high**, 70–89% "check it", <70% "low, check it".

| | v14.1 (before) | v14.2 (now) |
|---|---|---|
| Documents with every needed field right | 70/72 | — see top |
| Fields shown as high (≥90%) | 185 (185 right, 100%) | 282 (282 right, 100.0%) |
| Fields shown as "check it" (70–89%) | 133 (128 right, 96.2%) | 68 (68 right, 100.0%) |
| Fields shown as low (<70%) | 70 (69 right, 98.6%) | 39 (34 right, 87.2%) |
| Mean confidence, right / wrong fields | 0.836 / 0.767 | 0.894 / 0.538 |
| AUROC (right fields score above wrong ones) | 0.692 | 0.948 |
| Median confidence, scanned PDF / image OCR | 0.729 / 0.81 | 0.940 / 0.950 |
| OCR median: issue date / renewal / course | 0.72 / 0.73 / 0.75 | 0.940 / 0.970 / 0.970 |

No field shown as high was wrong in this run (5 wrong reads, all below 90%). Real documents may differ.
