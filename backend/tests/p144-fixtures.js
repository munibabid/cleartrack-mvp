/* v14.4: synthetic state RN license documents for state detection and form-PDF reading.
   Every name, number, date and address is FAKE; each document carries a
   "NOT A REAL CREDENTIAL" banner. No seals, logos or artwork. Layouts:
   - ma-*: a Massachusetts-style certificate + wallet card where the name, number and
     dates are filled-in FORM FIELDS (the PDF text layer only has the boilerplate footer,
     which mentions a "Washington St." return address), as an AcroForm PDF, a flattened
     scan with a thin text layer, and a PNG;
   - wa / tx / fl / ny / ca: other state-board wordings, with mailing addresses in other
     states so a 2-letter code or a city never decides the state. */
const fs = require('fs');
const path = require('path');
const { buildPdf } = require('./lib/mini-pdf');
const BANNER = 'NOT A REAL CREDENTIAL - SYNTHETIC TEST DOCUMENT';
const MA = { name: 'Testa Fakename', number: 'RN0000099', exp: '02/14/2029', expIso: '2029-02-14', street: '123 Example Court, Unit 9', city: 'Nowhere, CA 90000' };
const FOOTER = ['If you find this registration, please return to: The Bureau of Health Professions Licensure, 999 Washington St.,', 'Example City, MA 00000. If your name or address changes, you must notify the Board. Always refer to your license', 'number when corresponding with the Board. This license is subject to the provisions of the General Laws as amended.'];
function maFormPdf() {
  return buildPdf([
    { text: [{ s: BANNER, x: 230, y: 590, size: 10, bold: true, gray: 0.4 }, { s: 'Executive Director, Board of Registration in Nursing', x: 75, y: 100, size: 10 }],
      fields: [
        { name: 'COMMONWEALTH', value: 'THE COMMONWEALTH OF MASSACHUSETTS', rect: [73, 541, 727, 570], size: 20, bold: true, align: 'center' },
        { name: 'DPH_PDF', value: 'DEPARTMENT OF PUBLIC HEALTH', rect: [73, 511, 727, 543], size: 16, align: 'center' },
        { name: 'LICENSE_NAME_PDF', value: 'Registered Nurse License', rect: [73, 485, 727, 514], size: 16, align: 'center' },
        { name: 'TEXT_BODY_PDF', value: 'The Board of Registration in Nursing, in accordance with the provision of\nMassachusetts General Laws, issues the license of Registered Nurse:', rect: [73, 420, 727, 477], size: 13, align: 'center' },
        { name: 'body', value: MA.name, rect: [73, 300, 727, 364], size: 26, bold: true, align: 'center' },
        { name: 'licenseNumberPDF', value: 'License Number: ' + MA.number, rect: [73, 250, 433, 274], size: 13 },
        { name: 'BoardChairNameAndCredentials', value: 'Example Director, BSN RN', rect: [73, 113, 319, 132], size: 11 },
        { name: 'EXPIRATION_DATE_CERTIFICATE', value: 'Expiration Date: ' + MA.exp, rect: [73, 65, 275, 92], size: 12 }] },
    { text: [{ s: BANNER, x: 230, y: 590, size: 10, bold: true, gray: 0.4 }, ...FOOTER.map((s, i) => ({ s, x: 40, y: 150 - i * 12, size: 8 }))],
      fields: [
        { name: 'COMMONWEALTH_CARD', value: 'THE COMMONWEALTH OF MASSACHUSETTS', rect: [290, 351, 506, 363], size: 8, bold: true, align: 'center' },
        { name: 'DPH_PDF_CARD', value: 'DEPARTMENT OF PUBLIC HEALTH', rect: [290, 342, 506, 353], size: 7, align: 'center' },
        { name: 'LICENSE_NAME_CARD', value: 'Registered Nurse License', rect: [290, 332, 506, 343], size: 7, align: 'center' },
        { name: 'licenseeInformation', value: `${MA.name}\n${MA.street}\n${MA.city}`, rect: [376, 280, 514, 325], size: 8 },
        { name: 'licenseeNumberCard', value: 'License #: ' + MA.number, rect: [376, 234, 510, 247], size: 8 },
        { name: 'licenseeExpirationDate', value: 'Expiration Date: ' + MA.exp, rect: [376, 222, 510, 234], size: 8 }] }]);
}
const css = `body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111}#card{width:1056px;height:816px;position:relative;box-sizing:border-box;padding:30px 60px;border:6px double #8a8a8a}
.ban{color:#b00;font-weight:bold;text-align:center;font-size:16px;letter-spacing:1px}.c{text-align:center}.h1{font-size:30px;font-weight:bold;margin-top:18px}.h2{font-size:22px}.p{font-size:19px;margin:26px 80px;text-align:center;line-height:1.4}
.nm{font-size:40px;font-weight:bold;margin:40px 0}.k{font-size:20px;margin:8px 0}.foot{position:absolute;bottom:26px;left:60px;right:60px;font-size:13px;color:#333}`;
function maHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="card"><div class="ban">${BANNER}</div>
  <div class="c h1">THE COMMONWEALTH OF MASSACHUSETTS</div><div class="c h2">DEPARTMENT OF PUBLIC HEALTH</div><div class="c h2">Registered Nurse License</div>
  <div class="p">The Board of Registration in Nursing, in accordance with the provision of Massachusetts General Laws, issues the license of Registered Nurse:</div>
  <div class="c nm">${MA.name}</div><div class="k">License Number: ${MA.number}</div><div class="k" style="margin-top:50px">Example Director, BSN RN<br>Executive Director, Board of Registration in Nursing</div>
  <div class="k" style="margin-top:24px">Expiration Date: ${MA.exp}</div></div></body></html>`;
}
const STATES = [
  { slug: 'wa', truth: { holder_name: 'Jordan Samplewood', credential_id: 'RN00000123', jurisdiction: 'US-WA', issued_on: '2024-02-14', expires_on: '2027-02-14' },
    lines: ['STATE OF WASHINGTON', 'DEPARTMENT OF HEALTH', 'Nursing Care Quality Assurance Commission', 'Registered Nurse License', 'Name: Jordan Samplewood', 'Credential Number: RN00000123', 'Issue Date: 02/14/2024', 'Expiration Date: 02/14/2027', 'Mailing address: 45 Oregon Ave, Portland, OR 97000'] },
  { slug: 'tx', truth: { holder_name: 'Casey Exampleton', credential_id: '000123456', jurisdiction: 'US-TX', multistate: 'multistate', issued_on: '2023-07-01', expires_on: '2027-06-30' },
    lines: ['Texas Board of Nursing', 'Registered Nurse - Multistate License', 'Licensee: Casey Exampleton', 'License Number: 000123456', 'Original License Date: 07/01/2023', 'Expiration Date: 06/30/2027', '78 Maine Street, Augusta, ME 04330'] },
  { slug: 'fl', truth: { holder_name: 'Riley Testperson', credential_id: 'RN9990001', jurisdiction: 'US-FL', multistate: 'single-state', expires_on: '2026-04-30' },
    lines: ['Florida Board of Nursing', 'Department of Health', 'Registered Nurse', 'Name: Riley Testperson', 'License No: RN9990001', 'Single-State License', 'Expires: 04/30/2026', '9 Virginia Rd, Arlington, VA 22000'] },
  { slug: 'ny', truth: { holder_name: 'Morgan Fakely', credential_id: '000999888', jurisdiction: 'US-NY', issued_on: '2022-09-01', expires_on: '2028-08-31' },
    lines: ['THE UNIVERSITY OF THE STATE OF NEW YORK', 'Education Department - Office of the Professions', 'Registered Professional Nurse', 'This is to certify that Morgan Fakely', 'is licensed to practice as a Registered Professional Nurse', 'License No. 000999888', 'Date of registration: 09/01/2022', 'Registered through: 08/31/2028', '12 Georgia Ln, Example, NJ 07000'] },
  { slug: 'ca', truth: { holder_name: 'Avery Specimen', credential_id: '95000123', jurisdiction: 'US-CA', issued_on: '2025-01-15', expires_on: '2027-01-31' },
    lines: ['California Board of Registered Nursing', 'Registered Nurse', 'Name: Avery Specimen', 'License Number: 95000123', 'Issue Date: 01/15/2025', 'Expiration Date: 01/31/2027', 'Address of record: 500 Washington Blvd, Nowhere, NV 89000'] }];
function stateHtml(s) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}.l{font-size:21px;margin:12px 0}</style></head><body><div id="card"><div class="ban">${BANNER}</div>${s.lines.map((l, i) => `<div class="l${i < 2 ? ' c h2' : ''}">${l}</div>`).join('')}</div></body></html>`;
}
/* v14.4: NIHSS certificates (all values FAKE). The AHA/ASA-style layout prints the value ABOVE
   its label ("IPA24…   Mar 7, 2024" over "Certificate Number   Date Completed") and a footer
   form code ("QX-0101 PART1 9/19 © 2019 …") right under the labels: the decoy. */
