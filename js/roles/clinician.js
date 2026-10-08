/* Clinician workspace: Home, Passport, Tasks, Opportunities, onboarding dialog. */
function setBusy(s){$('busy').textContent=s||''}
function render(){creds=creds.map(v81Normalize);const ob=onboarding();$('onboardPct').textContent=ob.pct+'%';$('vcount').textContent=creds.filter(c=>c.primary==='VERIFIED').length;$('acount').textContent=creds.filter(c=>c.chain==='ACCEPTED').length;$('ncount').textContent=creds.filter(c=>['UNVERIFIED','VERIFYING'].includes(c.primary)||c.chain==='SECURING').length;$('onboardBar').style.width=ob.pct+'%';$('onboardSummaryText').textContent=`${ob.ok} of ${ob.req.length} required items satisfied`;$('readyBadge').textContent=ob.ready?'ONBOARDING READY':'IN PROGRESS';$('readyBadge').className='badge '+(ob.ready?'READY':'PENDING');let a=filter==='all'?creds:creds.filter(c=>c.section===filter);$('empty').classList.toggle('hidden',a.length>0);$('tbl').classList.toggle('hidden',!a.length);$('rows').innerHTML=a.map(c=>{let z=`<button class="mini details" data-id="${c.id}">Details</button>`;if(c.primary==='UNVERIFIED')z+=`<button class="mini verify" data-id="${c.id}">Submit for Verification</button>`;if(c.primary==='VERIFYING')z+=`<button class="mini" disabled>Verification in Progress</button>`;if(eligible(c))z+=`<button class="mini chainbtn issue" data-id="${c.id}">Secure Credential</button>`;if(c.chain==='SECURING')z+=`<button class="mini goodbtn accept" data-id="${c.id}">Accept</button>`;if(['SECURING','ACCEPTED'].includes(c.chain))z+=`<button class="mini showproof" data-id="${c.id}">XRPL Proof</button>`;z+=`<button class="mini del" data-id="${c.id}">Delete</button>`;let prov=c.prov?.verifiedAt?`${ec(c.prov.source)}<div class="source">${ec(c.prov.method)} · ${new Date(c.prov.verifiedAt).toLocaleDateString()}</div>`:'Not yet verified';return `<tr><td><b>${ec(c.name)}</b>${c.privateOnly?'<div class="small">Private/off-chain only</div>':''}</td><td class="mono">${ec(c.type)}</td><td>${c.required?'<span class="badge REQ">REQUIRED</span>':'Optional'}</td><td><span class="badge ${cls(c.primary)}">${ec(c.primary)}</span></td><td><span class="badge ${userChainClass(c)}">${ec(userChain(c))}</span></td><td>${fd(c.expiration)}</td><td>${prov}</td><td><div class="rowact">${z}</div></td></tr>`}).join('');document.querySelectorAll('.verify').forEach(b=>b.onclick=()=>openVerify(+b.dataset.id));document.querySelectorAll('.issue').forEach(b=>b.onclick=()=>issue(+b.dataset.id));document.querySelectorAll('.accept').forEach(b=>b.onclick=()=>accept(+b.dataset.id));document.querySelectorAll('.showproof,.details').forEach(b=>b.onclick=()=>showProof(+b.dataset.id));document.querySelectorAll('.del').forEach(b=>b.onclick=()=>{creds=creds.filter(c=>c.id!=b.dataset.id);save();render()});renderV7Views()}
function showV7View(id){
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
 document.querySelectorAll('.v7nav').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
 window.scrollTo({top:0,behavior:'smooth'});
 if(id==='passportView'||id==='tasksView'||id==='opportunitiesView')renderV7Views()
}
function renderV7Views(){
 const ready=v7Readiness();if($('v7PassportReady'))$('v7PassportReady').textContent=ready+'%';
 const passCats=['Licenses','Certifications','Education','Employment & HR','Clinical Qualifications','Additional Professional Qualifications'];
 if($('v7PassportSections'))$('v7PassportSections').innerHTML=passCats.map(cat=>{
   const arr=creds.filter(c=>catFor(c)===cat&&c.primary==='VERIFIED'&&c.prov?.active);
   if(!arr.length)return'';
   return `<div class="task-category-v7"><div class="cathead"><b>${ec(cat==='Employment & HR'?'Employment Experience':cat)}</b></div>${arr.map(c=>`<div class="passport-item-v7"><div><b>✓ ${ec(c.name)}</b><div class="small">${ec(c.prov?.source||'Verified source')}</div></div><div><span class="badge ${userChainClass(c)}">${ec(userChain(c))}</span> <button class="mini details" data-id="${c.id}">View</button></div></div>`).join('')}</div>`
 }).join('');
 const cats=['Licenses','Certifications','Education','Employment & HR','Employee Health','Clinical Qualifications','Background & Screening','Additional Professional Qualifications','Submitted Credentials'];
 if($('v7TaskCategories'))$('v7TaskCategories').innerHTML=cats.map(cat=>{
   const arr=creds.filter(c=>catFor(c)===cat),verified=arr.filter(c=>c.primary==='VERIFIED').length,exp=arr.filter(c=>c.primary==='EXPIRING').length,missing=arr.filter(c=>['UNVERIFIED','EXPIRED','REVOKED'].includes(c.primary)).length;
   return `<div class="task-category-v7"><div class="cathead"><b>${ec(cat)}</b><div class="counts"><span class="chip">${arr.length} items</span><span class="chip">${verified} verified</span><span class="chip">${exp} expiring</span><span class="chip">${missing} missing/action</span></div></div>${arr.map(c=>`<div class="task-item-v7"><div><b>${ec(c.name)}</b><div class="small">${ec(c.primary)}${c.expiration?' · '+fd(c.expiration):''}</div></div><button class="mini details" data-id="${c.id}">${c.primary==='EXPIRING'?'Renew':'Open'}</button></div>`).join('')}</div>`
 }).join('');
 renderOpportunities();
 document.querySelectorAll('.details').forEach(btn=>btn.onclick=()=>showProof(+btn.dataset.id))
}
function openOnboard(){const ob=onboarding();$('onboardRows').innerHTML=ob.req.map(c=>`<div class="reqrow"><div><b>${ec(c.name)}</b><div class="source">${ec(c.prov?.source||'Primary source pending')}</div></div><span class="badge ${reqSatisfied(c)?'READY':'PENDING'}">${reqSatisfied(c)?'SATISFIED':'PENDING'}</span></div>`).join('');$('onboard').showModal()}

