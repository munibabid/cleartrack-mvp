/* Clinician workspace: Home, Passport, Tasks, Opportunities, onboarding dialog. */
function setBusy(s){$('busy').textContent=s||''}
function render(){creds=creds.map(v81Normalize);const ob=onboarding();$('onboardPct').textContent=ob.pct+'%';$('vcount').textContent=creds.filter(c=>c.primary==='VERIFIED').length;$('acount').textContent=creds.filter(c=>c.chain==='ACCEPTED').length;$('ncount').textContent=clinicianAttention().length;$('onboardBar').style.width=ob.pct+'%';$('onboardSummaryText').textContent=`${ob.ok} of ${ob.req.length} required items satisfied`;$('readyBadge').textContent=ob.ready?'ONBOARDING READY':'IN PROGRESS';$('readyBadge').className='badge '+(ob.ready?'READY':'PENDING');let a=filter==='all'?creds:creds.filter(c=>c.section===filter);$('empty').classList.toggle('hidden',a.length>0);$('tbl').classList.toggle('hidden',!a.length);$('rows').innerHTML=a.map(c=>{let z=`<button class="mini details" data-id="${c.id}">Details</button>`;if(c.primary==='UNVERIFIED')z+=`<button class="mini verify" data-id="${c.id}">Submit for Verification</button>`;if(c.primary==='VERIFYING')z+=`<button class="mini" disabled>Verification in Progress</button>`;if(eligible(c))z+=`<button class="mini chainbtn issue" data-id="${c.id}">Secure Credential</button>`;if(c.chain==='SECURING')z+=`<button class="mini goodbtn accept" data-id="${c.id}">Accept</button>`;if(['SECURING','ACCEPTED'].includes(c.chain))z+=`<button class="mini showproof" data-id="${c.id}">XRPL Proof</button>`;z+=`<button class="mini del" data-id="${c.id}">Delete</button>`;let prov=c.prov?.verifiedAt?`${ec(c.prov.source)}<div class="source">${ec(c.prov.method)} · ${new Date(c.prov.verifiedAt).toLocaleDateString()}</div>`:'Not yet verified';return `<tr><td><b>${ec(c.name)}</b>${c.privateOnly?'<div class="small">Private/off-chain only</div>':''}</td><td class="mono">${ec(c.type)}</td><td>${c.required?'<span class="badge REQ">REQUIRED</span>':'Optional'}</td><td>${verificationBadgeHtml(c)}</td><td>${proofLabelHtml(c)}</td><td>${fd(c.expiration)}</td><td>${prov}</td><td><div class="rowact">${z}</div></td></tr>`}).join('');document.querySelectorAll('.verify').forEach(b=>b.onclick=()=>openVerify(+b.dataset.id));document.querySelectorAll('.issue').forEach(b=>b.onclick=()=>issue(+b.dataset.id));document.querySelectorAll('.accept').forEach(b=>b.onclick=()=>accept(+b.dataset.id));document.querySelectorAll('.showproof,.details').forEach(b=>b.onclick=()=>showProof(+b.dataset.id));document.querySelectorAll('.del').forEach(b=>b.onclick=()=>{creds=creds.filter(c=>c.id!=b.dataset.id);save();render()});renderV7Views()}
function showV7View(id){
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
 document.querySelectorAll('.v7nav').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
 window.scrollTo({top:0,behavior:'smooth'});
 if(id==='shareView')sweepExpiredShares();
 if(['passportView','tasksView','opportunitiesView','shareView'].includes(id))renderV7Views()
}
function renderV7Views(){
 const ready=v7Readiness();if($('v7PassportReady'))$('v7PassportReady').textContent=ready+'%';
 renderPassportView();
 renderTaskCenter();
 renderHomeDashboard();
 renderOpportunities();
 renderShareAccess();
 document.querySelectorAll('.details').forEach(btn=>btn.onclick=()=>showProof(+btn.dataset.id))
}
function openOnboard(){const ob=onboarding();$('onboardRows').innerHTML=ob.req.map(c=>`<div class="reqrow"><div><b>${ec(c.name)}</b><div class="source">${ec(c.prov?.source||'Primary source pending')}</div></div><span class="badge ${reqSatisfied(c)?'READY':'PENDING'}">${reqSatisfied(c)?'SATISFIED':'PENDING'}</span></div>`).join('');$('onboard').showModal()}

/* Opportunities: each assignment that accepts the selected nurse's profile
   specialty, evaluated by the readiness engine with that nurse's specialty
   module. Alex is the live Passport; the other nurses are read-only demos. */
