/* Credential catalog: the single source of truth for RN credential kinds,
   US jurisdictions (state-level licensure), issuers, privacy policy and
   Nurse Licensure Compact (NLC) rules. Everything else (Add Credential form,
   readiness engine, requirement templates, verification console) reads
   from this data — nothing is hardcoded to a particular state.

   Scope: registered nurses, US-first. International jurisdictions are deferred.
   Jurisdiction codes use country + region: "US-MA", "US-TX", ...

   REFERENCE DATA FOR THE DEMO — not an authoritative licensure source.
   Board names: Nursys "Nurse License Verification" jurisdiction list.
   NLC status: NCSBN NLC map / Nursys NLC participation, checked 2026-10-08.
     IMPLEMENTED: multistate (compact) licenses from other NLC states are
                  honored here AND residents can hold a multistate license.
     PARTIAL:     compact licenses are honored here, but residents cannot
                  yet obtain a multistate license (Guam).
     PENDING:     NLC enacted, not yet operational — compact licenses are
                  NOT honored yet (Massachusetts: targeted May 2027; USVI).
     null:        not an NLC jurisdiction. */
const CATALOG_AS_OF='2026-10-08';

const US_JURISDICTIONS=[
 ['US-AL','Alabama','Alabama Board of Nursing','IMPLEMENTED'],
 ['US-AK','Alaska','Alaska Board of Nursing',null],
 ['US-AZ','Arizona','Arizona State Board of Nursing','IMPLEMENTED'],
 ['US-AR','Arkansas','Arkansas State Board of Nursing','IMPLEMENTED'],
 ['US-CA','California','California Board of Registered Nursing',null],
 ['US-CO','Colorado','Colorado Board of Nursing','IMPLEMENTED'],
 ['US-CT','Connecticut','Connecticut Board of Examiners for Nursing','IMPLEMENTED'],
 ['US-DE','Delaware','Delaware Board of Nursing','IMPLEMENTED'],
 ['US-DC','District of Columbia','District of Columbia Board of Nursing',null],
 ['US-FL','Florida','Florida Board of Nursing','IMPLEMENTED'],
 ['US-GA','Georgia','Georgia Board of Nursing','IMPLEMENTED'],
 ['US-HI','Hawaii','Hawaii Board of Nursing',null],
 ['US-ID','Idaho','Idaho Board of Nursing','IMPLEMENTED'],
 ['US-IL','Illinois','Illinois Board of Nursing',null],
 ['US-IN','Indiana','Indiana State Board of Nursing','IMPLEMENTED'],
 ['US-IA','Iowa','Iowa Board of Nursing','IMPLEMENTED'],
 ['US-KS','Kansas','Kansas State Board of Nursing','IMPLEMENTED'],
 ['US-KY','Kentucky','Kentucky Board of Nursing','IMPLEMENTED'],
 ['US-LA','Louisiana','Louisiana State Board of Nursing','IMPLEMENTED'],
 ['US-ME','Maine','Maine State Board of Nursing','IMPLEMENTED'],
 ['US-MD','Maryland','Maryland Board of Nursing','IMPLEMENTED'],
 ['US-MA','Massachusetts','Massachusetts Board of Registration in Nursing','PENDING'],
 ['US-MI','Michigan','Michigan Board of Nursing',null],
 ['US-MN','Minnesota','Minnesota Board of Nursing',null],
 ['US-MS','Mississippi','Mississippi Board of Nursing','IMPLEMENTED'],
 ['US-MO','Missouri','Missouri State Board of Nursing','IMPLEMENTED'],
 ['US-MT','Montana','Montana Board of Nursing','IMPLEMENTED'],
 ['US-NE','Nebraska','Nebraska Board of Nursing','IMPLEMENTED'],
 ['US-NV','Nevada','Nevada State Board of Nursing',null],
 ['US-NH','New Hampshire','New Hampshire Board of Nursing','IMPLEMENTED'],
 ['US-NJ','New Jersey','New Jersey Board of Nursing','IMPLEMENTED'],
 ['US-NM','New Mexico','New Mexico Board of Nursing','IMPLEMENTED'],
 ['US-NY','New York','New York State Board of Nursing',null],
 ['US-NC','North Carolina','North Carolina Board of Nursing','IMPLEMENTED'],
 ['US-ND','North Dakota','North Dakota Board of Nursing','IMPLEMENTED'],
 ['US-OH','Ohio','Ohio Board of Nursing','IMPLEMENTED'],
 ['US-OK','Oklahoma','Oklahoma Board of Nursing','IMPLEMENTED'],
 ['US-OR','Oregon','Oregon State Board of Nursing',null],
 ['US-PA','Pennsylvania','Pennsylvania State Board of Nursing','IMPLEMENTED'],
 ['US-RI','Rhode Island','Rhode Island Board of Nurse Registration and Nursing Education','IMPLEMENTED'],
 ['US-SC','South Carolina','South Carolina Board of Nursing','IMPLEMENTED'],
 ['US-SD','South Dakota','South Dakota Board of Nursing','IMPLEMENTED'],
 ['US-TN','Tennessee','Tennessee State Board of Nursing','IMPLEMENTED'],
 ['US-TX','Texas','Texas Board of Nursing','IMPLEMENTED'],
 ['US-UT','Utah','Utah Board of Nursing and Certified Nurse Midwives','IMPLEMENTED'],
 ['US-VT','Vermont','Vermont State Board of Nursing','IMPLEMENTED'],
 ['US-VA','Virginia','Virginia Board of Nursing','IMPLEMENTED'],
 ['US-WA','Washington','Washington State Board of Nursing','IMPLEMENTED'],
 ['US-WV','West Virginia','West Virginia Board of Registered Nurses','IMPLEMENTED'],
 ['US-WI','Wisconsin','Wisconsin Department of Safety and Professional Services','IMPLEMENTED'],
 ['US-WY','Wyoming','Wyoming State Board of Nursing','IMPLEMENTED'],
 ['US-AS','American Samoa','American Samoa Health Services Regulatory Board',null],
 ['US-GU','Guam','Guam Board of Nurse Examiners','PARTIAL'],
 ['US-MP','Northern Mariana Islands','Northern Mariana Islands Board of Nursing',null],
 ['US-PR','Puerto Rico','Puerto Rico nursing licensing board',null],
 ['US-VI','U.S. Virgin Islands','Virgin Islands Board of Nurse Licensure','PENDING']
].map(([code,name,issuer,nlc])=>({code,name,issuer,nlc,country:'US'}));

