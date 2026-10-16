/* v14.9 — Nursing education model (Munib t160u). CLIENT/MOCK ONLY: no DB writes, no migration,
   no external calls. Education is optional and secondary to license, experience and certifications.
   - Degrees: DIPLOMA, ASN (ASN/ADN), BSN, MSN, OTHER. Fields: school, optional graduation date/year.
   - Record-level states (derived): SELF-ATTESTED; DOCUMENT-SUPPORTED (upload present, not confirmed —
     never "verified"); PRIMARY-SOURCE VERIFIED (registrar, university API, official transcript
     verification, National Student Clearinghouse, institution-signed credential).
   - Field-level verification: institution, degreeType, gradDate, program — each with its own source.
   - Source domain is EDUCATION only. Nursys (licensure) is never an education source; neither are
     employment or certification sources.
   - No GPA, coursework or transcripts are collected. Documents stay private/off-chain; only a mock
     attestation hash/proof reference exists. */
(function(root){
'use strict';
const DEGREES={DIPLOMA:{label:'Diploma in Nursing',rank:1},ASN:{label:'ASN / ADN',rank:2},BSN:{label:'BSN',rank:3},MSN:{label:'MSN',rank:4},OTHER:{label:'Other',rank:0}};
const EDU_FIELDS=['institution','degreeType','gradDate','program'];
const PRIMARY_SOURCES=['REGISTRAR','UNIVERSITY_API','OFFICIAL_TRANSCRIPT_VERIFICATION','NATIONAL_STUDENT_CLEARINGHOUSE','INSTITUTION_SIGNED_CREDENTIAL'];
const SUPPORTING_SOURCES=['NURSE_UPLOAD'];
const FORBIDDEN_SOURCE=/nursys|license|board of nursing|employer|employment|certification/i;
const FORBIDDEN_FIELDS=['gpa','coursework','courses','transcript','grades'];
const STATE={SELF:'SELF-ATTESTED',DOC:'DOCUMENT-SUPPORTED',PSV:'PRIMARY-SOURCE VERIFIED'};
const ONBOARDING_COPY={text:'Add your nursing education. Verification may only be required if an employer or assignment requires a specific degree.',actions:['Add education','Skip for now']};
function canon(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return'['+v.map(canon).join(',')+']';return'{'+Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}'}
function mockHash(o){const s=canon(o);let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return'mock:'+h.toString(16).padStart(8,'0')}
function freeze(o){if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(freeze)}return o}
let n=0;
/* claim: {degreeType, institution, program?, gradDate? ('YYYY' or 'YYYY-MM')}. Unknown fields such as GPA are dropped. */
function createEducation(claim,opts={}){
 const c=claim||{};if(!DEGREES[c.degreeType])throw new Error('Unknown degree type');
 return{id:opts.id||`edu-${Date.now().toString(36)}-${++n}`,domain:'EDUCATION',createdAt:opts.at||new Date().toISOString(),
  claim:freeze({degreeType:c.degreeType,degreeOther:c.degreeType==='OTHER'?String(c.degreeOther||''):'',institution:c.institution||'',program:c.program||'',gradDate:c.gradDate||''}),
  documents:[],history:[]};
}
/* Nurse upload: supports, never confirms. Only a private reference is kept (never the file, never on-chain). */
function attachDocument(rec,doc){return{...rec,documents:Object.freeze([...rec.documents,freeze({ref:doc.ref||'private:doc',kind:doc.kind||'DIPLOMA_COPY',uploadedAt:doc.at||new Date().toISOString(),private:true,onChain:false})])}}
/* Append-only education attestation. sourceType must be a primary education source. */
function appendEducationAttestation(rec,a){
 if(FORBIDDEN_SOURCE.test(a.sourceType||'')||FORBIDDEN_SOURCE.test(a.source||''))throw new Error('Not an education source: licensure, employment and certification sources cannot verify education');
 if(!PRIMARY_SOURCES.includes(a.sourceType))throw new Error('Unknown education source type: '+a.sourceType);
 const confirms={};for(const f of EDU_FIELDS)if(a.confirms&&a.confirms[f]!=null&&a.confirms[f]!==false)confirms[f]=a.confirms[f];
 const body={recordId:rec.id,seq:rec.history.length+1,source:a.source||'',sourceType:a.sourceType,verifier:a.verifier||'',verifiedAt:a.at||new Date().toISOString(),fieldsConfirmed:confirms,fieldsDisputed:(a.disputes||[]).filter(f=>EDU_FIELDS.includes(f)),revokes:a.revokes||null};
 const hash=mockHash(body);
 return{...rec,history:Object.freeze([...rec.history,freeze({id:`${rec.id}#${body.seq}`,...body,hashVersion:'mock-fnv1a32-canonical-v0',hash,proofRef:{network:'XRPL_DEVNET',mocked:true,anchored:false,ref:'MOCK-'+hash.slice(5)}})])};
}
function revokeEducationAttestation(rec,id,at){return appendEducationAttestation(rec,{source:'Veridun revocation',sourceType:'REGISTRAR',verifier:'Veridun',revokes:id,at})}
function active(rec){const r=new Set(rec.history.filter(h=>h.revokes).map(h=>h.revokes));return rec.history.filter(h=>!h.revokes&&!r.has(h.id))}
function educationFieldStatuses(rec){const act=active(rec),out={};
 for(const f of EDU_FIELDS){const claimed=!!rec.claim[f];
  if(act.some(h=>h.fieldsDisputed.includes(f))){out[f]={status:'DISPUTED'};continue}
  const v=act.filter(h=>h.fieldsConfirmed[f]!=null).pop();
  if(v){out[f]={status:STATE.PSV,value:v.fieldsConfirmed[f],source:v.source,sourceType:v.sourceType,by:v.id};continue}
  out[f]=claimed?{status:rec.documents.length?STATE.DOC:STATE.SELF,source:rec.documents.length?'Nurse upload (not confirmed)':'Nurse (self)'}:{status:'NOT PROVIDED'};
 }return out}
/* Record state: PRIMARY-SOURCE VERIFIED only when institution AND degree type are confirmed by a primary source. */
function educationState(rec){const s=educationFieldStatuses(rec);
 if(s.institution.status==='DISPUTED'||s.degreeType.status==='DISPUTED')return'DISPUTED';
 if(s.institution.status===STATE.PSV&&s.degreeType.status===STATE.PSV)return STATE.PSV;
 return rec.documents.length?STATE.DOC:STATE.SELF}
function verifiedDegree(rec){if(educationState(rec)!==STATE.PSV)return null;return educationFieldStatuses(rec).degreeType.value}
function rankOf(d){return(DEGREES[d]||{rank:0}).rank}
/* rule: {mode:'REQUIRED'|'PREFERRED'|'NOT_REQUIRED', minDegree:'ASN'|'BSN'|...} or null.
   Results: NOT_APPLICABLE (no rule → education ignored, never "not ready"), PASS, PENDING_EDUCATION_VERIFICATION,
   FAIL (reason), QUALIFIED_PREFERENCE_NOT_MET, QUALIFIED_PREFERENCE_PENDING. */
function evaluateEducationRule(records,rule){
 if(!rule||rule.mode==='NOT_REQUIRED'||!rule.minDegree)return{result:'NOT_APPLICABLE',blocks:false,reason:'No education rule for this assignment; education is not considered.'};
 const min=rankOf(rule.minDegree),recs=records||[];
 const ver=recs.filter(r=>rankOf(verifiedDegree(r))>=min);
 const claimed=recs.filter(r=>educationState(r)!=='DISPUTED'&&rankOf(r.claim.degreeType)>=min);
 const lbl=DEGREES[rule.minDegree].label;
 if(rule.mode==='REQUIRED'){
  if(ver.length)return{result:'PASS',blocks:false,reason:`${lbl} or higher — primary-source verified`,basis:ver[0].id};
  if(claimed.length)return{result:'PENDING_EDUCATION_VERIFICATION',blocks:true,reason:`${lbl} or higher is ${educationState(claimed[0]).toLowerCase()} — awaiting primary-source verification`};
  return{result:'FAIL',blocks:true,reason:recs.length?`Requires ${lbl} or higher; highest on file is ${DEGREES[recs.map(r=>r.claim.degreeType).sort((a,b)=>rankOf(b)-rankOf(a))[0]].label}`:`Requires ${lbl} or higher; no education on file`};
 }
 if(ver.length)return{result:'PASS',blocks:false,reason:`Preferred ${lbl} met — primary-source verified`};
 if(claimed.length)return{result:'QUALIFIED_PREFERENCE_PENDING',blocks:false,reason:`Preferred ${lbl}: claimed, not yet verified (does not block)`};
 return{result:'QUALIFIED_PREFERENCE_NOT_MET',blocks:false,reason:`Qualified — preference not met (prefers ${lbl})`};
}
function educationAnchorPayload(rec,h){return{v:1,hashVersion:h.hashVersion,attestationHash:h.hash,issuer:'Veridun',issuedAt:h.verifiedAt,mocked:true}}
const API={DEGREES,EDU_FIELDS,PRIMARY_SOURCES,SUPPORTING_SOURCES,FORBIDDEN_FIELDS,STATE,ONBOARDING_COPY,createEducation,attachDocument,appendEducationAttestation,revokeEducationAttestation,educationFieldStatuses,educationState,verifiedDegree,evaluateEducationRule,educationAnchorPayload,mockHash};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.Education=API;
})(typeof window!=='undefined'?window:globalThis);
