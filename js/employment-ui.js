/* v14.9 — Employment & Specialty Experience: Passport card, resume intake (MOCK), verification history,
   and the Sentinel/Match experience preview. Browser-only demo store; no database writes, no external
   model calls, XRPL proof references are MOCKED. Engine: js/employment-experience.js. */
const EMP_STORE_KEY='veridun_employment_v1';
const EMP_SEED_VERSION='1';
const EMP_AS_OF=new Date().toISOString().slice(0,7);
/* Demo assignment experience rules (Hospitals A–E, t159u). Configurable — nothing is hard-coded as qualified. */
const EMP_REQUIREMENT_PRESETS=[
 {id:'A',label:'Hospital A',specialty:'ICU',minTotalMonths:12},
 {id:'B',label:'Hospital B',specialty:'ICU',minTotalMonths:24},
 {id:'C',label:'Hospital C',specialty:'ICU',minTotalMonths:36},
 {id:'D',label:'Hospital D',specialty:'ICU',minTotalMonths:24,minRecentMonths:12,recentLookbackMonths:24},
 {id:'E',label:'Hospital E',specialty:'ICU',minTotalMonths:24,lastWorkedWithinMonths:12}
];
function empSeedEpisodes(){const E=EmploymentExperience,t='2026-03-01T00:00:00.000Z';
 let a=E.createEpisode({employer:'Sharp Memorial Hospital',role:'Registered Nurse',specialty:'ICU',subspecialty:'',start:'2024-01',end:'2026-02'},'NURSE_ENTRY',{id:'emp-demo-sharp',at:'2025-12-01T00:00:00.000Z'});
 a=E.appendAttestation(a,{source:'Sharp Memorial Hospital HR (demo employer HR integration)',verifier:'Sharp HR (DEMO)',evidenceLevel:'A',evidenceType:'EMPLOYER_HR_API',confirms:{employer:'Sharp Memorial Hospital',role:'RN',dates:{start:'2024-01',end:'2026-02'},specialty:'ICU'},at:t});
 let b=E.createEpisode({employer:'Hospital XYZ',role:'Registered Nurse',specialty:'ICU',subspecialty:'',start:'2022-06',end:'2023-12'},'RESUME',{id:'emp-demo-xyz',at:'2025-12-01T00:00:00.000Z'});
 b=E.appendAttestation(b,{source:'Hospital XYZ HR employment verification letter (demo)',verifier:'Veridun reviewer (DEMO)',evidenceLevel:'C',evidenceType:'HR_LETTER',confirms:{employer:'Hospital XYZ',role:'RN',dates:{start:'2022-06',end:'2023-12'}},note:'HR letter confirms employer, RN role and dates. It does not state the unit/specialty.',at:'2026-01-15T00:00:00.000Z'});
 let c=E.createEpisode({employer:'TravelCo Staffing (agency)',role:'RN',specialty:'ICU',subspecialty:'CVICU',start:'2021-03',end:'2022-05'},'NURSE_ENTRY',{id:'emp-demo-agency',at:'2025-12-01T00:00:00.000Z'});
 c=E.appendAttestation(c,{source:'W-2 and agency contract uploaded by nurse (demo)',verifier:'Veridun reviewer (DEMO)',evidenceLevel:'D',evidenceType:'W2_CONTRACT',confirms:{employer:'TravelCo Staffing',role:'RN',dates:{start:'2021-03',end:'2022-05'},specialty:'CVICU'},note:'Pay/contract records corroborate employment; they cannot prove specialty.',at:'2026-01-20T00:00:00.000Z'});
 return[a,b,c]}
