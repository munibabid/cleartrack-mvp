/* Your account (PR 10): real sign-in + cross-device sync.
   Everything here goes through store.account (SupabaseAdapter in js/store.js):
   publishable key + the user's JWT, row-level security on every table.
   The demo (Alex Morgan, Boston tour, simulated verification) is untouched
   and stays in this browser. Account data lives in memory only.
   Honesty rules: nothing in an account is shown as verified unless a real
   verifier changed it server-side (clients can't). Revocation is final.
   Organizations can only ask for more time; the clinician decides. */
const ACCT_STATUS_TEXT={VERIFYING:'SUBMITTED · NOT VERIFIED',UNVERIFIED:'SUBMITTED · NOT VERIFIED',VERIFIED:'VERIFIED',REJECTED:'REJECTED',REVOKED:'REVOKED BY ISSUER',EXPIRED:'EXPIRED'};
let acctTab='acctPassportV10',acctOrgList=null,acctOrgId=null,acctOrgShares=null,acctLastCreated=null,acctOrgResult=null,acctBusy=false;
const acct=()=>store.account;
function acctToday(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function acctRedirectUrl(){const here=location.origin+location.pathname,cfg=(window.VERIDUN_CONFIG&&VERIDUN_CONFIG.accounts)||{};return cfg.redirectUrl&&here.startsWith(cfg.redirectUrl.replace(/\/$/,''))?cfg.redirectUrl:here}
function acctMsg(text,kind='',where){const ids=where?[where]:['acctMsgV10','acctWsMsgV10'];ids.forEach(id=>{const el=$(id);if(!el)return;el.textContent=text||'';el.className='small acct-msg-v10'+(kind?' '+kind:'')})}
function acctErr(e,where){console.warn('[Veridun account]',e);acctMsg(String(e&&e.message||e).replace(/postgres(ql)?:\/\/\S+/g,'postgres://***'),'err',where)}
async function acctDo(fn,okText){if(acctBusy)return;acctBusy=true;document.body.classList.add('acct-busy-v10');try{const r=await fn();if(okText)acctMsg(okText,'ok');return r}catch(e){acctErr(e)}finally{acctBusy=false;document.body.classList.remove('acct-busy-v10');acctRenderAll()}}

/* ---------- landing card + workspace shell ---------- */
function acctRenderCard(){
 const a=acct(),card=$('acctCardV10');if(!card)return;card.classList.toggle('hidden',!a);if(!a)return;
 $('acctSignedOutV10').classList.toggle('hidden',a.signedIn);$('acctSignedInV10').classList.toggle('hidden',!a.signedIn);
 if(a.signedIn)$('acctEmailShownV10').textContent=a.email;
 if($('backendStatusTextV88'))$('backendStatusTextV88').textContent=store.backend.description+(store.backend.warning?' · config ignored: '+store.backend.warning:'');
}
function acctHideOthers(){['landing','app','public'].forEach(id=>$(id)&&$(id).classList.add('hidden'));['organizationWorkspace','verificationWorkspace'].forEach(id=>$(id)&&$(id).classList.remove('active'));document.body.classList.remove('role-clinician')}
function acctShow(tab){
 const a=acct();if(!a||!a.signedIn){v81RolePicker();acctMsg('Sign in first.','err');return}
 acctHideOthers();$('accountWorkspace').classList.add('active');if(tab)acctTab=tab;acctRenderAll();window.scrollTo(0,0);
}
function acctLeave(){$('accountWorkspace').classList.remove('active');v81RolePicker()}
function acctRenderAll(){
 acctRenderCard();const a=acct();if(!a||!$('accountWorkspace').classList.contains('active'))return;
 if(!a.signedIn){acctLeave();return}
 $('acctWsEmailV10').textContent=a.email;
 document.querySelectorAll('.acctTab').forEach(b=>b.classList.toggle('active',b.dataset.target===acctTab));
 document.querySelectorAll('.acctPanel').forEach(p=>p.classList.toggle('hidden',p.id!==acctTab));
 ({acctPassportV10:acctRenderPassport,acctSharesV10:acctRenderShares,acctOrgV10:acctRenderOrg,acctActivityV10:acctRenderActivity})[acctTab]();
}

/* ---------- Passport: profile + credentials ---------- */
function acctOptions(list,sel,blank){return(blank?`<option value="">${ec(blank)}</option>`:'')+list.map(([v,l])=>`<option value="${ec(v)}"${v===sel?' selected':''}>${ec(l)}</option>`).join('')}
function acctHomeStateNote(code){const el=$('acctHomeNoteV10');if(el)el.innerHTML=code?ec(homeStateCompactText(code)):'Choose your home state to see whether it is a compact (NLC) state.'}
function acctProfileForm(p){
 return`<div class="panel-v81"><div class="ph">${p?'Edit your profile':'Set up your clinician profile'}</div><div class="pb"><form id="acctProfileFormV10" class="acct-form-v10">
 <label>Full name<input id="acctNameV10" required maxlength="120" value="${ec(p?.full_name||'')}" autocomplete="name"></label>
 <label>Credentials after your name <span class="small">(optional, e.g. RN, BSN)</span><input id="acctPostV10" maxlength="60" value="${ec(p?.post_nominals||'')}"></label>
 <label>Primary specialty<select id="acctSpecV10" required>${specialtyOptionsHtml(p?.specialty||'',p?'Select specialty':'Select specialty')}</select></label>
 <fieldset class="acct-fieldset-v10"><legend>Other specialties <span class="small">(optional, up to 5 — used when an opportunity accepts one of them instead of your primary)</span></legend><div class="acct-sec-specs-v11">${specialtiesByGroup().map(g=>`<details${(p?.secondary_specialties||[]).some(id=>g.items.some(s=>s.id===id))?' open':''}><summary>${ec(g.label)}</summary>${g.items.map(sp=>`<label class="acct-sec-v11"><input type="checkbox" class="acctSecSpecV10" value="${sp.id}"${(p?.secondary_specialties||[]).includes(sp.id)?' checked':''}> ${ec(sp.name)}</label>`).join('')}</details>`).join('')}</div></fieldset>
 <label>Home state<select id="acctHomeV10">${acctOptions(US_JURISDICTIONS.map(j=>[j.code,j.name]),p?.home_jurisdiction||'','Choose…')}</select></label>
 <div class="small acct-note-v10" id="acctHomeNoteV10"></div>
 <div class="acct-row-v10"><button class="pri" type="submit">Save profile</button>${p?'<button class="sec" type="button" data-act="cancel-profile">Cancel</button>':''}</div></form></div></div>`;
}
let acctEditingProfile=false;
function acctCredStatus(c){
 const expired=c.expires_on&&c.expires_on<acctToday();
 if(expired)return{cls:'REVOKED',text:'EXPIRED',sub:'Expired '+fd(c.expires_on)};
 const text=ACCT_STATUS_TEXT[c.status]||c.status;
 const cls=c.status==='VERIFIED'?'VERIFIED':(c.status==='VERIFYING'||c.status==='UNVERIFIED')?'PENDING':'REVOKED';
 const lic=c.kind==='RN_LICENSE'||c.kind==='RN_LICENSE_MULTISTATE';
 const sub=(c.status==='VERIFYING'||c.status==='UNVERIFIED')?(lic?`Not verified yet. A real check would use ${licensePrimarySource(c.kind,c.jurisdiction_code)}. No verifier is connected in staging.`:'Not checked with the issuer. No verifier is connected in staging.'):c.status==='VERIFIED'?'Verified by a Veridun verifier'+(c.verified_at?' on '+fd(c.verified_at.slice(0,10)):''):'';
 return{cls,text,sub};
}
function acctKindOptions(){
 const groups={};CREDENTIAL_CATALOG.forEach(k=>(groups[k.category]??=[]).push(k));
 const p=acct()?.cache?.profile,mine=p?[p.specialty,...(p.secondary_specialties||[])].map(specialty).filter(Boolean):[];
 const top=mine.length?`<optgroup label="Your specialties">${mine.flatMap(sp=>[sp.expKind,sp.skillsKind]).map(k=>catalogKind(k)).map(k=>`<option value="${k.kind}">${ec(k.label)}</option>`).join('')}</optgroup>`:'';
 return'<option value="">Choose a credential type…</option>'+top+Object.entries(groups).map(([g,ks])=>`<optgroup label="${ec(g)}">${ks.map(k=>`<option value="${k.kind}">${ec(k.label)}${k.privacy==='PRIVATE'?' (private)':''}</option>`).join('')}</optgroup>`).join('');
}
function acctRenderPassport(){
 const a=acct(),c=a.cache,p=c.profile,el=$('acctPassportV10');
 if(!p||acctEditingProfile){el.innerHTML=acctProfileForm(p)+(!p?`<div class="small acct-note-v10">Your profile, credentials and shares are saved to your account so you can open them on any device where you sign in. The demo Passport (Alex Morgan) is not copied here.</div>`:'');acctHomeStateNote(p?.home_jurisdiction);return}
 const creds=c.credentials;
 const sec=(p.secondary_specialties||[]).filter(id=>id!==p.specialty),compact=p.home_jurisdiction?nlcStatusLabel(p.home_jurisdiction):'';el.innerHTML=`<div class="panel-v81"><div class="ph"><span>${ec(p.full_name)}${p.post_nominals?', '+ec(p.post_nominals):''}</span><button class="mini sec" type="button" data-act="edit-profile">Edit profile</button></div><div class="pb small">${ec(specialtyName(p.specialty))}${sec.length?' · also '+ec(sec.map(specialtyShort).join(', ')):' '} · Home state: ${ec(p.home_jurisdiction?jurisdictionName(p.home_jurisdiction):'not set')}${compact?' ('+ec(compact)+')':''} · <span class="acct-tag-v10 subtle">YOUR ACCOUNT</span></div><div class="pb small">${p.home_jurisdiction?ec(homeStateCompactText(p.home_jurisdiction)):''}</div></div>
 <div class="panel-v81"><div class="ph"><span>My credentials (${creds.length})</span><button class="mini pri" type="button" data-act="toggle-add">+ Add credential</button></div><div class="pb">
 <div id="acctAddWrapV10" class="hidden">${acctAddForm()}</div>
 ${creds.length?`<div class="acct-list-v10">${creds.map(acctCredRow).join('')}</div>`:'<div class="empty"><b>No credentials yet.</b><div class="small">Add your RN license, certifications, skills checklists and employer verifications. They start as “Submitted · not verified”.</div></div>'}
 </div></div>${acctReadinessPanel(p)}`;
 acctSyncAddForm();
}
/* Readiness check (PR 11): what an assignment in a given state would ask of
   this clinician — work-type base + the profile specialty module + state
   licensure (compact rules from the jurisdictions data). Account credentials
   are never MET until a real verifier checks them: they show as
   "submitted, not verified". */
let acctReady={state:'',work:'TRAVEL_RN'};
function acctReadinessItems(p,stateCode,workType){
 const start=isoDay(addDays(new Date(),14)),end=isoDay(addDays(new Date(),14+91));
 const a={id:'acct-check',name:'Readiness check',jurisdiction:stateCode,workType,specialties:[p.specialty],overrides:{},start,end};
 const list=acct().cache.credentials.map(SupabaseMapping.rowToCredential);
 const reqs=layeredRequirements(a,p.specialty);
 return{a,reqs,items:reqs.map(r=>({...evaluateRequirement(r,a,list),layer:r.layer}))};
}
function acctLicenseCoversState(stateCode){
 const lic=acct().cache.credentials.filter(c=>c.kind==='RN_LICENSE'||c.kind==='RN_LICENSE_MULTISTATE');
 const hit=lic.find(c=>satisfactionBasis({kind:RN_AUTHORIZATION,jurisdiction:stateCode},{kind:c.kind,jurisdiction:c.jurisdiction_code}));
 return hit?{c:hit,basis:satisfactionBasis({kind:RN_AUTHORIZATION,jurisdiction:stateCode},{kind:hit.kind,jurisdiction:hit.jurisdiction_code})}:null;
}
function acctReadinessPanel(p){
 const st=acctReady.state||p.home_jurisdiction||'';
 if(!st)return`<div class="panel-v81" id="acctReadyPanelV11"><div class="ph">Readiness check</div><div class="pb small">Set your home state in your profile to check readiness.</div></div>`;
 const {items}=acctReadinessItems(p,st,acctReady.work),cov=acctLicenseCoversState(st);
 const lbl={MET:'✓ Verified',PENDING_VERIFICATION:'⏳ Submitted, not verified',MISSING:'○ Missing',EXPIRES_BEFORE_END:'⚠ Expires before the assignment ends',NOT_RECENT:'⚠ Not recent enough'};
 const pend=items.filter(i=>i.status==='PENDING_VERIFICATION').length,miss=items.filter(i=>i.status!=='MET'&&i.status!=='PENDING_VERIFICATION').length;
 return`<div class="panel-v81" id="acctReadyPanelV11"><div class="ph">Readiness check · ${ec(specialtyShort(p.specialty))}</div><div class="pb">
 <div class="grid2-v83"><label>Assignment state<select id="acctReadyStateV11">${acctOptions(US_JURISDICTIONS.map(j=>[j.code,`${j.name} · ${nlcStatusLabel(j.code)}`]),st)}</select></label><label>Work type<select id="acctReadyWorkV11">${acctOptions(WORK_TYPE_BASES.map(w=>[w.id,w.name]),acctReady.work)}</select></label></div>
 <div class="small acct-ready-lic-v11" id="acctReadyLicV11"><b>${ec(jurisdictionName(st))} RN license:</b> ${cov?ec(`covered by your ${cov.c.display_name} (${cov.basis}) — submitted, not verified`):ec(`not covered yet. ${nlcHonorsCompactIn(st)?'A multistate license from a compact home state, or a':'A'} ${jurisdictionName(st)} license is needed${nlcHonorsCompactIn(st)?'':' ('+nlcStatusLabel(st)+')'}.`)}</div>
 <div class="small" style="margin:6px 0">${items.length} requirements (state + ${ec(workTypeBase(acctReady.work)?.name||'')} base + ${ec(specialtyShort(p.specialty))} module) · ${pend} submitted, not verified · ${miss} missing. Nothing counts as met until a real verifier checks it.</div>
 <ul class="req-list acct-ready-list-v11">${items.map(i=>`<li data-kind="${ec(i.req.kind)}" data-status="${i.status}">${ec(lbl[i.status]||i.status)} · ${ec(i.label)} <span class="layer-tag-v84 layer-${i.layer}">${LAYERS[i.layer]}</span>${i.req.minMonths?` <span class="small">· at least ${i.req.minMonths} months of work in the last ${i.req.windowMonths}</span>`:''}${i.note&&i.status!=='PENDING_VERIFICATION'?`<div class="small">${ec(i.note)}</div>`:''}</li>`).join('')}</ul>
 ${specialtyPreferred(p.specialty).length?`<div class="small">Preferred, not required: ${specialtyPreferred(p.specialty).map(k=>ec(catalogKind(k)?.short||k)).join(' · ')}</div>`:''}
 </div></div>`;
}
function acctCredRow(c){
 const s=acctCredStatus(c),priv=catalogPrivacy(c.kind)==='PRIVATE';
 const lic=c.kind==='RN_LICENSE'||c.kind==='RN_LICENSE_MULTISTATE',home=acct().cache.profile?.home_jurisdiction,m=c.metadata||{};
 const hist=acct().cache.events.filter(e=>e.credential_id===c.id).slice().reverse().map(e=>`${ACCT_EVENT_TEXT[e.event_type]||e.event_type} ${fmtDT(e.occurred_at)}`);
 return`<div class="acct-item-v10" data-cred="${c.id}"><div class="acct-item-main-v10"><b>${ec(c.display_name)}</b><div class="small">${ec(catalogKind(c.kind)?.short||catalogKind(c.kind)?.label||c.kind)}${c.jurisdiction_code?' · '+ec(c.jurisdiction_code):''}${c.expires_on?' · expires '+fd(c.expires_on):''}${priv?' · <span class="badge PRIVATE">PRIVATE</span>':''}</div><div class="small">${ec(s.sub)}</div>${lic&&c.jurisdiction_code?`<div class="small acct-cov-v11">${ec(licenseCoverage(c.kind,c.jurisdiction_code).text)}${ec(licenseHomeStateHint(c.kind,c.jurisdiction_code,home))}</div>`:''}${catalogKind(c.kind)?.experience&&(m.years!=null||m.recent_months!=null||m.last_worked_on)?`<div class="small">${[m.years!=null?m.years+' yrs':'',m.recent_months!=null?m.recent_months+' months in the last 2 years':'',m.last_worked_on?'last worked '+fd(m.last_worked_on):''].filter(Boolean).map(ec).join(' · ')}</div>`:''}<div class="small acct-hist-v11">History: ${hist.length?ec(hist.join(' · ')):'added'} · not verified by anyone yet</div>
 <div class="small">Document: ${c.source_document_path?`private file · <button class="linkbtn-v10" type="button" data-act="doc-open" data-id="${c.id}">Open (60-second signed link)</button>`:'none'} · <label class="linkbtn-v10">${c.source_document_path?'Replace':'Upload'} file<input type="file" class="acct-doc-input-v10 sr-only-v10" data-id="${c.id}" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/png,image/jpeg"></label></div></div>
 <div class="acct-item-side-v10"><span class="badge ${s.cls}">${ec(s.text)}</span><button class="mini sec" type="button" data-act="cred-delete" data-id="${c.id}">Delete</button></div></div>`;
}
function acctAddForm(){
 return`<form id="acctAddFormV10" class="acct-form-v10 acct-add-v10">
 <label>Credential type<select id="acctKindV10" required>${acctKindOptions()}</select></label>
 <label id="acctJurRowV10" class="hidden">State<select id="acctJurV10"></select></label>
 <label id="acctNameRowV10" class="hidden">Credential name<input id="acctCustomNameV10" maxlength="120"></label>
 <div id="acctExpHelpV10" class="small hidden" style="margin:6px 0"></div>
 <div id="acctExpRowV10" class="hidden"><div class="grid2-v83"><label>Years in this specialty <span class="small">(optional)</span><input type="number" id="acctExpYearsV10" min="0" max="60" step="0.5"></label><label>Months worked in the last 2 years <span class="small">(optional)</span><input type="number" id="acctExpRecentV10" min="0" max="24"></label></div><label>Last worked in this specialty<input type="date" id="acctExpLastV10"></label></div>
 <fieldset id="acctLicTypeRowV10" class="acct-fieldset-v10 hidden"><legend>License type</legend><label class="acct-sec-v11"><input type="radio" name="acctLicTypeV10" value="MULTI"> Multistate (compact) — issued by your home state</label><label class="acct-sec-v11"><input type="radio" name="acctLicTypeV10" value="SINGLE"> Single-state — covers this state only</label></fieldset>
 <div id="acctLicenseNoteV10" class="small hidden" style="margin:6px 0"></div>
 <label>Expiration date <span class="small">(if it has one)</span><input type="date" id="acctExpV10"></label>
 <label>Source document <span class="small">(optional · PDF, PNG, JPEG, DOC, DOCX · max 10 MB · private)</span><input type="file" id="acctFileV10" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,application/pdf,image/png,image/jpeg"></label>
 <div class="small acct-note-v10" id="acctPrivNoteV10"></div>
 <div class="small acct-note-v10"><b>Staging:</b> use test documents only, no real PHI.</div>
 <div class="acct-row-v10"><button class="pri" type="submit">Save to my account</button><button class="sec" type="button" data-act="toggle-add">Cancel</button></div></form>`;
}
function acctSyncAddForm(){
 const sel=$('acctKindV10');if(!sel)return;const k=catalogKind(sel.value);
 $('acctJurRowV10').classList.toggle('hidden',!k||!k.jurisdiction);$('acctNameRowV10').classList.toggle('hidden',!k||k.kind!=='OTHER');
 if(k&&k.jurisdiction){const list=k.jurisdiction==='NLC_HOME'?multistateHomeJurisdictions():US_JURISDICTIONS;const cur=$('acctJurV10').value;$('acctJurV10').innerHTML=acctOptions(list.map(j=>[j.code,j.name]),cur||(acct().cache.profile?.home_jurisdiction||''),k.jurisdiction==='NLC_HOME'?'Home state (compact)…':'Choose a state…')}
 $('acctPrivNoteV10').textContent=k?(k.privacy==='PRIVATE'?'Private record: organizations only ever see “Requirement satisfied”, never details, dates or the document.':'Shareable: organizations you share with see the name, issuer, state and expiration, never the document.')+(k.kind==='RN_LICENSE'||k.kind==='RN_LICENSE_MULTISTATE'?' Status stays “Submitted, not verified” until a verifier checks it with '+licensePrimarySource(k.kind,$('acctJurV10').value||acct().cache.profile?.home_jurisdiction)+'.':' '):'';
 const eh=$('acctExpHelpV10');if(eh){eh.classList.toggle('hidden',!k?.experience);eh.innerHTML=k?.experience?ec(experienceHelpText(k.kind)):'';}
 const er=$('acctExpRowV10');if(er)er.classList.toggle('hidden',!k?.experience);
 acctLicenseNote();
}
async function acctSubmitCredential(){
 const a=acct(),k=catalogKind(acctLicenseKind()||$('acctKindV10').value);if(!k)throw new Error('Choose a credential type.');
 let jur='';if(k.jurisdiction){jur=$('acctJurV10').value;if(!jur)throw new Error('Choose the state for this license.')}
 const custom=$('acctCustomNameV10').value.trim();if(k.kind==='OTHER'&&!custom)throw new Error('Enter a credential name.');
 const name=k.kind==='OTHER'?custom:credentialDisplayName(k.kind,jur);
 const type=k.kind==='OTHER'?'CUSTOM_'+(custom.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40)||'CREDENTIAL'):credentialTypeCode(k.kind,jur);
 const file=$('acctFileV10').files[0]||null;
 const meta=k.experience?Object.fromEntries(Object.entries({years:$('acctExpYearsV10').value!==''?+$('acctExpYearsV10').value:null,recent_months:$('acctExpRecentV10').value!==''?+$('acctExpRecentV10').value:null,last_worked_on:$('acctExpLastV10').value||null}).filter(([,v])=>v!=null&&v!=='')):{};
 if(k.kind==='RN_LICENSE_MULTISTATE'&&jur){const h=a.cache.profile?.home_jurisdiction;if(h&&jur!==h&&!confirm(`A multistate license is issued only by your primary state of residence. Your home state is ${jurisdictionName(h)}, but this license is from ${jurisdictionName(jur)}.\n\nSave it anyway? (If you moved, update your home state in your profile.)`))return null;if(!nlcCanIssueMultistate(jur))throw new Error(`${jurisdictionName(jur)} can't issue multistate licenses (${nlcStatusLabel(jur)}). Choose “RN License — single-state”, or pick a compact home state.`)}
 await a.addCredential({kind:k.kind,type_code:type,display_name:name,jurisdiction_code:jur||null,expires_on:$('acctExpV10').value||null,metadata:meta},file);
 return name;
}
/* RN licenses (PR 11): the home state drives compact (NLC) logic. When the
   license's state can issue multistate licenses, a License type choice
   appears; it defaults to multistate for the clinician's own compact home
   state (single-state can still be chosen). */