let oppNurseId='alex';
function renderOpportunities(){
 if(!$('oppListV82'))return;
 const sel=$('oppNurseV84');
 if(sel&&!sel.options.length){sel.innerHTML=DEMO_NURSES.map(n=>`<option value="${n.id}">${ec(n.name)} — ${ec(specialtyShort(n.specialty))}${n.live?' (your live Passport)':' (demo nurse, read-only)'}</option>`).join('');sel.onchange=()=>{oppNurseId=sel.value;renderOpportunities()}}
 if(sel)sel.value=oppNurseId;
 const n=demoNurse(oppNurseId),all=getAssignments(),elig=all.filter(a=>assignmentAccepts(a,n.specialty)),other=all.filter(a=>!assignmentAccepts(a,n.specialty));
 if($('oppNurseNoteV84'))$('oppNurseNoteV84').innerHTML=`Specialty from profile: <b>${ec(specialtyName(n.specialty))}</b> · home state ${ec(jurisdictionName(n.homeState))}. Opportunities that accept ${ec(specialtyShort(n.specialty))} are evaluated with the <b>${ec(specialtyShort(n.specialty))} module</b>.${n.live?'':' <span class="demo-tag-v81">DEMO NURSE · READ-ONLY</span>'}`;
 $('oppListV82').innerHTML=elig.map(a=>{
  const r=v81Assignment(a,n),next=r.items.find(i=>['MISSING','EXPIRES_BEFORE_END','NOT_RECENT'].includes(i.status)),pend=r.items.some(i=>i.status==='PENDING_VERIFICATION');
  const org=organization(a.orgId);
  const action=!n.live?(r.ready?`<span class="badge READY">${r.ok}/${r.total} · ASSIGNMENT READY</span>`:''):r.ready?`<span class="badge READY">${r.ok}/${r.total} · ASSIGNMENT READY</span> <button class="pri oppShare" data-aid="${a.id}" style="margin-top:8px">SHARE WITH ${ec((org?.name||'ORGANIZATION').toUpperCase())}</button>`:next?`<button class="pri oppComplete" data-aid="${a.id}">COMPLETE MISSING REQUIREMENT</button>`:pend?'<button class="sec" disabled>Pending verification</button>':'';
  return`<div class="opp-card-v7"><div class="opp-item-v7"><div><b>${ec(a.name)}</b><div class="small">${org?ec(org.name)+' · ':''}${ec(a.facility||'')}</div><div class="small">${ec(a.workTypeName)} · ${ec(jurisdictionName(a.jurisdiction))} · ${a.start} → ${a.end} · accepts ${ec(a.specialtyText)}</div></div><div class="opp-score">${r.ok}/${r.total}</div></div><div style="margin:8px 0">${layerSummaryHtml(a,r.reqs)}</div><ul class="req-list">${r.items.map(readinessItemHtml).join('')}</ul>${action}</div>`;
 }).join('')+(other.length?`<div class="small opp-other-v84">Not shown — these opportunities don't accept ${ec(specialtyShort(n.specialty))}: ${other.map(a=>`${ec(a.name)} (${ec(a.specialtyText)})`).join(', ')}</div>`:'');
 document.querySelectorAll('.oppComplete').forEach(b=>b.onclick=()=>completeMissingRequirement(b.dataset.aid));
 document.querySelectorAll('.oppShare').forEach(b=>b.onclick=()=>{const x=getAssignment(b.dataset.aid);openShareDialog({orgId:x.orgId,assignmentId:x.id})});
}
/* Golden-path entry point: records assignment interest (once per demo
   session) and opens the Add Credential form pre-filled for the first
   missing requirement. */
function completeMissingRequirement(aid){
 const a=getAssignment(aid);if(!a)return;const r=v81Assignment(a),next=r.items.find(i=>['MISSING','EXPIRES_BEFORE_END','NOT_RECENT'].includes(i.status));if(!next)return;
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
function resetAddForm(){if(typeof renewalTargetV85!=='undefined')renewalTargetV85=null;['kindSearchV82','jurSearchV82','nm','tp','dt','fl'].forEach(id=>{$(id).value=''});$('addContextV82').classList.add('hidden');v81SyncAddForm()}
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
 const old=renewalTargetV85!=null?creds.find(x=>x.id===renewalTargetV85&&x.kind===c.kind&&(x.jurisdiction||'')===(jur||'')):null;if(old)c.renews=old.id;renewalTargetV85=null;
 creds.push(c);save();
 v81Log('CREDENTIAL_UPLOADED',c.id,{actor_type:'CLINICIAN',result:'PENDING_VERIFICATION',detail:{document:f?'PRIVATE_FILENAME_ONLY':'NONE',...(c.renews?{renews:c.renews}:{})}});
 v81Log('CLASSIFICATION_COMPLETED',c.id,{actor_type:'SYSTEM',result:'SIMULATED_CLASSIFICATION',detail:{kind:c.kind,jurisdiction:jur||null,privacy:catalogPrivacy(c.kind)}});
 v81Log('VERIFICATION_STARTED',c.id,{actor_type:'SYSTEM',result:'QUEUED'});
 $('add').close();render();
 alert(`${name} added.\nClassified as ${c.kind}${jur?' · '+jur:''}. Source document kept private.\nStatus: Pending Verification — it is now in the Verification Console queue.`);
}

