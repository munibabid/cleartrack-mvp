/* v14.9 — Employment & Specialty Experience model (Munib t159u).
   CLIENT/MOCK ONLY. No database writes, no migration, no external model calls.

   Separates five things that the old "ICU experience: verified by employer" row merged:
     1. what the nurse claims            (episode.claim — resume or nurse entry)
     2. what each source actually proves (episode.history[] — append-only attestations)
     3. which fields are verified         (fieldStatuses(), derived, never stored)
     4. what the blockchain proves        (anchorPayload() — hash + issuer + time + status only; MOCKED)
     5. whether facts meet an assignment  (evaluateExperienceRequirement() — Sentinel/Match preview)

   Rules encoded:
   - Field-level verification: employer, role, dates, specialty. Statuses VERIFIED, CORROBORATED,
     SELF-ATTESTED, UNVERIFIED, DISPUTED (shown as "Disputed / needs review").
   - Evidence levels: A employer HR/API or employer-issued credential; B approved employment
     verification service; C HR letter / manager; D pay records, W-2, contracts, agency records
     (corroborate employment, NEVER specialty); E resume / self-attestation (claim only).
   - A source only proves the fields it explicitly confirms. Specialty is never inferred from the
     nurse's claim; a confirmation of "employment" does not confirm the specialty.
   - Experience totals are calculated only from periods whose employer, RN role, dates AND
     specialty are VERIFIED. Manual totals are never inputs and can never become verified.
   - A resume never creates VERIFIED data: resume records are level E claims.
   - History is append-only: attestations are frozen; revocation is a new entry, never an edit.
   - Nothing private goes on-chain: anchor payloads carry no names, employers, dates or documents. */
(function(root){
'use strict';
const STATUS={VERIFIED:'VERIFIED',CORROBORATED:'CORROBORATED',SELF_ATTESTED:'SELF-ATTESTED',UNVERIFIED:'UNVERIFIED',DISPUTED:'DISPUTED'};
const STATUS_LABEL={VERIFIED:'Verified',CORROBORATED:'Corroborated','SELF-ATTESTED':'Self-attested',UNVERIFIED:'Unverified',DISPUTED:'Disputed / needs review'};
const FIELDS=['employer','role','dates','specialty'];
const EVIDENCE_LEVELS={
 A:{label:'Direct employer HR/API or employer-issued credential',canVerify:['employer','role','dates','specialty']},
 B:{label:'Approved employment verification service',canVerify:['employer','role','dates','specialty']},
 C:{label:'HR letter or manager verification',canVerify:['employer','role','dates','specialty']},
 D:{label:'Pay records, W-2, contracts or agency records',canCorroborate:['employer','role','dates'],canVerify:[]},
 E:{label:'Resume or nurse self-attestation (claim only)',canVerify:[]}
};
/* Specialty families: a requirement for "ICU" may accept these subspecialties. */
const SUBSPECIALTIES={
 ICU:['MICU','SICU','CVICU','Neuro ICU','CCU','Trauma ICU','Burn ICU'],
 ED:['Trauma ED','Pediatric ED'],
 LD:['Labor & Delivery'],
 PCU:['Step-down','Telemetry']
};
const HASH_VERSION='mock-fnv1a32-canonical-v0'; // MOCK integrity hash, replaced by the real attestation hash later

/* ---------- month arithmetic (YYYY-MM) ---------- */
function ym(s){if(!s)return null;const m=/^(\d{4})-(\d{2})/.exec(String(s));if(!m)return null;const y=+m[1],mo=+m[2];if(mo<1||mo>12)return null;return y*12+(mo-1)}
function ymStr(n){return`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`}
function asOfMonth(asOf){return ym(asOf||new Date().toISOString().slice(0,7))}
/* Inclusive month set for [start,end]; end null = present (asOf). */
function monthSet(start,end,asOf){const s=ym(start),e=end?ym(end):asOfMonth(asOf);const out=new Set();if(s==null||e==null||e<s)return out;for(let i=s;i<=Math.min(e,asOfMonth(asOf));i++)out.add(i);return out}

/* ---------- canonical JSON + mock hash ---------- */
function canon(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return'['+v.map(canon).join(',')+']';return'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}'}
function mockHash(obj){const s=canon(obj);let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return'mock:'+h.toString(16).padStart(8,'0')}
function deepFreeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(deepFreeze)}return o}

