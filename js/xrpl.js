/* XRPL Devnet (test network) proof layer: disposable wallets, CredentialCreate,
   CredentialAccept, and a live on-chain check for shared Passport links.
   XRPL proof is optional and never required for assignment readiness. */
const WS='wss://s.devnet.rippletest.net:51233/',EX='https://devnet.xrpl.org',WK='nursecredx_wallets_v2',AF=65536;
async function wallets(client){let s=store.session.xrplWallets();if(s){let d=JSON.parse(s);return{issuer:xrpl.Wallet.fromSeed(d.i),subject:xrpl.Wallet.fromSeed(d.s)}}setBusy('Creating disposable XRPL Devnet wallets…');let issuer=(await client.fundWallet()).wallet,subject=(await client.fundWallet()).wallet;store.session.setXrplWallets(JSON.stringify({i:issuer.seed,s:subject.seed}));$('walletInfo').textContent=`Issuer ${issuer.address.slice(0,7)}… · Nurse ${subject.address.slice(0,7)}…`;return{issuer,subject}}
/* v14.6: a proof transaction is signed first, so its hash is known and saved BEFORE it is
   submitted (c.proofPending). XRPL validates in a few seconds; if a proof is still pending after
   PROOF_STALE_MS the label says "Proof delayed — retrying" and Veridun looks the transaction up by
   hash on a validated ledger (tx command) instead of waiting forever. Stale pending proofs are also
   re-checked when the app loads. A transaction that is not in a validated ledger after its
   LastLedgerSequence can never succeed, so the proof is rolled back and the nurse can try again. */
const PROOF_STALE_MS=30000,PROOF_RETRY_MS=10000,PROOF_MAX_RETRIES=12;
function proofStale(c,now=Date.now()){return!!(c&&c.proofPending&&now-new Date(c.proofPending.startedAt).getTime()>PROOF_STALE_MS)}
async function proofTxStatus(client,p){
 try{const r=await client.request({command:'tx',transaction:p.hash});const res=r.result||{},code=res.meta?.TransactionResult;
  if(res.validated)return code==='tesSUCCESS'?{state:'SUCCESS',ledger:res.ledger_index||''}:{state:'FAILED',code:code||'unknown'};
 }catch(e){const m=String(e?.data?.error||e?.message||e);if(!/txnNotFound|not ?found/i.test(m))return{state:'UNKNOWN',error:m}}
 /* not validated (yet): final only once the network is past the transaction's last ledger */
 try{const cur=await client.getLedgerIndex();if(p.lastLedger&&cur>p.lastLedger)return{state:'EXPIRED'}}catch(e){}
 return{state:'PENDING'};
}
/* Applies a lookup result to the credential still waiting on that hash. Idempotent. */
function applyProofResult(id,hash,st){
 const c=creds.find(x=>x.id===id);if(!c||!c.proofPending||c.proofPending.hash!==hash)return null;const p=c.proofPending;
 if(st.state==='SUCCESS'){
  if(p.kind==='ISSUE')Object.assign(c,{chain:'SECURING',issuer:p.issuer,subject:p.subject,issueTx:hash,issueLedger:st.ledger||'',issueDate:new Date().toISOString(),proofRef:p.proofRef,...(p.network?{proofNetwork:p.network}:{})});
  else Object.assign(c,{chain:'ACCEPTED',acceptTx:hash,acceptLedger:st.ledger||'',acceptDate:new Date().toISOString()});
  delete c.proofPending;c.proofNote=null;
 }else if(st.state==='FAILED'||st.state==='EXPIRED'){
  c.chain=p.kind==='ISSUE'?'NOT ISSUED':'SECURING';delete c.proofPending;
  c.proofNote=p.kind==='ISSUE'?'The proof didn\'t go through. You can try again.':'Accepting the proof didn\'t go through. You can try again.';
 }else{p.checks=(p.checks||0)+1;p.lastCheckedAt=new Date().toISOString()}
 save();return c;
}
let proofRecheckTimer=null,proofRecheckRuns=0;
/* Re-checks every stale pending proof by transaction hash; schedules a few retries. */
async function recheckStaleProofs({force=false}={}){
 const due=creds.filter(c=>c.proofPending&&(force||proofStale(c)));if(!due.length){proofRecheckRuns=0;return[]}
 if(typeof xrpl==='undefined'||!xrpl.Client){scheduleProofRecheck();return due.map(c=>({id:c.id,state:'UNKNOWN'}))}
 const client=new xrpl.Client(WS),out=[];
 try{await client.connect();for(const c of due){const st=await proofTxStatus(client,c.proofPending);applyProofResult(c.id,c.proofPending.hash,st);out.push({id:c.id,...st})}}
 catch(e){console.warn('[Veridun] proof re-check failed:',e?.message||e)}
 finally{try{if(client.isConnected())await client.disconnect()}catch(e){}}
 if(typeof render==='function')render();
 if(creds.some(c=>c.proofPending))scheduleProofRecheck();else proofRecheckRuns=0;
 return out;
}
function scheduleProofRecheck(){if(proofRecheckTimer||proofRecheckRuns>=PROOF_MAX_RETRIES)return;proofRecheckRuns++;proofRecheckTimer=setTimeout(()=>{proofRecheckTimer=null;recheckStaleProofs({force:true})},PROOF_RETRY_MS)}
/* Signs, saves the pending hash, submits and waits. Shared by issue and accept. */
async function submitProofTx(client,c,kind,tx,wallet,extra){
 const prepared=await client.autofill(tx),signed=wallet.sign(prepared),id=c.id;
 c.proofPending={kind,hash:signed.hash,startedAt:new Date().toISOString(),lastLedger:prepared.LastLedgerSequence||null,checks:0,...extra};c.proofNote=null;
 if(kind==='ISSUE')c.chain='XRPL ISSUED';save();render();
 const wd=setTimeout(()=>{setBusy('Proof delayed — retrying…');render();recheckStaleProofs()},PROOF_STALE_MS+500);
 try{const r=await client.submitAndWait(signed.tx_blob),code=r.result.meta?.TransactionResult;
  applyProofResult(id,signed.hash,r.result.validated===false?{state:'PENDING'}:code==='tesSUCCESS'?{state:'SUCCESS',ledger:r.result.ledger_index||''}:{state:'FAILED',code});
  if(code&&code!=='tesSUCCESS')throw Error(code);
 }catch(e){
  /* A network hiccup is not a failure: the hash is saved, so the re-check settles it. */
  const cc=creds.find(x=>x.id===id);if(cc?.proofPending&&cc.proofPending.hash===signed.hash){scheduleProofRecheck();return false}
  throw e;
 }finally{clearTimeout(wd)}
 return true;
}
/* v14.8: the XRPL CredentialType is the credential's own opaque ledger id (js/ledger-identity.js),
   generated once per credential and free of personal data. It is never the semantic type, so CA RN +
   MA RN, or two BLS generations, coexist on the ledger. A guard stops double-click duplicates. */
