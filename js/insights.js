/* Derived views shared by the three workspaces (PR 5): expiry buckets,
   task sections, needs-attention items, practice authorization and mismatch
   rules. Everything is computed from the current demo data and the event
   log. Nothing here is hardcoded and nothing here writes. */
function daysUntil(iso){if(!iso)return null;return Math.ceil((new Date(iso+'T23:59:59')-new Date())/86400000)}
function isCurrentVerified(c){const d=daysUntil(credExpiry(c));return isVerifiedActive(c)&&(d==null||d>=0)}
/* Jurisdictions where the live Passport authorizes RN practice: single-state
   licenses, plus NLC privilege in compact states for a multistate license. */
function practiceAuthorization(list=creds){
 const set=new Map();
 list.filter(c=>isRnLicense(c)&&isCurrentVerified(c)).forEach(c=>{
  if(c.kind==='RN_LICENSE')set.set(c.jurisdiction,'single-state license');
  else if(nlcCanIssueMultistate(c.jurisdiction)){set.set(c.jurisdiction,'multistate home');US_JURISDICTIONS.filter(j=>nlcHonorsCompactIn(j.code)&&!set.has(j.code)).forEach(j=>set.set(j.code,'NLC privilege'))}
 });
 return set;
}
function eligibleAssignments(n=DEMO_NURSES[0]){return getAssignments().filter(a=>matchedSpecialty(a,n))}
/* Assignments the clinician is actively pursuing: started completing one, or
   shared the Passport for it. */
