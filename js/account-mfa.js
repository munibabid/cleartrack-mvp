/* PR 12 account UI: authenticator 2FA, verifier issuer checks, XRPL anchors.
   The scan of a card is not part of this. A code from an authenticator app
   proves the person has their phone. The issuer lookup is what makes a
   credential verified. XRPL only shows the recorded check was not edited. */
function acctMfaNudge(){
 const a=acct();if(!a||a.hasVerifiedFactor())return'';
 const admin=a.cache.accountRole==='verifier'||a.cache.accountRole==='admin'||(a.cache.memberships||[]).some(m=>m.role==='owner'||m.role==='admin');
 return`<div class="notice${admin?' alert-v81':''}" id="acctMfaNudgeV12"><b>${admin?'Two-factor is required for your role.':'Set up two-factor sign-in.'}</b><div class="small" style="margin-top:4px">${admin?'Verifiers need an authenticator app before they can record an issuer check. Organization owners and admins need one before they add or remove members.':''} Open Security. Use Google Authenticator, Authy, or 1Password. If you have not enrolled yet, your Passport still works.</div></div>`;
}
function acctRenderMfaGate(){
 const el=$('acctMfaGateV12');if(!el)return;
 el.innerHTML=`<div class="panel-v81" id="acctMfaPromptV12"><div class="ph">Enter your authenticator code</div><div class="pb"><p class="small">This account has two-factor sign-in. Enter the 6-digit code from your authenticator app before any credentials, shares, or documents are loaded.</p>
 <form id="acctMfaGateFormV12" class="acct-form-v10"><label>6-digit code<input id="acctMfaCodeV12" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" maxlength="8" required placeholder="123 456"></label>
 <button class="pri" type="submit">Continue</button></form>
 <p class="small">Lost the phone with the app? Veridun cannot read or reset the code from here. An admin has to remove the factor (see the recovery steps in the backend notes). There are no backup codes in this version.</p></div></div>`;
}
function acctRenderSecurity(){
 const a=acct(),el=$('acctSecurityV12');if(!el)return;
 const verified=(a.mfa?.totp||[]).filter(f=>f.status==='verified');
 const pend=a.pendingFactor;
 const qr=pend?.totp?.qr_code||'';
 const secret=pend?.totp?.secret||'';
 el.innerHTML=`<div class="panel-v81"><div class="ph">Two-factor sign-in</div><div class="pb">
 <p class="small">After the email link, an authenticator app (Google Authenticator, Authy, or 1Password) asks for a 6-digit code. Veridun never sees the secret inside the app. The code proves this is your phone. It does not verify a credential.</p>
 ${verified.length?`<div class="small"><b>On:</b> ${verified.map(f=>ec(f.friendly_name||'Authenticator app')).join(', ')}</div><button class="sec" type="button" data-act="mfa-remove" data-id="${verified[0].id}" id="acctMfaRemoveV12">Remove authenticator</button><p class="small">Removing it asks for a current code first (you are already signed in with one). If you lose the phone before you can do that, an admin removes the factor. You will be signed out of other devices the next time they refresh.</p>`
 :pend?`<div id="acctMfaEnrollV12"><p class="small"><b>1.</b> Scan this QR code with the app, or type the secret.</p>
 <img id="acctMfaQrV12" alt="Authenticator QR code" width="220" height="220">
 <div class="acct-copy-v10"><code id="acctMfaSecretV12">${ec(secret)}</code></div>
 <form id="acctMfaConfirmV12" class="acct-form-v10"><label>2. Enter the first 6-digit code<input id="acctMfaFirstV12" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required></label><button class="pri" type="submit">Confirm and turn on</button></form></div>`
 :`<button class="pri" type="button" data-act="mfa-enroll" id="acctMfaEnrollBtnV12">Set up two-factor</button>`}
 <p class="small"><b>Recovery:</b> if the phone is lost, you cannot finish sign-in until an admin deletes the factor in the Supabase dashboard (Authentication → Users → the user → remove factors) or with the SQL in docs/BACKEND.md. Do this only after you know it is the account owner asking. This project has no backup codes and no SMS fallback.</p>
 ${(a.cache.memberships||[]).some(m=>m.role==='owner'||m.role==='admin')?'<p class="small"><b>Organization owners and admins:</b> adding or removing members is blocked until two-factor is on and you have entered a code this session.</p>':''}
 ${a.cache.accountRole==='verifier'?'<p class="small"><b>Verifiers:</b> recording an issuer check is blocked until two-factor is on.</p>':''}
 </div></div>`;
 const img=$('acctMfaQrV12');if(img&&qr)img.src=qr;
}
let acctVerifyRows=null,acctVerifyId='',acctLastRecord=null;
var acctLogNoteV12='';
async function acctLoadVerifyQueue(){
 acctVerifyRows=await acct().verifierQueue();
 const el=$('acctVerifyListV12');if(el)el.innerHTML=acctVerifyListHtml();
}
function acctVerifyListHtml(){
 const flag=c=>c.metadata?.doc?.mismatch?0:c.metadata?.doc?.confirmed?1:2;
 const rows=(acctVerifyRows||[]).slice().sort((a,b)=>(a.status==='VERIFYING'?0:1)-(b.status==='VERIFYING'?0:1)||flag(a)-flag(b));
 if(!rows.length)return'<div class="small">No credentials to review.</div>';
 return rows.map(c=>`<button type="button" class="acct-item-v10 acct-verify-pick-v12" data-act="verify-pick" data-id="${c.id}"><div class="acct-item-main-v10"><b>${ec(c.display_name)}</b><div class="small">${ec(c.clinicians?.full_name||'Clinician')} · ${ec(c.kind)}${c.jurisdiction_code?' · '+ec(c.jurisdiction_code):''} · ${ec(c.status)}${c.verification_level?' · '+ec(levelLabel(c.verification_level)):''}</div>${c.metadata?.doc?.mismatch?`<div class="small"><span class="badge REVOKED">CREDENTIAL MISMATCH DETECTED</span> ${ec((c.metadata.doc.mismatch_fields||[]).map(f=>f.replace(/_/g,' ')).join(', '))}</div>`:c.metadata?.doc?.confirmed?'<div class="small"><span class="badge PENDING">DETAILS CAPTURED · AWAITING VERIFICATION</span></div>':''}</div></button>`).join('');
}
function acctRenderVerify(){
 const el=$('acctVerifyV12');if(!el)return;
 const a=acct();
 if(!a.hasVerifiedFactor()||a.needsMfaChallenge()){el.innerHTML='<div class="notice alert-v81"><b>Set up two-factor first.</b><div class="small">Open Security, add an authenticator app, and enter a code. Recording an issuer check stays off until then.</div></div>';return}
 const c=(acctVerifyRows||[]).find(x=>x.id===acctVerifyId);
 const srcs=c?sourcesForCredential(c.kind,c.jurisdiction_code):[];
 const route=c?primaryRouteFor(c.kind,c.jurisdiction_code):null;
 const look=c?lookupForKind(c.kind):null,lic=c&&RN_LICENSE_KINDS.includes(c.kind);
 const floor=c?kindFloor(c.kind):null;
 const doc=c?.metadata?.doc||null,sug=doc?.source_suggested&&srcs.find(x=>x.id===doc.source_suggested);
 const vs=acctVScan&&acctVScan.id===c?.id&&acctVScan.res?acctVScan.res:null,vexp=vs&&DocExtract.documentExpiry(vs.fields,vs.issuer);
 const nihss=c?.kind==='CERT_NIHSS',vsSrc=vs?.source?.id&&srcs.find(x=>x.id===vs.source.id);
 /* v14.4: an NIHSS verifier comes from the issuer printed on the certificate, never a default */
 const pick=vsSrc||sug||(nihss?null:route),docExp=vexp?.value||'',docRef=vs?.fields?.credential_id?.value||'';
 el.innerHTML=`<div class="panel-v81"><div class="ph">Record a source check</div><div class="pb">
 <p class="small">Open the official lookup, check the credential there, then record exactly what the source said. That record is the source of truth. The level comes from the <b>Verification Source Registry</b>, not from you: for licenses a state board or Nursys gives <b>Primary Source Verified</b>; for certifications the issuing body (for BLS, ACLS and PALS: AHA eCards, or the Red Cross for Red Cross certificates) gives <b>Issuer Verified</b>. Anchoring on XRPL Testnet afterwards only shows the record was not changed later.</p>
 <div id="acctVerifyListV12">${acctVerifyRows?acctVerifyListHtml():'<div class="small">Loading…</div>'}</div>
 ${c&&srcs.length&&acct().serverV13!==false?`<form id="acctVerifyFormV12" class="acct-form-v10 psv-form-v13" style="margin-top:12px" data-mode="registry">
 <div class="small"><b>${ec(c.display_name)}</b> · ${ec(c.clinicians?.full_name||'')}${c.jurisdiction_code?' · '+ec(jurisdictionName(c.jurisdiction_code)):''} · needs at least ${ec(levelLabel(floor.level))}${floor.locked?' (locked floor)':''}</div>
 <div class="small notice" id="acctVerifyAppliesV14">${ec(acctSourceAppliesText(c,nihss?pick:route))}</div>
${acctDocBoxHtml(c)}
<label>Source (Verification Source Registry)<select id="acctVerifySourceIdV13" required>${nihss&&!pick?'<option value="" selected disabled>Verifier undetermined: choose the issuer printed on the certificate</option>':''}${srcs.map(s=>`<option value="${ec(s.id)}"${pick&&pick.id===s.id?' selected':''}>${ec(s.name)} — ${ec(VERIFICATION_METHODS[s.method].label)} → ${ec(levelLabel(sourceLevel(s)))}</option>`).join('')}</select></label>
 <div class="small" id="acctVerifySourceInfoV13"></div>
 <div class="grid2-v83"><label>Result<select id="acctVerifyResultV12" required><option value="VERIFIED">Verified — the source confirmed it</option><option value="FAILED">Failed — the source did not confirm it</option></select></label>
 <label>Status shown by the source<select id="acctVerifyStatusV13" required>${[['ACTIVE','Active'],['INACTIVE','Inactive / lapsed'],['EXPIRED','Expired'],['PROBATION','On probation'],['SUSPENDED','Suspended'],['REVOKED','Revoked'],['NOT_FOUND','Not found']].map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label></div>
 <div class="grid2-v83"><label>Expiration shown by the source${lic?'':' (if any)'}<input type="date" id="acctVerifyExpV13" value="${ec(docExp||c.expires_on||'')}"${lic?' required':''}><span class="small" id="acctVerifyExpNoteV14">${acctExpNoteHtml(c,docExp,vexp)}</span></label>
 <label>Date you checked<input type="date" id="acctVerifyDateV12" required value="${acctToday()}" max="${acctToday()}"></label></div>
 <label>Reference or confirmation number<input id="acctVerifyRefV12" required maxlength="120" value="${ec(docRef)}" placeholder="${lic?'License number / Nursys report or board confirmation':'Card / certificate ID shown by the source'}. Stored off-chain only." autocomplete="off"></label>
${acctDoubleCheckHtml(c)}
 <label>Monitoring after this check<select id="acctVerifyMonV13"><option value="MANUAL_RECHECK">Re-check by hand before each submission</option><option value="NOT_ENROLLED">Not monitored</option>${lic?'<option value="ENROLLED" disabled>Enrolled in Nursys e-Notify (not connected yet)</option>':''}</select></label>
 <button class="pri" type="submit" id="acctVerifySaveV12">Record source check</button>
 <p class="small" id="acctVerifyFootV14">${lic?'Continuous monitoring needs Nursys e-Notify, which needs an institution account and NCSBN API credentials Veridun does not have yet.':`${ec(catalogKind(c.kind)?.short||'This credential')} is not a license, so Nursys does not apply. Re-check it with ${ec((nihss?pick:route)?.name||(nihss?'the issuer printed on the certificate':'the issuer'))} before each submission.`} Nothing here is fetched automatically, and no result is ever filled in for you.</p></form>`
 :c?`<form id="acctVerifyFormV12" class="acct-form-v10" style="margin-top:12px" data-mode="legacy">
 <div class="small"><b>${ec(c.display_name)}</b> · ${ec(c.clinicians?.full_name||'')}</div>
 <p class="small">${acct().serverV13===false?'The database has not been upgraded to the PR 13 Verification Source Registry yet, so this check is recorded the PR 12 way.':'No approved source in the Verification Source Registry covers this credential yet.'} You can still record what you checked, but it counts only as <b>Document Reviewed</b>, which is below the ${ec(levelLabel(floor.level))} this credential needs for readiness.</p>
 ${look?`<p class="small">Official lookup: <a id="acctLookupLinkV12" href="${ec(look.url)}" target="_blank" rel="noopener">${ec(look.name)}</a></p>`:''}
 <label>Result<select id="acctVerifyResultV12" required><option value="VERIFIED">Verified — the issuer confirmed it</option><option value="FAILED">Failed — the issuer did not confirm it</option></select></label>
 <label>Verification source<input id="acctVerifySourceV12" required maxlength="200" value="${ec(look?.name||'')}"></label>
 <label>Date you checked<input type="date" id="acctVerifyDateV12" required value="${acctToday()}" max="${acctToday()}"></label>
 <label>Reference or confirmation number<input id="acctVerifyRefV12" required maxlength="120" placeholder="From the issuer page. Stored off-chain only." autocomplete="off"></label>
 <button class="pri" type="submit" id="acctVerifySaveV12">Record check</button></form>`:''}
 ${acctLastRecord?`<div class="notice" id="acctVerifyDoneV12"><b>Recorded as ${ec(acctLastRecord.result)}${acctLastRecord.level?' · '+ec(levelLabel(acctLastRecord.level)):''}.</b>${acctLastRecord.source_name?`<div class="small" id="acctVerifyProvV13">${ec(levelLabel(acctLastRecord.level).toUpperCase()||acctLastRecord.result)} · Source: ${ec(acctLastRecord.source_name)} · Checked: ${ec(acctLastRecord.checked_on)}${acctLastRecord.status_at_source?' · Status: '+ec(acctLastRecord.status_at_source):''}${acctLastRecord.expires_on?' · Expires: '+ec(acctLastRecord.expires_on):''}</div>`:''}<div class="small">Commitment ${ec(acctLastRecord.commitment.slice(0,16))}… is ready to anchor. Nothing personal is written on the ledger: only this fingerprint.</div>
 <button class="pri" type="button" data-act="anchor-now" id="acctAnchorNowV12">Anchor on XRPL Testnet</button></div>`:''}
 </div></div>${typeof acctAccuracyPanelHtml==='function'?acctAccuracyPanelHtml():''}`;
 acctSyncSourceInfo();
 const sel=$('acctVerifySourceIdV13');if(sel)sel.onchange=acctSyncSourceInfo;
 const res=$('acctVerifyResultV12'),st=$('acctVerifyStatusV13');if(res&&st){res.onchange=()=>{if(res.value==='VERIFIED')st.value='ACTIVE';else if(st.value==='ACTIVE')st.value='INACTIVE'};st.onchange=()=>{res.value=st.value==='ACTIVE'?'VERIFIED':'FAILED'}}
 if(!acctVerifyRows)acctLoadVerifyQueue().catch(acctErr);
}
function acctSyncSourceInfo(){
 const sel=$('acctVerifySourceIdV13'),box=$('acctVerifySourceInfoV13');if(!sel||!box)return;
 const s=verificationSource(sel.value);if(!s){box.innerHTML='';return}
 const nq=verificationSource('nursys-quickconfirm');
 box.innerHTML=`${s.lookupUrl?`Official lookup: <a id="acctLookupLinkV12" href="${ec(s.lookupUrl)}" target="_blank" rel="noopener">${ec(s.name)}</a>`:`No confirmed lookup page for ${ec(s.name)}.${s.nursys?` Use <a id="acctLookupLinkV12" href="${ec(nq.lookupUrl)}" target="_blank" rel="noopener">Nursys QuickConfirm</a> (this board sends its data there), or request a written verification.`:' Request a written verification from the source.'}`}<br>${ec(SOURCE_TYPES[s.type])} · ${ec(VERIFICATION_METHODS[s.method].label)} → <b>${ec(levelLabel(sourceLevel(s)))}</b>. ${ec(s.notes||'')}`;
}
async function acctSubmitVerification(){
 const reference=$('acctVerifyRefV12').value.trim(),form=$('acctVerifyFormV12');
 let rec;const cred=(acctVerifyRows||[]).find(x=>x.id===acctVerifyId);
 if(form?.dataset.mode==='registry')rec=await acct().recordSourceCheck({credentialId:acctVerifyId,sourceId:$('acctVerifySourceIdV13').value,result:$('acctVerifyResultV12').value,statusAtSource:$('acctVerifyStatusV13').value,sourceExpiresOn:$('acctVerifyExpV13').value||null,reference,checkedOn:$('acctVerifyDateV12').value,monitoring:$('acctVerifyMonV13').value}).catch(e=>{if(/source/i.test(e.message)&&/(not found|unknown|approved|exist)/i.test(e.message))throw new Error(`${verificationSource($('acctVerifySourceIdV13').value)?.name||'This source'} is not in the live Verification Source Registry yet (database migration 9 pending). Pick another listed source, or record it as Document review for now.`);throw e});
 else rec=await acct().recordVerification({credentialId:acctVerifyId,result:$('acctVerifyResultV12').value,sourceName:$('acctVerifySourceV12').value.trim(),reference,checkedOn:$('acctVerifyDateV12').value});
 try{await acctLogVerifierCheck(cred)}catch(e){console.warn('[Veridun] verifier check log skipped',e)}
 acctLastRecord=rec;acctVerifyRows=null;
}
async function acctAnchorLast(){
 if(!acctLastRecord)throw new Error('Record a check first.');
 const tx=await submitAnchor(acctLastRecord.commitment,acctLastRecord.memo_type||XRPL_ANCHOR.memoVerification,acctLastRecord.network);
 const saved=await acct().attachAnchor({verificationId:acctLastRecord.verification_id,txHash:tx.txHash,ledger:tx.ledger,address:tx.address,network:tx.network});
 acctLastRecord={...acctLastRecord,...saved,anchored:true,explorer:anchorExplorerUrl(tx.network,tx.txHash)};
 return tx;
}
async function acctPaintXrpl(grantId,box){
 const rows=await acct().shareAnchors(grantId);
 if(!box)return rows;
 if(!rows?.length){box.innerHTML='<b>No XRPL anchor on this share yet.</b> <span class="small">A verifier has to record the issuer check and anchor it. Until then there is nothing to compare.</span>';return rows}
 const bits=[];
 for(const row of rows){
  const r=await checkAnchorOnLedger(row);
  const cls=r.match?'good-v81':'alert-v81';
  bits.push(`<div class="${cls}" data-xrpl="${r.match?'match':'mismatch'}"><b>${r.match?'Matches ledger':'Mismatch / altered'}</b><div class="small">${ec(r.label||'')} · ${ec(r.reason)}${r.address?' · anchored by '+ec(r.address):''}${row.tx_hash?' · '+ec(row.tx_hash.slice(0,10))+'…':''}</div><div class="small">This shows the stored check has not changed since it was anchored, and which testnet account anchored it. It does not prove the credential is real. Readiness uses the verification status, not XRPL.</div></div>`);
 }
 box.innerHTML=bits.join('');
 return rows;
}
document.addEventListener('DOMContentLoaded',()=>{
 const ws=$('accountWorkspace');if(!ws)return;
 ws.addEventListener('submit',e=>{
  const id=e.target.id;
  if(id==='acctMfaGateFormV12'){e.preventDefault();acctDo(async()=>{const f=(acct().mfa?.totp||[]).find(x=>x.status==='verified');if(!f)throw new Error('No authenticator is enrolled.');await acct().verifyTotp(f.id,$('acctMfaCodeV12').value);acctLanded=false},'Code accepted.');}
  if(id==='acctMfaConfirmV12'){e.preventDefault();acctDo(async()=>{await acct().verifyTotp(acct().pendingFactor?.id,$('acctMfaFirstV12').value)},'Two-factor sign-in is on. Next time, the email link will ask for a code before opening your account.');}
  if(id==='acctVerifyFormV12'){e.preventDefault();acctDo(acctSubmitVerification,'Source check recorded. Anchor it if you want a tamper-evident fingerprint.');}
 });
 document.body.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;
  if(act==='mfa-enroll')acctDo(async()=>{await acct().enrollTotp();acctTab='acctSecurityV12'},'Scan the QR code, then enter the first code.');
  if(act==='mfa-remove'){if(confirm('Remove this authenticator? The next sign-in will only use the email link, until you add an app again.'))acctDo(()=>acct().unenrollTotp(b.dataset.id),'Authenticator removed.');}
  if(act==='verify-pick'){acctVerifyId=b.dataset.id;acctLastRecord=null;acctRenderVerify()}
  if(act==='verify-read-doc'){const c=(acctVerifyRows||[]).find(x=>x.id===acctVerifyId);if(c)acctVerifierRead(c)}
  if(act==='anchor-now')acctDo(async()=>{const tx=await acctAnchorLast();acctMsg('Anchored on '+tx.network.replace('XRPL_','XRPL ')+'.','ok')});
  if(act==='xrpl-check')acctDo(async()=>{const box=$('acctXrplResultV12')||b.parentElement.insertAdjacentElement('afterend',Object.assign(document.createElement('div'),{id:'acctXrplResultV12',className:'small'}));await acctPaintXrpl(b.dataset.id,box)});
  if(act==='log-anchor')acctDo(async()=>{const prep=await acct().prepareActivityAnchor();const tx=await submitAnchor(prep.commitment,XRPL_ANCHOR.memoActivity);await acct().attachActivityAnchor({anchorId:prep.anchor_id,txHash:tx.txHash,ledger:tx.ledger,address:tx.address,network:tx.network});acctActivityAnchorId=prep.anchor_id;const box=$('acctLogResultV12');acctLogNoteV12='Activity log anchored on '+tx.network+' · '+tx.txHash.slice(0,10)+'… Newer events are not part of this fingerprint.';if(box)box.textContent=acctLogNoteV12});
  if(act==='log-check')acctDo(async()=>{
   let id=acctActivityAnchorId;
   if(!id){const rows=await acct().need().from('audit_anchors').select('id').order('created_at',{ascending:false}).limit(1);id=rows.data?.[0]?.id}
   if(!id)throw new Error('Anchor the log first.');
   const r=await acct().checkActivityAnchor(id);
   let ledger='';
   if(r.tx_hash){const tx=await checkMemoOnLedger({tx_hash:r.tx_hash,network:r.network,memo_type:r.memo_type,commitment:r.commitment}, r.commitment);ledger=tx.match?' Ledger memo matches.':' Ledger memo does not match.';}
   const box=$('acctLogResultV12');const text=(r.match?'Log integrity: matches the anchored fingerprint.':'Log integrity: mismatch / altered.')+(r.newer_events?` ${r.newer_events} newer event(s) are not in this anchor.`:'' )+ledger;
   acctLogNoteV12=text;if(box)box.textContent=text;
  });
 });
});
let acctActivityAnchorId=null;

