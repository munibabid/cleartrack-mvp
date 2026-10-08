/* Organization workspace. Alex Morgan's readiness is computed live by the
   readiness engine; the other candidates are static demo rows (labeled). */
function v81RoleContext(){
 const assignments=getAssignments(),featured=featuredAssignment(),b=v81Assignment(featured);
 const ev=eventsSinceSeed(),pending=creds.filter(c=>['UNVERIFIED','VERIFYING'].includes(c.primary)),med=v81Median(v81Durations());
 const exp=creds.filter(c=>{const d=credExpiry(c);if(!d)return false;return Math.ceil((new Date(d)-new Date())/86400000)<=90}).length;
 return{assignments,featured,b,ev,pending,med,exp};
}
function readinessItemHtml(i){
 const icon={MET:'✓',PENDING_VERIFICATION:'⏳',EXPIRES_BEFORE_END:'⚠',MISSING:'○'}[i.status];
 const sub=i.status==='MET'?i.basis:(i.note||'Missing');
 return`<li><b>${icon}</b> ${ec(i.label)} <span class="small">· ${ec(sub)}</span></li>`;
}
function v81RenderOrganization(x){
 const{assignments,featured,b,ev,pending,med,exp}=x;
 const rows=[{name:`${DEMO_PROFILE.name}, ${DEMO_PROFILE.credentials}`,specialty:DEMO_PROFILE.specialty,ok:b.ok,total:b.total,live:true,status:b.ready?'Assignment Ready':`Missing ${b.missing.length}`},...DEMO_CANDIDATES];
 const am=assignmentMetrics(featured.id,ev);
 const set=(id,v)=>{if($(id))$(id).textContent=v};
 set('orgReadyV81',rows.filter(r=>r.ok===r.total).length);
 set('orgMissingOneV81',rows.filter(r=>r.total-r.ok===1).length);
 set('orgAwaitV81',pending.length);set('orgExpV81',exp);set('orgMedV81',v81Fmt(med));
 set('orgReuseV81',am?fmtPct(am.reuseRate):'—');
 set('orgFeaturedTitleV82',`${featured.name} · ${jurisdictionName(featured.jurisdiction)} · ${featured.start} → ${featured.end}`);
 renderOrgAccess();
 if($('orgSummaryV81'))$('orgSummaryV81').innerHTML=rows.map(r=>`<div class="row-v81"><div><b>${ec(r.name)}</b><div class="small">${ec(r.specialty)} · ${ec(featured.name)}${r.live?'':' · <span class="demo-tag-v81">STATIC DEMO</span>'}</div>${r.live?`<div class="small">${passportAccessLine(orgViewAs)}</div>`:''}</div><div><b>${r.ok}/${r.total} Ready</b><div class="small">${r.live?(b.ready?'Assignment Ready':'Missing: '+ec(b.missing.join(', '))):ec(r.status)}</div></div></div>`).join('');
 if($('orgBostonV81'))$('orgBostonV81').innerHTML=`<div class="${b.ready?'good-v81':'alert-v81'}"><b>${b.ok}/${b.total} Requirements Satisfied${b.ready?' — ASSIGNMENT READY':''}</b><div style="margin-top:4px">${b.ready?'All mandatory requirements satisfied and current through the assignment end date.':'Missing: '+ec(b.missing.join(', '))}</div></div><ul class="req-list">${b.items.map(readinessItemHtml).join('')}</ul>`;
 if($('orgCandidatesBodyV81'))$('orgCandidatesBodyV81').innerHTML=`<table class="v81-table"><tr><th>Candidate</th><th>Specialty</th><th>${ec(featured.name)}</th><th>Status</th><th>Passport Access</th></tr>${rows.map(r=>`<tr><td>${ec(r.name)}</td><td>${ec(r.specialty)}</td><td>${r.ok}/${r.total}</td><td>${ec(r.status)}</td><td>${r.live?passportAccessLine(orgViewAs):'— (static demo)'}</td></tr>`).join('')}</table>`;
 if($('orgAssignmentsBodyV81'))$('orgAssignmentsBodyV81').innerHTML=assignments.map(a=>{const r=v81Assignment(a);return`<div class="row-v81" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px"><div><b>${ec(a.name)}</b><div class="small">${ec(a.templateName)} · ${ec(jurisdictionName(a.jurisdiction))} (${ec(a.jurisdiction)}) · ${ec(nlcStatusLabel(a.jurisdiction))} · ${a.start} → ${a.end}</div></div><div><b>${r.ok}/${r.total}</b><div class="small">${r.ready?'Assignment Ready':r.missing.length+' missing'}</div></div></div><details><summary class="small">${ec(DEMO_PROFILE.name)} — requirement detail</summary><ul class="req-list">${r.items.map(readinessItemHtml).join('')}</ul></details></div>`}).join('');
 if($('orgRequirementsBodyV81'))$('orgRequirementsBodyV81').innerHTML=REQUIREMENT_TEMPLATES.map(t=>`<div class="row-v81" style="display:block"><details><summary><b>${ec(t.name)}</b> <span class="small">· ${t.kinds.length+1} requirements · demo template</span></summary><ul class="req-list"><li>RN License authorizing practice in the assignment's state (single-state license there, or an NLC multistate license where the compact is in effect)</li>${t.kinds.map(k=>`<li>${ec(catalogKind(k)?.label||k)}${catalogPrivacy(k)==='PRIVATE'?' <span class="small">· private (status only)</span>':''}</li>`).join('')}</ul></details></div>`).join('');
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
