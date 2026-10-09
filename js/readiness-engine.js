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
   if(c.jurisdiction===t)return'Multistate license (home state)';
   if(nlcHonorsCompactIn(t))return`NLC multistate privilege (home state ${c.jurisdiction})`;
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
function evaluateRequirement(req,a,list=creds){
 const label=requirementLabel(req);
 const matches=list.map(c=>({c,basis:satisfactionBasis(req,c)})).filter(x=>x.basis);
 const verifiedAny=matches.filter(x=>isVerifiedActive(x.c));
 /* PR 13: a verified credential counts only at or above the requirement's
    minimum verification level (uploads, self-attestation and AI extraction
    never reach primary source). */
 const verified=verifiedAny.filter(x=>levelMeets(credentialLevel(x.c),req.minLevel));
 const inDate=verified.filter(x=>{const e=credExpiry(x.c);return!e||!a.end||new Date(e)>=new Date(a.end)});
 const current=inDate.find(x=>isRecent(x.c,a,req));
 let out;
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
const REQUIREMENT_DECISIONS={MET:'Satisfied',PENDING_VERIFICATION:'Pending verification',MISSING:'Not satisfied — missing',EXPIRES_BEFORE_END:'Not satisfied — expires before the assignment ends',NOT_RECENT:'Not satisfied — experience not recent enough',LEVEL_TOO_LOW:'Not satisfied — verification level too low'};
/* Plain-words explanation of a decision (the "Why?" on readiness). */
function requirementWhy(i,a){
 const r=i.req,c=i.credential,lvl=c?credentialLevel(c):null,p=c?.prov||{};
 const verifiedBy=c?[levelLabel(lvl)+(lvl&&credentialLevelIsDemo(c)?' (demo)':''),p.source?'source: '+p.source:'',p.verifiedAt?'checked '+String(p.verifiedAt).slice(0,10):''].filter(Boolean).join(' · '):'';
 const exp=c?credExpiry(c):'';
 if(i.status==='MET')return`Satisfied by ${c.name} (${i.basis}). ${verifiedBy}. Meets the minimum (${levelLabel(r.minLevel)}).${exp?` Valid through ${exp}`+(a?.end?`, which covers the assignment end (${a.end}).`:'.'):' No expiration.'}`;
 if(i.status==='LEVEL_TOO_LOW')return`${c.name} is verified only as ${levelLabel(lvl)}. ${r.levelRule?.basis||''} It needs ${levelLabel(r.minLevel)} before it counts.`;
 if(i.status==='EXPIRES_BEFORE_END')return`${c.name} expires ${exp}, before the assignment ends (${a?.end}). Renew it, then have the renewal verified.`;
 if(i.status==='NOT_RECENT')return i.note||'Experience is not recent enough.';
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
 const missing=items.filter(i=>i.status!=='MET').map(i=>i.label+(i.status==='EXPIRES_BEFORE_END'?' — renew before submission':i.status==='NOT_RECENT'?' — experience not recent':i.status==='PENDING_VERIFICATION'?' — pending verification':i.status==='LEVEL_TOO_LOW'?' — needs a stronger verification':''));
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
