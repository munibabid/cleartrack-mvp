/* PR 14: "Extraction accuracy" panels.
   - Verification Console (demo): the measured benchmark on synthetic
     documents (js/extraction-benchmark.js) by field, kind and file variant,
     plus "Try a document": scan a file in this browser and see the fields.
   - Account verifier tab (live): statistics from extraction_events (or the
     audit log before migration 9): per-field and per-kind accuracy, the
     auto-ready rate, and how often verifiers found the details matched.
   Only field names, confidences and timings are counted, never content. */
const EXTRACT_FIELD_NAMES={holder_name:'Name',credential_id:'Card / license ID',course:'Credential / course',issued_on:'Issue date',renew_by:'Renewal month',expires_on:'Expiration',jurisdiction:'State',multistate:'Multistate',training_center:'Training center',training_center_id:'Training Center ID'};
const pctV14=x=>x==null||isNaN(x)?'—':(x*100).toFixed(1)+'%';
function accBarV14(x){const p=Math.max(0,Math.min(100,Math.round((x||0)*100)));return`<span class="accbar-v14"><span style="width:${p}%"></span></span>`}
/* Live statistics from event rows (names only). */
function computeExtractionStats(rows){
 const confirms=rows.filter(r=>r.event==='CONFIRM'),checks=rows.filter(r=>r.event==='VERIFIER_CHECK');
 const field={},kind={};
 for(const r of confirms){
  const exp=r.fields_expected||[],found=r.fields_found||[],corr=r.fields_corrected||[];
  for(const f of exp){const s=(field[f]??={n:0,found:0,corrected:0,correct:0});s.n++;if(found.includes(f))s.found++;if(corr.includes(f))s.corrected++;if(found.includes(f)&&!corr.includes(f))s.correct++}
  const k=(kind[r.kind]??={n:0,fields:0,correct:0,autoReady:0,mismatch:0,ms:[]});k.n++;k.fields+=exp.length;k.correct+=exp.filter(f=>found.includes(f)&&!corr.includes(f)).length;
  const ready=exp.every(f=>found.includes(f))&&!corr.length&&!(r.mismatches||[]).length;if(ready)k.autoReady++;if((r.mismatches||[]).length)k.mismatch++;if(r.scan_ms)k.ms.push(r.scan_ms);
 }
 const vc={n:checks.length,matched:checks.filter(r=>!(r.fields_corrected||[]).length).length,fieldsChecked:0,fieldsMatched:0};
 for(const r of checks){vc.fieldsChecked+=(r.fields_confirmed||[]).length+(r.fields_corrected||[]).length;vc.fieldsMatched+=(r.fields_confirmed||[]).length}
 const all=confirms.length,autoReady=Object.values(kind).reduce((a,k)=>a+k.autoReady,0),mism=Object.values(kind).reduce((a,k)=>a+k.mismatch,0);
 const ms=confirms.map(r=>r.scan_ms).filter(Boolean).sort((a,b)=>a-b),cms=confirms.map(r=>r.confirm_ms).filter(Boolean).sort((a,b)=>a-b);
 return{scans:all,autoReady,autoReadyRate:all?autoReady/all:null,mismatches:mism,field,kind,verifier:vc,medianScanMs:ms[Math.floor(ms.length/2)]||null,medianConfirmMs:cms[Math.floor(cms.length/2)]||null};
}
function liveStatsHtml(st,from){
 const kl=k=>catalogKind(k)?.short||catalogKind(k)?.label||k;
 if(!st.scans&&!st.verifier.n)return`<div class="small" id="acctAccEmptyV14">No confirmed scans yet. Numbers appear once nurses scan documents and confirm the details.</div>`;
 return`<div class="metrics-v81"><div class="metric-v81"><span>Scans confirmed</span><b id="accScansV14">${st.scans}</b></div><div class="metric-v81"><span>Auto-ready (all fields read, no correction, no mismatch)</span><b id="accAutoV14">${pctV14(st.autoReadyRate)}</b></div><div class="metric-v81"><span>Verifier found details matched the source</span><b id="accVerV14">${st.verifier.n?pctV14(st.verifier.matched/st.verifier.n):'—'}</b><small class="small">${st.verifier.n} checks</small></div><div class="metric-v81"><span>Mismatches flagged</span><b>${st.mismatches}</b></div></div>
 <table class="v81-table" id="accFieldTableV14"><tr><th>Field</th><th>Expected</th><th>Read</th><th>Corrected by nurse</th><th>Accuracy</th></tr>${Object.entries(st.field).map(([f,s])=>`<tr><td>${ec(EXTRACT_FIELD_NAMES[f]||f)}</td><td>${s.n}</td><td>${s.found}</td><td>${s.corrected}</td><td>${accBarV14(s.correct/s.n)} ${pctV14(s.correct/s.n)}</td></tr>`).join('')}</table>
 <table class="v81-table" id="accKindTableV14"><tr><th>Credential kind</th><th>Scans</th><th>Field accuracy</th><th>Auto-ready</th><th>Median read time</th></tr>${Object.entries(st.kind).map(([k,s])=>`<tr><td>${ec(kl(k))}</td><td>${s.n}</td><td>${pctV14(s.fields?s.correct/s.fields:null)}</td><td>${pctV14(s.autoReady/s.n)}</td><td>${s.ms.length?(s.ms.sort((a,b)=>a-b)[Math.floor(s.ms.length/2)]/1000).toFixed(1)+' s':'—'}</td></tr>`).join('')}</table>
 <div class="small">Median read time ${st.medianScanMs?(st.medianScanMs/1000).toFixed(1)+' s':'—'} · median time to confirm ${st.medianConfirmMs?(st.medianConfirmMs/1000).toFixed(0)+' s':'—'}. Source: ${from==='extraction_events'?'extraction_events table':'audit log (extraction_events table not deployed yet)'}. Accuracy = fields read and kept unchanged by the nurse ÷ fields the credential type needs. Only field names, confidences and timings are recorded, never document content.</div>`;
}
/* Benchmark tables (demo console and account panel). */
function benchmarkHtml(b){
 if(!b)return'<div class="small">No benchmark file.</div>';
 return`<div class="metrics-v81"><div class="metric-v81"><span>Synthetic documents</span><b id="benchDocsV14">${b.documents}</b></div><div class="metric-v81"><span>Every needed field right, no correction</span><b id="benchAllV14">${b.allRequired}/${b.documents}</b><small class="small">${pctV14(b.allRequired/b.documents)} would be auto-ready</small></div><div class="metric-v81"><span>Kinds covered</span><b>${b.kinds?.length||1}</b></div></div>
 <table class="v81-table" id="benchFieldV14"><tr><th>Field</th><th>Correct</th><th>Read but wrong</th><th>Not found</th><th>Accuracy</th></tr>${Object.entries(b.fields).map(([f,s])=>`<tr><td>${ec(EXTRACT_FIELD_NAMES[f]||f)}${f==='training_center'?' <span class="small">(optional)</span>':''}</td><td>${s.correct}/${s.n}</td><td>${s.wrong}</td><td>${s.n-s.found}</td><td>${accBarV14(s.accuracy)} ${pctV14(s.accuracy)}</td></tr>`).join('')}</table>
 ${b.kinds?`<table class="v81-table" id="benchKindV14"><tr><th>Credential kind</th><th>Documents</th><th>All fields right</th><th>Field accuracy</th><th>Median time</th></tr>${b.kinds.map(k=>`<tr><td>${ec(k.label)}</td><td>${k.n}</td><td>${k.allRequired}/${k.n}</td><td>${accBarV14(k.accuracy)} ${pctV14(k.accuracy)}</td><td>${(k.medianMs/1000).toFixed(1)} s</td></tr>`).join('')}</table>`:''}
 <table class="v81-table" id="benchVariantV14"><tr><th>File</th><th>Documents</th><th>All fields right</th><th>Field accuracy</th><th>Median time</th></tr>${b.variants.map(v=>`<tr><td>${ec(v.variant)}</td><td>${v.n}</td><td>${v.allRequired}/${v.n}</td><td>${pctV14(v.accuracy??v.fieldsCorrect/v.fieldsTotal)}</td><td>${(v.medianMs/1000).toFixed(1)} s</td></tr>`).join('')}</table>
 <div class="small">Measured ${ec(fmtDT(b.generated))}. ${ec(b.note)}</div>`;
}
/* Demo console panel. */
let tryStatsV14={n:0,fields:0,found:0};
function renderExtractionPanelV14(){
 const el=$('verifyExtractBodyV14');if(!el||el.dataset.ready)return;el.dataset.ready='1';
 const kinds=CREDENTIAL_CATALOG.filter(k=>k.kind!=='OTHER');
 el.innerHTML=`<p class="small">Veridun reads credential documents <b>on the device</b> (pdf.js for PDF text, Tesseract.js OCR for scans and photos, a QR reader for eCard QR codes). Nothing goes to an AI service. The nurse confirms or corrects each field; a scan never verifies anything. These numbers are measured on synthetic documents with fake names and IDs.</p>
 <div id="benchWrapV14">${benchmarkHtml(window.EXTRACTION_BENCHMARK)}</div>
 <div class="panel-v81" style="margin-top:12px"><div class="ph">Try a document <span class="demo-tag-v81">READ IN THIS BROWSER · NOTHING SAVED</span></div><div class="pb">
 <div class="grid2-v83"><label>Credential type<select id="tryKindV14">${kinds.map(k=>`<option value="${k.kind}"${k.kind==='CERT_BLS'?' selected':''}>${ec(k.label)}</option>`).join('')}</select></label>
 <label>Document (PDF, PNG, JPEG)<input type="file" id="tryFileV14" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></label></div>
 <div id="tryOutV14" class="small">Use a synthetic or test document. Real cards stay on this device either way.</div></div></div>`;
 $('tryFileV14').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;const out=$('tryOutV14'),kind=$('tryKindV14').value;
  out.innerHTML='<div class="scan-bar-v14"><div style="width:5%"></div></div><div id="tryLabelV14">Starting</div>';
  try{
   const r=await DocExtract.extractFromFile(f,{kind,onProgress:x=>{const l=$('tryLabelV14'),b=out.querySelector('.scan-bar-v14 div');if(l)l.textContent=x.label;if(b)b.style.width=Math.round((x.progress||0)*100)+'%'}});
   if(!r.supported){out.textContent=r.warnings[0];return}
   tryStatsV14.n++;tryStatsV14.fields+=r.fieldsWanted.length;tryStatsV14.found+=r.fieldsWanted.filter(k=>r.fields[k]).length;
   const exp=DocExtract.documentExpiry(r.fields,r.issuer),src=r.source&&verificationSource(r.source.id);
   out.innerHTML=`<div class="scan-v14" id="tryResultV14"><div><b>${ec(catalogKind(kind)?.short||kind)}</b> · ${ec(r.method)} · ${(r.ms/1000).toFixed(1)} s${r.rotated?' · turned '+r.rotated+'°':''}${r.qrFound?' · QR read':''}</div>
   <table class="v81-table">${r.fieldsWanted.map(k=>{const x=r.fields[k];return`<tr><td>${ec(EXTRACT_FIELD_NAMES[k]||k)}</td><td>${x?ec(x.value):'<i>not found</i>'}</td><td>${x?scanConfChip(x.conf):''}</td></tr>`}).join('')}</table>
   ${exp?`<div>${ec(exp.text)}</div>`:''}${r.warnings.map(w=>`<div class="notice">${ec(w)}</div>`).join('')}
   <div>Verification source for this kind: <b>${ec(src?.name||'—')}</b>${src?.lookupUrl?` · <a href="${ec(src.lookupUrl)}" target="_blank" rel="noopener">official lookup</a>`:''}</div>
   <div>This session: ${tryStatsV14.n} document(s), ${tryStatsV14.found}/${tryStatsV14.fields} needed fields found. Nothing was uploaded or saved.</div></div>`;
  }catch(err){out.textContent=DocExtract.friendlyError(err)}
 };
}
/* Account verifier tab: live panel. */
let acctAccStatsV14=null;
function acctAccuracyPanelHtml(){
 return`<div class="panel-v81" id="acctAccuracyV14"><div class="ph"><span>Extraction accuracy</span><button class="mini sec" type="button" data-act="acc-load">${acctAccStatsV14?'Refresh':'Load'}</button></div><div class="pb" id="acctAccBodyV14">${acctAccStatsV14?liveStatsHtml(acctAccStatsV14.st,acctAccStatsV14.from):'<div class="small">Live numbers from nurses\' confirmed scans and your double-checks. Press Load.</div>'}
 <details class="why-v13"><summary>Benchmark on synthetic documents</summary>${benchmarkHtml(window.EXTRACTION_BENCHMARK)}</details></div></div>`;
}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-act="acc-load"]');if(!b)return;
 acctDo(async()=>{const r=await acct().extractionStats();acctAccStatsV14={from:r.from,st:computeExtractionStats(r.rows)};const box=$('acctAccuracyV14');if(box)box.outerHTML=acctAccuracyPanelHtml()});
});
if(typeof module!=='undefined'&&module.exports)module.exports={computeExtractionStats};