const proofBusy=new Set();
async function issue(id){let c=creds.find(x=>x.id===id);if(!eligible(c)||c.proofPending||proofBusy.has(id))return;if(typeof xrpl==='undefined'){alert('XRPL library did not load. Check your connection.');return}proofBusy.add(id);let client=new xrpl.Client(WS);try{setBusy('Connecting to XRPL Devnet…');await client.connect();let{issuer,subject}=await wallets(client);c=creds.find(x=>x.id===id);if(!eligible(c)||c.proofPending)return;let lid;try{lid=LedgerIdentity.ensure(c,creds)}catch(e){alert('This proof needs review before it can be issued: '+e.message);return}save();let proofRef=location.origin+location.pathname+'?proof='+encodeURIComponent(lid),tx={TransactionType:'CredentialCreate',Account:issuer.address,Subject:subject.address,CredentialType:xrpl.convertStringToHex(lid),URI:xrpl.convertStringToHex(proofRef)};if(c.expiration)tx.Expiration=xrpl.isoTimeToRippleTime(new Date(c.expiration+'T23:59:59Z').toISOString());setBusy('Submitting CredentialCreate…');const done=await submitProofTx(client,c,'ISSUE',tx,issuer,{issuer:issuer.address,subject:subject.address,proofRef,credentialType:lid,network:LedgerIdentity.NETWORK});render();if(done)showProof(id)}catch(e){console.error(e);render();alert('XRPL issue failed: '+(e.message||e))}finally{proofBusy.delete(id);setBusy('');if(client.isConnected())await client.disconnect()}}
async function accept(id){let c=creds.find(x=>x.id===id),s=store.session.xrplWallets();if(!s){alert('Demo nurse wallet is unavailable in this browser session.');return}if(!c||c.proofPending||c.chain!=='SECURING'||proofBusy.has(id))return;proofBusy.add(id);let client=new xrpl.Client(WS);try{setBusy('Submitting CredentialAccept…');await client.connect();c=creds.find(x=>x.id===id);if(!c||c.proofPending||c.chain!=='SECURING')return;let subject=xrpl.Wallet.fromSeed(JSON.parse(s).s),tx={TransactionType:'CredentialAccept',Account:subject.address,Issuer:c.issuer,CredentialType:xrpl.convertStringToHex(LedgerIdentity.proofTypeString(c))};const done=await submitProofTx(client,c,'ACCEPT',tx,subject,{});render();if(done)showProof(id)}catch(e){console.error(e);render();alert('XRPL accept failed: '+(e.message||e))}finally{proofBusy.delete(id);setBusy('');if(client.isConnected())await client.disconnect()}}
/* Public Passport check. Each row is looked up by its ledger id (legacy rows by their original
   semantic code, labelled legacy). Row DOM ids come from the row position, never the semantic type.
   A repeated entry is not counted twice; a malformed ledger id is invalid, never downgraded to a
   legacy lookup; an entry for another network is not checked against this one. */
