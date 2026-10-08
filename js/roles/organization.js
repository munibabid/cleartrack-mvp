/* Organization workspace. Alex Morgan's readiness is computed live by the
   readiness engine; the other candidates are static demo rows (labeled). */
function v81RoleContext(){
 const assignments=getAssignments(),featured=featuredAssignment(),b=v81Assignment(featured);
 const ev=eventsSinceSeed(),pending=creds.filter(c=>['UNVERIFIED','VERIFYING'].includes(c.primary)),med=v81Median(v81Durations());
 const exp=creds.filter(c=>{const d=credExpiry(c);if(!d)return false;return Math.ceil((new Date(d)-new Date())/86400000)<=90}).length;
 return{assignments,featured,b,ev,pending,med,exp};
}
function readinessItemHtml(i){
 const icon={MET:'✓',PENDING_VERIFICATION:'⏳',EXPIRES_BEFORE_END:'⚠',NOT_RECENT:'⚠',MISSING:'○'}[i.status];
 const sub=i.status==='MET'?i.basis:(i.note||'Missing');
 return`<li><b>${icon}</b> ${ec(i.label)}${i.layer?` <span class="layer-tag-v84 layer-${i.layer}">${LAYERS[i.layer]}</span>`:''} <span class="small">· ${ec(sub)}</span>${i.authority?`<div class="small auth-v84">Required by: ${ec(i.authority)}</div>`:''}</li>`;
}
function v81RenderOrganization(x){
 const{assignments,featured,b,ev,pending,med,exp}=x;
 const rows=[{name:`${DEMO_PROFILE.name}, ${DEMO_PROFILE.credentials}`,specialty:DEMO_PROFILE.specialty,ok:b.ok,total:b.total,live:true,status:b.ready?'Assignment Ready':`Missing ${b.missing.length}`},...DEMO_CANDIDATES];
 const am=assignmentMetrics(featured.id,ev);
 const set=(id,v)=>{if($(id))$(id).textContent=v};
 const om=orgMetrics(orgViewAs);
 set('orgReadyV81',om.ready);set('orgMissingOneV81',om.missingOne);
 set('orgAwaitV81',pending.length);set('orgExpV81',om.expiring);set('orgAccessActiveV85',om.accessActive);set('orgMedV81',v81Fmt(med));
 if($('orgMetricsNoteV85'))$('orgMetricsNoteV85').textContent=`${organization(orgViewAs)?.name}: ${om.pairs} candidate × opportunity pairs across ${om.assignments} opportunities, computed live for Alex (live Passport) and the demo nurses; static comparison rows excluded. Median verification and reuse come from the event log. DEMO DATA.`;
 renderOrgAttention(om);renderOrgActivity();
 set('orgReuseV81',am?fmtPct(am.reuseRate):'—');
 set('orgFeaturedTitleV82',`${featured.name} · ${jurisdictionName(featured.jurisdiction)} · ${featured.start} → ${featured.end}`);
 renderOrgAccess();
 if($('orgSummaryV81'))$('orgSummaryV81').innerHTML=rows.map(r=>`<div class="row-v81"><div><b>${ec(r.name)}</b><div class="small">${ec(r.specialty)} · ${ec(featured.name)}${r.live?'':' · <span class="demo-tag-v81">STATIC DEMO</span>'}</div>${r.live?`<div class="small">${passportAccessLine(orgViewAs)}</div>`:''}</div><div><b>${r.ok}/${r.total} Ready</b><div class="small">${r.live?(b.ready?'Assignment Ready':'Missing: '+ec(b.missing.join(', '))):ec(r.status)}</div></div></div>`).join('');
 if($('orgBostonV81'))$('orgBostonV81').innerHTML=`<div class="${b.ready?'good-v81':'alert-v81'}"><b>${b.ok}/${b.total} Requirements Satisfied${b.ready?' — ASSIGNMENT READY':''}</b><div style="margin-top:4px">${b.ready?'All mandatory requirements satisfied and current through the assignment end date.':'Missing: '+ec(b.missing.join(', '))}</div></div><ul class="req-list">${b.items.map(readinessItemHtml).join('')}</ul>`;
 if($('orgCandidatesBodyV81'))$('orgCandidatesBodyV81').innerHTML=`<table class="v81-table"><tr><th>Candidate</th><th>Specialty</th><th>${ec(featured.name)}</th><th>Status</th><th>Passport Access</th></tr>${rows.map(r=>`<tr><td>${ec(r.name)}</td><td>${ec(r.specialty)}</td><td>${r.ok}/${r.total}</td><td>${ec(r.status)}</td><td>${r.live?passportAccessLine(orgViewAs):'— (static demo)'}</td></tr>`).join('')}</table>`;
 if($('orgAssignmentsBodyV81'))$('orgAssignmentsBodyV81').innerHTML=assignments.map(orgAssignmentHtml).join('');
 renderRequirementSets();
 const rt=am?.readinessMs;
 if($('orgAnalyticsBodyV81'))$('orgAnalyticsBodyV81').innerHTML=`<table class="v81-table">
<tr><td>Credential reuse (${ec(featured.name)})</td><td><b>${am?`${fmtPct(am.reuseRate)} (${am.reused}/${am.total} from existing Passport)`:'—'}</b></td></tr>
<tr><td>New credentials required</td><td><b>${am?.newCredentialsRequired??'—'}</b></td></tr>
<tr><td>Assignment-readiness time (interest → ready)</td><td><b>${rt!=null?v81Fmt(rt):am?'Not ready yet':'—'}</b></td></tr>
<tr><td>Median verification time</td><td><b>${v81Fmt(med)}</b></td></tr>
<tr><td>Manual touches</td><td><b>${manualTouches(ev)}</b></td></tr>
${(m=>`<tr><td>Passport shares created</td><td><b>${m.created}</b></td></tr><tr><td>Share views (assertions accessed)</td><td><b>${m.views} (${m.assertionsAccessed})</b></td></tr><tr><td>Scope changes / extensions</td><td><b>${m.scopeChanges} / ${m.extended}</b></td></tr><tr><td>Extension requests (pending)</td><td><b>${m.requested} (${m.pending})</b></td></tr><tr><td>Revoked / expired</td><td><b>${m.revoked} / ${m.expired}</b></td></tr>`)(shareMetrics(ev))}
<tr><td>Events this demo session</td><td><b>${ev.length}</b></td></tr></table>
<p class="small">Computed from this browser's demo event log (since the last demo reset). Reuse and readiness time appear after the clinician starts completing an assignment. DEMO DATA — NOT PRODUCTION RESULTS.</p>`;
}

