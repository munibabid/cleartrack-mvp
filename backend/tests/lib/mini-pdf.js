/* v14.4: a tiny PDF writer for synthetic test fixtures (no dependencies).
   Pages hold static text (the PDF text layer) and AcroForm text fields whose values
   live in /V with an /AP appearance, like state-board license printouts that are
   filled-in forms. ASCII only. Used by backend/tests/p144-fixtures.js. */
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
function buildPdf(pages, { width = 792, height = 612 } = {}) {
  const objs = []; const add = s => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const catalog = add(null), pagesObj = add(null);
  const fields = [], kids = [];
  for (const pg of pages) {
    const pageId = add(null);
    const ops = (pg.text || []).map(t => `BT /${t.bold ? 'F2' : 'F1'} ${t.size || 11} Tf ${t.gray != null ? t.gray + ' g ' : '0 g '}${t.x} ${t.y} Td (${esc(t.s)}) Tj ET`);
    for (const r of pg.rects || []) ops.push(`q ${r.gray != null ? r.gray : 0.85} g ${r.x} ${r.y} ${r.w} ${r.h} re f Q`);
    const content = ops.join('\n');
    const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const annots = [];
    for (const f of pg.fields || []) {
      const [x0, y0, x1, y1] = f.rect, w = x1 - x0, h = y1 - y0, size = f.size || 12, lines = String(f.value).split('\n');
      const ap = `/Tx BMC q BT /${f.bold ? 'HelvB' : 'Helv'} ${size} Tf 0 g ` + lines.map((l, i) => `1 0 0 1 ${f.align === 'center' ? Math.max(2, (w - l.length * size * 0.5) / 2).toFixed(1) : 2} ${(h - size * (i + 1) - 1).toFixed(1)} Tm (${esc(l)}) Tj`).join(' ') + ' ET Q EMC';
      const apId = add(`<< /Type /XObject /Subtype /Form /BBox [0 0 ${w} ${h}] /Resources << /Font << /Helv ${font} 0 R /HelvB ${bold} 0 R >> >> /Length ${Buffer.byteLength(ap)} >>\nstream\n${ap}\nendstream`);
      const wid = add(`<< /Type /Annot /Subtype /Widget /FT /Tx /T (${esc(f.name)}) /V (${esc(f.value).replace(/\n/g, '\\n')}) /Rect [${x0} ${y0} ${x1} ${y1}] /F 4 /P ${pageId} 0 R /DA (/Helv ${size} Tf 0 g)${lines.length > 1 ? ' /Ff 4096' : ''} /AP << /N ${apId} 0 R >> >>`);
      annots.push(wid); fields.push(wid);
    }
    objs[pageId - 1] = `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${contentId} 0 R${annots.length ? ` /Annots [${annots.map(a => a + ' 0 R').join(' ')}]` : ''} >>`;
    kids.push(pageId);
  }
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R${fields.length ? ` /AcroForm << /Fields [${fields.map(f => f + ' 0 R').join(' ')}] /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${font} 0 R /HelvB ${bold} 0 R >> >> >>` : ''} >>`;
  let out = '%PDF-1.6\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
module.exports = { buildPdf };
