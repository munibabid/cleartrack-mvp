/* Verification Source Registry + verification levels (PR 13).

   "Verified" has to say WHO confirmed a credential and HOW. This file is the
   one data-driven list of the places Veridun accepts a confirmation from,
   and the trust level each one gives. Everything else (readiness, the
   Verification Console, the account verifier form, provenance, the database
   seed) reads from here.

   Honesty rules:
   - A lookup URL is listed only if it was confirmed on the official site
     (Oct 2026). Unconfirmed = '' and the UI never makes one up.
   - Uploading a document, self-attestation and AI extraction are NEVER
     primary-source verification. AI extraction gives no level at all.
   - "Continuously Monitored" needs real ongoing monitoring (e.g. Nursys
     e-Notify enrollment). Veridun has no e-Notify credentials yet, so no
     account credential can reach it today.
   - Nursys does not offer an API for QuickConfirm and has no test
     environment. The e-Notify API needs a free institution account plus API
     credentials from NCSBN (password rotates every 90 days). */
const REGISTRY_AS_OF='2026-10-09';

/* Ordered trust levels. rank decides "meets the minimum". Employer and
   vendor are both independent third parties, so they share a rank. */
const VERIFICATION_LEVELS=[
 {id:'CONTINUOUSLY_MONITORED',label:'Continuously Monitored',rank:6,short:'MONITORED',desc:'Primary-source verified and enrolled in ongoing monitoring, so a change at the source (expired, disciplined, revoked) reaches Veridun without anyone re-checking by hand.'},
 {id:'PRIMARY_SOURCE_VERIFIED',label:'Primary Source Verified',rank:5,short:'PRIMARY SOURCE',desc:'Checked directly with the authority that grants it — the state board of nursing — or with Nursys, which carries the boards\u2019 own data (primary-source equivalent).'},
 {id:'ISSUER_VERIFIED',label:'Issuer Verified',rank:4,short:'ISSUER',desc:'Confirmed by the organization that issued it, for example AHA, the Red Cross, AACN, BCEN or NCC.'},
 {id:'EMPLOYER_VERIFIED',label:'Employer Verified',rank:3,short:'EMPLOYER',desc:'Confirmed by a current or past employer (HR letter, manager reference, or employment verification).'},
 {id:'VENDOR_VERIFIED',label:'Vendor Verified',rank:3,short:'VENDOR',desc:'Confirmed by a screening or verification vendor\u2019s report (for example a background or drug-screen vendor).'},
 {id:'DOCUMENT_REVIEWED',label:'Document Reviewed',rank:2,short:'DOCUMENT',desc:'A person looked at the uploaded document. Nobody confirmed it with the source.'},
 {id:'SELF_ATTESTED',label:'Self Attested',rank:1,short:'SELF',desc:'The nurse states it is true. Nobody else has confirmed it.'}
];
const _levelById=Object.fromEntries(VERIFICATION_LEVELS.map(l=>[l.id,l]));
function verificationLevel(id){return _levelById[id]||null}
function levelLabel(id){return _levelById[id]?.label||'Not verified'}
function levelRank(id){return _levelById[id]?.rank||0}
/* True when a credential verified at `have` satisfies a requirement whose
   minimum is `need`. No level (null) never satisfies anything. */
function levelMeets(have,need){if(!have)return false;if(!need)return true;return levelRank(have)>=levelRank(need)}

/* How a check was done -> the level it can give. */
const VERIFICATION_METHODS={
 PRIMARY_SOURCE:{label:'Primary source',level:'PRIMARY_SOURCE_VERIFIED'},
 PRIMARY_SOURCE_EQUIVALENT:{label:'Primary-source equivalent',level:'PRIMARY_SOURCE_VERIFIED'},
 ISSUER:{label:'Issuer',level:'ISSUER_VERIFIED'},
 EMPLOYER:{label:'Employer',level:'EMPLOYER_VERIFIED'},
 VENDOR:{label:'Vendor',level:'VENDOR_VERIFIED'},
 DOCUMENT_REVIEW:{label:'Document review',level:'DOCUMENT_REVIEWED'},
 SELF_ATTESTED:{label:'Self-attested',level:'SELF_ATTESTED'},
 AI_EXTRACTION:{label:'AI extraction (reads details only)',level:null}
};
/* Inputs that can never count as primary-source verification. */
const NEVER_PRIMARY_SOURCE=['DOCUMENT_UPLOAD','DOCUMENT_REVIEW','SELF_ATTESTED','AI_EXTRACTION'];
function methodLevel(method){
 const m=VERIFICATION_METHODS[method];if(!m)return null;
 if(NEVER_PRIMARY_SOURCE.includes(method)&&levelRank(m.level)>=levelRank('PRIMARY_SOURCE_VERIFIED'))return'DOCUMENT_REVIEWED';
 return m.level;
}
const SOURCE_TYPES={LICENSING_BOARD:'Licensing board',NURSYS:'Nursys (NCSBN)',CERTIFYING_BODY:'Certifying body',EMPLOYER:'Employer',VENDOR:'Vendor',PLATFORM:'Veridun platform'};
const SOURCE_STATUS={APPROVED:'Approved source',PENDING:'Pending approval',UNAPPROVED:'Not an approved source'};

