/* Clinician Menu (PR 11). Every row is a real <button> that opens a real
   screen, signed in or not:
     Profile                → account profile editor (signed in) / demo profile + specialty explorer
     Submitted Credentials  → account Passport list (signed in) / demo list with verification history
     Share & Access         → account Shares (signed in) / demo Share & Access
     Verification Settings  → reminder + notification preferences, saved via the store
     Advanced Verification  → Verification Console › Advanced Proofs (optional XRPL; never affects readiness)
     Data storage           → where data lives + sign-in card */
const PREFS_DEFAULT={reminderDays:60,remindExpiry:true,notifyShareViewed:true,notifyExtension:true,notifyMonitoring:true};
const menuSignedIn=()=>!!(store.account&&store.account.signedIn);
function menuBackHtml(){return`<button type="button" class="sec mini menuBackV11" data-view="menuView">‹ Menu</button>`}
function menuGo(key){
 const acc=menuSignedIn();
 if(key==='profile'){if(acc){acctEditingProfile=true;acctShow('acctPassportV10')}else{renderProfileViewV11();showV7View('profileViewV11')}}
 else if(key==='credentials'){if(acc){acctEditingProfile=false;acctShow('acctPassportV10')}else{renderCredentialsViewV11();showV7View('credentialsViewV11')}}
 else if(key==='shares'){if(acc)acctShow('acctSharesV10');else showV7View('shareView')}
 else if(key==='settings'){renderSettingsViewV11();showV7View('settingsViewV11')}
 else if(key==='advanced'){v81ShowRole('verification');v81Tabs('verifyTab','verifyPanel','verifyProofsV81');v81RenderVerifier(v81RoleContext());menuProofsBanner()}
 else if(key==='references')showV7View('referencesView')
 else if(key==='storage'){renderStorageViewV11();showV7View('storageViewV11')}
}
function menuProofsBanner(){
 const body=$('verifyProofsV81');if(!body)return;let b=$('proofsBannerV11');
 if(!b){b=document.createElement('div');b.id='proofsBannerV11';b.className='notice';body.prepend(b)}
 b.innerHTML=`<b>Optional.</b> XRPL Devnet proofs are an extra, tamper-evident receipt of a verification. They never affect readiness: a verified, current credential counts with or without a proof. <button type="button" class="sec mini" id="proofsBackV11">‹ Back to clinician Menu</button>`;
 $('proofsBackV11').onclick=()=>{v81ShowRole('clinician');showV7View('menuView')};
}
/* ---------- Profile (demo) ---------- */
let profPreviewSpec=null;
function renderProfileViewV11(){
 const p=DEMO_PROFILE,sp=profPreviewSpec||p.specialty,a=store.account;
 const req=SPECIALTY_MODULES[sp]||[],pref=specialtyPreferred(sp);
 $('profileViewV11').innerHTML=`<div class="v7-head"><div><h1>Profile</h1><div class="small">Specialty and professional information</div></div>${menuBackHtml()}</div>
 <div class="panel-v81"><div class="ph">${ec(p.name)}, ${ec(p.credentials)} <span class="demo-tag-v81">DEMO PROFILE · READ-ONLY</span></div><div class="pb small">
  Primary specialty: <b>${ec(specialtyName(p.specialty))}</b>${(p.secondarySpecialties||[]).length?` · other specialties: <b>${ec(p.secondarySpecialties.map(specialtyName).join(', '))}</b>`:''}<br>
  Primary state of residence: <b>${ec(jurisdictionName(p.homeState))}</b> (${ec(nlcStatusLabel(p.homeState))})<br>${ec(homeStateCompactText(p.homeState))}</div></div>
 <div class="panel-v81"><div class="ph">Explore specialty requirements</div><div class="pb">
  <label for="profSpecV11">Specialty (${SPECIALTIES.length} RN specialties)</label><select id="profSpecV11">${specialtyOptionsHtml(sp,null)}</select>
  <div class="small" style="margin:8px 0">What the <b>${ec(specialtyName(sp))}</b> module adds on top of the work-type base set (demo template):</div>
  <div class="small"><b>Required</b> (counts toward readiness)</div><ul class="req-list" id="profReqV11">${req.map(k=>`<li>${ec(catalogKind(k)?.label||k)}${catalogKind(k)?.experience?` <span class="small">· default: at least ${catalogKind(k).minMonths} months of work in the last ${catalogKind(k).recencyMonths}; organizations can change it</span>`:''}</li>`).join('')}</ul>
  ${pref.length?`<div class="small"><b>Preferred</b> (shown, never blocks)</div><ul class="req-list">${pref.map(k=>`<li>${ec(catalogKind(k)?.label||k)}</li>`).join('')}</ul>`:''}
 </div></div>
 <div class="panel-v81"><div class="ph">Your own profile</div><div class="pb small">${a?(a.signedIn?`You're signed in. <button type="button" class="pri mini" id="profOpenAcctV11">Edit my account profile</button>`:`Sign in to set your own name, specialty and primary state of residence. Your account is separate from this demo. <button type="button" class="pri mini" id="profSignInV11">Sign in</button>`):'Accounts are not configured on this site.'}</div></div>`;
 $('profSpecV11').onchange=e=>{profPreviewSpec=e.target.value;renderProfileViewV11()};
 if($('profOpenAcctV11'))$('profOpenAcctV11').onclick=()=>menuGo('profile');
 if($('profSignInV11'))$('profSignInV11').onclick=menuShowSignIn;
}
function menuShowSignIn(){v81RolePicker();const c=$('acctCardV10');if(c){c.scrollIntoView({block:'center'});setTimeout(()=>$('acctEmailV10')?.focus(),50)}}
/* ---------- Submitted credentials (demo) ---------- */
const MENU_STATUS={VERIFIED:'VERIFIED · DEMO',VERIFYING:'PENDING VERIFICATION',UNVERIFIED:'SUBMITTED, NOT VERIFIED',REJECTED:'REJECTED',FAILED:'FAILED',REVOKED:'REVOKED',EXPIRED:'EXPIRED'};
function renderCredentialsViewV11(){
 const ev=store.events.list();
 const rows=creds.slice().sort((x,y)=>(y.id||0)-(x.id||0)).map(c=>{
  const h=ev.filter(e=>e.credential_id===c.id).map(e=>`${fmtDT(e.timestamp)} — ${activityText(e)}`);
  const cls=c.primary==='VERIFIED'?'VERIFIED':['VERIFYING','UNVERIFIED'].includes(c.primary)?'PENDING':'REVOKED';
  return`<details class="row-v81 cred-hist-v11" style="display:block"><summary><b>${ec(c.name)}</b> <span class="badge ${cls}">${ec(MENU_STATUS[c.primary]||c.primary)}</span><div class="small">${ec(catalogKind(c.kind)?.short||c.kind)}${c.jurisdiction?' · '+ec(c.jurisdiction):''}${credExpiry(c)?' · expires '+fd(credExpiry(c)):''} · document: ${c.file?'private file':'none'}</div></summary>
  <div class="small" style="margin-top:6px"><b>Provenance:</b> ${ec(c.prov?.source||'not verified yet')}${c.prov?.verifier?' · '+ec(c.prov.verifier):''}${c.prov?.verifiedAt?' · '+ec(fmtDT(c.prov.verifiedAt)):''}</div>
  <div class="small"><b>History:</b> ${h.length?h.map(ec).join('<br>'):'Loaded with the demo seed (simulated verification, not a real check).'}</div></details>`}).join('');
 $('credentialsViewV11').innerHTML=`<div class="v7-head"><div><h1>Submitted Credentials</h1><div class="small">Every item on the demo Passport, its verification status and history. Demo verification is simulated.</div></div>${menuBackHtml()}</div>
 <div class="panel-v81"><div class="ph">${creds.length} credentials <span class="demo-tag-v81">DEMO DATA</span> <button type="button" class="pri mini" id="credAddV11">+ Add credential</button></div><div class="pb">${rows||'<div class="small">No credentials yet.</div>'}</div></div>`;
 $('credAddV11').onclick=()=>openAddForm();
}
/* ---------- Verification settings ---------- */
function menuPrefs(){const acc=menuSignedIn()&&store.account.cache.profile;return{...PREFS_DEFAULT,...((acc?store.account.cache.profile.preferences:store.prefs.load())||{})}}
function renderSettingsViewV11(){
 const p=menuPrefs(),acc=menuSignedIn(),hasProfile=acc&&!!store.account.cache.profile;
 const chk=(id,label,on)=>`<label class="pref-row-v11"><input type="checkbox" id="${id}"${on?' checked':''}> ${ec(label)}</label>`;
 $('settingsViewV11').innerHTML=`<div class="v7-head"><div><h1>Verification Settings</h1><div class="small">Reminders and notification preferences</div></div>${menuBackHtml()}</div>
 <div class="notice"><b>Notifications aren't sent yet.</b> Veridun doesn't send email, text or push notifications in this ${acc?'staging':'demo'} build. Your choices are saved now and will be used once notifications are turned on. In the app, Tasks and Needs Attention already flag credentials expiring within 90 days.</div>
 <form id="prefsFormV11" class="panel-v81"><div class="ph">Preferences <span class="small">· saved ${hasProfile?'to your account':acc?'in this browser (set up your account profile to save them to your account)':'in this browser (demo)'}</span></div><div class="pb">
  <label for="prefLeadV11">Remind me before a credential expires</label><select id="prefLeadV11">${[30,60,90,120].map(d=>`<option value="${d}"${+p.reminderDays===d?' selected':''}>${d} days before</option>`).join('')}</select>
  ${chk('prefExpV11','Expiry reminders',p.remindExpiry)}
  ${chk('prefViewV11','When an organization views a share',p.notifyShareViewed)}
  ${chk('prefExtV11','When an organization asks for more time',p.notifyExtension)}
  ${chk('prefMonV11','When monitoring finds a status change (revoked, expired)',p.notifyMonitoring)}
  <button type="submit" class="pri" style="margin-top:10px">Save preferences</button> <span id="prefMsgV11" class="small" role="status"></span></div></form>`;
 $('prefsFormV11').onsubmit=async e=>{e.preventDefault();const v={reminderDays:+$('prefLeadV11').value,remindExpiry:$('prefExpV11').checked,notifyShareViewed:$('prefViewV11').checked,notifyExtension:$('prefExtV11').checked,notifyMonitoring:$('prefMonV11').checked};
  try{if(hasProfile)await store.account.savePreferences(v);else store.prefs.save(v);$('prefMsgV11').textContent='Saved. (Notifications are not sent yet.)'}catch(err){$('prefMsgV11').textContent='Could not save: '+err.message}};
}
/* ---------- Data storage ---------- */
function renderStorageViewV11(){
 const a=store.account,keys=Object.values(STORE_KEYS).filter(k=>store.adapter.readText(k)!=null);
 const bytes=keys.reduce((n,k)=>n+(store.adapter.readText(k)||'').length,0);
 $('storageViewV11').innerHTML=`<div class="v7-head"><div><h1>Data storage</h1><div class="small">Where your data lives</div></div>${menuBackHtml()}</div>
 <div class="panel-v81"><div class="ph">Demo (Alex Morgan) <span class="demo-tag-v81">THIS BROWSER ONLY</span></div><div class="pb small">The demo is stored in this browser's localStorage (${keys.length} keys, about ${Math.max(1,Math.round(bytes/1024))} KB). Nothing from the demo is sent to a server. Verification is simulated.<div style="margin-top:8px"><button type="button" class="sec mini" id="storageResetV11">Reset demo data</button></div></div></div>
 <div class="panel-v81"><div class="ph">Your account <span class="acct-tag-v10">${a?(a.signedIn?'SIGNED IN':'SIGNED OUT'):'NOT CONFIGURED'}</span></div><div class="pb small">${a?(a.signedIn?`Signed in as <b>${ec(a.email)}</b>. Your profile, credentials and shares are in the Supabase staging database (row-level security), kept in memory on this device, never in localStorage. Documents go to a private bucket. <div style="margin-top:8px"><button type="button" class="pri mini" id="storageAcctV11">Open my account</button></div>`:`Accounts use a Supabase staging database (pre-compliance — no real PHI). Sign in with an email link to keep your own Passport on every device. <div style="margin-top:8px"><button type="button" class="pri mini" id="storageSignInV11">Go to sign-in</button></div>`):'Accounts are not configured on this site.'}</div></div>
 <div class="small">${ec(store.backend.description)}</div>`;
 $('storageResetV11').onclick=()=>$('resetDemo').click();
 if($('storageAcctV11'))$('storageAcctV11').onclick=()=>acctShow('acctPassportV10');
 if($('storageSignInV11'))$('storageSignInV11').onclick=menuShowSignIn;
}
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('.menuLinkV11').forEach(b=>b.addEventListener('click',()=>menuGo(b.dataset.menu)));
 document.addEventListener('click',e=>{const b=e.target.closest('.menuBackV11');if(b)showV7View('menuView')});
});
