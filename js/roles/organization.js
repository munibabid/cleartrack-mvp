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
 if($('orgSummaryV81'))$('orgSummaryV81').innerHTML=rows.map(r=>`<div class="row-v81"><div><b>${ec(r.name)}</b><div class="small">${ec(r.specialty)} · ${ec(featured.name)}${r.live?'':' · <span class="demo-tag-v81">STATIC DEMO</span>'}</div></div><div><b>${r.ok}/${r.total} Ready</b><div class="small">${r.live?(b.ready?'Assignment Ready':'Missing: '+ec(b.missing.join(', '))):ec(r.status)}</div></div></div>`).join('');
 if($('orgBostonV81'))$('orgBostonV81').innerHTML=`<div class="${b.ready?'good-v81':'alert-v81'}"><b>${b.ok}/${b.total} Requirements Satisfied${b.ready?' — ASSIGNMENT READY':''}</b><div style="margin-top:4px">${b.ready?'All mandatory requirements satisfied and current through the assignment end date.':'Missing: '+ec(b.missing.join(', '))}</div></div><ul class="req-list">${b.items.map(readinessItemHtml).join('')}</ul>`;
 if($('orgCandidatesBodyV81'))$('orgCandidatesBodyV81').innerHTML=`<table class="v81-table"><tr><th>Candidate</th><th>Specialty</th><th>${ec(featured.name)}</th><th>Status</th></tr>${rows.map(r=>`<tr><td>${ec(r.name)}</td><td>${ec(r.specialty)}</td><td>${r.ok}/${r.total}</td><td>${ec(r.status)}</td></tr>`).join('')}</table>`;
 if($('orgAssignmentsBodyV81'))$('orgAssignmentsBodyV81').innerHTML=assignments.map(a=>{const r=v81Assignment(a);return`<div class="row-v81" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px"><div><b>${ec(a.name)}</b><div class="small">${ec(a.templateName)} · ${ec(jurisdictionName(a.jurisdiction))} (${ec(a.jurisdiction)}) · ${ec(nlcStatusLabel(a.jurisdiction))} · ${a.start} → ${a.end}</div></div><div><b>${r.ok}/${r.total}</b><div class="small">${r.ready?'Assignment Ready':r.missing.length+' missing'}</div></div></div><details><summary class="small">${ec(DEMO_PROFILE.name)} — requirement detail</summary><ul class="req-list">${r.items.map(readinessItemHtml).join('')}</ul></details></div>`}).join('');
 if($('orgRequirementsBodyV81'))$('orgRequirementsBodyV81').innerHTML=REQUIREMENT_TEMPLATES.map(t=>`<div class="row-v81" style="display:block"><details><summary><b>${ec(t.name)}</b> <span class="small">· ${t.kinds.length+1} requirements · demo template</span></summary><ul class="req-list"><li>RN License authorizing practice in the assignment's state (single-state license there, or an NLC multistate license where the compact is in effect)</li>${t.kinds.map(k=>`<li>${ec(catalogKind(k)?.label||k)}${catalogPrivacy(k)==='PRIVATE'?' <span class="small">· private (status only)</span>':''}</li>`).join('')}</ul></details></div>`).join('');
 const rt=am?.readinessMs;
 if($('orgAnalyticsBodyV81'))$('orgAnalyticsBodyV81').innerHTML=`<table class="v81-table">
<tr><td>Credential reuse (${ec(featured.name)})</td><td><b>${am?`${fmtPct(am.reuseRate)} (${am.reused}/${am.total} from existing Passport)`:'—'}</b></td></tr>
<tr><td>New credentials required</td><td><b>${am?.newCredentialsRequired??'—'}</b></td></tr>
<tr><td>Assignment-readiness time (interest → ready)</td><td><b>${rt!=null?v81Fmt(rt):am?'Not ready yet':'—'}</b></td></tr>
<tr><td>Median verification time</td><td><b>${v81Fmt(med)}</b></td></tr>
<tr><td>Manual touches</td><td><b>${manualTouches(ev)}</b></td></tr>
<tr><td>Share links created</td><td><b>${sharingActivity(ev)}</b></td></tr>
<tr><td>Events this demo session</td><td><b>${ev.length}</b></td></tr></table>
<p class="small">Computed from this browser's demo event log (since the last demo reset). Reuse and readiness time appear after the clinician starts completing an assignment. DEMO DATA — NOT PRODUCTION RESULTS.</p>`;
}