/* ---------- specialty matching ---------- */
function specialtyMatches(value,family,accepted){
 if(!value)return false;
 const fam=family||'',acc=accepted&&accepted.length?accepted:null;
 if(acc)return acc.includes(value)||(value===fam&&acc.includes(fam));
 return value===fam||(SUBSPECIALTIES[fam]||[]).includes(value);
}

/* ---------- episodes ---------- */
let seqCounter=0;
function newId(p){seqCounter++;return`${p}-${Date.now().toString(36)}-${seqCounter}`}
/* claim: {employer, role, specialty, subspecialty, start, end} as the nurse/resume states it.
   origin: NURSE_ENTRY | RESUME | EMPLOYER_CREDENTIAL. A claim is never verification. */
function createEpisode(claim,origin='NURSE_ENTRY',opts={}){
 const c=claim||{};
 const ep={id:opts.id||newId('emp'),origin,createdAt:opts.at||new Date().toISOString(),
  claim:deepFreeze({employer:c.employer||'',role:c.role||'',specialty:c.specialty||'',subspecialty:c.subspecialty||'',start:c.start||'',end:c.end||null}),
  history:[]};
 // The claim itself is recorded as a level E entry so the provenance trail starts with what was claimed.
 return appendAttestation(ep,{source:origin==='RESUME'?'Resume (nurse-reviewed extraction)':'Nurse entry',verifier:'Nurse (self)',evidenceLevel:'E',evidenceType:origin==='RESUME'?'RESUME':'SELF_ATTESTATION',confirms:{},at:ep.createdAt});
}
/* Append one attestation. Returns a NEW episode object; the previous history entries are frozen and
   reused unchanged (append-only). `confirms` = exactly what the source proves:
     {employer:'Name', role:'RN', dates:{start,end}, specialty:'ICU'|'CVICU'|..., }  (omit = not confirmed)
   `disputes` = fields the source contradicts. Level D cannot confirm specialty: it is recorded under
   `notProvable`, never under confirmed. Level E confirms nothing. */
function appendAttestation(ep,a){
 const lvl=EVIDENCE_LEVELS[a.evidenceLevel];if(!lvl)throw new Error('Unknown evidence level: '+a.evidenceLevel);
 const confirms={},notProvable=[],raw=a.confirms||{};
 for(const f of FIELDS){if(raw[f]==null||raw[f]===false)continue;
  const allowed=(lvl.canVerify||[]).includes(f)||(lvl.canCorroborate||[]).includes(f);
  if(allowed)confirms[f]=f==='dates'?{start:raw.dates.start||'',end:raw.dates.end||null}:raw[f];else notProvable.push(f)}
 const seq=ep.history.length+1;
 const body={episodeId:ep.id,seq,source:a.source||'',verifier:a.verifier||'',verifiedAt:a.at||new Date().toISOString(),evidenceLevel:a.evidenceLevel,evidenceType:a.evidenceType||'',
  fieldsConfirmed:confirms,fieldsDisputed:(a.disputes||[]).filter(f=>FIELDS.includes(f)),notProvable,
  supersedes:a.supersedes||null,revokes:a.revokes||null,issuerCredential:a.issuerCredential||null,note:a.note||''};
 const hash=mockHash(body);
 const entry=deepFreeze({id:a.id||`${ep.id}#${seq}`,...body,hashVersion:HASH_VERSION,hash,
  proofRef:a.evidenceLevel==='E'?null:{network:'XRPL_DEVNET',mocked:true,ref:'MOCK-'+hash.slice(5),anchored:false},
  revocationStatus:'ACTIVE'});
 return{...ep,history:Object.freeze([...ep.history,entry])};
}
/* Revocation is itself an appended entry; the revoked entry is not edited. */
function revokeAttestation(ep,entryId,reason,at){
 const t=ep.history.find(h=>h.id===entryId);if(!t)throw new Error('No such attestation');
 return appendAttestation(ep,{source:'Veridun revocation',verifier:'Veridun',evidenceLevel:'E',evidenceType:'REVOCATION',revokes:entryId,note:reason||'',at});
}
function revokedIds(ep){return new Set(ep.history.filter(h=>h.revokes).map(h=>h.revokes))}
function activeEntries(ep){const r=revokedIds(ep);return ep.history.filter(h=>!r.has(h.id)&&!h.revokes)}
function entryRevocationStatus(ep,h){return revokedIds(ep).has(h.id)?'REVOKED':'ACTIVE'}