/* Board lookup pages confirmed on the boards' own sites (Oct 2026). Every
   other board: '' (use Nursys QuickConfirm, where the board participates). */
const BOARD_LOOKUP_URLS={
 'US-CA':{url:'https://search.dca.ca.gov/',note:'DCA License Search. The BRN states this is its primary-source data (BreEZe). Choose Board of Registered Nursing.'},
 'US-MA':{url:'https://www.mass.gov/how-to/check-a-nursing-license',note:'Mass.gov "Check a nursing license" leads to the Health Professions License Verification site, which the Board calls primary source verification. RN numbers start with "RN".'},
 'US-NY':{url:'https://www.op.nysed.gov/services/verifications/online-verification-searches',note:'NYSED Office of the Professions online verification. Profession: Registered Professional Nurse.'},
 'US-PR':{url:'https://orcps.salud.pr.gov/mbps/verificacion',note:'ORCPS license verification (Puerto Rico Department of Health). Puerto Rico does not send data to Nursys, so this board page is the only route.'}
};
/* Nursys QuickConfirm participating boards (RN/PN), per nursys.com
   LQCJurisdictions, checked 2026-10-09. Every US jurisdiction except Puerto
   Rico. Nursys also flagged that Alabama's data was not current that day. */
const NURSYS_NON_PARTICIPATING=['US-PR'];
const NURSYS_DATA_WARNINGS={'US-AL':'Nursys posted on Oct 9, 2026 that Alabama Board of Nursing data is not current because of a licensing-system problem. Check with the Alabama board directly until Nursys clears this.'};
function nursysParticipates(code){return!!jurisdiction(code)&&!NURSYS_NON_PARTICIPATING.includes(normalizeJurisdictionCode(code))}
const RN_LICENSE_KINDS=['RN_LICENSE','RN_LICENSE_MULTISTATE'];
const _catKinds=(pred)=>CREDENTIAL_CATALOG.filter(pred).map(k=>k.kind);

function _boardEntries(){
 return US_JURISDICTIONS.map(j=>{
  const look=BOARD_LOOKUP_URLS[j.code],nursys=nursysParticipates(j.code);
  return{
   id:'board-'+j.code,name:j.issuer,type:'LICENSING_BOARD',jurisdiction:j.code,
   kinds:nlcCanIssueMultistate(j.code)?RN_LICENSE_KINDS.slice():['RN_LICENSE'],
   method:'PRIMARY_SOURCE',lookupUrl:look?.url||'',
   api:{available:false,requirements:'No public API. A verifier checks the board\u2019s own lookup (or Nursys QuickConfirm) by hand.'},
   status:'APPROVED',nursys,
   notes:[look?.note||(nursys?'Board\u2019s own lookup page not confirmed yet: verify through Nursys QuickConfirm, which carries this board\u2019s data.':'No confirmed online lookup: request a written verification from the board.'),NURSYS_DATA_WARNINGS[j.code]||''].filter(Boolean).join(' ')
  };
 });
}
/* An issuer (certifying body) entry. lookupUrl '' when the issuer's own
   verification page could not be confirmed. */
function _issuer(id,name,kinds,lookupUrl,notes,docIssuer){return[{id,name,type:'CERTIFYING_BODY',jurisdiction:'',kinds,method:'ISSUER',lookupUrl,
 api:{available:false,requirements:lookupUrl?'No public API. Manual lookup on the issuer\u2019s verification page.':'No public API or confirmed lookup page. Request written confirmation from the issuer.'},status:'APPROVED',notes,docIssuer}]}
