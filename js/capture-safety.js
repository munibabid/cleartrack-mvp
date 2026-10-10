/* v14.8 P0 SAFETY STOPS for credential capture (demo Add credential dialog + signed-in account form).
   Until Intake becomes the canonical reader (v14.9), NOTHING on this site fills in a credential's
   details or chooses its type from the document. The nurse types every detail as printed.
   The on-device check below may only BLOCK an unsafe save:
   - more than one credential in one file          → "Please upload each credential separately."
   - an LVN / LPN license                           → "Veridun Passport currently supports RN licenses."
   - a Red Cross "Advanced Life Support" card as ACLS → not ACLS
   - a document of a different type than the one chosen → choose the printed type
   - PALS, TNCC, NRP, CEN, ENPC                     → held: not supported in the RN pilot
   It never stores the document's text or any value read from it. An unreadable document is not
   blocked (the nurse types the details; a verifier checks the document). */
const CAPTURE_FAMILIES=[
 {id:'RN',label:'RN license',phrase:/registered\s+(?:professional\s+)?nurse/i},
 {id:'LVN',label:'Licensed Vocational Nurse (LVN) license',phrase:/licensed\s+vocational\s+nurse/i,acro:/(?<![A-Za-z])LVN(?![A-Za-z])/},
 {id:'LPN',label:'Licensed Practical Nurse (LPN) license',phrase:/licensed\s+practical\s+nurse/i,acro:/(?<![A-Za-z])LPN(?![A-Za-z])/},
 {id:'BLS',label:'BLS (Basic Life Support)',phrase:/basic\s+life\s+support/i,acro:/(?<![A-Za-z])BLS(?![A-Za-z])/},
 {id:'ACLS',label:'ACLS (Advanced Cardiovascular Life Support)',phrase:/advanced\s+cardiovascular\s+life\s+support/i,acro:/(?<![A-Za-z])ACLS(?![A-Za-z])/},
 {id:'PALS',label:'PALS (Pediatric Advanced Life Support)',phrase:/pediatric\s+advanced\s+life\s+support/i,acro:/(?<![A-Za-z])PALS(?![A-Za-z])/},
 {id:'ALS',label:'Advanced Life Support',phrase:/(?<!(?:pediatric|cardiovascular|neonatal|trauma|burn|obstetric)\s+)advanced\s+life\s+support/i},
 {id:'NIHSS',label:'NIH Stroke Scale (NIHSS)',phrase:/NIH\s*stroke\s*scale/i,acro:/(?<![A-Za-z])NIHSS(?![A-Za-z])/},
 {id:'NRP',label:'NRP (Neonatal Resuscitation Program)',phrase:/neonatal\s+resuscitation/i,acro:/(?<![A-Za-z])NRP(?![A-Za-z])/},
 {id:'TNCC',label:'TNCC (Trauma Nursing Core Course)',phrase:/trauma\s+nursing\s+core\s+course/i,acro:/(?<![A-Za-z])TNCC(?![A-Za-z])/},
 {id:'ENPC',label:'ENPC (Emergency Nursing Pediatric Course)',phrase:/emergency\s+nursing\s+pediatric\s+course/i,acro:/(?<![A-Za-z])ENPC(?![A-Za-z])/},
 {id:'CEN',label:'CEN (Certified Emergency Nurse)',phrase:/certified\s+emergency\s+nurse/i,acro:/(?<![A-Za-z])CEN(?![A-Za-z])/},
 {id:'CCRN',label:'CCRN',acro:/(?<![A-Za-z])CCRN(?![A-Za-z])/}
];
const CAPTURE_KIND_FAMILY={RN_LICENSE:'RN',RN_LICENSE_MULTISTATE:'RN',CERT_BLS:'BLS',CERT_ACLS:'ACLS',CERT_PALS:'PALS',CERT_NIHSS:'NIHSS',CERT_NRP:'NRP',CERT_TNCC:'TNCC',CERT_ENPC:'ENPC',CERT_CEN:'CEN',CERT_CCRN:'CCRN'};
/* Held in the RN pilot (Munib t149u): in the catalog, but not added as supported credentials. */
const CAPTURE_UNSUPPORTED_KINDS={CERT_PALS:'PALS',CERT_TNCC:'TNCC',CERT_NRP:'NRP',CERT_CEN:'CEN',CERT_ENPC:'ENPC'};
const CAPTURE_UNSUPPORTED_FAMILIES=['PALS','TNCC','NRP','CEN','ENPC','ALS'];
const CAPTURE_LVN_TEXT='Veridun Passport currently supports RN licenses.';
const CAPTURE_MULTI_TEXT='Please upload each credential separately.';
function captureFamilyLabel(id){return(CAPTURE_FAMILIES.find(f=>f.id===id)||{}).label||id}
/* Which credential families a page names. Labels only; the text is not kept. */
function captureFamilies(text){
 const t=String(text||'');
 return CAPTURE_FAMILIES.filter(f=>(f.phrase&&f.phrase.test(t))||(f.acro&&f.acro.test(t))).map(f=>f.id);
}
function captureKindName(kind){const k=typeof catalogKind==='function'?catalogKind(kind):null;return k?(k.short||k.label):'this credential'}
/* A chosen type that can't be saved in the RN pilot (no document needed to decide). */
function captureKindBlock(kind){
 const u=CAPTURE_UNSUPPORTED_KINDS[kind];
 if(u)return{code:'UNSUPPORTED_KIND',message:`Veridun Passport doesn't support ${u} yet in the RN pilot, so it can't be added as a credential. Keep your card; nothing is saved.`};
 return null;
}
/* The verdict for a chosen type + the on-device check of the file (null = no file). */
function captureVerdict(kind,screen){
 const kb=captureKindBlock(kind);if(kb)return{state:'blocked',...kb};
 if(!screen)return{state:'none'};
 if(screen.status==='checking')return{state:'checking'};
 if(screen.status==='error')return{state:'error',message:screen.error||''};
 const r=screen.res;if(!r)return{state:'none'};
 if(!r.supported)return{state:'unsupported'};
 const fams=r.families||[];
 if(fams.includes('LVN')||fams.includes('LPN'))return{state:'blocked',code:'LVN_LPN',message:`This document looks like a ${captureFamilyLabel(fams.includes('LVN')?'LVN':'LPN')}. ${CAPTURE_LVN_TEXT} It can't be saved as an RN license.`};
 if(fams.length>=2)return{state:'blocked',code:'MULTIPLE',message:`This file seems to contain more than one credential (${fams.map(captureFamilyLabel).join(' and ')}). ${CAPTURE_MULTI_TEXT} Nothing is saved from this file.`};
 if(fams.length===1){
  const f=fams[0],want=CAPTURE_KIND_FAMILY[kind]||null;
  if(f==='ALS'&&kind==='CERT_ACLS')return{state:'blocked',code:'ALS_NOT_ACLS',message:'This card says “Advanced Life Support”, not “Advanced Cardiovascular Life Support (ACLS)”. Veridun can\'t add it as ACLS. If you have an ACLS card, upload that card instead.'};
  if(want&&f!==want){
   if(CAPTURE_UNSUPPORTED_FAMILIES.includes(f))return{state:'blocked',code:'UNSUPPORTED_DOC',message:`You chose ${captureKindName(kind)}, but this document looks like ${captureFamilyLabel(f)}. Veridun Passport doesn't support ${f==='ALS'?'Advanced Life Support cards':f} yet in the RN pilot. Upload your ${captureKindName(kind)} document instead.`};
   return{state:'blocked',code:'TYPE_MISMATCH',message:`You chose ${captureKindName(kind)}, but this document looks like ${captureFamilyLabel(f)}. Choose the credential type printed on your document, or upload the right document.`};
  }
 }
 if(!r.readable)return{state:'unreadable'};
 return{state:'clear'};
}
/* Confidence words (language only). Raw percentages stay in verifier/admin views. */
function confidenceWords(conf,found=true){
 if(!found||conf==null||isNaN(conf))return'Could not read reliably';
 return conf>=0.9?'High confidence':conf>=0.7?'Please check':'Could not read reliably';
}

