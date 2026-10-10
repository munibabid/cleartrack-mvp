/* Credential model: shared state, persistence, formatting and status helpers.
   NOTE: plain <script> files share the global scope, so `creds` and these
   helpers are visible to every other js/ file. Load this file first. */
const $=x=>document.getElementById(x);
const SK='nursecredx_v2';
let creds=[],filter='all';
/* Normalizes a stored credential and migrates legacy records (PR 1 and
   earlier used types like RN_CA_ACTIVE and jurisdictions like US_MA).
   Privacy is ALWAYS derived from the catalog (no user checkbox), and source
   documents are always private. */
const LEGACY_TYPE_KIND={RN_CA_ACTIVE:['RN_LICENSE','US-CA'],RN_MA_ACTIVE:['RN_LICENSE','US-MA'],RN_COMPACT_ACTIVE:['RN_LICENSE_MULTISTATE','']};
function legacyKind(c){if(LEGACY_TYPE_KIND[c.type])return LEGACY_TYPE_KIND[c.type];if(c.type==='RN_LICENSE')return['RN_LICENSE',c.jurisdiction||''];if(catalogKind(c.type))return[c.type,''];const base=String(c.type||'').split(':')[0];if(catalogKind(base))return[base,String(c.type).split(':')[1]||''];return['OTHER','']}
function v81Normalize(c){if(!c.kind){const[k,j]=legacyKind(c);c.kind=k;if(j&&!c.jurisdiction)c.jurisdiction=j}/* v14.5: one RN License kind; older multistate entries become RN_LICENSE + compact_privilege_type */if(c.kind==='RN_LICENSE_MULTISTATE'){c.kind='RN_LICENSE';c.compact_privilege_type='MULTISTATE'}if(c.kind==='RN_LICENSE'&&!c.compact_privilege_type)c.compact_privilege_type='SINGLE_STATE';c.jurisdiction=normalizeJurisdictionCode(c.jurisdiction);if(c.jurisdiction==='NLC')c.jurisdiction='';c.privateOnly=catalogPrivacy(c.kind)==='PRIVATE';c.documentPrivacy='PRIVATE';c.uploaded=c.uploaded??!!c.file;c.official_expiration_date=c.official_expiration_date||c.expiration||'';c.recommended_refresh_date=c.recommended_refresh_date||'';c.verification_method=c.verification_method||c.prov?.method||'';c.last_verified_date=c.last_verified_date||(c.prov?.verifiedAt?c.prov.verifiedAt.slice(0,10):'');c.last_monitored_date=c.last_monitored_date||(c.prov?.lastMonitored?c.prov.lastMonitored.slice(0,10):'');return c}
/* t150u: the RN license label is RENDERED from structured fields (kind + state + scope). Stored names,
   including historical ones such as "Multistate RN License (NLC · home: …)", are never rewritten, and no
   logic reads type, state or scope back out of a label. */
function credLabel(c){if(!c)return'';if((c.kind==='RN_LICENSE'||c.kind==='RN_LICENSE_MULTISTATE')&&c.jurisdiction)return credentialDisplayName('RN_LICENSE',c.jurisdiction,c.name,licenseScopeOf(c));return c.name||''}
function save(){store.credentials.save(creds)}
function ec(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function cls(s){return String(s).replaceAll(' ','')}
function fd(d){return d?new Date(d+'T00:00:00').toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'—'}
function eligible(c){return c.primary==='VERIFIED'&&!c.privateOnly&&c.chain==='NOT ISSUED'}
/* v14.6: a pending proof transaction older than 30 s (see js/xrpl.js) */
function proofIsStale(c){return typeof proofStale==='function'?proofStale(c):!!(c.proofPending&&Date.now()-new Date(c.proofPending.startedAt).getTime()>30000)}
function userChain(c){if(c.privateOnly)return 'PRIVATE';if(c.chain==='ACCEPTED')return 'PROOF ADDED';if(c.proofPending)return proofIsStale(c)?'PROOF DELAYED — RETRYING':'PROOF IN PROGRESS';if(c.chain==='XRPL ISSUED')return 'PROOF IN PROGRESS';if(c.chain==='SECURING')return 'PROOF ISSUED — ACCEPT TO FINISH';if(c.chain==='REVOKED')return 'PROOF REVOKED';return 'NO PROOF (OPTIONAL)'}
/* Handoff §50: verification status is the primary badge. Every verification
   in this demo is a demo seed or a simulated check, so VERIFIED reads
   "VERIFIED · DEMO". The optional XRPL proof is a quiet secondary label. */
function verificationBadge(c){
 /* v14.4: skills checklists are self-attested by the nurse and never shown as verified */
 if(/^SKILLS_/.test(String(c.kind||''))&&c.primary==='VERIFIED')return{cls:'PENDING',text:'SELF-ATTESTED · NOT VERIFIED'};
 if(c.primary==='VERIFIED'&&c.prov?.active){const l=typeof credentialLevel==='function'?credentialLevel(c):null;return{cls:'VERIFIED',text:(l?levelLabel(l).toUpperCase():'VERIFIED')+' · DEMO'}}
 if(c.primary==='VERIFIED')return{cls:'PENDING',text:'NEEDS RE-VERIFICATION'};
 if(c.primary==='VERIFYING')return{cls:'PENDING',text:'PENDING VERIFICATION'};
 if(c.primary==='REVOKED')return{cls:'REVOKED',text:'REVOKED BY ISSUER · DEMO'};
 if(c.primary==='REJECTED')return{cls:'REVOKED',text:'REJECTED AFTER REVIEW'};
 if(c.primary==='EXPIRED')return{cls:'REVOKED',text:'EXPIRED'};
 if(c.primary==='UNVERIFIED')return{cls:'PENDING',text:'PENDING'};
 return{cls:cls(c.primary),text:String(c.primary||'—')};
}
function verificationBadgeHtml(c){const b=verificationBadge(c);return`<span class="badge ${b.cls}">${ec(b.text)}</span>`}
function proofLabel(c){if(c.privateOnly)return'Proof: n/a (private)';if(c.chain==='ACCEPTED')return'Proof: added ✓';if(c.proofPending)return proofIsStale(c)?'Proof delayed — retrying':'Proof in progress';if(c.chain==='XRPL ISSUED')return'Proof in progress';if(c.chain==='SECURING')return'Proof issued — accept to finish';if(c.proofNote&&c.chain==='NOT ISSUED')return'Proof didn\'t go through — try again';if(c.chain==='REVOKED')return'Proof: revoked';return'Proof: optional'}
function proofLabelHtml(c){return`<span class="proof-label-v84">${ec(proofLabel(c))}</span>`}
function userChainClass(c){if(c.privateOnly)return 'PRIVATE';if(c.chain==='ACCEPTED')return 'ACCEPTED';if(c.chain==='XRPL ISSUED'||c.chain==='SECURING')return 'PENDING';if(c.chain==='REVOKED')return 'REVOKED';return 'NOTISSUED'}
function catFor(c){const k=catalogKind(c.kind);if(k&&c.kind!=='OTHER')return k.category;const n=(c.name+' '+c.type).toUpperCase();if(n.includes('RN_')||n.includes('LICENSE'))return 'Licenses';if(n.includes('CERT_'))return 'Certifications';if(n.includes('EDU_'))return 'Education';if(n.includes('EMP_'))return 'Employment & HR';if(n.includes('HEALTH_'))return 'Employee Health';if(n.includes('SCREEN_'))return 'Background & Screening';if(n.includes('CLINICAL'))return 'Clinical Qualifications';return 'Submitted Credentials'}