function empLoad(){try{const s=store.adapter.readJSON(EMP_STORE_KEY,null);if(s&&s.v===EMP_SEED_VERSION&&Array.isArray(s.episodes))return s}catch(e){}const s={v:EMP_SEED_VERSION,episodes:empSeedEpisodes(),custom:{id:'CUSTOM',label:'Custom requirement',specialty:'ICU',minTotalMonths:24,minRecentMonths:12,recentLookbackMonths:24,lastWorkedWithinMonths:12,acceptedSubspecialties:[]}};empSave(s);return s}
function empSave(s){try{store.adapter.writeJSON(EMP_STORE_KEY,s)}catch(e){}}
let empState=null,empDrafts=null;
const EMP_BADGE={VERIFIED:'READY','CORROBORATED':'PENDING','SELF-ATTESTED':'PRIVATE',UNVERIFIED:'PENDING',DISPUTED:'REVOKED'};
const EMP_ICON={VERIFIED:'✓',CORROBORATED:'◐','SELF-ATTESTED':'⚠',UNVERIFIED:'○',DISPUTED:'✕'};
function empStrength(st){const v=EmploymentExperience.FIELDS.filter(f=>st[f].status==='VERIFIED').length;return v===4?'strong':v>0?'partial':'claim'}
function empFmtMonth(m){if(!m)return'Present';const[y,mo]=m.split('-');return new Date(+y,+mo-1,1).toLocaleDateString(undefined,{year:'numeric',month:'short'})}
function empEpisodeHtml(ep){const E=EmploymentExperience,st=E.fieldStatuses(ep),sp=ep.claim.subspecialty||ep.claim.specialty||'Specialty',strength=empStrength(st);
 const spVerified=st.specialty.status==='VERIFIED'?st.specialty.value:sp;
 const rows=E.FIELDS.map(f=>`<li class="emp-f-v149 emp-${st[f].status.replace(/[^A-Z]/g,'')}" data-field="${f}" data-status="${st[f].status}">${EMP_ICON[st[f].status]} ${ec(E.fieldPhrase(f,st[f],f==='specialty'?spVerified:sp))}${st[f].level?` <span class="small">· evidence level ${st[f].level}</span>`:''}</li>`).join('');
 const hist=ep.history.map(h=>{const rev=E.entryRevocationStatus(ep,h);return`<tr><td>${h.seq}</td><td>${ec(h.source)}${h.note?`<div class="small">${ec(h.note)}</div>`:''}</td><td>${ec(h.verifier)}</td><td>${ec(String(h.verifiedAt).slice(0,10))}</td><td>${h.evidenceLevel} · ${ec(h.evidenceType)}</td><td>${Object.keys(h.fieldsConfirmed).map(ec).join(', ')||'—'}${h.notProvable.length?`<div class="small">not provable by this source: ${h.notProvable.map(ec).join(', ')}</div>`:''}</td><td class="small">${ec(h.hashVersion)}<br>${ec(h.hash)}</td><td class="small">${h.proofRef?ec(h.proofRef.ref)+' (mock, not anchored)':'—'}</td><td>${h.revokes?'revokes #'+ec(h.revokes.split('#')[1]):rev}</td></tr>`}).join('');
 return`<div class="emp-ep-v149 emp-${strength}" data-episode="${ec(ep.id)}" data-strength="${strength}"><div><b>${ec(ep.claim.employer)}</b> <span class="small">· ${ec(ep.claim.role)}${sp?' · '+ec(sp):''} · ${ec(empFmtMonth(ep.claim.start))} – ${ec(empFmtMonth(ep.claim.end))}</span>${ep.origin==='RESUME'?' <span class="chip">from resume</span>':''}</div>
 <div class="small emp-strength-v149">${strength==='strong'?'All four fields independently verified — counts toward verified experience':strength==='partial'?'Partly verified — does not count toward verified specialty experience until every field is verified':'Self-reported — awaiting verification; does not count toward verified experience'}</div>
 <ul class="emp-fields-v149">${rows}</ul>
 <details><summary class="small">Verification history (${ep.history.length} entries, append-only)</summary><div class="emp-hist-wrap-v149"><table class="v81-table emp-hist-v149"><tr><th>#</th><th>Source</th><th>Verifier</th><th>Date</th><th>Evidence</th><th>Fields confirmed</th><th>Hash</th><th>Proof ref</th><th>Status</th></tr>${hist}</table></div></details></div>`}
function empReqRowsHtml(r){return r.rules.map(x=>`<tr data-rule="${x.rule}" data-pass="${x.pass}"><td>${ec(x.text)}</td><td>${x.rule==='LAST_WORKED'?(x.available==null?'no verified work':x.available+' months ago'):x.available+' months'}</td><td><span class="badge ${x.pass?'READY':'REVOKED'}">${x.pass?'PASS':'FAIL'}</span>${!x.pass&&x.gap!=null?` <span class="small">gap: ${x.gap} month${x.gap===1?'':'s'}</span>`:''}</td></tr>`).join('')}
function empReqHtml(req){const r=EmploymentExperience.evaluateExperienceRequirement(empState.episodes,req,{asOf:EMP_AS_OF});
 return`<div class="emp-req-v149" data-req="${ec(req.id)}" data-status="${r.status}"><div><b>${ec(req.label)}</b> · ${r.status==='QUALIFIED'?'<span class="badge READY">EXPERIENCE REQUIREMENT: QUALIFIED</span>':r.status==='NO_RULES'?'<span class="badge PENDING">NO RULES SET</span>':'<span class="badge REVOKED">NOT YET QUALIFIED</span>'}</div><table class="v81-table"><tr><th>Requirement</th><th>Available (verified)</th><th>Result</th></tr>${empReqRowsHtml(r)}</table>${r.claimedOnlyMonths?`<div class="small">${r.claimedOnlyMonths} claimed months are not counted because they are not fully verified.</div>`:''}</div>`}
