/* Append-only event log (localStorage) and event-derived metrics. */
const V81_EVENTS='nursecredx_v81_events';
function v81Events(){try{return JSON.parse(localStorage.getItem(V81_EVENTS)||'[]')}catch{return[]}}
function v81Log(type,id=null,extra={}){const e=v81Events();e.push({event_id:'e'+Date.now()+Math.random().toString(16).slice(2),event_type:type,credential_id:id,timestamp:extra.timestamp||new Date().toISOString(),actor_type:extra.actor_type||'SYSTEM',verification_method:extra.verification_method||null,result:extra.result||null,duration_ms:extra.duration_ms||null,manual_intervention:!!extra.manual_intervention});localStorage.setItem(V81_EVENTS,JSON.stringify(e))}
function v81Median(a){if(!a.length)return null;a=[...a].sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function v81Durations(){const ev=v81Events(),g={};ev.forEach(x=>{if(x.credential_id)(g[x.credential_id]??=[]).push(x)});const d=[];Object.values(g).forEach(es=>{const s=es.find(x=>x.event_type==='VERIFICATION_STARTED'),f=es.find(x=>x.event_type==='VERIFICATION_SUCCEEDED');if(s&&f)d.push(new Date(f.timestamp)-new Date(s.timestamp))});return d}
function v81Fmt(ms){if(ms==null)return'—';const s=Math.round(ms/1000);return s<60?s+'s':Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s'}