/* ---- Passport access as seen by an organization ---- */
let orgViewAs='northstar';
function orgShares(orgId){return loadShares().filter(s=>s.orgId===orgId)}
function passportAccessLine(orgId){
 const sh=orgShares(orgId).reverse(),act=sh.find(s=>shareStatus(s)==='ACTIVE');
 if(act)return`<span class="badge ACCEPTED">PASSPORT ACCESS: ACTIVE</span> ${ec(act.assignmentName)} · expires ${ec(expiryText(act))}`;
 const last=sh[0];if(!last)return'<span class="badge NOTISSUED">NO PASSPORT SHARED</span>';
 const st=shareStatus(last);
 if(st==='REVOKED')return`<span class="badge REVOKED">PASSPORT ACCESS REVOKED BY CLINICIAN</span> ${ec(fmtDT(last.revokedAt))}`;
 return`<span class="badge PENDING">PASSPORT ACCESS EXPIRED</span> ${ec(fmtDT(last.expiresAt))}`;
}
function orgShareCard(s){
 const st=shareStatus(s),req=loadShareRequests().find(r=>r.shareId===s.id&&r.status==='PENDING');
 let body,acts='';
 if(st==='REVOKED')body=`<div class="alert-v81" style="margin-top:6px"><b>PASSPORT ACCESS REVOKED BY CLINICIAN</b><div>${ec(fmtDT(s.revokedAt))}</div></div>`;
 else{body=`<div class="small">Access: ${ec(durationLabel(s.duration))} · expires ${ec(expiryText(s))} · ${s.assertions.length} assertions · last accessed ${ec(fmtDT(s.lastAccessedAt))}</div>`;
  if(st==='EXPIRED')body+=`<div class="alert-v81" style="margin-top:6px"><b>PASSPORT ACCESS EXPIRED</b></div>`;
  if(st==='ACTIVE')acts+=`<button class="pri orgShareAct" data-act="view" data-id="${s.id}">Open Shared Passport</button>`;
  acts+=req?`<span class="small"> Extension requested through ${ec(fd(req.requestedUntil))} — awaiting clinician approval</span>`:`<button class="sec orgShareAct" data-act="extend" data-id="${s.id}">Request Access Extension</button>`;}
 return`<div class="row-v81" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>${ec(DEMO_PROFILE.name)}</b><div class="small">${ec(s.assignmentName)} · shared ${ec(fmtDT(s.createdAt))}</div></div><span class="badge ${st==='ACTIVE'?'ACCEPTED':st==='EXPIRED'?'PENDING':'REVOKED'}">${st==='ACTIVE'?'ACTIVE':st}</span></div>${body}<div class="actions" style="margin-top:8px">${acts}</div></div>`;
}
function renderOrgAccess(){
 if($('orgViewAsV83')&&!$('orgViewAsV83').options.length){$('orgViewAsV83').innerHTML=ORGANIZATIONS.map(o=>`<option value="${o.id}">${ec(o.name)}</option>`).join('');$('orgViewAsV83').onchange=()=>{orgViewAs=$('orgViewAsV83').value;v81RenderRoles()}}
 if($('orgViewAsV83'))$('orgViewAsV83').value=orgViewAs;
 const sh=orgShares(orgViewAs).reverse(),html=sh.map(orgShareCard).join('')||`<div class="small">No Passports have been shared with ${ec(organization(orgViewAs)?.name||'')} yet.</div>`;
 if($('orgAccessV83'))$('orgAccessV83').innerHTML=`<div class="small" style="margin-bottom:6px">${ec(DEMO_PROFILE.name)}: ${passportAccessLine(orgViewAs)}</div>`+(sh.length?orgShareCard(sh[0]):'');
 if($('orgSharesBodyV83'))$('orgSharesBodyV83').innerHTML=html;
 document.querySelectorAll('.orgShareAct').forEach(b=>b.onclick=()=>b.dataset.act==='view'?orgOpenShare(b.dataset.id):orgOpenExtReq(b.dataset.id));
}
function orgOpenShare(id){
 const s=loadShares().find(x=>x.id===id);if(!s)return;const r=accessShare(s.token,'ORGANIZATION');
 $('orgShareViewBodyV83').innerHTML=r.ok?`<div class="notice" style="margin:0 0 10px"><b>${ec(DEMO_PROFILE.name)}, ${ec(DEMO_PROFILE.credentials)}</b> · shared with ${ec(s.orgName)} for ${ec(s.assignmentName)}<br>Access expires ${ec(expiryText(r.share))} · this view is logged and visible to the clinician.</div>${liveAssertionsHtml(r.live)}<div class="share-option"><span><b>Source documents</b></span><span class="badge REVOKED">NOT SHARED</span></div>`:`<div class="alert-v81">${refusalHtml(r)}</div>`;
 $('orgShareViewDlgV83').showModal();v81RenderRoles();
}
let extReqShareId=null;
function orgOpenExtReq(id){const s=loadShares().find(x=>x.id===id);if(!s)return;extReqShareId=id;const a=getAssignment(s.assignmentId);$('extReqInfoV83').innerHTML=`${ec(s.orgName)} → ${ec(DEMO_PROFILE.name)} · ${ec(s.assignmentName)}<br>Current access expires ${ec(expiryText(s))}`;$('extReqDateV83').value=a?isoDay(addDays(endOfDay(a.end),28)):'';$('extReqReasonV83').value='';$('extReqDlgV83').showModal()}
function orgSendExtReq(){const d=$('extReqDateV83').value;if(!d||endOfDay(d)<=new Date()){alert('Choose a future date.');return}requestShareExtension(extReqShareId,d,$('extReqReasonV83').value.trim());$('extReqDlgV83').close();v81RenderRoles()}

