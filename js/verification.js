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
 save();recalcAssignmentReadiness();render();v81RenderRoles();
 alert(c.name+' is now Demo Primary-Source Verified (simulated).');
}
function showProof(id){let c=creds.find(x=>x.id===id),p=c.prov||{},items=[['Credential',c.name],['Machine-readable type',c.type],['Primary-source status',c.primary],['Verification source',p.source||'—'],['Verified at',p.verifiedAt?new Date(p.verifiedAt).toLocaleString():'—'],['Verification method',p.method||'—'],['Verifier',p.verifier||'—'],['Credential active',p.active?'Yes':'No'],['Expiration',fd(c.expiration)],['Last monitored',p.lastMonitored?new Date(p.lastMonitored).toLocaleString():'—'],['XRPL state',c.privateOnly?'PRIVATE / OFF-CHAIN':c.chain],['Network',c.issuer?'XRPL Devnet':'—'],['Issuer wallet',c.issuer||'—'],['Subject wallet',c.subject||'—'],['Create transaction',c.issueTx||'—'],['Create ledger',c.issueLedger||'—'],['Accept transaction',c.acceptTx||'—'],['Accept ledger',c.acceptLedger||'—']];$('proofState').innerHTML=c.privateOnly?'<b>Private requirement:</b> provenance is recorded off-chain; sensitive records are not issued to XRPL.':c.chain==='ACCEPTED'?'<b>XRPL accepted:</b> the nurse has accepted the credential and the trust record is shareable.':c.chain==='SECURING'?'<b>XRPL issued:</b> awaiting nurse acceptance before it is treated as valid.':'<b>Verification record:</b> issue an XRPL Credential only after primary-source verification.';$('proofGrid').innerHTML=items.map(x=>`<div>${ec(x[0])}</div><div class="mono">${ec(x[1])}</div>`).join('');const h=c.acceptTx||c.issueTx;$('explorer').style.visibility=h?'visible':'hidden';if(h)$('explorer').href=EX+'/transactions/'+h;$('proof').showModal()}
