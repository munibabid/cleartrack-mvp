/* Requirement sets (data-driven). An assignment = a requirement template +
   the jurisdiction where the RN will practice. The jurisdiction becomes an
   RN_AUTHORIZATION requirement, which a single-state license there OR an
   honored NLC multistate license can satisfy (see readiness-engine.js).
   Organizations would define these templates; here they are demo data. */
const REQUIREMENT_TEMPLATES=[
 {id:'TRAVEL_ICU_RN',name:'Travel ICU RN',kinds:['CERT_BLS','CERT_ACLS','CERT_NIHSS','EMP_ICU_VERIFIED','HEALTH_PHYSICAL_CURRENT','HEALTH_FIT_TEST','SCREEN_DRUG_CURRENT','SCREEN_BACKGROUND_CURRENT','HEALTH_TB_CURRENT','HEALTH_FLU_CURRENT','CLINICAL_HOURS_VERIFIED']},
 {id:'STRIKE_ICU_RN',name:'Strike ICU RN',kinds:['CERT_BLS','CERT_ACLS','EMP_ICU_VERIFIED','SCREEN_BACKGROUND_CURRENT','SCREEN_DRUG_CURRENT','HEALTH_PHYSICAL_CURRENT','HEALTH_FIT_TEST','CLINICAL_HOURS_VERIFIED']},
 {id:'RAPID_RESPONSE_RN',name:'Rapid Response RN',kinds:['CERT_BLS','CERT_ACLS','EMP_ICU_VERIFIED','SCREEN_BACKGROUND_CURRENT','SCREEN_DRUG_CURRENT','HEALTH_TB_CURRENT','HEALTH_FIT_TEST']},
 {id:'PER_DIEM_RN',name:'Per-Diem RN',kinds:['CERT_BLS','SCREEN_BACKGROUND_CURRENT','SCREEN_DRUG_CURRENT','HEALTH_TB_CURRENT','HEALTH_FLU_CURRENT']}
];
function requirementTemplate(id){return REQUIREMENT_TEMPLATES.find(t=>t.id===id)||null}
function templateRequirements(templateId,jur){const t=requirementTemplate(templateId);if(!t)return[];return[{kind:RN_AUTHORIZATION,jurisdiction:normalizeJurisdictionCode(jur)},...t.kinds.map(kind=>({kind}))]}

/* Newcomer onboarding baseline (clinician Home): the Travel ICU RN kinds plus
   one RN license. A credential's `required` flag marks baseline items. */
const NEWCOMER_BASELINE_KINDS=[...requirementTemplate('TRAVEL_ICU_RN').kinds];
function isBaselineRequired(kind){if(!NEWCOMER_BASELINE_KINDS.includes(kind))return false;return!creds.some(c=>c.required&&c.kind===kind)}
/* XRPL proof is NOT required — a verified, active, unexpired credential counts. */
function reqSatisfied(c){if(!c.required)return true;if(c.primary!=='VERIFIED'||!c.prov?.active)return false;const exp=c.official_expiration_date||c.expiration;return!(exp&&new Date(exp+'T23:59:59')<new Date())}
function onboarding(){const req=creds.filter(c=>c.required),ok=req.filter(reqSatisfied).length,pct=req.length?Math.round(ok/req.length*100):0;return{req,ok,pct,ready:req.length>0&&ok===req.length}}
