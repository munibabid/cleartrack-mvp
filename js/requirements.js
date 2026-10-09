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
 const push=(kind,layer,authority)=>{if(seen.has(kind))return;seen.add(kind);const x=experienceRule(kind,ov),r={kind,layer,authority};if(x){r.minMonths=x.minMonths;r.windowMonths=x.windowMonths;if(x.custom)r.experienceSetBy=a.facility||a.name}out.push(withPolicy(r,a,specialty))};
 const j=normalizeJurisdictionCode(a.jurisdiction);seen.add(RN_AUTHORIZATION);
 out.push(withPolicy({kind:RN_AUTHORIZATION,jurisdiction:j,layer:'STATE',authority:`State licensure · ${issuerFor('RN_LICENSE',j)}`},a,specialty));
 (base?.kinds||[]).filter(k=>!waive.includes(k)).forEach(k=>push(k,'WORK_TYPE',`${base.name} base set (demo template)`));
 if(specialty)(SPECIALTY_MODULES[specialty]||[]).forEach(k=>push(k,'SPECIALTY',`${specialtyName(specialty)} module (demo template)`));
 (ov.add||[]).forEach(k=>push(k,'FACILITY',`Facility override · ${a.facility||a.name}`));
 return out;
}
/* Policy traceability (PR 13). Every requirement says which policy imposed
   it (id + version + who requires it + effective date), the minimum
   verification level, and the validity rule. The assignment's own policy
   (the facility/agency policy that adopts the layers) is attached too.
   Template versions are Veridun DEMO templates, not a real facility's. */
const POLICY_VERSIONS={WORK_TYPE:{version:'2026.1',effective:'2026-10-01'},SPECIALTY:{version:'2026.2',effective:'2026-10-08'}};
function assignmentPolicy(a){
 if(a?.policy)return{...a.policy};
 return{id:'ASG-'+String(a?.id||'check').toUpperCase(),version:'1',effective:a?.publishedOn||a?.start||'',requiredBy:a?.facility||a?.name||'Assignment',demo:true};
}
function withPolicy(r,a,specialty){
 const j=r.jurisdiction,lvl=requiredLevelFor(r.kind,a);let policy;
 if(r.layer==='STATE')policy={id:`STATE-${String(j).replace('US-','')}-RN-AUTH`,version:CATALOG_AS_OF,requiredBy:`${issuerFor('RN_LICENSE',j)} (state nurse practice act)`,effective:'In force',source:'State law · reference data checked '+CATALOG_AS_OF};
 else if(r.layer==='WORK_TYPE'){const b=workTypeBase(a.workType);policy={id:`VDN-${a.workType}-BASE`,version:POLICY_VERSIONS.WORK_TYPE.version,requiredBy:`${b?.name||a.workType} base set (Veridun demo template)`,effective:POLICY_VERSIONS.WORK_TYPE.effective}}
 else if(r.layer==='SPECIALTY')policy={id:`VDN-SPEC-${specialty}`,version:POLICY_VERSIONS.SPECIALTY.version,requiredBy:`${specialtyName(specialty)} module (Veridun demo template)`,effective:POLICY_VERSIONS.SPECIALTY.effective};
 else{const ap=assignmentPolicy(a);policy={id:ap.id,version:ap.version,requiredBy:ap.requiredBy,effective:ap.effective}}
 const exp=r.minMonths?`At least ${r.minMonths} months of this specialty in the ${r.windowMonths} months before the start date${a?.start?' ('+a.start+')':''}`:null;
 const validity=r.kind===RN_AUTHORIZATION?`Must authorize RN practice in ${jurisdictionName(j)} and stay active through the assignment end${a?.end?' ('+a.end+')':''}`:exp||`Must stay valid through the assignment end${a?.end?' ('+a.end+')':''}`;
 return{...r,minLevel:lvl.level,levelRule:lvl,policy,assignmentPolicy:assignmentPolicy(a),validityRule:validity};
}
function layerCounts(reqs){const c={STATE:0,WORK_TYPE:0,SPECIALTY:0,FACILITY:0};reqs.forEach(r=>c[r.layer]++);return c}

/* Newcomer onboarding baseline (clinician Home): what the featured Boston
   Travel ICU opportunity asks of an ICU nurse, minus the state license. */
const NEWCOMER_BASELINE_KINDS=[...workTypeBase('TRAVEL_RN').kinds,...SPECIALTY_MODULES.ICU];
function isBaselineRequired(kind){if(!NEWCOMER_BASELINE_KINDS.includes(kind))return false;return!creds.some(c=>c.required&&c.kind===kind)}
/* XRPL proof is NOT required — a verified, active, unexpired credential counts. */
function reqSatisfied(c){if(!c.required)return true;if(c.primary!=='VERIFIED'||!c.prov?.active)return false;const exp=c.official_expiration_date||c.expiration;return!(exp&&new Date(exp+'T23:59:59')<new Date())}
/* PR 13: a Passport is only complete with a verified RN license. */
function onboarding(){const req=creds.filter(c=>c.required),ok=req.filter(reqSatisfied).length,pct=req.length?Math.round(ok/req.length*100):0,license=creds.some(c=>(c.kind==='RN_LICENSE'||c.kind==='RN_LICENSE_MULTISTATE')&&reqSatisfied({...c,required:true}));return{req,ok,pct,license,ready:req.length>0&&ok===req.length&&license}}