/* ---------- PR 14: kind-aware source text, captured details, double-check ---------- */
function acctSourceAppliesText(c,route){
 const k=catalogKind(c.kind),lic=RN_LICENSE_KINDS.includes(c.kind),short=k?.short||k?.label||c.kind;
 if(c.kind==='CERT_NIHSS')return route?`NIHSS: check it with ${route.name}, the issuer printed on the certificate. Nursys does not apply.`:'NIHSS certificates come from different issuers (AHA/ASA, Apex Innovations, NIH Stroke Scale International). The verifier is undetermined: read the issuer printed on the certificate (not just the logo) and choose it below. Nursys does not apply.';
 if(lic)return`${short} is a license: check it with the ${c.jurisdiction_code?jurisdictionName(c.jurisdiction_code)+' ':''}board of nursing or Nursys QuickConfirm.`;
 if(['CERT_BLS','CERT_ACLS','CERT_PALS'].includes(c.kind))return`${short} is a resuscitation card, not a license: check it with AHA eCards (12-digit code), AHA RQI (codes with letters), or the American Red Cross for Red Cross certificates. Nursys does not apply.`;
 const priv=k?.privacy==='PRIVATE';
 return`${short}: check it with ${route?.name||'the issuer'}${route?.type==='CERTIFYING_BODY'?' (the issuing body)':''}.${priv?' This is a private record: organizations only ever see “requirement satisfied”.':''} Nursys does not apply.`;
}
/* The verifier reads the document on THIS device (signed link → pdf.js /
   OCR here). Extracted values are never stored on the server; only the
   nurse's confirmation flags are. */
