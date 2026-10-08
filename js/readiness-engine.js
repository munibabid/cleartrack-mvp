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
/* Specialty experience must be recent (catalog recencyMonths, e.g. 24)
   relative to the assignment start date. */
function isRecent(c,a){const m=catalogKind(c.kind)?.recencyMonths;if(!m||!c.lastWorked||!a.start)return true;const lim=new Date(a.start+'T00:00:00');lim.setMonth(lim.getMonth()-m);return new Date(c.lastWorked+'T00:00:00')>=lim}
function evaluateRequirement(req,a,list=creds){
 const label=requirementLabel(req);
 const matches=list.map(c=>({c,basis:satisfactionBasis(req,c)})).filter(x=>x.basis);
 const verified=matches.filter(x=>isVerifiedActive(x.c));
 const inDate=verified.filter(x=>{const e=credExpiry(x.c);return!e||!a.end||new Date(e)>=new Date(a.end)});
 const current=inDate.find(x=>isRecent(x.c,a));
 if(current)return{req,label,status:'MET',credential:current.c,basis:current.basis+(current.c.lastWorked?` · last worked ${fd(current.c.lastWorked)}`:'')};
 if(inDate.length){const m=catalogKind(req.kind)?.recencyMonths;return{req,label,status:'NOT_RECENT',credential:inDate[0].c,note:`Experience not recent — last worked ${fd(inDate[0].c.lastWorked)}; needs work within ${m} months of the start date`}}
 if(verified.length)return{req,label,status:'EXPIRES_BEFORE_END',credential:verified[0].c,note:'Expires before the assignment ends — renew before submission'};
 if(matches.some(x=>['VERIFYING','UNVERIFIED'].includes(x.c.primary)))return{req,label,status:'PENDING_VERIFICATION',note:'Added — pending verification'};
 let note='';
 if(req.kind===RN_AUTHORIZATION){const ms=list.find(c=>c.kind==='RN_LICENSE_MULTISTATE'&&isVerifiedActive(c));if(ms)note=`Multistate license (home ${ms.jurisdiction}) not honored here: ${nlcStatusLabel(req.jurisdiction)}`}
 return{req,label,status:'MISSING',note};
}
/* Readiness of one nurse (default: Alex, the live Passport) for one
   opportunity, using that nurse's own specialty module. A nurse whose
   specialty the opportunity doesn't accept is not eligible. */
function v81Assignment(a,nurse=null){
 const n=nurse||DEMO_NURSES[0],sp=n.specialty;
 if(!assignmentAccepts(a,sp))return{eligible:false,specialty:sp,ok:0,total:0,missing:[],ready:false,items:[],reqs:[]};
 const list=nurseCreds(n),reqs=layeredRequirements(a,sp);
 const items=reqs.map(r=>({...evaluateRequirement(r,a,list),layer:r.layer,authority:r.authority}));
 const ok=items.filter(i=>i.status==='MET').length;
 const missing=items.filter(i=>i.status!=='MET').map(i=>i.label+(i.status==='EXPIRES_BEFORE_END'?' — renew before submission':i.status==='NOT_RECENT'?' — experience not recent':i.status==='PENDING_VERIFICATION'?' — pending verification':''));
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