/* privacy:
     SHAREABLE — the verified assertion (not the document) can be shared
                 selectively and may receive an optional XRPL proof.
     PRIVATE   — health/screening results: provenance recorded off-chain only,
                 never put on-chain; shared only as a status if required.
   Source documents are ALWAYS private, for every kind.
   readiness:false — shown on the Passport as Additional Professional
                 Qualifications; never drives RN assignment readiness unless
                 an organization explicitly adds it to a requirement set. */
const CREDENTIAL_CATALOG=[
 {kind:'RN_LICENSE',label:'RN License — single-state',category:'Licenses',section:'Licenses & Certifications',privacy:'SHAREABLE',jurisdiction:'REQUIRED',source:'STATE_BOARD',keywords:'registered nurse license state board'},
 {kind:'RN_LICENSE_MULTISTATE',label:'RN License — multistate (NLC compact)',category:'Licenses',section:'Licenses & Certifications',privacy:'SHAREABLE',jurisdiction:'NLC_HOME',source:'STATE_BOARD',keywords:'compact nlc multistate home state'},
 {kind:'CERT_BLS',label:'BLS — Basic Life Support',short:'BLS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AHA / approved certification issuer'},
 {kind:'CERT_ACLS',label:'ACLS — Advanced Cardiovascular Life Support',short:'ACLS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AHA / approved certification issuer'},
 {kind:'CERT_PALS',label:'PALS — Pediatric Advanced Life Support',short:'PALS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AHA / approved certification issuer'},
 {kind:'CERT_NIHSS',label:'NIHSS — Stroke Scale',short:'NIHSS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Certification issuer'},
 {kind:'CERT_TNCC',label:'TNCC — Trauma Nursing Core Course',short:'TNCC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'ENA'},
 {kind:'CERT_NRP',label:'NRP — Neonatal Resuscitation',short:'NRP',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AAP'},
 {kind:'CERT_CCRN',label:'CCRN — Critical Care RN certification',short:'CCRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AACN Certification Corporation'},
 {kind:'CERT_CEN',label:'CEN — Certified Emergency Nurse',short:'CEN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'BCEN'},
 {kind:'EMP_ICU_VERIFIED',label:'ICU Experience (employer verified, recent)',short:'ICU Experience',recencyMonths:24,category:'Employment & HR',section:'Screening & Employment',privacy:'SHAREABLE',issuer:'Employer / HR verification'},
 {kind:'EMP_ED_VERIFIED',label:'ED Experience (employer verified, recent)',short:'ED Experience',recencyMonths:24,category:'Employment & HR',section:'Screening & Employment',privacy:'SHAREABLE',issuer:'Employer / HR verification',keywords:'emergency department er'},
 {kind:'EMP_LD_VERIFIED',label:'Labor & Delivery Experience (employer verified, recent)',short:'L&D Experience',recencyMonths:24,category:'Employment & HR',section:'Screening & Employment',privacy:'SHAREABLE',issuer:'Employer / HR verification',keywords:'l&d labor delivery ob obstetrics'},
 {kind:'EMP_MEDSURG_VERIFIED',label:'Med-Surg Experience (employer verified, recent)',short:'Med-Surg Experience',recencyMonths:24,category:'Employment & HR',section:'Screening & Employment',privacy:'SHAREABLE',issuer:'Employer / HR verification',keywords:'medical surgical'},
 {kind:'CERT_FETAL_MONITORING',label:'Fetal Heart Monitoring certification',short:'Fetal Monitoring',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Fetal monitoring course provider',keywords:'efm fhm fetal heart monitoring l&d ob'},
 {kind:'SKILLS_ICU',label:'ICU Skills Checklist (completed, attested)',short:'ICU Skills Checklist',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Clinician attestation · skills checklist',keywords:'skills checklist critical care'},
 {kind:'SKILLS_ED',label:'ED Skills Checklist (completed, attested)',short:'ED Skills Checklist',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Clinician attestation · skills checklist',keywords:'skills checklist emergency er'},
 {kind:'SKILLS_LD',label:'L&D Skills Checklist (completed, attested)',short:'L&D Skills Checklist',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Clinician attestation · skills checklist',keywords:'skills checklist labor delivery ob'},
 {kind:'SKILLS_MEDSURG',label:'Med-Surg Skills Checklist (completed, attested)',short:'Med-Surg Skills Checklist',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Clinician attestation · skills checklist',keywords:'skills checklist medical surgical'},
 {kind:'COMP_CRRT',label:'CRRT Competency (continuous renal replacement therapy)',short:'CRRT Competency',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Employer competency validation',keywords:'competency dialysis renal'},
 {kind:'COMP_VENTILATOR',label:'Ventilator Management Competency',short:'Ventilator Competency',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Employer competency validation',keywords:'competency vent mechanical ventilation'},
 {kind:'REF_SPECIALTY',label:'Specialty Reference Evaluation (manager or charge nurse)',short:'Specialty Reference',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'PRIVATE',issuer:'Reference evaluation (specialty manager)',keywords:'reference evaluation manager charge nurse'},
 {kind:'EDU_BSN',label:'BSN — Bachelor of Science in Nursing',short:'BSN Education',category:'Education',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'School / registrar'},
 {kind:'EDU_ADN',label:'ADN — Associate Degree in Nursing',short:'ADN Education',category:'Education',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'School / registrar'},
 {kind:'EDU_CLINICAL_VERIFICATION',label:'Clinical education verification (school, optional)',short:'Clinical Education Verification',category:'Education',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'School / registrar',keywords:'clinical hours school education'},
 {kind:'HEALTH_TB_CURRENT',label:'TB Screening',short:'TB Screening',category:'Employee Health',section:'Health & Immunizations',privacy:'PRIVATE',issuer:'Occupational health / lab'},
 {kind:'HEALTH_FLU_CURRENT',label:'Influenza Vaccine',short:'Influenza Vaccine',category:'Employee Health',section:'Health & Immunizations',privacy:'PRIVATE',issuer:'Occupational health / provider'},
 {kind:'HEALTH_HEPB',label:'Hepatitis B Immunity',short:'Hepatitis B',category:'Employee Health',section:'Health & Immunizations',privacy:'PRIVATE',issuer:'Occupational health / lab'},
 {kind:'HEALTH_PHYSICAL_CURRENT',label:'Physical Exam',short:'Physical Exam',category:'Employee Health',section:'Health & Immunizations',privacy:'PRIVATE',issuer:'Occupational health provider'},
 {kind:'HEALTH_FIT_TEST',label:'N95 Fit Test',short:'N95 Fit Test',category:'Employee Health',section:'Health & Immunizations',privacy:'PRIVATE',issuer:'Occupational health / employer'},
 {kind:'SCREEN_DRUG_CURRENT',label:'Drug Screen',short:'Drug Screen',category:'Background & Screening',section:'Screening & Employment',privacy:'PRIVATE',issuer:'Background screening vendor'},
 {kind:'SCREEN_BACKGROUND_CURRENT',label:'Background Check',short:'Background Check',category:'Background & Screening',section:'Screening & Employment',privacy:'PRIVATE',issuer:'Background screening vendor'},
 {kind:'QUAL_MSN',label:'MSN — Master of Science in Nursing',short:'MSN',category:'Additional Professional Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'School / registrar',readiness:false},
 {kind:'QUAL_DNP',label:'DNP — Doctor of Nursing Practice (education)',short:'DNP',category:'Additional Professional Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'School / registrar',readiness:false},
 {kind:'QUAL_SPECIALTY_CERT',label:'Other specialty nursing certification',short:'Specialty Certification',category:'Additional Professional Qualifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Certifying body',readiness:false},
 {kind:'OTHER',label:'Other (enter name and type)',category:'Submitted Credentials',section:'Clinical Requirements',privacy:'PRIVATE',issuer:'Issuer'}
];

/* Requirement kind that is satisfied by any license authorizing RN practice
   in a jurisdiction (single-state license there, or a multistate license
   whose privilege is honored there). */
const RN_AUTHORIZATION='RN_AUTHORIZATION';

const _jurByCode=Object.fromEntries(US_JURISDICTIONS.map(j=>[j.code,j]));
const _kindByCode=Object.fromEntries(CREDENTIAL_CATALOG.map(k=>[k.kind,k]));
function jurisdiction(code){return _jurByCode[normalizeJurisdictionCode(code)]||null}
function catalogKind(kind){return _kindByCode[kind]||null}
/* Accepts legacy "US_MA" as well as "US-MA". */
function normalizeJurisdictionCode(code){if(!code)return'';const c=String(code).trim().toUpperCase().replace('_','-');return c}
function jurisdictionName(code){return jurisdiction(code)?.name||code||''}
function jurisdictionOptionLabel(j){return `${j.name} (${j.code})`}
function nlcHonorsCompactIn(code){const n=jurisdiction(code)?.nlc;return n==='IMPLEMENTED'||n==='PARTIAL'}
function nlcCanIssueMultistate(code){return jurisdiction(code)?.nlc==='IMPLEMENTED'}
function nlcStatusLabel(code){return({IMPLEMENTED:'NLC member',PARTIAL:'NLC — partial implementation',PENDING:'NLC enacted, not yet in effect'})[jurisdiction(code)?.nlc]||'Not an NLC jurisdiction'}
function multistateHomeJurisdictions(){return US_JURISDICTIONS.filter(j=>j.nlc==='IMPLEMENTED')}
function catalogPrivacy(kind){return catalogKind(kind)?.privacy||'PRIVATE'}
function countsForReadiness(kind){return catalogKind(kind)?.readiness!==false}
function credentialDisplayName(kind,jur,fallback){const k=catalogKind(kind);if(kind==='RN_LICENSE')return`${jurisdictionName(jur)} RN License`;if(kind==='RN_LICENSE_MULTISTATE')return`Multistate RN License (NLC · home: ${jurisdictionName(jur)})`;if(kind==='OTHER'||!k)return fallback||'Credential';return k.short||k.label}
/* Machine-readable type (also used as the XRPL CredentialType). */
function credentialTypeCode(kind,jur){return(kind==='RN_LICENSE'||kind==='RN_LICENSE_MULTISTATE')?`${kind}:${normalizeJurisdictionCode(jur)}`:kind}
function issuerFor(kind,jur){if(kind==='RN_LICENSE'||kind==='RN_LICENSE_MULTISTATE')return jurisdiction(jur)?.issuer||'State board of nursing';return catalogKind(kind)?.issuer||'Issuer'}
function requirementLabel(r){if(r.kind===RN_AUTHORIZATION)return`${jurisdictionName(r.jurisdiction)} RN License`;return catalogKind(r.kind)?.short||catalogKind(r.kind)?.label||r.kind}
/* Searchable-dropdown resolution: accepts the option label, the code, or a
   unique case-insensitive partial match. */
function resolveCatalogKind(text){const t=String(text||'').trim().toLowerCase();if(!t)return null;return CREDENTIAL_CATALOG.find(k=>k.label.toLowerCase()===t||k.kind.toLowerCase()===t)||_unique(CREDENTIAL_CATALOG.filter(k=>(k.label+' '+(k.keywords||'')+' '+k.kind).toLowerCase().includes(t)))}
function resolveJurisdiction(text,list=US_JURISDICTIONS){const t=String(text||'').trim().toLowerCase();if(!t)return null;return list.find(j=>jurisdictionOptionLabel(j).toLowerCase()===t||j.code.toLowerCase()===t||j.name.toLowerCase()===t||j.code.slice(3).toLowerCase()===t)||_unique(list.filter(j=>jurisdictionOptionLabel(j).toLowerCase().includes(t)))}
function _unique(a){return a.length===1?a[0]:null}
