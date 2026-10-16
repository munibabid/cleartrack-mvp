/* v14.9 — Education panel (secondary; below license, certifications and experience). Browser-only
   demo store; optional; no upload required; no GPA/coursework/transcripts; mock proof refs only. */
const EDU_STORE_KEY='veridun_education_v1';
const EDU_RULE_PRESETS=[
 {id:'none',label:'Assignment with no education rule',rule:null},
 {id:'asn',label:'ASN accepted (required minimum ASN)',rule:{mode:'REQUIRED',minDegree:'ASN'}},
 {id:'bsnreq',label:'BSN required',rule:{mode:'REQUIRED',minDegree:'BSN'}},
 {id:'bsnpref',label:'BSN preferred',rule:{mode:'PREFERRED',minDegree:'BSN'}}
];
function eduLoad(){try{const s=JSON.parse(localStorage.getItem(EDU_STORE_KEY)||'null');if(s&&Array.isArray(s.records))return s}catch(e){}
 const D=Education;let r=D.createEducation({degreeType:'ASN',institution:'Phoenix College',program:'Associate Degree in Nursing',gradDate:'2018'},{id:'edu-demo-asn',at:'2025-12-01T00:00:00Z'});
 r=D.appendEducationAttestation(r,{source:'National Student Clearinghouse (DEMO, simulated)',sourceType:'NATIONAL_STUDENT_CLEARINGHOUSE',verifier:'Veridun (DEMO)',confirms:{institution:'Phoenix College',degreeType:'ASN',gradDate:'2018-05'},at:'2026-01-10T00:00:00Z'});
 const b=D.createEducation({degreeType:'BSN',institution:'Arizona State University',program:'RN to BSN',gradDate:'2021'},{id:'edu-demo-bsn',at:'2025-12-01T00:00:00Z'});
 const s={skipped:false,records:[r,b]};eduSave(s);return s}
function eduSave(s){try{localStorage.setItem(EDU_STORE_KEY,JSON.stringify(s))}catch(e){}}
let eduState=null;
const EDU_BADGE={'PRIMARY-SOURCE VERIFIED':'READY','DOCUMENT-SUPPORTED':'PENDING','SELF-ATTESTED':'PRIVATE',DISPUTED:'REVOKED'};
const EDU_STATE_TEXT={'PRIMARY-SOURCE VERIFIED':'Primary-source verified','DOCUMENT-SUPPORTED':'Document uploaded — not verified','SELF-ATTESTED':'Self-attested',DISPUTED:'Disputed — needs review'};
const EDU_FIELD_NAME={institution:'School',degreeType:'Degree type',gradDate:'Graduation date',program:'Program'};
const EDU_RESULT_TEXT={NOT_APPLICABLE:'Not considered',PASS:'PASS',PENDING_EDUCATION_VERIFICATION:'PENDING EDUCATION VERIFICATION',FAIL:'FAIL',QUALIFIED_PREFERENCE_NOT_MET:'QUALIFIED — preference not met',QUALIFIED_PREFERENCE_PENDING:'QUALIFIED — preference pending verification'};
function eduRecordHtml(r){const D=Education,st=D.educationState(r),fs=D.educationFieldStatuses(r),c=r.claim;
 return`<div class="emp-ep-v149 edu-rec-v149 ${st==='PRIMARY-SOURCE VERIFIED'?'emp-strong':'emp-claim'}" data-edu="${ec(r.id)}" data-state="${st}"><div><b>${ec(c.degreeType==='OTHER'?c.degreeOther||'Other':D.DEGREES[c.degreeType].label)}</b> <span class="small">· ${ec(c.institution)}${c.gradDate?' · '+ec(c.gradDate):''}</span> <span class="badge ${EDU_BADGE[st]}">${ec(EDU_STATE_TEXT[st])}</span></div>
 <ul class="emp-fields-v149">${D.EDU_FIELDS.filter(f=>fs[f].status!=='NOT PROVIDED').map(f=>`<li class="small" data-field="${f}" data-status="${fs[f].status}">${ec(EDU_FIELD_NAME[f])}: ${ec(fs[f].status==='PRIMARY-SOURCE VERIFIED'?'verified':fs[f].status==='DOCUMENT-SUPPORTED'?'document uploaded, not verified':fs[f].status.toLowerCase())} <span class="small">· source: ${ec(fs[f].source||'')}</span></li>`).join('')}</ul>
 ${r.history.length?`<div class="small">Attestation ${ec(r.history[r.history.length-1].hash)} · proof ref ${ec(r.history[r.history.length-1].proofRef.ref)} (mock, not anchored)</div>`:''}</div>`}
function renderEducation(){const el=document.getElementById('eduV149');if(!el||typeof Education==='undefined')return;if(!eduState)eduState=eduLoad();const D=Education;
 el.innerHTML=`<details class="task-category-v7" id="eduCardV149"><summary class="cathead"><b>Education</b> <span class="small">· optional · ${eduState.records.length} on file</span> <span class="demo-tag-v81">DEMO</span></summary>
 <div class="small" id="eduOnbV149">${ec(D.ONBOARDING_COPY.text)} <button type="button" class="sec mini" id="eduAddBtnV149">Add education</button> <button type="button" class="mini" id="eduSkipV149">Skip for now</button>${eduState.skipped?' <span class="chip">skipped — you can add it any time</span>':''}</div>
 <div id="eduFormV149" class="hidden"><div class="grid2-v83"><label>Degree<select id="eduDegV149">${Object.entries(D.DEGREES).map(([k,v])=>`<option value="${k}">${ec(v.label)}</option>`).join('')}</select></label><label>School<input id="eduSchoolV149"></label><label>Graduation year or date <span class="small">(optional)</span><input id="eduGradV149" placeholder="YYYY or YYYY-MM"></label></div><div class="small">No upload, GPA, coursework or transcript is needed. Saved as self-attested.</div><button type="button" class="pri mini" id="eduSaveV149">Save</button></div>
 ${eduState.records.map(eduRecordHtml).join('')}
 <div style="font-weight:800;margin:10px 0 4px">Assignment education check <span class="small">· preview, separate from Passport facts</span></div>
 <table class="v81-table" id="eduRulesV149"><tr><th>Assignment rule</th><th>Result</th></tr>${EDU_RULE_PRESETS.map(p=>{const x=D.evaluateEducationRule(eduState.records,p.rule);return`<tr data-rule="${p.id}" data-result="${x.result}"><td>${ec(p.label)}</td><td><b>${ec(EDU_RESULT_TEXT[x.result])}</b><div class="small">${ec(x.reason)}</div></td></tr>`}).join('')}</table>
 <div class="small">Education is verified only by education sources (registrar, university, official transcript verification, National Student Clearinghouse, institution-signed credential). Nursys and license boards are not education sources. Documents stay private and off-chain.</div></details>`;
 const g=id=>document.getElementById(id);
 g('eduAddBtnV149').onclick=()=>{g('eduCardV149').open=true;g('eduFormV149').classList.remove('hidden')};
 g('eduSkipV149').onclick=()=>{eduState.skipped=true;eduSave(eduState);renderEducation()};
 g('eduSaveV149').onclick=()=>{const sch=g('eduSchoolV149').value.trim();if(!sch){alert('Enter the school.');return}eduState.records=[...eduState.records,D.createEducation({degreeType:g('eduDegV149').value,institution:sch,gradDate:g('eduGradV149').value.trim()})];eduState.skipped=false;eduSave(eduState);renderEducation();g('eduCardV149').open=true};
}
