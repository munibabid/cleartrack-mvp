/* Verification workflow (SIMULATED in this demo) and the provenance / proof dialog. */
function openVerify(id){const c=creds.find(x=>x.id===id);if(!c)return;c.primary='VERIFYING';c.prov=c.prov||{};c.prov.lastMonitored=new Date().toISOString();v81Log('VERIFICATION_STARTED',c.id,{actor_type:'CLINICIAN',result:'QUEUED'});save();render();alert(c.name+' was submitted to the Verification Console.');}
/* SIMULATED primary-source check run from the Verification Console. The
   source is looked up from the catalog (state board for RN licenses), the
   duration is the real elapsed time since the credential entered the queue,
   and a console action counts as a manual touch. */
function v81Verify(id){
 const c=creds.find(x=>x.id===id);if(!c)return;
 if(isRnLicense(c)&&!jurisdiction(c.jurisdiction)){v81Log('VERIFICATION_FAILED',id,{actor_type:'VERIFIER',result:'JURISDICTION_MISSING',manual_intervention:true});alert('Jurisdiction missing: the license needs a US state or territory before it can be checked.');return}
 if(c.kind==='RN_LICENSE_MULTISTATE'&&!nlcCanIssueMultistate(c.jurisdiction)){v81Log('VERIFICATION_FAILED',id,{actor_type:'VERIFIER',result:'NOT_AN_NLC_HOME_STATE',manual_intervention:true});alert(`${jurisdictionName(c.jurisdiction)} does not issue multistate (NLC) licenses — ${nlcStatusLabel(c.jurisdiction)}.`);return}
 const finish=new Date(),startEv=v81Events().find(e=>e.credential_id===id&&e.event_type==='VERIFICATION_STARTED');
 if(!startEv)v81Log('VERIFICATION_STARTED',id,{timestamp:finish.toISOString(),actor_type:'VERIFIER',verification_method:'SIMULATED_PRIMARY_SOURCE'});
 const dur=startEv?finish-new Date(startEv.timestamp):0;
 c.primary='VERIFIED';c.prov=c.prov||{};c.prov.active=true;
 c.prov.source=issuerFor(c.kind,c.jurisdiction)+' — simulated lookup (DEMO)';
 c.prov.method='Simulated primary-source check (DEMO)';c.prov.verifier='Veridun Verification Console — DEMO';
 c.prov.verifiedAt=finish.toISOString();c.prov.lastMonitored=finish.toISOString();
 c.verification_method='SIMULATED_PRIMARY_SOURCE';c.last_verified_date=finish.toISOString().slice(0,10);c.last_monitored_date=finish.toISOString().slice(0,10);
 v81Log('SOURCE_CHECK_COMPLETED',id,{actor_type:'VERIFIER',verification_method:'SIMULATED_PRIMARY_SOURCE',result:'DEMO_SUCCESS',duration_ms:dur,manual_intervention:true});
 v81Log('VERIFICATION_SUCCEEDED',id,{timestamp:finish.toISOString(),actor_type:'VERIFIER',verification_method:'SIMULATED_PRIMARY_SOURCE',result:'DEMO_SUCCESS',duration_ms:dur});
 const renewed=applyRenewalV85(c);
 save();recalcAssignmentReadiness();render();v81RenderRoles();
 alert(c.name+' is now Demo Primary-Source Verified (simulated).'+(renewed?'\nIt replaces the previous record (expired '+fd(renewed)+'); live shares now point to the renewed credential.':''));
}
function showProof(id){let c=creds.find(x=>x.id===id),p=c.prov||{},items=[['Credential',c.name],['Machine-readable type',c.type],['Primary-source status',c.primary],['Verification source',p.source||'—'],['Verified at',p.verifiedAt?new Date(p.verifiedAt).toLocaleString():'—'],['Verification method',p.method||'—'],['Verifier',p.verifier||'—'],['Credential active',p.active?'Yes':'No'],['Expiration',fd(c.expiration)],['Last monitored',p.lastMonitored?new Date(p.lastMonitored).toLocaleString():'—'],['XRPL state',c.privateOnly?'PRIVATE / OFF-CHAIN':c.chain],['Network',c.issuer?'XRPL Devnet':'—'],['Issuer wallet',c.issuer||'—'],['Subject wallet',c.subject||'—'],['Create transaction',c.issueTx||'—'],['Create ledger',c.issueLedger||'—'],['Accept transaction',c.acceptTx||'—'],['Accept ledger',c.acceptLedger||'—']];$('proofState').innerHTML=c.privateOnly?'<b>Private requirement:</b> provenance is recorded off-chain; sensitive records are not issued to XRPL.':c.chain==='ACCEPTED'?'<b>XRPL accepted:</b> the nurse has accepted the credential and the trust record is shareable.':c.chain==='SECURING'?'<b>XRPL issued:</b> awaiting nurse acceptance before it is treated as valid.':'<b>Verification record:</b> issue an XRPL Credential only after primary-source verification.';$('proofGrid').innerHTML=items.map(x=>`<div>${ec(x[0])}</div><div class="mono">${ec(x[1])}</div>`).join('');const h=c.acceptTx||c.issueTx;$('explorer').style.visibility=h?'visible':'hidden';if(h)$('explorer').href=EX+'/transactions/'+h;$('proof').showModal()}

