/* Verification workflow (SIMULATED in this demo) and the provenance / proof dialog. */
function openVerify(id){const c=creds.find(x=>x.id===id);if(!c)return;c.primary='VERIFYING';c.prov=c.prov||{};c.prov.lastMonitored=new Date().toISOString();v81Log('VERIFICATION_STARTED',c.id,{actor_type:'CLINICIAN',result:'QUEUED'});save();render();alert(c.name+' was submitted to the Verification Console.');}
/* SIMULATED primary-source check run from the Verification Console. The
   source is looked up from the catalog (state board for RN licenses), the
   duration is the real elapsed time since the credential entered the queue,
   and a console action counts as a manual touch. */
function v81Verify(id){
 const c=creds.find(x=>x.id===id);if(!c)return;
 if(isRnLicense(c)&&!jurisdiction(c.jurisdiction)){v81Log('VERIFICATION_FAILED',id,{actor_type:'VERIFIER',result:'JURISDICTION_MISSING',manual_intervention:true});alert('Jurisdiction missing: the license needs a US state or territory before it can be checked.');return}
 if(licenseScopeOf(c)==='MULTISTATE'&&!nlcCanIssueMultistate(c.jurisdiction)){v81Log('VERIFICATION_FAILED',id,{actor_type:'VERIFIER',result:'NOT_AN_NLC_HOME_STATE',manual_intervention:true});alert(`${jurisdictionName(c.jurisdiction)} does not issue multistate (NLC) licenses — ${nlcStatusLabel(c.jurisdiction)}.`);return}
 const finish=new Date(),startEv=v81Events().find(e=>e.credential_id===id&&e.event_type==='VERIFICATION_STARTED');
 if(!startEv)v81Log('VERIFICATION_STARTED',id,{timestamp:finish.toISOString(),actor_type:'VERIFIER',verification_method:'SIMULATED_PRIMARY_SOURCE'});
 const dur=startEv?finish-new Date(startEv.timestamp):0;
 c.primary='VERIFIED';c.prov=c.prov||{};c.prov.active=true;
 /* PR 13: the route comes from the Verification Source Registry. The demo
    still contacts nobody: everything is labelled simulated. */
 const route=primaryRouteFor(c.kind,c.jurisdiction),floor=kindFloor(c.kind).level,rl=route?sourceLevel(route):null,useRoute=route&&levelMeets(rl,floor);
 c.verificationLevel=useRoute?rl:floor;
 c.prov.sourceId=useRoute?route.id:'';
 c.prov.source=(useRoute?route.name:issuerFor(c.kind,c.jurisdiction))+' — simulated lookup (DEMO)';
 c.prov.method=(useRoute?VERIFICATION_METHODS[route.method].label:'Issuer')+' check — simulated (DEMO)';c.prov.verifier='Veridun Verification Console — DEMO';
 c.prov.level=c.verificationLevel;c.prov.statusAtSource='Active (simulated)';c.prov.sourceExpiration=credExpiry(c)||'';
 c.prov.reference='DEMO-'+Math.random().toString(36).slice(2,8).toUpperCase();c.prov.monitoring='Not enrolled (demo)';
 c.prov.policy=`Registry ${REGISTRY_AS_OF}${useRoute?' · '+route.id+' ('+SOURCE_STATUS[route.status]+')':''}`;
 c.prov.verifiedAt=finish.toISOString();c.prov.lastMonitored=finish.toISOString();
 /* v14.7: original issue date as the state board shows it, recorded by the verifier; kept apart
    from any date printed on the document (which can be the latest renewal). */
 const oi=isRnLicense(c)?($('origIssueV147-'+id)?.value||''):'';
 if(oi){c.prov.originalIssueDate=oi;c.prov.originalIssueSource=(useRoute?route.name:issuerFor(c.kind,c.jurisdiction))+' (simulated, demo)';c.prov.originalIssueRecordedAt=finish.toISOString();
  v81Log('ORIGINAL_ISSUE_DATE_RECORDED',id,{actor_type:'VERIFIER',result:'RECORDED',detail:{original_issue_date:oi,source:c.prov.originalIssueSource}})}
 c.verification_method='SIMULATED_PRIMARY_SOURCE';c.last_verified_date=finish.toISOString().slice(0,10);c.last_monitored_date=finish.toISOString().slice(0,10);
 v81Log('SOURCE_CHECK_COMPLETED',id,{actor_type:'VERIFIER',verification_method:'SIMULATED_PRIMARY_SOURCE',result:'DEMO_SUCCESS',duration_ms:dur,manual_intervention:true});
 v81Log('VERIFICATION_SUCCEEDED',id,{timestamp:finish.toISOString(),actor_type:'VERIFIER',verification_method:'SIMULATED_PRIMARY_SOURCE',result:'DEMO_SUCCESS',duration_ms:dur});
 const renewed=applyRenewalV85(c);
 save();recalcAssignmentReadiness();render();v81RenderRoles();
 alert(c.name+' is now '+levelLabel(c.verificationLevel)+' (simulated demo check).'+(renewed?'\nIt replaces the previous record (expired '+fd(renewed)+'); live shares now point to the renewed credential.':''));
}
/* Provenance (PR 13): where the credential came from and who confirmed it. */
const PROVENANCE_HELP='Provenance means where a credential came from and who confirmed it: the source that was checked, how, by whom, when, and what the source said.';
function provenanceRows(c){
 const p=c.prov||{},lvl=credentialLevel(c),src=p.sourceId?verificationSource(p.sourceId):null;
 return[['Verification level',lvl?levelLabel(lvl)+(credentialLevelIsDemo(c)?' (demo)':''):'Not verified'],['Source',p.source||'—'],['Source type',src?SOURCE_TYPES[src.type]:'—'],['Method',p.method||'—'],['Verified by',p.verifier||'—'],['Checked',p.verifiedAt?new Date(p.verifiedAt).toLocaleString():'—'],['Status at source',p.statusAtSource||(p.active?'Active':'—')],...(p.originalIssueDate?[['Original issue date (state board)',`${fd(p.originalIssueDate)} — recorded by the verifier from ${p.originalIssueSource||'the state board'}`]]:[]),...(c.expConfirm?[['Expiration confirmed by the nurse',expConfirmText(c.expConfirm)]]:[]),['Expiration (from source)',p.sourceExpiration?fd(p.sourceExpiration):fd(credExpiry(c))],['Evidence reference',p.reference||'—'],['Monitoring',p.monitoring||(p.lastMonitored?'Last checked '+new Date(p.lastMonitored).toLocaleString():'—')],['Policy',p.policy||'—'],['XRPL anchor',c.acceptTx||c.issueTx?'Devnet proof '+(c.acceptTx||c.issueTx).slice(0,10)+'… (optional, never needed for readiness)':'None (optional)']];
}
function provenanceHeadline(c){const lvl=credentialLevel(c),p=c.prov||{};if(!lvl)return'NOT VERIFIED';return`${levelLabel(lvl).toUpperCase()}${credentialLevelIsDemo(c)?' · DEMO':''} · Source: ${(p.source||'—').replace(' — simulated lookup (DEMO)','')} · Checked: ${p.verifiedAt?String(p.verifiedAt).slice(0,10):'—'}`}
/* v14.8: semantic type and ledger proof id are shown separately; the network is the one recorded
   with the proof (pre-v14.8 proofs were all on XRPL Devnet and are labelled legacy). */