let acctLicTypeTouched=false;
const acctIsLicenseKind=k=>!!k&&(k.kind==='RN_LICENSE'||k.kind==='RN_LICENSE_MULTISTATE');
function acctLicenseKind(){
 const k=catalogKind($('acctKindV10')?.value);if(!acctIsLicenseKind(k))return k?.kind||'';
 const row=$('acctLicTypeRowV10');if(row&&!row.classList.contains('hidden')){const v=document.querySelector('input[name=acctLicTypeV10]:checked')?.value;return v==='MULTI'?'RN_LICENSE_MULTISTATE':'RN_LICENSE'}
 return k.kind;
}
function acctLicenseNote(){
 const k=catalogKind($('acctKindV10')?.value),box=$('acctLicenseNoteV10'),row=$('acctLicTypeRowV10');if(!box||!row)return;
 if(!acctIsLicenseKind(k)){box.classList.add('hidden');row.classList.add('hidden');return}
 const home=acct().cache.profile?.home_jurisdiction,jur=$('acctJurV10')?.value||'';
 const canMulti=!!jur&&nlcCanIssueMultistate(jur);row.classList.toggle('hidden',!canMulti);
 if(canMulti&&!acctLicTypeTouched){const multi=k.kind==='RN_LICENSE_MULTISTATE'||(jur===home&&homeStateIsCompact(home));document.querySelectorAll('input[name=acctLicTypeV10]').forEach(r=>r.checked=r.value===(multi?'MULTI':'SINGLE'))}
 const kind=acctLicenseKind(),cov=jur?licenseCoverage(kind,jur):null,warn=licenseHomeStateHint(kind,jur,home);
 const lines=[];
 if(warn&&kind==='RN_LICENSE_MULTISTATE')lines.push('<b>'+ec(warn.replace(/^ · /,''))+'</b>');
 if(home)lines.push(ec(homeStateIsCompact(home)?`Your home state, ${jurisdictionName(home)}, is a compact state, so a license from ${jurisdictionName(home)} defaults to multistate. Choose single-state if yours isn't multistate.`:`Your home state, ${jurisdictionName(home)}, isn't a compact state: a license from it covers ${jurisdictionName(home)} only.`));
 else lines.push('Set your home state in your profile so Veridun can tell whether your license can be multistate.');
 if(cov)lines.push(ec(cov.text));
 if(jur)lines.push('Verification: not verified yet. A real check would use '+ec(licensePrimarySource(kind,jur))+'.');
 box.classList.remove('hidden');box.innerHTML=lines.join('<br>');
}
function acctApplyLicenseDefaults(){
 acctLicTypeTouched=false;const k=catalogKind($('acctKindV10')?.value);if(!acctIsLicenseKind(k)){acctLicenseNote();return}
 const home=acct().cache.profile?.home_jurisdiction,sel=$('acctJurV10');
 if(home&&sel&&!sel.value&&[...sel.options].some(o=>o.value===home))sel.value=home;
 acctLicenseNote();
}
/* ---------- Shares (clinician) ---------- */
function acctShareStatus(s){if(s.status==='REVOKED'||s.revoked_at)return'REVOKED';if(s.status==='USED')return'USED';if(s.status==='EXPIRED'||(s.expires_at&&new Date(s.expires_at)<=new Date()))return'EXPIRED';return'ACTIVE'}
function acctExpiryFor(duration,startsOn,endsOn,customDate){
 if(duration==='UNTIL_REVOKED')return null;
 if(duration==='UNTIL_ASSIGNMENT_START'&&!startsOn)throw new Error('Enter the assignment start date for “Until Assignment Start”.');
 if(duration==='THROUGH_ASSIGNMENT_END'&&!endsOn)throw new Error('Enter the assignment end date for “Through Assignment End”.');
 if(duration==='CUSTOM_DATE'&&!customDate)throw new Error('Choose the custom end date.');
 const d=computeExpiry(duration,{start:startsOn,end:endsOn},customDate);if(!d)throw new Error('Choose an access length.');
 if(d<=new Date())throw new Error('That end date is already in the past.');return d.toISOString();
}
function acctShareUrl(token){return acctRedirectUrl().replace(/\/?$/,'/').replace(/\/\/$/,'/')+'?share='+token}
function acctRenderShares(){
 const a=acct(),c=a.cache,el=$('acctSharesV10');
 if(!c.profile){el.innerHTML='<div class="empty"><b>Set up your profile first</b><div class="small">Passport → Set up your clinician profile.</div></div>';return}
 const pend=c.requests.filter(r=>r.status==='PENDING');
 el.innerHTML=`${acctLastCreated?acctCreatedHtml(acctLastCreated):''}
 <div class="panel-v81"><div class="ph"><span>Share with an organization</span><button class="mini pri" type="button" data-act="toggle-share">+ New share</button></div><div class="pb"><div id="acctShareWrapV10" class="hidden"></div>
 <div class="small">A share is live: the organization always sees the current status of what you picked, only while the share is active. Documents are never shared. You can revoke at any time, and revoking is final.</div></div></div>
 ${pend.length?`<div class="panel-v81 acct-attn-v10"><div class="ph">Extension requests waiting for you (${pend.length})</div><div class="pb">${pend.map(r=>{const s=c.shares.find(x=>x.id===r.grant_id);return`<div class="acct-item-v10"><div class="acct-item-main-v10"><b>${ec(s?.organizations?.name||'Organization')}</b> asks for access until <b>${fd(r.requested_until)}</b><div class="small">${ec(s?.assignment_label||'')}${r.reason?' · “'+ec(r.reason)+'”':''}</div></div><div class="acct-item-side-v10"><button class="mini pri" type="button" data-act="req-approve" data-id="${r.id}">Approve</button><button class="mini sec" type="button" data-act="req-decline" data-id="${r.id}">Decline</button></div></div>`}).join('')}</div></div>`:''}
 <div class="panel-v81"><div class="ph">My shares (${c.shares.length})</div><div class="pb">${c.shares.length?c.shares.map(acctShareRow).join(''):'<div class="small">No shares yet.</div>'}</div></div>`;
 if(acctLastCreated)drawShareQr($('acctQrV11'),acctLastCreated.url);
}
function acctCreatedHtml(x){
 return`<div class="panel-v81 acct-created-v10"><div class="ph"><span>Share created for ${ec(x.orgName)}</span><button class="mini sec" type="button" data-act="dismiss-created">Done</button></div><div class="pb">
 <div class="small">Send this link or code to the organization. They open it while signed in to their Veridun organization account. <b>It is shown only now:</b> Veridun stores only a fingerprint of it, so if you lose it, create a new share.</div>
 <div class="acct-copy-v10"><code id="acctLinkV10">${ec(x.url)}</code><button class="mini sec" type="button" data-act="copy" data-copy="acctLinkV10">Copy link</button></div>
 <div class="acct-copy-v10"><code id="acctCodeV10">${ec(x.token)}</code><button class="mini sec" type="button" data-act="copy" data-copy="acctCodeV10">Copy code</button></div>
 <div class="acct-qr-v11"><canvas id="acctQrV11" aria-label="QR code of the share link"></canvas><div><div class="small">QR code of the share link (contains only the link). An organization can scan it with a phone.</div><button class="mini sec" type="button" data-act="qr-download" id="acctQrDlV11">Download QR image</button></div></div></div></div>`;
}
function acctShareRow(s){
 const a=acct(),st=acctShareStatus(s),ev=a.cache.accessEvents.filter(e=>e.grant_id===s.id),views=ev.filter(e=>e.outcome==='GRANTED'),ref=ev.filter(e=>e.outcome!=='GRANTED');
 const tok=a.shareToken(s.id),n=(s.share_grant_assertions||[]).length;
 const ctx=s.assignment_label?ec(s.assignment_label)+(s.assignment_starts_on||s.assignment_ends_on?` (${s.assignment_starts_on?fd(s.assignment_starts_on):'?'} → ${s.assignment_ends_on?fd(s.assignment_ends_on):'?'})`:''):'No assignment named';
 const cls={ACTIVE:'ACCEPTED',EXPIRED:'PENDING',USED:'PENDING',REVOKED:'REVOKED'}[st];
 return`<div class="acct-item-v10 acct-share-v10" data-share="${s.id}"><div class="acct-item-main-v10"><b>${ec(s.organizations?.name||'Organization')}</b> <span class="small">· ${ctx}</span>
 <div class="small">${n} item${n===1?'':'s'} · ${ec(durationLabel(s.duration))} · ${s.expires_at?(st==='ACTIVE'?'expires ':'ended ')+ec(fmtDT(s.expires_at)):'no end date (until you revoke)'}${s.revoked_at?' · revoked '+ec(fmtDT(s.revoked_at)):''}</div>
 <div class="small">Viewed ${views.length} time${views.length===1?'':'s'}${views[0]?' · last '+ec(fmtDT(views[0].occurred_at)):''}${ref.length?` · ${ref.length} refused attempt${ref.length===1?'':'s'}`:''}${tok&&st==='ACTIVE'?` · <button class="linkbtn-v10" type="button" data-act="show-link" data-id="${s.id}">Show link</button>`:''}</div>
 ${st==='ACTIVE'||st==='EXPIRED'?`<div class="acct-extend-v10 hidden" id="acctExt-${s.id}"><select class="acct-ext-dur-v10">${SHARE_DURATIONS.filter(d=>d.id!=='ONE_TIME').map(d=>`<option value="${d.id}">${ec(d.label)}</option>`).join('')}</select><input type="date" class="acct-ext-date-v10" min="${acctToday()}"><button class="mini pri" type="button" data-act="share-extend-save" data-id="${s.id}">Save</button></div>`:''}</div>
 <div class="acct-item-side-v10"><span class="badge ${cls}">${st}</span>${st==='ACTIVE'||st==='EXPIRED'?`<button class="mini sec" type="button" data-act="share-extend" data-id="${s.id}">Extend</button>`:''}${st!=='REVOKED'?`<button class="mini sec danger-v10" type="button" data-act="share-revoke" data-id="${s.id}">Revoke</button>`:''}</div></div>`;
}
async function acctOpenShareForm(){
 const a=acct(),wrap=$('acctShareWrapV10');if(!wrap)return;
 if(!wrap.classList.contains('hidden')){wrap.classList.add('hidden');return}
 wrap.innerHTML='<div class="small">Loading organizations…</div>';wrap.classList.remove('hidden');
 try{acctOrgList=await a.listOrganizations()}catch(e){acctErr(e);return}
 const creds=a.cache.credentials.filter(c=>!(c.expires_on&&c.expires_on<acctToday())&&!['REVOKED','REJECTED','EXPIRED'].includes(c.status));
 wrap.innerHTML=`<form id="acctShareFormV10" class="acct-form-v10">
 <label>Organization<select id="acctShareOrgV10" required>${acctOptions(acctOrgList.map(o=>[o.id,o.name]),'',acctOrgList.length?'Choose…':'No organizations yet')}</select></label>
 ${acctOrgList.length?'':'<div class="small acct-note-v10">Organizations appear here once they create a Veridun organization account (Organization tab).</div>'}
 <label>Assignment or purpose<input id="acctShareLabelV10" maxlength="200" placeholder="e.g. Travel ICU, 13 weeks"></label>
 <div class="grid2-v83"><label>Assignment start<input type="date" id="acctShareStartV10"></label><label>Assignment end<input type="date" id="acctShareEndV10"></label></div>
 <label>Access length<select id="acctShareDurV10">${SHARE_DURATIONS.map(d=>`<option value="${d.id}"${d.id==='D30'?' selected':''}>${ec(d.label)}</option>`).join('')}</select></label>
 <label id="acctShareBufferRowV11" class="hidden">Extra time after the assignment ends<select id="acctShareBufferV11"><option value="0">None (ends at 11:59 PM on the last day)</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option></select></label>
 <label id="acctShareCustomRowV10" class="hidden">Custom end date<input type="date" id="acctShareCustomV10" min="${acctToday()}"></label>
 <div id="acctShareWarnV11" class="small acct-note-v10" role="status"></div>
 <fieldset class="acct-fieldset-v10"><legend>What they can see</legend>${creds.length?creds.map(c=>{const priv=catalogPrivacy(c.kind)==='PRIVATE';return`<label class="share-option"><span><b>${ec(c.display_name)}</b><span class="small"> · ${priv?'shared as “Requirement satisfied”, details private':'name, issuer, state, expiration'} · status shown live: ${ec(acctCredStatus(c).text.toLowerCase())}</span></span><input type="checkbox" class="acctShareChkV10" value="${c.id}" data-mode="${priv?'REQUIREMENT_SATISFIED':'VERIFIED_CREDENTIAL'}" data-label="${ec(priv?(catalogKind(c.kind)?.short||c.display_name):c.display_name)}"></label>`}).join(''):'<div class="small">Add credentials first.</div>'}</fieldset>
 <div class="small acct-note-v10">Source documents: never shared. Items you haven't had verified show as “Pending verification” to the organization.</div>
 <div class="acct-row-v10"><button class="pri" type="submit">Approve &amp; share</button><button class="sec" type="button" data-act="toggle-share">Cancel</button></div></form>`;
}
/* Access must cover the assignment (PR 11 fix: a "7 Days" share for an
   Oct 14 → Oct 21 assignment ended Oct 15). When an end date is entered, the
   length defaults to "Through Assignment End" (unless the clinician already
   picked one), and any shorter choice gets a warning. */