/* ---- Layered requirement sets (org) ---- */
function layerSummaryHtml(a,reqs){const c=layerCounts(reqs),w=(a.overrides?.waive||[]).length;return`<span class="layer-tag-v84 layer-STATE">State ${c.STATE}</span> <span class="layer-tag-v84 layer-WORK_TYPE">Work type ${c.WORK_TYPE}</span> <span class="layer-tag-v84 layer-SPECIALTY">Specialty ${c.SPECIALTY}</span> <span class="layer-tag-v84 layer-FACILITY">Facility +${c.FACILITY}${w?' / waived '+w:''}</span>`}
function assignmentMetaHtml(a){const org=organization(a.orgId);return`<div class="small">${org?ec(org.name)+' · ':''}${ec(a.facility||'')}</div><div class="small">${ec(a.workTypeName)} · accepts <b>${ec(a.specialtyText)}</b> · ${ec(jurisdictionName(a.jurisdiction))} (${ec(a.jurisdiction)}) · ${ec(nlcStatusLabel(a.jurisdiction))} · ${a.start} → ${a.end}</div>${a.overrides?.note?`<div class="small">Facility override: ${ec(a.overrides.note)}</div>`:''}`}
function nurseReadinessHtml(a,n){
 const r=v81Assignment(a,n),who=`<b>${ec(n.name)}</b> <span class="small">· ${ec(specialtyShort(n.specialty))}${n.live?' · live Passport':''}</span>${n.live?'':' <span class="demo-tag-v81">DEMO NURSE</span>'}`;
 if(!r.eligible)return`<div class="nurse-row-v84">${who} <span class="small">— specialty not accepted for this opportunity</span></div>`;
 return`<details class="nurse-row-v84"><summary>${who} · ${ec(specialtyShort(n.specialty))} module · <b>${r.ok}/${r.total}</b> ${r.ready?'<span class="badge READY">READY</span>':'<span class="small">'+r.missing.length+' missing</span>'}</summary><div style="margin:6px 0">${layerSummaryHtml(a,r.reqs)}</div><ul class="req-list">${r.items.map(readinessItemHtml).join('')}</ul></details>`;
}
function orgAssignmentHtml(a){return`<div class="row-v81" style="display:block"><div><b>${ec(a.name)}</b>${a.custom?' <span class="demo-tag-v81">BUILT IN THIS BROWSER</span>':''}${assignmentMetaHtml(a)}</div><div style="margin-top:8px">${DEMO_NURSES.map(n=>nurseReadinessHtml(a,n)).join('')}</div></div>`}
function kindItem(k){return`<li>${ec(catalogKind(k)?.label||k)}${catalogPrivacy(k)==='PRIVATE'?' <span class="small">· private (status only)</span>':''}</li>`}
function renderRequirementSets(){
 if(!$('orgRequirementsBodyV81'))return;
 const all=getAssignments(),ovr=all.filter(a=>(a.overrides?.add||[]).length||(a.overrides?.waive||[]).length);
 $('orgRequirementsBodyV81').innerHTML=`<div class="layers-v84">
<div class="layer-step-v84"><span class="layer-tag-v84 layer-STATE">1 · State</span><div class="small">RN authorization where the nurse will practice: a single-state license there, or an NLC multistate license where the compact is in effect. Authority: that state's board of nursing (${US_JURISDICTIONS.length} US jurisdictions).</div></div>
<div class="layer-step-v84"><span class="layer-tag-v84 layer-WORK_TYPE">2 · Work type</span><div class="small">Base set for the kind of work (Travel, Strike, Rapid Response, Per-Diem).</div></div>
<div class="layer-step-v84"><span class="layer-tag-v84 layer-SPECIALTY">3 · Specialty</span><div class="small">Module for the <b>nurse's own profile specialty</b>, applied only if the opportunity accepts it. The same opportunity can ask an ICU, ED and L&D nurse for different items.</div></div>
<div class="layer-step-v84"><span class="layer-tag-v84 layer-FACILITY">4 · Facility</span><div class="small">Assignment or facility overrides that add or waive items.</div></div>
<div class="layer-step-v84"><span class="layer-tag-v84">Dates</span><div class="small">Every item must stay current through the assignment end date.</div></div></div>
<h4 class="sec-h-v84">Work-type base sets</h4>${WORK_TYPE_BASES.map(w=>`<div class="row-v81" style="display:block"><details><summary><b>${ec(w.name)}</b> <span class="small">· ${ec(w.summary)} · ${w.kinds.length} items · demo template</span></summary><ul class="req-list">${w.kinds.map(kindItem).join('')}</ul></details></div>`).join('')}
<h4 class="sec-h-v84">Specialty modules</h4>${SPECIALTIES.map(sp=>`<div class="row-v81" style="display:block"><details><summary><b>${ec(sp.name)}</b> <span class="small">· ${(SPECIALTY_MODULES[sp.id]||[]).length} items · demo template · nurses: ${DEMO_NURSES.filter(n=>n.specialty===sp.id).map(n=>ec(n.name)).join(', ')||'—'}</span></summary><ul class="req-list">${(SPECIALTY_MODULES[sp.id]||[]).map(kindItem).join('')}</ul></details></div>`).join('')}
<h4 class="sec-h-v84">Facility overrides</h4>${ovr.map(a=>`<div class="row-v81" style="display:block"><b>${ec(a.facility||a.name)}</b> <span class="small">· ${ec(a.name)}</span><ul class="req-list">${(a.overrides.add||[]).map(k=>`<li>+ ${ec(catalogKind(k)?.label||k)}</li>`).join('')}${(a.overrides.waive||[]).map(k=>`<li>− waived: ${ec(catalogKind(k)?.label||k)}</li>`).join('')}</ul>${a.overrides.note?`<div class="small">${ec(a.overrides.note)}</div>`:''}</div>`).join('')||'<div class="small">None.</div>'}`;
 abInit();abPreview();renderCustomAssignments();
}
/* ---- Assignment builder ---- */
const AB_EXCLUDE=new Set(['RN_LICENSE','RN_LICENSE_MULTISTATE','OTHER','EDU_ADN']);
function chipHtml(cls,val,label,checked){return`<label class="chip-v84"><input type="checkbox" class="${cls}" value="${ec(val)}"${checked?' checked':''}> ${ec(label)}</label>`}
function abInit(){
 if(!$('abWorkTypeV84')||$('abWorkTypeV84').options.length)return;
 $('abWorkTypeV84').innerHTML=WORK_TYPE_BASES.map(w=>`<option value="${w.id}">${ec(w.name)}</option>`).join('');$('abWorkTypeV84').value='STRIKE_RN';
 $('abStateV84').innerHTML=US_JURISDICTIONS.map(j=>`<option value="${j.code}">${ec(j.name)} (${j.code}) · ${ec(nlcStatusLabel(j.code))}</option>`).join('');$('abStateV84').value='US-CA';
 $('abStartV84').value=isoDay(addDays(demoAnchor(),30));
 $('abSpecV84').innerHTML=SPECIALTIES.map(sp=>chipHtml('abSpec',sp.id,sp.name,sp.id!=='MEDSURG')).join('');
 $('abAddV84').innerHTML=CREDENTIAL_CATALOG.filter(k=>!AB_EXCLUDE.has(k.kind)&&!k.kind.startsWith('QUAL_')).map(k=>chipHtml('abAdd',k.kind,k.short||k.label,false)).join('');
 abFillWaive();
 ['abNameV84','abFacilityV84','abStartV84','abWeeksV84','abNoteV84'].forEach(id=>$(id).oninput=abPreview);
 $('abStateV84').onchange=abPreview;$('abWorkTypeV84').onchange=()=>{abFillWaive();abPreview()};
 $('abSpecV84').onchange=abPreview;$('abAddV84').onchange=abPreview;$('abWaiveV84').onchange=abPreview;
 $('abPublishV84').onclick=abPublish;
}
function abFillWaive(){const w=workTypeBase($('abWorkTypeV84').value);$('abWaiveV84').innerHTML=w.kinds.map(k=>chipHtml('abWaive',k,catalogKind(k)?.short||k,false)).join('')}
const abChecked=cls=>[...document.querySelectorAll('.'+cls+':checked')].map(c=>c.value);
function abDraft(){
 const start=$('abStartV84').value,weeks=Math.max(1,Math.min(52,+$('abWeeksV84').value||13)),name=$('abNameV84').value.trim(),fac=$('abFacilityV84').value.trim();
 const end=start?isoDay(addDays(new Date(start+'T12:00:00'),weeks*7)):'';
 return{id:'custom-'+Date.now(),orgId:orgViewAs,name:name||'Untitled assignment',city:'',jurisdiction:$('abStateV84').value,workType:$('abWorkTypeV84').value,specialties:abChecked('abSpec'),facility:(fac||'Unnamed facility')+' (demo facility)',overrides:{add:abChecked('abAdd'),waive:abChecked('abWaive'),note:$('abNoteV84').value.trim()},start,end,weeks,custom:true};
}
function abPreview(){
 if(!$('abPreviewV84'))return;const d=abDraft();
 if(!d.specialties.length){$('abPreviewV84').innerHTML='<div class="alert-v81">Select at least one accepted specialty.</div>';return}
 const a=finishAssignment(d,d.start,d.end);
 $('abPreviewV84').innerHTML=`<div style="font-weight:800;margin-bottom:6px">Preview · ${ec(a.workTypeName)} · ${ec(jurisdictionName(a.jurisdiction))} · ${a.start||'—'} → ${a.end||'—'}</div>`+d.specialties.map(sp=>{const reqs=layeredRequirements(a,sp),ns=DEMO_NURSES.filter(n=>n.specialty===sp);
  return`<details class="row-v81" style="display:block" open><summary><b>${ec(specialtyName(sp))} nurse</b> · ${reqs.length} requirements ${ns.map(n=>{const r=v81Assignment(a,n);return` · ${ec(n.name)} <b>${r.ok}/${r.total}</b>`}).join('')}</summary><div style="margin:6px 0">${layerSummaryHtml(a,reqs)}</div><ul class="req-list">${reqs.map(r=>`<li>${ec(requirementLabel(r))} <span class="layer-tag-v84 layer-${r.layer}">${LAYERS[r.layer]}</span><div class="small auth-v84">Required by: ${ec(r.authority)}</div></li>`).join('')}</ul></details>`}).join('');
}
function abPublish(){
 const d=abDraft();if(!$('abNameV84').value.trim()){alert('Enter an assignment name.');return}if(!d.start){alert('Choose a start date.');return}if(!d.specialties.length){alert('Select at least one accepted specialty.');return}
 const list=loadCustomAssignments();list.push(d);saveCustomAssignments(list);
 v81Log('ASSIGNMENT_PUBLISHED',null,{assignment_id:d.id,actor_type:'ORGANIZATION',result:d.specialties.join('/'),detail:{name:d.name,org:organization(d.orgId)?.name,workType:d.workType,jurisdiction:d.jurisdiction,specialties:d.specialties,overrides:d.overrides}});
 $('abNameV84').value='';v81RenderRoles();
}
function renderCustomAssignments(){
 if(!$('abCustomV84'))return;const list=getAssignments().filter(a=>a.custom);
 $('abCustomV84').innerHTML=list.length?`<div style="font-weight:800;margin-bottom:6px">Published in this browser</div>`+list.map(a=>`<div class="row-v81"><div><b>${ec(a.name)}</b><div class="small">${ec(organization(a.orgId)?.name||'')} · ${ec(a.templateName)} · ${ec(a.jurisdiction)} · ${a.start} → ${a.end}</div></div><button class="mini abRemove" data-id="${a.id}">Remove</button></div>`).join(''):'';
 document.querySelectorAll('.abRemove').forEach(b=>b.onclick=()=>{saveCustomAssignments(loadCustomAssignments().filter(x=>x.id!==b.dataset.id));v81RenderRoles()});
}