/* ---- per-form state: 'add' = demo dialog (#fl), 'acct' = account form (#acctFileV10) ---- */
const CAPTURE_FORMS={add:{box:'addScreenV148',slot:'addScreenSlotV148',file:'fl',kind:()=>{const k=typeof resolveCatalogKind==='function'?resolveCatalogKind(($('kindSearchV82')||{}).value||''):null;return k?k.kind:''}},
 acct:{box:'acctScreenBoxV148',slot:'acctScanSlotV14',file:'acctFileV10',kind:()=>(typeof acctLicenseKind==='function'&&acctLicenseKind())||($('acctKindV10')||{}).value||''}};
const captureScreens={add:null,acct:null};
function captureScreenReset(form){captureScreens[form]=null;capturePaint(form)}
function acctScreenReset(){captureScreenReset('acct')}
async function captureScreenStart(form,file){
 if(!file){captureScreenReset(form);return}
 const my={status:'checking',label:'Starting',progress:0.02,name:file.name};captureScreens[form]=my;capturePaint(form);
 try{
  const res=await DocExtract.screenFile(file,{classify:captureFamilies,onProgress:x=>{if(captureScreens[form]!==my)return;my.label=x.label||my.label;my.progress=Math.max(my.progress,x.progress||0);const l=document.querySelector('#'+CAPTURE_FORMS[form].box+' .capture-label-v148');if(l)l.textContent=my.label}});
  if(captureScreens[form]!==my)return;my.status='done';my.res=res;
 }catch(e){if(captureScreens[form]!==my)return;my.status='error';my.error=(typeof DocExtract!=='undefined'&&DocExtract.friendlyError)?DocExtract.friendlyError(e):String(e&&e.message||e)}
 capturePaint(form);
}
function captureVerdictFor(form){return captureVerdict(CAPTURE_FORMS[form].kind(),captureScreens[form])}
function captureBoxHtml(form){
 const id=CAPTURE_FORMS[form].box,v=captureVerdictFor(form),s=captureScreens[form];
 const typeIt='Veridun doesn\'t fill in details from your document: type them exactly as printed. A verifier checks the document.';
 if(v.state==='none')return`<div id="${id}" class="capture-v148 small" data-state="none">Type the details exactly as printed on your document. Veridun doesn't fill them in from the file.</div>`;
 if(v.state==='checking')return`<div id="${id}" class="capture-v148 scan-v14" data-state="checking"><b>Checking your document on this device…</b><div class="scan-bar-v14"><div style="width:${Math.round((s?.progress||0)*100)}%"></div></div><div class="small capture-label-v148">${ec(s?.label||'')}</div><div class="small">Nothing is sent anywhere for this check.</div></div>`;
 if(v.state==='blocked')return`<div id="${id}" class="capture-v148 alert-v81 mismatch-v14" data-state="blocked" data-code="${ec(v.code)}" role="alert"><b>This can't be saved like this.</b><div>${ec(v.message)}</div></div>`;
 const pages=s?.res?.pages>1?` (${s.res.pages} pages)`:'';
 if(v.state==='clear')return`<div id="${id}" class="capture-v148 scan-v14" data-state="clear"><b>Document attached${ec(pages)}.</b><div class="small">${typeIt}</div></div>`;
 if(v.state==='unreadable')return`<div id="${id}" class="capture-v148 scan-v14" data-state="unreadable"><b>Document attached${ec(pages)}.</b><div class="small">We couldn't check this document on this device. ${typeIt}</div></div>`;
 if(v.state==='unsupported')return`<div id="${id}" class="capture-v148 scan-v14" data-state="unsupported"><b>Document attached.</b><div class="small">This file can't be checked on this device. ${typeIt}</div></div>`;
 return`<div id="${id}" class="capture-v148 scan-v14" data-state="error"><b>Document attached.</b><div class="small">${ec(v.message||'')} ${typeIt}</div></div>`;
}
function capturePaint(form){
 const f=CAPTURE_FORMS[form],box=$(f.box),html=captureBoxHtml(form);
 if(box){box.outerHTML=html;return}
 const slot=$(f.slot);if(slot)slot.innerHTML=html;
}
/* Called before saving. Returns a plain-language reason, or null. */
function captureSaveBlocker(form,kind){
 const v=captureVerdict(kind||CAPTURE_FORMS[form].kind(),captureScreens[form]);
 if(v.state==='checking')return'Wait a moment: your document is still being checked on this device.';
 if(v.state==='blocked')return v.message;
 return null;
}
document.addEventListener('DOMContentLoaded',()=>{
 document.addEventListener('change',e=>{const t=e.target;if(!t||!t.id)return;
  if(t.id==='fl')captureScreenStart('add',t.files&&t.files[0]);
  if(t.id==='acctFileV10')captureScreenStart('acct',t.files&&t.files[0]);
  if(t.id==='kindSearchV82')capturePaint('add');
  if(t.id==='acctKindV10')capturePaint('acct');
 },true);
 document.addEventListener('input',e=>{if(e.target&&e.target.id==='kindSearchV82')capturePaint('add')},true);
});
