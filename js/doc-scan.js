/* PR 14: document scanning UI for the account Passport (add form and
   "Re-scan document" on saved credentials) and the verifier's accuracy panel.
   Reading happens in this browser through DocExtract (js/doc-extract.js).
   A scan never verifies anything: confirmed details become
   "Details captured, awaiting verification". */
let acctScan=null;/* {target:'add'|credentialId, kind, status, label, progress, res, values, orig, confirmed, applyExpiry, t0, doneAt} */
const SCAN_STATUS_TEXT='Details captured, awaiting verification';
const SCANNABLE=f=>!!f&&(/^(application\/pdf|image\/(png|jpe?g|webp))$/i.test(f.type||'')||/\.(pdf|png|jpe?g|webp)$/i.test(f.name||''));
function scanConfChip(c,found=true){
 if(!found)return'<span class="conf-v14 conf-none">not found · type it</span>';
 const p=Math.round(c*100),cls=c>=0.9?'hi':c>=0.7?'mid':'lo';
 return`<span class="conf-v14 conf-${cls}" title="How sure the reader is about this field">${p}% · ${c>=0.9?'high':c>=0.7?'check it':'low, check it'}</span>`;
}
function scanIdLabel(res){if(!res)return'ID';if(res.profile==='aha_resus')return res.issuer==='RED_CROSS'?'Certificate ID':res.issuer==='AHA_RQI'?'RQI eCard code':'eCard code';return DocExtract.ID_LABELS[res.profile]||'ID'}
/* v14.7: which date this is depends on the credential family. Licenses get only an issue date
   (if printed), never a completion date; completion dates are for NIHSS, skills checklists and
   courses. A date the document labels otherwise (e.g. "Effective") keeps its printed label. */
