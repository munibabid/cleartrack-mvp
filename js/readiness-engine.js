/* Assignment readiness: "Can this nurse start this assignment?"
   For every requirement, find a VERIFIED, active credential that satisfies it
   and stays current through the assignment end date. XRPL proof is NOT
   required. RN authorization is data-driven from the catalog:
     - a single-state RN license in the assignment's jurisdiction, or
     - a multistate (NLC) license from an NLC home state, when the
       assignment's jurisdiction honors compact licenses. */
function isVerifiedActive(c){return c.primary==='VERIFIED'&&!!c.prov?.active}
function credExpiry(c){return c.official_expiration_date||c.expiration||''}
function isRnLicense(c){return c.kind==='RN_LICENSE'||c.kind==='RN_LICENSE_MULTISTATE'}
/* Returns a human-readable basis string if credential c could satisfy req
   (ignoring verification state), else null. */
function satisfactionBasis(req,c){
 if(req.kind===RN_AUTHORIZATION){
  const t=normalizeJurisdictionCode(req.jurisdiction);
  if(c.kind==='RN_LICENSE'&&c.jurisdiction===t)return'Single-state license';
  if(c.kind==='RN_LICENSE_MULTISTATE'&&nlcCanIssueMultistate(c.jurisdiction)){
   if(c.jurisdiction===t)return'Multistate license (primary state of residence)';
   if(nlcHonorsCompactIn(t))return`NLC multistate privilege (primary state of residence ${c.jurisdiction})`;
  }
  return null;
 }
 return c.kind===req.kind?'Verified credential':null;
}
/* Recent specialty experience (PR 11): at least req.minMonths of work in the
   specialty within the req.windowMonths before the assignment start (default
   12 of the last 24 months; organizations can set their own per requirement).
   Months are estimated from the employer-verified record: continuous work
   ending on lastWorked, limited by recentMonths (months worked in the last
   window, if given) or total years. Returns null when there is nothing to
   check (no dates on the record or the requirement). */
const _MONTH_MS=30.4375*864e5;
function experienceInWindow(c,a,req){
 const win=req?.windowMonths||catalogKind(c.kind)?.recencyMonths;if(!win||!c.lastWorked||!a?.start)return null;
 const start=new Date(a.start+'T00:00:00'),ws=new Date(start);ws.setMonth(ws.getMonth()-win);
 const last=new Date(c.lastWorked+'T00:00:00'),end=last<start?last:start;
 if(end<ws)return{months:0,windowMonths:win,lastWorked:c.lastWorked};
 const total=c.recentMonths!=null&&c.recentMonths!==''?+c.recentMonths:c.years!=null&&c.years!==''?+c.years*12:Infinity;
 const from=Math.max(ws.getTime(),end.getTime()-total*_MONTH_MS);
 return{months:Math.max(0,(end.getTime()-from)/_MONTH_MS),windowMonths:win,lastWorked:c.lastWorked};
}
function isRecent(c,a,req){const k=catalogKind(c.kind);if(!k?.recencyMonths)return true;const x=experienceInWindow(c,a,req);if(!x)return true;const min=req?.minMonths||k.minMonths||1;return x.months+0.05>=min}
function notRecentNote(c,a,req){const x=experienceInWindow(c,a,req)||{months:0,windowMonths:req?.windowMonths||24},min=req?.minMonths||catalogKind(c.kind)?.minMonths||12;
 if(x.months<=0)return`Experience not recent — last worked ${fd(c.lastWorked)}; needs work within ${x.windowMonths} months of the start date (at least ${min} months in that window)`;
 return`Not enough recent experience — about ${Math.floor(x.months)} months in the ${x.windowMonths} months before the start date; needs at least ${min}`}