/* ---- Organization dashboard metrics + sections (handoff §40) ---- */
function orgMetrics(orgId){
 const as=getAssignments().filter(a=>a.orgId===orgId),pairs=[];
 as.forEach(a=>DEMO_NURSES.forEach(n=>{const r=v81Assignment(a,n);if(r.eligible)pairs.push({a,n,r})}));
 const expiring=[];DEMO_NURSES.forEach(n=>nurseCreds(n).forEach(c=>{const d=daysUntil(credExpiry(c));if(isVerifiedActive(c)&&d!=null&&d>=0&&d<=90)expiring.push({n,c,d})}));
 return{assignments:as.length,pairs:pairs.length,pairList:pairs,ready:pairs.filter(p=>p.r.ready).length,missingOne:pairs.filter(p=>p.r.total-p.r.ok===1).length,expiring:expiring.length,expiringList:expiring,accessActive:orgShares(orgId).filter(x=>shareStatus(x)==='ACTIVE').length};
}
function renderOrgAttention(om){
 if(!$('orgAttnV85'))return;const out=[];
 om.pairList.filter(p=>!p.r.ready).sort((x,y)=>(x.r.total-x.r.ok)-(y.r.total-y.r.ok)).forEach(p=>out.push(`<div class="attn-v85"><span class="attn-ic-v85">${p.r.total-p.r.ok===1?'◔':'○'}</span><div><b>${ec(p.n.name)} · ${ec(p.a.name)}</b>${p.n.live?'':' <span class="demo-tag-v81">DEMO NURSE</span>'}<div class="small">${p.r.ok}/${p.r.total} · ${ec(p.r.missing.join(', '))}</div></div></div>`));
 om.expiringList.forEach(x=>out.push(`<div class="attn-v85"><span class="attn-ic-v85">⏰</span><div><b>${ec(x.n.name)}: ${ec(x.c.name)}</b><div class="small">expires in ${x.d} days (${fd(credExpiry(x.c))})</div></div></div>`));
 loadShareRequests().filter(r=>r.orgId===orgViewAs&&r.status==='PENDING').forEach(r=>out.push(`<div class="attn-v85"><span class="attn-ic-v85">⇆</span><div><b>Extension request pending</b><div class="small">${ec(r.assignmentName)} · through ${fd(r.requestedUntil)} · awaiting clinician</div></div></div>`));
 orgShares(orgViewAs).filter(x=>shareStatus(x)==='EXPIRED').forEach(x=>out.push(`<div class="attn-v85"><span class="attn-ic-v85">⌛</span><div><b>Passport access expired · ${ec(x.assignmentName)}</b><div class="small">Request an extension from Shared Passports</div></div></div>`));
 $('orgAttnV85').innerHTML=out.join('')||'<div class="small">Nothing needs attention for this organization.</div>';
}
function renderOrgActivity(){
 if(!$('orgActivityV85'))return;const mine=new Set(getAssignments().filter(a=>a.orgId===orgViewAs).map(a=>a.id));
 const ev=eventsSinceSeed().filter(e=>mine.has(e.assignment_id)&&/^(SHARE_|ASSIGNMENT_)/.test(e.event_type)).reverse().slice(0,8);
 $('orgActivityV85').innerHTML=ev.map(e=>`<div class="activity-v83">${ec(activityText(e))}<div class="small">${ec(fmtDT(e.timestamp))} · ${ec(e.actor_type)}</div></div>`).join('')||'<div class="small">No activity for this organization yet.</div>';
}