/* ---------- field status derivation ---------- */
function fieldStatuses(ep){
 const act=activeEntries(ep),out={};
 for(const f of FIELDS){
  const claimed=f==='dates'?!!ep.claim.start:f==='specialty'?!!(ep.claim.subspecialty||ep.claim.specialty):!!ep.claim[f];
  if(act.some(h=>h.fieldsDisputed.includes(f))){out[f]={status:STATUS.DISPUTED,by:act.filter(h=>h.fieldsDisputed.includes(f)).map(h=>h.id)};continue}
  const ver=act.filter(h=>h.fieldsConfirmed[f]!=null&&(EVIDENCE_LEVELS[h.evidenceLevel].canVerify||[]).includes(f));
  if(ver.length){const best=ver.slice().sort((x,y)=>x.evidenceLevel.localeCompare(y.evidenceLevel)||y.seq-x.seq)[0];out[f]={status:STATUS.VERIFIED,level:best.evidenceLevel,value:best.fieldsConfirmed[f],by:best.id};continue}
  const cor=act.filter(h=>h.fieldsConfirmed[f]!=null&&(EVIDENCE_LEVELS[h.evidenceLevel].canCorroborate||[]).includes(f));
  if(cor.length){const best=cor[cor.length-1];out[f]={status:STATUS.CORROBORATED,level:best.evidenceLevel,value:best.fieldsConfirmed[f],by:best.id};continue}
  out[f]=claimed?{status:STATUS.SELF_ATTESTED,level:'E'}:{status:STATUS.UNVERIFIED};
 }
 return out;
}
/* The specialty value used for claimed totals is the nurse's claim; for verified totals it is ONLY
   the value a source confirmed. */
function claimedSpecialty(ep){return ep.claim.subspecialty||ep.claim.specialty}
function isRnRole(v){return/\b(RN|registered nurse)\b/i.test(String(v||''))}
function verifiedPeriod(ep){
 const s=fieldStatuses(ep);
 if(s.employer.status!==STATUS.VERIFIED||s.role.status!==STATUS.VERIFIED||s.dates.status!==STATUS.VERIFIED||s.specialty.status!==STATUS.VERIFIED)return null;
 if(!isRnRole(s.role.value))return null;
 return{start:s.dates.value.start,end:s.dates.value.end,specialty:s.specialty.value};
}

/* ---------- experience calculation ---------- */
/* family: 'ICU'; accepted: optional subspecialty list. lookback default 24 months.
   Months are unions of inclusive calendar months, so overlapping episodes are not double counted. */
function calculateExperience(episodes,family,opts={}){
 const asOf=opts.asOf,acc=opts.accepted||null,lb=opts.lookbackMonths||24,now=asOfMonth(asOf);
 const claimed=new Set(),verified=new Set();const contributing=[];
 for(const ep of episodes||[]){
  if(specialtyMatches(claimedSpecialty(ep),family,acc))monthSet(ep.claim.start,ep.claim.end,asOf).forEach(m=>claimed.add(m));
  const vp=verifiedPeriod(ep);
  if(vp&&specialtyMatches(vp.specialty,family,acc)){const ms=monthSet(vp.start,vp.end,asOf);ms.forEach(m=>verified.add(m));contributing.push({id:ep.id,months:ms.size})}
 }
 const recent=[...verified].filter(m=>m>now-lb&&m<=now).length;
 const last=verified.size?Math.max(...verified):null;
 return{family,accepted:acc,asOf:ymStr(now),claimedMonths:claimed.size,verifiedMonths:verified.size,recentVerifiedMonths:recent,lookbackMonths:lb,
  lastVerifiedMonth:last==null?null:ymStr(last),monthsSinceLastVerified:last==null?null:now-last,contributing};
}
function monthsText(n){if(n==null)return'—';const y=Math.floor(n/12),m=n%12;return[y?`${y} year${y===1?'':'s'}`:'',m||!y?`${m} month${m===1?'':'s'}`:''].filter(Boolean).join(' ')}