async function publicView(code,isOnboard=false){$('landing').classList.add('hidden');$('app').classList.add('hidden');$('public').classList.remove('hidden');let d;try{d=dec(code)}catch{$('pubStatus').textContent='Invalid Veridun link';return}const types=Array.isArray(d.types)?d.types:[],ls=types.map(x=>({...LedgerIdentity.lookupFor(x),net:x.net||d.net||LedgerIdentity.NETWORK})),byL=new Set(types.filter(x=>LedgerIdentity.isValidId(x.l)).map(x=>x.l));$('pubRows').innerHTML=types.map((x,i)=>{const note=ls[i].mode==='LEGACY'?'Legacy proof (issued before v14.8)':x.sp&&byL.has(x.sp)?'Renewal — replaces an earlier proof':types.some(o=>o.sp&&o.sp===x.l)?'Replaced by a renewal':'';return`<div class="passrow" data-proof-row="${i}"><div><b>${ec(x.n)}</b><div class="small">${ec(x.s||'Primary source')} · ${x.v?new Date(x.v).toLocaleDateString():''}</div><div class="small mono">${ec(x.t)}</div>${note?`<div class="small">${ec(note)}</div>`:''}</div><span class="badge VERIFYING" id="${LedgerIdentity.domId('pubProof',i)}">CHECKING</span></div>`}).join('');$('pubOnboard').innerHTML=isOnboard?`<b>Onboarding QR</b><div class="small" style="margin-top:5px">${d.onboarding?.ready?'All encoded onboarding requirements were satisfied when this Passport was created.':'Onboarding was not complete when this Passport was created.'}</div>`:'<b>Professional Passport</b><div class="small" style="margin-top:5px">Credential proofs are checked live below.</div>';if(typeof xrpl==='undefined'){$('pubStatus').textContent='Verification network unavailable.';return}let client=new xrpl.Client(WS);try{await client.connect();let q={command:'account_objects',account:d.subject,type:'credential',ledger_index:'validated',limit:400},r=await client.request(q),objs=[...(r.result.account_objects||[])];while(r.result.marker){q.marker=r.result.marker;r=await client.request(q);objs.push(...(r.result.account_objects||[]))}let ok=0;const seen=new Set();types.forEach((x,i)=>{const el=$(LedgerIdentity.domId('pubProof',i)),lk=ls[i],set=(t,c)=>{el.textContent=t;el.className='badge '+c};if(lk.mode==='INVALID')return set('INVALID PROOF ID','REVOKED');if(lk.net!==LedgerIdentity.NETWORK)return set('OTHER NETWORK — NOT CHECKED','PENDING');const h=xrpl.convertStringToHex(lk.str).toUpperCase();if(seen.has(h))return set('DUPLICATE ENTRY — NOT COUNTED','PENDING');seen.add(h);const f=objs.find(o=>o.Issuer===d.issuer&&o.Subject===d.subject&&String(o.CredentialType).toUpperCase()===h&&(o.Flags&AF));if(f){set(lk.mode==='LEGACY'?'VERIFIED LIVE · LEGACY PROOF':'VERIFIED LIVE','ACCEPTED');ok++}else set('NOT FOUND','REVOKED')});$('pubScore').textContent=types.length?Math.round(ok/types.length*100)+'%':'0%';$('pubStatus').textContent=`Live XRPL Devnet check complete · ${ok}/${types.length} accepted proofs found`}catch(e){console.error(e);$('pubStatus').textContent='Could not reach the verification network. Refresh to retry.'}finally{if(client.isConnected())await client.disconnect()}}
