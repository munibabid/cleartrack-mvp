/* Credential model: shared state, persistence, formatting and status helpers.
   NOTE: plain <script> files share the global scope, so `creds` and these
   helpers are visible to every other js/ file. Load this file first. */
const $=x=>document.getElementById(x);
const SK='nursecredx_v2';
let creds=[],filter='all',verifyId=null;
function v81Normalize(c){c.uploaded=c.uploaded??!!c.file;c.jurisdiction=c.jurisdiction||(c.type==='RN_CA_ACTIVE'?'US_CA':'');c.official_expiration_date=c.official_expiration_date||c.expiration||'';c.recommended_refresh_date=c.recommended_refresh_date||'';c.verification_method=c.verification_method||c.prov?.method||'';c.last_verified_date=c.last_verified_date||(c.prov?.verifiedAt?c.prov.verifiedAt.slice(0,10):'');c.last_monitored_date=c.last_monitored_date||(c.prov?.lastMonitored?c.prov.lastMonitored.slice(0,10):'');return c}
function v81Type(kind,jur){if(kind==='RN_LICENSE'){if(jur==='US_CA')return'RN_CA_ACTIVE';if(jur==='NLC')return'RN_COMPACT_ACTIVE';return'RN_LICENSE'}return kind}
function v81Name(kind,jur){const m={CERT_BLS:'BLS',CERT_ACLS:'ACLS',CERT_NIHSS:'NIHSS',CERT_CCRN:'CCRN',EDU_BSN:'BSN Education',EMP_ICU_VERIFIED:'ICU Experience'};if(kind==='RN_LICENSE'){const j={US_CA:'California',US_MA:'Massachusetts',US_TX:'Texas',US_FL:'Florida',NLC:'Compact'}[jur]||'';return(j?j+' ':'')+'RN License'}return m[kind]||$('nm').value.trim()||'Credential'}
function save(){localStorage.setItem(SK,JSON.stringify(creds))}
function ec(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function cls(s){return String(s).replaceAll(' ','')}
function fd(d){return d?new Date(d+'T00:00:00').toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'—'}
function eligible(c){return c.primary==='VERIFIED'&&!c.privateOnly&&c.chain==='NOT ISSUED'}
function userChain(c){if(c.privateOnly)return 'PRIVATE';if(c.chain==='ACCEPTED')return 'CREDENTIAL SECURED';if(c.chain==='XRPL ISSUED')return 'SECURING';if(c.chain==='REVOKED')return 'REVOKED';return 'NOT SECURED'}
function userChainClass(c){if(c.privateOnly)return 'PRIVATE';if(c.chain==='ACCEPTED')return 'ACCEPTED';if(c.chain==='XRPL ISSUED')return 'PENDING';if(c.chain==='REVOKED')return 'REVOKED';return 'NOTISSUED'}
function catFor(c){const n=(c.name+' '+c.type).toUpperCase();if(n.includes('RN_')||n.includes('LICENSE'))return 'Licenses';if(n.includes('CERT_')||n.includes('BLS')||n.includes('ACLS')||n.includes('NIHSS')||n.includes('CCRN'))return 'Certifications';if(n.includes('EDU_')||n.includes('EDUCATION'))return 'Education';if(n.includes('EMP_')||n.includes('EMPLOYMENT'))return 'Employment & HR';if(n.includes('HEALTH_')||n.includes('TB')||n.includes('PHYSICAL')||n.includes('FIT TEST')||n.includes('INFLUENZA'))return 'Employee Health';if(n.includes('SCREEN_')||n.includes('BACKGROUND')||n.includes('DRUG'))return 'Background & Screening';if(n.includes('CLINICAL')||n.includes('SKILL_')||n.includes('COMPETENCY'))return 'Clinical Qualifications';return 'Submitted Credentials'}
