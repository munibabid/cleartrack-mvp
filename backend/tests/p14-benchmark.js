/* PR 14: measure on-device extraction accuracy on synthetic documents for
   every profile: AHA eCards (BLS/ACLS/PALS) plus NIHSS, TNCC, ENPC, RN
   licenses (single-state and multistate), CCRN, CEN and a private TB record.
   Run: BASE=http://localhost:8765/ node backend/tests/p14-benchmark.js
   Writes js/extraction-benchmark.js (shown in the Verification Console)
   and docs/EXTRACTION-BENCHMARK.md. Only field names, right/wrong and
   timings are written; no document text. */
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8765/';
const ORDER = ['holder_name', 'credential_id', 'course', 'issued_on', 'renew_by', 'expires_on', 'jurisdiction', 'multistate', 'training_center'];
const OPTIONAL = ['training_center'];
const norm = (k, v) => { v = String(v || '').trim(); if (k === 'holder_name' || k === 'training_center') return v.toLowerCase().replace(/[^a-z]/g, ''); return v.toUpperCase().replace(/\s+/g, ''); };
const KIND_LABEL = { CERT_BLS: 'BLS (AHA)', CERT_ACLS: 'ACLS (AHA)', CERT_PALS: 'PALS (AHA)', CERT_NIHSS: 'NIHSS (APEX)', CERT_TNCC: 'TNCC (ENA)', CERT_ENPC: 'ENPC (ENA)', RN_LICENSE: 'RN license', RN_LICENSE_MULTISTATE: 'RN license, multistate', CERT_CCRN: 'CCRN (AACN)', CERT_CEN: 'CEN (BCEN)', HEALTH_TB_CURRENT: 'TB record (private, dates only)' };
async function run(browser, { dir = '/tmp/p14-fixtures', write = true, log = console.log, only = null } = {}) {
  const { generate, generateOther } = require('./p14-fixtures.js');
  let cases = [...(await generate(browser, BASE, dir)), ...(await generateOther(browser, dir))];
  if (only) cases = cases.filter(c => only.test(c.id));
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  const results = [];
  for (const c of cases) {
    const b64 = fs.readFileSync(c.file).toString('base64');
    const r = await page.evaluate(async (b64, name, mime, kind, profileName) => {
      const bin = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const res = await DocExtract.extractFromFile(new File([bin], name, { type: mime }), { kind, profileName });
      return { fields: Object.fromEntries(Object.entries(res.fields).map(([k, x]) => [k, { value: x.value, conf: x.conf }])), method: res.method, ms: res.ms, qr: res.qrFound, rotated: res.rotated, issuer: res.issuer, source: res.source && res.source.id, profile: res.profile };
    }, b64, c.id, c.mime, c.kind, c.profileName);
    const keys = ORDER.filter(k => k in c.truth);
    const per = {};
    for (const k of keys) { const got = r.fields[k]; per[k] = { ok: !!got && norm(k, got.value) === norm(k, c.truth[k]), found: !!got, got: got ? got.value : null, conf: got ? got.conf : null }; }
    const req = keys.filter(k => !OPTIONAL.includes(k));
    const allReq = req.every(k => per[k].ok);
    results.push({ id: c.id, kind: c.kind, profile: r.profile, variant: c.variant, method: r.method, ms: r.ms, qr: r.qr, rotated: r.rotated, source: r.source, per, allRequired: allReq });
    log(`${allReq ? 'ALL ' : 'MISS'} ${c.id.padEnd(32)} ${String(r.method).padEnd(9)} ${String(r.ms).padStart(6)}ms ${String(r.source || '-').padEnd(20)} ` + keys.map(k => (per[k].ok ? '✓' : per[k].found ? '≠' : '·') + k.split('_')[0]).join(' ') + (allReq ? '' : '  ' + keys.filter(k => !per[k].ok).map(k => `${k}=${JSON.stringify(per[k].got)}`).join(' ')));
  }
  await page.close();
  const fieldStats = Object.fromEntries(ORDER.map(k => { const rs = results.filter(r => r.per[k]); if (!rs.length) return null; const n = rs.length, ok = rs.filter(r => r.per[k].ok).length, found = rs.filter(r => r.per[k].found).length; return [k, { n, correct: ok, found, wrong: found - ok, accuracy: ok / n }]; }).filter(Boolean));
  const group = (key, label) => [...new Set(results.map(r => r[key]))].map(v => { const rs = results.filter(r => r[key] === v); const fc = rs.reduce((a, r) => a + Object.values(r.per).filter(x => x.ok).length, 0), ft = rs.reduce((a, r) => a + Object.keys(r.per).length, 0); return { [key]: v, label: label ? label(v) : v, n: rs.length, allRequired: rs.filter(r => r.allRequired).length, fieldsCorrect: fc, fieldsTotal: ft, accuracy: ft ? fc / ft : 0, medianMs: rs.map(r => r.ms).sort((a, b) => a - b)[Math.floor(rs.length / 2)] }; });
  const kinds = group('kind', k => KIND_LABEL[k] || k), variants = group('variant');
  const summary = { generated: new Date().toISOString(), documents: results.length, allRequired: results.filter(r => r.allRequired).length, fields: fieldStats, kinds, variants, note: 'Synthetic documents with fake names and IDs (backend/tests/p14-fixtures.js): AHA-style BLS/ACLS/PALS eCards plus NIHSS, TNCC, ENPC, RN license, CCRN, CEN and a TB record. Measured in headless Chrome with the same on-device reader the site uses, with the profile name supplied as on the site. Real documents may differ.' };
  if (write) {
    const root = path.join(__dirname, '..', '..');
    fs.writeFileSync(path.join(root, 'js', 'extraction-benchmark.js'), '/* Generated by backend/tests/p14-benchmark.js. Do not edit by hand. */\nwindow.EXTRACTION_BENCHMARK=' + JSON.stringify(summary) + ';\n');
    const pct = x => (x * 100).toFixed(1) + '%';
    const md = [`# On-device extraction benchmark (PR 14)`, '', `Generated ${summary.generated} by \`backend/tests/p14-benchmark.js\`. ${summary.note}`, '',
      `**${summary.allRequired} of ${summary.documents}** documents had every field the kind needs read correctly with no correction (training center is optional and not counted).`, '',
      '## By field', '', '| Field | Correct | Read but wrong | Not found | Accuracy |', '|---|---|---|---|---|',
      ...Object.entries(fieldStats).map(([k, s]) => `| ${k} | ${s.correct}/${s.n} | ${s.wrong} | ${s.n - s.found} | ${pct(s.accuracy)} |`), '',
      '## By credential kind', '', '| Kind | Documents | All fields right | Fields right | Accuracy | Median time |', '|---|---|---|---|---|---|',
      ...kinds.map(v => `| ${v.label} | ${v.n} | ${v.allRequired}/${v.n} | ${v.fieldsCorrect}/${v.fieldsTotal} | ${pct(v.accuracy)} | ${(v.medianMs / 1000).toFixed(1)} s |`), '',
      '## By file variant', '', '| Variant | Documents | All fields right | Fields right | Accuracy | Median time |', '|---|---|---|---|---|---|',
      ...variants.map(v => `| ${v.variant} | ${v.n} | ${v.allRequired}/${v.n} | ${v.fieldsCorrect}/${v.fieldsTotal} | ${pct(v.accuracy)} | ${(v.medianMs / 1000).toFixed(1)} s |`), ''].join('\n');
    fs.writeFileSync(path.join(root, 'docs', 'EXTRACTION-BENCHMARK.md'), md);
  }
  return { summary, results };
}
module.exports = { run };
if (require.main === module) {
  (async () => {
    const puppeteer = require('puppeteer-core');
    const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
    try { const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null; const { summary } = await run(browser, { write: !only, only }); console.log(JSON.stringify({ all: summary.allRequired + '/' + summary.documents, fields: Object.fromEntries(Object.entries(summary.fields).map(([k, s]) => [k, (s.accuracy * 100).toFixed(1) + '%'])), kinds: summary.kinds.map(k => `${k.label}: ${k.allRequired}/${k.n} docs, ${(k.accuracy * 100).toFixed(1)}%`) }, null, 1)); }
    finally { await browser.close(); }
  })().catch(e => { console.error(e); process.exit(1); });
}
