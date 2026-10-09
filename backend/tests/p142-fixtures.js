/* v14.2: synthetic AHA/RQI-style cards for "Training Center ID vs eCard code".
   Label wording follows AHA's public Course Card Reference Guide and eCard
   security sample ("Training Center Name", "Training Center ID" / "TC ID",
   "TC City, State", "Training Site Name", "Instructor Name", "Instructor ID",
   "eCard Code", issue date MM/DD/YYYY, recommended renewal MM/YYYY). Every
   person, ID and code here is FAKE and each card says "SYNTHETIC TEST CARD".
   No AHA logo or artwork. Variants: text PDF, clean scanned PDF (image only),
   clean PNG, phone-photo JPEG. */
const fs = require('fs');
const path = require('path');
const pad = n => String(n).padStart(2, '0');
const mdy = iso => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
const renew = iso => { const [y, m] = iso.split('-').map(Number); return `${pad(m)}/${y + 2}`; };
const BASE = { name: 'Testa Fakename', course: 'BLS', issued: '2026-06-03', tcName: 'Example Valley Education Center', tcId: 'CA00001', city: 'Nowhere, CA', phone: '(555) 010-0100', site: 'Example Site North', instr: 'Example Instructor', instrId: '02150000099' };
const CASES = [
  { slug: 'tc-table', layout: 'table', code: '261100000017', note: 'both present, label | value rows (wallet-card back)' },
  { slug: 'tc-header', layout: 'header', code: '261100000025', note: 'both present, column headers with the values beneath (TC ID first)' },
  { slug: 'tc-only', layout: 'tc-only', code: null, note: 'only the Training Center ID is printed, no eCard code, no QR' },
  { slug: 'tc-sepline', layout: 'sepline', code: '261100000033', note: 'eCard code label and value on separate lines, TC ID just above' },
  { slug: 'tc-rqi', layout: 'rqi', code: 'B7KQ2M4X9TR3', rqi: true, note: 'RQI / HeartCode card with a letters-and-digits code and a TC ID' },
  /* v14.3: the current full-page AHA eCard (Munib's real card, rebuilt with fake values):
     two columns of centred labels with the value underneath; left = Issue Date, Training
     Center Name / ID / City, State / Phone Number / Training Site Name; right = Renew By,
     Instructor Name / ID, eCard Code, QR Code; a light-grey watermark behind the right column;
     issue date as M/D/YYYY; the eCard code starts with 27 although the card was issued in 2026. */
  { slug: 'tc-2col', layout: '2col', code: '271100000056', page: true, tcName: 'Example Permanente Education', instr: 'Example Teacher', instrId: '24000000017', tcId: 'CA00002', issuedText: '6/3/2026', note: 'current full-page AHA eCard: two columns, label above value, watermark' }
];
function row(l, v) { return `<tr><td>${l}</td><td><b>${v}</b></td></tr>`; }
function backHtml(p, c) {
  if (c.layout === 'table' || c.layout === 'tc-only' || c.layout === 'rqi')
    return `<table>${row('Training Center Name', p.tcName)}${row(c.layout === 'rqi' ? 'TC ID' : 'Training Center ID', p.tcId)}${row('TC City, State', p.city)}${row('TC Phone', p.phone)}${row('Training Site Name', p.site)}${row('Instructor Name', p.instr)}${row('Instructor ID', p.instrId)}${c.code ? row('eCard Code', c.code) : ''}</table>`;
  if (c.layout === 'header')
    return `<table class="hdr"><tr><td>Training Center Name</td><td>Training Site Name</td></tr><tr><td><b>${p.tcName}</b></td><td><b>${p.site}</b></td></tr>
      <tr><td>Training Center ID</td><td>Instructor ID</td><td>eCard Code</td></tr><tr><td><b>${p.tcId}</b></td><td><b>${p.instrId}</b></td><td><b>${c.code}</b></td></tr></table>`;
  return `<div class="stack"><div>Training Center Name</div><div><b>${p.tcName}</b></div><div>Training Center ID</div><div><b>${p.tcId}</b></div><div>Instructor ID</div><div><b>${p.instrId}</b></div><div>eCard Code</div><div><b>${c.code}</b></div></div>`;
}
function pageHtml(c) {
  const p = BASE, L = (l, v) => `<div class="f"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111}
  .page{width:816px;height:1056px;position:relative;overflow:hidden;background:#fff}
  .card{position:absolute;left:64px;top:58px;width:662px;height:714px;border:1px solid #ddd;border-top:14px solid #b5d56a;overflow:hidden}
  .wm{position:absolute;left:300px;top:150px;width:520px;height:700px;background:#ececec;border-radius:48% 40% 0 0}
  .wm2{position:absolute;left:390px;top:330px;width:150px;height:420px;background:#fff;border-radius:50% 50% 0 0;transform:rotate(-14deg)}
  .tab{position:absolute;left:50px;top:-14px;background:#0b5cba;color:#fff;font:bold 28px Arial;letter-spacing:3px;padding:14px 26px;border-radius:0 0 18px 18px}
  .title{position:absolute;left:76px;top:100px;color:#0b5cba;font:bold 30px Arial;line-height:30px}
  .org{position:absolute;left:500px;top:110px;font:bold 15px Arial;line-height:15px}
  .syn{position:absolute;left:0;right:0;top:66px;text-align:center;color:#b91c1c;font:bold 11px Arial;letter-spacing:1px}
  .name{position:absolute;left:0;right:0;top:225px;text-align:center;font:bold 16px Arial}
  .stmt{position:absolute;left:60px;right:60px;top:252px;text-align:center;font:bold 15px Arial;line-height:17px}
  .col{position:absolute;top:345px;width:260px;text-align:center}.col.l{left:36px}.col.r{left:368px;top:340px}
  .f{margin-bottom:12px}.f .l{font:bold 15px Arial}.f .v{font:12px Arial;margin-top:6px;min-height:14px}
  .qr{width:66px;height:66px;margin:4px auto 0}
  .foot{position:absolute;left:0;right:0;top:680px;text-align:center;font:9px Arial}
  </style></head><body><div class="page" id="card"><div class="card"><div class="wm"></div><div class="wm2"></div>
  <div class="tab">BASIC LIFE SUPPORT</div><div class="syn">SYNTHETIC TEST CARD · NOT A REAL eCARD</div>
  <div class="title">BLS<br>Provider</div><div class="org">Example Heart<br>Organization (synthetic)</div>
  <div class="name">${p.name}</div>
  <div class="stmt">has successfully completed the cognitive and skills evaluations<br>in accordance with the curriculum of the American Heart Association<br>Basic Life Support (CPR and AED) Program.</div>
  <div class="col l">${L('Issue Date', c.issuedText)}${L('Training Center Name', c.tcName)}${L('Training Center ID', c.tcId)}${L('Training Center City, State', p.city)}${L('Training Center Phone<br>Number', p.phone)}${L('Training Site Name', '')}</div>
  <div class="col r">${L('Renew By', renew(p.issued))}${L('Instructor Name', c.instr)}${L('Instructor ID', c.instrId)}${L('eCard Code', c.code)}<div class="f"><div class="l">QR Code</div><img class="qr" src="${c.qr || ''}"></div></div>
  <div class="foot">To view or verify authenticity, students and employers should scan this QR code with their mobile device or go to www.heart.org/cpr/mycards.<br>Synthetic fixture for Veridun tests.</div>
  </div></div></body></html>`;
}
function cardHtml(c) {
  if (c.layout === '2col') return pageHtml(c);
  const p = BASE;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
  .card{width:1000px;padding:28px 36px;box-sizing:border-box;border:2px solid #b91c1c;border-radius:14px;position:relative}
  .wm{position:absolute;top:10px;right:16px;font-size:13px;color:#b91c1c;font-weight:bold;letter-spacing:1px}
  h1{font-size:44px;margin:18px 0 6px;color:#b91c1c}.name{font-size:30px;font-weight:bold;margin:14px 0}
  .txt{font-size:16px;line-height:1.45;max-width:880px}.dates{display:flex;gap:120px;margin-top:22px;font-size:20px}
  .dates .v{font-weight:bold}.dates .l{font-size:14px;color:#444;margin-top:4px}
  .back{margin-top:26px;border-top:1px dashed #999;padding-top:16px}
  table{font-size:17px;border-collapse:collapse}td{padding:5px 48px 5px 0}td:first-child{color:#333}
  .hdr td{color:#111}.stack{font-size:17px;line-height:1.7}
  .foot{font-size:11px;color:#555;margin-top:12px}
  </style></head><body><div class="card" id="card"><div class="wm">SYNTHETIC TEST CARD · NOT A REAL eCARD</div>
  <div style="font-size:15px;font-weight:bold;letter-spacing:2px">AMERICAN HEART ASSOCIATION${c.rqi ? ' · RQI HEARTCODE COMPLETE' : ''}</div>
  <h1>${p.course} Provider</h1><div class="name">${p.name}</div>
  <div class="txt">has successfully completed the cognitive and skills evaluations in accordance with the curriculum of the American Heart Association Basic Life Support (CPR and AED) Program.</div>
  <div class="dates"><div><div class="v">${mdy(p.issued)}</div><div class="l">Issue Date</div></div><div><div class="v">${renew(p.issued)}</div><div class="l">Recommended Renewal Date</div></div></div>
  <div class="back">${backHtml(p, c)}</div>
  <div class="foot">To view or verify authenticity, employers can go to heart.org/cpr/mycards${c.rqi ? ' (codes with letters: heart.org/RQIverify)' : ''}. Synthetic fixture for Veridun tests.</div>
  </div></body></html>`;
}
async function photo(page, pngB64, { rotate = 1.5, noise = 14, quality = 0.85, seed = 3 } = {}) {
  return page.evaluate(async (b64, o) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const rad = o.rotate * Math.PI / 180, w = img.width, h = img.height;
    const cw = Math.ceil(Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) + 40, ch = Math.ceil(Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))) + 40;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    x.fillStyle = '#f6f3ec'; x.fillRect(0, 0, cw, ch); x.translate(cw / 2, ch / 2); x.rotate(rad); x.drawImage(img, -w / 2, -h / 2); x.setTransform(1, 0, 0, 1, 0, 0);
    const d = x.getImageData(0, 0, cw, ch); let s = o.seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < d.data.length; i += 4) { const n = (rnd() - 0.5) * o.noise; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
    x.putImageData(d, 0, 0); return c.toDataURL('image/jpeg', o.quality).split(',')[1];
  }, pngB64, { rotate, noise, quality, seed });
}
async function generate(browser, dir = '/tmp/p142-fixtures') {
  fs.mkdirSync(dir, { recursive: true });
  const util = await browser.newPage(); await util.setContent('<html></html>');
  const out = [];
  for (const c0 of CASES) {
    const c = { ...c0 };
    /* the QR on the real card holds a relay link, not the code: same here (fake link) */
    if (c.page) { await util.addScriptTag({ path: path.join(__dirname, '..', '..', 'js', 'vendor', 'qrcode-1.5.1.js') }).catch(() => {}); c.qr = await util.evaluate(() => window.QRCode ? QRCode.toDataURL('https://example.test/synthetic-relay/0000', { width: 200, margin: 1 }) : ''); }
    const cp = await browser.newPage(); await cp.setViewport({ width: 1080, height: 1100, deviceScaleFactor: 1 });
    await cp.setContent(cardHtml(c), { waitUntil: 'load' });
    const pdf = path.join(dir, c.slug + '-text.pdf'); await cp.pdf({ path: pdf, width: c.page ? '816px' : '1100px', height: c.page ? '1056px' : '1000px', printBackground: true });
    const png = await (await cp.$('#card')).screenshot({ encoding: 'base64' });
    const pngPath = path.join(dir, c.slug + '-clean.png'); fs.writeFileSync(pngPath, Buffer.from(png, 'base64'));
    /* clean scanned PDF: a sharp 2× page image inside a PDF, no text layer (like a phone scanner app) */
    /* full-page cards: 1275×1650 page image (150 dpi), as the real printed-to-PDF eCard */
    await cp.setViewport({ width: 1080, height: 1100, deviceScaleFactor: c.page ? 1.5625 : 2 });
    await cp.setContent(cardHtml(c), { waitUntil: 'load' });
    const png2 = await (await cp.$('#card')).screenshot({ encoding: 'base64' });
    await cp.setViewport({ width: 1080, height: 1100, deviceScaleFactor: 1 });
    await cp.setContent(`<html><body style="margin:0"><img src="data:image/png;base64,${png2}" style="width:${c.page ? 816 : 1000}px"></body></html>`, { waitUntil: 'load' });
    const scan = path.join(dir, c.slug + '-scanned-clean.pdf'); await cp.pdf({ path: scan, width: c.page ? '816px' : '1100px', height: c.page ? '1056px' : '1000px', printBackground: true });
    const jpg = await photo(util, png, { seed: 5 + out.length });
    const jpgPath = path.join(dir, c.slug + '-photo.jpg'); fs.writeFileSync(jpgPath, Buffer.from(jpg, 'base64'));
    await cp.close();
    for (const [variant, file, mime, clean] of [['PDF (text)', pdf, 'application/pdf', true], ['PDF (scanned, clean)', scan, 'application/pdf', true], ['PNG (clean)', pngPath, 'image/png', true], ['JPEG (phone photo)', jpgPath, 'image/jpeg', false]])
      out.push({ ...c, id: path.basename(file), variant, file, mime, clean, truth: { holder_name: BASE.name, course: 'BLS Provider', issued_on: BASE.issued, renew_by: '2028-06', training_center_id: c.tcId || BASE.tcId, credential_id: c.code, ...(c.page ? { training_center: c.tcName } : {}) }, tcId: c.tcId || BASE.tcId, instrId: c.instrId || BASE.instrId });
  }
  await util.close();
  return out;
}
module.exports = { generate, CASES, BASE, cardHtml };
