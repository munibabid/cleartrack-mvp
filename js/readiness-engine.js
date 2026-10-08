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
function evaluateRequirement(req,a){
 const label=requirementLabel(req);
 const matches=creds.map(c=>({c,basis:satisfactionBasis(req,c)})).filter(x=>x.basis);
 const verified=matches.filter(x=>isVerifiedActive(x.c));
 const current=verified.find(x=>{const e=credExpiry(x.c);return!e||!a.end||new Date(e)>=new Date(a.end)});
 if(current)return{req,label,status:'MET',credential:current.c,basis:current.basis};
 if(verified.length)return{req,label,status:'EXPIRES_BEFORE_END',credential:verified[0].c,note:'Expires before the assignment ends — renew before submission'};
 if(matches.some(x=>['VERIFYING','UNVERIFIED'].includes(x.c.primary)))return{req,label,status:'PENDING_VERIFICATION',note:'Added — pending verification'};
 let note='';
 if(req.kind===RN_AUTHORIZATION){const ms=creds.find(c=>c.kind==='RN_LICENSE_MULTISTATE'&&isVerifiedActive(c));if(ms)note=`Multistate license (home ${ms.jurisdiction}) not honored here: ${nlcStatusLabel(req.jurisdiction)}`}
 return{req,label,status:'MISSING',note};
}
function v81Assignment(a){
 const items=a.reqs.map(r=>evaluateRequirement(r,a));
 const ok=items.filter(i=>i.status==='MET').length;
 const missing=items.filter(i=>i.status!=='MET').map(i=>i.label+(i.status==='EXPIRES_BEFORE_END'?' — renew before submission':i.status==='PENDING_VERIFICATION'?' — pending verification':''));
 return{ok,total:items.length,missing,ready:missing.length===0,items};
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