const NIHSS = [
  { slug: 'nihss-aha', truth: { holder_name: 'Testa Fakename', credential_id: 'IPA24Z9QbXY00001', course: 'NIHSS', issued_on: '2024-03-07' }, group: 'C', source: 'aha-asa-nihss',
    html: `<div class="c h1">Certificate</div><div class="c h2">of Completion</div><div class="c nm">Testa Fakename</div><div class="c k">has successfully completed</div><div class="c h2" style="margin-top:20px">NIH Stroke Scale – Test Group C</div>
    <table style="width:100%;margin-top:90px;font-size:20px"><tr><td style="text-align:center">IPA24Z9QbXY00001</td><td style="text-align:center">Mar 7, 2024</td></tr><tr><td style="text-align:center;font-size:15px">Certificate Number</td><td style="text-align:center;font-size:15px">Date Completed</td></tr></table>
    <div style="position:absolute;bottom:40px;left:60px;font-size:12px">QX-0101 PART1 9/19 © 2019 American Heart Association</div>` },
  { slug: 'nihss-apex', truth: { holder_name: 'Jordan Samplewood', credential_id: '99000777', course: 'NIHSS', issued_on: '2025-03-14', expires_on: '2026-03-14' }, group: 'A', module: 'initial', source: 'apex-nihss', expired: true,
    html: `<div class="c h1">NIH Stroke Scale Certification</div><div class="c h2">Apex Innovations</div><div class="c k">This certifies that</div><div class="c nm">Jordan Samplewood</div><div class="c k">has completed the NIHSS Initial Certification, Patient Group A</div>
    <div class="k" style="margin-top:40px">Test Date: 03/14/2025</div><div class="k">Expiration Date: 03/14/2026</div><div class="k" style="text-align:right">Test ID: 99000777</div><div style="position:absolute;bottom:40px;left:60px;font-size:12px">AB-12 rev 3</div>` },
  { slug: 'nihss-none', truth: { holder_name: 'Riley Testperson', credential_id: 'NX55500012', course: 'NIHSS', issued_on: '2025-06-02' }, group: null, source: null,
    html: `<div class="c h1">Certificate of Completion</div><div class="c nm">Riley Testperson</div><div class="c k">has successfully completed the NIH Stroke Scale training</div><div class="k" style="margin-top:40px">Certificate ID: NX55500012</div><div class="k">Date Completed: 06/02/2025</div>` }];
