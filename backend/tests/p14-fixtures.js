/* PR 14: synthetic AHA-style eCards for the extraction benchmark.
   Every person, code and training center here is FAKE and the cards say
   "SYNTHETIC TEST CARD". No AHA logo or artwork is reproduced: only the
   field layout (course title, name, issue date, recommended renewal
   month/year, training center, eCard code, QR code) that the reader has to
   handle. Variants: text PDF, scanned (image-only) PDF, clean PNG, skewed
   noisy JPEG, low-quality JPEG, and a photo turned 90 degrees. */
const fs = require('fs');
const path = require('path');
const PEOPLE = [
  { name: 'Testa Fakename', course: 'BLS', issued: '2026-06-12', tc: 'Example Valley Training Center', code: '261100000017' },
  { name: 'Sample Q. Notreal', course: 'ACLS', issued: '2026-02-03', tc: 'Placeholder Health Training Site', code: '262200000025' },
  { name: 'Demo Nurse-Example', course: 'PALS', issued: '2025-11-20', tc: 'Fictional Regional TC', code: '253300000033' },
  { name: 'Imaginary Person', course: 'BLS', issued: '2025-09-01', tc: 'Synthetic Data Training Center', code: '251100000041' },
  { name: 'Mock Clinician', course: 'BLS', issued: '2026-04-30', tc: 'Not A Real Training Center', code: '261100000058' },
  { name: 'Fakey McTestface', course: 'ACLS', issued: '2026-01-15', tc: 'Example Coastal Training Center', code: '262200000066' }
];
const COURSE_TEXT = { BLS: 'Basic Life Support (CPR and AED) Program', ACLS: 'Advanced Cardiovascular Life Support Program', PALS: 'Pediatric Advanced Life Support Program' };
const pad = n => String(n).padStart(2, '0');
function renew(issued) { const [y, m] = issued.split('-').map(Number); return `${y + 2}-${pad(m)}`; }
function mdy(iso) { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; }
function my(ym) { const [y, m] = ym.split('-'); return `${m}/${y}`; }
function truth(p) { return { holder_name: p.name, credential_id: p.code, course: p.course + ' Provider', issued_on: p.issued, renew_by: renew(p.issued), training_center: p.tc }; }
function cardHtml(p, qrDataUrl) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
  .card{width:1000px;padding:28px 36px;box-sizing:border-box;border:2px solid #b91c1c;border-radius:14px;position:relative}
  .wm{position:absolute;top:10px;right:16px;font-size:13px;color:#b91c1c;font-weight:bold;letter-spacing:1px}
  h1{font-size:44px;margin:18px 0 6px;color:#b91c1c}.name{font-size:30px;font-weight:bold;margin:14px 0}
  .txt{font-size:16px;line-height:1.45;max-width:880px}.dates{display:flex;gap:120px;margin-top:22px;font-size:20px}
  .dates .v{font-weight:bold}.dates .l{font-size:14px;color:#444;margin-top:4px}
  .back{margin-top:26px;border-top:1px dashed #999;padding-top:16px;display:flex;justify-content:space-between}
  table{font-size:16px;border-collapse:collapse}td{padding:5px 18px 5px 0}td:first-child{color:#444}
  .foot{font-size:11px;color:#555;margin-top:12px}
  </style></head><body><div class="card" id="card"><div class="wm">SYNTHETIC TEST CARD · NOT A REAL eCARD</div>
  <div style="font-size:15px;font-weight:bold;letter-spacing:2px">AMERICAN HEART ASSOCIATION</div>
  <h1>${p.course} Provider</h1>
  <div class="name">${p.name}</div>
  <div class="txt">has successfully completed the cognitive and skills evaluations in accordance with the curriculum of the American Heart Association ${COURSE_TEXT[p.course]}.</div>
  <div class="dates"><div><div class="v">${mdy(p.issued)}</div><div class="l">Issue Date</div></div><div><div class="v">${my(renew(p.issued))}</div><div class="l">Recommended Renewal Date</div></div></div>
  <div class="back"><table>
   <tr><td>Training Center Name</td><td>${p.tc}</td></tr><tr><td>TC ID #</td><td>ZZ00000</td></tr>
   <tr><td>TC Info</td><td>000-000-0000</td></tr><tr><td>Course Location</td><td>Nowhere, ZZ</td></tr>
   <tr><td>Instructor Name</td><td>Example Instructor</td></tr><tr><td>Instructor ID #</td><td>00000000000</td></tr>
   <tr><td>eCard Code</td><td><b>${p.code}</b></td></tr></table>
   <div style="text-align:center"><img src="${qrDataUrl}" width="150" height="150"><div style="font-size:11px">QR code</div></div></div>
  <div class="foot">To view or verify authenticity, students and employers can scan this QR code or go to heart.org/cpr/mycards. Synthetic fixture for Veridun tests.</div>
  </div></body></html>`;
}
/* Image degradation happens in a canvas page so it is deterministic. */
async function degrade(page, pngB64, { rotate = 0, noise = 0, scale = 1, quality = 0.92, blur = 0, type = 'image/jpeg', seed = 7 }) {
  return page.evaluate(async (b64, o) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const w = Math.round(img.width * o.scale), h = Math.round(img.height * o.scale);
    const r = Math.abs(o.rotate) % 180 === 90;
    const rad = o.rotate * Math.PI / 180, cw = r ? h : Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) + 40, ch = r ? w : Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))) + 40;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, cw, ch); x.translate(cw / 2, ch / 2); x.rotate(rad); if (o.blur) x.filter = `blur(${o.blur}px)`; x.drawImage(img, -w / 2, -h / 2, w, h); x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none';
    if (o.noise) { const d = x.getImageData(0, 0, cw, ch); let s = o.seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; for (let i = 0; i < d.data.length; i += 4) { const n = (rnd() - 0.5) * o.noise; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } x.putImageData(d, 0, 0); }
    return c.toDataURL(o.type, o.quality).split(',')[1];
  }, pngB64, { rotate, noise, scale, quality, blur, type, seed });
}
async function generate(browser, base, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  await page.goto(base + 'js/vendor/qrcode-LICENSE', { waitUntil: 'load' }).catch(() => {});
  await page.addScriptTag({ url: base + 'js/vendor/qrcode-1.5.1.js' });
  const cases = [];
  for (const [i, p] of PEOPLE.entries()) {
    const qr = await page.evaluate(code => QRCode.toDataURL('https://ecards.heart.org/student/myecards?ecardcode=' + code + '&synthetic=1', { width: 300, margin: 1 }), p.code);
    const html = cardHtml(p, qr);
    const cp = await browser.newPage(); await cp.setViewport({ width: 1080, height: 900, deviceScaleFactor: 1 });
    await cp.setContent(html, { waitUntil: 'load' });
    const slug = `${String(i + 1).padStart(2, '0')}-${p.course.toLowerCase()}`;
    const pdf = path.join(dir, slug + '-text.pdf'); await cp.pdf({ path: pdf, width: '1100px', height: '900px', printBackground: true });
    const el = await cp.$('#card'); const png = await el.screenshot({ encoding: 'base64' });
    const pngPath = path.join(dir, slug + '-clean.png'); fs.writeFileSync(pngPath, Buffer.from(png, 'base64'));
    const skew = await degrade(page, png, { rotate: 4, noise: 40, quality: 0.8, seed: 11 + i });
    const skewPath = path.join(dir, slug + '-skewed-noisy.jpg'); fs.writeFileSync(skewPath, Buffer.from(skew, 'base64'));
    const low = await degrade(page, png, { scale: 0.55, quality: 0.35, blur: 0.6, noise: 18, seed: 21 + i });
    const lowPath = path.join(dir, slug + '-low-quality.jpg'); fs.writeFileSync(lowPath, Buffer.from(low, 'base64'));
    const rot = await degrade(page, png, { rotate: 90, noise: 20, quality: 0.85, seed: 31 + i });
    const rotPath = path.join(dir, slug + '-rotated-90.jpg'); fs.writeFileSync(rotPath, Buffer.from(rot, 'base64'));
    /* scanned PDF: the noisy image inside a PDF, no text layer */
    await cp.setContent(`<html><body style="margin:0"><img src="data:image/jpeg;base64,${skew}" style="width:1000px"></body></html>`, { waitUntil: 'load' });
    const scanPdf = path.join(dir, slug + '-scanned.pdf'); await cp.pdf({ path: scanPdf, width: '1100px', height: '900px', printBackground: true });
    await cp.close();
    const t = truth(p);
    for (const [variant, file, mime] of [['PDF (text)', pdf, 'application/pdf'], ['PDF (scanned, no text)', scanPdf, 'application/pdf'], ['PNG (clean)', pngPath, 'image/png'], ['JPEG (skewed, noisy)', skewPath, 'image/jpeg'], ['JPEG (low quality)', lowPath, 'image/jpeg'], ['JPEG (turned 90°)', rotPath, 'image/jpeg']])
      cases.push({ id: path.basename(file), variant, file, mime, truth: t, kind: 'CERT_' + p.course, profileName: p.name });
  }
  await page.close();
  return cases;
}
/* ---- non-AHA kinds (Munib's steering): NIHSS, TNCC, ENPC, RN license, CCRN,
   CEN and a private TB record. Same rules: fake people, fake IDs, a
   SYNTHETIC banner, no real logos. Layouts follow what those documents print. */
const OTHER = [
  { kind: 'CERT_NIHSS', slug: 'nihss-apex', name: 'Testa Fakename', id: '99000123', issued: '2026-03-14', exp: '2028-03-14',
    html: p => `<div class="iss">APEX INNOVATIONS</div><h1>NIH Stroke Scale Certification</h1><div class="txt">This certifies that</div><div class="name">${p.name}</div>
      <div class="txt">has successfully completed the NIHSS Group B certification exam.</div>
      <table><tr><td>Test ID</td><td><b>${p.id}</b></td></tr><tr><td>Completion Date</td><td>${mdy(p.issued)}</td></tr><tr><td>Expiration Date</td><td>${mdy(p.exp)}</td></tr></table>
      <div class="foot">Verify at apexinnovations.com/verifyCertificate.php. Synthetic fixture for Veridun tests.</div>` },
  { kind: 'CERT_NIHSS', slug: 'nihss-apex2', name: 'Mock Clinician', id: '99000456', issued: '2025-10-02', exp: '2026-10-02',
    html: p => `<div class="iss">APEX INNOVATIONS</div><h1>NIHSS Certification · Group A</h1><div class="txt">This certifies that</div><div class="name">${p.name}</div>
      <div class="txt">has successfully completed the NIH Stroke Scale certification (Group A, valid one year).</div>
      <table><tr><td>Test ID</td><td><b>${p.id}</b></td></tr><tr><td>Completion Date</td><td>${mdy(p.issued)}</td></tr><tr><td>Expiration Date</td><td>${mdy(p.exp)}</td></tr></table>
      <div class="foot">Synthetic fixture for Veridun tests.</div>` },
  { kind: 'CERT_TNCC', slug: 'tncc-ena', name: 'Sample Q. Notreal', id: 'TN-0000-55501', issued: '2025-05-02', exp: '2029-05-31',
    html: p => `<div class="iss">EMERGENCY NURSES ASSOCIATION</div><h1>Trauma Nursing Core Course</h1><div class="txt">This is to certify that</div><div class="name">${p.name}</div>
      <div class="txt">has successfully completed the TNCC Provider Course, 9th Edition.</div>
      <table><tr><td>Certificate Number</td><td><b>${p.id}</b></td></tr><tr><td>Course Date</td><td>${mdy(p.issued)}</td></tr><tr><td>Expiration Date</td><td>${mdy(p.exp)}</td></tr></table>
      <div class="foot">Synthetic fixture for Veridun tests.</div>` },
  { kind: 'CERT_ENPC', slug: 'enpc-ena', name: 'Fakey McTestface', id: 'EP-0000-77702', issued: '2026-01-20', exp: '2030-01-31',
    html: p => `<div class="iss">EMERGENCY NURSES ASSOCIATION</div><h1>Emergency Nursing Pediatric Course</h1><div class="txt">This is to certify that</div><div class="name">${p.name}</div>
      <div class="txt">has successfully completed the ENPC Provider Course, 6th Edition.</div>
      <table><tr><td>Certificate Number</td><td><b>${p.id}</b></td></tr><tr><td>Course Date</td><td>${mdy(p.issued)}</td></tr><tr><td>Expiration Date</td><td>${mdy(p.exp)}</td></tr></table>
      <div class="foot">Synthetic fixture for Veridun tests.</div>` },
  { kind: 'RN_LICENSE', slug: 'rn-license', name: 'Demo Nurse-Example', id: '000999111RN', issued: '2021-01-10', exp: '2027-06-30', jurisdiction: 'US-OR', multistate: 'single-state',
    html: p => `<div class="iss">STATE OF OREGON</div><h1>Oregon State Board of Nursing</h1><div class="txt">Registered Nurse License</div>
      <table><tr><td>Name</td><td><b>${p.name}</b></td></tr><tr><td>License Number</td><td><b>${p.id}</b></td></tr><tr><td>License Type</td><td>Single-state license, not valid for multistate practice</td></tr>
      <tr><td>Issue Date</td><td>${mdy(p.issued)}</td></tr><tr><td>Expiration Date</td><td>${mdy(p.exp)}</td></tr></table>
      <div class="foot">Synthetic fixture for Veridun tests. Verify licenses at nursys.com or the issuing board.</div>` },
  { kind: 'RN_LICENSE_MULTISTATE', slug: 'rn-multistate', name: 'Imaginary Person', id: 'RN0000424', issued: '2022-08-01', exp: '2026-12-31', jurisdiction: 'US-TX', multistate: 'multistate',
    html: p => `<div class="iss">TEXAS BOARD OF NURSING</div><h1>Registered Nurse</h1><div class="txt">Multistate license (Nurse Licensure Compact)</div>
      <table><tr><td>Licensee</td><td><b>${p.name}</b></td></tr><tr><td>License Number</td><td><b>${p.id}</b></td></tr>
      <tr><td>Original Issue Date</td><td>${mdy(p.issued)}</td></tr><tr><td>Expiration Date</td><td>${mdy(p.exp)}</td></tr></table>
      <div class="foot">Synthetic fixture for Veridun tests.</div>` },
  { kind: 'CERT_CCRN', slug: 'ccrn-aacn', name: 'Testa Fakename', id: '00990077', issued: '2024-02-01', exp: '2027-01-31',
    html: p => `<div class="iss">AACN CERTIFICATION CORPORATION</div><h1>CCRN (Adult)</h1><div class="name">${p.name}</div>
      <div class="txt">has met the requirements for certification as a Critical Care Registered Nurse.</div>
      <table><tr><td>Certification Number</td><td><b>${p.id}</b></td></tr><tr><td>Certified Since</td><td>${mdy(p.issued)}</td></tr><tr><td>Valid Through</td><td>${mdy(p.exp)}</td></tr></table>
      <div class="foot">Synthetic fixture for Veridun tests.</div>` },
  { kind: 'CERT_CEN', slug: 'cen-bcen', name: 'Sample Q. Notreal', id: '00880066', issued: '2023-07-01', exp: '2027-06-30',
    html: p => `<div class="iss">BOARD OF CERTIFICATION FOR EMERGENCY NURSING (BCEN)</div><h1>Certified Emergency Nurse</h1><div class="name">${p.name}</div>
      <div class="txt">has met the requirements and is hereby certified as a CEN.</div>
      <table><tr><td>Certification Number</td><td><b>${p.id}</b></td></tr><tr><td>Effective Date</td><td>${mdy(p.issued)}</td></tr><tr><td>Expiration Date</td><td>${mdy(p.exp)}</td></tr></table>
      <div class="foot">Synthetic fixture for Veridun tests.</div>` },
  { kind: 'HEALTH_TB_CURRENT', slug: 'tb-private', name: 'Mock Clinician', issued: '2026-04-01', exp: '2027-04-01',
    html: p => `<div class="iss">EXAMPLE OCCUPATIONAL HEALTH CLINIC</div><h1>TB Screening Record</h1>
      <table><tr><td>Employee</td><td>${p.name}</td></tr><tr><td>Test Date</td><td>${mdy(p.issued)}</td></tr><tr><td>Result</td><td>Negative</td></tr><tr><td>Next Due</td><td>${mdy(p.exp)}</td></tr></table>
      <div class="foot">Synthetic fixture for Veridun tests.</div>` }
];
const SHORT = { CERT_NIHSS: 'NIHSS', CERT_TNCC: 'TNCC', CERT_ENPC: 'ENPC', CERT_CCRN: 'CCRN', CERT_CEN: 'CEN' };
function otherTruth(d) {
  if (d.kind.startsWith('HEALTH_')) return { issued_on: d.issued, expires_on: d.exp };
  if (d.kind.startsWith('RN_LICENSE')) return { holder_name: d.name, credential_id: d.id, jurisdiction: d.jurisdiction, multistate: d.multistate, issued_on: d.issued, expires_on: d.exp };
  return { holder_name: d.name, credential_id: d.id, course: SHORT[d.kind], issued_on: d.issued, expires_on: d.exp };
}
function otherHtml(d) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:Georgia,'Times New Roman',serif;color:#111;background:#fff}
  .card{width:1000px;padding:30px 40px;box-sizing:border-box;border:3px double #1e3a8a;position:relative}
  .wm{position:absolute;top:10px;right:16px;font:bold 13px Arial;color:#b91c1c;letter-spacing:1px}
  .iss{font:bold 16px Arial;letter-spacing:2px;color:#1e3a8a;margin-top:14px}h1{font-size:38px;margin:12px 0}
  .name{font-size:30px;font-weight:bold;margin:12px 0}.txt{font-size:18px;margin:6px 0}
  table{font-size:19px;border-collapse:collapse;margin-top:16px}td{padding:6px 26px 6px 0}td:first-child{color:#444}
  .foot{font:11px Arial;color:#555;margin-top:16px}</style></head><body><div class="card" id="card"><div class="wm">SYNTHETIC TEST DOCUMENT · NOT REAL</div>${d.html(d)}</div></body></html>`;
}
async function generateOther(browser, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage(); await page.setContent('<html></html>');
  const cases = [];
  for (const d of OTHER) {
    const cp = await browser.newPage(); await cp.setViewport({ width: 1080, height: 900, deviceScaleFactor: 1 });
    await cp.setContent(otherHtml(d), { waitUntil: 'load' });
    const pdf = path.join(dir, d.slug + '-text.pdf'); await cp.pdf({ path: pdf, width: '1100px', height: '900px', printBackground: true });
    const png = await (await cp.$('#card')).screenshot({ encoding: 'base64' });
    const pngPath = path.join(dir, d.slug + '-clean.png'); fs.writeFileSync(pngPath, Buffer.from(png, 'base64'));
    const skew = await degrade(page, png, { rotate: 3, noise: 36, quality: 0.8, seed: 5 + cases.length });
    const skewPath = path.join(dir, d.slug + '-skewed-noisy.jpg'); fs.writeFileSync(skewPath, Buffer.from(skew, 'base64'));
    const low = await degrade(page, png, { scale: 0.6, quality: 0.4, blur: 0.5, noise: 16, seed: 9 + cases.length });
    const lowPath = path.join(dir, d.slug + '-low-quality.jpg'); fs.writeFileSync(lowPath, Buffer.from(low, 'base64'));
    await cp.close();
    const t = otherTruth(d);
    for (const [variant, file, mime] of [['PDF (text)', pdf, 'application/pdf'], ['PNG (clean)', pngPath, 'image/png'], ['JPEG (skewed, noisy)', skewPath, 'image/jpeg'], ['JPEG (low quality)', lowPath, 'image/jpeg']])
      cases.push({ id: path.basename(file), variant, file, mime, truth: t, kind: d.kind, profileName: d.name });
  }
  await page.close();
  return cases;
}
module.exports = { generate, generateOther, PEOPLE, OTHER, truth, otherTruth };