function proofIdentityRows(c){const L=typeof LedgerIdentity!=='undefined'?LedgerIdentity:null;if(!L)return[['Network',c.issuer?'XRPL Devnet':'—']];const leg=L.isLegacyProof(c);return[['Semantic type',L.semanticType(c)||'—'],['Ledger proof ID (XRPL CredentialType)',c.ledgerCredentialType||(leg?c.type+' (legacy proof, issued before v14.8)':'assigned when the proof is issued')],['Proof schema',c.ledgerProofSchema||(leg?'legacy (before v14.8)':'—')],...(c.ledgerSupersedes?[['Supersedes proof',c.ledgerSupersedes]]:[]),['Network',c.proofNetwork?L.networkLabel(c.proofNetwork):c.issuer?'XRPL Devnet (recorded before v14.8)':'—'],['Create time',c.issueDate||'—'],['Accept time',c.acceptDate||'—']]}
function showProof(id){let c=creds.find(x=>x.id===id),p=c.prov||{},items=[['Credential',c.name],['Machine-readable type',c.type],['Primary-source status',c.primary],...provenanceRows(c),['Credential active',p.active?'Yes':'No'],['Expiration',fd(c.expiration)],['XRPL state',c.privateOnly?'PRIVATE / OFF-CHAIN':c.chain],...proofIdentityRows(c),['Issuer wallet',c.issuer||'—'],['Subject wallet',c.subject||'—'],['Create transaction',c.issueTx||'—'],['Create ledger',c.issueLedger||'—'],['Accept transaction',c.acceptTx||'—'],['Accept ledger',c.acceptLedger||'—']];$('proofState').innerHTML=`<div class="prov-head-v13" id="provHeadV13"><b>${ec(provenanceHeadline(c))}</b></div><div class="small prov-help-v13"><b>Provenance:</b> ${ec(PROVENANCE_HELP)}</div><div class="why-grid-v13 prov-grid-v13" id="provGridV13">${provenanceRows(c).filter(r=>['Verification level','Source','Method','Verified by','Checked','Status at source','Evidence reference','Policy','XRPL anchor'].includes(r[0])).map(r=>`<div>${ec(r[0])}</div><div>${ec(r[1])}</div>`).join('')}</div>`+(c.privateOnly?'<b>Private requirement:</b> provenance is recorded off-chain; sensitive records are not issued to XRPL.':c.chain==='ACCEPTED'?'<b>XRPL accepted:</b> the nurse has accepted the credential and the trust record is shareable.':c.chain==='SECURING'?'<b>XRPL issued:</b> awaiting nurse acceptance before it is treated as valid.':'<b>Verification record:</b> issue an XRPL Credential only after primary-source verification.');$('proofGrid').innerHTML=items.map(x=>`<div>${ec(x[0])}</div><div class="mono">${ec(x[1])}</div>`).join('');const h=c.acceptTx||c.issueTx;$('explorer').style.visibility=h?'visible':'hidden';if(h)$('explorer').href=EX+'/transactions/'+h;$('proof').showModal()}

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