/* ---- Share Professional Passport dialog (create / modify) ---- */
let shareEditId=null;
function durationOptions(sel,includeOneTime=true){sel.innerHTML=SHARE_DURATIONS.filter(d=>includeOneTime||d.id!=='ONE_TIME').map(d=>`<option value="${d.id}">${ec(d.label)}</option>`).join('')}
function assertionRow(x,checked){return`<label class="share-option"><span><b>${ec(x.label)}</b><span class="small"> · ${x.requirement&&x.requirement!==x.label?'for: '+ec(x.requirement)+' · ':''}${x.mode==='REQUIREMENT_SATISFIED'?'shared as “Requirement Satisfied” — details private':'verified credential assertion'}</span></span><input type="checkbox" class="shareChkV83" data-cred="${x.credId}" data-mode="${x.mode}" data-req="${ec(x.requirement||'')}" data-label="${ec(x.label)}"${checked?' checked':''}></label>`}
function openShareDialog(pre={}){
 shareEditId=null;$('shareTitleV83').textContent='SHARE PROFESSIONAL PASSPORT';$('generateV7Share').textContent='Approve & Share';
 $('shareOrgV83').disabled=false;$('shareAssignV83').disabled=false;
 $('shareOrgV83').innerHTML=ORGANIZATIONS.filter(o=>getAssignments().some(a=>a.orgId===o.id&&assignmentAccepts(a,DEMO_PROFILE.specialty))).map(o=>`<option value="${o.id}">${ec(o.name)}</option>`).join('');
 const a0=pre.assignmentId?getAssignment(pre.assignmentId):featuredAssignment();
 $('shareOrgV83').value=pre.orgId||a0.orgId;fillShareAssignments(a0.id);
 durationOptions($('shareV7Duration'));$('shareV7Duration').value='THROUGH_ASSIGNMENT_END';$('shareCustomV83').value='';
 refreshShareOptions();$('shareFormV83').classList.remove('hidden');$('shareV7Result').classList.add('hidden');$('shareV7').showModal();
}
function fillShareAssignments(selectId){const list=getAssignments().filter(a=>a.orgId===$('shareOrgV83').value&&assignmentAccepts(a,DEMO_PROFILE.specialty));$('shareAssignV83').innerHTML=list.map(a=>`<option value="${a.id}">${ec(a.name)} · ${a.start} → ${a.end}</option>`).join('');if(selectId&&list.some(a=>a.id===selectId))$('shareAssignV83').value=selectId}
function refreshShareOptions(preset){
 const a=getAssignment($('shareAssignV83').value);if(!a)return;const r=v81Assignment(a),rec=recommendedAssertions(a),extra=optionalAssertions(a,rec);
 const isOn=x=>preset?preset.some(p=>p.credId===x.credId):true;
 $('shareReadyV83').innerHTML=`Readiness for this assignment: <b>${r.ok}/${r.total}</b>${r.ready?' · ASSIGNMENT READY':' · missing: '+ec(r.missing.join(', '))}`;
 $('shareOptionsV83').innerHTML=rec.map(x=>assertionRow(x,isOn(x))).join('')||'<div class="small" style="padding:8px 0">No verified credentials meet this assignment yet.</div>';
 $('shareExtraV83').innerHTML=extra.map(x=>assertionRow(x,preset?isOn(x):false)).join('')||'<div class="small" style="padding:8px 0">None.</div>';
 document.querySelectorAll('.shareChkV83').forEach(c=>c.onchange=updateShareReview);updateShareReview();
}
function selectedAssertions(){return[...document.querySelectorAll('.shareChkV83:checked')].map(c=>({credId:+c.dataset.cred,mode:c.dataset.mode,requirement:c.dataset.req||null,label:c.dataset.label}))}
function updateShareReview(){
 const a=getAssignment($('shareAssignV83').value),d=$('shareV7Duration').value;$('shareCustomRowV83').classList.toggle('hidden',d!=='CUSTOM_DATE');
 const exp=computeExpiry(d,a,$('shareCustomV83').value),sel=selectedAssertions(),priv=sel.filter(x=>x.mode==='REQUIREMENT_SATISFIED').length;
 $('shareReviewV83').innerHTML=`<b>Review before approving</b><br>Organization: <b>${ec(organization($('shareOrgV83').value)?.name||'')}</b> · Assignment: <b>${ec(a?.name||'')}</b><br>Sharing <b>${sel.length}</b> live assertion${sel.length===1?'':'s'} (${priv} as “Requirement Satisfied” only) · Source documents: <b>NOT SHARED</b><br>Access: <b>${ec(durationLabel(d))}</b> — ${d==='UNTIL_REVOKED'?'no expiration; you can revoke at any time':d==='CUSTOM_DATE'&&!exp?'choose a date':'expires '+ec(fmtDT(exp?.toISOString()))}${d==='ONE_TIME'?' or after the first view':''}. Views are logged. You can modify or revoke access at any time.`;
}
function approveShare(){
 const a=getAssignment($('shareAssignV83').value),d=$('shareV7Duration').value,cd=$('shareCustomV83').value,sel=selectedAssertions();
 if(!a){alert('Choose an assignment that accepts your specialty.');return}
 if(!sel.length){alert('Select at least one assertion to share.');return}
 if(d==='CUSTOM_DATE'&&(!cd||endOfDay(cd)<=new Date())){alert('Choose a future end date for custom access.');return}
 if(shareEditId){modifyShare(shareEditId,{assertions:sel,duration:d,customDate:cd});$('shareV7').close();render();return}
 const s=createShare({orgId:$('shareOrgV83').value,assignmentId:a.id,assertions:sel,duration:d,customDate:cd});
 const url=shareUrl(s);$('shareDoneV83').innerHTML=`<b>Shared with ${ec(s.orgName)}</b> for ${ec(s.assignmentName)} · ${sel.length} assertions · access ${ec(durationLabel(d))} (expires ${ec(expiryText(s))}).`;
 $('shareV7Link').textContent=url;$('shareFormV83').classList.add('hidden');$('shareV7Result').classList.remove('hidden');
 if(window.QRCode)QRCode.toCanvas($('shareV7QR'),url,{width:230,margin:2});render();
}
function openModifyShare(id){
 const s=loadShares().find(x=>x.id===id);if(!s)return;openShareDialog({orgId:s.orgId,assignmentId:s.assignmentId});
 shareEditId=id;$('shareTitleV83').textContent='MODIFY ACCESS';$('generateV7Share').textContent='Save Changes';$('shareOrgV83').disabled=true;$('shareAssignV83').disabled=true;
 $('shareV7Duration').value=s.duration;$('shareCustomV83').value=s.customDate||'';refreshShareOptions(s.assertions);
}
let extendId=null;
function openExtend(id){const s=loadShares().find(x=>x.id===id);if(!s)return;extendId=id;durationOptions($('extendDurV83'),false);$('extendDurV83').value='THROUGH_ASSIGNMENT_END';$('extendCustomV83').value='';$('extendCustomRowV83').classList.add('hidden');$('extendInfoV83').innerHTML=`${ec(s.orgName)} · ${ec(s.assignmentName)}<br>Currently: ${ec(durationLabel(s.duration))} · expires ${ec(expiryText(s))}`;$('extendDlgV83').showModal()}
function saveExtend(){const d=$('extendDurV83').value,cd=$('extendCustomV83').value;if(d==='CUSTOM_DATE'&&(!cd||endOfDay(cd)<=new Date())){alert('Choose a future end date.');return}extendShare(extendId,d,cd);$('extendDlgV83').close();render()}
function confirmRevoke(id){
 const s=loadShares().find(x=>x.id===id);if(!s)return;
 if(!confirm(`Revoke ${s.orgName}'s access to your Passport for ${s.assignmentName}?\n\nThey will immediately lose access to your live credential assertions through Veridun, and they will see that access was revoked.\n\nRevoking does not erase information the organization may already have viewed, downloaded, or saved in its own systems.`))return;
 revokeShare(id);render();
}
function showShareDetails(id){
 const s=loadShares().find(x=>x.id===id);if(!s)return;const st=shareStatus(s),live=s.assertions.map(x=>liveAssertion(x,s));
 const hist=v81Events().filter(e=>e.detail?.share_id===id).reverse();
 $('shareDetailBodyV83').innerHTML=`<div class="small"><b>${ec(s.orgName)}</b> · ${ec(s.assignmentName)} · <span class="badge ${st==='ACTIVE'?'ACCEPTED':'REVOKED'}">${st}</span></div><div class="small" style="margin:6px 0 10px">Shared ${ec(fmtDT(s.createdAt))} · ${ec(durationLabel(s.duration))} · expires ${ec(expiryText(s))} · ${s.views||0} view(s) · last accessed ${ec(fmtDT(s.lastAccessedAt))}</div>${liveAssertionsHtml(live)}<div class="share-option"><span><b>Source documents</b></span><span class="badge REVOKED">NOT SHARED</span></div><div style="font-weight:800;margin:12px 0 4px">History</div>${hist.map(e=>`<div class="activity-v83">${ec(activityText(e))}<div class="small">${ec(fmtDT(e.timestamp))}</div></div>`).join('')||'<div class="small">No events.</div>'}`;
 $('shareDetailDlgV83').showModal();
}
/* ---- Share & Access page (pure render) ---- */
function shareCardHtml(s,st,pendingReq){
 const acts=[`<button class="mini shareAct" data-act="details" data-id="${s.id}">View Details</button>`];
 if(st==='ACTIVE')acts.push(`<button class="mini shareAct" data-act="modify" data-id="${s.id}">Modify Access</button>`,`<button class="mini shareAct" data-act="extend" data-id="${s.id}">Extend</button>`,`<button class="mini shareAct" data-act="revoke" data-id="${s.id}" style="color:var(--r)">Revoke Access</button>`);
 if(st==='EXPIRED')acts.push(`<button class="mini shareAct" data-act="extend" data-id="${s.id}">Extend</button>`);
 return`<div class="share-card-v83"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>${ec(s.orgName)}</b><div class="small">${ec(s.assignmentName)}</div></div><span class="badge ${st==='ACTIVE'?'ACCEPTED':st==='EXPIRED'?'PENDING':'REVOKED'}">${st}</span></div>
<div class="meta"><div>Assertions<br><b>${s.assertions.length}</b></div><div>Started<br><b>${ec(fmtDT(s.createdAt))}</b></div><div>Expires<br><b>${ec(st==='REVOKED'?'Revoked '+fmtDT(s.revokedAt):expiryText(s))}</b></div><div>Access<br><b>${ec(durationLabel(s.duration))}</b></div><div>Last accessed<br><b>${ec(fmtDT(s.lastAccessedAt))}</b></div><div>Status<br><b>${st}${pendingReq?' · extension requested':''}</b></div></div>
<details><summary class="small">Shared assertions</summary><div class="small">${s.assertions.map(x=>ec(x.label)+(x.mode==='REQUIREMENT_SATISFIED'?' (Requirement Satisfied)':'')).join(' · ')} · Source documents: NOT SHARED</div></details><div class="acts" style="margin-top:8px">${acts.join('')}</div></div>`;
}
function renderShareAccess(){
 if(!$('shareActiveV83'))return;
 const sh=loadShares(),rq=loadShareRequests(),pend=rq.filter(r=>r.status==='PENDING'),by=st=>sh.filter(s=>shareStatus(s)===st).reverse();
 const card=s=>shareCardHtml(s,shareStatus(s),pend.some(r=>r.shareId===s.id)),empty=t=>`<div class="small" style="padding:8px 0">${t}</div>`;
 $('shareActiveV83').innerHTML=by('ACTIVE').map(card).join('')||empty('No active shares. Use Share Passport to grant an organization access for one assignment.');
 $('sharePendingV83').innerHTML=pend.map(r=>`<div class="share-card-v83"><b>${ec(r.orgName)}</b> requests access through <b>${ec(fd(r.requestedUntil))} 11:59 PM</b><div class="small">${ec(r.assignmentName)}${r.reason?' · “'+ec(r.reason)+'”':''} · requested ${ec(fmtDT(r.createdAt))}</div><div class="acts" style="margin-top:8px"><button class="mini goodbtn reqAct" data-act="APPROVED" data-id="${r.id}">Approve</button><button class="mini reqAct" data-act="DECLINED" data-id="${r.id}">Decline</button></div></div>`).join('')||empty('No pending requests.');
 $('shareExpiredV83').innerHTML=by('EXPIRED').map(card).join('')||empty('None.');
 $('shareRevokedV83').innerHTML=by('REVOKED').map(card).join('')||empty('None.');
 $('shareActivityV83').innerHTML=eventsSinceSeed().slice().reverse().slice(0,40).map(e=>`<div class="activity-v83">${ec(activityText(e))}<div class="small">${ec(fmtDT(e.timestamp))} · ${ec(e.actor_type)}</div></div>`).join('')||empty('No activity yet.');
 document.querySelectorAll('.shareAct').forEach(b=>b.onclick=()=>({details:showShareDetails,modify:openModifyShare,extend:openExtend,revoke:confirmRevoke})[b.dataset.act](b.dataset.id));
 document.querySelectorAll('.reqAct').forEach(b=>b.onclick=()=>{resolveShareRequest(b.dataset.id,b.dataset.act);render()});
}
function activityText(e){
 const d=e.detail||{},c=e.credential_id?creds.find(x=>x.id===e.credential_id):null,cn=c?c.name:'credential',w=`${d.org||''}${d.assignment?' · '+d.assignment:''}`;
 return({
  SHARE_CREATED:`Shared Passport with ${w} — ${e.result}; ${(d.assertions||[]).length} assertions; documents not shared`,
  SHARE_VIEWED:`${d.org} viewed your shared Passport (${(d.assertionsAccessed||[]).length} assertions: ${(d.assertionsAccessed||[]).join(', ')})`,
  SHARE_SCOPE_CHANGED:`Modified access for ${w}${d.added?.length?' · added '+d.added.join(', '):''}${d.removed?.length?' · removed '+d.removed.join(', '):''}${d.durationFrom!==d.durationTo?' · '+durationLabel(d.durationFrom)+' → '+durationLabel(d.durationTo):''}`,
  SHARE_EXTENSION_REQUESTED:`${d.org} requested access through ${fd(d.requestedUntil)} (${d.assignment})`,
  SHARE_EXTENDED:`Extended access for ${w} → ${d.expiresTo?fmtDT(d.expiresTo):'until revoked'}${d.via==='ORGANIZATION_REQUEST'?' (approved request)':''}`,
  SHARE_EXTENSION_DECLINED:`Declined extension request from ${d.org}`,
  SHARE_REVOKED:`Revoked Passport access for ${w}`,
  ASSIGNMENT_PUBLISHED:`${d.org||'Organization'} published ${d.name} (${(d.specialties||[]).map(specialtyShort).join(' / ')})`,
  MONITORING_RUN:`Monitoring check (simulated): ${e.result}`,CREDENTIAL_REVOKED:`${cn} revoked by issuer (simulated)`,CREDENTIAL_REINSTATED:`${cn} reinstated after simulated re-check`,CREDENTIAL_EXPIRED:`${cn} expired (monitoring)`,CREDENTIAL_RENEWED:`${cn} renewed — replaces the previous record${e.detail?.previous_expiration?' (expired '+fd(e.detail.previous_expiration)+')':''}`,
  MANUAL_REVIEW_APPROVED:`${cn} approved after manual review`,MANUAL_REVIEW_REJECTED:`${cn} rejected after manual review`,
  SHARE_EXPIRED:`Access expired for ${w}${e.result&&e.result.startsWith('ACCESS_REFUSED')?' — a view attempt was refused':''}`,
  CREDENTIAL_UPLOADED:`Added ${cn}`,CLASSIFICATION_COMPLETED:`Classified ${cn} as ${d.kind||''}${d.jurisdiction?' · '+d.jurisdiction:''}`,
  VERIFICATION_STARTED:`${cn} entered the verification queue`,VERIFICATION_SUCCEEDED:`${cn} verified (simulated check)`,VERIFICATION_FAILED:`${cn} verification failed (${e.result})`,SOURCE_CHECK_COMPLETED:`Simulated source check completed for ${cn}`,
  ASSIGNMENT_INTEREST:`Started completing ${getAssignment(e.assignment_id)?.name||e.assignment_id} (${e.result})`,ASSIGNMENT_READY:`${getAssignment(e.assignment_id)?.name||e.assignment_id} is assignment ready (${e.result})`,
  DEMO_SEEDED:'Demo data seeded'
 })[e.event_type]||e.event_type;
}

