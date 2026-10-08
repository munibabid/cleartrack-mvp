/* RN specialties: the single source of truth (PR 11).
   Used by the demo, the account profile form, the organization
   Requirement Sets / Assignment Builder, the readiness engine and the
   database seed (backend/scripts/generate-seed.js -> public.specialties +
   one SPECIALTY requirement set per specialty).

   Each specialty gets a requirement module, layered on top of the work-type
   base set and under facility/assignment overrides:
     required  — counts toward assignment readiness
     preferred — shown to the nurse and the organization, never blocks
   Every module also requires, automatically:
     - EMP_<ID>_VERIFIED  recent specialty experience, verified by an employer
                          (minimum months of work in a recent window — default
                          12 months in the last 24; organizations can change
                          it per requirement)
     - SKILLS_<ID>        the specialty skills checklist (completed, attested)
     - REF_SPECIALTY      a specialty reference (manager / charge nurse)

   These are DEMO TEMPLATES modeled on what US staffing agencies commonly ask
   for (e.g. USN/Ingenovis, AMN, Aya job postings). They are not any real
   agency's or facility's requirements; facilities vary. Certification names
   are real (AHA, ENA, AAP, AACN, BCEN, NCC, ONCC, ...). Certificates that
   are APRN-level or not open to RNs are deliberately not listed.

   IDs ICU, ED, LD and MEDSURG predate PR 11 and are kept, with their
   original required items, so existing data and demos don't change. */
