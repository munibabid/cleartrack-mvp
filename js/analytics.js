/* Append-only event log (localStorage) and event-derived metrics.
   Every metric shown in the Organization and Verification views is computed
   from these events or from current credential state — no hardcoded numbers. */
const V81_EVENTS='nursecredx_v81_events';
function v81Events(){try{return JSON.parse(localStorage.getItem(V81_EVENTS)||'[]')}catch{return[]}}
function v81Log(type,id=null,extra={}){const e=v81Events();e.push({event_id:'e'+Date.now()+Math.random().toString(16).slice(2),event_type:type,credential_id:id,assignment_id:extra.assignment_id||null,timestamp:extra.timestamp||new Date().toISOString(),actor_type:extra.actor_type||'SYSTEM',verification_method:extra.verification_method||null,result:extra.result||null,duration_ms:extra.duration_ms??null,manual_intervention:!!extra.manual_intervention,detail:extra.detail||null});localStorage.setItem(V81_EVENTS,JSON.stringify(e))}
function v81Median(a){if(!a.length)return null;a=[...a].sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
/* Real elapsed time from VERIFICATION_STARTED (logged at upload/submission)
   to VERIFICATION_SUCCEEDED for each credential. */
function v81Durations(){const ev=v81Events(),g={};ev.forEach(x=>{if(x.credential_id)(g[x.credential_id]??=[]).push(x)});const d=[];Object.values(g).forEach(es=>{const s=es.find(x=>x.event_type==='VERIFICATION_STARTED'),f=es.find(x=>x.event_type==='VERIFICATION_SUCCEEDED');if(s&&f)d.push(new Date(f.timestamp)-new Date(s.timestamp))});return d}
function v81Fmt(ms){if(ms==null)return'—';const s=Math.round(ms/1000);if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s';return Math.floor(s/3600)+'h '+String(Math.floor(s%3600/60)).padStart(2,'0')+'m'}
/* Events since the most recent demo (re)seed — the current demo session. */
function eventsSinceSeed(){const ev=v81Events();let i=-1;ev.forEach((e,k)=>{if(e.event_type==='DEMO_SEEDED')i=k});return ev.slice(i+1)}
function manualTouches(ev=v81Events()){return ev.filter(e=>e.manual_intervention).length}
/* Assignment metrics, derived from ASSIGNMENT_INTEREST / ASSIGNMENT_READY. */
function assignmentMetrics(aid,ev=eventsSinceSeed()){
 const interest=[...ev].reverse().find(e=>e.event_type==='ASSIGNMENT_INTEREST'&&e.assignment_id===aid);
 if(!interest)return null;
 const d=interest.detail||{},total=d.total||0,newReq=d.missing??null;
 const ready=ev.find(e=>e.event_type==='ASSIGNMENT_READY'&&e.assignment_id===aid&&e.timestamp>=interest.timestamp);
 return{total,newCredentialsRequired:newReq,reused:total&&newReq!=null?total-newReq:null,reuseRate:total&&newReq!=null?(total-newReq)/total:null,readinessMs:ready?ready.duration_ms:null};
}
function fmtPct(x){return x==null?'—':Math.round(x*100)+'%'}
/* Share of verified credentials monitored in the last 30 days (demo: the
   "last monitored" timestamp is set by the simulated check or demo seed). */
function monitoringCoverage(){const v=creds.filter(c=>c.primary==='VERIFIED');if(!v.length)return null;const cut=Date.now()-30*86400000;return v.filter(c=>c.prov?.lastMonitored&&new Date(c.prov.lastMonitored).getTime()>=cut).length/v.length}
function sharingActivity(ev=v81Events()){return ev.filter(e=>e.event_type==='SHARE_LINK_CREATED').length}