const VERIFICATION_SOURCES=[
 ..._boardEntries(),
 {id:'nursys-quickconfirm',name:'Nursys QuickConfirm',type:'NURSYS',jurisdiction:'US',jurisdictions:US_JURISDICTIONS.map(j=>j.code).filter(nursysParticipates),kinds:RN_LICENSE_KINDS.slice(),
  method:'PRIMARY_SOURCE_EQUIVALENT',lookupUrl:'https://www.nursys.com/LQC/LQCTerms.aspx',
  api:{available:false,requirements:'Nursys does not offer an API for QuickConfirm. Manual lookup only (free).'},status:'APPROVED',
  notes:'Free license and discipline lookup with data sent by participating boards (every US jurisdiction except Puerto Rico). Nursys meets The Joint Commission\u2019s principles for primary-source-equivalent verification.'},
 {id:'nursys-enotify',name:'Nursys e-Notify (institution API)',type:'NURSYS',jurisdiction:'US',jurisdictions:US_JURISDICTIONS.map(j=>j.code).filter(nursysParticipates),kinds:RN_LICENSE_KINDS.slice(),
  method:'PRIMARY_SOURCE_EQUIVALENT',lookupUrl:'https://www.nursys.com/Help/FAQ.aspx?KEY=EN',monitoring:true,
  api:{available:true,requirements:'Free Nursys e-Notify institution account; API credentials requested from NCSBN for that account; API password must be changed every 90 days; no test environment or sample nurses; licenses must be enrolled on the account\u2019s Nurse List before data comes back. JSON API: manage the Nurse List, pull Nurse Report license data, pull license-change notifications.'},
  status:'PENDING',notes:'Not connected: Veridun has no institution account or API credentials yet. The connector is a server-side stub (backend/supabase/functions/nursys-enotify) that refuses to run without them. Once connected, enrolled licenses become Continuously Monitored.'},
 {id:'aha-ecards',docIssuer:'american\\s*heart|heart\\.org|\\bAHA\\b',name:'AHA eCard verification',type:'CERTIFYING_BODY',jurisdiction:'',kinds:['CERT_BLS','CERT_ACLS','CERT_PALS'],method:'ISSUER',
  lookupUrl:'https://ecards.heart.org/student/myecards?pid=ahaecard.employerStudentSearch',api:{available:false,requirements:'No public API. Employer search on the site; bulk/automated access needs a written partner agreement with AHA.'},status:'APPROVED',
  notes:'Employer tab: enter the eCard code. Codes that contain letters are RQI cards (use AHA RQI verification).'},
 {id:'aha-rqi',docIssuer:'\\bRQI\\b|heartcode|rqi1stop',name:'AHA RQI verification',type:'CERTIFYING_BODY',jurisdiction:'',kinds:['CERT_BLS','CERT_ACLS','CERT_PALS'],method:'ISSUER',
  lookupUrl:'https://www.heart.org/RQIverify',api:{available:false,requirements:'No public API. Partner agreement needed for automation.'},status:'APPROVED',notes:'Resuscitation Quality Improvement (RQI) credentials.'},
 {id:'redcross-certificate',docIssuer:'red\\s*cross',name:'American Red Cross digital certificate',type:'CERTIFYING_BODY',jurisdiction:'',kinds:['CERT_BLS','CERT_ACLS','CERT_PALS'],method:'ISSUER',
  lookupUrl:'https://www.redcross.org/take-a-class/digital-certificate',api:{available:false,requirements:'No public API. Partner agreement needed for automation.'},status:'APPROVED',notes:'Find My Certificate by certificate ID.'},
 {id:'redcross-hstream',docIssuer:'healthstream|hstream',name:'American Red Cross hStream (HealthStream)',type:'CERTIFYING_BODY',jurisdiction:'',kinds:['CERT_BLS','CERT_ACLS','CERT_PALS'],method:'ISSUER',
  lookupUrl:'https://redcross.healthstream.com/',api:{available:false,requirements:'No public API.'},status:'APPROVED',notes:'Clinical (hStream) certificates use a 6-character Certificate ID.'},
 {id:'aacn',docIssuer:'american\\s+association\\s+of\\s+critical.care|\\bAACN\\b',name:'AACN certification verification',type:'CERTIFYING_BODY',jurisdiction:'',kinds:['CERT_CCRN','CERT_PCCN','CERT_CMC','CERT_CSC'],method:'ISSUER',
  lookupUrl:'https://www.aacn.org/certification/verify-certification',api:{available:false,requirements:'No public API. Free web verification.'},status:'APPROVED',notes:'AACN states this free verification may be used as primary source verification for AACN certifications.'},
 {id:'bcen',docIssuer:'board\\s+of\\s+certification\\s+for\\s+emergency|\\bBCEN\\b',name:'BCEN certification verification',type:'CERTIFYING_BODY',jurisdiction:'',kinds:['CERT_CEN','CERT_CPEN','CERT_TCRN','CERT_CFRN','CERT_CTRN'],method:'ISSUER',
  lookupUrl:'https://bcen.org/verify-certification/',api:{available:false,requirements:'No public API. The certificant requests a verification email or shares a digital badge.'},status:'APPROVED',notes:'No open third-party search box.'},
 {id:'ncc',docIssuer:'national\\s+certification\\s+corporation|\\bNCC\\b',name:'NCC primary source verification',type:'CERTIFYING_BODY',jurisdiction:'',kinds:['CERT_RNC_OB','CERT_C_EFM','CERT_RNC_MNN','CERT_RNC_NIC','CERT_RNC_LRN'],method:'ISSUER',
  lookupUrl:'https://www.nccwebsite.org/verifications/request',api:{available:false,requirements:'No public API. The certificant starts the verification request.'},status:'APPROVED',notes:'See also https://www.nccwebsite.org/about-ncc/primary-source-verification.'},
 /* PR 14: every certification kind gets its real issuer (Oct 9, 2026).
    lookupUrl only where the verification page itself was confirmed; when only
    the issuer's homepage was confirmed it is named in the notes instead.
    docIssuer = how the on-device reader recognises this issuer on a document. */
 ..._issuer('apex-nihss','Apex Innovations NIHSS certificate verification',['CERT_NIHSS'],'https://www.apexinnovations.com/verifyCertificate.php','Enter the Test ID (bottom-right corner of the certificate), or the email address and test date. Apex: Patient Group A is valid one year from testing; later groups two years.','apex\\s*innovations'),
 ..._issuer('nihss-plus','NIHSS+ certificate verification (Apex Innovations)',['CERT_NIHSS'],'https://nihss.plus/certification/verify','Certificate ID (bottom-right corner), or email address and exam date.','NIHSS\\s*\\+|nihss\\.plus'),
 ..._issuer('aha-asa-nihss','AHA/ASA NIH Stroke Scale (AHA Professional Education Hub)',['CERT_NIHSS'],'','American Heart Association / American Stroke Association NIHSS course certificates come from the AHA Professional Education Hub (learn.heart.org). No public verification page was found: confirm with AHA customer support using the certificate.','american\\s+stroke\\s+association|\\bASA\\b|professional\\s+education\\s+hub|learn\\.heart\\.org'),
 ..._issuer('nihss-international','NIH Stroke Scale International',['CERT_NIHSS'],'','Issuer homepage: https://www.nihstrokescale.org/. A public verification page was not confirmed; request confirmation from the issuer.','NIH\\s*Stroke\\s*Scale\\s*International|nihstrokescale\\.org'),
 ..._issuer('aap-nrp','AAP Neonatal Resuscitation Program eCard (RQI Partners)',['CERT_NRP'],'https://www.aap.org/en/pedialink/neonatal-resuscitation-program/nrp-frequently-asked-questions/nrp-general-information/','AAP: ask the nurse to email the eCard from the NRP Learning Platform (it comes from an @rqipartners.com address and cannot be falsified) or scan the eCard QR code; AAP has a verification request form for anything else. eCards are valid two years.','american\\s+academy\\s+of\\s+pediatrics|\\bAAP\\b|neonatal\\s+resuscitation\\s+program|rqi\\s*partners'),
 ..._issuer('ena-tncc','ENA TNCC verification letter',['CERT_TNCC'],'https://www.ena.org/education/trauma-nursing-core-courser/tncc-verification-employment','ENA has no public search. The nurse emails a PDF verification letter from ENA University; authorized letters come from enau@ena.org. Provider status lasts four years.','emergency\\s+nurses\\s+association|\\bENA\\b'),
 ..._issuer('ena-enpc','ENA ENPC verification letter',['CERT_ENPC'],'https://www.ena.org/education/emergency-nursing-pediatric-courser/enpc-verification-employment','ENA has no public search. The nurse emails a PDF verification letter from ENA University; authorized letters come from enau@ena.org. Provider status lasts four years.','emergency\\s+nurses\\s+association|\\bENA\\b'),
 ..._issuer('awhonn-fhm','AWHONN Fetal Heart Monitoring Program',['CERT_FETAL_MONITORING'],'https://awhonn.org/fhm/fetal-heart-monitoring/','No public verification portal. Check the completion certificate and confirm the course ID number and date with AWHONN. Intermediate and Advanced courses have a recommended renewal every two years.','AWHONN|association\\s+of\\s+women.s\\s+health'),
 ..._issuer('aba-abls','American Burn Association ABLS',['CERT_ABLS'],'','Issuer homepage: https://ameriburn.org/. A public ABLS verification page was not confirmed; request confirmation from the ABA.','american\\s+burn\\s+association|\\bABLS\\b'),
 ..._issuer('stn-atcn','Society of Trauma Nurses ATCN',['CERT_ATCN'],'','Issuer homepage: https://traumanurses.org/. A public verification page was not confirmed.','society\\s+of\\s+trauma\\s+nurses|\\bSTN\\b'),
 ..._issuer('stable-program','S.T.A.B.L.E. Program',['CERT_STABLE'],'','Issuer homepage: https://stableprogram.org/. A public verification page was not confirmed.','S\\.?T\\.?A\\.?B\\.?L\\.?E\\.?\\s+program|stableprogram'),
 ..._issuer('abnn','American Board of Neuroscience Nursing (ABNN)',['CERT_CNRN','CERT_SCRN'],'','Issuer homepage: https://abnncertification.org/. A public verification page was not confirmed.','american\\s+board\\s+of\\s+neuroscience|\\bABNN\\b'),
 ..._issuer('msncb','Medical-Surgical Nursing Certification Board (MSNCB)',['CERT_CMSRN'],'https://www.msncb.org/CMSRN/Verify-a-Certification','CMSRN verification on the MSNCB site.','medical.surgical\\s+nursing\\s+certification\\s+board|\\bMSNCB\\b'),
 ..._issuer('oncb','Orthopaedic Nurses Certification Board (ONCB)',['CERT_ONC_ORTHO'],'https://www.oncb.org/verify-certification/','ONC verification on the ONCB site.','orthopaedic\\s+nurses\\s+certification\\s+board|\\bONCB\\b'),
 ..._issuer('abtc','American Board for Transplant Certification (ABTC)',['CERT_CCTN'],'','A public verification page was not confirmed (abtc.net did not answer on Oct 9, 2026).','american\\s+board\\s+for\\s+transplant|\\bABTC\\b'),
 ..._issuer('cci-periop','Competency & Credentialing Institute (CCI)',['CERT_CNOR'],'','Issuer homepage: https://www.cc-institute.org/. A public verification page was not confirmed.','competency\\s*(&|and)\\s*credentialing\\s+institute'),
 ..._issuer('abpanc','American Board of Perianesthesia Nursing Certification (ABPANC)',['CERT_CPAN','CERT_CAPA'],'','Issuer homepage: https://www.cpancapa.org/. A public verification page was not confirmed.','perianesthesia\\s+nursing\\s+certification|\\bABPANC\\b'),
 ..._issuer('cci-cardio','Cardiovascular Credentialing International (CCI)',['CERT_RCIS','CERT_CEPS'],'','Issuer homepage: https://cci-online.org/. A public verification page was not confirmed.','cardiovascular\\s+credentialing\\s+international'),
 ..._issuer('rncb','Radiologic Nursing Certification Board (RNCB)',['CERT_CRN_RAD'],'','Issuer homepage: https://www.certifiedradiologynurse.org/. A public verification page was not confirmed.','radiologic\\s+nursing\\s+certification\\s+board|\\bRNCB\\b'),
 ..._issuer('abcgn','American Board of Certification for Gastroenterology Nurses (ABCGN)',['CERT_CGRN'],'','Issuer homepage: https://www.abcgn.org/. A public verification page was not confirmed.','gastroenterology\\s+nurses|\\bABCGN\\b'),
 ..._issuer('iblce','IBLCE / IBCLC Commission public registry',['CERT_IBCLC'],'https://ibclc-commission.org/public-registry/','Public IBCLC registry.','\\bIBLCE\\b|IBCLC\\s+commission|international\\s+board\\s+of\\s+lactation'),
 ..._issuer('pncb','Pediatric Nursing Certification Board (PNCB)',['CERT_CPN','CERT_CPHON'],'https://www.pncb.org/verification','CPN / CPHON verification on the PNCB site.','pediatric\\s+nursing\\s+certification\\s+board|\\bPNCB\\b'),
 ..._issuer('oncc','Oncology Nursing Certification Corporation (ONCC)',['CERT_OCN','CERT_BMTCN'],'https://www.oncc.org/verify-certification','OCN / BMTCN verification on the ONCC site.','oncology\\s+nursing\\s+certification\\s+corporation|\\bONCC\\b'),
 ..._issuer('ons-chemo','ONS Chemotherapy Immunotherapy Certificate (ONS)',['CERT_CHEMO'],'https://www.ons.org/verify-certificate-or-cardholder-status','ONS certificate and cardholder status lookup.','oncology\\s+nursing\\s+society|\\bONS\\b'),
 ..._issuer('incc','Infusion Nurses Certification Corporation (INCC)',['CERT_CRNI'],'https://www.ins1.org/verify-a-crni/','CRNI verification on the INS site.','infusion\\s+nurses\\s+certification|\\bINCC\\b'),
 ..._issuer('nncc','Nephrology Nursing Certification Commission (NNCC)',['CERT_CNN','CERT_CDN'],'','Issuer homepage: https://www.nncc-exam.org/. A public verification page was not confirmed.','nephrology\\s+nursing\\s+certification|\\bNNCC\\b'),
 ..._issuer('cpi','Crisis Prevention Institute (CPI)',['CERT_CRISIS_INTERVENTION'],'','Issuer homepage: https://www.crisisprevention.com/. A public card verification page was not confirmed; other de-escalation programs are verified with their own provider.','crisis\\s+prevention\\s+institute|\\bCPI\\b|nonviolent\\s+crisis'),
 ..._issuer('ancc','ANCC certification verification (American Nurses Credentialing Center)',['CERT_PMH_BC','CERT_GERO_BC','CERT_AMB_BC','CERT_NI_BC'],'https://www.nursingworld.org/certification/our-certifications/verification/','ANCC board certification verification.','american\\s+nurses\\s+credentialing\\s+center|\\bANCC\\b'),
 ..._issuer('ancb','Addictions Nursing Certification Board (ANCB)',['CERT_CARN'],'','Issuer homepage: https://www.intnsa.org/. A public verification page was not confirmed.','addictions\\s+nursing\\s+certification|\\bANCB\\b'),
 ..._issuer('occb','OASIS Certificate & Competency Board (OCCB)',['CERT_COS_C'],'','A public verification page was not confirmed (oasiscertificate.org did not answer on Oct 9, 2026).','OASIS\\s+certificate|\\bOCCB\\b'),
 ..._issuer('hpcc','Hospice & Palliative Credentialing Center (HPCC)',['CERT_CHPN'],'https://portal.advancingexpertcare.org/Portal/HPCC/CertificationWeb/Certification_Verification.aspx','HPCC certification verification portal.','hospice\\s*(&|and)\\s*palliative\\s+credentialing|\\bHPCC\\b'),
 ..._issuer('rncb-crrn','Rehabilitation Nursing Certification Board (ARN)',['CERT_CRRN'],'https://rehabnurse.org/crrn-certification/crrn-verification','CRRN verification on the ARN site.','rehabilitation\\s+nursing\\s+certification|association\\s+of\\s+rehabilitation\\s+nurses|\\bARN\\b'),
 ..._issuer('ncchc','National Commission on Correctional Health Care (NCCHC)',['CERT_CCHP_RN'],'','Issuer homepage: https://ncchc.org/. A public verification page was not confirmed.','correctional\\s+health\\s+care|\\bNCCHC\\b'),
 ..._issuer('state-education-dept','State education department (school nurse certificate)',['CERT_STATE_SCHOOL_NURSE'],'','Issued by the state education department of the state that requires it; confirm on that department\u2019s own educator-certificate lookup.','department\\s+of\\s+education|education\\s+department|educator\\s+certificat'),
 ..._issuer('nbcsn','National Board for Certification of School Nurses (NBCSN)',['CERT_NCSN'],'','Issuer homepage: https://www.nbcsn.org/. A public verification page was not confirmed.','certification\\s+of\\s+school\\s+nurses|\\bNBCSN\\b'),
 ..._issuer('abohn','American Board for Occupational Health Nurses (ABOHN)',['CERT_COHN'],'https://www.abohn.org/resources/verification','ABOHN verification.','occupational\\s+health\\s+nurses|\\bABOHN\\b'),
 ..._issuer('caohc','Council for Accreditation in Occupational Hearing Conservation (CAOHC)',['CERT_CAOHC'],'https://www.caohc.org/training-and-certifications/occupational-hearing-conservationist/ohc-online-credential-verification','OHC online credential verification.','occupational\\s+hearing\\s+conservation|\\bCAOHC\\b'),
 ..._issuer('wocncb','Wound, Ostomy and Continence Nursing Certification Board (WOCNCB)',['CERT_WOCN'],'https://www.wocncb.org/certification-verification','WOCNCB credential verification.','\\bWOCNCB\\b|wound,?\\s+ostomy'),
 ..._issuer('vacc','Vascular Access Certification Corporation (VACC)',['CERT_VA_BC'],'https://www.vacert.org/vacc-verify/','VA-BC verification.','vascular\\s+access\\s+certification|\\bVACC\\b'),
 ..._issuer('cbdce','Certification Board for Diabetes Care and Education (CBDCE)',['CERT_CDCES'],'https://www.cbdce.org/verify','CDCES verification.','diabetes\\s+care\\s+and\\s+education|\\bCBDCE\\b'),
 ..._issuer('fncb','Forensic Nursing Certification Board (IAFN)',['CERT_SANE'],'','A public verification page was not confirmed (forensicnurses.org did not answer on Oct 9, 2026).','forensic\\s+nursing\\s+certification|\\bIAFN\\b|\\bFNCB\\b'),
 ..._issuer('cbic','Certification Board of Infection Control and Epidemiology (CBIC)',['CERT_CIC'],'','Issuer homepage: https://www.cbic.org/. A public verification page was not confirmed.','infection\\s+control\\s+and\\s+epidemiology|\\bCBIC\\b'),
 ..._issuer('acma','American Case Management Association (ACMA)',['CERT_ACM_RN'],'','Issuer homepage: https://www.acmaweb.org/. A public verification page was not confirmed.','american\\s+case\\s+management\\s+association|\\bACMA\\b'),
 ..._issuer('ccmc','Commission for Case Manager Certification (CCMC)',['CERT_CCM'],'https://yourcommission.org/verify-certificant','CCM certificant verification.','case\\s+manager\\s+certification|\\bCCMC\\b'),
 {id:'education-registrar',name:'School registrar or National Student Clearinghouse',type:'CERTIFYING_BODY',jurisdiction:'',kinds:['EDU_BSN','EDU_ADN','EDU_CLINICAL_VERIFICATION','QUAL_MSN','QUAL_DNP'],method:'ISSUER',
  lookupUrl:'',api:{available:false,requirements:'DegreeVerify through the National Student Clearinghouse (paid per request) or a registrar letter.'},status:'APPROVED',notes:'Degrees are confirmed by the school that granted them: the registrar, or the National Student Clearinghouse (https://www.studentclearinghouse.org/).',docIssuer:'university|college|school\\s+of\\s+nursing|registrar'},
 {id:'employer-hr',name:'Employer verification (HR or manager)',type:'EMPLOYER',jurisdiction:'',kinds:_catKinds(k=>k.experience||/^(REF_|COMP_)/.test(k.kind)),method:'EMPLOYER',lookupUrl:'',
  api:{available:false,requirements:'Manual: HR employment-verification letter, manager reference, or employer competency record.'},status:'APPROVED',notes:'The verifier records who at the employer confirmed it (role and organization, not a personal email).'},
 {id:'screening-vendor',name:'Background / drug screening vendor report',type:'VENDOR',jurisdiction:'',kinds:_catKinds(k=>/^SCREEN_/.test(k.kind)),method:'VENDOR',lookupUrl:'',
  api:{available:false,requirements:'No vendor integration yet. The verifier records the vendor name and report reference.'},status:'APPROVED',notes:'Private result: organizations only ever see "Requirement satisfied".'},
 {id:'document-review',name:'Veridun document review',type:'PLATFORM',jurisdiction:'',kinds:_catKinds(k=>!RN_LICENSE_KINDS.includes(k.kind)),method:'DOCUMENT_REVIEW',lookupUrl:'',
  api:{available:false,requirements:'Manual review of the uploaded document.'},status:'APPROVED',notes:'Never primary-source verification. Not accepted for RN licenses.'},
 {id:'self-attestation',name:'Clinician self-attestation',type:'PLATFORM',jurisdiction:'',kinds:_catKinds(k=>/^SKILLS_/.test(k.kind)),method:'SELF_ATTESTED',lookupUrl:'',
  api:{available:false,requirements:'The nurse completes and attests the checklist.'},status:'APPROVED',notes:'Used for skills checklists, which are attestations by design.'},
 {id:'ai-extraction',name:'AI document extraction',type:'PLATFORM',jurisdiction:'',kinds:[],method:'AI_EXTRACTION',lookupUrl:'',
  api:{available:false,requirements:'Not built yet.'},status:'UNAPPROVED',notes:'Reads details (license number, dates) from an upload so the nurse can confirm them. It never verifies anything and gives no verification level.'}
];
const _sourceById=Object.fromEntries(VERIFICATION_SOURCES.map(s=>[s.id,s]));
function verificationSource(id){return _sourceById[id]||null}
function sourceLevel(s){return s?methodLevel(s.method):null}
/* Does source s cover this credential kind in this jurisdiction? Boards
   cover only their own jurisdiction; Nursys covers participating boards. */