const SPECIALTY_GROUPS=[
 {id:'CRITICAL',label:'Critical care'},
 {id:'EMERGENCY',label:'Emergency, trauma & transport'},
 {id:'INPATIENT',label:'Inpatient: step-down, telemetry & med-surg'},
 {id:'PERIOP',label:'Perioperative & procedural'},
 {id:'WOMENS',label:"Women's health & infants"},
 {id:'PEDS_ONC',label:'Pediatrics, oncology & infusion'},
 {id:'RENAL',label:'Dialysis & renal'},
 {id:'BEHAVIORAL',label:'Behavioral health'},
 {id:'POST_ACUTE',label:'Home health, hospice & post-acute'},
 {id:'AMBULATORY',label:'Ambulatory & community'},
 {id:'SERVICES',label:'Specialty services'},
 {id:'COORDINATION',label:'Case management, review & informatics'}
];
/* [id, group, name, short, required certifications, preferred, search keywords] */
const SPECIALTY_DATA=[
 ['ICU','CRITICAL','ICU / Critical Care','ICU',['CERT_ACLS'],['CERT_CCRN','CERT_NIHSS'],'adult icu micu sicu critical care'],
 ['CVICU','CRITICAL','CVICU (Cardiovascular ICU)','CVICU',['CERT_ACLS'],['CERT_CCRN','CERT_CSC','COMP_CRRT'],'cardiovascular open heart cardiothoracic cticu'],
 ['CCU','CRITICAL','CCU / Cardiac ICU','CCU',['CERT_ACLS'],['CERT_CCRN','CERT_CMC'],'coronary care cardiac intensive'],
 ['NEURO_ICU','CRITICAL','Neuro ICU','Neuro ICU',['CERT_ACLS','CERT_NIHSS'],['CERT_CCRN','CERT_CNRN','CERT_SCRN'],'neuroscience icu nsicu stroke'],
 ['TRAUMA_ICU','CRITICAL','Trauma ICU','Trauma ICU',['CERT_ACLS','CERT_TNCC'],['CERT_CCRN','CERT_TCRN'],'stich trauma surgical icu'],
 ['BURN','CRITICAL','Burn ICU / Burn Unit','Burn',['CERT_ACLS'],['CERT_ABLS','CERT_CCRN'],'burn center'],
 ['PICU','CRITICAL','PICU (Pediatric ICU)','PICU',['CERT_PALS'],['CERT_CCRN','CERT_ACLS'],'pediatric intensive care'],
 ['NICU','CRITICAL','NICU, Level III / IV','NICU III/IV',['CERT_NRP','CERT_STABLE'],['CERT_RNC_NIC','CERT_CCRN'],'neonatal intensive care level 3 level 4'],
 ['NICU_II','CRITICAL','NICU, Level II (Special Care Nursery)','NICU II',['CERT_NRP'],['CERT_STABLE','CERT_RNC_LRN'],'special care nursery scn level 2 intermediate'],
 ['ED','EMERGENCY','Emergency Department','ED',['CERT_ACLS','CERT_PALS','CERT_TNCC'],['CERT_CEN','CERT_ENPC','CERT_NIHSS'],'er emergency room'],
 ['PEDS_ED','EMERGENCY','Pediatric Emergency Department','Peds ED',['CERT_PALS'],['CERT_ENPC','CERT_CPEN','CERT_TNCC','CERT_ACLS'],'pediatric er'],
 ['TRAUMA','EMERGENCY','Trauma Nursing (trauma center / trauma bay)','Trauma',['CERT_ACLS','CERT_TNCC'],['CERT_TCRN','CERT_ATCN','CERT_PALS'],'level 1 trauma center'],
 ['FLIGHT','EMERGENCY','Flight / Critical Care Transport','Flight/Transport',['CERT_ACLS','CERT_PALS','CERT_NRP','CERT_TNCC'],['CERT_CFRN','CERT_CTRN','CERT_CCRN','CERT_CEN'],'flight nurse air medical ground transport'],
 ['PCU','INPATIENT','Step-down / Progressive Care (PCU)','PCU',['CERT_ACLS'],['CERT_PCCN','CERT_NIHSS'],'stepdown intermediate care imc progressive'],
 ['TELE','INPATIENT','Telemetry','Tele',['CERT_ACLS'],['CERT_PCCN','COMP_DYSRHYTHMIA'],'telemetry cardiac monitoring tele'],
 ['MEDSURG','INPATIENT','Med-Surg','Med-Surg',[],['CERT_CMSRN','CERT_ACLS'],'medical surgical'],
 ['ORTHO','INPATIENT','Orthopedics','Ortho',[],['CERT_ONC_ORTHO','CERT_ACLS'],'orthopaedic joint spine'],
 ['NEURO','INPATIENT','Neuro / Stroke Unit','Neuro',['CERT_NIHSS'],['CERT_SCRN','CERT_CNRN','CERT_ACLS'],'neuroscience stroke'],
 ['TRANSPLANT','INPATIENT','Transplant','Transplant',[],['CERT_CCTN','CERT_ACLS'],'organ transplant kidney liver'],
 ['LTACH','INPATIENT','Long-Term Acute Care (LTACH)','LTACH',['CERT_ACLS'],['CERT_PCCN'],'long term acute care hospital ltac'],
 ['FLOAT','INPATIENT','Float Pool / Resource','Float Pool',['CERT_ACLS'],['CERT_PALS','CERT_NIHSS'],'resource float pool'],
 ['OR','PERIOP','Operating Room (OR)','OR',[],['CERT_CNOR','CERT_ACLS'],'operating room circulator scrub perioperative'],
 ['CVOR','PERIOP','Cardiovascular OR (CVOR)','CVOR',['CERT_ACLS'],['CERT_CNOR'],'cardiovascular operating room open heart'],
 ['PACU','PERIOP','PACU (Post-Anesthesia Care)','PACU',['CERT_ACLS'],['CERT_PALS','CERT_CPAN'],'post anesthesia recovery room'],
 ['PREOP','PERIOP','Pre-op / Same-Day Surgery','Pre-op',[],['CERT_ACLS','CERT_CAPA'],'preoperative same day surgery ambulatory surgery pre-admission'],
 ['CATH','PERIOP','Cath Lab','Cath Lab',['CERT_ACLS'],['CERT_RCIS','COMP_MODERATE_SEDATION','CERT_CCRN'],'cardiac catheterization'],
 ['EP','PERIOP','Electrophysiology (EP) Lab','EP Lab',['CERT_ACLS'],['CERT_CEPS','COMP_MODERATE_SEDATION'],'electrophysiology ablation'],
 ['IR','PERIOP','Interventional Radiology (IR)','IR',['CERT_ACLS'],['CERT_CRN_RAD','COMP_MODERATE_SEDATION'],'interventional radiology special procedures'],
 ['ENDO','PERIOP','Endoscopy / GI Lab','Endo/GI',['CERT_ACLS'],['CERT_CGRN','COMP_MODERATE_SEDATION'],'endoscopy gi lab gastroenterology'],
 ['LD','WOMENS','Labor & Delivery','L&D',['CERT_NRP','CERT_FETAL_MONITORING'],['CERT_RNC_OB','CERT_C_EFM','CERT_STABLE','CERT_ACLS'],'l&d labor delivery ob obstetrics'],
 ['ANTEPARTUM','WOMENS','Antepartum (high-risk OB)','Antepartum',['CERT_FETAL_MONITORING','CERT_NRP'],['CERT_RNC_OB','CERT_C_EFM'],'high risk pregnancy perinatal antepartum'],
 ['POSTPARTUM','WOMENS','Postpartum','Postpartum',['CERT_NRP'],['CERT_RNC_MNN','CERT_IBCLC'],'postpartum ob'],
 ['MOTHER_BABY','WOMENS','Mother-Baby (couplet care)','Mother-Baby',['CERT_NRP'],['CERT_RNC_MNN','CERT_IBCLC','CERT_STABLE'],'couplet care maternal newborn'],
 ['NURSERY','WOMENS','Newborn Nursery (well-baby)','Nursery',['CERT_NRP'],['CERT_STABLE','CERT_RNC_LRN'],'well baby newborn nursery'],
 ['WOMENS_HEALTH','WOMENS',"Women's Health / Gynecology",'Women\'s Health',[],['CERT_RNC_OB','CERT_IBCLC'],'gynecology gyn women\'s health'],
 ['PEDS','PEDS_ONC','Pediatrics (inpatient)','Peds',['CERT_PALS'],['CERT_CPN'],'pediatric peds children'],
 ['ONC','PEDS_ONC','Oncology / Hematology','Oncology',['CERT_CHEMO'],['CERT_OCN','CERT_ACLS'],'oncology hematology cancer chemo'],
 ['PEDS_ONC','PEDS_ONC','Pediatric Hematology / Oncology','Peds Hem/Onc',['CERT_PALS','CERT_CHEMO'],['CERT_CPHON'],'pediatric oncology hematology'],
 ['BMT','PEDS_ONC','Bone Marrow Transplant (BMT)','BMT',['CERT_CHEMO'],['CERT_BMTCN','CERT_OCN'],'bone marrow stem cell transplant'],
 ['INFUSION','PEDS_ONC','Infusion','Infusion',[],['CERT_CRNI','CERT_CHEMO'],'infusion center iv therapy'],
 ['DIALYSIS_ACUTE','RENAL','Dialysis, acute (inpatient)','Acute Dialysis',['CERT_ACLS'],['CERT_CNN','COMP_CRRT'],'acute hemodialysis inpatient dialysis crrt'],
 ['DIALYSIS_CHRONIC','RENAL','Dialysis, chronic (outpatient)','Chronic Dialysis',[],['CERT_CDN','CERT_CNN'],'chronic outpatient hemodialysis peritoneal'],
 ['RENAL','RENAL','Renal / Nephrology unit','Renal',[],['CERT_CNN'],'nephrology kidney renal'],
 ['PSYCH','BEHAVIORAL','Behavioral Health / Psych (adult)','Psych',['CERT_CRISIS_INTERVENTION'],['CERT_PMH_BC'],'psychiatric mental health behavioral'],
 ['PSYCH_CHILD','BEHAVIORAL','Behavioral Health / Psych (child & adolescent)','Child Psych',['CERT_CRISIS_INTERVENTION','CERT_PALS'],['CERT_PMH_BC'],'child adolescent psychiatric'],
 ['ADDICTION','BEHAVIORAL','Addiction / Detox','Addiction',['CERT_CRISIS_INTERVENTION'],['CERT_CARN','CERT_PMH_BC'],'substance use detox chemical dependency'],
 ['HOME_HEALTH','POST_ACUTE','Home Health','Home Health',['DOC_DRIVER_LICENSE_AUTO'],['CERT_COS_C'],'home health visits oasis'],
 ['HOSPICE','POST_ACUTE','Hospice / Palliative','Hospice',['DOC_DRIVER_LICENSE_AUTO'],['CERT_CHPN'],'hospice palliative end of life'],
 ['LTC','POST_ACUTE','Long-Term Care / SNF','LTC/SNF',[],['CERT_GERO_BC'],'skilled nursing facility nursing home long term care'],
 ['REHAB','POST_ACUTE','Rehabilitation (acute rehab)','Rehab',[],['CERT_CRRN'],'inpatient rehabilitation irf'],
 ['CLINIC','AMBULATORY','Clinic / Ambulatory Care','Clinic',[],['CERT_AMB_BC'],'outpatient clinic ambulatory physician office'],
 ['TELEHEALTH','AMBULATORY','Telehealth / Telephone Triage','Telehealth',[],['CERT_AMB_BC'],'telephone triage virtual nursing telehealth'],
 ['CORRECTIONAL','AMBULATORY','Correctional Health','Correctional',[],['CERT_CCHP_RN'],'jail prison corrections detention'],
 ['SCHOOL','AMBULATORY','School Nursing','School',[],['CERT_STATE_SCHOOL_NURSE','CERT_NCSN'],'school nurse k-12'],
 ['OCC_HEALTH','AMBULATORY','Occupational Health','Occ Health',[],['CERT_COHN','CERT_CAOHC'],'occupational employee health'],
 ['PUBLIC_HEALTH','AMBULATORY','Public Health','Public Health',[],[],'public community health department'],
 ['WOUND','SERVICES','Wound / Ostomy Care','Wound Care',[],['CERT_WOCN'],'wound ostomy continence'],
 ['VASCULAR_ACCESS','SERVICES','Vascular Access / IV Team','Vascular Access',[],['CERT_VA_BC','CERT_CRNI'],'picc iv team vascular access'],
 ['DIABETES_ED','SERVICES','Diabetes Education','Diabetes Ed',[],['CERT_CDCES'],'diabetes educator cdces'],
 ['SANE','SERVICES','Forensic Nursing / SANE','SANE',[],['CERT_SANE'],'sexual assault nurse examiner forensic'],
 ['INFECTION_PREV','SERVICES','Infection Prevention','Infection Prevention',[],['CERT_CIC'],'infection control prevention epidemiology'],
 ['CASE_MGMT','COORDINATION','Case Management','Case Mgmt',[],['CERT_ACM_RN','CERT_CCM'],'case manager care coordination discharge planning'],
 ['UR','COORDINATION','Utilization Review','UR',[],['CERT_ACM_RN','CERT_CCM'],'utilization review management interqual mcg'],
 ['INFORMATICS','COORDINATION','Nursing Informatics','Informatics',[],['CERT_NI_BC'],'informatics ehr epic cerner']
];
/* Recent experience defaults (per requirement; organizations can override). */
const SPECIALTY_EXPERIENCE_DEFAULT={minMonths:12,windowMonths:24};
const SPECIALTIES=SPECIALTY_DATA.map(([id,group,name,short,req,pref,keywords],i)=>{
 const expKind=`EMP_${id}_VERIFIED`,skillsKind=`SKILLS_${id}`;
 return{id,group,groupLabel:SPECIALTY_GROUPS.find(g=>g.id===group).label,name,short,keywords,sort:i+1,expKind,skillsKind,
  required:[...req,expKind,skillsKind,'REF_SPECIALTY'],preferred:pref.filter(k=>!req.includes(k))};
});
const _specById=Object.fromEntries(SPECIALTIES.map(s=>[s.id,s]));
function specialty(id){return _specById[id]||null}
function specialtyName(id){return _specById[id]?.name||id||''}
function specialtyShort(id){return _specById[id]?.short||id||''}
function isSpecialty(id){return!!_specById[id]}
function specialtiesByGroup(){return SPECIALTY_GROUPS.map(g=>({...g,items:SPECIALTIES.filter(s=>s.group===g.id)}))}
/* <optgroup>-grouped options for a native <select> (phone-friendly). */
function specialtyOptionsHtml(selected,placeholder='Select specialty'){
 const e=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 return(placeholder!=null?`<option value=""${selected?'':' selected'} disabled>${e(placeholder)}</option>`:'')+specialtiesByGroup().map(g=>`<optgroup label="${e(g.label)}">${g.items.map(s=>`<option value="${s.id}"${s.id===selected?' selected':''}>${e(s.name)}</option>`).join('')}</optgroup>`).join('');
}
/* "24 months" -> "2 years", "18 months" stays. */
function monthsText(m){return m%12===0?(m===12?'1 year':`${m/12} years`):`${m} months`}