function scanIsLicenseKind(kind){const k=typeof catalogKind==='function'?catalogKind(kind):null;return!!k&&(k.category==='Licenses'||/LICENSE|^LPN|^LVN/.test(k.kind))}
function scanKind(){return acctScan?(acctScan.target==='add'?scanContext().kind||acctScan.kind:acctScan.kind):null}
const SCAN_PLAIN_ISSUE=/^(?:date\s+(?:of\s+)?)?(?:issue|issued)(?:\s+date)?$/i;
function scanIssueDateLabel(res,kind=scanKind()){
 if(res?.profile==='dates_only')return'Date on the record (test / completion)';
 const raw=res?.fields?.issued_on?.label;
 if(scanIsLicenseKind(kind)||res?.profile==='license')return raw&&!SCAN_PLAIN_ISSUE.test(raw)?`Date printed as “${raw}” (if printed on the document)`:'Issue date (if printed on the document)';
 if(kind==='CERT_NIHSS'||/^SKILLS_/.test(kind||''))return'Completion date';
 if(/\bcourse\b/i.test(catalogKind(kind)?.label||''))return'Issue / completion date';
 return raw&&!SCAN_PLAIN_ISSUE.test(raw)&&!/complet/i.test(raw)?`Date printed as “${raw}”`:'Issue date';
}
const SCAN_LICENSE_ISSUE_NOTE='The original issue date may differ from the date on this card, which can show the latest renewal. Not required. The verifier confirms the original issue date with the state board during verification.';
function scanFieldLabel(k,res){
 if(k==='credential_id')return scanIdLabel(res);
 if(k==='issued_on')return scanIssueDateLabel(res);
 if(k==='expires_on'&&res?.profile==='dates_only')return'Next due / expires';
 return DocExtract.FIELD_LABEL[k]||k;
}
function scanInput(k,v){
 const a=`class="scan-field-v14" data-scan-field="${k}" id="acctScanF-${k}"`;
 if(k==='issued_on'||k==='expires_on')return`<input type="date" ${a} value="${ec(v||'')}">`;
 if(k==='renew_by')return`<input type="month" ${a} value="${ec(v||'')}">`;
 if(k==='multistate')return`<select ${a}>${acctOptions([['multistate','Multistate (compact)'],['single-state','Single-state']],v||'','Not shown')}</select>`;
 if(k==='jurisdiction')return`<select ${a}>${acctOptions(US_JURISDICTIONS.map(j=>[j.code,j.name]),v||'','Not shown')}</select>`;
 return`<input ${a} value="${ec(v||'')}" maxlength="120" autocomplete="off">`;
}
/* What the nurse entered (add form) or saved (existing credential). */
function scanContext(){
 const a=acct(),p=a?.cache?.profile;
 if(!acctScan)return{};
 if(acctScan.target==='add'){
  const kind=(typeof acctLicenseKind==='function'&&acctLicenseKind())||$('acctKindV10')?.value||acctScan.kind;
  return{kind,expires_on:$('acctExpV10')?.value||'',jurisdiction:$('acctJurV10')?.value||'',profileName:p?.full_name||'',compactPrivilegeType:typeof acctLicenseScope==='function'?acctLicenseScope():null};
 }
 const c=a.cache.credentials.find(x=>x.id===acctScan.target);
 return{kind:c?.kind,expires_on:acctScan.applyExpiry?acctScan.docExpiry:(c?.expires_on||''),jurisdiction:c?.jurisdiction_code||'',profileName:p?.full_name||'',compactPrivilegeType:licenseScopeOf(c)};
}
function scanValuesForCompare(){
 const v={...acctScan.values},r=acctScan.res;
 if(r?.fields?.expires_on?.monthOnly&&v.expires_on===r.fields.expires_on.value)v.expires_month_only=r.fields.expires_on.monthOnly;
 if(r?.fields?.renew_by?.exact&&v.renew_by===r.fields.renew_by.value)v.renew_exact=r.fields.renew_by.exact;
 return v;
}
function scanMismatches(){
 if(!acctScan||acctScan.status!=='done'||!acctScan.res?.supported)return[];
 const ctx=scanContext();
 return DocExtract.compareToEntered(scanValuesForCompare(),{kind:ctx.kind,expires_on:ctx.expires_on||null,profileName:ctx.profileName,issuer:acctScan.res.issuer,jurisdiction:ctx.jurisdiction,compactPrivilegeType:ctx.compactPrivilegeType,trainingCenterId:acctScan.res.fields?.training_center_id?.value||null});
}
function scanDocExpiry(){
 if(!acctScan?.res)return null;const v=scanValuesForCompare();
 return DocExtract.documentExpiry({expires_on:v.expires_on?{value:v.expires_on,monthOnly:v.expires_month_only||null}:null,renew_by:v.renew_by?{value:v.renew_by,exact:v.renew_exact}:null},acctScan.res.issuer);
}
function scanMismatchHtml(){
 const add=acctScan?.target==='add',ms=scanMismatches().filter(m=>!(add&&(m.field==='expires_on'||m.field==='multistate'))),hard=ms.filter(m=>m.severity==='mismatch'),info=ms.filter(m=>m.severity!=='mismatch');
 const exp=scanDocExpiry(),useDate=!add&&ms.some(m=>m.fix==='use-doc-date');
 if(!ms.length)return exp?`<div class="good-v81 small" id="acctScanOkV14">✓ ${add?'Nothing else on the document conflicts with what you entered':'The expiration you entered matches the document'+(acctScan.res.profile==='dates_only'?'':', and nothing else on it conflicts with your profile')}.</div>`:'';
 return`${hard.length?`<div class="alert-v81 mismatch-v14" id="acctMismatchV14" role="alert"><b>Credential mismatch detected</b><ul>${hard.map(m=>`<li data-field="${ec(m.field)}">${ec(m.text)}</li>`).join('')}</ul><div class="small">If you save it like this, it goes to the verifier's review queue flagged as a mismatch. Nothing is marked verified by a scan.</div></div>`:''}
 ${info.map(m=>`<div class="small notice">${ec(m.text)}</div>`).join('')}
 ${useDate&&exp?`<div class="acct-row-v10"><button type="button" class="pri mini" data-act="scan-use-date" id="acctUseDocDateV14">Use the date from the document (${ec(fd(exp.value))})</button></div>`:''}`;
}
function scanBoxHtml(target){
 if(!acctScan||acctScan.target!==target)return'';
 const s=acctScan,r=s.res;
 if(s.status==='scanning')return`<div class="scan-v14" id="acctScanBoxV14" data-state="scanning"><div class="scan-head-v14"><b>Reading your document on this device…</b></div>
  <div class="scan-bar-v14"><div style="width:${Math.round((s.progress||0)*100)}%"></div></div><div class="small" id="acctScanLabelV14">${ec(s.label||'Starting')}</div>
  <div class="small">Nothing is uploaded for this step and no AI service sees the file. The first scan downloads the reader (about 6 MB, cached afterwards).</div></div>`;
 if(s.status==='error')return`<div class="scan-v14" id="acctScanBoxV14" data-state="error"><b>The document couldn't be read.</b><div class="small">${ec(s.error||'')} You can still type the details yourself and save; a verifier will check the document.</div></div>`;
 if(!r)return'';
 if(!r.supported)return`<div class="scan-v14" id="acctScanBoxV14" data-state="unsupported"><div class="small">${ec(r.warnings[0]||'This file type cannot be read.')}${r.unsupportedReason==='browser'?' Type the details yourself and save; a verifier will check the document.':''}</div></div>`;
 const fields=r.fieldsWanted,priv=r.profile==='dates_only';
 const exp=scanDocExpiry();
 const confirmedNote=s.confirmed?`<div class="small scan-status-v14" id="acctScanStatusV14"><span class="badge PENDING">${ec(SCAN_STATUS_TEXT.toUpperCase())}</span></div>`:'';
 return`<div class="scan-v14" id="acctScanBoxV14" data-state="done" data-profile="${ec(r.profile)}">
 <div class="scan-head-v14"><b>Read from your document</b> <span class="small">· ${ec(({PDF_TEXT:'PDF text',PDF_OCR:'scanned PDF (OCR)',IMAGE_OCR:'image (OCR)'})[r.method]||r.method)}${r.rotated?` · turned ${r.rotated}°`:''}${r.qrFound?' · QR code read':''} · ${(r.ms/1000).toFixed(1)} s</span></div>
 <div class="small">Check each detail against your document and correct anything wrong. ${priv?'This is a private record: only the dates are used, and only the expiration date is saved. Nothing else from it is stored.':'The values stay on this device: Veridun saves only which fields you confirmed and any mismatch flag. The verifier reads the document again on their side.'}</div>
 <div class="scan-fields-v14">${fields.map(k=>{const f=r.fields[k];return`<label class="scan-row-v14${s.target==='add'&&(k==='expires_on'||k==='renew_by'||k==='multistate')?' hidden scan-exp-moved-v144':''}" data-field="${k}"><span class="scan-lbl-v14">${ec(scanFieldLabel(k,r))} ${!f&&k==='issued_on'&&(scanIsLicenseKind(scanKind())||r.profile==='license')?'<span class="conf-v14 conf-none">not printed · optional</span>':scanConfChip(f?.conf||0,!!f)}</span>${scanInput(k,s.values[k])}${f?.how&&/damaged|different|abbreviation|profile|swapped/.test(f.how)?`<span class="small">read from: ${ec(f.how)}</span>`:''}${!f&&r.notes?.[k]?`<span class="small scan-note-v142" id="acctScanNote-${k}">${ec(r.notes[k])}</span>`:''}${k==='issued_on'&&(scanIsLicenseKind(scanKind())||r.profile==='license')?`<span class="small scan-note-v147" id="acctScanIssueNoteV147">${ec(SCAN_LICENSE_ISSUE_NOTE)}</span>`:''}</label>`}).join('')}${(r.infoFields||[]).filter(k=>r.fields[k]).map(k=>`<div class="scan-row-v14 scan-info-v142" data-info-field="${k}" id="acctScanInfo-${k}"><span class="scan-lbl-v14">${ec(DocExtract.FIELD_LABEL[k]||k)}</span><span class="scan-info-val-v142">${k==='test_group'?'Group '+ec(r.fields[k].value)+' '+scanConfChip(r.fields[k].conf,true):k==='nihss_module'?ec(r.fields[k].value)+' '+scanConfChip(r.fields[k].conf,true):ec(r.fields[k].value)}</span><span class="small">${k==='nihss_module'?'As printed (“'+ec(r.fields[k].raw||'')+'”).':k==='test_group'?'As printed (“'+ec(r.fields[k].raw||'')+'”). Some facilities accept only certain groups, or a different group than last time.':ec(DocExtract.TC_ID_NOTE)}</span></div>`).join('')}</div>
 ${exp&&s.target!=='add'?`<div class="small scan-interp-v14" id="acctScanInterpV14">${ec(exp.text)}</div>`:''}${exp&&s.target==='add'?`<div class="small" id="acctScanExpMovedV144">The expiration date read from the document is in the Expiration date field above.</div>`:''}
 ${r.warnings.length?`<div class="small notice">${r.warnings.map(ec).join('<br>')}</div>`:''}
 <div id="acctScanMismatchBoxV14">${scanMismatchHtml()}</div>
 <label class="acct-sec-v11 scan-confirm-v14"><input type="checkbox" id="acctScanConfirmV14"${s.confirmed?' checked':''}> I checked these details against my document</label>
 ${s.target!=='add'?`<div class="acct-row-v10"><button type="button" class="pri" data-act="scan-save" id="acctScanSaveV14">Save details</button><button type="button" class="sec" data-act="scan-cancel">Cancel</button></div>`:''}
 ${confirmedNote}
 ${r.calculated?.suggested_renewal?`<div class="small scan-calc-v144" id="acctScanSuggestV144"><b>${ec(DocExtract.FIELD_LABEL.suggested_renewal)}:</b> ${ec(fd(r.calculated.suggested_renewal.value))} <span class="badge">CALCULATED · NOT PRINTED</span> 12 months from the completion date. Not printed on the certificate, not verified, and not saved as the expiration. Your facility’s rule is final.${r.calculated.suggested_renewal.value<new Date().toISOString().slice(0,10)?' That suggested date has passed: most facilities will want a newer NIHSS.':''}</div>`:''}
 ${r.notes?.verifier?`<div class="small alert-v81" id="acctScanVerifierNoteV144">${ec(r.notes.verifier)}</div>`:''}
 <div class="small">Saving details does not verify the credential. It becomes “${SCAN_STATUS_TEXT}” until a verifier checks it with ${ec(scanSourceName(s))}.</div></div>`;
}
function scanSourceName(s){
 const id=s.res?.source?.id;const src=id&&typeof verificationSource==='function'?verificationSource(id):null;
 if(src)return src.name;const ctx=scanContext();
 /* v14.4: NIHSS certificates come from several issuers; never default to one */
 if(ctx.kind==='CERT_NIHSS')return'the issuer printed on the certificate (not identified yet)';
 const rt=ctx.kind&&typeof primaryRouteFor==='function'?primaryRouteFor(ctx.kind,ctx.jurisdiction):null;return rt?.name||'the issuer';
}
function scanPaint(){
 if(!acctScan)return;const box=$('acctScanBoxV14');
 const html=scanBoxHtml(acctScan.target);
 if(box){box.outerHTML=html||'<div id="acctScanBoxV14"></div>';return}
 const slot=acctScan.target==='add'?$('acctScanSlotV14'):document.querySelector(`[data-scan-slot="${acctScan.target}"]`);
 if(slot)slot.innerHTML=html;
}
function scanPaintMismatch(){const b=$('acctScanMismatchBoxV14');if(b)b.innerHTML=scanMismatchHtml();const i=$('acctScanInterpV14'),e=scanDocExpiry();if(i&&e)i.textContent=e.text;scanExpMark()}
/* v14.4: ONE expiration field on the add form. A date read from the document pre-fills it (marked
   "from document, check it" with its confidence) unless the nurse already typed one; it stays editable.
   A typed date that differs from the document shows a mismatch note under the field (and is flagged
   for the verifier on save). The scan box no longer repeats the expiration or a "use this date" prompt. */