function sourceCovers(s,kind,jur){
 if(!s||!s.kinds.includes(kind))return false;
 const j=normalizeJurisdictionCode(jur);
 if(s.type==='LICENSING_BOARD')return s.jurisdiction===j;
 if(s.jurisdictions)return!j||s.jurisdictions.includes(j);
 return true;
}
/* Sources a verifier may use for this credential, strongest first.
   onlyApproved (default) hides pending/unapproved ones. */
function sourcesForCredential(kind,jur,{onlyApproved=true}={}){
 return VERIFICATION_SOURCES.filter(s=>sourceCovers(s,kind,jur)&&(!onlyApproved||s.status==='APPROVED'))
  .sort((a,b)=>levelRank(sourceLevel(b))-levelRank(sourceLevel(a))||(a.type==='LICENSING_BOARD'?-1:b.type==='LICENSING_BOARD'?1:0));
}
/* The route the Verification Console suggests: for a license, the board's
   own confirmed lookup if there is one, else Nursys QuickConfirm. */
function primaryRouteFor(kind,jur){
 const list=sourcesForCredential(kind,jur);if(!list.length)return null;
 if(RN_LICENSE_KINDS.includes(kind)){
  const board=list.find(s=>s.type==='LICENSING_BOARD'),nq=list.find(s=>s.id==='nursys-quickconfirm');
  if(board?.lookupUrl)return board;return nq||board||null;
 }
 return list[0];
}

