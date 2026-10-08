/* Organizations and opportunities (DEMO DATA, fictional names).
   An opportunity = work type + state + dates + facility, and lists the
   specialties it accepts. Readiness is computed per nurse with the module
   for that nurse's own specialty (see requirements.js). Dates are relative to
   the demo anchor so the demo never goes stale.
   Boston: Massachusetts has enacted the NLC but it is not yet in effect, so a
   compact license does NOT authorize practice there. Houston: Texas honors
   the compact. Oakland: California is not an NLC state. */
const ORGANIZATIONS=[
 {id:'northstar',name:'Northstar Travel Nursing',type:'Travel staffing agency (demo)'},
 {id:'lonestar',name:'Lone Star Rapid Response',type:'Rapid response agency (demo)'},
 {id:'pacific',name:'Pacific Strike Staffing',type:'Strike staffing agency (demo)'},
 {id:'summit',name:'Summit Per Diem Partners',type:'Per-diem staffing agency (demo)'}
];
function organization(id){return ORGANIZATIONS.find(o=>o.id===id)||null}
const ASSIGNMENT_DEFS=[
 {id:'boston-icu',orgId:'northstar',name:'Boston Travel ICU',city:'Boston',jurisdiction:'US-MA',workType:'TRAVEL_RN',specialties:['ICU'],facility:'Beacon Harbor Medical Center (demo facility)',overrides:{},startInDays:45,weeks:13,featured:true},
 {id:'houston-rapid',orgId:'lonestar',name:'Houston Rapid Response ICU',city:'Houston',jurisdiction:'US-TX',workType:'RAPID_RESPONSE_RN',specialties:['ICU'],facility:'Bayou City General (demo facility)',overrides:{add:['COMP_VENTILATOR'],note:'Rapid-response ICU: ventilator management competency required'},startInDays:21,weeks:8},
 {id:'oakland-strike',orgId:'pacific',name:'Oakland Strike RN',city:'Oakland',jurisdiction:'US-CA',workType:'STRIKE_RN',specialties:['ICU','ED','LD'],facility:'Eastbay Union Hospital (demo facility)',overrides:{},startInDays:7,weeks:6},
 {id:'phoenix-ed',orgId:'northstar',name:'Phoenix Travel ED',city:'Phoenix',jurisdiction:'US-AZ',workType:'TRAVEL_RN',specialties:['ED'],facility:'Saguaro Valley Medical Center (demo facility)',overrides:{waive:['HEALTH_PHYSICAL_CURRENT'],note:'Facility completes its own occupational-health physical at orientation'},startInDays:30,weeks:13},
 {id:'denver-ld',orgId:'summit',name:'Denver Per-Diem L&D',city:'Denver',jurisdiction:'US-CO',workType:'PER_DIEM_RN',specialties:['LD'],facility:"Front Range Women's Hospital (demo facility)",overrides:{add:['HEALTH_HEPB'],note:'Facility policy: Hepatitis B immunity for all perinatal staff'},startInDays:14,weeks:12}
];
const DEMO_ANCHOR_KEY='veridun_demo_anchor',CUSTOM_ASSIGNMENTS_KEY='veridun_custom_assignments';
function demoAnchor(){const s=localStorage.getItem(DEMO_ANCHOR_KEY);return s?new Date(s+'T00:00:00'):new Date(new Date().toISOString().slice(0,10)+'T00:00:00')}
function isoDay(d){return d.toISOString().slice(0,10)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
/* Assignments published from the org Assignment Builder (this browser only). */
function loadCustomAssignments(){try{return JSON.parse(localStorage.getItem(CUSTOM_ASSIGNMENTS_KEY)||'[]')}catch{return[]}}
function saveCustomAssignments(a){localStorage.setItem(CUSTOM_ASSIGNMENTS_KEY,JSON.stringify(a))}
function finishAssignment(d,start,end){
 const wt=workTypeBase(d.workType),primary=assignmentAccepts(d,DEMO_PROFILE.specialty)?DEMO_PROFILE.specialty:(d.specialties||[])[0];
 return{...d,start,end,workTypeName:wt?.name||d.workType,specialtyText:(d.specialties||[]).map(specialtyShort).join(' · '),templateName:`${wt?.name||d.workType} · ${(d.specialties||[]).map(specialtyShort).join(' / ')}`,reqs:layeredRequirements(d,primary)};
}
function getAssignments(){
 const a=demoAnchor();
 const fixed=ASSIGNMENT_DEFS.map(d=>{const start=addDays(a,d.startInDays),end=addDays(start,d.weeks*7);return finishAssignment(d,isoDay(start),isoDay(end))});
 return[...fixed,...loadCustomAssignments().map(d=>finishAssignment(d,d.start,d.end))];
}
function getAssignment(id){return getAssignments().find(a=>a.id===id)||null}
function featuredAssignment(){const all=getAssignments();return all.find(a=>a.featured)||all[0]}