let acctShareDurTouched=false;
function acctShareCoverageWarn(ev){
 const dur=$('acctShareDurV10');if(!dur)return;const end=$('acctShareEndV10').value,start=$('acctShareStartV10').value;
 if(ev&&ev.target===dur)acctShareDurTouched=true;
 if(end&&!acctShareDurTouched&&dur.value!=='THROUGH_ASSIGNMENT_END'){dur.value='THROUGH_ASSIGNMENT_END'}
 $('acctShareCustomRowV10').classList.toggle('hidden',dur.value!=='CUSTOM_DATE');
 $('acctShareBufferRowV11').classList.toggle('hidden',!(dur.value==='THROUGH_ASSIGNMENT_END'&&end));
 let msg='';try{const buf=+($('acctShareBufferV11').value||0);let d=dur.value,cd=$('acctShareCustomV10').value||null;if(d==='THROUGH_ASSIGNMENT_END'&&end&&buf>0){d='CUSTOM_DATE';cd=isoDay(addDays(new Date(end+'T12:00:00'),buf))}
  const exp=(d==='UNTIL_ASSIGNMENT_START'&&!start)||(d==='THROUGH_ASSIGNMENT_END'&&!end)||(d==='CUSTOM_DATE'&&!cd)?undefined:acctExpiryFor(d,start||null,end||null,cd);
  msg=exp===undefined?'':shareCoverageGap(exp,end,d)||(end&&exp!==null?`Access ends ${fmtDT(exp)}, which covers the assignment (ends ${fd(end)}).`:'')}catch(e){msg=e.message}
 const w=$('acctShareWarnV11');w.textContent=msg;w.classList.toggle('warn-v11',/before the assignment ends/.test(msg));
}
async function acctSubmitShare(){
 const a=acct(),orgId=$('acctShareOrgV10').value,duration=$('acctShareDurV10').value,startsOn=$('acctShareStartV10').value||null,endsOn=$('acctShareEndV10').value||null,customDate=$('acctShareCustomV10').value||null;
 if(startsOn&&endsOn&&endsOn<startsOn)throw new Error('The assignment end date is before the start date.');
 const assertions=[...document.querySelectorAll('.acctShareChkV10:checked')].map(x=>({credentialId:x.value,mode:x.dataset.mode,requirementLabel:x.dataset.label}));
 let dur=duration,cd=customDate;const buf=+($('acctShareBufferV11')?.value||0);
 if(dur==='THROUGH_ASSIGNMENT_END'&&endsOn&&buf>0){dur='CUSTOM_DATE';cd=isoDay(addDays(new Date(endsOn+'T12:00:00'),buf))}
 const expiresAt=acctExpiryFor(dur,startsOn,endsOn,cd);
 const gap=shareCoverageGap(expiresAt,endsOn,dur);
 if(gap&&!confirm(gap+'\n\nShare anyway?'))return;
 const r=await a.createShare({orgId,assertions,duration:dur,customDate:cd,expiresAt,assignmentLabel:$('acctShareLabelV10').value,startsOn,endsOn});
 acctLastCreated={id:r.id,token:r.token,url:acctShareUrl(r.token),orgName:(acctOrgList||[]).find(o=>o.id===orgId)?.name||'the organization'};
}