/* Minimum verification level per credential kind. Locked floors come from
   law or the issuer (only a board can confirm a license; only the issuer
   can confirm a certification) and facility rules can't lower them.
   Unlocked defaults are Veridun's platform default; a facility can raise
   them, or relax them. */
function kindFloor(kind){
 if(kind===RN_AUTHORIZATION||RN_LICENSE_KINDS.includes(kind))return{level:'PRIMARY_SOURCE_VERIFIED',locked:true,basis:'Legal floor: only the state board of nursing (or Nursys, with the boards\u2019 data) can confirm an RN license.'};
 const k=catalogKind(kind);
 if(k?.category==='Certifications')return{level:'ISSUER_VERIFIED',locked:true,basis:'Issuer floor: only the certifying body can confirm a certification.'};
 if(k?.experience||/^(REF_|COMP_)/.test(kind))return{level:'EMPLOYER_VERIFIED',locked:false,basis:'Veridun default: confirmed by an employer.'};
 if(/^SKILLS_/.test(kind))return{level:'SELF_ATTESTED',locked:false,basis:'Veridun default: skills checklists are completed and attested by the nurse.'};
 if(/^SCREEN_/.test(kind))return{level:'VENDOR_VERIFIED',locked:false,basis:'Veridun default: confirmed by the screening vendor\u2019s report.'};
 return{level:'DOCUMENT_REVIEWED',locked:false,basis:'Veridun default: a person reviewed the document.'};
}
/* Required level for one requirement in one assignment. A facility may set
   overrides.minLevel[kind]. It can always raise the level; it can lower an
   unlocked default; it can never lower a locked floor. */
