/* Assignment definitions (DEMO DATA). Dates are relative to the demo anchor
   (the day demo data was seeded) so the demo never silently goes stale.
   Featured: Boston (Massachusetts — NLC enacted but not yet in effect, so a
   compact license does NOT authorize practice there) and Houston (Texas —
   NLC member, so Alex's Arizona multistate license is honored). */
const ASSIGNMENT_DEFS=[
 {id:'boston-icu',name:'Boston Travel ICU',city:'Boston',jurisdiction:'US-MA',template:'TRAVEL_ICU_RN',startInDays:45,weeks:13,featured:true},
 {id:'houston-rapid',name:'Houston Rapid Response ICU',city:'Houston',jurisdiction:'US-TX',template:'RAPID_RESPONSE_RN',startInDays:21,weeks:8},
 {id:'oakland-strike',name:'California Strike ICU',city:'Oakland',jurisdiction:'US-CA',template:'STRIKE_ICU_RN',startInDays:7,weeks:6}
];
const DEMO_ANCHOR_KEY='veridun_demo_anchor';
function demoAnchor(){const s=localStorage.getItem(DEMO_ANCHOR_KEY);return s?new Date(s+'T00:00:00'):new Date(new Date().toISOString().slice(0,10)+'T00:00:00')}
function isoDay(d){return d.toISOString().slice(0,10)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function getAssignments(){const a=demoAnchor();return ASSIGNMENT_DEFS.map(d=>{const start=addDays(a,d.startInDays),end=addDays(start,d.weeks*7);return{...d,start:isoDay(start),end:isoDay(end),templateName:requirementTemplate(d.template)?.name||d.template,reqs:templateRequirements(d.template,d.jurisdiction)}})}
function getAssignment(id){return getAssignments().find(a=>a.id===id)||null}
function featuredAssignment(){const all=getAssignments();return all.find(a=>a.featured)||all[0]}
