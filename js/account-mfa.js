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
 const rows=acctVerifyRows||[];
 if(!rows.length)return'<div class="small">No credentials to review.</div>';
 return rows.map(c=>`<button type="button" class="acct-item-v10 acct-verify-pick-v12" data-act="verify-pick" data-id="${c.id}"><div class="acct-item-main-v10"><b>${ec(c.display_name)}</b><div class="small">${ec(c.clinicians?.full_name||'Clinician')} · ${ec(c.kind)} · ${ec(c.status)}</div></div></button>`).join('');
}
function acctRenderVerify(){
 const el=$('acctVerifyV12');if(!el)return;
 const a=acct();
 if(!a.hasVerifiedFactor()||a.needsMfaChallenge()){el.innerHTML='<div class="notice alert-v81"><b>Set up two-factor first.</b><div class="small">Open Security, add an authenticator app, and enter a code. Recording an issuer check stays off until then.</div></div>';return}
 const c=(acctVerifyRows||[]).find(x=>x.id===acctVerifyId);
 const look=c?lookupForKind(c.kind):null;
 el.innerHTML=`<div class="panel-v81"><div class="ph">Record an issuer check</div><div class="pb">
 <p class="small">You check the official lookup, then record what it said. That record is the source of truth. Anchoring it on XRPL Testnet afterwards only shows it was not changed later. It does not contact the issuer, and readiness ignores the ledger.</p>
 <div id="acctVerifyListV12">${acctVerifyRows?acctVerifyListHtml():'<div class="small">Loading…</div>'}</div>
 ${c?`<form id="acctVerifyFormV12" class="acct-form-v10" style="margin-top:12px">
 <div class="small"><b>${ec(c.display_name)}</b> · ${ec(c.clinicians?.full_name||'')}</div>
 ${look?`<p class="small">Official lookup: <a id="acctLookupLinkV12" href="${ec(look.url)}" target="_blank" rel="noopener">${ec(look.name)}</a><br>${ec(look.note)}</p>`:'<p class="small">No public lookup page is on file for this kind. Use the issuer’s own verification process and type that source name. Do not invent a URL.</p>'}
 <label>Result<select id="acctVerifyResultV12" required><option value="VERIFIED">Verified — the issuer confirmed it</option><option value="FAILED">Failed — the issuer did not confirm it</option></select></label>
 <label>Verification source<input id="acctVerifySourceV12" required maxlength="200" value="${ec(look?.name||'')}"></label>
 <label>Date you checked<input type="date" id="acctVerifyDateV12" required value="${acctToday()}" max="${acctToday()}"></label>
 <label>Reference or confirmation number<input id="acctVerifyRefV12" required maxlength="120" placeholder="From the issuer page. Stored off-chain only." autocomplete="off"></label>
 <button class="pri" type="submit" id="acctVerifySaveV12">Record issuer check</button></form>`:''}
 ${acctLastRecord?`<div class="notice" id="acctVerifyDoneV12"><b>Recorded as ${ec(acctLastRecord.result)}.</b><div class="small">Commitment ${ec(acctLastRecord.commitment.slice(0,16))}… is ready to anchor. Nothing personal is written on the ledger: only this fingerprint.</div>
 <button class="pri" type="button" data-act="anchor-now" id="acctAnchorNowV12">Anchor on XRPL Testnet</button></div>`:''}
 </div></div>`;
 if(!acctVerifyRows)acctLoadVerifyQueue().catch(acctErr);
}
async function acctSubmitVerification(){
 const reference=$('acctVerifyRefV12').value.trim();
 const rec=await acct().recordVerification({credentialId:acctVerifyId,result:$('acctVerifyResultV12').value,sourceName:$('acctVerifySourceV12').value.trim(),reference,checkedOn:$('acctVerifyDateV12').value});
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
  if(id==='acctVerifyFormV12'){e.preventDefault();acctDo(acctSubmitVerification,'Issuer check recorded. Anchor it if you want a tamper-evident fingerprint.');}
 });
 document.body.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;
  if(act==='mfa-enroll')acctDo(async()=>{await acct().enrollTotp();acctTab='acctSecurityV12'},'Scan the QR code, then enter the first code.');
  if(act==='mfa-remove'){if(confirm('Remove this authenticator? The next sign-in will only use the email link, until you add an app again.'))acctDo(()=>acct().unenrollTotp(b.dataset.id),'Authenticator removed.');}
  if(act==='verify-pick'){acctVerifyId=b.dataset.id;acctLastRecord=null;acctRenderVerify()}
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