/* v14.4: NIHSS recency. NIHSS certificates usually print a completion date and no
   expiration, so how recent one must be is a REQUIREMENT rule, never an expiration
   written into the credential. Resolution order:
     1. the requirement's own rule table (facility/assignment override, req.nihss.rules:
        [{group:'A',months:12},{module:'recertification',months:24},{months:24}]) or
        req.nihss.withinMonths;
     2. a default only where the issuer publicly states one: AHA/ASA course pages say the
        "Test Completion" certificate is valid for up to 1 year (Test Group A and B pages,
        checked 2026-10-09). Group B–F = 2 years is stated by Apex and third parties, not
        by AHA, so it is NOT a default;
     3. otherwise the window is undetermined and the item needs a facility rule (review).
   Accepted test groups (req.nihss.acceptedGroups) and "a different group than the previous
   certification" (req.nihss.differentGroup) are checked against the group as recorded;
   a missing group or module is flagged for review, never assumed. */
/* v14.4: calculated dates for experience and skills checklists. Shown as "calculated",
   never stored as an expiration; the facility rule is final. */
const EXPERIENCE_DEFAULT_WINDOW_MONTHS=24,SKILLS_DEFAULT_REDO_MONTHS=12;
function isSkillsKind(kind){return /^SKILLS_/.test(String(kind||''))}
function experienceRecentUntil(lastWorked,months){return lastWorked?nihssAddMonths(lastWorked,months||EXPERIENCE_DEFAULT_WINDOW_MONTHS):null}
function skillsRedoBy(completed,months){return completed?nihssAddMonths(completed,months||SKILLS_DEFAULT_REDO_MONTHS):null}
/* Skills checklist rule for a requirement: req.skills = {months:N} or {perAssignment:true}. */
function evaluateSkills(req,c,a){
 const rule=req?.skills||{},by=rule.setBy||'the facility';
 if(!c.completed)return{status:'NEEDS_REVIEW',note:'No completion date recorded for this skills checklist.'};
 if(rule.perAssignment){
  /* a per-assignment checklist counts only when it was done for this assignment */
  if(c.forAssignment&&a?.id&&c.forAssignment===a.id)return{status:'MET',basis:`completed ${fd(c.completed)} for this assignment (${by}: a new checklist per assignment) · self-attested`};
  if(a?.publishedOn&&c.completed>=a.publishedOn)return{status:'MET',basis:`completed ${fd(c.completed)}, after this assignment was published (${by}: a new checklist per assignment) · self-attested`};
  return{status:'NEEDS_REVIEW',note:`${by} requires a new skills checklist for each assignment. The one on file was completed ${fd(c.completed)}; complete the facility's checklist for this assignment.`};
 }
 const months=+rule.months||SKILLS_DEFAULT_REDO_MONTHS,until=skillsRedoBy(c.completed,months),need=a?.start||new Date().toISOString().slice(0,10);
 const label=rule.months?`${months}-month rule (${by})`:`${months}-month default (no facility rule)`;
 if(until<need)return{status:'OUTSIDE_WINDOW',note:`Completed ${fd(c.completed)}; the ${label} asks for a new checklist by ${fd(until)} (calculated), before the start date.`};
 return{status:'MET',basis:`completed ${fd(c.completed)} · suggested redo by ${fd(until)} (calculated, ${label}) · self-attested`};
}
const NIHSS_ISSUER_DEFAULTS={'aha-asa-nihss':{months:12,label:'AHA/ASA 12-month (issuer-stated) rule',source:'AHA Professional Education Hub: NIH Stroke Scale Test Group A / B course pages, “Test Completion” certificates valid for up to 1 year (checked 2026-10-09)'}};
function nihssAddMonths(iso,n){const [y,m,d]=String(iso).split('-').map(Number);const t=new Date(Date.UTC(y,m-1+n,1));const last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();t.setUTCDate(Math.min(d,last));return t.toISOString().slice(0,10)}
function nihssRuleFor(req,c){
 const ns=req?.nihss||{},rules=ns.rules||[],g=c.testGroup||null,m=c.nihssModule||null,by=ns.setBy||'the facility';
 if(rules.length){
  const byGroup=rules.find(r=>r.group&&g&&String(r.group).toUpperCase()===String(g).toUpperCase()),byModule=rules.find(r=>r.module&&m&&r.module===m),any=rules.find(r=>!r.group&&!r.module);
  const hit=byGroup||byModule||any;
  if(hit){const what=hit.group?`Group ${hit.group}`:hit.module?`${hit.module}-certification`:'NIHSS';return{months:+hit.months,label:`${hit.months}-month ${what} rule (${by})`,setBy:by}}
  const keyedG=rules.some(r=>r.group),keyedM=rules.some(r=>r.module);
  const miss=[keyedG&&!g?'test group':null,keyedM&&!m?'module (initial or recertification)':null].filter(Boolean);
  return{months:null,review:miss.length?`The ${miss.join(' and ')} is not recorded for this certificate, so ${by}'s rule can't be applied. Check the certificate.`:`${by}'s NIHSS rules don't cover ${g?'Group '+g:'this certificate'}${m?' ('+m+')':''}. Add a rule for it.`}
 }
 if(ns.withinMonths)return{months:+ns.withinMonths,label:`${ns.withinMonths}-month rule (${by})`,setBy:by};
 const d=NIHSS_ISSUER_DEFAULTS[c.issuerId];if(d)return{months:d.months,label:d.label,setBy:'issuer',source:d.source};
 return{months:null,review:'Recency window undetermined: this requirement has no NIHSS rule and the issuer'+(c.issuerId?'':' (not identified)')+' publishes none Veridun could confirm. Needs a facility rule (for example 12 or 24 months from completion).'};
}
function evaluateNihss(req,c,a,list){
 const ns=req?.nihss||{},g=c.testGroup?String(c.testGroup).toUpperCase():null;
 if(!c.completed)return{status:'NEEDS_REVIEW',note:'No completion date recorded for this NIHSS certificate. Check the certificate.'};
 if(ns.acceptedGroups&&ns.acceptedGroups.length){
  if(!g)return{status:'NEEDS_REVIEW',note:`This requirement accepts only Group ${ns.acceptedGroups.join(', ')}, and the test group isn't recorded. Check the certificate.`};
  if(!ns.acceptedGroups.map(x=>String(x).toUpperCase()).includes(g))return{status:'GROUP_NOT_ACCEPTED',note:`Group ${g} is not accepted here (accepted: Group ${ns.acceptedGroups.join(', ')}).`};
 }
 if(ns.differentGroup){
  const prev=(list||[]).filter(x=>x!==c&&x.kind==='CERT_NIHSS'&&x.completed&&x.completed<c.completed).sort((x,y)=>y.completed.localeCompare(x.completed))[0];
  if(prev){const pg=prev.testGroup?String(prev.testGroup).toUpperCase():null;
   if(!g||!pg)return{status:'NEEDS_REVIEW',note:'This requirement needs a different test group than the previous NIHSS certificate, and a group is not recorded on one of them. Check both certificates.'};
   if(pg===g)return{status:'GROUP_NOT_ACCEPTED',note:`Group ${g} repeats the previous certificate's group (completed ${fd(prev.completed)}). This requirement needs a different group.`};}
 }
 const rule=nihssRuleFor(req,c);
 if(!rule.months)return{status:'NEEDS_REVIEW',note:rule.review+` Suggested renewal: ${fd(nihssAddMonths(c.completed,12))} (calculated, not printed: 12 months from completion).`,suggested:nihssAddMonths(c.completed,12)};
 const until=nihssAddMonths(c.completed,rule.months),need=a?.end||new Date().toISOString().slice(0,10);
 if(until<need)return{status:'OUTSIDE_WINDOW',note:`Completed ${fd(c.completed)}; the ${rule.label} ran out on ${fd(until)}${a?.end?`, before the assignment ends (${fd(a.end)})`:''}. A newer NIHSS is needed.`};
 /* the requirement date is calculated (completion + the rule's months): shown as such, never as an expiration */
 return{status:'MET',basis:`meets the ${rule.label} until ${fd(until)} (requirement date, calculated from completion; not printed)${g?' · Group '+g:''}`,until,requirementDate:until,rule};
}
function evaluateRequirement(req,a,list=creds){
 const label=requirementLabel(req);
 const matches=list.map(c=>({c,basis:satisfactionBasis(req,c)})).filter(x=>x.basis);
 const verifiedAny=matches.filter(x=>isVerifiedActive(x.c));
 /* PR 13: a verified credential counts only at or above the requirement's
    minimum verification level (uploads, self-attestation and AI extraction
    never reach primary source). */
 const verified=verifiedAny.filter(x=>levelMeets(credentialLevel(x.c),req.minLevel));
 const inDate=verified.filter(x=>{const e=credExpiry(x.c);return!e||!a.end||new Date(e)>=new Date(a.end)});
 let out;
 if(isSkillsKind(req.kind)&&inDate.some(x=>x.c.completed||!credExpiry(x.c))){
  const ev=inDate.filter(x=>x.c.completed||!credExpiry(x.c)).map(x=>({x,e:evaluateSkills(req,x.c,a)})),best=ev.find(y=>y.e.status==='MET')||ev[0];
  out={req,label,status:best.e.status,credential:best.x.c,basis:best.e.basis,note:best.e.note};out.decision=REQUIREMENT_DECISIONS[out.status]||out.status;out.why=requirementWhy(out,a);return out;
 }
 /* NIHSS records with a completion date (or no printed expiration) use the recency rules;
    older records that only carry a printed expiration keep the expiration check */
 if(req.kind==='CERT_NIHSS'&&inDate.some(x=>x.c.completed||!credExpiry(x.c))){
  const ev=inDate.filter(x=>x.c.completed||!credExpiry(x.c)).map(x=>({x,e:evaluateNihss(req,x.c,a,list)})),best=ev.find(y=>y.e.status==='MET')||ev.find(y=>y.e.status==='NEEDS_REVIEW')||ev[0];
  out={req,label,status:best.e.status,credential:best.x.c,basis:best.e.basis,note:best.e.note,nihss:best.e};out.decision=REQUIREMENT_DECISIONS[out.status]||out.status;out.why=requirementWhy(out,a);return out;
 }
 const current=inDate.find(x=>isRecent(x.c,a,req));
 if(current)out={req,label,status:'MET',credential:current.c,basis:current.basis+(current.c.lastWorked?` · last worked ${fd(current.c.lastWorked)}`:'')};
 else if(inDate.length)out={req,label,status:'NOT_RECENT',credential:inDate[0].c,note:notRecentNote(inDate[0].c,a,req)};
 else if(verified.length)out={req,label,status:'EXPIRES_BEFORE_END',credential:verified[0].c,note:'Expires before the assignment ends — renew before submission'};
 else if(verifiedAny.length){const c=verifiedAny[0].c;out={req,label,status:'LEVEL_TOO_LOW',credential:c,note:`Verified as ${levelLabel(credentialLevel(c))}; this requirement needs ${levelLabel(req.minLevel)} — needs a stronger check`}}
 else if(matches.some(x=>['VERIFYING','UNVERIFIED'].includes(x.c.primary)))out={req,label,status:'PENDING_VERIFICATION',note:'Added — pending verification'};
 else{
  let note='';
  if(req.kind===RN_AUTHORIZATION){const ms=list.find(c=>c.kind==='RN_LICENSE_MULTISTATE'&&isVerifiedActive(c));if(ms)note=`Multistate license (home ${ms.jurisdiction}) not honored here: ${nlcStatusLabel(req.jurisdiction)}`}
  out={req,label,status:'MISSING',note};
 }
 out.decision=REQUIREMENT_DECISIONS[out.status]||out.status;
 out.why=requirementWhy(out,a);
 return out;
}
const REQUIREMENT_DECISIONS={MET:'Satisfied',PENDING_VERIFICATION:'Pending verification',MISSING:'Not satisfied — missing',EXPIRES_BEFORE_END:'Not satisfied — expires before the assignment ends',NOT_RECENT:'Not satisfied — experience not recent enough',LEVEL_TOO_LOW:'Not satisfied — verification level too low',NEEDS_REVIEW:'Needs review',OUTSIDE_WINDOW:'Not satisfied — outside the NIHSS recency window',GROUP_NOT_ACCEPTED:'Not satisfied — NIHSS test group not accepted'};
/* Plain-words explanation of a decision (the "Why?" on readiness). */
function requirementWhy(i,a){
 const r=i.req,c=i.credential,lvl=c?credentialLevel(c):null,p=c?.prov||{};
 const verifiedBy=c?[levelLabel(lvl)+(lvl&&credentialLevelIsDemo(c)?' (demo)':''),p.source?'source: '+p.source:'',p.verifiedAt?'checked '+String(p.verifiedAt).slice(0,10):''].filter(Boolean).join(' · '):'';
 const exp=c?credExpiry(c):'';
 if(i.status==='MET'&&r.kind==='CERT_NIHSS')return`Satisfied by ${c.name}: ${i.basis}. ${verifiedBy}. The certificate prints no expiration; the window comes from the requirement, not from the certificate.`;
 if(i.status==='MET')return`Satisfied by ${c.name} (${i.basis}). ${verifiedBy}. Meets the minimum (${levelLabel(r.minLevel)}).${exp?` Valid through ${exp}`+(a?.end?`, which covers the assignment end (${a.end}).`:'.'):' No expiration.'}`;
 if(i.status==='LEVEL_TOO_LOW')return`${c.name} is verified only as ${levelLabel(lvl)}. ${r.levelRule?.basis||''} It needs ${levelLabel(r.minLevel)} before it counts.`;
 if(i.status==='EXPIRES_BEFORE_END')return`${c.name} expires ${exp}, before the assignment ends (${a?.end}). Renew it, then have the renewal verified.`;
 if(i.status==='NOT_RECENT')return i.note||'Experience is not recent enough.';
 if(['NEEDS_REVIEW','OUTSIDE_WINDOW','GROUP_NOT_ACCEPTED'].includes(i.status))return i.note||REQUIREMENT_DECISIONS[i.status];
 if(i.status==='PENDING_VERIFICATION')return`A matching credential was added but nobody has verified it yet. It needs ${levelLabel(r.minLevel)}.`;
 return i.note?i.note+'.':`No matching credential in the Passport. It needs ${levelLabel(r.minLevel)}.`;
}
/* Readiness of one nurse (default: Alex, the live Passport) for one
   opportunity, using that nurse's own specialty module. A nurse whose
   specialty the opportunity doesn't accept is not eligible. */
