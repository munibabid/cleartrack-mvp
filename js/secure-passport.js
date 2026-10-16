/* v14.9 — Secure Passport sharing, Audit Vault, signed printable snapshots (Munib t163u).
   CLIENT/MOCK ONLY. No migration, no DB writes. The access log is off-chain (browser store in the demo).
   IMPORTANT: Veridun Verify is not built. Every "primary-source verified" state handled here is DEMO data
   and is labeled demo:true; the UI must show it as DEMO. Never present real user data as verified.
   Signing uses a clearly labeled DEMO key (HMAC-SHA256). It is public, not secret, and not a production key.
   ZK: predicate stubs only (positioning) — no zero-knowledge proofs are generated. */
(function(root){
'use strict';
const subtle=(root.crypto&&root.crypto.subtle)||(typeof require==='function'?require('crypto').webcrypto.subtle:null);
const DEMO_SIGNING_KEY_ID='veridun-demo-key-1';
const DEMO_SIGNING_KEY_MATERIAL='DEMO-ONLY-PUBLIC-KEY-MATERIAL-NOT-SECRET-NOT-PRODUCTION'; // deliberately public; real signing is server-side (proposal doc)
const ROLES={NURSE:{label:'Nurse',rank:9},RECRUITER:{label:'Recruiter',rank:1},CREDENTIALING:{label:'Credentialing specialist',rank:2},COMPLIANCE_AUDITOR:{label:'Compliance / auditor',rank:3}};
const CATEGORIES={
 LICENSES:{label:'Licenses',minRole:'RECRUITER',defaultOn:true},
 CERTIFICATIONS:{label:'Certifications',minRole:'RECRUITER',defaultOn:true},
 EXPERIENCE:{label:'Employment & experience',minRole:'RECRUITER',defaultOn:true},
 EDUCATION:{label:'Education',minRole:'RECRUITER',defaultOn:true},
 COMPETENCIES:{label:'Skills & competencies',minRole:'RECRUITER',defaultOn:true},
 SENSITIVE_HEALTH:{label:'Health & immunizations',minRole:'CREDENTIALING',defaultOn:false,sensitive:true},
 BACKGROUND:{label:'Background & drug screening',minRole:'CREDENTIALING',defaultOn:false,sensitive:true},
 SOURCE_DOCUMENTS:{label:'Source documents',minRole:'COMPLIANCE_AUDITOR',defaultOn:false,sensitive:true}
};
const DURATIONS={ONE_TIME:{label:'One time'},H24:{label:'24 hours',ms:864e5},D7:{label:'7 days',ms:7*864e5},D30:{label:'30 days',ms:30*864e5},CONTRACT:{label:'Through the contract end'},UNTIL_REVOKED:{label:'Until revoked'}};
const SHARE_MODES={SECURE_LIVE:'Secure live Passport',ASSIGNMENT:'Assignment-specific Passport',PRINTABLE:'Printable / PDF snapshot',AUDIT_PACKET:'Audit packet',QR:'QR code'};

function canon(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return'['+v.map(canon).join(',')+']';return'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}'}
const te=s=>new TextEncoder().encode(s);
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256Hex(s){return hex(await subtle.digest('SHA-256',te(s)))}
let keyP=null;function demoKey(){return keyP||(keyP=subtle.importKey('raw',te(DEMO_SIGNING_KEY_MATERIAL),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']))}
async function demoSign(hashHex){return hex(await subtle.sign('HMAC',await demoKey(),te(hashHex)))}
function randToken(){const a=new Uint8Array(16);(root.crypto||require('crypto').webcrypto).getRandomValues(a);return hex(a)}
function roleAllows(role,cat){const c=CATEGORIES[cat];return!!c&&!!ROLES[role]&&ROLES[role].rank>=ROLES[c.minRole].rank}
function defaultCategories(role){return Object.keys(CATEGORIES).filter(k=>CATEGORIES[k].defaultOn&&roleAllows(role,k))}

/* ---------- recipient-bound grants ---------- */
function computeExpiry(duration,now,contractEnd){const d=DURATIONS[duration];if(!d)throw new Error('Unknown duration');
 if(d.ms)return new Date(now+d.ms).toISOString();if(duration==='CONTRACT'){if(!contractEnd)throw new Error('Contract duration needs an assignment end date');return new Date(contractEnd+'T23:59:59').toISOString()}return null}
function createGrant(o){const now=o.now||Date.now(),role=o.recipient&&o.recipient.role;
 if(!ROLES[role]||role==='NURSE')throw new Error('Recipient role required');
 if(!o.recipient.email)throw new Error('Recipient-bound links need a recipient');
 if(!o.purpose)throw new Error('A purpose is required');
 const cats=o.categories||defaultCategories(role);
 const denied=cats.filter(c=>!roleAllows(role,c));if(denied.length)throw new Error('Role '+role+' cannot receive: '+denied.join(', '));
 return{id:'grant-'+randToken().slice(0,12),token:randToken(),mode:o.mode||'SECURE_LIVE',recipient:{email:String(o.recipient.email).toLowerCase(),role,org:o.recipient.org||''},purpose:o.purpose,
  assignmentId:o.assignmentId||null,duration:o.duration,createdAt:new Date(now).toISOString(),expiresAt:computeExpiry(o.duration,now,o.contractEnd),categories:[...cats],status:'ACTIVE',views:0}}
function grantStatus(g,now=Date.now()){if(g.status==='REVOKED')return'REVOKED';if(g.duration==='ONE_TIME'&&g.views>=1)return'USED';if(g.expiresAt&&now>Date.parse(g.expiresAt))return'EXPIRED';return'ACTIVE'}
function revokeGrant(g,now=Date.now()){return{...g,status:'REVOKED',revokedAt:new Date(now).toISOString()}}
/* Append-only, off-chain access log. Never stores document contents. */
function logEntry(log,e){return Object.freeze([...(log||[]),Object.freeze({seq:(log||[]).length+1,at:new Date(e.now||Date.now()).toISOString(),grantId:e.grantId,actor:e.actor||'',role:e.role||'',action:e.action,result:e.result,reason:e.reason||''})])}
/* Returns {ok, reason, grant (updated), log}. Recipient-bound: the viewer's email and role must match. */
function accessGrant(g,viewer,log,now=Date.now()){
 const st=grantStatus(g,now),deny=r=>({ok:false,reason:r,grant:g,log:logEntry(log,{now,grantId:g.id,actor:viewer.email,role:viewer.role,action:'VIEW',result:'DENIED',reason:r})});
 if(st!=='ACTIVE')return deny(st==='USED'?'ONE_TIME_LINK_ALREADY_USED':st);
 if(String(viewer.email||'').toLowerCase()!==g.recipient.email)return deny('NOT_THE_RECIPIENT');
 if(viewer.role!==g.recipient.role)return deny('ROLE_MISMATCH');
 const ng={...g,views:g.views+1,lastAccessedAt:new Date(now).toISOString()};
 return{ok:true,grant:ng,log:logEntry(log,{now,grantId:g.id,actor:viewer.email,role:viewer.role,action:'VIEW',result:'ALLOWED'})};
}

/* ---------- progressive disclosure view ---------- */
/* passport.items: [{id, label, category, status, demoVerified, version, expires, requirementSatisfied, documentRef}] */
function buildRecipientView(passport,grant,opts={}){
 const reqKinds=opts.assignmentKinds?new Set(opts.assignmentKinds):null;
 const items=passport.items.filter(i=>grant.categories.includes(i.category)&&(!reqKinds||reqKinds.has(i.kind))).map(i=>{
  const cat=CATEGORIES[i.category]||{};
  const base={id:i.id,label:i.label,category:i.category,version:i.version,status:i.status,demo:!!i.demoVerified};
  if(cat.sensitive)return{...base,requirementSatisfied:i.requirementSatisfied?'YES':'NO',details:'withheld',document:'withheld'};
  return{...base,expires:i.expires||null,source:i.source||'',document:grant.categories.includes('SOURCE_DOCUMENTS')&&i.documentRef?{ref:i.documentRef}:'not shared'};
 });
 return{passportId:passport.id,holder:passport.holder,assignmentId:grant.assignmentId,role:grant.recipient.role,purpose:grant.purpose,items,demoNotice:'Verification states are DEMO data — Veridun Verify is not active.'};
}

/* ---------- signed snapshot (printable/PDF) ---------- */
function snapshotBody(passport,o={}){return{type:'VeridunPassportSnapshot',v:1,passportId:passport.id,holder:passport.holder,generatedAt:new Date(o.now||Date.now()).toISOString(),
 assignmentId:o.assignmentId||null,items:passport.items.filter(i=>!o.categories||o.categories.includes(i.category)).filter(i=>!(CATEGORIES[i.category]||{}).sensitive).map(i=>({id:i.id,label:i.label,version:i.version,status:i.status,expires:i.expires||null,demo:!!i.demoVerified})),demo:true}}
async function createSnapshot(passport,o={}){const body=snapshotBody(passport,o),json=canon(body),hash=await sha256Hex(json),signature=await demoSign(hash);
 return{body,canonicalJson:json,sha256:hash,signature:{alg:'HMAC-SHA256',keyId:DEMO_SIGNING_KEY_ID,demoKey:true,value:signature},anchor:o.anchor?{network:'XRPL_DEVNET',mocked:true,anchored:false,ref:'MOCK-'+hash.slice(0,16)}:null}}
/* QR payload: no names, no credential data — only snapshot id/hash and the verification page. */
function qrPayload(snap,verifyBase){return(verifyBase||'')+'?vsnap='+snap.sha256.slice(0,32)}
/* Verify a presented snapshot against its signature and the CURRENT passport.
   Returns state AUTHENTIC_CURRENT | OUTDATED (changed: [...]) | REVOKED | TAMPERED. */
async function verifySnapshot(snap,currentPassport,o={}){
 const json=canon(snap.body),hash=await sha256Hex(json);
 if(hash!==snap.sha256)return{state:'TAMPERED',authentic:false,reason:'Content does not match its hash'};
 if(await demoSign(hash)!==snap.signature.value)return{state:'TAMPERED',authentic:false,reason:'Signature invalid'};
 if(o.revokedSnapshots&&o.revokedSnapshots.includes(hash))return{state:'REVOKED',authentic:true,reason:'This snapshot was revoked by the nurse or Veridun'};
 const cur=new Map((currentPassport.items||[]).map(i=>[i.id,i])),changed=[];
 for(const it of snap.body.items){const c=cur.get(it.id);if(!c)changed.push({id:it.id,label:it.label,change:'removed'});else if(c.version!==it.version||c.status!==it.status)changed.push({id:it.id,label:it.label,change:c.status==='REVOKED'?'revoked':'updated'})}
 if(changed.some(c=>c.change==='revoked'))return{state:'REVOKED',authentic:true,changed,reason:'A credential in this snapshot was revoked'};
 if(changed.length)return{state:'OUTDATED',authentic:true,changed,reason:`${changed.length===1?'One credential':changed.length+' credentials'} changed since this snapshot`};
 return{state:'AUTHENTIC_CURRENT',authentic:true,reason:'Authentic and current'};
}

/* ---------- Audit Vault (per credential, append-only, hash-chained) ---------- */
async function vaultAppend(vault,v){const prev=vault.length?vault[vault.length-1].entryHash:null;
 const body={credentialId:v.credentialId,version:v.version,event:v.event,source:v.source||'',psv:v.psv?{...v.psv,demo:true}:null,verifier:v.verifier||'',at:v.at,evidenceRef:v.evidenceRef||null,supersedes:v.supersedes||null,revokes:v.revokes||null,prevHash:prev};
 const entryHash=await sha256Hex(canon(body));return Object.freeze([...vault,Object.freeze({...body,entryHash})])}
async function vaultIntegrity(vault){let prev=null;for(const e of vault){const{entryHash,...b}=e;if(b.prevHash!==prev||await sha256Hex(canon(b))!==entryHash)return{ok:false,brokenAt:e.version};prev=entryHash}return{ok:true}}
function vaultCurrent(vault){const revoked=new Set(vault.filter(e=>e.revokes!=null).map(e=>e.revokes)),superseded=new Set(vault.filter(e=>e.supersedes!=null).map(e=>e.supersedes));
 const live=vault.filter(e=>e.event!=='REVOKE'&&!revoked.has(e.version)&&!superseded.has(e.version));return live.length?live[live.length-1]:null}
function vaultVersionStatus(vault,version){if(vault.some(e=>e.revokes===version))return'REVOKED';if(vault.some(e=>e.supersedes===version))return'SUPERSEDED';return vaultCurrent(vault)&&vaultCurrent(vault).version===version?'CURRENT':'HISTORICAL'}
/* Evidence references are visible only to roles allowed SOURCE_DOCUMENTS. */
function vaultViewFor(vault,role){const ev=roleAllows(role,'SOURCE_DOCUMENTS')||role==='NURSE';return vault.map(e=>({...e,evidenceRef:ev?e.evidenceRef:(e.evidenceRef?'withheld':null),status:vaultVersionStatus(vault,e.version)}))}

/* ---------- Audit packet: per assignment + role + permissions (never static) ---------- */
async function generateAuditPacket(passport,vaults,grant,o={}){
 const view=buildRecipientView(passport,grant,{assignmentKinds:o.assignmentKinds});
 const entries=view.items.map(i=>({item:i,history:vaults[i.id]?vaultViewFor(vaults[i.id],grant.recipient.role):[]}));
 const body={type:'VeridunAuditPacket',v:1,generatedAt:new Date(o.now||Date.now()).toISOString(),assignmentId:grant.assignmentId,role:grant.recipient.role,recipient:grant.recipient.email,purpose:grant.purpose,categories:[...grant.categories].sort(),entries,demo:true};
 const sha=await sha256Hex(canon(body));return{body,sha256:sha,signature:{alg:'HMAC-SHA256',keyId:DEMO_SIGNING_KEY_ID,demoKey:true,value:await demoSign(sha)}}}

/* ---------- ZK positioning stubs (NOT implemented) ---------- */
const ZK_PREDICATES={HAS_ACTIVE_RN_LICENSE_IN:'Holds an active RN license valid in state X',VERIFIED_SPECIALTY_MONTHS_AT_LEAST:'Has at least N verified months in specialty S',HEALTH_REQUIREMENT_SATISFIED:'Meets health requirement R without revealing records'};
function zkPredicateStub(name){return{predicate:name,description:ZK_PREDICATES[name]||'',implemented:false,note:'Positioning only — no zero-knowledge proof is generated in this version.'}}

const API={ROLES,CATEGORIES,DURATIONS,SHARE_MODES,DEMO_SIGNING_KEY_ID,canon,sha256Hex,roleAllows,defaultCategories,createGrant,grantStatus,revokeGrant,accessGrant,logEntry,buildRecipientView,createSnapshot,qrPayload,verifySnapshot,vaultAppend,vaultIntegrity,vaultCurrent,vaultVersionStatus,vaultViewFor,generateAuditPacket,zkPredicateStub,ZK_PREDICATES};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.SecurePassport=API;
})(typeof window!=='undefined'?window:globalThis);