/* ---- Passport view (handoff §38): grouped, verification-first ---- */
const PASSPORT_GROUPS=[
 {title:'Licenses & Practice Authorization',cats:['Licenses']},
 {title:'Certifications',cats:['Certifications']},
 {title:'Clinical Qualifications',cats:['Clinical Qualifications']},
 {title:'Employment Experience',cats:['Employment & HR']},
 {title:'Education',cats:['Education']},
 {title:'Health & Screening',cats:['Employee Health','Background & Screening'],note:'Private: organizations only ever see “Requirement Satisfied”.'},
 {title:'Additional Professional Qualifications',cats:['Additional Professional Qualifications']}
];
function passportRowHtml(c){const d=daysUntil(credExpiry(c));return`<div class="passport-item-v7"><div><b>✓ ${ec(c.name)}</b><div class="small">${ec(c.prov?.source||'Verified source')}${credExpiry(c)?' · expires '+fd(credExpiry(c))+(d!=null&&d<=90?` <span class="exp-chip-v85">expires in ${d}d</span>`:''):''}</div></div><div class="pass-badges-v84">${verificationBadgeHtml(c)} ${proofLabelHtml(c)} <button class="mini details" data-id="${c.id}">View</button></div></div>`}
function renderPassportView(){
 if(!$('v7PassportSections'))return;
 const live=creds.filter(isCurrentVerified),auth=practiceAuthorization(),soon=live.filter(c=>{const d=daysUntil(credExpiry(c));return d!=null&&d<=90}).length;
 if($('v7PassportHeroV85'))$('v7PassportHeroV85').innerHTML=`<b>${ec(DEMO_PROFILE.name)}, ${ec(DEMO_PROFILE.credentials)}</b> · ${ec(specialtyName(DEMO_PROFILE.specialty))} · home state ${ec(jurisdictionName(DEMO_PROFILE.homeState))}`;
 $('v7PassportSummaryV85').innerHTML=`<span class="chip">${live.length} verified &amp; current</span><span class="chip">Authorized to practice in ${auth.size} jurisdictions</span><span class="chip">${soon} expiring ≤90 days</span><span class="chip">${live.filter(c=>c.privateOnly).length} private</span><span class="demo-tag-v81">DEMO DATA</span>`;
 const lic=[...auth.entries()],single=lic.filter(x=>x[1]==='single-state license').map(x=>x[0]),ms=lic.find(x=>x[1]==='multistate home');
 $('v7PassportSections').innerHTML=PASSPORT_GROUPS.map(g=>{
  const arr=live.filter(c=>g.cats.includes(catFor(c)));if(!arr.length)return'';
  const extra=g.cats[0]==='Licenses'?`<div class="small pass-auth-v85">Practice authorization: ${ms?`multistate (NLC) from ${ec(jurisdictionName(ms[0]))} — privilege in ${lic.filter(x=>x[1]==='NLC privilege').length+1} compact jurisdictions`:'no multistate license'}${single.length?` · single-state: ${single.map(j=>ec(jurisdictionName(j))).join(', ')}`:''}</div>`:'';
  return`<div class="task-category-v7"><div class="cathead"><b>${ec(g.title)}</b><span class="chip">${arr.length}</span></div>${g.note?`<div class="small pass-auth-v85">${ec(g.note)}</div>`:''}${extra}${arr.map(passportRowHtml).join('')}</div>`;
 }).join('');
}
/* ---- Task Center (handoff §39) ---- */
let renewalTargetV85=null;
function openRenewal(id){const c=creds.find(x=>x.id===id);if(!c)return;openAddForm({kind:c.kind,jurisdiction:c.jurisdiction||'',context:`Renewing <b>${ec(c.name)}</b> (current one expires ${fd(credExpiry(c))}). The renewed credential goes through verification; once verified it replaces the current record and any live shares update automatically.`});renewalTargetV85=c.id}
function taskRow(name,sub,btn){return`<div class="task-item-v7"><div><b>${ec(name)}</b><div class="small">${sub}</div></div>${btn||''}</div>`}
function renderTaskCenter(){
 if(!$('v7TaskCategories'))return;const t=taskSections(),cat=c=>ec(catFor(c));
 const sec=(id,title,hint,rows,empty,open=true)=>`<div class="task-category-v7 task-sec-v85" id="${id}"><div class="cathead"><b>${title}</b><span class="chip">${rows.length}</span></div><div class="small task-hint-v85">${hint}</div>${rows.length?(open?rows.join(''):`<details><summary class="small">Show ${rows.length}</summary>${rows.join('')}</details>`):`<div class="small task-empty-v85">${empty}</div>`}</div>`;
 $('v7TaskCategories').innerHTML=[
  sec('taskReqV85','Required Before Submission','Blocking at least one opportunity that accepts your specialty.',t.required.map(b=>taskRow(b.item.label,`${ec(b.item.note||'Missing')} · for ${b.assignments.map(a=>ec(a.name)).join(', ')}`,`<button class="mini pri" onclick="completeMissingRequirement('${b.assignments[0].id}')">Complete</button>`)),'Nothing is blocking your opportunities.'),
  sec('taskExp30V85','Expiring Within 30 Days','Renew now to stay assignment-ready.',t.exp30.map(x=>taskRow(x.c.name,`${cat(x.c)} · expires ${fd(credExpiry(x.c))} (${x.d} days)${x.renewing?' · renewal submitted — awaiting verification':''}`,x.renewing?'<span class="badge PENDING">RENEWAL PENDING</span>':`<button class="mini pri" onclick="openRenewal(${x.c.id})">Renew</button>`)),'Nothing expires in the next 30 days.'),
  sec('taskRenewV85','Renewal Recommended','Expires in 31–90 days.',t.renew.map(x=>taskRow(x.c.name,`${cat(x.c)} · expires ${fd(credExpiry(x.c))} (${x.d} days)${x.renewing?' · renewal submitted — awaiting verification':''}`,x.renewing?'<span class="badge PENDING">RENEWAL PENDING</span>':`<button class="mini" onclick="openRenewal(${x.c.id})">Renew</button>`)),'No renewals due in the next 90 days.'),
  sec('taskAwaitV85','Awaiting Verification','In the Verification Console queue (simulated checks).',t.awaiting.map(c=>taskRow(c.name,`${cat(c)} · ${ec(verificationBadge(c).text)}${c.renews?' · renewal — replaces the current record once verified':''}`,`<button class="mini details" data-id="${c.id}">Open</button>`)),'Nothing is waiting for verification.'),
  sec('taskMissingV85','Missing','Onboarding-baseline items not on your Passport, and credentials that need replacing.',t.missing.map(m=>m.c?taskRow(m.c.name,`${cat(m.c)} · ${ec(m.reason)}`,`<button class="mini pri" onclick="openRenewal(${m.c.id})">Replace</button>`):taskRow(catalogKind(m.kind)?.label||m.kind,ec(m.reason),`<button class="mini pri" onclick="openAddForm({kind:'${m.kind}'})">Add</button>`)),'Nothing missing from your onboarding baseline.'),
  sec('taskCompleteV85','Complete','Verified and current — reusable across assignments.',t.complete.map(c=>taskRow('✓ '+c.name,`${cat(c)}${credExpiry(c)?' · expires '+fd(credExpiry(c)):''} · ${ec(verificationBadge(c).text)}`,`<button class="mini details" data-id="${c.id}">View</button>`)),'No completed items yet.',false)
 ].join('');
}
/* ---- Clinician dashboard (handoff §37) ---- */
function renderHomeDashboard(){
 if(!$('homeReadyV85'))return;
 const elig=eligibleAssignments(),rs=elig.map(a=>({a,r:v81Assignment(a)})),ready=rs.filter(x=>x.r.ready).length,auth=practiceAuthorization(),live=creds.filter(isCurrentVerified);
 $('homeReadyV85').innerHTML=`<div class="big-v85">${ready}<span>/${rs.length}</span></div><div class="small">opportunities you could submit to today (${ec(specialtyShort(DEMO_PROFILE.specialty))} specialty)</div>
<ul class="kv-v85"><li><b>${live.length}</b> verified credentials reusable across assignments</li><li>Authorized to practice in <b>${auth.size}</b> US jurisdictions</li><li>Passport readiness <b>${v7Readiness()}%</b> of your onboarding baseline</li></ul>`;
 const pursued=pursuedAssignmentIds(),shares=loadShares();
 $('homeAssignV85').innerHTML=rs.sort((x,y)=>(pursued.has(y.a.id)-pursued.has(x.a.id))||x.a.start.localeCompare(y.a.start)).map(({a,r})=>{const sh=shares.filter(s=>s.assignmentId===a.id).reverse()[0],st=sh?shareStatus(sh):null;
  return`<div class="home-assign-v85"><div><b>${ec(a.name)}</b>${pursued.has(a.id)?' <span class="chip">pursuing</span>':''}<div class="small">${ec(organization(a.orgId)?.name||'')} · ${a.start} → ${a.end}</div><div class="small">${st?`Passport access: <b>${st}</b>`:'Passport not shared'}</div></div><span class="badge ${r.ready?'READY':'PENDING'}">${r.ok}/${r.total}${r.ready?' READY':''}</span></div>`}).join('')+`<button class="sec mini" onclick="showV7View('opportunitiesView')" style="margin-top:8px">All opportunities</button>`;
 const att=clinicianAttention();
 $('homeAttnV85').innerHTML=att.length?att.slice(0,8).map(x=>`<div class="attn-v85"><span class="attn-ic-v85">${x.icon}</span><div><b>${ec(x.text)}</b><div class="small">${ec(x.sub)}</div></div>${x.action?`<button class="mini" onclick="${x.action.fn}">${x.action.label}</button>`:''}</div>`).join('')+(att.length>8?`<div class="small">+${att.length-8} more in the Task Center</div>`:''):'<div class="small">Nothing needs your attention. 🎉</div>';
}
