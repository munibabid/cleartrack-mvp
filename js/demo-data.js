/* DEMO DATA ONLY — nothing here is real verification.
   Alex Morgan, ICU RN. Home state Arizona (NLC member) with a multistate
   license, plus a single-state California license. Alex's reusable Passport
   already satisfies 11 of the 12 Boston Travel ICU requirements; the only
   gap is a Massachusetts RN license (Massachusetts has enacted the NLC but it
   is not yet in effect, so the Arizona compact license is not honored there).
   Expiration dates are offsets (days) from the demo anchor, so they stay valid
   through every demo assignment. */
const DEMO_SEED_VERSION='3';
const DEMO_SEED_VERSION_KEY='veridun_demo_seed_version';
const DEMO_PROFILE={name:'Alex Morgan',credentials:'RN, BSN, CCRN',specialty:'ICU',homeState:'US-AZ'};
/* [kind, jurisdiction, expiresInDays|null, requiredForOnboardingBaseline, extra]
   extra: {name, years, lastWorkedDays} for employer-verified experience. */
const DEMO_SEED=[
 ['RN_LICENSE_MULTISTATE','US-AZ',540,true],
 ['RN_LICENSE','US-CA',570,false],
 ['CERT_BLS','',400,true],['CERT_ACLS','',480,true],['CERT_NIHSS','',300,false],
 ['EMP_ICU_VERIFIED','',null,true,{name:'ICU Experience — 3 yrs, Employer Verified',years:3,lastWorkedDays:-21}],
 ['SKILLS_ICU','',365,true,{name:'ICU Skills Checklist — completed & attested'}],['REF_SPECIALTY','',365,true,{name:'ICU Specialty Reference Evaluation'}],
 ['COMP_CRRT','',365,false,{name:'CRRT Competency — employer validated'}],['COMP_VENTILATOR','',365,false,{name:'Ventilator Management Competency — employer validated'}],
 ['HEALTH_PHYSICAL_CURRENT','',330,true],['HEALTH_FIT_TEST','',300,true],['HEALTH_TB_CURRENT','',280,true],['HEALTH_FLU_CURRENT','',200,true],
 ['SCREEN_DRUG_CURRENT','',250,true],['SCREEN_BACKGROUND_CURRENT','',250,true],
 ['EDU_BSN','',null,false],['CERT_CCRN','',700,false]
];
/* Static comparison candidates for the Organization view (clearly labeled). */
const DEMO_CANDIDATES=[{name:'Jamie Smith',specialty:'ICU',ok:11,total:12,status:'Missing 1 (static demo)'},{name:'Taylor Reed',specialty:'PCU',ok:8,total:12,status:'Needs attention (static demo)'}];
/* Comparison nurses with other specialties (DEMO, read-only). Their
   credentials are static, generated from the same catalog, and evaluated by
   the same readiness engine as Alex — each with their own specialty module.
   [kind, jurisdiction, expiresInDays|null] */
