/* Layered requirement sets (data-driven, DEMO TEMPLATES).
   A nurse's requirements for an opportunity are assembled from layers, the
   way staffing agencies build them:
     1. STATE      — RN authorization in the assignment's state (single-state
                     license there, or an honored NLC multistate license)
     2. WORK_TYPE  — base set for the kind of work (Travel, Strike, ...)
     3. SPECIALTY  — module for the NURSE'S OWN profile specialty, used only
                     when the opportunity accepts that specialty
     4. FACILITY   — assignment/facility overrides that add or waive items
   plus DATES: every item must stay current through the assignment end date.
   All templates below are illustrative demo templates, not any real agency's
   or facility's requirements. */
/* Specialties live in js/specialties.js (one shared list, PR 11). */
const WORK_TYPE_BASES=[
 {id:'TRAVEL_RN',name:'Travel RN',summary:'Multi-week contracts away from home',kinds:['CERT_BLS','HEALTH_PHYSICAL_CURRENT','HEALTH_FIT_TEST','HEALTH_TB_CURRENT','HEALTH_FLU_CURRENT','SCREEN_DRUG_CURRENT','SCREEN_BACKGROUND_CURRENT']},
 {id:'STRIKE_RN',name:'Strike RN',summary:'Short-notice labor-action coverage',kinds:['CERT_BLS','HEALTH_PHYSICAL_CURRENT','HEALTH_FIT_TEST','SCREEN_DRUG_CURRENT','SCREEN_BACKGROUND_CURRENT']},
 {id:'RAPID_RESPONSE_RN',name:'Rapid Response RN',summary:'Crisis deployment within days',kinds:['CERT_BLS','HEALTH_TB_CURRENT','HEALTH_FIT_TEST','SCREEN_DRUG_CURRENT','SCREEN_BACKGROUND_CURRENT']},
 {id:'PER_DIEM_RN',name:'Per-Diem RN',summary:'Local shifts as needed',kinds:['CERT_BLS','HEALTH_TB_CURRENT','HEALTH_FLU_CURRENT','SCREEN_DRUG_CURRENT','SCREEN_BACKGROUND_CURRENT']}
];
/* Specialty modules: certifications plus clinical qualifications for an
   experienced RN — employer-verified recent specialty experience, a
   completed specialty skills checklist, and a specialty reference. (School
   clinical hours are not relevant for travel/strike RNs.) Generated from
   js/specialties.js: SPECIALTY_MODULES holds the REQUIRED items (they count
   toward readiness); SPECIALTY_PREFERRED is shown but never blocks. */
const SPECIALTY_MODULES=Object.fromEntries(SPECIALTIES.map(s=>[s.id,s.required]));
const SPECIALTY_PREFERRED=Object.fromEntries(SPECIALTIES.map(s=>[s.id,s.preferred]));
function specialtyPreferred(id){return SPECIALTY_PREFERRED[id]||[]}
/* Recent-experience rule for one requirement: minimum months of work in the
   specialty within a window before the assignment start. Defaults to the
   catalog kind (12 of the last 24 months); an organization can set its own
   per assignment (overrides.experience) — see the Assignment Builder. */
function experienceRule(kind,ov){const k=catalogKind(kind);if(!k?.recencyMonths)return null;const o=(ov&&ov.experience)||{};
 const windowMonths=Math.max(1,Math.min(120,+o.windowMonths||k.recencyMonths)),minMonths=Math.max(1,Math.min(windowMonths,+o.minMonths||k.minMonths||windowMonths));
 return{minMonths,windowMonths,custom:!!(o.minMonths||o.windowMonths)}}
const LAYERS={STATE:'State',WORK_TYPE:'Work type',SPECIALTY:'Specialty',FACILITY:'Facility'};
function workTypeBase(id){return WORK_TYPE_BASES.find(w=>w.id===id)||null}
function assignmentAccepts(a,specialty){return(a.specialties||[]).includes(specialty)}
/* The specialty a nurse is evaluated with for an opportunity: the primary
   specialty if accepted, else the first accepted secondary specialty. */
function matchedSpecialty(a,n){return[n?.specialty,...(n?.secondarySpecialties||[])].filter(Boolean).find(sp=>assignmentAccepts(a,sp))||null}
/* Merge the layers for one assignment + one specialty. Each requirement
   carries its layer and the authority that imposes it. A kind already
   required by an earlier layer keeps that earlier authority. */
function layeredRequirements(a,specialty){
 const base=workTypeBase(a.workType),ov=a.overrides||{},waive=ov.waive||[],out=[],seen=new Set();
 const push=(kind,layer,authority)=>{if(seen.has(kind))return;seen.add(kind);const x=experienceRule(kind,ov),r={kind,layer,authority};if(x){r.minMonths=x.minMonths;r.windowMonths=x.windowMonths;if(x.custom)r.experienceSetBy=a.facility||a.name}out.push(r)};
 const j=normalizeJurisdictionCode(a.jurisdiction);seen.add(RN_AUTHORIZATION);
 out.push({kind:RN_AUTHORIZATION,jurisdiction:j,layer:'STATE',authority:`State licensure · ${issuerFor('RN_LICENSE',j)}`});
 (base?.kinds||[]).filter(k=>!waive.includes(k)).forEach(k=>push(k,'WORK_TYPE',`${base.name} base set (demo template)`));
 if(specialty)(SPECIALTY_MODULES[specialty]||[]).forEach(k=>push(k,'SPECIALTY',`${specialtyName(specialty)} module (demo template)`));
 (ov.add||[]).forEach(k=>push(k,'FACILITY',`Facility override · ${a.facility||a.name}`));
 return out;
}
function layerCounts(reqs){const c={STATE:0,WORK_TYPE:0,SPECIALTY:0,FACILITY:0};reqs.forEach(r=>c[r.layer]++);return c}

/* Newcomer onboarding baseline (clinician Home): what the featured Boston
   Travel ICU opportunity asks of an ICU nurse, minus the state license. */
const NEWCOMER_BASELINE_KINDS=[...workTypeBase('TRAVEL_RN').kinds,...SPECIALTY_MODULES.ICU];
function isBaselineRequired(kind){if(!NEWCOMER_BASELINE_KINDS.includes(kind))return false;return!creds.some(c=>c.required&&c.kind===kind)}
/* XRPL proof is NOT required — a verified, active, unexpired credential counts. */
function reqSatisfied(c){if(!c.required)return true;if(c.primary!=='VERIFIED'||!c.prov?.active)return false;const exp=c.official_expiration_date||c.expiration;return!(exp&&new Date(exp+'T23:59:59')<new Date())}
function onboarding(){const req=creds.filter(c=>c.required),ok=req.filter(reqSatisfied).length,pct=req.length?Math.round(ok/req.length*100):0;return{req,ok,pct,ready:req.length>0&&ok===req.length}}