function v81Assignment(a,nurse=null){
 const n=nurse||DEMO_NURSES[0],sp=matchedSpecialty(a,n);
 if(!sp)return{eligible:false,specialty:n.specialty,ok:0,total:0,missing:[],ready:false,items:[],reqs:[]};
 const list=nurseCreds(n),reqs=layeredRequirements(a,sp);
 const items=reqs.map(r=>({...evaluateRequirement(r,a,list),layer:r.layer,authority:r.authority}));
 const ok=items.filter(i=>i.status==='MET').length;
 const missing=items.filter(i=>i.status!=='MET').map(i=>i.label+(i.status==='NEEDS_REVIEW'?' — needs review':i.status==='OUTSIDE_WINDOW'?' — outside the NIHSS window':i.status==='GROUP_NOT_ACCEPTED'?' — test group not accepted':'')+(i.status==='EXPIRES_BEFORE_END'?' — renew before submission':i.status==='NOT_RECENT'?' — experience not recent':i.status==='PENDING_VERIFICATION'?' — pending verification':i.status==='LEVEL_TOO_LOW'?' — needs a stronger verification':''));
 return{eligible:true,specialty:sp,ok,total:items.length,missing,ready:missing.length===0,items,reqs};
}
function v7Readiness(){const req=creds.filter(c=>c.required),ok=req.filter(reqSatisfied).length;return req.length?Math.round(ok/req.length*100):0}
/* Called after a credential changes state (never from render): records
   ASSIGNMENT_READY once readiness is reached after the clinician started
   working on an assignment. */
function recalcAssignmentReadiness(){
 const ev=eventsSinceSeed();
 getAssignments().forEach(a=>{
  const interest=[...ev].reverse().find(e=>e.event_type==='ASSIGNMENT_INTEREST'&&e.assignment_id===a.id);
  if(!interest)return;
  if(ev.some(e=>e.event_type==='ASSIGNMENT_READY'&&e.assignment_id===a.id&&e.timestamp>=interest.timestamp))return;
  const r=v81Assignment(a);
  if(r.ready)v81Log('ASSIGNMENT_READY',null,{assignment_id:a.id,actor_type:'SYSTEM',result:`${r.ok}/${r.total}`,duration_ms:Date.now()-new Date(interest.timestamp).getTime()});
 });
}