function scanExpConf(){const r=acctScan?.res;const f=r?.fields?.expires_on||r?.fields?.renew_by;return f?f.conf:null}
function scanPrefillExpiry(){
 if(!acctScan||acctScan.target!=='add'||acctScan.status!=='done'||!acctScan.res?.supported)return;
 const el=$('acctExpV10'),exp=scanDocExpiry();if(!el)return;
 if(exp&&el.dataset.origin!=='user'){el.value=exp.value;el.dataset.origin='document'}
 scanExpMark();
}
/* v14.5: the expiration field remembers where its value came from: 'document' (filled by a scan) or
   'user' (typed). A new file or a new credential type replaces or clears a document-filled value;
   only a typed value is kept. */
function scanClearDocExpiry(){const el=$('acctExpV10');if(el&&el.dataset.origin==='document'){el.value='';delete el.dataset.origin}}
function scanExpMark(){
 if(typeof expConfirmSync==='function')expConfirmSync('acct');
 const el=$('acctExpV10'),src=$('acctExpSrcV144'),note=$('acctExpNoteV144');if(!el||!src||!note)return;
 const on=acctScan&&acctScan.target==='add'&&acctScan.status==='done'&&acctScan.res?.supported;
 const exp=on?scanDocExpiry():null;
 if(!exp){
  src.innerHTML='';note.innerHTML='';if(acctScan&&acctScan.target==='add')acctScan.applyExpiry=false;
  if(on){const pn=acctScan.res.notes?.expires_on;
   src.innerHTML='<span class="conf-v14 conf-none" id="acctExpNotPrintedV145">not printed on the document</span>';
   note.innerHTML=el.value&&el.dataset.origin==='user'?`<span id="acctExpKeptV145">This document doesn't print an expiration. The date you typed is kept.</span>`:`<span id="acctExpNoneV145">${ec(pn||'No expiration printed on this document.')}</span>`}
  return}
 /* a skills checklist keeps an expiration only when the document prints one */
 const k=typeof catalogKind==='function'?catalogKind($('acctKindV10')?.value||''):null;
 if(k&&/^SKILLS_/.test(k.kind))$('acctExpDateRowV10')?.classList.remove('hidden');
 const same=el.value===exp.value,c=scanExpConf();
 acctScan.applyExpiry=same;
 if(same){
  src.innerHTML=`<span class="conf-v14 conf-${c>=0.9?'hi':c>=0.7?'mid':'lo'}" id="acctExpFromDocV144">from document, check it${c!=null?' · '+Math.round(c*100)+'%':''}</span>`;
  note.innerHTML=`<span id="acctExpInterpV144">${ec(exp.text)}</span> You can change it if the document was read wrong.`;
  return;
 }
 src.innerHTML='';
 note.innerHTML=el.value
  ?`<div class="mismatch-v14 alert-v81" id="acctExpMismatchV144" role="alert">Your date (${ec(fd(el.value))}) doesn't match the document (${ec(fd(exp.value))}). If you save it like this, it is flagged for the verifier. <button type="button" class="sec mini" data-act="scan-use-date" id="acctUseDocDateV14">Use the document's date</button></div>`
  :`<div id="acctExpEmptyV144">The document shows ${ec(fd(exp.value))}. <button type="button" class="sec mini" data-act="scan-use-date" id="acctUseDocDateV14">Use the document's date</button></div>`;
}
async function scanStart(target,file,kind){
 if(!file)return;
 if(target==='add'){scanClearDocExpiry();const sr=$('acctExpSrcV144'),nt=$('acctExpNoteV144');if(sr)sr.innerHTML='';if(nt)nt.innerHTML=''}
 if(!SCANNABLE(file)){acctScan={target,kind,status:'done',res:{supported:false,warnings:['Scanning works on PDF, PNG and JPEG files. This file was saved as is; type its details.'],fields:{},fieldsWanted:[]},values:{}};scanPaint();return}
 const p=acct()?.cache?.profile;
 const my={target,kind,status:'scanning',label:'Starting',progress:0.02,values:{},orig:{},confirmed:false,applyExpiry:false,t0:Date.now()};acctScan=my;scanPaint();
 try{
  const res=await DocExtract.extractFromFile(file,{kind,profileName:p?.full_name||'',onProgress:x=>{if(acctScan!==my)return;my.label=x.label;my.progress=Math.max(my.progress,x.progress||0);const l=$('acctScanLabelV14'),bar=document.querySelector('#acctScanBoxV14 .scan-bar-v14 div');if(l)l.textContent=x.label;if(bar)bar.style.width=Math.round(my.progress*100)+'%'}});
  if(acctScan!==my)return;
  my.res=res;my.status='done';my.doneAt=Date.now();
  for(const k of res.fieldsWanted||[]){my.values[k]=res.fields[k]?.value||'';my.orig[k]=my.values[k]}
  scanPaint();scanPrefillExpiry();if(target==='add'&&typeof acctLicenseNote==='function')acctLicenseNote();
 }catch(e){if(acctScan!==my)return;my.status='error';my.error=DocExtract.friendlyError(e);scanPaint()}
}
/* What gets saved / logged once the nurse confirms. */
function scanSummary(){
 const s=acctScan,r=s.res,fields=r.fieldsWanted||[];
 const corrected=fields.filter(k=>(s.values[k]||'')!==(s.orig[k]||''));
 const ms=scanMismatches().filter(m=>m.severity==='mismatch');
 const confidence=Object.fromEntries(Object.entries(r.fields).filter(([k])=>fields.includes(k)).map(([k,f])=>[k,Math.round(f.conf*1000)/1000]));
 const exp=scanDocExpiry();
 return{corrected,ms,confidence,exp,
  event:{kind:scanContext().kind,profile:r.profile,method:r.method,source_slug:r.source?.id||null,fields_expected:fields,fields_found:fields.filter(k=>r.fields[k]),fields_corrected:corrected,mismatches:ms.map(m=>m.field),confidence,qr_found:!!r.qrFound,rotated:r.rotated||0,scan_ms:r.ms,confirm_ms:Math.max(0,Date.now()-(s.doneAt||Date.now()))},
  /* Stored on the credential: field NAMES and flags only. The values stay
     on this device (extracted values are kept off the server by design). */
  doc:{v:1,profile:r.profile,read_at:new Date().toISOString(),method:r.method,fields_found:fields.filter(k=>r.fields[k]),fields_confirmed:fields.filter(k=>s.values[k]),confidence,corrected,
   mismatch_fields:ms.map(m=>m.field),mismatch:ms.length>0,issuer:r.issuer||null,source_suggested:r.source?.id||null,confirmed:true,status:'DETAILS_CAPTURED'}};
}
async function scanAfterSave(credId,sum,{applied=false}={}){
 const a=acct();
 const detail={kind:sum.event.kind,profile:sum.event.profile,method:sum.event.method,source_slug:sum.event.source_slug,fields_expected:sum.event.fields_expected,fields_found:sum.event.fields_found,fields_corrected:sum.event.fields_corrected,mismatches:sum.event.mismatches,confidence:sum.event.confidence,scan_ms:sum.event.scan_ms,confirm_ms:sum.event.confirm_ms,qr_found:sum.event.qr_found};
 await a.log('DOCUMENT_SCANNED',{credential_id:credId,result:sum.ms.length?'MISMATCH':'DETAILS_CAPTURED',detail});
 if(sum.ms.length)await a.log('DOCUMENT_MISMATCH',{credential_id:credId,result:'NEEDS_REVIEW',detail:{kind:sum.event.kind,fields:sum.ms.map(m=>m.field)}});
 if(applied)await a.log('DOCUMENT_DATE_APPLIED',{credential_id:credId,result:'EXPIRES_ON_FROM_DOCUMENT',detail:{kind:sum.event.kind}});
 await a.logExtraction({event:'CONFIRM',credential_id:credId,...sum.event});
 await a.hydrate();
}
/* Checked before saving so a refusal doesn't re-render (and wipe) the form. */
function scanAddBlocker(){
 if(!acctScan||acctScan.target!=='add')return null;
 if(acctScan.status==='scanning')return'Wait for the document to finish reading (or remove the file).';
 if(acctScan.status==='done'&&acctScan.res?.supported&&!$('acctScanConfirmV14')?.checked)return'Check the details read from your document and tick “I checked these details against my document” (correct anything that is wrong).';
 return null;
}
/* Add form: called from acctSubmitCredential. Returns {metaDoc, sum} or null. */
function scanForAdd(){
 if(!acctScan||acctScan.target!=='add')return null;
 if(acctScan.status==='scanning')throw new Error('Wait for the document to finish reading (or remove the file).');
 if(acctScan.status!=='done'||!acctScan.res?.supported)return null;
 if(!$('acctScanConfirmV14')?.checked)throw new Error('Check the details read from your document and tick “I checked these details against my document” (correct anything that is wrong).');
 acctScan.confirmed=true;return scanSummary();
}
async function scanSaveExisting(){
 const s=acctScan;if(!s||s.target==='add')return;
 if(!$('acctScanConfirmV14')?.checked)throw new Error('Tick “I checked these details against my document” first.');
 s.confirmed=true;const sum=scanSummary(),a=acct();
 await a.saveDocumentDetails(s.target,{doc:sum.doc,expiresOn:s.applyExpiry?s.docExpiry:null,applyExpiry:s.applyExpiry});
 await scanAfterSave(s.target,sum,{applied:s.applyExpiry});
 acctScan=null;
 return sum;
}
async function scanRescan(credId){
 const a=acct(),c=a.cache.credentials.find(x=>x.id===credId);if(!c)return;
 acctScan={target:credId,kind:c.kind,status:'scanning',label:'Getting your document with a 60-second private link',progress:0.02,values:{},orig:{}};scanPaint();
 try{
  const url=await a.documentUrl(credId,60);
  const r=await fetch(url);if(!r.ok)throw new Error('Could not download your document ('+r.status+').');
  const blob=await r.blob();const name=(c.source_document_path||'document').split('/').pop();
  await scanStart(credId,new File([blob],name,{type:blob.type||''}),c.kind);
 }catch(e){acctScan={target:credId,status:'error',error:DocExtract.friendlyError(e,'your document')};scanPaint()}
}
/* Status shown on a saved credential. */
function scanCredInfo(c){
 const d=c.metadata?.doc;const evs=(acct()?.cache?.events||[]).filter(e=>e.credential_id===c.id);
 const scanned=!!d?.confirmed||evs.some(e=>e.event_type==='DOCUMENT_SCANNED');
 const mismatch=d?d.mismatch:evs.some(e=>e.event_type==='DOCUMENT_MISMATCH');
 return{scanned,mismatch,doc:d};
}
document.addEventListener('DOMContentLoaded',()=>{
 const ws=$('accountWorkspace');if(!ws)return;
 ws.addEventListener('input',e=>{const t=e.target;if(t.id==='acctExpV10'){if(t.value)t.dataset.origin='user';else delete t.dataset.origin;scanPaintMismatch();return}if(!acctScan||!t.dataset?.scanField)return;acctScan.values[t.dataset.scanField]=t.value;scanPaintMismatch()});
 ws.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset?.scanField&&acctScan){acctScan.values[t.dataset.scanField]=t.value;scanPaintMismatch()}
  if(t.id==='acctScanConfirmV14'&&acctScan)acctScan.confirmed=t.checked;
  if(t.id==='acctFileV10'){const f=t.files[0];const kind=(typeof acctLicenseKind==='function'&&acctLicenseKind())||$('acctKindV10').value;if(!f){acctScan=null;scanPaint();if(typeof acctLicenseNote==='function')acctLicenseNote();{scanClearDocExpiry();scanExpMark()}const sl=$('acctScanSlotV14');if(sl)sl.innerHTML='';return}
   if(!kind){acctScan=null;const sl=$('acctScanSlotV14');if(sl)sl.innerHTML='<div class="small notice" id="acctScanBoxV14">Choose the credential type first; the document is then read on this device.</div>';return}
   scanStart('add',f,kind)}
  if((t.id==='acctKindV10'||t.name==='acctLicTypeV10')&&$('acctFileV10')?.files[0]){const kind=(typeof acctLicenseKind==='function'&&acctLicenseKind())||$('acctKindV10').value;if(kind&&(!acctScan||acctScan.target!=='add'||acctScan.kind!==kind))scanStart('add',$('acctFileV10').files[0],kind)}
  if(t.id==='acctExpV10'){if(t.value)t.dataset.origin='user';else delete t.dataset.origin}
  if(['acctExpV10','acctJurV10'].includes(t.id)||t.name==='acctLicTypeV10')scanPaintMismatch();
  if(t.id==='acctKindV10'&&!$('acctFileV10')?.files[0]){scanClearDocExpiry();scanExpMark()}
 });
 ws.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;
  if(act==='scan-use-date'){const exp=scanDocExpiry();if(!exp)return;
   if(acctScan.target==='add'){$('acctExpV10').value=exp.value;$('acctExpV10').dataset.origin='document';acctScan.applyExpiry=true}else{acctScan.applyExpiry=true;acctScan.docExpiry=exp.value}
   scanPaintMismatch();acctMsg('Expiration set to '+fd(exp.value)+' from the document.'+(acctScan.target==='add'?'':' Save details to keep it.'),'ok')}
  if(act==='scan-cancel'){acctScan=null;acctRenderAll()}
  if(act==='doc-rescan')scanRescan(b.dataset.id);
  if(act==='scan-save')acctDo(scanSaveExisting).then(sum=>{if(sum)acctMsg(sum.ms.length?'Details saved. Credential mismatch detected: it is flagged for the verifier.':`Details saved. Status: ${SCAN_STATUS_TEXT}.`,sum.ms.length?'err':'ok')});
 });
});