/* ---------- Sentinel / Match preview (separate from Passport facts) ---------- */
/* req: {label, specialty, acceptedSubspecialties?, minTotalMonths?, minRecentMonths?, recentLookbackMonths?, lastWorkedWithinMonths?} */
function evaluateExperienceRequirement(episodes,req,opts={}){
 const x=calculateExperience(episodes,req.specialty,{asOf:opts.asOf,accepted:req.acceptedSubspecialties,lookbackMonths:req.recentLookbackMonths||24});
 const rules=[];
 if(req.minTotalMonths!=null)rules.push({rule:'MIN_TOTAL',text:`≥${req.minTotalMonths} total verified ${req.specialty} months`,required:req.minTotalMonths,available:x.verifiedMonths,pass:x.verifiedMonths>=req.minTotalMonths});
 if(req.minRecentMonths!=null)rules.push({rule:'MIN_RECENT',text:`≥${req.minRecentMonths} verified ${req.specialty} months in the last ${x.lookbackMonths}`,required:req.minRecentMonths,available:x.recentVerifiedMonths,pass:x.recentVerifiedMonths>=req.minRecentMonths});
 if(req.lastWorkedWithinMonths!=null){const ok=x.monthsSinceLastVerified!=null&&x.monthsSinceLastVerified<=req.lastWorkedWithinMonths;
  rules.push({rule:'LAST_WORKED',text:`Verified ${req.specialty} work within the last ${req.lastWorkedWithinMonths} months`,required:req.lastWorkedWithinMonths,available:x.monthsSinceLastVerified,pass:ok,unit:'months ago'})}
 rules.forEach(r=>{r.gap=r.pass?0:r.rule==='LAST_WORKED'?(r.available==null?null:r.available-r.required):r.required-r.available});
 const pass=rules.length>0&&rules.every(r=>r.pass);
 return{label:req.label||'',requirement:req,experience:x,rules,status:rules.length?(pass?'QUALIFIED':'NOT_YET_QUALIFIED'):'NO_RULES',
  claimedOnlyMonths:Math.max(0,x.claimedMonths-x.verifiedMonths)};
}

/* ---------- resume (MOCK extractor; no external model) ---------- */
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
function parseMonth(s){s=String(s||'').trim();if(/^present|current|now$/i.test(s))return null;let m=/^(\d{4})-(\d{1,2})$/.exec(s);if(m)return`${m[1]}-${String(+m[2]).padStart(2,'0')}`;
 m=/^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);if(m&&MONTHS[m[1].slice(0,4).toLowerCase()]||m&&MONTHS[m[1].slice(0,3).toLowerCase()])return`${m[2]}-${String(MONTHS[m[1].slice(0,4).toLowerCase()]||MONTHS[m[1].slice(0,3).toLowerCase()]).padStart(2,'0')}`;
 m=/^(\d{1,2})\/(\d{4})$/.exec(s);if(m)return`${m[2]}-${String(+m[1]).padStart(2,'0')}`;return undefined}
const ALL_SUBS=Object.entries(SUBSPECIALTIES).flatMap(([f,l])=>l.map(s=>[s,f]));
/* Deterministic, MOCK resume extraction. Recognizes lines like
     "Sharp Memorial Hospital | ICU RN | Jan 2023 – Aug 2025"
     "Hospital XYZ | Registered Nurse, CVICU | 06/2022 - Present"
   Returns DRAFTS for nurse review; drafts are never episodes and carry status SELF-REPORTED. */