/* Opportunities: every demo assignment, evaluated by the readiness engine. */
function renderOpportunities(){
 if(!$('oppListV82'))return;
 $('oppListV82').innerHTML=getAssignments().map(a=>{
  const r=v81Assignment(a),next=r.items.find(i=>i.status==='MISSING'||i.status==='EXPIRES_BEFORE_END'),pend=r.items.some(i=>i.status==='PENDING_VERIFICATION');
  const action=r.ready?`<span class="badge READY">${r.ok}/${r.total} · ASSIGNMENT READY</span>`:next?`<button class="pri oppComplete" data-aid="${a.id}">COMPLETE MISSING REQUIREMENT</button>`:pend?'<button class="sec" disabled>Pending verification</button>':'';
  return`<div class="opp-card-v7"><div class="opp-item-v7"><div><b>${ec(a.name)}</b><div class="small">${ec(a.templateName)} · ${ec(jurisdictionName(a.jurisdiction))} · ${a.start} → ${a.end}</div></div><div class="opp-score">${r.ok}/${r.total}</div></div><ul class="req-list">${r.items.map(readinessItemHtml).join('')}</ul>${action}</div>`;
 }).join('');
 document.querySelectorAll('.oppComplete').forEach(b=>b.onclick=()=>completeMissingRequirement(b.dataset.aid));
}
/* Golden-path entry point: records assignment interest (once per demo
   session) and opens the Add Credential form pre-filled for the first
   missing requirement. */
