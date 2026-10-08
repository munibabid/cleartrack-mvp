/* DEMO DATA ONLY — nothing here is real verification.
   Alex Morgan, ICU RN. Home state Arizona (NLC member) with a multistate
   license, plus a single-state California license. Alex's reusable Passport
   already satisfies 11 of the 12 Boston Travel ICU requirements; the only
   gap is a Massachusetts RN license (Massachusetts has enacted the NLC but it
   is not yet in effect, so the Arizona compact license is not honored there).
   Expiration dates are offsets (days) from the demo anchor, so they stay valid
   through every demo assignment. */
const DEMO_SEED_VERSION='2';
const DEMO_SEED_VERSION_KEY='veridun_demo_seed_version';
const DEMO_PROFILE={name:'Alex Morgan',credentials:'RN, BSN, CCRN',specialty:'ICU',homeState:'US-AZ'};
/* [kind, jurisdiction, expiresInDays|null, requiredForOnboardingBaseline] */
const DEMO_SEED=[
 ['RN_LICENSE_MULTISTATE','US-AZ',540,true],
 ['RN_LICENSE','US-CA',570,false],
 ['CERT_BLS','',400,true],['CERT_ACLS','',480,true],['CERT_NIHSS','',300,true],
 ['EMP_ICU_VERIFIED','',null,true],['CLINICAL_HOURS_VERIFIED','',null,true],
 ['HEALTH_PHYSICAL_CURRENT','',330,true],['HEALTH_FIT_TEST','',300,true],['HEALTH_TB_CURRENT','',280,true],['HEALTH_FLU_CURRENT','',200,true],
 ['SCREEN_DRUG_CURRENT','',250,true],['SCREEN_BACKGROUND_CURRENT','',250,true],
 ['EDU_BSN','',null,false],['CERT_CCRN','',700,false]
];
/* Static comparison candidates for the Organization view (clearly labeled). */
const DEMO_CANDIDATES=[{name:'Jamie Smith',specialty:'ICU',ok:11,total:12,status:'Missing 1 (static demo)'},{name:'Taylor Reed',specialty:'PCU',ok:8,total:12,status:'Needs attention (static demo)'}];
function demoSeedCredentials(){
 const anchor=demoAnchor(),verifiedAt=addDays(anchor,-1).toISOString(),now=new Date().toISOString();
 return DEMO_SEED.map(([kind,jur,days,required],i)=>v81Normalize({id:Date.now()+i,name:credentialDisplayName(kind,jur),kind,type:credentialTypeCode(kind,jur),jurisdiction:jur,section:catalogKind(kind).section,required,primary:'VERIFIED',chain:'NOT ISSUED',expiration:days==null?'':isoDay(addDays(anchor,days)),file:'',prov:{source:issuerFor(kind,jur)+' (demo seed)',method:'Demo verification',verifier:'DEMO SEED (not a real verification)',verifiedAt,active:true,lastMonitored:now}}));
}
/* Loads saved demo data; (re)seeds on first run, on Reset Demo Data, or when
   the stored data predates the current demo seed version. Never called
   from rendering. */
function initNewcomer(force=false){
 if(!force){try{creds=JSON.parse(localStorage.getItem(SK)||'[]')}catch{creds=[]}
  if(creds.length&&localStorage.getItem(DEMO_SEED_VERSION_KEY)===DEMO_SEED_VERSION){creds=creds.map(v81Normalize);return}}
 const reason=force?'RESET':creds.length?'SEED_UPGRADE':'FIRST_RUN';
 localStorage.setItem(DEMO_ANCHOR_KEY,new Date().toISOString().slice(0,10));
 creds=demoSeedCredentials();save();localStorage.setItem(DEMO_SEED_VERSION_KEY,DEMO_SEED_VERSION);
 v81Log('DEMO_SEEDED',null,{actor_type:'SYSTEM',result:`DEMO_SEED_${creds.length}_CREDENTIALS`,detail:{reason,version:DEMO_SEED_VERSION}});
}