const DEMO_NURSES=[
 {id:'alex',...DEMO_PROFILE,live:true},
 {id:'jordan',name:'Jordan Rivera',credentials:'RN, BSN, CEN',specialty:'ED',homeState:'US-CO',seed:[
  ['RN_LICENSE_MULTISTATE','US-CO',500],['RN_LICENSE','US-CA',420],['CERT_BLS','',380],['CERT_ACLS','',420],['CERT_PALS','',460],['CERT_CEN','',800],
  ['EMP_ED_VERIFIED','',null,{name:'ED Experience — 5 yrs, Employer Verified',years:5,lastWorkedDays:-45}],['SKILLS_ED','',365,{name:'ED Skills Checklist — completed & attested'}],['REF_SPECIALTY','',365,{name:'ED Specialty Reference Evaluation'}],['HEALTH_PHYSICAL_CURRENT','',300],['HEALTH_FIT_TEST','',300],['HEALTH_TB_CURRENT','',260],['HEALTH_FLU_CURRENT','',200],
  ['SCREEN_DRUG_CURRENT','',240],['SCREEN_BACKGROUND_CURRENT','',240]]},
 {id:'sam',name:'Sam Okafor',credentials:'RN, BSN',specialty:'LD',homeState:'US-CA',seed:[
  ['RN_LICENSE','US-CA',610],['CERT_BLS','',350],['CERT_NRP','',500],['CERT_FETAL_MONITORING','',640],
  ['EMP_LD_VERIFIED','',null,{name:'L&D Experience — 4 yrs, Employer Verified',years:4,lastWorkedDays:-30}],['SKILLS_LD','',365,{name:'L&D Skills Checklist — completed & attested'}],['REF_SPECIALTY','',365,{name:'L&D Specialty Reference Evaluation'}],['HEALTH_PHYSICAL_CURRENT','',310],['HEALTH_FIT_TEST','',290],['HEALTH_TB_CURRENT','',270],['HEALTH_FLU_CURRENT','',210],['HEALTH_HEPB','',null],
  ['SCREEN_DRUG_CURRENT','',230],['SCREEN_BACKGROUND_CURRENT','',230]]}
];
function experienceFields(x,anchor){return x&&x.years!=null?{years:x.years,lastWorked:isoDay(addDays(anchor,x.lastWorkedDays||0))}:{}}
function demoNurse(id){return DEMO_NURSES.find(n=>n.id===id)||DEMO_NURSES[0]}
function nurseCreds(n){
 if(!n||n.live)return creds;
 const anchor=demoAnchor();
 return n.seed.map(([kind,jur,days,x],i)=>({id:`${n.id}-${i}`,name:x?.name||credentialDisplayName(kind,jur),kind,jurisdiction:jur,...experienceFields(x,anchor),primary:'VERIFIED',expiration:days==null?'':isoDay(addDays(anchor,days)),prov:{source:issuerFor(kind,jur)+' (demo seed)',active:true}}));
}
function demoSeedCredentials(){
 const anchor=demoAnchor(),verifiedAt=addDays(anchor,-1).toISOString(),now=new Date().toISOString();
 return DEMO_SEED.map(([kind,jur,days,required,x],i)=>v81Normalize({id:Date.now()+i,name:x?.name||credentialDisplayName(kind,jur),...experienceFields(x,anchor),kind,type:credentialTypeCode(kind,jur),jurisdiction:jur,section:catalogKind(kind).section,required,primary:'VERIFIED',chain:'NOT ISSUED',expiration:days==null?'':isoDay(addDays(anchor,days)),file:'',prov:{source:issuerFor(kind,jur)+' (demo seed)',method:'Demo verification',verifier:'DEMO SEED (not a real verification)',verifiedAt,active:true,lastMonitored:now}}));
}
/* Loads saved demo data; (re)seeds on first run, on Reset Demo Data, or when
   the stored data predates the current demo seed version. Never called
   from rendering. */
function initNewcomer(force=false){
 if(!force){try{creds=JSON.parse(localStorage.getItem(SK)||'[]')}catch{creds=[]}
  if(creds.length&&localStorage.getItem(DEMO_SEED_VERSION_KEY)===DEMO_SEED_VERSION){creds=creds.map(v81Normalize);return}}
 const reason=force?'RESET':creds.length?'SEED_UPGRADE':'FIRST_RUN';
 localStorage.setItem(DEMO_ANCHOR_KEY,new Date().toISOString().slice(0,10));
 localStorage.removeItem('veridun_shares');localStorage.removeItem('veridun_share_requests');localStorage.removeItem('veridun_custom_assignments');
 creds=demoSeedCredentials();save();localStorage.setItem(DEMO_SEED_VERSION_KEY,DEMO_SEED_VERSION);
 v81Log('DEMO_SEEDED',null,{actor_type:'SYSTEM',result:`DEMO_SEED_${creds.length}_CREDENTIALS`,detail:{reason,version:DEMO_SEED_VERSION}});
}
