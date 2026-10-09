/* Passport QR (XRPL proofs), legacy share links, and assignment-aware sharing. */
function enc(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function dec(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return JSON.parse(decodeURIComponent(escape(atob(s))))}
function passPayload(){const a=creds.filter(c=>c.chain==='ACCEPTED'),ob=onboarding();if(!a.length)return null;return{issuer:a[0].issuer,subject:a[0].subject,types:a.map(c=>({t:c.type,n:c.name,e:c.expiration||'',s:c.prov?.source||'',v:c.prov?.verifiedAt||''})),onboarding:{ready:ob.ready,pct:ob.pct,required:ob.req.map(c=>({n:c.name,ok:reqSatisfied(c)}))}}}
function randomShareToken(){return [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function openPass(){let a=creds.filter(c=>c.chain==='ACCEPTED');$('passRows').innerHTML=a.length?a.map(c=>`<div class="passrow"><div><b>${ec(c.name)}</b><div class="small">${ec(c.prov?.source||'Verified source')} · ${c.prov?.verifiedAt?new Date(c.prov.verifiedAt).toLocaleDateString():''}</div><div class="small mono">${ec(c.type)}</div></div><span class="badge ACCEPTED">PROOF ON DEVNET</span></div>`).join(''):'<div class="empty"><b>No accepted XRPL credentials yet.</b></div>';let valid=a.filter(c=>c.primary==='VERIFIED'&&c.prov?.active&&(!c.expiration||new Date(c.expiration)>=new Date())).length;$('score').textContent=a.length?Math.round(valid/a.length*100)+'%':'0%';const payload=passPayload(),url=payload?location.origin+location.pathname+'?passport='+enc(payload):location.origin+location.pathname;$('passUrl').textContent=url;const q=$('qr'),oq=$('onboardQR');q.getContext('2d').clearRect(0,0,q.width,q.height);oq.getContext('2d').clearRect(0,0,oq.width,oq.height);if(payload&&window.QRCode)await QRCode.toCanvas(q,url,{width:230,margin:2});const ob=onboarding();if(ob.ready&&payload){const ourl=location.origin+location.pathname+'?onboarding='+enc(payload);$('onboardUrl').textContent=ourl;$('onboardQRStatus').innerHTML='<span class="badge READY">ONBOARDING COMPLETE</span>';if(window.QRCode)await QRCode.toCanvas(oq,ourl,{width:230,margin:2})}else{$('onboardUrl').textContent='';$('onboardQRStatus').textContent=`${ob.ok}/${ob.req.length} required onboarding items satisfied`}$('passport').showModal()}
/* Pre-PR3 ?sharev7= links carried a static credential list with no expiry or
   revocation. They are retired: access now requires an enforced share token. */
function publicShareV7(){
 $('landing').classList.add('hidden');$('app').classList.add('hidden');$('public').classList.remove('hidden');
 $('pubStatus').innerHTML='<b>This share link format is no longer supported</b><div class="small" style="margin-top:4px">Older demo share links had no expiration or revocation. Ask the clinician for a new assignment share.</div>';$('pubStatus').className='notice alert-v81';
 $('pubRows').innerHTML='';$('pubScore').textContent='—';$('pubOnboard').innerHTML='';
}

/* ======================================================================
   Assignment-aware Passport sharing (PR 3)
   A share is a LIVE grant: it references the clinician's Passport and lists
   which assertions an organization may see for one assignment, for how long.
   Viewers always see the current state of each credential. Source documents
   are never shared. Demo limitation: shares and extension requests live in
   this browser's localStorage, so a share link only opens in this browser.
   ====================================================================== */
const SHARES_KEY='veridun_shares',SHARE_REQ_KEY='veridun_share_requests';
const SHARE_DURATIONS=[
 {id:'ONE_TIME',label:'One Time (single view)'},
 {id:'H24',label:'24 Hours'},
 {id:'D7',label:'7 Days'},
 {id:'D30',label:'30 Days'},
 {id:'UNTIL_ASSIGNMENT_START',label:'Until Assignment Start'},
 {id:'THROUGH_ASSIGNMENT_END',label:'Through Assignment End (recommended)'},
 {id:'CUSTOM_DATE',label:'Custom Date'},
 {id:'UNTIL_REVOKED',label:'Until I Revoke Access'}
];
function durationLabel(id){return SHARE_DURATIONS.find(d=>d.id===id)?.label.replace(' (recommended)','')||id}
function loadShares(){return store.shares.load()}
function saveShares(a){store.shares.save(a)}
function loadShareRequests(){return store.shareRequests.load()}
function saveShareRequests(a){store.shareRequests.save(a)}
function endOfDay(iso){const[y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d,23,59,59)}
function startOfDay(iso){const[y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d,0,0,0)}
/* Expiration for a duration choice; null = no time limit (until revoked). */
function computeExpiry(duration,a,customDate,from=new Date()){
 const h=n=>new Date(from.getTime()+n*3600000);
 switch(duration){
  case'ONE_TIME':return h(24);case'H24':return h(24);case'D7':return h(24*7);case'D30':return h(24*30);
  case'UNTIL_ASSIGNMENT_START':return startOfDay(a.start);
  case'THROUGH_ASSIGNMENT_END':return endOfDay(a.end);
  case'CUSTOM_DATE':return customDate?endOfDay(customDate):null;
  case'UNTIL_REVOKED':return null;
 }
 return null;
}
/* Warning text when access would end before the assignment does, else ''. */
function shareCoverageGap(expires,assignmentEnd,duration){
 if(!assignmentEnd||duration==='UNTIL_REVOKED'||expires==null)return'';
 const exp=expires instanceof Date?expires:new Date(expires),end=endOfDay(assignmentEnd);
 if(exp>=end)return'';const days=Math.ceil((end-exp)/864e5);
 return`Access ends ${fmtDT(exp.toISOString())}, ${days} day${days===1?'':'s'} before the assignment ends (${fd(assignmentEnd)}). Choose “Through Assignment End” so the organization can see your Passport for the whole assignment.`;
}
/* QR code of a share link (vendored qrcode@1.5.1, no network). Encodes only the URL. */
/* Plain words for stored codes in activity feeds (PR 11): D7 -> "7 days",
   PENDING_VERIFICATION -> "Submitted, not verified". */
function plainCode(v){const s=String(v??'');if(!s)return'';if(typeof SHARE_DURATIONS!=='undefined'&&SHARE_DURATIONS.some(d=>d.id===s))return durationLabel(s).toLowerCase();if(/^\d+\/\d+$/.test(s))return s+' requirements met';return({PENDING_VERIFICATION:'Submitted, not verified',PENDING:'Pending',VERIFIED:'Verified',VERIFYING:'Being verified',UNVERIFIED:'Not verified',NOT_CURRENT:'Not current',REQUIREMENT_SATISFIED:'Requirement satisfied',REVOKED:'Revoked',EXPIRED:'Expired',USED:'Already used',GRANTED:'Granted',ACTIVE:'Active',REFUSED_REVOKED:'Refused — revoked',REFUSED_EXPIRED:'Refused — expired',REFUSED_USED:'Refused — already used',SUCCEEDED:'Succeeded',FAILED:'Failed',CLINICIAN:'You',ORGANIZATION:'Organization',SYSTEM:'Veridun (system)',VERIFIER:'Verifier',ISSUER:'Issuer',DEMO:'Demo'})[s]||s.replace(/_/g,' ').toLowerCase().replace(/^./,c=>c.toUpperCase())}
function drawShareQr(canvas,url){if(canvas&&window.QRCode&&url)QRCode.toCanvas(canvas,url,{width:220,margin:2,errorCorrectionLevel:'M'},()=>{})}
function downloadShareQr(canvas,name){if(!canvas)return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=name||'share-qr.png';document.body.appendChild(a);a.click();a.remove()}
function fmtDT(iso){return iso?new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'—'}
function expiryText(s){if(!s.expiresAt)return s.duration==='UNTIL_REVOKED'?'Until revoked':'—';return fmtDT(s.expiresAt)+(s.duration==='ONE_TIME'?' (single view)':'')}
/* Status as of now — pure (no writes). */
function shareStatus(s,now=Date.now()){if(s.status==='REVOKED')return'REVOKED';if(s.status==='EXPIRED')return'EXPIRED';if(s.expiresAt&&now>new Date(s.expiresAt).getTime())return'EXPIRED';return'ACTIVE'}
/* Minimum assertions for an assignment: one per requirement the Passport
   meets. Private kinds (health/screening) are shared only as
   "Requirement Satisfied" — no results, dates or documents. */
function recommendedAssertions(a){
 return v81Assignment(a).items.filter(i=>i.status==='MET').map(i=>({credId:i.credential.id,requirement:i.label,label:i.credential.name,mode:catalogPrivacy(i.credential.kind)==='PRIVATE'?'REQUIREMENT_SATISFIED':'VERIFIED_CREDENTIAL'}));
}
function optionalAssertions(a,rec){const ids=new Set(rec.map(x=>x.credId));return creds.filter(c=>isVerifiedActive(c)&&!ids.has(c.id)).map(c=>({credId:c.id,requirement:null,label:c.name,mode:catalogPrivacy(c.kind)==='PRIVATE'?'REQUIREMENT_SATISFIED':'VERIFIED_CREDENTIAL'}))}
/* Live view of one assertion (current Passport state). */
function liveAssertion(x,s){
 const c=creds.find(k=>k.id===x.credId),a=getAssignment(s.assignmentId);
 if(!c)return{...x,current:false,status:'NO LONGER ON PASSPORT',detail:''};
 const exp=credExpiry(c),cur=isVerifiedActive(c)&&(!exp||new Date(exp+'T23:59:59')>=new Date());
 const through=cur&&(!exp||!a||new Date(exp)>=new Date(a.end));
 if(x.mode==='REQUIREMENT_SATISFIED')return{...x,current:cur,status:cur?'REQUIREMENT SATISFIED':'NOT CURRENT',detail:`${x.requirement||c.name} · details private${a?' · current through assignment end: '+(through?'yes':'no'):''}`};
 const lic=isRnLicense(c)?` · ${licenseCoverage(licenseRuleKind(c),c.jurisdiction).text}${a?(()=>{const b=satisfactionBasis({kind:RN_AUTHORIZATION,jurisdiction:a.jurisdiction},c);return` · ${jurisdictionName(a.jurisdiction)} (assignment state): ${b?'covered — '+b:'not covered by this license'}`})():''}`:'';
 return{...x,current:cur,status:cur?'VERIFIED':'NOT CURRENT',detail:`${c.prov?.source||'Verified source'} · last verified ${c.prov?.verifiedAt?new Date(c.prov.verifiedAt).toLocaleDateString():'—'}${exp?' · expires '+fd(exp):''}${lic}`};
}
function shareSummaryDetail(s){return{share_id:s.id,org:s.orgName,assignment:s.assignmentName}}
/* Persist + log expiry for shares whose time ran out (called on access
   attempts and navigation, never from render). */
function sweepExpiredShares(){const sh=loadShares();let ch=false;sh.forEach(s=>{if(s.status==='ACTIVE'&&shareStatus(s)==='EXPIRED'){s.status='EXPIRED';s.expiredAt=new Date().toISOString();s.expiredReason='TIME';ch=true;v81Log('SHARE_EXPIRED',null,{assignment_id:s.assignmentId,actor_type:'SYSTEM',result:'TIME',detail:shareSummaryDetail(s)})}});if(ch)saveShares(sh)}
function createShare({orgId,assignmentId,assertions,duration,customDate}){
 const a=getAssignment(assignmentId),o=organization(orgId),now=new Date(),exp=computeExpiry(duration,a,customDate,now);
 const s={id:'sh'+Date.now(),token:randomShareToken(),orgId,orgName:o.name,assignmentId,assignmentName:a.name,assertions,duration,customDate:customDate||null,createdAt:now.toISOString(),expiresAt:exp?exp.toISOString():null,status:'ACTIVE',lastAccessedAt:null,views:0,documentsShared:false};
 const sh=loadShares();sh.push(s);saveShares(sh);
 v81Log('SHARE_CREATED',null,{assignment_id:assignmentId,actor_type:'CLINICIAN',result:durationLabel(duration),detail:{...shareSummaryDetail(s),assertions:assertions.map(x=>x.label),expiresAt:s.expiresAt,documents:'NOT_SHARED'}});
 return s;
}
function updateShare(id,fn){const sh=loadShares(),s=sh.find(x=>x.id===id);if(!s)return null;fn(s);saveShares(sh);return s}
function modifyShare(id,{assertions,duration,customDate}){
 return updateShare(id,s=>{const a=getAssignment(s.assignmentId),before=s.assertions.map(x=>x.label),after=assertions.map(x=>x.label),exp=computeExpiry(duration,a,customDate);
  const d={...shareSummaryDetail(s),added:after.filter(x=>!before.includes(x)),removed:before.filter(x=>!after.includes(x)),durationFrom:s.duration,durationTo:duration,expiresFrom:s.expiresAt,expiresTo:exp?exp.toISOString():null};
  s.assertions=assertions;s.duration=duration;s.customDate=customDate||null;s.expiresAt=d.expiresTo;
  v81Log('SHARE_SCOPE_CHANGED',null,{assignment_id:s.assignmentId,actor_type:'CLINICIAN',detail:d});});
}
function extendShare(id,duration,customDate,via='CLINICIAN',requestId=null){
 return updateShare(id,s=>{const a=getAssignment(s.assignmentId),exp=computeExpiry(duration,a,customDate),from=s.expiresAt;
  s.duration=duration;s.customDate=customDate||null;s.expiresAt=exp?exp.toISOString():null;if(s.status==='EXPIRED'){s.status='ACTIVE';s.expiredAt=null;s.expiredReason=null}
  v81Log('SHARE_EXTENDED',null,{assignment_id:s.assignmentId,actor_type:'CLINICIAN',result:durationLabel(duration),detail:{...shareSummaryDetail(s),via,requestId,expiresFrom:from,expiresTo:s.expiresAt}});});
}
function revokeShare(id){return updateShare(id,s=>{s.status='REVOKED';s.revokedAt=new Date().toISOString();loadShareRequests().filter(r=>r.shareId===id&&r.status==='PENDING').forEach(r=>resolveShareRequest(r.id,'DECLINED',true));v81Log('SHARE_REVOKED',null,{assignment_id:s.assignmentId,actor_type:'CLINICIAN',detail:shareSummaryDetail(s)})})}
/* Organization asks for more time — it can only REQUEST; the clinician decides. */
function requestShareExtension(shareId,requestedUntil,reason){
 const s=loadShares().find(x=>x.id===shareId);if(!s||s.status==='REVOKED')return null;
 const r={id:'rq'+Date.now(),shareId,orgId:s.orgId,orgName:s.orgName,assignmentId:s.assignmentId,assignmentName:s.assignmentName,requestedUntil,reason:reason||'',status:'PENDING',createdAt:new Date().toISOString()};
 const rs=loadShareRequests();rs.push(r);saveShareRequests(rs);
 v81Log('SHARE_EXTENSION_REQUESTED',null,{assignment_id:s.assignmentId,actor_type:'ORGANIZATION',result:'PENDING',detail:{...shareSummaryDetail(s),requestedUntil,reason:r.reason}});
 return r;
}
function resolveShareRequest(reqId,decision,silent=false){
 const rs=loadShareRequests(),r=rs.find(x=>x.id===reqId);if(!r||r.status!=='PENDING')return null;
 r.status=decision;r.resolvedAt=new Date().toISOString();saveShareRequests(rs);
 if(decision==='APPROVED')extendShare(r.shareId,'CUSTOM_DATE',r.requestedUntil,'ORGANIZATION_REQUEST',r.id);
 else if(!silent)v81Log('SHARE_EXTENSION_DECLINED',null,{assignment_id:r.assignmentId,actor_type:'CLINICIAN',detail:{share_id:r.shareId,org:r.orgName,assignment:r.assignmentName,requestedUntil:r.requestedUntil}});
 return r;
}
/* Single enforcement point for every view of a share (public link or org
   workspace). Refuses revoked/expired/consumed shares and logs the outcome. */
function accessShare(token,actor='ORGANIZATION'){
 sweepExpiredShares();
 const sh=loadShares(),s=sh.find(x=>x.token===token);
 if(!s)return{ok:false,reason:'NOT_FOUND'};
 if(s.status==='REVOKED')return{ok:false,reason:'REVOKED',share:s};
 if(s.status==='EXPIRED'){v81Log('SHARE_EXPIRED',null,{assignment_id:s.assignmentId,actor_type:'SYSTEM',result:'ACCESS_REFUSED_'+(s.expiredReason||'TIME'),detail:shareSummaryDetail(s)});return{ok:false,reason:'EXPIRED',share:s}}
 const live=s.assertions.map(x=>liveAssertion(x,s));
 s.views=(s.views||0)+1;s.lastAccessedAt=new Date().toISOString();
 if(s.duration==='ONE_TIME'){s.status='EXPIRED';s.expiredAt=s.lastAccessedAt;s.expiredReason='ONE_TIME_USED'}
 saveShares(sh);
 v81Log('SHARE_VIEWED',null,{assignment_id:s.assignmentId,actor_type:actor,result:`${live.filter(x=>x.current).length}/${live.length} current`,detail:{...shareSummaryDetail(s),assertionsAccessed:live.map(x=>x.label),documents:'NOT_SHARED'}});
 return{ok:true,share:s,live};
}
function shareUrl(s){return location.origin+location.pathname+'?share='+s.token}
function liveAssertionsHtml(live){return live.map(x=>`<div class="passrow"><div><b>${ec(x.label)}</b><div class="small">${ec(x.detail)}</div></div><span class="badge ${x.current?'ACCEPTED':'REVOKED'}">${ec(x.status)}</span></div>`).join('')}
function refusalHtml(r){
 if(r.reason==='REVOKED')return`<b>PASSPORT ACCESS REVOKED BY CLINICIAN</b><div class="small" style="margin-top:4px">Revoked ${ec(fmtDT(r.share.revokedAt))}. Veridun no longer provides this Passport to ${ec(r.share.orgName)}.</div>`;
 if(r.reason==='EXPIRED')return`<b>PASSPORT ACCESS EXPIRED</b><div class="small" style="margin-top:4px">${r.share.expiredReason==='ONE_TIME_USED'?'This one-time share was already viewed.':'Access ended '+ec(fmtDT(r.share.expiresAt))+'.'} The organization can request an extension; the clinician decides.</div>`;
 return`<b>Share not found</b><div class="small" style="margin-top:4px">Demo limitation: shares are stored in the clinician's browser, so a share link only opens in the same browser where it was created. A production system would serve shares from a backend.</div>`;
}
/* Public ?share=<token> page. */
function publicShareView(token){
 $('landing').classList.add('hidden');$('app').classList.add('hidden');$('public').classList.remove('hidden');
 const r=accessShare(token,'ORGANIZATION');
 if(!r.ok&&r.reason==='NOT_FOUND'&&store.account&&typeof acctShareLinkView==='function'){acctShareLinkView(token);return}
 if(!r.ok){$('pubStatus').innerHTML=refusalHtml(r);$('pubStatus').className='notice alert-v81';$('pubRows').innerHTML='';$('pubScore').textContent='—';$('pubOnboard').innerHTML='';return}
 const s=r.share;
 $('pubStatus').className='notice';$('pubStatus').innerHTML=`<b>Shared with ${ec(s.orgName)} for ${ec(s.assignmentName)}</b><div class="small" style="margin-top:4px">Access: ${ec(durationLabel(s.duration))} · expires ${ec(expiryText(s))} · this view is logged.</div>`;
 $('pubRows').innerHTML=liveAssertionsHtml(r.live);
 $('pubScore').textContent=`${r.live.filter(x=>x.current).length}/${r.live.length} current`;
 $('pubOnboard').innerHTML=`<b>Source documents: NOT SHARED</b><div class="small" style="margin-top:5px">Assertions are live: they reflect the clinician's current Passport each time this page is opened. Demo: stored in this browser only.</div>`;
}