/* ---------- Organization side ---------- */
function acctRenderOrg(){
 const a=acct(),m=a.cache.memberships,el=$('acctOrgV10');
 if(m.length&&!m.some(x=>x.org_id===acctOrgId))acctOrgId=m[0].org_id;
 const org=m.find(x=>x.org_id===acctOrgId);
 el.innerHTML=`<div class="panel-v81"><div class="ph">Open a shared Passport</div><div class="pb">
 ${m.length?`<form id="acctOpenFormV10" class="acct-signin-v10"><label class="sr-only-v10" for="acctOpenInputV10">Share link or code</label><input id="acctOpenInputV10" placeholder="Paste the share link or code" autocomplete="off"><button class="pri" type="submit">Open</button></form><div class="small">Opens only shares sent to your organization, only while they're active. Every view is logged and visible to the clinician.</div>`:'<div class="small">Create an organization account below to open Passports that clinicians share with you.</div>'}
 <div id="acctOrgResultV10">${acctOrgResult?acctOrgResultHtml(acctOrgResult):''}</div></div></div>
 ${m.length?`<div class="panel-v81"><div class="ph"><span>Shared with ${org?ec(org.organizations?.name||'my organization'):'my organization'}</span>${m.length>1?`<select id="acctOrgPickV10">${acctOptions(m.map(x=>[x.org_id,x.organizations?.name||x.org_id]),acctOrgId)}</select>`:''}</div><div class="pb" id="acctOrgSharesV10">${acctOrgShares?acctOrgSharesHtml(acctOrgShares):'<div class="small">Loading…</div>'}</div></div>`:''}
 <div class="panel-v81"><div class="ph">${m.length?'My organizations':'Create an organization account'}</div><div class="pb">
 ${m.map(x=>`<div class="small">${ec(x.organizations?.name||'')} · your role: ${ec(x.role)}</div>`).join('')}
 <form id="acctOrgCreateFormV10" class="acct-signin-v10"><label class="sr-only-v10" for="acctOrgNameV10">Organization name</label><input id="acctOrgNameV10" maxlength="120" placeholder="Organization name (e.g. a staffing agency or hospital)"><button class="${m.length?'sec':'pri'}" type="submit">Create organization</button></form>
 <div class="small">Staging: anyone signed in can create an organization (up to 3) and becomes its owner. Clinicians can then pick it when sharing. Organizations never see a clinician's documents or full credential records, only the live items a clinician shares.</div></div></div>`;
 if(m.length&&!acctOrgShares)acctLoadOrgShares();
}
async function acctLoadOrgShares(){try{acctOrgShares=await acct().orgShares(acctOrgId);const b=$('acctOrgSharesV10');if(b)b.innerHTML=acctOrgSharesHtml(acctOrgShares)}catch(e){acctErr(e)}}
function acctOrgSharesHtml(list){
 if(!list.length)return'<div class="small">No clinician has shared with this organization yet.</div>';
 return list.map(g=>{const st=acctShareStatus(g),pend=g.requests.find(r=>r.status==='PENDING');const who=g.clinicians?ec(g.clinicians.full_name+(g.clinicians.post_nominals?', '+g.clinicians.post_nominals:'')):'Clinician';
  return`<div class="acct-item-v10"><div class="acct-item-main-v10"><b>${who}</b> <span class="small">· ${ec(g.assignment_label||'No assignment named')}</span><div class="small">${ec(durationLabel(g.duration))} · ${g.expires_at?(st==='ACTIVE'?'expires ':'ended ')+ec(fmtDT(g.expires_at)):'until the clinician revokes'}${g.revoked_at?' · revoked by clinician '+ec(fmtDT(g.revoked_at)):''}${pend?' · extension requested until '+fd(pend.requested_until)+' (waiting for the clinician)':''}</div>
  ${st!=='REVOKED'&&!pend?`<div class="acct-extend-v10 hidden" id="acctReq-${g.id}"><input type="date" class="acct-req-date-v10" min="${acctToday()}"><input class="acct-req-reason-v10" maxlength="300" placeholder="Reason (optional)"><button class="mini pri" type="button" data-act="org-req-send" data-id="${g.id}">Send request</button></div>`:''}</div>
  <div class="acct-item-side-v10"><span class="badge ${{ACTIVE:'ACCEPTED',EXPIRED:'PENDING',USED:'PENDING',REVOKED:'REVOKED'}[st]}">${st}</span>${st==='ACTIVE'?`<button class="mini pri" type="button" data-act="org-view" data-id="${g.id}">View</button>`:''}${st!=='REVOKED'&&!pend?`<button class="mini sec" type="button" data-act="org-req" data-id="${g.id}">Request more time</button>`:''}</div></div>`}).join('');
}
const ACCT_ASSERT_TEXT={VERIFIED:['ACCEPTED','VERIFIED'],REQUIREMENT_SATISFIED:['ACCEPTED','REQUIREMENT SATISFIED'],PENDING_VERIFICATION:['PENDING','PENDING VERIFICATION'],NOT_CURRENT:['REVOKED','NOT CURRENT']};
function acctOrgResultHtml(r){
 if(!r.ok){const t={REVOKED:['Access revoked by the clinician',r.share?.revoked_at?'Revoked '+fmtDT(r.share.revoked_at)+'. Nothing from this Passport is available any more.':''],EXPIRED:['Access expired',(r.share?.expires_at?'Ended '+fmtDT(r.share.expires_at)+'. ':'')+'You can request more time; the clinician decides.'],USED:['One-time share already viewed','Ask the clinician for a new share.'],NOT_FOUND:['Share not found','This link or code is wrong, or it was shared with a different organization.'],INVALID:['That doesn\'t look like a share link or code',''],ERROR:['Could not open this share',r.error||'']}[r.reason]||['Could not open this share',''];
  return`<div class="notice alert-v81 acct-result-v10"><b>${ec(t[0])}</b><div class="small">${ec(t[1])}</div></div>`}
 const s=r.share,who=s.clinicians?s.clinicians.full_name+(s.clinicians.post_nominals?', '+s.clinicians.post_nominals:''):'Clinician';
 return`<div class="acct-result-v10"><div class="notice"><b>${ec(who)}</b> shared with ${ec(s.organizations?.name||'your organization')}${s.assignment_label?' for '+ec(s.assignment_label):''}<div class="small">${ec(durationLabel(s.duration))} · ${s.expires_at?'expires '+ec(fmtDT(s.expires_at)):'until the clinician revokes'} · this view was logged · source documents: not shared</div></div>
 ${r.assertions.length?r.assertions.map(x=>{const[c,t]=ACCT_ASSERT_TEXT[x.status]||['PENDING',x.status];const det=x.mode==='REQUIREMENT_SATISFIED'?'Details private (health / screening / reference record)':[x.issuer,x.jurisdiction_code,x.expires_on?'expires '+fd(x.expires_on):'',(x.kind==='RN_LICENSE'||x.kind==='RN_LICENSE_MULTISTATE')&&x.jurisdiction_code?licenseCoverage(x.kind,x.jurisdiction_code).text+(x.status==='VERIFIED'?'':' (once verified)'):''].filter(Boolean).join(' · ');return`<div class="passrow"><div><b>${ec(x.label||x.requirement_label||'')}</b><div class="small">${ec(det)}${x.status==='PENDING_VERIFICATION'?' · submitted by the clinician, not yet checked with the issuer':''}</div></div><span class="badge ${c}">${ec(t)}</span></div>`}).join(''):'<div class="small">No items in this share.</div>'}
 <div class="small acct-note-v10">Staging: Veridun isn't connected to boards or issuers yet. Only items marked VERIFIED were checked by a Veridun verifier.</div></div>`;
}
async function acctOpenShare(input){acctOrgResult=await acct().openShare(input);acctOrgShares=null}