function mockExtractResume(text){
 const drafts=[];
 for(const line of String(text||'').split(/\r?\n/)){
  const parts=line.split('|').map(s=>s.trim());if(parts.length<3)continue;
  const dm=/^(.+?)\s*[–—-]\s*(.+)$/.exec(parts[parts.length-1]);if(!dm)continue;
  const start=parseMonth(dm[1]),end=parseMonth(dm[2]);if(!start||end===undefined)continue;
  const roleText=parts.slice(1,-1).join(' ');let sub='',fam='';
  for(const[s,f]of ALL_SUBS.sort((a,b)=>b[0].length-a[0].length))if(new RegExp('\\b'+s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(roleText)){sub=s;fam=f;break}
  if(!fam)for(const f of Object.keys(SUBSPECIALTIES))if(new RegExp('\\b'+f+'\\b','i').test(roleText)){fam=f;break}
  drafts.push({employer:parts[0],role:isRnRole(roleText)?'RN':roleText,specialty:fam,subspecialty:sub,start,end,status:'SELF-REPORTED',extractor:'MOCK_RESUME_EXTRACTOR_v0',confidence:'Please check'});
 }
 return{extractor:'MOCK_RESUME_EXTRACTOR_v0',externalModelCalled:false,drafts};
}
/* After the nurse reviews/corrects each draft, records are created as level E claims. Any
   attempt to pass verification data through this path is ignored. */
function episodesFromReviewedResume(reviewed,at){return(reviewed||[]).filter(d=>d&&d.accepted!==false).map(d=>createEpisode({employer:d.employer,role:d.role,specialty:d.specialty,subspecialty:d.subspecialty,start:d.start,end:d.end},'RESUME',{at}))}

/* ---------- employer-issued signed credentials (data shape; MOCK validation) ---------- */
/* Shape: {type:'EmployerEmploymentCredential', version:'0', issuer:{name, id}, subjectRef,
           claims:{role, specialty, subspecialty, start, end}, issuedAt,
           proof:{type, verificationMethod, signature}}
   validator(vc) must return {valid:true, issuerTrusted:true} from a real signature/issuer check.
   Without a passing validation, nothing is verified: the credential is recorded as a claim needing review. */
function importEmployerCredential(ep,vc,validator,at){
 const v=validator?validator(vc):{valid:false,issuerTrusted:false,reason:'No validator'};
 const ref={type:vc.type,issuer:vc.issuer,issuedAt:vc.issuedAt,proofType:vc.proof&&vc.proof.type,validation:{valid:!!v.valid,issuerTrusted:!!v.issuerTrusted,reason:v.reason||'',mocked:!!v.mocked}};
 if(!(v.valid&&v.issuerTrusted))return appendAttestation(ep,{source:`Employer-issued credential from ${vc.issuer&&vc.issuer.name} (signature not validated)`,verifier:'Veridun',evidenceLevel:'E',evidenceType:'EMPLOYER_CREDENTIAL_UNVALIDATED',issuerCredential:ref,note:'Signature/issuer not validated: recorded as a claim; needs review.',at});
 const c=vc.claims||{};
 return appendAttestation(ep,{source:`Employer-issued credential: ${vc.issuer.name}`,verifier:vc.issuer.name,evidenceLevel:'A',evidenceType:'EMPLOYER_SIGNED_CREDENTIAL',issuerCredential:ref,
  confirms:{employer:vc.issuer.name,role:c.role,dates:c.start?{start:c.start,end:c.end||null}:null,specialty:c.subspecialty||c.specialty||null},at});
}

/* ---------- on-chain payload (MOCK; privacy) ---------- */
/* Only what XRPL is allowed to prove: this attestation existed, when, issued by Veridun, unaltered,
   and its revocation status. No nurse name, employer, role, dates, documents or PII. */
function anchorPayload(ep,entry){return{v:1,hashVersion:entry.hashVersion,attestationHash:entry.hash,issuer:'Veridun',issuedAt:entry.verifiedAt,status:entryRevocationStatus(ep,entry),mocked:true}}

/* ---------- UI wording ---------- */
function fieldPhrase(f,st,specialtyValue){
 const sp=specialtyValue||'Specialty';
 const name={employer:'Employment',role:'RN role',dates:'Employment dates',specialty:`${sp} specialty`}[f];
 if(st.status===STATUS.VERIFIED)return`${name} verified`;
 if(st.status===STATUS.CORROBORATED)return`${name} corroborated (supporting records, not verified)`;
 if(st.status===STATUS.DISPUTED)return`${name} disputed — needs review`;
 if(st.status===STATUS.SELF_ATTESTED)return f==='specialty'?`${sp} specialty based on nurse attestation`:`${name} self-reported — awaiting verification`;
 return`${name} not verified`;
}

const API={STATUS,STATUS_LABEL,FIELDS,EVIDENCE_LEVELS,SUBSPECIALTIES,HASH_VERSION,ym,ymStr,monthSet,canon,mockHash,specialtyMatches,createEpisode,appendAttestation,revokeAttestation,activeEntries,entryRevocationStatus,
 fieldStatuses,verifiedPeriod,calculateExperience,monthsText,evaluateExperienceRequirement,mockExtractResume,episodesFromReviewedResume,importEmployerCredential,anchorPayload,fieldPhrase,isRnRole,claimedSpecialty};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.EmploymentExperience=API;
})(typeof window!=='undefined'?window:globalThis);