/* ---- Manual review, monitoring and revocation (SIMULATED, PR 5) ---- */
function manualReviewDecision(id,approve){
 const c=creds.find(x=>x.id===id);if(!c)return;const alerts=mismatchAlerts().filter(a=>a.c.id===id).map(a=>a.rule);
 if(approve){v81Log('MANUAL_REVIEW_APPROVED',id,{actor_type:'VERIFIER',result:'APPROVED',manual_intervention:true,detail:{rules:alerts}});v81Verify(id);return}
 if(!confirm(`Reject ${c.name} after manual review? The clinician will be asked to upload a corrected credential.`))return;
 c.primary='REJECTED';c.prov=c.prov||{};c.prov.active=false;c.prov.rejectedAt=new Date().toISOString();
 v81Log('MANUAL_REVIEW_REJECTED',id,{actor_type:'VERIFIER',result:'REJECTED',manual_intervention:true,detail:{rules:alerts}});
 v81Log('VERIFICATION_FAILED',id,{actor_type:'VERIFIER',result:'REJECTED_AFTER_REVIEW',manual_intervention:true});
 save();render();v81RenderRoles();
}
/* Simulated monitoring sweep: re-checks every verified credential, marks
   expired ones, and logs one MONITORING_RUN event with the outcome. */
function runMonitoringCheck(){
 const now=new Date().toISOString();let checked=0,expired=[];
 creds.forEach(c=>{if(c.primary!=='VERIFIED')return;checked++;c.prov=c.prov||{};c.prov.lastMonitored=now;c.last_monitored_date=now.slice(0,10);const d=daysUntil(credExpiry(c));if(d!=null&&d<0){c.primary='EXPIRED';c.prov.active=false;expired.push(c.name);v81Log('CREDENTIAL_EXPIRED',c.id,{actor_type:'SYSTEM',result:'EXPIRED'})}});
 v81Log('MONITORING_RUN',null,{actor_type:'SYSTEM',verification_method:'SIMULATED_MONITORING',result:`${checked} checked · ${expired.length} expired`,detail:{checked,expired}});
 save();recalcAssignmentReadiness();render();v81RenderRoles();
}
function simulateRevocation(id){
 const c=creds.find(x=>x.id===id);if(!c)return;
 if(!confirm(`Simulate an issuer action revoking ${c.name}? (Demo only: no real board or issuer is involved.) Readiness and any shared assertions update immediately.`))return;
 c.primary='REVOKED';c.prov=c.prov||{};c.prov.active=false;c.prov.revokedAt=new Date().toISOString();
 v81Log('CREDENTIAL_REVOKED',id,{actor_type:'VERIFIER',verification_method:'SIMULATED_MONITORING',result:'REVOKED_BY_ISSUER_DEMO'});
 save();render();v81RenderRoles();
}
function reinstateCredential(id){
 const c=creds.find(x=>x.id===id);if(!c)return;c.primary='VERIFIED';c.prov=c.prov||{};c.prov.active=true;c.prov.revokedAt=null;c.prov.lastMonitored=new Date().toISOString();
 v81Log('CREDENTIAL_REINSTATED',id,{actor_type:'VERIFIER',verification_method:'SIMULATED_PRIMARY_SOURCE',result:'REINSTATED_DEMO',manual_intervention:true});
 save();recalcAssignmentReadiness();render();v81RenderRoles();
}

/* Renewal (PR5): once a renewed credential is verified it replaces the record
   it renews. Live share assertions are re-pointed so organizations keep seeing
   the current credential; history stays in the event log. */
function applyRenewalV85(c){
 if(!c.renews)return null;const old=creds.find(x=>x.id===c.renews);if(!old){delete c.renews;return null}
 const prev=credExpiry(old);
 if(typeof loadShares==='function'){const sh=loadShares();let n=0;sh.forEach(s=>(s.assertions||[]).forEach(x=>{if(x.credId===old.id){x.credId=c.id;x.label=c.name;n++}}));if(n)saveShares(sh)}
 creds=creds.filter(x=>x.id!==old.id);delete c.renews;
 v81Log('CREDENTIAL_RENEWED',c.id,{actor_type:'SYSTEM',result:'PREVIOUS_RECORD_REPLACED',detail:{previous_id:old.id,previous_expiration:prev||null,new_expiration:credExpiry(c)||null}});
 return prev;
}