/* ---------- Activity ---------- */
const ACCT_EVENT_TEXT={PROFILE_CREATED:'Profile created',PROFILE_UPDATED:'Profile updated',CREDENTIAL_ADDED:'Credential added',CREDENTIAL_DELETED:'Credential deleted',SHARE_CREATED:'Share created',SHARE_REVOKED:'Share revoked',SHARE_EXTENDED:'Share extended',SHARE_EXTENSION_DECLINED:'Extension declined',SHARE_VIEWED:'An organization viewed a share',SHARE_ACCESS_REFUSED:'An organization was refused (share not active)',SHARE_EXTENSION_REQUESTED:'An organization asked for more time',ASSIGNMENT_READY:'Ready for an assignment'};
function acctRenderActivity(){
 const a=acct(),ev=a.cache.events,el=$('acctActivityV10');
 el.innerHTML=`<div class="panel-v81"><div class="ph">Activity on my account (${ev.length})</div><div class="pb">${ev.length?ev.map(e=>`<div class="acct-event-v10"><span class="small mono">${ec(fmtDT(e.occurred_at))}</span> <b>${ec(acctEventText(e))}</b></div>`).join(''):'<div class="small">Nothing yet.</div>'}
 <div class="small acct-note-v10">Append-only log stored with your account. Organization views of your shares are recorded by the database, not by the organization's browser.</div></div></div>`;
}
/* Plain words for the activity log: no raw codes like D7 or PENDING_VERIFICATION. */
function acctPlain(v){return plainCode(v)}
function acctEventText(e){const d=e.detail||{},a=acct(),sh=e.grant_id?a.cache.shares.find(s=>s.id===e.grant_id):null,org=sh?.organizations?.name||d.org_name||'an organization';const head=ACCT_EVENT_TEXT[e.event_type]||e.event_type.replace(/_/g,' ').toLowerCase();const parts=[head];if(e.grant_id)parts.push('with '+org);if(d.kind)parts.push(catalogKind(d.kind)?.short||catalogKind(d.kind)?.label||d.kind);if(e.result&&e.result!=='DELETED')parts.push(acctPlain(e.result));if(d.specialty)parts.push(specialtyName(d.specialty));return parts.join(' · ')}