function requiredLevelFor(kind,a){
 const f=kindFloor(kind),want=a?.overrides?.minLevel?.[kind===RN_AUTHORIZATION?'RN_LICENSE':kind];
 if(!want||!verificationLevel(want))return{level:f.level,setBy:f.locked?'floor':'default',basis:f.basis,locked:f.locked};
 if(levelRank(want)>=levelRank(f.level))return{level:want,setBy:'facility',basis:`Raised by ${a.facility||a.name}.`,locked:f.locked};
 if(f.locked)return{level:f.level,setBy:'floor',basis:f.basis+` ${a.facility||a.name} asked for ${levelLabel(want)}; the floor was kept.`,locked:true,attempted:want};
 return{level:want,setBy:'facility',basis:`Relaxed by ${a.facility||a.name} from the Veridun default (${levelLabel(f.level)}).`,locked:false};
}
/* The level a credential has right now. Account credentials carry the
   level the database recorded. Demo credentials verified by the simulated
   console or the demo seed get the floor for their kind (labelled DEMO). */
function credentialLevel(c){
 if(!c)return null;
 if(!['VERIFIED'].includes(c.primary))return null;
 if(c.prov&&c.prov.active===false)return null;
 if(c.verificationLevel)return c.verificationLevel;
 if(c.remote_id)return null;
 return kindFloor(c.kind).level;
}
function credentialLevelIsDemo(c){return!!c&&!c.remote_id}