function pursuedAssignmentIds(ev=eventsSinceSeed()){const s=new Set(ev.filter(e=>e.event_type==='ASSIGNMENT_INTEREST').map(e=>e.assignment_id));loadShares().forEach(x=>s.add(x.assignmentId));return s}
const BLOCKING=['MISSING','EXPIRES_BEFORE_END','NOT_RECENT','LEVEL_TOO_LOW'];
/* Task Center sections (handoff §39). */
function taskSections(){
 const elig=eligibleAssignments(),blockers=new Map();
 elig.forEach(a=>{const r=v81Assignment(a);r.items.filter(i=>BLOCKING.includes(i.status)).forEach(i=>{const k=i.label;if(!blockers.has(k))blockers.set(k,{item:i,assignments:[]});blockers.get(k).assignments.push(a)})});
 const exp30=[],renew=[],awaiting=[],missing=[],complete=[],renewing=new Set(creds.filter(c=>c.renews&&['VERIFYING','UNVERIFIED'].includes(c.primary)).map(c=>c.renews));
 creds.forEach(c=>{
  const d=daysUntil(credExpiry(c));
  if(['VERIFYING','UNVERIFIED'].includes(c.primary)){awaiting.push(c);return}
  if(['REVOKED','REJECTED','EXPIRED'].includes(c.primary)||(c.primary==='VERIFIED'&&d!=null&&d<0)){missing.push({c,reason:c.primary==='REVOKED'?'Revoked by issuer (demo) — replace or reinstate':c.primary==='REJECTED'?'Rejected after manual review — upload a corrected credential':'Expired — renew'});return}
  if(!isVerifiedActive(c))return;
  const rn=renewing.has(c.id);if(d!=null&&d<=30)exp30.push({c,d,renewing:rn});else if(d!=null&&d<=90)renew.push({c,d,renewing:rn});else complete.push(c);
 });
 NEWCOMER_BASELINE_KINDS.filter(k=>!catalogKind(k)?.notCredential&&!creds.some(c=>c.kind===k&&(isCurrentVerified(c)||['VERIFYING','UNVERIFIED'].includes(c.primary)))).forEach(k=>missing.push({kind:k,reason:'Part of your onboarding baseline — not on your Passport'}));
 return{required:[...blockers.values()],exp30,renew,awaiting,missing,complete};
}
/* Rule-derived mismatch alerts for the Verification Console (demo rules). */
function mismatchAlerts(){
 const out=[],home=DEMO_PROFILE.homeState;
 creds.forEach(c=>{
  if(['REVOKED','REJECTED'].includes(c.primary))return;
  if(licenseScopeOf(c)==='MULTISTATE'&&home&&c.jurisdiction&&c.jurisdiction!==home)out.push({c,rule:'NLC_HOME_STATE',severity:'HIGH',text:`Multistate license issued by ${jurisdictionName(c.jurisdiction)}, but the profile's primary state of residence is ${jurisdictionName(home)}. Under the NLC, a multistate license must be issued by your primary state of residence.`});
  const d=daysUntil(credExpiry(c));
  if(c.primary==='VERIFIED'&&d!=null&&d<0)out.push({c,rule:'VERIFIED_BUT_EXPIRED',severity:'HIGH',text:`Status is VERIFIED but the credential expired ${fd(credExpiry(c))}.`});
  if(['VERIFYING','UNVERIFIED'].includes(c.primary)&&d!=null&&d<0)out.push({c,rule:'EXPIRED_AT_SUBMISSION',severity:'MEDIUM',text:`Submitted with an expiration date in the past (${fd(credExpiry(c))}).`});
  if(c.kind==='OTHER'&&['VERIFYING','UNVERIFIED'].includes(c.primary))out.push({c,rule:'UNCLASSIFIED_TYPE',severity:'LOW',text:'Credential type is not in the RN catalog; classify it before verifying.'});
 });
 const seen={};creds.filter(c=>isVerifiedActive(c)&&c.kind!=='OTHER').forEach(c=>{const k=c.kind+'|'+(c.jurisdiction||'');(seen[k]??=[]).push(c)});
 Object.values(seen).filter(g=>g.length>1&&new Set(g.map(credExpiry)).size>1).forEach(g=>out.push({c:g[g.length-1],rule:'DUPLICATE_RECORD',severity:'MEDIUM',text:`${g.length} verified records of the same credential with different expiration dates (${g.map(x=>fd(credExpiry(x))).join(' / ')}).`}));
 return out;
}
function needsManualReview(c){return['VERIFYING','UNVERIFIED'].includes(c.primary)&&mismatchAlerts().some(a=>a.c.id===c.id)}
/* Clinician "Needs Attention" (handoff §37). */
function clinicianAttention(){
 const t=taskSections(),out=[];
 t.required.forEach(b=>out.push({sev:1,icon:'○',text:`${b.item.label} — needed for ${b.assignments.map(a=>a.name).join(', ')}`,sub:b.item.note||'Required before submission',action:b.item.req?.kind==='REF_SPECIALTY'?{label:'Go to References',fn:`showV7View('referencesView')`}:{label:'Complete',fn:`completeMissingRequirement('${b.assignments[0].id}')`}}));
 t.missing.forEach(m=>out.push({sev:1,icon:'⚠',text:m.c?m.c.name:(catalogKind(m.kind)?.label||m.kind),sub:m.reason,action:{label:'Add',fn:`openAddForm({kind:'${m.c?m.c.kind:m.kind}',jurisdiction:'${m.c?.jurisdiction||''}'})`}}));
 t.exp30.filter(x=>!x.renewing).forEach(x=>out.push({sev:2,icon:'⏰',text:`${x.c.name} expires in ${x.d} day${x.d===1?'':'s'}`,sub:'Expiring within 30 days — renew',action:{label:'Renew',fn:`openRenewal(${x.c.id})`}}));
 t.awaiting.forEach(c=>out.push({sev:3,icon:'⏳',text:`${c.name} — awaiting verification`,sub:'In the Verification Console queue (simulated)',action:null}));
 loadShareRequests().filter(r=>r.status==='PENDING').forEach(r=>out.push({sev:2,icon:'⇆',text:`${r.orgName} requests longer Passport access`,sub:`${r.assignmentName} · through ${fd(r.requestedUntil)}`,action:{label:'Review',fn:`showV7View('shareView')`}}));
 t.renew.filter(x=>!x.renewing).forEach(x=>out.push({sev:4,icon:'↻',text:`${x.c.name} expires in ${x.d} days`,sub:'Renewal recommended (31–90 days)',action:{label:'Renew',fn:`openRenewal(${x.c.id})`}}));
 return out.sort((a,b)=>a.sev-b.sev);
}