/* ---------- public ?share= links for account shares ---------- */
function acctShareLinkView(token){
 const a=acct();if(!a)return false;
 const box=$('pubOnboard');$('pubRows').innerHTML='';$('pubScore').textContent='—';
 if(!a.signedIn&&a.hasStoredSession()&&!acctShareLinkView.tried){acctShareLinkView.tried=true;$('pubStatus').className='notice';$('pubStatus').innerHTML='<b>Restoring your session…</b>';box.innerHTML='';a.init().then(()=>acctShareLinkView(token)).catch(e=>{acctErr(e);acctShareLinkView(token)});return true}
 if(!a.signedIn){
  a.setPendingShare(token);
  $('pubStatus').className='notice';$('pubStatus').innerHTML='<b>Sign in to view this shared Passport</b><div class="small" style="margin-top:4px">If this share came from a clinician\'s Veridun account, sign in with your organization account. It opens only for the organization it was shared with, and only while it is active.</div>';
  box.innerHTML=`<form id="pubSignInV10" class="acct-signin-v10"><label class="sr-only-v10" for="pubEmailV10">Email address</label><input type="email" id="pubEmailV10" placeholder="you@organization.com" autocomplete="email" required><button class="pri" type="submit">Email me a sign-in link</button></form><div class="small acct-msg-v10" id="pubMsgV10" role="status"></div><div class="small">Demo shares (made in the demo) only open in the browser that created them.</div>`;
  $('pubSignInV10').onsubmit=async e=>{e.preventDefault();try{await a.sendMagicLink($('pubEmailV10').value,acctRedirectUrl());acctMsg('Check your email for the sign-in link. Open it on this device.','ok','pubMsgV10')}catch(err){acctErr(err,'pubMsgV10')}};
  return true;
 }
 const ph=document.querySelector('#public .passhead div');if(ph)ph.textContent='Shared from a clinician\'s Veridun account · staging backend · verification not connected to issuers';
 $('pubStatus').className='notice';$('pubStatus').innerHTML='<b>Opening shared Passport…</b>';
 a.openShare(token).then(r=>{acctOrgResult=r;$('pubStatus').className=r.ok?'notice':'notice alert-v81';$('pubStatus').innerHTML=r.ok?'<b>Shared Passport · from a clinician\'s Veridun account</b>':'<b>Not available</b>';$('pubRows').innerHTML=acctOrgResultHtml(r);$('pubScore').textContent=r.ok?`${r.assertions.filter(x=>x.status==='VERIFIED'||x.status==='REQUIREMENT_SATISFIED').length}/${r.assertions.length} verified`:'—';box.innerHTML='<b>Source documents: NOT SHARED</b><div class="small">Live: reflects the clinician\'s account each time it is opened. Staging backend, verification is not connected to issuers.</div>'}).catch(e=>{$('pubStatus').innerHTML='<b>Could not open this share</b>';acctErr(e)});
 return true;
}

