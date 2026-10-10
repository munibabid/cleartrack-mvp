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
/* Specialty certifications and courses (PR 11): real names and the bodies
   that issue them, so specialty modules can require or prefer them.
   Verification in the demo is always simulated; in accounts nothing is
   verified until a real verifier checks it. */
const SPECIALTY_CERT_KINDS=[
 {kind:'CERT_ENPC',label:'ENPC — Emergency Nursing Pediatric Course',short:'ENPC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'ENA',keywords:'pediatric emergency course'},
 {kind:'CERT_STABLE',label:'S.T.A.B.L.E. Program (neonatal post-resuscitation / pre-transport)',short:'STABLE',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'The S.T.A.B.L.E. Program',keywords:'neonatal nicu stable'},
 {kind:'CERT_ABLS',label:'ABLS — Advanced Burn Life Support',short:'ABLS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'American Burn Association',keywords:'burn'},
 {kind:'CERT_ATCN',label:'ATCN — Advanced Trauma Care for Nurses',short:'ATCN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Society of Trauma Nurses',keywords:'trauma'},
 {kind:'CERT_PCCN',label:'PCCN — Progressive Care Certified Nurse',short:'PCCN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AACN Certification Corporation',keywords:'progressive care step-down pcu'},
 {kind:'CERT_CMC',label:'CMC — Cardiac Medicine Certification (specialty)',short:'CMC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AACN Certification Corporation',keywords:'cardiac medicine ccu'},
 {kind:'CERT_CSC',label:'CSC — Cardiac Surgery Certification (specialty)',short:'CSC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AACN Certification Corporation',keywords:'cardiac surgery cvicu'},
 {kind:'CERT_CPEN',label:'CPEN — Certified Pediatric Emergency Nurse',short:'CPEN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'BCEN',keywords:'pediatric emergency'},
 {kind:'CERT_TCRN',label:'TCRN — Trauma Certified Registered Nurse',short:'TCRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'BCEN',keywords:'trauma'},
 {kind:'CERT_CFRN',label:'CFRN — Certified Flight Registered Nurse',short:'CFRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'BCEN',keywords:'flight transport'},
 {kind:'CERT_CTRN',label:'CTRN — Certified Transport Registered Nurse',short:'CTRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'BCEN',keywords:'ground transport'},
 {kind:'CERT_CNRN',label:'CNRN — Certified Neuroscience Registered Nurse',short:'CNRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'American Board of Neuroscience Nursing (ABNN)',keywords:'neuro neuroscience'},
 {kind:'CERT_SCRN',label:'SCRN — Stroke Certified Registered Nurse',short:'SCRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'American Board of Neuroscience Nursing (ABNN)',keywords:'stroke neuro'},
 {kind:'CERT_CMSRN',label:'CMSRN — Certified Medical-Surgical Registered Nurse',short:'CMSRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Medical-Surgical Nursing Certification Board (MSNCB)',keywords:'med-surg medical surgical'},
 {kind:'CERT_ONC_ORTHO',label:'ONC — Orthopaedic Nurse Certified',short:'ONC (Orthopaedic)',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Orthopaedic Nurses Certification Board (ONCB)',keywords:'orthopedic ortho'},
 {kind:'CERT_CCTN',label:'CCTN — Certified Clinical Transplant Nurse',short:'CCTN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'American Board for Transplant Certification (ABTC)',keywords:'transplant'},
 {kind:'CERT_CNOR',label:'CNOR — Certified Perioperative Nurse',short:'CNOR',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Competency & Credentialing Institute (CCI)',keywords:'operating room perioperative or'},
 {kind:'CERT_CPAN',label:'CPAN — Certified Post Anesthesia Nurse',short:'CPAN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'ABPANC',keywords:'pacu post anesthesia'},
 {kind:'CERT_CAPA',label:'CAPA — Certified Ambulatory Perianesthesia Nurse',short:'CAPA',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'ABPANC',keywords:'pre-op ambulatory perianesthesia'},
 {kind:'CERT_RCIS',label:'RCIS — Registered Cardiovascular Invasive Specialist',short:'RCIS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Cardiovascular Credentialing International (CCI)',keywords:'cath lab invasive cardiology'},
 {kind:'CERT_CEPS',label:'CEPS — Certified Electrophysiology Specialist',short:'CEPS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'International Board of Heart Rhythm Examiners (IBHRE)',keywords:'ep lab electrophysiology'},
 {kind:'CERT_CRN_RAD',label:'CRN — Certified Radiology Nurse',short:'CRN (Radiology)',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Radiologic and Imaging Nursing Certification Board (RINCB)',keywords:'interventional radiology ir imaging'},
 {kind:'CERT_CGRN',label:'CGRN — Certified Gastroenterology Registered Nurse',short:'CGRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'American Board of Certification for Gastroenterology Nurses (ABCGN)',keywords:'endoscopy gi'},
 {kind:'CERT_RNC_OB',label:'RNC-OB — Inpatient Obstetric Nursing',short:'RNC-OB',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'National Certification Corporation (NCC)',keywords:'obstetric l&d labor'},
 {kind:'CERT_C_EFM',label:'C-EFM — Electronic Fetal Monitoring',short:'C-EFM',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'National Certification Corporation (NCC)',keywords:'fetal monitoring efm'},
 {kind:'CERT_RNC_MNN',label:'RNC-MNN — Maternal Newborn Nursing',short:'RNC-MNN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'National Certification Corporation (NCC)',keywords:'postpartum mother baby couplet'},
 {kind:'CERT_RNC_NIC',label:'RNC-NIC — Neonatal Intensive Care Nursing',short:'RNC-NIC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'National Certification Corporation (NCC)',keywords:'nicu neonatal'},
 {kind:'CERT_RNC_LRN',label:'RNC-LRN — Low Risk Neonatal Nursing',short:'RNC-LRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'National Certification Corporation (NCC)',keywords:'nursery neonatal low risk'},
 {kind:'CERT_IBCLC',label:'IBCLC — International Board Certified Lactation Consultant',short:'IBCLC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'IBLCE',keywords:'lactation breastfeeding'},
 {kind:'CERT_CPN',label:'CPN — Certified Pediatric Nurse',short:'CPN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Pediatric Nursing Certification Board (PNCB)',keywords:'pediatric peds'},
 {kind:'CERT_CHEMO',label:'ONS/ONCC Chemotherapy Immunotherapy Certificate',short:'Chemo/Biotherapy',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Oncology Nursing Society (ONS)',keywords:'chemotherapy biotherapy immunotherapy chemo provider card oncology'},
 {kind:'CERT_OCN',label:'OCN — Oncology Certified Nurse',short:'OCN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Oncology Nursing Certification Corporation (ONCC)',keywords:'oncology'},
 {kind:'CERT_CPHON',label:'CPHON — Certified Pediatric Hematology Oncology Nurse',short:'CPHON',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Oncology Nursing Certification Corporation (ONCC)',keywords:'pediatric oncology hematology'},
 {kind:'CERT_BMTCN',label:'BMTCN — Blood & Marrow Transplant Certified Nurse',short:'BMTCN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Oncology Nursing Certification Corporation (ONCC)',keywords:'bone marrow transplant bmt'},
 {kind:'CERT_CRNI',label:'CRNI — Certified Registered Nurse Infusion',short:'CRNI',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Infusion Nurses Certification Corporation (INCC)',keywords:'infusion iv'},
 {kind:'CERT_CNN',label:'CNN — Certified Nephrology Nurse',short:'CNN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Nephrology Nursing Certification Commission (NNCC)',keywords:'nephrology dialysis renal'},
 {kind:'CERT_CDN',label:'CDN — Certified Dialysis Nurse',short:'CDN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Nephrology Nursing Certification Commission (NNCC)',keywords:'dialysis'},
 {kind:'CERT_CRISIS_INTERVENTION',label:'Crisis intervention / de-escalation training (CPI Nonviolent Crisis Intervention, MAB or equivalent)',short:'CPI / MAB',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Crisis Prevention Institute (CPI) / MAB or equivalent provider',keywords:'cpi mab de-escalation behavioral psych crisis'},
 {kind:'CERT_PMH_BC',label:'PMH-BC — Psychiatric-Mental Health Nursing board certification',short:'PMH-BC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'ANCC',keywords:'psychiatric mental health psych'},
 {kind:'CERT_CARN',label:'CARN — Certified Addictions Registered Nurse',short:'CARN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Addictions Nursing Certification Board (ANCB)',keywords:'addiction substance use detox'},
 {kind:'CERT_COS_C',label:'COS-C — OASIS Specialist-Clinical',short:'COS-C',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'OASIS Certificate and Competency Board (OCCB)',keywords:'home health oasis'},
 {kind:'CERT_CHPN',label:'CHPN — Certified Hospice and Palliative Nurse',short:'CHPN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Hospice and Palliative Credentialing Center (HPCC)',keywords:'hospice palliative'},
 {kind:'CERT_GERO_BC',label:'GERO-BC — Gerontological Nursing board certification',short:'GERO-BC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'ANCC',keywords:'gerontology geriatric long term care'},
 {kind:'CERT_CRRN',label:'CRRN — Certified Rehabilitation Registered Nurse',short:'CRRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Rehabilitation Nursing Certification Board (RNCB)',keywords:'rehabilitation rehab'},
 {kind:'CERT_AMB_BC',label:'AMB-BC — Ambulatory Care Nursing board certification',short:'AMB-BC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'ANCC',keywords:'ambulatory clinic telehealth'},
 {kind:'CERT_CCHP_RN',label:'CCHP-RN — Certified Correctional Health Professional, RN',short:'CCHP-RN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'National Commission on Correctional Health Care (NCCHC)',keywords:'correctional jail prison'},
 {kind:'CERT_STATE_SCHOOL_NURSE',label:'State school nurse certificate (in states that require one)',short:'School Nurse Certificate',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'State department of education',keywords:'school nurse'},
 {kind:'CERT_NCSN',label:'NCSN — Nationally Certified School Nurse',short:'NCSN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'National Board for Certification of School Nurses (NBCSN)',keywords:'school nurse'},
 {kind:'CERT_COHN',label:'COHN — Certified Occupational Health Nurse',short:'COHN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'American Board for Occupational Health Nurses (ABOHN)',keywords:'occupational employee health'},
 {kind:'CERT_CAOHC',label:'CAOHC Occupational Hearing Conservationist',short:'CAOHC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Council for Accreditation in Occupational Hearing Conservation (CAOHC)',keywords:'hearing audiometry occupational'},
 {kind:'CERT_WOCN',label:'WOCNCB certification (CWOCN, CWCN, COCN or CCCN)',short:'Wound/Ostomy Certification',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Wound, Ostomy and Continence Nursing Certification Board (WOCNCB)',keywords:'wound ostomy continence cwocn cwcn'},
 {kind:'CERT_VA_BC',label:'VA-BC — Vascular Access Board Certified',short:'VA-BC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Vascular Access Certification Corporation (VACC)',keywords:'vascular access picc iv team'},
 {kind:'CERT_CDCES',label:'CDCES — Certified Diabetes Care and Education Specialist',short:'CDCES',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Certification Board for Diabetes Care and Education (CBDCE)',keywords:'diabetes educator cde'},
 {kind:'CERT_SANE',label:'SANE-A / SANE-P — Sexual Assault Nurse Examiner',short:'SANE-A / SANE-P',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'International Association of Forensic Nurses (IAFN)',keywords:'forensic sexual assault'},
 {kind:'CERT_CIC',label:'CIC — Certification in Infection Prevention and Control',short:'CIC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Certification Board of Infection Control and Epidemiology (CBIC)',keywords:'infection prevention control'},
 {kind:'CERT_ACM_RN',label:'ACM-RN — Accredited Case Manager',short:'ACM-RN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'American Case Management Association (ACMA)',keywords:'case management utilization review'},
 {kind:'CERT_CCM',label:'CCM — Certified Case Manager',short:'CCM',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Commission for Case Manager Certification (CCMC)',keywords:'case management'},
 {kind:'CERT_NI_BC',label:'NI-BC — Informatics Nursing board certification',short:'NI-BC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'ANCC',keywords:'informatics'}
];
/* Experience + skills-checklist kinds, generated for every specialty in
   js/specialties.js. Plain wording (PR 11): "ICU experience: verified by an
   employer, within the last 2 years". recencyMonths/minMonths are only the
   defaults; each requirement (and each organization) can set its own. */
function specialtyCredentialKinds(){
 const w=SPECIALTY_EXPERIENCE_DEFAULT.windowMonths,m=SPECIALTY_EXPERIENCE_DEFAULT.minMonths;
 return[
  ...SPECIALTIES.map(s=>({kind:s.expKind,label:`${s.short} experience: verified by an employer, within the last ${monthsText(w)}`,short:`${s.short} Experience`,recencyMonths:w,minMonths:m,experience:true,specialty:s.id,category:'Employment & HR',section:'Screening & Employment',privacy:'SHAREABLE',issuer:'Employer / HR verification',keywords:'experience employment verification '+s.keywords})),
  ...SPECIALTIES.map(s=>({kind:s.skillsKind,label:`${s.short} Skills Checklist (completed, attested)`,short:`${s.short} Skills Checklist`,specialty:s.id,category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Clinician attestation · skills checklist',keywords:'skills checklist '+s.keywords}))
 ];
}
/* Help text shown in Add Credential forms for experience kinds. */
function experienceHelpText(kind){const k=catalogKind(kind);if(!k?.experience)return'';return`Recent means you worked in this specialty within the last ${k.recencyMonths} months. Verified means a current or past employer confirms your unit, role, and dates, through an HR employment verification letter, a manager reference, or a verification service.`}

const CREDENTIAL_CATALOG=[
 {kind:'RN_LICENSE',label:'RN License',category:'Licenses',section:'Licenses & Certifications',privacy:'SHAREABLE',jurisdiction:'REQUIRED',source:'STATE_BOARD',keywords:'registered nurse license state board single-state multistate compact nlc primary state of residence'},
 /* v14.5: legacy kind. New licenses are RN_LICENSE + compact_privilege_type (MULTISTATE | SINGLE_STATE);
    old RN_LICENSE_MULTISTATE entries are still read (as RN_LICENSE, multistate) but never offered in a picker. */
 {kind:'RN_LICENSE_MULTISTATE',legacy:true,label:'RN License (multistate, older entry)',category:'Licenses',section:'Licenses & Certifications',privacy:'SHAREABLE',jurisdiction:'NLC_HOME',source:'STATE_BOARD',keywords:'compact nlc multistate home state primary state of residence'},
 {kind:'CERT_BLS',label:'BLS — Basic Life Support',short:'BLS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AHA / approved certification issuer'},
 {kind:'CERT_ACLS',label:'ACLS — Advanced Cardiovascular Life Support',short:'ACLS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AHA / approved certification issuer'},
 {kind:'CERT_PALS',label:'PALS — Pediatric Advanced Life Support',short:'PALS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AHA / approved certification issuer'},
 {kind:'CERT_NIHSS',label:'NIHSS — Stroke Scale',short:'NIHSS',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'Certification issuer'},
 {kind:'CERT_TNCC',label:'TNCC — Trauma Nursing Core Course',short:'TNCC',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'ENA'},
 {kind:'CERT_NRP',label:'NRP — Neonatal Resuscitation',short:'NRP',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AAP'},
 {kind:'CERT_CCRN',label:'CCRN — Critical Care RN certification',short:'CCRN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AACN Certification Corporation'},
 {kind:'CERT_CEN',label:'CEN — Certified Emergency Nurse',short:'CEN',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'BCEN'},
 {kind:'CERT_FETAL_MONITORING',label:'AWHONN Fetal Heart Monitoring course (Intermediate or Advanced)',short:'Fetal Monitoring',category:'Certifications',section:'Licenses & Certifications',privacy:'SHAREABLE',issuer:'AWHONN',keywords:'efm fhm fetal heart monitoring l&d ob awhonn'},
 ...SPECIALTY_CERT_KINDS,
 ...specialtyCredentialKinds(),
 {kind:'COMP_CRRT',label:'CRRT Competency (continuous renal replacement therapy)',short:'CRRT Competency',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Employer competency validation',keywords:'competency dialysis renal'},
 {kind:'COMP_VENTILATOR',label:'Ventilator Management Competency',short:'Ventilator Competency',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Employer competency validation',keywords:'competency vent mechanical ventilation'},
 {kind:'COMP_DYSRHYTHMIA',label:'Dysrhythmia / EKG interpretation competency (employer validated)',short:'Dysrhythmia Competency',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Employer competency validation',keywords:'competency ekg ecg rhythm telemetry'},
 {kind:'COMP_MODERATE_SEDATION',label:'Moderate (procedural) sedation competency (employer validated)',short:'Moderate Sedation Competency',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'SHAREABLE',issuer:'Employer competency validation',keywords:'competency conscious sedation procedural'},
 {kind:'REF_SPECIALTY',notCredential:true,label:'Professional references (manager or charge nurse)',short:'References',category:'Clinical Qualifications',section:'Clinical Requirements',privacy:'PRIVATE',issuer:'Reference evaluation (specialty manager)',keywords:'reference evaluation manager charge nurse'},
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
 {kind:'DOC_DRIVER_LICENSE_AUTO',label:"Driver's license and auto insurance (for home visits)",short:"Driver's License & Auto Insurance",category:'Background & Screening',section:'Screening & Employment',privacy:'PRIVATE',issuer:'State DMV / auto insurer',keywords:'driver license car insurance home visits'},
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
function nlcStatusLabel(code){return({IMPLEMENTED:'Nurse Licensure Compact state',PARTIAL:'Compact: partly in effect',PENDING:'Compact enacted, not yet in effect'})[jurisdiction(code)?.nlc]||'Not in the Nurse Licensure Compact'}
function multistateHomeJurisdictions(){return US_JURISDICTIONS.filter(j=>j.nlc==='IMPLEMENTED')}
function catalogPrivacy(kind){return catalogKind(kind)?.privacy||'PRIVATE'}
function countsForReadiness(kind){return catalogKind(kind)?.readiness!==false}
/* v14.5: one RN License type. The license scope (multistate vs single-state) is compact_privilege_type,
   stored with the license; RN_LICENSE_MULTISTATE is only read for older entries. */
const COMPACT_PRIVILEGE_TYPES=['MULTISTATE','SINGLE_STATE'];
/* v14.7: references are not credentials (notCredential): they live only in the References section. */
function pickerCatalog(){return CREDENTIAL_CATALOG.filter(k=>!k.legacy&&!k.notCredential)}
function licenseScopeOf(c){
 if(!c)return null;if(c.kind==='RN_LICENSE_MULTISTATE')return'MULTISTATE';if(c.kind!=='RN_LICENSE')return null;
 const v=c.compact_privilege_type||c.metadata?.compact_privilege_type;return v==='MULTISTATE'?'MULTISTATE':'SINGLE_STATE';
}
/* the kind the compact rules use: multistate licenses (either storage) → RN_LICENSE_MULTISTATE */
function licenseRuleKind(c){return licenseScopeOf(c)==='MULTISTATE'?'RN_LICENSE_MULTISTATE':c?.kind}
/* a shared assertion has kind + label only (no metadata): a multistate RN_LICENSE is named
   "<State> RN License · Multistate" (v14.8) or, in entries saved before v14.8, "Multistate RN License …". */
function assertionLicenseRuleKind(x){const l=x.label||'';return x.kind==='RN_LICENSE'&&(/ · Multistate$/.test(l)||/^Multistate RN License/.test(l))?'RN_LICENSE_MULTISTATE':x.kind}
/* The one license-scope explanation (v14.5). It talks about the LICENSE's state; the primary state of
   residence is mentioned only to explain that multistate licenses come from it. */
function licenseScopeInfo(jur,home,scope){
 const j=jurisdiction(jur),h=jurisdiction(home);if(!j)return{choice:false,scope:null,lines:[]};
 const lines=[];
 if(!nlcCanIssueMultistate(j.code)){
  const why=j.nlc==='PARTIAL'?`${j.name} honors compact licenses from other states but can't issue multistate licenses yet`:j.nlc==='PENDING'?`${j.name} has enacted the Nurse Licensure Compact, but it can't issue multistate licenses yet`:`${j.name} isn't in the Nurse Licensure Compact`;
  lines.push(`Single-state: ${why}, so a ${j.name} license covers ${j.name} only.`);
  if(h&&h.code!==j.code)lines.push(`Multistate licenses are issued by your primary state of residence (${h.name}). This license is from ${j.name}, so it covers ${j.name} only.`);
  return{choice:false,scope:'SINGLE_STATE',lines};
 }
 if(h&&h.code!==j.code)lines.push(`Multistate licenses are issued by your primary state of residence (${h.name}). This license is from ${j.name}, so it is usually single-state (${j.name} only). Choose multistate only if the license says so, or update your primary state of residence.`);
 else if(!h)lines.push(`${j.name} is a compact state: its licenses can be multistate or single-state. Multistate licenses are issued by your primary state of residence; set it in your profile.`);
 else lines.push(`${j.name} is a compact state and your primary state of residence: a license from ${j.name} can be multistate or single-state.`);
 /* v14.8: no default scope (the home state used to preselect Multistate). The nurse chooses what the license says. */
 return{choice:true,scope:scope||null,lines};
}
/* v14.8: one name pattern for every RN license: "<State> RN License · <Multistate|Single-state>". */
function credentialDisplayName(kind,jur,fallback,scope){const k=catalogKind(kind);if(kind==='RN_LICENSE_MULTISTATE'||(kind==='RN_LICENSE'&&scope==='MULTISTATE'))return`${jurisdictionName(jur)} RN License · Multistate`;if(kind==='RN_LICENSE'&&scope==='SINGLE_STATE')return`${jurisdictionName(jur)} RN License · Single-state`;if(kind==='RN_LICENSE')return`${jurisdictionName(jur)} RN License`;if(kind==='OTHER'||!k)return fallback||'Credential';return k.short||k.label}
/* Machine-readable type (also used as the XRPL CredentialType). */
function credentialTypeCode(kind,jur){return(kind==='RN_LICENSE'||kind==='RN_LICENSE_MULTISTATE')?`${kind}:${normalizeJurisdictionCode(jur)}`:kind}
function issuerFor(kind,jur){if(kind==='RN_LICENSE'||kind==='RN_LICENSE_MULTISTATE')return jurisdiction(jur)?.issuer||'State board of nursing';return catalogKind(kind)?.issuer||'Issuer'}
/* Home state + compact (NLC) helpers (PR 11). All derived from
   US_JURISDICTIONS, never hardcoded per state. */
function homeStateCompactText(code){
 const j=jurisdiction(code);if(!j)return'Primary state of residence not set';
 const others=US_JURISDICTIONS.filter(x=>x.code!==j.code&&nlcHonorsCompactIn(x.code)).length;
 if(j.nlc==='IMPLEMENTED')return`${j.name} is a Nurse Licensure Compact state. An RN license issued here can be multistate: it lets you practice in ${j.name} and the ${others} other jurisdictions that honor compact licenses. Non-compact states (e.g. California, New York) still need their own license.`;
 if(j.nlc==='PARTIAL')return`${j.name} honors compact licenses from other states but can't issue multistate licenses yet, so a license from ${j.name} covers ${j.name} only.`;
 if(j.nlc==='PENDING')return`${j.name} has enacted the Nurse Licensure Compact but it isn't in effect yet: a license from ${j.name} covers ${j.name} only, and compact licenses from other states aren't honored there yet.`;
 return`${j.name} isn't in the Nurse Licensure Compact: a license from ${j.name} covers ${j.name} only.`;
}
function homeStateIsCompact(code){return nlcCanIssueMultistate(code)}
/* Primary source for verifying a license: Nursys + the issuing board. */
function licensePrimarySource(kind,jur){const b=jurisdiction(jur)?.issuer||'the state board of nursing';return kind==='RN_LICENSE_MULTISTATE'?`Nursys / ${b} (board of your primary state of residence)`:kind==='RN_LICENSE'?`${b} (or Nursys, where the board participates)`:issuerFor(kind,jur)}
/* Inline hint about a license's state vs the nurse's home state. A multistate
   license must be issued by the primary state of residence. */
function licenseHomeStateHint(kind,jur,home){
 const h=jurisdiction(home),j=jurisdiction(jur);if(!j)return'';
 if(kind==='RN_LICENSE_MULTISTATE'&&h&&j.code!==h.code)return` · ⚠ Multistate licenses are issued by your primary state of residence (${h.name}). This license is from ${j.name}: check the state, or update your primary state of residence.`;
 if(kind==='RN_LICENSE'&&h&&j.code===h.code&&nlcCanIssueMultistate(j.code))return` · ${j.name} is a compact state and your primary state of residence: if this license is multistate, set its scope to multistate.`;
 return'';
}
/* Where a license authorizes practice, per the jurisdictions data. */
function licenseCoverage(kind,jur){
 const j=jurisdiction(jur);if(!j)return{codes:[],text:''};
 if(kind==='RN_LICENSE_MULTISTATE'&&nlcCanIssueMultistate(j.code)){const codes=US_JURISDICTIONS.filter(x=>x.code===j.code||nlcHonorsCompactIn(x.code)).map(x=>x.code);return{codes,text:`Multistate (compact): ${j.name} + ${codes.length-1} other compact jurisdictions. Not valid in non-compact states.`}}
 if(kind==='RN_LICENSE_MULTISTATE')return{codes:[j.code],text:`${j.name} can't issue multistate licenses (${nlcStatusLabel(j.code)}): covers ${j.name} only.`};
 return{codes:[j.code],text:`Single-state: ${j.name} only.`};
}
function requirementLabel(r){if(r.kind===RN_AUTHORIZATION)return`${jurisdictionName(r.jurisdiction)} RN License`;return catalogKind(r.kind)?.short||catalogKind(r.kind)?.label||r.kind}
/* Searchable-dropdown resolution: accepts the option label, the code, or a
   unique case-insensitive partial match. */
function resolveCatalogKind(text){const t=String(text||'').trim().toLowerCase();if(!t)return null;const cat=CREDENTIAL_CATALOG.filter(k=>!k.notCredential);return cat.find(k=>k.label.toLowerCase()===t||k.kind.toLowerCase()===t)||_unique(cat.filter(k=>(k.label+' '+(k.keywords||'')+' '+k.kind).toLowerCase().includes(t)))}
function resolveJurisdiction(text,list=US_JURISDICTIONS){const t=String(text||'').trim().toLowerCase();if(!t)return null;return list.find(j=>jurisdictionOptionLabel(j).toLowerCase()===t||j.code.toLowerCase()===t||j.name.toLowerCase()===t||j.code.slice(3).toLowerCase()===t)||_unique(list.filter(j=>jurisdictionOptionLabel(j).toLowerCase().includes(t)))}
function _unique(a){return a.length===1?a[0]:null}
