# Archived prototypes

These are earlier single-file prototypes from the ClearTrack → NurseCredX → Veridun evolution. They are kept for reference only. They are **not** maintained, and the current app is `../index.html`.

| File | Original upload name | Uploaded (commit) | Notes |
|---|---|---|---|
| `indexV3.html` | `index (3).html` | 2026-10-06 (`55c75f8`) | Early NurseCredX + XRPL Devnet prototype |
| `indexV4.html` | `index (4).html` | 2026-10-06 (`e72beaa`) | NurseCredX dashboard + XRPL credentials |
| `indexV5.html` | `NurseCredX_v5_index.html` | 2026-10-06 (`54e6b48`) | v5 |
| `indexV6.html` | `NurseCredX_v6_index.html` | 2026-10-07 (`a1bf61b`) | v6 "Verify once. Share anywhere." (no XRPL) |
| `indexV7.html` | `NurseCredX_v7_index.html` | 2026-10-07 (`92de89e`) | v7: Home / Passport / Tasks / Opportunities (v8.1 builds on this) |

The original ClearTrack compliance tracker (2026-09-24, `6c185af`) only exists in git history.

## Things to know

- GitHub Pages still serves these files publicly (e.g. `/archive/indexV7.html`). Each one has a visible "ARCHIVED PROTOTYPE" banner and a `noindex` meta tag.
- **Storage isolation:** V4, V5 and V7 used to read and write `nursecredx_v2`, the same `localStorage` key the live app uses. Every repo under one `*.github.io` account shares the same browser origin, so opening an old prototype could overwrite the live demo's data. In this folder their keys are renamed to `nursecredx_archive_v4/_v5/_v7` (wallets: `…_wallets`), and V3's keys to `ncx_archive_v3_*`. V6 already used its own `nursecredx_v6_*` keys and was not changed.
- Apart from the banner, the `noindex` tag and the storage-key rename, the files are unchanged.
- Some of these prototypes load `qrcode@1.5.4/build/qrcode.min.js`. That file doesn't exist on the CDN (404), so their QR codes don't render. This is left as-is.
