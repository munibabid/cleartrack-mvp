/* v14.6: Professional references (DEMO ONLY).
   The nurse lists people who can vouch for her work. Each reference gets a
   private link to a short form (or a recruiter fills the same form during a
   phone call). The nurse sees only where each request stands (Requested,
   Opened, Completed, Expired, Declined) and how the reference was confirmed,
   never the answers. Organizations the nurse shares her Passport with can see
   completed references at the level she chooses in the share.

   Demo limits (stated in the UI):
   - Nothing is sent: no email, text or call leaves the browser.
   - Everything is stored in this browser (store.references /
     store.referenceResponses). Answers are kept in a separate store key that
     the nurse-facing screens never read, but in a browser-only demo that is a
     screen rule, not a security boundary. A real version needs server-side
     storage the nurse's account cannot read (see README "References").
   - The facility email-domain directory is a short demo list on .example
     domains. */
const REF_EXPIRY_DAYS=14,REF_REMINDER_DAYS=7,REF_MAX=6;
const REF_STATUS_LABEL={DRAFT:'Not requested yet',REQUESTED:'Requested',OPENED:'Opened',COMPLETED:'Completed',EXPIRED:'Expired',DECLINED:'Declined'};
const REF_STATUS_BADGE={DRAFT:'PENDING',REQUESTED:'PENDING',OPENED:'PENDING',COMPLETED:'ACCEPTED',EXPIRED:'REVOKED',DECLINED:'REVOKED'};
const REF_CHANNEL_LABEL={EMAIL:'Email',TEXT:'Text message',CALL:'Phone call'};
const REF_ROLES=[['MANAGER','Their manager (nurse manager or director)'],['CHARGE','Charge nurse or shift supervisor'],['EDUCATOR','Clinical educator or preceptor'],['PEER','Fellow nurse (peer)'],['PROVIDER','Physician or other provider'],['OTHER','Other']];
const REF_RATINGS=[['clinical','Clinical skills'],['professionalism','Professionalism'],['teamwork','Teamwork'],['reliability','Reliability and attendance'],['communication','Communication']];
const REF_SCALE=[[5,'Excellent'],[4,'Very good'],[3,'Good'],[2,'Fair'],[1,'Poor'],[0,'Not observed']];
const REF_REHIRE={YES:'Yes',NO:'No',UNSURE:'Unsure'};
const REF_CALL_CONFIRM={FACILITY_MAIN:'Called the facility\'s main number and was transferred to them',NURSE_NUMBER:'Called the number the nurse provided',OTHER:'Other (described in the note)'};
/* Demo facility directory: facility → email domain on file. Fake .example domains only. */
const REF_FACILITY_DOMAINS=[
 ['Saguaro Valley Medical Center','saguarovalley.example'],['Copper Mesa Hospital','coppermesa.example'],['Sonoran Regional Medical Center','sonoranregional.example'],
 ['Beacon Harbor Medical Center','beaconharbor.example'],['Eastbay Union Hospital','eastbayunion.example'],['Bayou City General','bayoucitygeneral.example']
];
/* Common personal mailbox providers: an address here can't be tied to an employer. */
const REF_PERSONAL_DOMAINS=['gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','gmx.com','mail.com','zoho.com','comcast.net','att.net','verizon.net','sbcglobal.net'];
const REF_EMAIL_RE=/^[^\s@<>()",;:]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function loadReferences(){const a=store.references.load();return Array.isArray(a)?a:[]}
function saveReferences(a){store.references.save(a)}
/* Answers live under their own key. Only the reference form (write) and the
   organization's shared view with answers allowed (read) touch it. */
function loadRefResponses(){const o=store.referenceResponses.load();return o&&typeof o==='object'&&!Array.isArray(o)?o:{}}
function saveRefResponses(o){store.referenceResponses.save(o)}
function refFacilityName(s){return String(s||'').replace(/\(demo facility\)/i,'').trim()}
function refFacilityDomain(facility){const f=refFacilityName(facility).toLowerCase();const m=REF_FACILITY_DOMAINS.find(([n])=>n.toLowerCase()===f);return m?m[1]:null}
function refEmailDomain(email){return String(email||'').trim().toLowerCase().split('@')[1]||''}
/* How the reference's contact was checked. Never claims more than what was checked. */
function refEmailCheck(r){
 const dom=refEmailDomain(r.email),fdom=refFacilityDomain(r.facility),fac=refFacilityName(r.facility)||'the facility';
 if(!dom)return{level:'NONE',strength:'none',label:'No email address',text:'No email address was given.'};
 if(REF_PERSONAL_DOMAINS.includes(dom))return{level:'PERSONAL_EMAIL',strength:'weaker',label:'Personal email',text:`Personal email address (${dom}). It can't be linked to ${fac}, so this is weaker evidence. An agency may want to confirm by phone.`};
 if(!fdom)return{level:'DOMAIN_NOT_ON_FILE',strength:'weaker',label:'Facility email domain not on file',text:`Veridun has no email domain on file for ${fac}, so ${dom} could not be matched to it. Needs a closer look.`};
 if(dom===fdom||dom.endsWith('.'+fdom))return{level:'WORK_EMAIL_MATCH',strength:'stronger',label:'Work email matches the facility',text:`Work email at ${fac}'s email domain on file (${fdom}). This shows the address belongs to that facility's email system. It does not prove who filled in the form.`};
 return{level:'DOMAIN_MISMATCH',strength:'weaker',label:'Email domain doesn\'t match the facility',text:`The email domain (${dom}) doesn't match ${fac}'s domain on file (${fdom}). Needs a closer look.`};
}
function refPhoneDigits(p){return String(p||'').replace(/\D/g,'')}
function refPhoneValid(p){const d=refPhoneDigits(p);return d.length>=10&&d.length<=15}
function refPhoneMasked(p){const d=refPhoneDigits(p);return d?'•••-•••-'+d.slice(-4):''}
function refAddDays(iso,n){return new Date(new Date(iso).getTime()+n*864e5).toISOString()}
function refExpiresAt(r){return r.sentAt?refAddDays(r.sentAt,REF_EXPIRY_DAYS):null}
/* Status as of now — pure. */
function refStatus(r,now=Date.now()){if((r.status==='REQUESTED'||r.status==='OPENED')&&r.sentAt&&now>new Date(refExpiresAt(r)).getTime())return'EXPIRED';return r.status}
function refLogDetail(r,extra={}){return{ref_id:r.id,referee:r.name,facility:refFacilityName(r.facility),channel:r.channel||null,...extra}}
/* Persist + log requests whose 14 days ran out. */
function sweepReferences(){const a=loadReferences();let ch=false;a.forEach(r=>{if(r.status!==refStatus(r)){r.status='EXPIRED';r.expiredAt=new Date().toISOString();ch=true;v81Log('REFERENCE_EXPIRED',null,{actor_type:'SYSTEM',result:'NOT_COMPLETED_IN_'+REF_EXPIRY_DAYS+'_DAYS',detail:refLogDetail(r)})}});if(ch)saveReferences(a);return a}
function updateReference(id,fn){const a=loadReferences(),r=a.find(x=>x.id===id);if(!r)return null;fn(r);saveReferences(a);return r}
function refValidate(f,existing=[]){
 const e=[];const t=k=>String(f[k]||'').trim();
 if(!t('name'))e.push('Enter the reference\'s name.');
 if(!t('title'))e.push('Enter their job title.');
 if(!t('facility'))e.push('Enter the facility where you worked together.');
 if(!t('email'))e.push('Enter their work email.');else if(!REF_EMAIL_RE.test(t('email')))e.push('Enter a valid email address.');
 else if(existing.some(r=>r.email.toLowerCase()===t('email').toLowerCase()))e.push('You already added a reference with this email.');
 if(t('phone')&&!refPhoneValid(t('phone')))e.push('Enter a phone number with 10 to 15 digits, or leave it empty.');
 if(!t('phone')&&(f.allowText||f.allowCall))e.push('Add a phone number to allow text or call.');
 if(existing.length>=REF_MAX)e.push(`You can list up to ${REF_MAX} references.`);
 return e;
}
function addReference(f){
 const a=loadReferences(),errs=refValidate(f,a);if(errs.length)return{ok:false,errors:errs};
 const t=k=>String(f[k]||'').trim(),phone=t('phone');
 const r={id:'rf'+Date.now()+Math.random().toString(16).slice(2,6),name:t('name'),title:t('title'),facility:t('facility'),unit:t('unit'),email:t('email').toLowerCase(),phone,allowText:!!(phone&&f.allowText),allowCall:!!(phone&&f.allowCall),createdAt:new Date().toISOString(),status:'DRAFT',token:null,channel:null,sentAt:null,openedAt:null,completedAt:null,declinedAt:null,reminders:0,lastReminderAt:null,resends:0,completion:null};
 a.push(r);saveReferences(a);v81Log('REFERENCE_ADDED',null,{actor_type:'CLINICIAN',detail:refLogDetail(r)});return{ok:true,ref:r};
}
function refChannelAllowed(r,ch){return ch==='EMAIL'?!!r.email:ch==='TEXT'?!!(r.phone&&r.allowText):ch==='CALL'?!!(r.phone&&r.allowCall):false}
/* Sends (simulates) a request. A new link replaces any older one. */
function requestReference(id,channel){
 const cur=loadReferences().find(x=>x.id===id);if(!cur||!refChannelAllowed(cur,channel))return null;
 const st=refStatus(cur);if(st==='COMPLETED'||st==='DECLINED')return null;
 return updateReference(id,r=>{const again=!!r.sentAt;if(r.token)(r.oldTokens=r.oldTokens||[]).push(r.token);
  r.token=channel==='CALL'?null:randomShareToken();r.channel=channel;r.sentAt=new Date().toISOString();r.openedAt=null;r.status='REQUESTED';r.expiredAt=null;if(again)r.resends=(r.resends||0)+1;
  v81Log(again?'REFERENCE_RESENT':'REFERENCE_REQUESTED',null,{actor_type:'CLINICIAN',result:channel,detail:refLogDetail(r,{expires_at:refExpiresAt(r),sent:'DEMO_NOT_SENT'})})});
}
function remindReference(id){
 const cur=loadReferences().find(x=>x.id===id);if(!cur||!['REQUESTED','OPENED'].includes(refStatus(cur))||cur.channel==='CALL')return null;
 return updateReference(id,r=>{r.reminders=(r.reminders||0)+1;r.lastReminderAt=new Date().toISOString();v81Log('REFERENCE_REMINDER',null,{actor_type:'CLINICIAN',result:r.channel,detail:refLogDetail(r,{sent:'DEMO_NOT_SENT'})})});
}
/* Demo-only time travel so expiry can be seen without waiting 14 days. */
function refDemoSkipDays(id,days){return updateReference(id,r=>{if(r.sentAt)r.sentAt=refAddDays(r.sentAt,-days);if(r.lastReminderAt)r.lastReminderAt=refAddDays(r.lastReminderAt,-days)})}
function removeReference(id){const a=loadReferences(),r=a.find(x=>x.id===id);if(!r)return false;saveReferences(a.filter(x=>x.id!==id));const resp=loadRefResponses();if(resp[id]){delete resp[id];saveRefResponses(resp)}v81Log('REFERENCE_REMOVED',null,{actor_type:'CLINICIAN',detail:refLogDetail(r)});return true}
function refUrl(r){return location.origin+location.pathname+'?ref='+r.token}
/* Looks up a link. Outcome only — no answers. */
function refByToken(token){
 sweepReferences();const a=loadReferences(),t=String(token||'').toLowerCase();
 const r=a.find(x=>x.token&&x.token===t);if(r)return{ok:true,ref:r,status:refStatus(r)};
 const old=a.find(x=>(x.oldTokens||[]).includes(t));if(old)return{ok:false,reason:'REPLACED',ref:old};
 return{ok:false,reason:'NOT_FOUND'};
}
function markReferenceOpened(id){return updateReference(id,r=>{if(r.status==='REQUESTED'){r.status='OPENED';r.openedAt=new Date().toISOString();v81Log('REFERENCE_OPENED',null,{actor_type:'REFEREE',detail:refLogDetail(r)})}})}
/* Validates the form answers. Returns {ok, errors, answers}. */
function refValidateAnswers(x){
 const e=[],y=v=>/^\d{4}$/.test(String(v||'')),m=v=>/^(0?[1-9]|1[0-2])$/.test(String(v||''));
 if(!m(x.fromMonth)||!y(x.fromYear))e.push('Choose when you started working together (month and year).');
 if(!x.current&&(!m(x.toMonth)||!y(x.toYear)))e.push('Choose when you stopped working together, or tick "Still working together".');
 if(m(x.fromMonth)&&y(x.fromYear)&&!x.current&&m(x.toMonth)&&y(x.toYear)&&(+x.toYear*12+ +x.toMonth)<(+x.fromYear*12+ +x.fromMonth))e.push('The end date is before the start date.');
 if(!REF_ROLES.some(([k])=>k===x.role))e.push('Choose your role relative to the nurse.');
 REF_RATINGS.forEach(([k,l])=>{if(!REF_SCALE.some(([v])=>String(v)===String(x.ratings?.[k])))e.push(`Rate: ${l}.`)});
 if(!REF_REHIRE[x.rehire])e.push('Answer "Would you work with or rehire this nurse again?"');
 if(String(x.comments||'').length>1500)e.push('Comments can be up to 1,500 characters.');
 if(!x.attest)e.push('Confirm that the answers are your own.');
 return{ok:!e.length,errors:e};
}
function refCleanAnswers(x){return{fromMonth:+x.fromMonth,fromYear:+x.fromYear,current:!!x.current,toMonth:x.current?null:+x.toMonth,toYear:x.current?null:+x.toYear,role:x.role,roleOther:x.role==='OTHER'?String(x.roleOther||'').trim().slice(0,120):'',ratings:Object.fromEntries(REF_RATINGS.map(([k])=>[k,+x.ratings[k]])),rehire:x.rehire,comments:String(x.comments||'').trim().slice(0,1500)}}
/* Completion by the reference through the private link (email or text). */
function submitReferenceByLink(token,x){
 const f=refByToken(token);if(!f.ok)return{ok:false,reason:f.reason};
 if(!['REQUESTED','OPENED'].includes(f.status))return{ok:false,reason:f.status};
 const v=refValidateAnswers(x);if(!v.ok)return{ok:false,reason:'INVALID',errors:v.errors};
 const resp=loadRefResponses();resp[f.ref.id]={...refCleanAnswers(x),submittedAt:new Date().toISOString()};saveRefResponses(resp);
 const r=updateReference(f.ref.id,r=>{r.status='COMPLETED';r.completedAt=new Date().toISOString();r.completion={by:'REFERENCE',channel:r.channel,emailCheck:refEmailCheck(r).level,attested:true};
  v81Log('REFERENCE_COMPLETED',null,{actor_type:'REFEREE',result:r.channel,detail:refLogDetail(r,{confirmation:r.completion.emailCheck})})});
 return{ok:true,ref:r};
}
function declineReferenceByLink(token){
 const f=refByToken(token);if(!f.ok||!['REQUESTED','OPENED'].includes(f.status))return{ok:false,reason:f.reason||f.status};
 const r=updateReference(f.ref.id,r=>{r.status='DECLINED';r.declinedAt=new Date().toISOString();v81Log('REFERENCE_DECLINED',null,{actor_type:'REFEREE',result:r.channel,detail:refLogDetail(r)})});
 return{ok:true,ref:r};
}
/* Completion during a phone call, entered by a verifier / recruiter. */
function refValidateCall(c){const e=[];if(!String(c.callerName||'').trim())e.push('Enter who made the call.');if(!String(c.callerOrg||'').trim())e.push('Enter the caller\'s organization or role.');if(!c.callAt||isNaN(new Date(c.callAt)))e.push('Enter when the call took place.');else if(new Date(c.callAt).getTime()>Date.now()+5*60000)e.push('The call time can\'t be in the future.');if(!REF_CALL_CONFIRM[c.confirm])e.push('Choose how you confirmed who you were speaking with.');if(c.confirm==='OTHER'&&!String(c.confirmNote||'').trim())e.push('Describe how you confirmed who you were speaking with.');return e}
function submitReferenceByCall(id,x,call){
 const cur=loadReferences().find(r=>r.id===id);if(!cur||!cur.phone||!cur.allowCall)return{ok:false,reason:'NO_CALL'};
 if(['COMPLETED','DECLINED'].includes(refStatus(cur)))return{ok:false,reason:refStatus(cur)};
 const v=refValidateAnswers(x),ce=refValidateCall(call||{});if(!v.ok||ce.length)return{ok:false,reason:'INVALID',errors:[...ce,...v.errors]};
 const resp=loadRefResponses();resp[id]={...refCleanAnswers(x),submittedAt:new Date().toISOString()};saveRefResponses(resp);
 const r=updateReference(id,r=>{if(!r.sentAt)r.sentAt=new Date(call.callAt).toISOString();r.channel='CALL';r.status='COMPLETED';r.completedAt=new Date().toISOString();
  r.completion={by:'CALLER',channel:'CALL',callerName:String(call.callerName).trim().slice(0,120),callerOrg:String(call.callerOrg).trim().slice(0,120),callAt:new Date(call.callAt).toISOString(),confirm:call.confirm,confirmNote:String(call.confirmNote||'').trim().slice(0,300),phoneLast4:refPhoneDigits(r.phone).slice(-4),attested:true};
  v81Log('REFERENCE_COMPLETED',null,{actor_type:'VERIFIER',result:'CALL',detail:refLogDetail(r,{caller:r.completion.callerName,confirmation:'PHONE_'+call.confirm})})});
 return{ok:true,ref:r};
}
function declineReferenceByCall(id,callerName){
 const cur=loadReferences().find(r=>r.id===id);if(!cur||['COMPLETED','DECLINED'].includes(refStatus(cur)))return null;
 return updateReference(id,r=>{r.channel='CALL';r.status='DECLINED';r.declinedAt=new Date().toISOString();v81Log('REFERENCE_DECLINED',null,{actor_type:'VERIFIER',result:'CALL',detail:refLogDetail(r,{caller:String(callerName||'').trim()||null})})});
}
/* Provenance lines for a completed reference — what was checked, by whom, when. No answers. */
function refProvenance(r){
 const c=r.completion||{},out=[];
 out.push(['How it was collected',REF_CHANNEL_LABEL[r.channel]||'—']);
 if(r.channel==='CALL'){
  out.push(['Requested',r.sentAt?fmtDT(r.sentAt):'—']);
  out.push(['Called by',`${c.callerName||'—'}${c.callerOrg?' ('+c.callerOrg+')':''}`]);
  out.push(['Call time',c.callAt?fmtDT(c.callAt):'—']);
  out.push(['Who was reached',`${REF_CALL_CONFIRM[c.confirm]||'—'}${c.confirmNote?': '+c.confirmNote:''}${c.phoneLast4?' · number ending '+c.phoneLast4:''}`]);
  out.push(['Answers entered by',`${c.callerName||'the caller'} during the call`]);
 }else{
  out.push(['Sent',r.sentAt?fmtDT(r.sentAt)+' (demo — not actually sent)':'—']);
  if(r.openedAt)out.push(['Opened',fmtDT(r.openedAt)]);
  out.push(['Answers entered by',`the reference, through the private link sent by ${r.channel==='TEXT'?'text':'email'}`]);
 }
 if(r.completedAt)out.push(['Completed',fmtDT(r.completedAt)]);
 return out;
}
function refIdentityText(r){
 if(r.channel==='CALL'){const c=r.completion||{};return c.confirm==='FACILITY_MAIN'?`Reached through ${refFacilityName(r.facility)}'s main number (recorded by ${c.callerName||'the caller'}). This confirms they could be reached at the facility, not their job title.`:c.confirm==='NURSE_NUMBER'?`Reached at the phone number the nurse provided (recorded by ${c.callerName||'the caller'}). That number was not independently checked: weaker evidence.`:`Recorded by ${c.callerName||'the caller'}: ${c.confirmNote||'other method'}. Not independently checked.`}
 const e=refEmailCheck(r);
 if(r.channel==='TEXT')return`Link sent by text to the number the nurse provided. A phone number alone doesn't show they work at ${refFacilityName(r.facility)}. Email on file: ${e.text}`;
 return e.text+' Demo: no email was actually sent, so this demo doesn\'t show that the reference controls the mailbox.';
}
function refStrength(r){if(r.channel==='CALL')return r.completion?.confirm==='FACILITY_MAIN'?'stronger':'weaker';if(r.channel==='TEXT')return'weaker';return refEmailCheck(r).strength}

/* ---------------- Nurse view (status only, never answers) ---------------- */
let refFormOpen=false;
function refStatusBadge(st){return`<span class="badge ${REF_STATUS_BADGE[st]||'PENDING'}">${ec((REF_STATUS_LABEL[st]||st).toUpperCase())}</span>`}
function refCardHtml(r){
 const st=refStatus(r),chk=refEmailCheck(r),acts=[];
 const lines=[`${ec(r.title)} · ${ec(refFacilityName(r.facility))}${r.unit?' · '+ec(r.unit):''}`,`Email: ${ec(r.email)} <span class="ref-chip-v146 ref-${chk.strength}">${ec(chk.label)}</span>${r.phone?` · Phone: ${ec(r.phone)} (${[r.allowText?'text':'',r.allowCall?'call':''].filter(Boolean).join(' and ')||'not for contact'})`:''}`];
 if(st==='DRAFT'){
  acts.push(`<button type="button" class="pri mini refAct" data-act="send-EMAIL" data-id="${r.id}">Send request by email</button>`);
 }
 if(['REQUESTED','OPENED'].includes(st)){
  const exp=refExpiresAt(r),days=Math.max(0,Math.ceil((new Date(exp)-Date.now())/864e5)),since=(Date.now()-new Date(r.lastReminderAt||r.sentAt))/864e5;
  lines.push(`${ec(REF_CHANNEL_LABEL[r.channel])} request sent ${ec(fmtDT(r.sentAt))} <span class="demo-tag-v81">DEMO · NOT SENT</span>${r.openedAt?' · opened '+ec(fmtDT(r.openedAt)):''} · expires ${ec(fmtDT(exp))} (${days} day${days===1?'':'s'} left)${r.reminders?` · ${r.reminders} reminder${r.reminders===1?'':'s'} sent (demo)`:''}${r.resends?` · new link sent ${r.resends}×`:''}`);
  if(r.channel!=='CALL'&&since>=REF_REMINDER_DAYS)lines.push('<span class="ref-hint-v146">No answer yet. A reminder may help.</span>');
  if(r.channel==='CALL')lines.push('Waiting for a recruiter or verifier to call. In the demo, record the call in the Verification Console › Reference Calls.');
  if(r.channel!=='CALL'){acts.push(`<button type="button" class="sec mini refAct" data-act="remind" data-id="${r.id}">Send reminder (demo)</button>`,`<a class="sec mini ref-open-v146" href="${ec(refUrl(r))}" data-id="${r.id}">Open as the reference (demo)</a>`)}
  acts.push(`<button type="button" class="sec mini refAct" data-act="send-${r.channel}" data-id="${r.id}">Send a new ${r.channel==='CALL'?'call request':'link'}</button>`,`<button type="button" class="sec mini refAct" data-act="skip" data-id="${r.id}" title="Demo only: moves this request 15 days into the past">Demo: skip ahead 15 days</button>`);
 }
 if(st==='EXPIRED'){lines.push(`Request sent ${ec(fmtDT(r.sentAt))} expired after ${REF_EXPIRY_DAYS} days without an answer.`);acts.push(`<button type="button" class="pri mini refAct" data-act="send-${r.channel||'EMAIL'}" data-id="${r.id}">Resend request</button>`)}
 if(st==='DECLINED')lines.push(`${ec(r.name)} declined to give a reference on ${ec(fmtDT(r.declinedAt))}. You can remove them and add someone else.`);
 if(st==='COMPLETED')lines.push(`Completed ${ec(fmtDT(r.completedAt))} by ${r.channel==='CALL'?'phone call':ec(REF_CHANNEL_LABEL[r.channel].toLowerCase())+' link'}. <b>How they were confirmed:</b> ${ec(refIdentityText(r))}`,'<span class="small">Their answers are private. You won\'t see them; organizations see them only if you allow it when you share your Passport.</span>');
 if(['DRAFT','EXPIRED','REQUESTED','OPENED'].includes(st)){
  if(refChannelAllowed(r,'TEXT')&&!(['REQUESTED','OPENED'].includes(st)&&r.channel==='TEXT'))acts.push(`<button type="button" class="sec mini refAct" data-act="send-TEXT" data-id="${r.id}">Send link by text (demo — not sent)</button>`);
  if(refChannelAllowed(r,'CALL')&&!(['REQUESTED','OPENED'].includes(st)&&r.channel==='CALL'))acts.push(`<button type="button" class="sec mini refAct" data-act="send-CALL" data-id="${r.id}">Ask a recruiter to call (demo — no call is made)</button>`);
 }
 acts.push(`<button type="button" class="mini refAct" data-act="remove" data-id="${r.id}" style="color:var(--r)">Remove</button>`);
 return`<div class="share-card-v83 ref-card-v146" data-ref="${r.id}" data-status="${st}"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>${ec(r.name)}</b><div class="small">${lines[0]}</div></div>${refStatusBadge(st)}</div>${lines.slice(1).map(l=>`<div class="small" style="margin-top:4px">${l}</div>`).join('')}<div class="acts" style="margin-top:8px">${acts.join('')}</div></div>`;
}
function refFormHtml(){
 return`<form id="refAddFormV146" class="panel-v81" novalidate><div class="ph">Add a reference</div><div class="pb">
 <div class="grid2-v83">
  <div><label for="refNameV146">Name</label><input id="refNameV146" autocomplete="off" maxlength="120"></div>
  <div><label for="refTitleV146">Job title</label><input id="refTitleV146" autocomplete="off" maxlength="120" placeholder="e.g. ICU Nurse Manager"></div>
  <div><label for="refFacilityV146">Facility where you worked together</label><input id="refFacilityV146" list="refFacListV146" autocomplete="off" maxlength="160"><datalist id="refFacListV146">${REF_FACILITY_DOMAINS.map(([n])=>`<option value="${ec(n)}">`).join('')}</datalist></div>
  <div><label for="refUnitV146">Unit <span class="small">(optional)</span></label><input id="refUnitV146" autocomplete="off" maxlength="120" placeholder="e.g. Medical ICU"></div>
  <div><label for="refEmailV146">Work email</label><input id="refEmailV146" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="160"><div id="refEmailHintV146" class="small" role="status" aria-live="polite"></div></div>
  <div><label for="refPhoneV146">Phone <span class="small">(optional)</span></label><input id="refPhoneV146" type="tel" inputmode="tel" autocomplete="off" maxlength="24"><div id="refPhoneOptsV146" class="ref-phone-opts-v146"><label><input type="checkbox" id="refAllowTextV146" disabled> OK to text</label> <label><input type="checkbox" id="refAllowCallV146" disabled> OK to call</label></div></div>
 </div>
 <div class="small">Email is how Veridun asks for references. Only add a phone number if they agreed to be contacted by text or phone.</div>
 <div id="refAddErrV146" class="alert-v81 small hidden" role="alert"></div>
 <div class="actions" style="margin-top:10px"><button type="submit" class="pri" id="refSaveV146">Save reference</button> <button type="button" class="sec" id="refCancelV146">Cancel</button></div>
 </div></form>`;
}
function refFormValues(){return{name:$('refNameV146').value,title:$('refTitleV146').value,facility:$('refFacilityV146').value,unit:$('refUnitV146').value,email:$('refEmailV146').value,phone:$('refPhoneV146').value,allowText:$('refAllowTextV146').checked,allowCall:$('refAllowCallV146').checked}}
function refSyncForm(){
 const has=!!$('refPhoneV146').value.trim();['refAllowTextV146','refAllowCallV146'].forEach(id=>{$(id).disabled=!has;if(!has)$(id).checked=false});
 const v=$('refEmailV146').value.trim(),hint=$('refEmailHintV146');
 if(!v||!REF_EMAIL_RE.test(v)){hint.textContent='';return}
 const c=refEmailCheck({email:v,facility:$('refFacilityV146').value});hint.className='small ref-'+c.strength;hint.textContent=c.text;
}
function renderReferencesView(){
 const el=$('referencesView');if(!el)return;
 const a=sweepReferences(),st=a.map(refStatus),n=s=>st.filter(x=>x===s).length,waiting=n('REQUESTED')+n('OPENED');
 el.innerHTML=`<div class="v7-head"><div><h1>Professional References</h1><div class="small">Ask people you've worked with to vouch for you. They answer privately. You'll see where each request stands, never their answers.</div></div><button type="button" class="pri" id="refAddBtnV146"${a.length>=REF_MAX?' disabled':''}>+ Add reference</button></div>
 <div class="notice" style="margin:0 0 14px"><b>Demo:</b> nothing is actually sent. Emails, texts and calls are simulated, and references are stored only in this browser. Requests expire after ${REF_EXPIRY_DAYS} days. Because this is a demo, you can switch to the Organization role and see what an organization would see; in the real product you couldn't.</div>
 <div class="pass-summary-v85"><span class="chip">${n('COMPLETED')} completed</span><span class="chip">${waiting} waiting</span><span class="chip">${n('EXPIRED')} expired</span><span class="chip">${n('DECLINED')} declined</span><span class="demo-tag-v81">DEMO</span></div>
 <div id="refFormWrapV146">${refFormOpen?refFormHtml():''}</div>
 <div id="refListV146">${a.map(refCardHtml).join('')||`<div class="empty"><b>No references yet.</b><div class="small" style="margin-top:6px">Most agencies ask for two recent references, often a manager or charge nurse. <button type="button" class="sec mini" id="refExamplesV146">Add example references (demo)</button></div></div>`}</div>
 <div class="small" style="margin-top:10px">How references are confirmed: a work email at the facility's own email domain is stronger than a personal email. For phone references, a recruiter records who called, when, and how they reached the person. Veridun never says more than what was checked.</div>`;
 $('refAddBtnV146').onclick=()=>{refFormOpen=true;renderReferencesView();$('refNameV146')?.focus()};
 if($('refExamplesV146'))$('refExamplesV146').onclick=()=>{refAddExamples();renderReferencesView()};
 if(refFormOpen){
  ['refPhoneV146','refEmailV146','refFacilityV146'].forEach(id=>$(id).addEventListener('input',refSyncForm));refSyncForm();
  $('refCancelV146').onclick=()=>{refFormOpen=false;renderReferencesView()};
  $('refAddFormV146').onsubmit=e=>{e.preventDefault();const r=addReference(refFormValues());if(!r.ok){$('refAddErrV146').innerHTML=r.errors.map(ec).join('<br>');$('refAddErrV146').classList.remove('hidden');return}refFormOpen=false;renderReferencesView()};
 }
 el.querySelectorAll('.refAct').forEach(b=>b.onclick=()=>refAction(b.dataset.act,b.dataset.id));
 el.querySelectorAll('.ref-open-v146').forEach(l=>l.onclick=e=>{e.preventDefault();openReferenceLinkInApp(l.getAttribute('href'))});
 renderRefPassportCard();
}
function refAction(act,id){
 const r=loadReferences().find(x=>x.id===id);if(!r)return;
 if(act.startsWith('send-')){const ch=act.slice(5),again=!!r.sentAt;
  if(again&&!confirm(`Send ${r.name} a new ${ch==='CALL'?'call request':'link'}? Any earlier link stops working.`))return;
  requestReference(id,ch)}
 else if(act==='remind')remindReference(id);
 else if(act==='skip')refDemoSkipDays(id,15);
 else if(act==='remove'){if(!confirm(`Remove ${r.name} from your references?${r.status==='COMPLETED'?' Their completed reference will be deleted too.':''}`))return;removeReference(id)}
 renderReferencesView();if(typeof v81RenderRoles==='function')v81RenderRoles();
}
/* In the demo the "email" is never sent, so the link opens in this same app. */
function openReferenceLinkInApp(url){location.href=url}
function refAddExamples(){
 [{name:'Jordan Ellison',title:'ICU Nurse Manager',facility:'Saguaro Valley Medical Center',unit:'Medical ICU',email:'j.ellison@saguarovalley.example'},
  {name:'Priya Natarajan',title:'Charge Nurse',facility:'Copper Mesa Hospital',unit:'Cardiac ICU',email:'priya.natarajan.rn@gmail.com',phone:'(555) 010-0147',allowText:true,allowCall:true},
  {name:'Marcus Bell',title:'Clinical Educator',facility:'Desert Plains Hospital',unit:'Critical Care',email:'mbell@desertplains.example'}].forEach(addReference);
}
function refCounts(){const st=sweepReferences().map(refStatus),n=s=>st.filter(x=>x===s).length;return{total:st.length,completed:n('COMPLETED'),waiting:n('REQUESTED')+n('OPENED'),expired:n('EXPIRED'),declined:n('DECLINED')}}
function renderRefPassportCard(){
 const el=$('v7PassportRefsV146');if(!el)return;const c=refCounts();
 el.innerHTML=`<div class="task-category-v7"><div class="cathead"><b>Professional References</b><span class="chip">${c.completed} completed</span></div><div class="small pass-auth-v85">${c.total?`${c.waiting} waiting for an answer${c.expired?' · '+c.expired+' expired':''}${c.declined?' · '+c.declined+' declined':''}. Answers stay private.`:'No references requested yet.'} <span class="demo-tag-v81">DEMO</span></div><div style="padding:0 12px 12px"><button type="button" class="sec mini" id="refManageV146">Manage references</button></div></div>`;
 $('refManageV146').onclick=()=>showV7View('referencesView');
}

/* ---------------- The reference's private form ---------------- */
function refMonthOptions(sel){const m=['January','February','March','April','May','June','July','August','September','October','November','December'];return'<option value="">Month</option>'+m.map((x,i)=>`<option value="${i+1}"${+sel===i+1?' selected':''}>${x}</option>`).join('')}
function refYearOptions(sel){const y=new Date().getFullYear();let o='<option value="">Year</option>';for(let k=y;k>=y-40;k--)o+=`<option value="${k}"${+sel===k?' selected':''}>${k}</option>`;return o}
function refQuestionsHtml(p,nurse){
 return`<fieldset class="ref-fs-v146"><legend>When did you work with ${ec(nurse)}?</legend>
 <div class="ref-dates-v146"><span class="small">From</span> <select id="${p}FromM" aria-label="Start month">${refMonthOptions()}</select> <select id="${p}FromY" aria-label="Start year">${refYearOptions()}</select>
 <span class="small">to</span> <select id="${p}ToM" aria-label="End month">${refMonthOptions()}</select> <select id="${p}ToY" aria-label="End year">${refYearOptions()}</select></div>
 <label class="ref-inline-v146"><input type="checkbox" id="${p}Current"> Still working together</label></fieldset>
 <fieldset class="ref-fs-v146"><legend>Your role relative to ${ec(nurse)}</legend><select id="${p}Role" aria-label="Your role"><option value="">Choose…</option>${REF_ROLES.map(([k,l])=>`<option value="${k}">${ec(l)}</option>`).join('')}</select><input id="${p}RoleOther" class="hidden" maxlength="120" placeholder="Describe your role" aria-label="Describe your role"></fieldset>
 <fieldset class="ref-fs-v146"><legend>How would you rate ${ec(nurse)}?</legend>${REF_RATINGS.map(([k,l])=>`<div class="ref-rate-v146" role="radiogroup" aria-label="${ec(l)}"><div class="ref-rate-l-v146">${ec(l)}</div><div class="ref-rate-o-v146">${REF_SCALE.map(([v,t])=>`<label><input type="radio" name="${p}R_${k}" value="${v}"> ${ec(t)}</label>`).join('')}</div></div>`).join('')}</fieldset>
 <fieldset class="ref-fs-v146"><legend>Would you work with or rehire ${ec(nurse)} again?</legend><div class="ref-rate-o-v146">${Object.entries(REF_REHIRE).map(([k,l])=>`<label><input type="radio" name="${p}Rehire" value="${k}"> ${l}</label>`).join('')}</div></fieldset>
 <label for="${p}Comments">Comments <span class="small">(optional)</span></label><textarea id="${p}Comments" rows="4" maxlength="1500"></textarea>
 <label class="ref-inline-v146"><input type="checkbox" id="${p}Attest"> I confirm these answers are my own and accurate to the best of my knowledge.</label>`;
}
function refReadQuestions(p){
 const r=n=>(document.querySelector(`input[name="${n}"]:checked`)||{}).value;
 return{fromMonth:$(p+'FromM').value,fromYear:$(p+'FromY').value,toMonth:$(p+'ToM').value,toYear:$(p+'ToY').value,current:$(p+'Current').checked,role:$(p+'Role').value,roleOther:$(p+'RoleOther').value,
  ratings:Object.fromEntries(REF_RATINGS.map(([k])=>[k,r(`${p}R_${k}`)])),rehire:r(p+'Rehire'),comments:$(p+'Comments').value,attest:$(p+'Attest').checked};
}
function refWireQuestions(p){
 const sync=()=>{const cur=$(p+'Current').checked;$(p+'ToM').disabled=cur;$(p+'ToY').disabled=cur;$(p+'RoleOther').classList.toggle('hidden',$(p+'Role').value!=='OTHER')};
 $(p+'Current').onchange=sync;$(p+'Role').onchange=sync;sync();
}
function publicReferenceView(token){
 ['landing','app','public'].forEach(id=>$(id)?.classList.add('hidden'));document.querySelectorAll('.role-workspace').forEach(w=>w.classList.remove('active'));
 const box=$('refPublic');box.classList.remove('hidden');window.scrollTo(0,0);
 const back=$('refPublicBackV146');if(back)back.onclick=()=>{try{history.replaceState(null,'',location.pathname)}catch(e){}box.classList.add('hidden');v81ShowRole('clinician');showV7View('referencesView')};
 const f=refByToken(token),nurse=`${DEMO_PROFILE.name}, ${DEMO_PROFILE.credentials.split(',')[0]}`,body=$('refPublicBodyV146');
 const msg=(t,s)=>{body.innerHTML=`<div class="notice alert-v81" id="refPubStateV146" data-state="${s}">${t}</div>`};
 if(!f.ok){msg(f.reason==='REPLACED'?'<b>This link was replaced by a newer one.</b><div class="small">Please use the most recent message you received.</div>':'<b>Reference request not found.</b><div class="small">Demo limitation: requests are stored in the browser where they were created, so the link only opens there.</div>',f.reason);return}
 const r=f.ref;
 if(f.status==='COMPLETED'){msg('<b>Thank you. This reference was already submitted.</b><div class="small">For privacy, answers are not shown again here.</div>','COMPLETED');return}
 if(f.status==='DECLINED'){msg(`<b>You declined this request.</b><div class="small">${ec(DEMO_PROFILE.name)} has been told you can't give a reference. No reason was shared.</div>`,'DECLINED');return}
 if(f.status==='EXPIRED'){msg(`<b>This request has expired.</b><div class="small">Requests stay open for ${REF_EXPIRY_DAYS} days. ${ec(DEMO_PROFILE.name)} can send you a new one.</div>`,'EXPIRED');return}
 markReferenceOpened(r.id);
 body.innerHTML=`<div class="notice" id="refPubStateV146" data-state="OPEN"><b>${ec(DEMO_PROFILE.name)} listed you as a professional reference.</b><div class="small" style="margin-top:4px">Hello ${ec(r.name)}. ${ec(DEMO_PROFILE.name)} said you worked together at ${ec(refFacilityName(r.facility))}${r.unit?' ('+ec(r.unit)+')':''}. It takes about 3 minutes. <b>${ec(DEMO_PROFILE.name)} can't see your answers.</b> Healthcare organizations that ${ec(DEMO_PROFILE.name)} shares a Passport with may see them if ${ec(DEMO_PROFILE.name)} allows it. This link expires ${ec(fmtDT(refExpiresAt(r)))}.</div></div>
 <form id="refAnswerFormV146" novalidate>${refQuestionsHtml('refQ',nurse)}
 <div id="refAnswerErrV146" class="alert-v81 small hidden" role="alert"></div>
 <div class="actions" style="margin-top:12px"><button type="submit" class="pri" id="refSubmitV146">Submit reference</button> <button type="button" class="sec" id="refDeclineV146">I can't give a reference</button></div></form>
 <p class="small">Demo: this page simulates the private link the reference would receive. Nothing was emailed or texted, and answers are stored only in this browser.</p>`;
 refWireQuestions('refQ');
 $('refAnswerFormV146').onsubmit=e=>{e.preventDefault();const out=submitReferenceByLink(token,refReadQuestions('refQ'));
  if(!out.ok){if(out.errors){$('refAnswerErrV146').innerHTML=out.errors.map(ec).join('<br>');$('refAnswerErrV146').classList.remove('hidden');$('refAnswerErrV146').scrollIntoView({block:'center'})}else publicReferenceView(token);return}
  msg(`<b>Thank you. Your reference was submitted.</b><div class="small">${ec(DEMO_PROFILE.name)} will see that it's complete, but not your answers.</div>`,'SUBMITTED')};
 $('refDeclineV146').onclick=()=>{if(!confirm(`Tell ${DEMO_PROFILE.name} you can't give a reference? Your reason, if any, isn't asked for or shared.`))return;declineReferenceByLink(token);msg('<b>Thanks for letting us know.</b><div class="small">The request is closed. Nothing else is needed from you.</div>','DECLINED')};
}

/* ---------------- Verification Console: reference calls ---------------- */
let refCallId=null;
function renderRefCallsV146(){
 const el=$('verifyRefCallsBodyV146');if(!el)return;const a=sweepReferences().filter(r=>r.phone&&r.allowCall);
 const open=a.filter(r=>['REQUESTED','OPENED','EXPIRED','DRAFT'].includes(refStatus(r))),done=a.filter(r=>['COMPLETED','DECLINED'].includes(refStatus(r)));
 const row=r=>{const st=refStatus(r);return`<div class="row-v81" style="display:block" data-refcall="${r.id}"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>${ec(r.name)}</b> <span class="small">· ${ec(r.title)} · ${ec(refFacilityName(r.facility))}${r.unit?' · '+ec(r.unit):''}</span><div class="small">Reference for ${ec(DEMO_PROFILE.name)} · phone ${ec(r.phone)} · ${r.channel==='CALL'&&['REQUESTED','OPENED'].includes(st)?'call requested '+ec(fmtDT(r.sentAt)):st==='DRAFT'?'not requested yet (OK to call)':ec(REF_STATUS_LABEL[st])+(r.channel?' by '+ec(REF_CHANNEL_LABEL[r.channel].toLowerCase()):'')}</div></div>${refStatusBadge(st)}</div>${['COMPLETED','DECLINED'].includes(st)?(st==='COMPLETED'&&r.channel==='CALL'?`<div class="small" style="margin-top:4px">Called by ${ec(r.completion?.callerName||'—')} · ${ec(fmtDT(r.completion?.callAt))}</div>`:''):`<div class="actions" style="margin-top:6px"><button type="button" class="pri mini refCallAct" data-act="record" data-id="${r.id}">Record call</button> <button type="button" class="sec mini refCallAct" data-act="declined" data-id="${r.id}">Reference declined on the call</button></div>`}</div>`};
 el.innerHTML=`<div class="small" style="margin-bottom:8px">Phone references the nurse allowed to be called. The caller fills in the same questions as the online form while on the phone; the record shows who called, when, and how they reached the person. <b>Demo:</b> no call is placed.</div>${open.map(row).join('')||'<div class="small">No calls waiting.</div>'}${done.length?'<h4 class="sec-h-v84">Done</h4>'+done.map(row).join(''):''}<div id="refCallFormWrapV146"></div>`;
 el.querySelectorAll('.refCallAct').forEach(b=>b.onclick=()=>{if(b.dataset.act==='record')openRefCallForm(b.dataset.id);else{const who=prompt('Who made the call?','');if(who===null)return;declineReferenceByCall(b.dataset.id,who);v81RenderRoles()}});
}
function refLocalDateTime(d=new Date()){const p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}
function openRefCallForm(id){
 const r=loadReferences().find(x=>x.id===id);if(!r)return;refCallId=id;
 const w=$('refCallFormWrapV146');
 w.innerHTML=`<form id="refCallFormV146" class="panel-v81" novalidate><div class="ph">Phone reference: ${ec(r.name)} <span class="demo-tag-v81">DEMO · NO CALL PLACED</span></div><div class="pb">
 <div class="grid2-v83"><div><label for="refCallerV146">Your name (caller)</label><input id="refCallerV146" maxlength="120" autocomplete="off"></div><div><label for="refCallerOrgV146">Your organization or role</label><input id="refCallerOrgV146" maxlength="120" autocomplete="off" placeholder="e.g. Northstar Travel Nursing, recruiter"></div>
 <div><label for="refCallAtV146">Call date and time</label><input id="refCallAtV146" type="datetime-local" value="${refLocalDateTime()}"></div>
 <div><label for="refCallConfirmV146">How did you reach them?</label><select id="refCallConfirmV146"><option value="">Choose…</option>${Object.entries(REF_CALL_CONFIRM).map(([k,l])=>`<option value="${k}">${ec(l)}</option>`).join('')}</select><input id="refCallNoteV146" maxlength="300" placeholder="Note (required for Other)" aria-label="How you confirmed who you spoke with"></div></div>
 <div class="small" style="margin:6px 0">Number the nurse gave: ${ec(r.phone)} · ${ec(refFacilityName(r.facility))}</div>
 ${refQuestionsHtml('refC',DEMO_PROFILE.name)}
 <div id="refCallErrV146" class="alert-v81 small hidden" role="alert"></div>
 <div class="actions" style="margin-top:10px"><button type="submit" class="pri" id="refCallSaveV146">Save phone reference</button> <button type="button" class="sec" id="refCallCancelV146">Cancel</button></div></div></form>`;
 refWireQuestions('refC');
 $('refCallCancelV146').onclick=()=>{w.innerHTML='';refCallId=null};
 $('refCallFormV146').onsubmit=e=>{e.preventDefault();const at=$('refCallAtV146').value;
  const out=submitReferenceByCall(refCallId,refReadQuestions('refC'),{callerName:$('refCallerV146').value,callerOrg:$('refCallerOrgV146').value,callAt:at?new Date(at).toISOString():'',confirm:$('refCallConfirmV146').value,confirmNote:$('refCallNoteV146').value});
  if(!out.ok){$('refCallErrV146').innerHTML=(out.errors||['This reference can no longer be recorded.']).map(ec).join('<br>');$('refCallErrV146').classList.remove('hidden');return}
  refCallId=null;v81RenderRoles()};
 w.scrollIntoView({block:'start'});
}

/* ---------------- Organizations (through a share) ---------------- */
const REF_SHARE_SCOPES=[['NONE','Don\'t include references'],['SUMMARY','Completed references: who, and how each was confirmed (no answers)'],['ANSWERS','Completed references with their answers']];
function refScopeLabel(s){return(REF_SHARE_SCOPES.find(x=>x[0]===s)||REF_SHARE_SCOPES[0])[1]}
function refStars(v){return+v===0?'Not observed':`${'★'.repeat(+v)}${'☆'.repeat(5-+v)} ${REF_SCALE.find(x=>x[0]===+v)?.[1]||''}`}
function refMonthYear(m,y){return m&&y?new Date(y,m-1,1).toLocaleDateString(undefined,{month:'short',year:'numeric'}):'—'}
/* Live block for an organization's view of a share. Called only after the
   share passed accessShare() (not revoked, not expired). */
function sharedReferencesHtml(share){
 const scope=share&&share.referencesScope||'NONE';if(scope==='NONE')return'';
 const done=sweepReferences().filter(r=>refStatus(r)==='COMPLETED'),resp=scope==='ANSWERS'?loadRefResponses():{};
 const item=r=>{const a=resp[r.id],prov=refProvenance(r).map(([k,v])=>`<div><span class="small">${ec(k)}:</span> ${ec(v)}</div>`).join('');
  const ans=a?`<div class="ref-answers-v146"><div><b>Worked together:</b> ${ec(refMonthYear(a.fromMonth,a.fromYear))} – ${a.current?'present':ec(refMonthYear(a.toMonth,a.toYear))} · <b>Role:</b> ${ec((REF_ROLES.find(x=>x[0]===a.role)||[])[1]||a.role)}${a.roleOther?' ('+ec(a.roleOther)+')':''}</div>${REF_RATINGS.map(([k,l])=>`<div>${ec(l)}: <b>${ec(refStars(a.ratings[k]))}</b></div>`).join('')}<div><b>Would work with or rehire again:</b> ${ec(REF_REHIRE[a.rehire]||'—')}</div>${a.comments?`<div><b>Comments:</b> “${ec(a.comments)}”</div>`:''}</div>`:'';
  return`<div class="passrow ref-shared-v146" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>${ec(r.name)}</b><div class="small">${ec(r.title)} · ${ec(refFacilityName(r.facility))}${r.unit?' · '+ec(r.unit):''}</div></div><span class="badge ACCEPTED">COMPLETED</span></div><div class="small ref-prov-v146">${prov}<div><span class="small">How they were confirmed:</span> <span class="ref-chip-v146 ref-${refStrength(r)}">${refStrength(r)==='stronger'?'Stronger':'Weaker'}</span> ${ec(refIdentityText(r))}</div></div>${ans}</div>`};
 return`<div class="ref-share-block-v146" data-scope="${scope}"><div style="font-weight:800;margin:12px 0 4px">Professional references · ${done.length} completed <span class="demo-tag-v81">DEMO</span></div><div class="small" style="margin-bottom:6px">${scope==='ANSWERS'?'The clinician allowed you to see the answers. The clinician has not seen them.':'Answers not shared. The clinician chose to share who completed a reference and how each was confirmed.'} References are employer-provided information, not primary-source verification.</div>${done.map(item).join('')||'<div class="small">No completed references yet.</div>'}</div>`;
}
/* Share dialog control (demo shares). */
function refShareControlHtml(){const c=refCounts();return`<label for="shareRefScopeV146">Professional references <span class="small">(${c.completed} completed)</span></label><select id="shareRefScopeV146">${REF_SHARE_SCOPES.map(([k,l])=>`<option value="${k}">${ec(l)}</option>`).join('')}</select><div class="small" style="margin:-6px 0 10px">You never see the answers yourself. Choose what this organization may see.</div>`}
function refEnsureShareControl(value){
 let w=$('shareRefRowV146');if(!w)return;w.innerHTML=refShareControlHtml();$('shareRefScopeV146').value=value||'NONE';
 $('shareRefScopeV146').onchange=()=>{if(typeof updateShareReview==='function')updateShareReview()};
}
function refSelectedScope(){return $('shareRefScopeV146')?.value||'NONE'}
if(typeof module!=='undefined')module.exports={refEmailCheck,refValidate,refValidateAnswers,refStatus,REF_EXPIRY_DAYS};