function renderEmploymentExperience(){
 const el=document.getElementById('empExpV149');if(!el||typeof EmploymentExperience==='undefined')return;
 if(!empState)empState=empLoad();const E=EmploymentExperience,fam='ICU',x=E.calculateExperience(empState.episodes,fam,{asOf:EMP_AS_OF});
 const eps=empState.episodes.slice().sort((a,b)=>empStrengthRank(E.fieldStatuses(a))-empStrengthRank(E.fieldStatuses(b))||String(b.claim.start).localeCompare(a.claim.start));
 const cu=empState.custom,subs=E.SUBSPECIALTIES[fam];
 el.innerHTML=`<div class="task-category-v7" id="empCardV149"><div class="cathead"><b>Employment &amp; Specialty Experience</b><span class="demo-tag-v81">DEMO DATA · MOCK VERIFICATION</span></div>
 <div class="emp-card-v149"><div class="small">SPECIALTY EXPERIENCE</div><h3 style="margin:2px 0">${fam}</h3>
 <div class="emp-kpis-v149">
  <div><div class="small">Total verified experience</div><b id="empVerifiedV149">${ec(E.monthsText(x.verifiedMonths))}</b></div>
  <div><div class="small">Total claimed experience</div><b id="empClaimedV149">${ec(E.monthsText(x.claimedMonths))}</b> <span class="small">(includes self-reported)</span></div>
  <div><div class="small">Recent verified experience</div><b id="empRecentV149">${x.recentVerifiedMonths} of previous ${x.lookbackMonths} months</b></div>
  <div><div class="small">Last verified ${fam} work</div><b id="empLastV149">${x.lastVerifiedMonth?ec(empFmtMonth(x.lastVerifiedMonth)):'None verified'}</b></div>
 </div><div class="small">Calculated only from employment where the employer, RN role, dates and ${fam} specialty are each verified. Typed totals and resumes never count as verified.</div></div>
 <div style="font-weight:800;margin:10px 0 4px">Contributing employment</div>${eps.map(empEpisodeHtml).join('')}
 <details class="emp-resume-v149" id="empResumeV149"><summary><b>Add employment from a resume</b> <span class="small">· extraction is a demo mock; nothing is sent to any AI service</span></summary>
  <div class="small">A resume only speeds up entry. Every record it creates is <b>self-reported — awaiting verification</b> until an employer, verification service or HR letter confirms each field.</div>
  <label>Resume file (.txt for the mock) <input type="file" id="empResumeFileV149" accept=".txt,.pdf,.doc,.docx"></label>
  <label>…or paste resume lines (Employer | Role | Mon YYYY – Mon YYYY)<textarea id="empResumeTextV149" rows="3">Mercy General | CVICU RN | Mar 2019 – Feb 2021</textarea></label>
  <button type="button" class="sec mini" id="empExtractV149">Extract (mock)</button><div id="empDraftsV149"></div></details>
 <div style="font-weight:800;margin:14px 0 4px">Assignment experience check <span class="small">· Sentinel / Match preview — separate from Passport facts</span></div>
 <div class="small">Each organization sets its own rules. The Passport stores verified facts; this check only compares them with a rule set.</div>
 ${EMP_REQUIREMENT_PRESETS.map(empReqHtml).join('')}
 <details class="emp-custom-v149" id="empCustomV149"><summary><b>Custom requirement</b></summary><div class="grid2-v83">
  <label>Minimum total verified months<input type="number" min="0" max="600" id="empCuTotalV149" value="${cu.minTotalMonths??''}"></label>
  <label>Minimum recent verified months<input type="number" min="0" max="120" id="empCuRecentV149" value="${cu.minRecentMonths??''}"></label>
  <label>…within the last (months)<input type="number" min="1" max="120" id="empCuLbV149" value="${cu.recentLookbackMonths??24}"></label>
  <label>Last verified work within (months)<input type="number" min="0" max="120" id="empCuLastV149" value="${cu.lastWorkedWithinMonths??''}"></label></div>
  <div class="small">Accepted subspecialties (none ticked = any ${fam} subspecialty): ${[fam,...subs].map(s=>`<label class="chk-inline-v149"><input type="checkbox" class="empCuSubV149" value="${ec(s)}"${(cu.acceptedSubspecialties||[]).includes(s)?' checked':''}> ${ec(s)}</label>`).join(' ')}</div>
  <div id="empCustomResultV149">${empReqHtml(cu)}</div></details>
 <div class="small" style="margin-top:8px">Blockchain proves that a Veridun attestation existed, when it was issued, by whom, that it hasn't changed and whether it was revoked. It does not prove the employment itself — the employer or verification source does. No resume, HR letter, name, payroll record or private document goes on-chain. Proof references shown here are mock.</div></div>`;
 empBind();
}
function empStrengthRank(st){return{strong:0,partial:1,claim:2}[empStrength(st)]}
function empNum(id){const v=document.getElementById(id).value;return v===''?undefined:Math.max(0,Math.round(+v))}
function empBind(){const g=id=>document.getElementById(id);
 const upd=()=>{empState.custom={...empState.custom,minTotalMonths:empNum('empCuTotalV149'),minRecentMonths:empNum('empCuRecentV149'),recentLookbackMonths:empNum('empCuLbV149')||24,lastWorkedWithinMonths:empNum('empCuLastV149'),acceptedSubspecialties:[...document.querySelectorAll('.empCuSubV149:checked')].map(c=>c.value)};empSave(empState);g('empCustomResultV149').innerHTML=empReqHtml(empState.custom)};
 ['empCuTotalV149','empCuRecentV149','empCuLbV149','empCuLastV149'].forEach(id=>g(id).oninput=upd);document.querySelectorAll('.empCuSubV149').forEach(c=>c.onchange=upd);
 g('empResumeFileV149').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(/\.txt$/i.test(f.name)){g('empResumeTextV149').value=await f.text()}else{g('empDraftsV149').innerHTML='<div class="small">The demo mock only reads .txt resumes. Other files are not read or sent anywhere — paste the lines instead.</div>'}};
 g('empExtractV149').onclick=()=>{const r=EmploymentExperience.mockExtractResume(g('empResumeTextV149').value);empDrafts=r.drafts;empRenderDrafts()};
}
function empRenderDrafts(){const g=id=>document.getElementById(id),box=g('empDraftsV149');
 if(!empDrafts||!empDrafts.length){box.innerHTML='<div class="small">No employment lines recognized. Use: Employer | Role | Mon YYYY – Mon YYYY (or Present).</div>';return}
 box.innerHTML=`<div class="small" style="margin:6px 0"><b>Review and correct</b> each extracted record (Please check). Saved records are self-reported.</div>`+empDrafts.map((d,i)=>`<div class="emp-draft-v149" data-i="${i}"><div class="grid2-v83"><label>Employer<input class="empDEmp" value="${ec(d.employer)}"></label><label>Role<input class="empDRole" value="${ec(d.role)}"></label><label>Specialty<input class="empDSpec" value="${ec(d.subspecialty||d.specialty)}"></label><label>Start (YYYY-MM)<input class="empDStart" value="${ec(d.start)}"></label><label>End (YYYY-MM, blank = present)<input class="empDEnd" value="${ec(d.end||'')}"></label><label class="chk-inline-v149"><input type="checkbox" class="empDOk" checked> Include</label></div></div>`).join('')+`<button type="button" class="pri mini" id="empSaveDraftsV149">Save as self-reported</button>`;
 g('empSaveDraftsV149').onclick=()=>{const E=EmploymentExperience,rev=[...box.querySelectorAll('.emp-draft-v149')].map(n=>{const s=n.querySelector('.empDSpec').value.trim(),fam=Object.keys(E.SUBSPECIALTIES).find(f=>f===s||E.SUBSPECIALTIES[f].includes(s))||s;
  return{employer:n.querySelector('.empDEmp').value.trim(),role:n.querySelector('.empDRole').value.trim(),specialty:fam,subspecialty:fam!==s?s:'',start:n.querySelector('.empDStart').value.trim(),end:n.querySelector('.empDEnd').value.trim()||null,accepted:n.querySelector('.empDOk').checked}}).filter(d=>d.employer&&E.ym(d.start)!=null);
  empState.episodes=[...empState.episodes,...E.episodesFromReviewedResume(rev)];empSave(empState);empDrafts=null;renderEmploymentExperience()};
}