/* Expiration note: once the document has been read, its date wins and both dates are shown. */
function acctExpNoteHtml(c,docExp,vexp){
 const typed=c?.expires_on||'',flagged=(c?.metadata?.doc?.mismatch_fields||[]).includes('expires_on');
 if(docExp){
  const both=`<span class="expboth-v14"><span>Document: <b id="acctExpDocV14">${ec(fd(docExp))}</b>${vexp?.basis==='renew_by'||/end of/.test(vexp?.text||'')?' (month/year card: end of that month)':''}</span><span>Nurse typed: <b id="acctExpTypedV14">${typed?ec(fd(typed)):'nothing'}</b></span></span>`;
  return docExp!==typed?`<span class="badge REVOKED">DATES DIFFER</span> Prefilled with the document date. ${both} Change it to what the source shows.`:`Prefilled from the document; it matches what the nurse typed. ${both}`;
 }
 if(c?.source_document_path)return`Prefilled with what the nurse typed (${typed?ec(fd(typed)):'nothing'}); not compared with the document yet${flagged?' and the nurse’s own scan flagged the date':''}. Use “Read the document on this device” to compare, then enter what the source shows.`;
 return'Prefilled with what the nurse typed. Change it to what the source shows.';
}
let acctVScan=null;/* {id,status,label,res,error} */
async function acctVerifierRead(c){
 acctVScan={id:c.id,status:'scanning',label:'Getting the document with a 60-second private link'};acctRenderVerify();
 try{
  const url=await acct().verifierDocumentUrl(c.source_document_path,60);
  const r=await fetch(url);if(!r.ok)throw new Error('Could not download the document ('+r.status+').');
  const blob=await r.blob(),name=c.source_document_path.split('/').pop();
  const res=await DocExtract.extractFromFile(new File([blob],name,{type:blob.type||''}),{kind:c.kind,profileName:c.clinicians?.full_name||'',onProgress:x=>{if(acctVScan?.id!==c.id)return;acctVScan.label=x.label;const l=$('acctVScanLabelV14');if(l)l.textContent=x.label}});
  if(acctVScan?.id!==c.id)return;acctVScan={id:c.id,status:'done',res};
 }catch(e){acctVScan={id:c.id,status:'error',error:DocExtract.friendlyError(e)}}
 acctRenderVerify();
}
function acctDocBoxHtml(c){
 const d=c.metadata?.doc,v=acctVScan&&acctVScan.id===c.id?acctVScan:null,res=v?.res;
 const nm=k=>(DocExtract.FIELD_LABEL[k]||k).toLowerCase();
 const head=d?.confirmed?`<div class="small">The nurse read the document on their device and confirmed ${ec((d.fields_confirmed||[]).map(nm).join(', ')||'it')}${(d.corrected||[]).length?` (corrected: ${ec(d.corrected.map(nm).join(', '))})`:''}.${d.mismatch?` <span class="badge REVOKED">CREDENTIAL MISMATCH DETECTED</span> ${ec((d.mismatch_fields||[]).map(nm).join(', '))}`:''}</div>`:`<div class="small">${c.source_document_path?'The nurse has not confirmed details from the document.':'No document uploaded.'}</div>`;
 const btn=c.source_document_path&&/\.(pdf|png|jpe?g|webp)$/i.test(c.source_document_path)?`<button type="button" class="mini sec" data-act="verify-read-doc" id="acctVReadV14">${res?'Read again':'Read the document on this device'}</button>`:'';
 let body='';
 if(v?.status==='scanning')body=`<div class="scan-bar-v14"><div style="width:40%"></div></div><div class="small" id="acctVScanLabelV14">${ec(v.label||'')}</div>`;
 else if(v?.status==='error')body=`<div class="small alert-v81" id="acctVScanErrV14">${ec(v.error)} Open the document and check it by eye at the source.</div>`;
 else if(res&&!res.supported)body=`<div class="small">${ec(res.warnings[0]||'This file type cannot be read.')} Open the document and check it by eye at the source.</div>`;
 else if(res){
  const f=res.fields,aha=res.profile==='aha_resus',code=f.credential_id?.value||'',rqi=aha&&(/[A-Za-z]/.test(code)||res.issuer==='AHA_RQI'),rc=res.issuer==='RED_CROSS';
  const src=res.source&&verificationSource(res.source.id);
  const lbl=k=>k==='credential_id'?(aha?(rc?'Certificate ID':rqi?'RQI code':'eCard code'):res.profile==='license'?'License number':'ID'):(DocExtract.FIELD_LABEL[k]||k);
  const exp=DocExtract.documentExpiry(f,res.issuer);
  const ms=DocExtract.compareToEntered(Object.fromEntries(Object.entries(f).map(([k,x])=>[k,x.value])),{kind:c.kind,expires_on:c.expires_on,profileName:c.clinicians?.full_name||'',issuer:res.issuer,jurisdiction:c.jurisdiction_code}).filter(m=>m.severity==='mismatch');
  /* v14.2: the Training Center ID is shown for context only; the lookup uses the eCard code */
  const tcRow=f.training_center_id?`<div>${ec(DocExtract.FIELD_LABEL.training_center_id)}</div><div id="acctVTcIdV142">${ec(f.training_center_id.value)} <span class="small">· ${ec(DocExtract.TC_ID_NOTE)}</span></div>`:'';
  const noCode=aha&&!rc&&!f.credential_id?`<div class="small alert-v81" id="acctVNoCodeV142">${ec(res.notes?.credential_id||DocExtract.ECARD_NOT_FOUND)} Ask the nurse for the eCard code, or read it from the document by eye. The Training Center ID can't be used to look the card up.</div>`:'';
  const how=aha&&!rc?(rqi?`<li>This code has letters, so it is an RQI card: open <a href="https://www.heart.org/RQIverify" target="_blank" rel="noopener" id="acctOpenRqiV14">heart.org/RQIverify</a> and enter the code.</li>`:`<li>Copy the eCard code, open <a href="https://ecards.heart.org/student/myecards?pid=ahaecard.employerStudentSearch" target="_blank" rel="noopener" id="acctOpenAhaV14">AHA eCards → Employer</a> and paste it (up to 20 codes at a time).</li><li>Compare the name, course, issue date and renewal date AHA shows. If AHA can't find a code with letters, use <a href="https://www.heart.org/RQIverify" target="_blank" rel="noopener">heart.org/RQIverify</a> (RQI cards).</li>`)
   :rc?`<li>Open <a href="https://www.redcross.org/take-a-class/digital-certificate" target="_blank" rel="noopener" id="acctOpenRcV14">Red Cross digital certificate lookup</a> and enter the certificate ID.</li>`
   :src?.lookupUrl?`<li>Open <a href="${ec(src.lookupUrl)}" target="_blank" rel="noopener" id="acctOpenSrcV14">${ec(src.name)}</a>.</li>`:'';
  body=`<div class="why-grid-v13">${res.fieldsWanted.filter(k=>f[k]).map(k=>`<div>${ec(lbl(k))}</div><div>${ec(f[k].value)}${k==='credential_id'?` <button type="button" class="mini sec" data-act="copy-code" data-code="${ec(f[k].value)}" id="acctCopyCodeV14">Copy</button>`:''} <span class="small">· ${Math.round(f[k].conf*100)}%</span></div>`).join('')}${tcRow}${f.test_group?`<div>${ec(DocExtract.FIELD_LABEL.test_group)}</div><div id="acctVTestGroupV144">Group ${ec(f.test_group.value)} <span class="small">· ${Math.round(f.test_group.conf*100)}% · as printed</span></div>`:''}${f.nihss_module?`<div>${ec(DocExtract.FIELD_LABEL.nihss_module)}</div><div id="acctVModuleV144">${ec(f.nihss_module.value)} <span class="small">· ${Math.round(f.nihss_module.conf*100)}% · as printed</span></div>`:''}${res.calculated?.suggested_renewal?`<div>${ec(DocExtract.FIELD_LABEL.suggested_renewal)}</div><div id="acctVSuggestV144">${ec(fd(res.calculated.suggested_renewal.value))} <span class="small">· calculated (12 months from completion), not printed, not verified; the facility rule is final</span></div>`:''}${res.notes?.verifier?`<div>Verifier</div><div class="small alert-v81" id="acctVVerifierV144">${ec(res.notes.verifier)}</div>`:''}<div>Expiration (typed by the nurse)</div><div>${c.expires_on?ec(fd(c.expires_on)):'—'}</div></div>${noCode}
  ${exp?`<div class="small">${ec(exp.text)}</div>`:''}
  ${ms.length?`<div class="small alert-v81"><b>Credential mismatch detected</b><br>${ms.map(m=>ec(m.text)).join('<br>')}</div>`:''}
  ${how?`<ol class="small">${how}<li>Record exactly what the source shows below.</li></ol>`:''}`;
 }
 const aha=['CERT_BLS','CERT_ACLS','CERT_PALS'].includes(c.kind);
 return`<div class="docbox-v14" id="acctDocBoxV14"><div><b>Document details</b> <span class="small">(read from the document, not verified; nothing read here is saved)</span></div>${head}${btn}${body}
 ${aha?'<div class="small">Assisted, not automatic: AHA has no public verification API, and its Terms of Service do not allow making its services available through another system without written authorization. Veridun prepares the code and opens the page; you do the lookup.</div>':''}</div>`;
}
function acctDoubleCheckHtml(c){
 const d=c.metadata?.doc;if(!d)return'';
 const lic=RN_LICENSE_KINDS.includes(c.kind);
 const items=[['holder_name','Name matches the source'],['credential_id',lic?'License number matches':'Card / certificate ID matches'],['course','Course / credential matches'],['dates','Issue and expiration dates match'],['active','Shown as current / active']].filter(([k])=>k!=='course'||(d.fields_confirmed||[]).includes('course'));
 return`<fieldset class="acct-fieldset-v10" id="acctDoubleCheckV14"><legend>Manual double-check against the source</legend>${items.map(([k,t])=>`<label class="acct-sec-v11"><input type="checkbox" class="acctDblV14" value="${k}"> ${ec(t)}</label>`).join('')}<div class="small">Tick what matched at the source. Unticked items count as "differed" in the extraction accuracy numbers.</div></fieldset>`;
}
async function acctLogVerifierCheck(c){
 const d=c?.metadata?.doc;if(!d)return;
 const ticked=[...document.querySelectorAll('.acctDblV14')].map(x=>[x.value,x.checked]);
 const expand=k=>k==='dates'?['issued_on',d.profile==='aha_resus'?'renew_by':'expires_on']:k==='active'?[]:[k];
 const fields=d.fields_confirmed||[];
 const confirmed=ticked.filter(([,v])=>v).flatMap(([k])=>expand(k)).filter(k=>fields.includes(k));
 const differed=ticked.filter(([,v])=>!v).flatMap(([k])=>expand(k)).filter(k=>fields.includes(k));
 const a=acct(),src=$('acctVerifySourceIdV13')?.value||null;
 await a.log('VERIFIER_CHECK',{actor_type:'VERIFIER',credential_id:c.id,result:differed.length?'DIFFERED':'MATCHED',detail:{kind:c.kind,profile:d.profile,fields_confirmed:confirmed,fields_corrected:differed,fields_expected:fields,source_slug:src}});
 await a.logExtraction({event:'VERIFIER_CHECK',credential_id:c.id,clinician_id:c.clinician_id,kind:c.kind,profile:d.profile,source_slug:src,fields_expected:fields,fields_confirmed:confirmed,fields_corrected:differed});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act="copy-code"]');if(!b)return;navigator.clipboard?.writeText(b.dataset.code).then(()=>acctMsg('Code copied. Paste it on the source page.','ok'),()=>acctMsg('Select the code and copy it.'))});