function nihssHtml(n) { return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="card"><div class="ban">${BANNER}</div>${n.html}</div></body></html>`; }
/* CCRN-style certificate (synthetic): the number has no "Number" label; it sits on the
   same line as the issuer's verification address. A decoy unlabelled number sits elsewhere. */
const CCRN = { name: 'Testa Fakename', number: '1234567890', decoy: '5550001112', since: '3/1/2025', through: '2/28/2028', sinceIso: '2025-03-01', throughIso: '2028-02-28' };
function ccrnPdf({ verifyLine = true } = {}) {
  const T = (s, x, y, size = 12, bold) => ({ s, x, y, size, bold });
  return buildPdf([{ text: [T(BANNER, 230, 590, 10, true), T(CCRN.decoy, 680, 570, 8),
    T('AACN Certification Corporation hereby grants CCRN certification to', 200, 430),
    T(CCRN.name, 330, 395, 20, true), T('in recognition of successful completion of all', 260, 360), T('requirements for certification in', 290, 345),
    T('Acute/Critical Care Nursing', 280, 310, 16), T('Adult', 370, 290, 14), T('Certified since ' + CCRN.since, 330, 260, 10), T('Certified through ' + CCRN.through, 325, 245, 10),
    ...(verifyLine ? [T('aacn.org/verify', 180, 60, 8), T(CCRN.number, 640, 60, 8)] : [])] }]);
}
async function generate(browser, dir = '/tmp/p144-fixtures') {
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  const maTruth = { holder_name: MA.name, credential_id: MA.number, jurisdiction: 'US-MA', expires_on: MA.expIso };
  const formPath = path.join(dir, 'ma-form.pdf'); fs.writeFileSync(formPath, maFormPdf());
  out.push({ id: 'ma-form.pdf', file: formPath, mime: 'application/pdf', truth: maTruth, method: 'PDF_TEXT', noIssue: true, noMulti: true });
  const pg = await browser.newPage(); await pg.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  await pg.setContent(maHtml(), { waitUntil: 'load' });
  const png = await (await pg.$('#card')).screenshot({ encoding: 'base64' });
  const pngPath = path.join(dir, 'ma-cert.png'); fs.writeFileSync(pngPath, Buffer.from(png, 'base64'));
  out.push({ id: 'ma-cert.png', file: pngPath, mime: 'image/png', truth: maTruth, method: 'IMAGE_OCR', noIssue: true, noMulti: true });
  /* flattened: the certificate as a 2× image (a 192-dpi scan), plus a real text layer holding only the footer */
  await pg.setViewport({ width: 1100, height: 900, deviceScaleFactor: 2 }); await pg.setContent(maHtml(), { waitUntil: 'load' });
  const png2x = await (await pg.$('#card')).screenshot({ encoding: 'base64' }); await pg.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  await pg.setContent(`<html><body style="margin:0"><img src="data:image/png;base64,${png2x}" style="width:1056px;display:block"><div style="font:9px Arial;padding:4px 20px">${FOOTER.join(' ')}</div></body></html>`, { waitUntil: 'load' });
  const flat = path.join(dir, 'ma-flat-thin-text.pdf'); await pg.pdf({ path: flat, width: '1056px', height: '880px', printBackground: true });
  out.push({ id: 'ma-flat-thin-text.pdf', file: flat, mime: 'application/pdf', truth: maTruth, method: 'PDF_OCR', noIssue: true, noMulti: true });
  for (const s of STATES) {
    await pg.setContent(stateHtml(s), { waitUntil: 'load' });
    const pdf = path.join(dir, s.slug + '-text.pdf'); await pg.pdf({ path: pdf, width: '1056px', height: '816px', printBackground: true });
    out.push({ id: s.slug + '-text.pdf', file: pdf, mime: 'application/pdf', truth: s.truth, method: 'PDF_TEXT' });
    const p2 = path.join(dir, s.slug + '.png'); fs.writeFileSync(p2, Buffer.from(await (await pg.$('#card')).screenshot({ encoding: 'base64' }), 'base64'));
    out.push({ id: s.slug + '.png', file: p2, mime: 'image/png', truth: s.truth, method: 'IMAGE_OCR' });
  }
  for (const n of NIHSS) {
    await pg.setContent(nihssHtml(n), { waitUntil: 'load' });
    const pdf = path.join(dir, n.slug + '-text.pdf'); await pg.pdf({ path: pdf, width: '1056px', height: '816px', printBackground: true });
    out.push({ id: n.slug + '-text.pdf', file: pdf, mime: 'application/pdf', truth: n.truth, method: 'PDF_TEXT', nihss: n });
    const p2 = path.join(dir, n.slug + '.png'); fs.writeFileSync(p2, Buffer.from(await (await pg.$('#card')).screenshot({ encoding: 'base64' }), 'base64'));
    out.push({ id: n.slug + '.png', file: p2, mime: 'image/png', truth: n.truth, method: 'IMAGE_OCR', nihss: n });
  }
  await pg.close();
  return out;
}
module.exports = { generate, ccrnPdf, CCRN, maFormPdf, MA, STATES, FOOTER, BANNER, NIHSS };