function completeMissingRequirement(aid){
 const a=getAssignment(aid);if(!a)return;const r=v81Assignment(a),next=r.items.find(i=>i.status==='MISSING'||i.status==='EXPIRES_BEFORE_END');if(!next)return;
 if(!eventsSinceSeed().some(e=>e.event_type==='ASSIGNMENT_INTEREST'&&e.assignment_id===aid))v81Log('ASSIGNMENT_INTEREST',null,{assignment_id:aid,actor_type:'CLINICIAN',result:`${r.ok}/${r.total}`,detail:{total:r.total,missing:r.total-r.ok,missingLabels:r.missing}});
 const kind=next.req.kind===RN_AUTHORIZATION?'RN_LICENSE':next.req.kind;
 openAddForm({kind,jurisdiction:next.req.jurisdiction||'',context:`Completing <b>${ec(a.name)}</b>: ${ec(next.label)}${next.note?' <span class="small">('+ec(next.note)+')</span>':''}`});
}
/* ---- Add Credential form (searchable catalog dropdowns, automatic privacy) ---- */
function fillDatalist(id,labels){$(id).innerHTML=labels.map(l=>`<option value="${ec(l)}"></option>`).join('')}
function initAddForm(){fillDatalist('kindListV82',CREDENTIAL_CATALOG.map(k=>k.label))}
function openAddForm(pre={}){
 resetAddForm();
 if(pre.kind)$('kindSearchV82').value=catalogKind(pre.kind)?.label||'';
 if(pre.jurisdiction){const j=jurisdiction(pre.jurisdiction);if(j)$('jurSearchV82').value=jurisdictionOptionLabel(j)}
 $('addContextV82').innerHTML=pre.context||'';$('addContextV82').classList.toggle('hidden',!pre.context);
 v81SyncAddForm();$('add').showModal();
}
function resetAddForm(){['kindSearchV82','jurSearchV82','nm','tp','dt','fl'].forEach(id=>{$(id).value=''});$('addContextV82').classList.add('hidden');v81SyncAddForm()}
function v81SyncAddForm(){
 const k=resolveCatalogKind($('kindSearchV82').value);
 const needsJur=!!k?.jurisdiction,list=k?.jurisdiction==='NLC_HOME'?multistateHomeJurisdictions():US_JURISDICTIONS;
 $('jurisdictionRowV81').classList.toggle('hidden',!needsJur);
 $('otherRowV81').classList.toggle('hidden',k?.kind!=='OTHER');
 if(needsJur){fillDatalist('jurListV82',list.map(jurisdictionOptionLabel));$('jurLabelV82').textContent=k.jurisdiction==='NLC_HOME'?'NLC home state (primary state of residence)':'License jurisdiction (US state or territory)'}
 const j=needsJur?resolveJurisdiction($('jurSearchV82').value,list):null;
 $('jurHintV82').textContent=!needsJur?'':j?`${j.name}: ${nlcStatusLabel(j.code)} · issuer: ${j.issuer}`:k.jurisdiction==='NLC_HOME'?`Only the ${list.length} NLC states that issue multistate licenses are listed.`:`Type to search all ${list.length} US states and territories.`;
 let note='Choose a credential type to see how it will be handled.';
 if(k){const priv=catalogPrivacy(k.kind)==='PRIVATE';
  note=`<b>Classification:</b> ${ec(k.kind)}${j?' · '+ec(j.code):''}<br><b>Source document:</b> always private — never shared or put on-chain.<br><b>Verified result:</b> ${priv?'private — shared only as a status when an assignment requires it; never on-chain.':'can be shared selectively; optional XRPL Devnet proof.'}${k.readiness===false?'<br><b>Assignment readiness:</b> listed as an Additional Professional Qualification; does not affect RN readiness unless an organization requires it.':''}<br><b>Verification:</b> simulated check against ${ec(k.jurisdiction?(j?.issuer||'the state board of nursing'):(k.issuer||'the issuer'))} (DEMO).`}
 $('privacyNoteV82').innerHTML=note;
}
function addCredentialFromForm(){
 const k=resolveCatalogKind($('kindSearchV82').value);if(!k){alert('Choose a credential type from the list.');return}
 let jur='';
 if(k.jurisdiction){const list=k.jurisdiction==='NLC_HOME'?multistateHomeJurisdictions():US_JURISDICTIONS,j=resolveJurisdiction($('jurSearchV82').value,list);if(!j){alert(k.jurisdiction==='NLC_HOME'?'Choose your NLC home state from the list (only states that issue multistate licenses).':'Choose the license jurisdiction from the list (any US state or territory).');return}jur=j.code}
 const name=k.kind==='OTHER'?$('nm').value.trim():credentialDisplayName(k.kind,jur);if(!name){alert('Enter a credential name.');return}
 const type=k.kind==='OTHER'?($('tp').value.trim()||'OTHER'):credentialTypeCode(k.kind,jur),f=$('fl').files[0];
 const c=v81Normalize({id:Date.now(),name,kind:k.kind,type,jurisdiction:jur,section:k.section,required:isBaselineRequired(k.kind),primary:'VERIFYING',chain:'NOT ISSUED',expiration:$('dt').value,file:f?f.name:'',prov:{source:'',method:'',verifier:'',verifiedAt:'',active:false,lastMonitored:new Date().toISOString()}});
 creds.push(c);save();
 v81Log('CREDENTIAL_UPLOADED',c.id,{actor_type:'CLINICIAN',result:'PENDING_VERIFICATION',detail:{document:f?'PRIVATE_FILENAME_ONLY':'NONE'}});
 v81Log('CLASSIFICATION_COMPLETED',c.id,{actor_type:'SYSTEM',result:'SIMULATED_CLASSIFICATION',detail:{kind:c.kind,jurisdiction:jur||null,privacy:catalogPrivacy(c.kind)}});
 v81Log('VERIFICATION_STARTED',c.id,{actor_type:'SYSTEM',result:'QUEUED'});
 $('add').close();render();
 alert(`${name} added.\nClassified as ${c.kind}${jur?' · '+jur:''}. Source document kept private.\nStatus: Pending Verification — it is now in the Verification Console queue.`);
}
