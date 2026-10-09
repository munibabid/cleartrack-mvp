/* PR 14 test helper: an in-page fake Supabase client so the account UI
   (scan → confirm → save, re-scan, verifier form, accuracy panel) can be
   exercised without a database. It mimics the two database rules that
   matter here: PRIVATE kinds refuse metadata, and extraction_events only
   accepts known field names and numeric confidences. Injected with
   page.evaluate(FAKE_SRC). Nothing leaves the page. */
module.exports = String.raw`(function(){
const db={credentials:[],audit_events:[],extraction_events:[],clinicians:[],storage:{}};
window.__fakeDb=db;window.__fakeOpts={extractionTable:true};
const FIELDS=['holder_name','credential_id','course','issued_on','renew_by','expires_on','training_center','jurisdiction','multistate','expired'];
const uuid=()=>crypto.randomUUID();
function guard(t,row){
 if(t==='credentials'&&catalogPrivacy(row.kind)==='PRIVATE'&&row.metadata&&Object.keys(row.metadata).length)return{message:'PRIVATE credential kinds ('+row.kind+') cannot store structured detail'};
 if(t==='extraction_events'){
  if(!window.__fakeOpts.extractionTable)return{message:'relation "public.extraction_events" does not exist'};
  for(const k of ['fields_expected','fields_found','fields_corrected','fields_confirmed','mismatches'])if((row[k]||[]).some(f=>!FIELDS.includes(f)))return{message:'check constraint '+k};
  for(const [k,v] of Object.entries(row.confidence||{}))if(!FIELDS.includes(k)||typeof v!=='number'||v<0||v>1)return{message:'check constraint confidence'};
 }
 return null;
}
function q(t){
 const s={t,op:'select',row:null,f:[],single:false,maybe:false,order:null};
 const api={
  select(){if(s.op==='select')s.op='select';s.ret=true;return api},insert(r){s.op='insert';s.row=r;return api},update(r){s.op='update';s.row=r;return api},delete(){s.op='delete';return api},
  eq(k,v){s.f.push(x=>x[k]===v);return api},in(k,a){s.f.push(x=>a.includes(x[k]));return api},order(k,o){s.order=[k,o&&o.ascending===false];return api},limit(){return api},
  single(){s.single=true;return api},maybeSingle(){s.single=true;s.maybe=true;return api},
  then(res,rej){return Promise.resolve(run()).then(res,rej)}
 };
 function run(){
  const T=db[t]||(db[t]=[]);
  if(s.op==='insert'){const rows=(Array.isArray(s.row)?s.row:[s.row]).map(r=>({id:r.id||uuid(),created_at:new Date().toISOString(),occurred_at:new Date().toISOString(),...JSON.parse(JSON.stringify(r))}));for(const r of rows){const e=guard(t,r);if(e)return{data:null,error:e}}T.push(...rows);return{data:s.single?rows[0]:rows,error:null}}
  let rows=T.filter(x=>s.f.every(f=>f(x)));
  if(s.op==='update'){for(const r of rows){const n={...r,...JSON.parse(JSON.stringify(s.row))};const e=guard(t,n);if(e)return{data:null,error:e};Object.assign(r,n)}}
  if(s.op==='delete'){db[t]=T.filter(x=>!rows.includes(x));}
  if(s.order){const [k,d]=s.order;rows=rows.slice().sort((a,b)=>String(a[k]).localeCompare(String(b[k]))*(d?-1:1))}
  if(t==='extraction_events'&&s.op==='select'&&!window.__fakeOpts.extractionTable)return{data:null,error:{message:'relation "public.extraction_events" does not exist'}};
  rows=rows.map(r=>JSON.parse(JSON.stringify(r)));
  if(s.single)return{data:rows[0]||null,error:rows[0]||s.maybe?null:{message:'no rows'}};
  return{data:rows,error:null};
 }
 return api;
}
const client={from:q,
 storage:{from(){return{upload:async(p,f)=>{db.storage[p]=f;return{error:null}},createSignedUrl:async p=>db.storage[p]?{data:{signedUrl:URL.createObjectURL(db.storage[p])},error:null}:{data:null,error:{message:'not found'}},remove:async ps=>{ps.forEach(p=>delete db.storage[p]);return{error:null}}}}},
 rpc:async(name,args)=>{if(name==='record_source_check'){const c=db.credentials.find(x=>x.id===args.p_credential);const src=verificationSource(args.p_source);if(!src)return{data:null,error:{message:'source not found'}};if(args.p_result==='VERIFIED'){c.status='VERIFIED';c.verification_level=sourceLevel(src)}return{data:{result:args.p_result,level:sourceLevel(src),source_name:src.name,checked_on:args.p_checked_on,status_at_source:args.p_status_at_source,expires_on:args.p_source_expires_on,commitment:'0'.repeat(64),verification_id:uuid()},error:null}}return{data:null,error:{message:'rpc '+name+' not faked'}}}
};
const a=store.account;
a.client=client;a.session={access_token:'fake',user:{id:'00000000-0000-4000-8000-0000000000aa',email:'fake.nurse@example.test'}};
a.mfa={totp:[{id:'f1',status:'verified'}],currentLevel:'aal2',nextLevel:'aal2'};
const prof={id:'00000000-0000-4000-8000-0000000000c1',user_id:a.user.id,full_name:'Testa Fakename',post_nominals:'RN',specialty:'ICU',secondary_specialties:[],home_jurisdiction:'US-CA'};
db.clinicians.push(prof);
a.hydrate=async function(){this.cache={...(this.cache||{}),profile:prof,memberships:[],credentials:db.credentials.filter(c=>c.clinician_id===prof.id).map(c=>JSON.parse(JSON.stringify(c))),shares:[],events:db.audit_events.filter(e=>e.clinician_id===prof.id||e.credential_id&&db.credentials.some(c=>c.id===e.credential_id)).map(e=>JSON.parse(JSON.stringify(e))),verifications:[],anchors:[],accountRole:'verifier',hydratedAt:new Date().toISOString()};this.emit&&this.emit('hydrated');return this.cache};
const vq=a.verifierQueue.bind(a);
a.verifierQueue=async function(){const rows=await vq();return rows.map(r=>({...r,clinicians:{full_name:(db.clinicians.find(c=>c.id===r.clinician_id)||{}).full_name||'Clinician'}}))};
window.__fakeSeed=function(c,file){const row={id:uuid(),clinician_id:prof.id,status:'VERIFYING',metadata:{},created_at:new Date(Date.now()-86400000).toISOString(),...c};if(file){const p=a.user.id+'/'+row.id+'/seed-'+file.name;db.storage[p]=file;row.source_document_path=p}db.credentials.push(row);return row.id};
})();`;
