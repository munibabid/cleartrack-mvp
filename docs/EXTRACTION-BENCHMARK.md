# On-device extraction benchmark (PR 14)

Generated 2026-10-09T04:12:56.530Z by `backend/tests/p14-benchmark.js`. Synthetic documents with fake names and IDs (backend/tests/p14-fixtures.js): AHA-style BLS/ACLS/PALS eCards plus NIHSS, TNCC, ENPC, RN license, CCRN, CEN and a TB record. Measured in headless Chrome with the same on-device reader the site uses, with the profile name supplied as on the site. Real documents may differ.

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
| training_center | 28/36 | 6 | 2 | 77.8% |

## By credential kind

| Kind | Documents | All fields right | Fields right | Accuracy | Median time |
|---|---|---|---|---|---|
| BLS (AHA) | 18 | 18/18 | 105/108 | 97.2% | 1.0 s |
| ACLS (AHA) | 12 | 12/12 | 70/72 | 97.2% | 1.0 s |
| PALS (AHA) | 6 | 6/6 | 33/36 | 91.7% | 1.0 s |
| NIHSS (APEX) | 8 | 8/8 | 40/40 | 100.0% | 0.7 s |
| TNCC (ENA) | 4 | 4/4 | 20/20 | 100.0% | 0.7 s |
| ENPC (ENA) | 4 | 4/4 | 20/20 | 100.0% | 0.7 s |
| RN license | 4 | 3/4 | 23/24 | 95.8% | 0.7 s |
| RN license, multistate | 4 | 4/4 | 24/24 | 100.0% | 0.6 s |
| CCRN (AACN) | 4 | 4/4 | 20/20 | 100.0% | 0.6 s |
| CEN (BCEN) | 4 | 4/4 | 20/20 | 100.0% | 0.7 s |
| TB record (private, dates only) | 4 | 3/4 | 7/8 | 87.5% | 0.6 s |

## By file variant

| Variant | Documents | All fields right | Fields right | Accuracy | Median time |
|---|---|---|---|---|---|
| PDF (text) | 15 | 15/15 | 80/80 | 100.0% | 0.5 s |
| PDF (scanned, no text) | 6 | 6/6 | 33/36 | 91.7% | 1.5 s |
| PNG (clean) | 15 | 15/15 | 80/80 | 100.0% | 0.7 s |
| JPEG (skewed, noisy) | 15 | 15/15 | 78/80 | 97.5% | 1.0 s |
| JPEG (low quality) | 15 | 13/15 | 75/80 | 93.8% | 0.8 s |
| JPEG (turned 90°) | 6 | 6/6 | 36/36 | 100.0% | 3.8 s |