/* ---------- events ---------- */
function acctWire(){
 $('acctSignInFormV10').onsubmit=e=>{e.preventDefault();acctDo(async()=>{await acct().sendMagicLink($('acctEmailV10').value,acctRedirectUrl())},'Check your email for a sign-in link from Supabase, then open it on this device. You can request a link on each device you use.')};
 $('acctOpenV10').onclick=()=>acctShow();
 $('acctSignOutV10').onclick=$('acctWsSignOutV10').onclick=()=>acctDo(async()=>{await acct().signOut();acctOrgList=acctOrgShares=acctOrgResult=acctLastCreated=null;acctLeave()},'Signed out. Your account data was cleared from this device\'s memory.');
 $('acctBackV10').onclick=acctLeave;
 $('acctRefreshV10').onclick=()=>acctDo(async()=>{await acct().hydrate();acctOrgShares=null},'Up to date.');
 document.querySelectorAll('.acctTab').forEach(b=>b.onclick=()=>{acctTab=b.dataset.target;acctMsg('');if(acctTab==='acctOrgV10')acctOrgShares=null;acctRenderAll()});
 const ws=$('accountWorkspace');
 ws.addEventListener('submit',e=>{
  const id=e.target.id;if(!/V10$/.test(id))return;e.preventDefault();
  if(id==='acctProfileFormV10')acctDo(async()=>{const sec=[...document.querySelectorAll('.acctSecSpecV10:checked')].map(x=>x.value);await acct().saveProfile({full_name:$('acctNameV10').value,post_nominals:$('acctPostV10').value,specialty:$('acctSpecV10').value,secondary_specialties:sec,home_jurisdiction:$('acctHomeV10').value});acctEditingProfile=false},'Profile saved to your account.');
  if(id==='acctAddFormV10')acctDo(async()=>{const n=await acctSubmitCredential();return n}).then(n=>{if(n)acctMsg(`${n} saved to your account. Status: Submitted, not verified.`,'ok')});
  if(id==='acctShareFormV10')acctDo(acctSubmitShare,'Share created. Copy the link or code now.');
  if(id==='acctOrgCreateFormV10')acctDo(async()=>{const o=await acct().createOrganization($('acctOrgNameV10').value);acctOrgId=o.id;acctOrgShares=null},'Organization created. You are its owner.');
  if(id==='acctOpenFormV10')acctDo(()=>acctOpenShare($('acctOpenInputV10').value));
 });
 ws.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='acctKindV10'){acctSyncAddForm();acctApplyLicenseDefaults()}
  if(t.id==='acctJurV10'){acctLicTypeTouched=false;acctLicenseNote()}
  if(t.name==='acctLicTypeV10'){acctLicTypeTouched=true;acctLicenseNote()}
  if(t.id==='acctHomeV10')acctHomeStateNote(t.value);
  if(t.id==='acctReadyStateV11'||t.id==='acctReadyWorkV11'){acctReady={state:$('acctReadyStateV11').value,work:$('acctReadyWorkV11').value};acctRenderAll()}
  if(['acctShareDurV10','acctShareStartV10','acctShareEndV10','acctShareCustomV10','acctShareBufferV11'].includes(t.id))acctShareCoverageWarn(e);
  if(t.classList.contains('acctSecSpecV10')&&t.checked){const n=document.querySelectorAll('.acctSecSpecV10:checked').length;if(n>5){t.checked=false;acctMsg('Up to 5 secondary specialties.','err')}}
  if(t.id==='acctOrgPickV10'){acctOrgId=t.value;acctOrgShares=null;acctRenderAll()}
  if(t.classList.contains('acct-doc-input-v10')&&t.files[0])acctDo(()=>acct().uploadDocument(t.dataset.id,t.files[0]),'Document uploaded to your private folder.');
 });
 ws.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act,id=b.dataset.id,a=acct();
  if(act==='edit-profile'){acctEditingProfile=true;acctRenderAll()}
  if(act==='cancel-profile'){acctEditingProfile=false;acctRenderAll()}
  if(act==='toggle-add'){$('acctAddWrapV10').classList.toggle('hidden');acctSyncAddForm();acctApplyLicenseDefaults()}
  if(act==='toggle-share'){acctShareDurTouched=false;acctOpenShareForm()}
  if(act==='qr-download')downloadShareQr($('acctQrV11'),'veridun-share-qr.png');
  if(act==='dismiss-created'){acctLastCreated=null;acctRenderAll()}
  if(act==='copy'){const t=$(b.dataset.copy)?.textContent||'';navigator.clipboard?.writeText(t).then(()=>acctMsg('Copied.','ok'),()=>acctMsg('Select the text and copy it.'))}
  if(act==='show-link'){const tok=a.shareToken(id),s=a.cache.shares.find(x=>x.id===id);if(tok){acctLastCreated={id,token:tok,url:acctShareUrl(tok),orgName:s?.organizations?.name||'the organization'};acctRenderAll()}}
  if(act==='doc-open'){const w=window.open('about:blank','_blank');a.documentUrl(id).then(u=>{if(w)w.location=u;else location.href=u}).catch(err=>{if(w)w.close();acctErr(err)})}
  if(act==='cred-delete'){const c=a.cache.credentials.find(x=>x.id===id);if(c&&confirm(`Delete ${c.display_name} from your account? Its document is deleted too, and any share that included it stops showing it.`))acctDo(()=>a.deleteCredential(id),'Credential deleted.')}
  if(act==='share-revoke'){const s=a.cache.shares.find(x=>x.id===id);if(confirm(`Revoke ${s?.organizations?.name||'this organization'}'s access now?\n\nThis is final: the link stops working on every device immediately and can't be turned back on. To share again later, create a new share.`))acctDo(()=>a.revokeShare(id),'Access revoked. The organization can no longer see this share.')}
  if(act==='share-extend')$('acctExt-'+id)?.classList.toggle('hidden');
  if(act==='share-extend-save'){const row=$('acctExt-'+id),d=row.querySelector('.acct-ext-dur-v10').value,cd=row.querySelector('.acct-ext-date-v10').value,s=a.cache.shares.find(x=>x.id===id);acctDo(async()=>{const exp=acctExpiryFor(d,s.assignment_starts_on,s.assignment_ends_on,cd);await a.extendShare(id,{duration:d,customDate:cd||null,expiresAt:exp})},'Share updated.')}
  if(act==='req-approve'||act==='req-decline')acctDo(()=>a.resolveExtension(id,act==='req-approve'),act==='req-approve'?'Extension approved.':'Extension declined.');
  if(act==='org-view')acctDo(async()=>{acctOrgResult=await a.openShareById(id);acctOrgShares=null});
  if(act==='org-req')$('acctReq-'+id)?.classList.toggle('hidden');
  if(act==='org-req-send'){const row=$('acctReq-'+id);acctDo(async()=>{await a.requestExtension(id,acctOrgId,row.querySelector('.acct-req-date-v10').value,row.querySelector('.acct-req-reason-v10').value);acctOrgShares=null},'Request sent. The clinician decides.')}
 });
}
async function acctBoot(){
 const a=acct();acctRenderCard();if(!a)return;acctWire();
 a.onChange(type=>{if(type==='signedOut'){acctOrgList=acctOrgShares=acctOrgResult=acctLastCreated=null}acctRenderAll();if(type==='signedIn')acctAfterSignIn()});
 const hash=new URLSearchParams(location.hash.slice(1)),cb=SupabaseAdapter.urlHasAuthCallback(location);acctCallbackLanding=cb&&!hash.get('error_description');
 if(hash.get('error_description')){acctMsg('Sign-in link problem: '+hash.get('error_description')+'. Request a new link.','err');history.replaceState(null,'',location.pathname+location.search)}
 if(!a.hasStoredSession()&&!(cb&&!hash.get('error_description')))return;
 acctMsg(cb?'Signing you in…':'Restoring your account…');
 try{await a.init();acctMsg(a.signedIn?'':'You are signed out.');if(cb)history.replaceState(null,'',location.pathname+location.search);acctRenderAll();if(a.signedIn)acctAfterSignIn(cb)}catch(e){acctErr(e)}
}
let acctLanded=false,acctCallbackLanding=false;
function acctAfterSignIn(fromLink){
 const a=acct();acctRenderCard();if(acctLanded)return;acctLanded=true;
 const pending=a.takePendingShare(),params=new URLSearchParams(location.search);
 if(params.get('share'))return;/* the share page is already open and will show the result */
 if(pending){$('landing').classList.add('hidden');$('public').classList.remove('hidden');acctShareLinkView(pending);return}
 if(fromLink||acctCallbackLanding)acctShow(a.cache.profile||!a.cache.memberships.length?'acctPassportV10':'acctOrgV10');
}
document.addEventListener('DOMContentLoaded',()=>{acctBoot()});
