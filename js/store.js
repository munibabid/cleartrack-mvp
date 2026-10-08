/* Data-access layer (PR 8). Every read and write of persisted app data goes
   through `store`, so the storage backend can change without touching views.

   Adapters
   - LocalStorageAdapter (default): today's behavior. localStorage for app
     data, sessionStorage for disposable XRPL Devnet wallets. Same keys as
     before, so existing demo data keeps loading.
   - SupabaseAdapter (stub, disabled unless js/config.js configures it): keeps
     the same synchronous local cache so the UI is unchanged, and queues
     writes for a future sync to Supabase (PostgREST) using ONLY the anon key
     plus the signed-in user's JWT; RLS enforces access. It refuses
     service-role / secret keys. Sign-in and sync are not wired up yet:
     docs/BACKEND.md lists what is needed to go live.

   The app API is synchronous on purpose (the demo renders synchronously);
   remote I/O is write-behind from the cache. */
const STORE_KEYS={credentials:'nursecredx_v2',events:'nursecredx_v81_events',shares:'veridun_shares',shareRequests:'veridun_share_requests',customAssignments:'veridun_custom_assignments',demoAnchor:'veridun_demo_anchor',seedVersion:'veridun_demo_seed_version',xrplWallets:'nursecredx_wallets_v2'};

class LocalStorageAdapter{
 constructor(local,session){this.ls=local||globalThis.localStorage;this.ss=session||globalThis.sessionStorage}
 get name(){return'local'}
 get description(){return'This browser only (localStorage) — demo data, nothing leaves the device'}
 readJSON(key,fallback){try{const s=this.ls.getItem(key);return s==null?fallback:JSON.parse(s)}catch{return fallback}}
 writeJSON(key,value){this.ls.setItem(key,JSON.stringify(value))}
 readText(key){return this.ls.getItem(key)}
 writeText(key,value){this.ls.setItem(key,String(value))}
 remove(key){this.ls.removeItem(key)}
 sessionGet(key){return this.ss?this.ss.getItem(key):null}
 sessionSet(key,value){if(this.ss)this.ss.setItem(key,value)}
}

/* Maps between the browser model and the Postgres schema (backend/supabase). */
const SupabaseMapping={
 TABLE_FOR_KEY:{nursecredx_v2:'credentials',veridun_shares:'share_grants',veridun_share_requests:'extension_requests',nursecredx_v81_events:'audit_events',veridun_custom_assignments:'assignments'},
 STATUS_TO_DB:{UNVERIFIED:'UNVERIFIED',VERIFYING:'VERIFYING',VERIFIED:'VERIFIED',REJECTED:'REJECTED',REVOKED:'REVOKED',EXPIRED:'EXPIRED',FAILED:'REJECTED'},
 uuid(){return globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():'00000000-0000-4000-8000-'+Date.now().toString(16).padStart(12,'0').slice(-12)},
 /* Never sends document contents or file names: only a private storage path, set by the upload flow. */
 credentialToRow(c,clinicianId,privacyOf){
  const priv=(privacyOf?privacyOf(c.kind):'PRIVATE')==='PRIVATE';
  const meta=priv?{}:Object.fromEntries(Object.entries({years:c.years,last_worked_on:c.lastWorked}).filter(([,v])=>v!=null&&v!==''));
  return{id:c.remote_id||SupabaseMapping.uuid(),clinician_id:clinicianId,kind:c.kind,type_code:c.type,display_name:c.name,
   jurisdiction_code:c.jurisdiction||null,status:SupabaseMapping.STATUS_TO_DB[c.primary]||'VERIFYING',expires_on:c.expiration||null,metadata:meta,
   source_document_path:c.source_document_path||null};
 },
 rowToCredential(r){return{id:r.id,remote_id:r.id,kind:r.kind,type:r.type_code,name:r.display_name,jurisdiction:r.jurisdiction_code||'',primary:r.status,expiration:r.expires_on||'',
  years:r.metadata?.years,lastWorked:r.metadata?.last_worked_on,file:'',chain:'NOT ISSUED',prov:{source:'',method:'',verifier:'',verifiedAt:r.verified_at||'',active:r.status==='VERIFIED',lastMonitored:r.last_monitored_at||''}}},
 async sha256Hex(text){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('')},
 /* The share token never leaves the browser in clear: only sha256(token) is stored server-side. */
 async shareToRow(s,ids){return{id:s.remote_id||SupabaseMapping.uuid(),clinician_id:ids.clinicianId,org_id:ids.orgId,assignment_id:ids.assignmentId||null,
  token_hash:await SupabaseMapping.sha256Hex(s.token),duration:s.duration,custom_until:s.customDate||null,expires_at:s.expiresAt||null,status:s.status,
  used_at:s.usedAt||null,revoked_at:s.revokedAt||null,documents_shared:false}}
};

/* Rejects anything that is not a public anon/publishable key. */
function validateSupabaseConfig(cfg){
 if(!cfg||cfg.backend!=='supabase')return{ok:false,reason:'backend is not "supabase"'};
 const url=String(cfg.supabaseUrl||''),key=String(cfg.supabaseAnonKey||'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url))return{ok:false,reason:'supabaseUrl must be https://<ref>.supabase.co (or a localhost dev URL)'};
 if(!key)return{ok:false,reason:'supabaseAnonKey is missing'};
 if(cfg.supabaseServiceKey||cfg.serviceRoleKey)return{ok:false,reason:'a service key was provided — never put service keys in the browser'};
 if(/^sb_secret_/i.test(key))return{ok:false,reason:'this is a secret key — use the anon / publishable key'};
 if(key.split('.').length===3){try{const p=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(p.role!=='anon')return{ok:false,reason:`JWT role "${p.role}" is not allowed — use the anon key`}}catch{return{ok:false,reason:'supabaseAnonKey is not a valid key'}}}
 else if(!/^sb_publishable_/i.test(key))return{ok:false,reason:'supabaseAnonKey must be the anon JWT or an sb_publishable_ key'};
 return{ok:true};
}

class SupabaseAdapter extends LocalStorageAdapter{
 constructor(cfg,local,session,fetchImpl){
  super(local,session);const v=validateSupabaseConfig(cfg);if(!v.ok)throw new Error('SupabaseAdapter: '+v.reason);
  this.url=cfg.supabaseUrl.replace(/\/$/,'');this.anonKey=cfg.supabaseAnonKey;this.fetch=fetchImpl||globalThis.fetch?.bind(globalThis);
  this.accessToken=null;this.outbox=[];this.connected=false;
 }
 get name(){return'supabase'}
 get description(){return this.connected?'Supabase (signed in) — row-level security enforced':'Supabase configured — not connected yet (sign-in not built); data stays in this browser'}
 /* Future: set from Supabase Auth after sign-in. Until then nothing is sent. */
 setSession(accessToken){this.accessToken=accessToken||null;this.connected=!!accessToken}
 headers(extra={}){return{apikey:this.anonKey,Authorization:'Bearer '+(this.accessToken||this.anonKey),'Content-Type':'application/json',...extra}}
 async rest(table,{method='GET',query='',body,prefer}={}){
  if(!this.connected)throw new Error('Supabase not connected: sign-in is required (anon key + user JWT; RLS enforced)');
  const res=await this.fetch(`${this.url}/rest/v1/${table}${query?'?'+query:''}`,{method,headers:this.headers(prefer?{Prefer:prefer}:{}),body:body==null?undefined:JSON.stringify(body)});
  if(!res.ok)throw new Error(`Supabase ${method} ${table}: ${res.status}`);return res.status===204?null:res.json();
 }
 async rpc(fn,args){if(!this.connected)throw new Error('Supabase not connected');const res=await this.fetch(`${this.url}/rest/v1/rpc/${fn}`,{method:'POST',headers:this.headers(),body:JSON.stringify(args||{})});if(!res.ok)throw new Error(`Supabase rpc ${fn}: ${res.status}`);return res.json()}
 writeJSON(key,value){super.writeJSON(key,value);const table=SupabaseMapping.TABLE_FOR_KEY[key];if(table)this.outbox.push({table,key,at:Date.now()})}
 /* Stub: real sync (upserts with Prefer: resolution=merge-duplicates, RPCs for
    revoke / extension / share access) lands once sign-in exists. */
 async flush(){if(!this.connected)return{sent:0,pending:this.outbox.length,reason:'not connected'};const pending=this.outbox.splice(0);return{sent:0,pending:0,dropped:pending.length,reason:'sync not implemented in this stub'}}
}

function createStore(cfg,deps={}){
 let adapter,warning=null;
 if(cfg&&cfg.backend==='supabase'){try{adapter=new SupabaseAdapter(cfg,deps.local,deps.session,deps.fetch)}catch(e){warning=e.message;adapter=new LocalStorageAdapter(deps.local,deps.session)}}
 else adapter=new LocalStorageAdapter(deps.local,deps.session);
 if(warning&&globalThis.console)console.warn('[Veridun store] '+warning+' — falling back to browser-only storage.');
 const K=STORE_KEYS,list=k=>()=>adapter.readJSON(k,[]),put=k=>v=>adapter.writeJSON(k,v);
 return{
  adapter,warning,
  backend:{get name(){return adapter.name},get description(){return adapter.description},get warning(){return warning}},
  credentials:{load:list(K.credentials),save:put(K.credentials)},
  events:{list:list(K.events),append(e){const a=adapter.readJSON(K.events,[]);a.push(e);adapter.writeJSON(K.events,a);return e}},
  shares:{load:list(K.shares),save:put(K.shares)},
  shareRequests:{load:list(K.shareRequests),save:put(K.shareRequests)},
  customAssignments:{load:list(K.customAssignments),save:put(K.customAssignments)},
  meta:{
   demoAnchor:()=>adapter.readText(K.demoAnchor),setDemoAnchor:v=>adapter.writeText(K.demoAnchor,v),
   seedVersion:()=>adapter.readText(K.seedVersion),setSeedVersion:v=>adapter.writeText(K.seedVersion,v)
  },
  /* Reset Demo Data: shares, access requests and published demo assignments. */
  clearDemoSharingAndBuilder(){[K.shares,K.shareRequests,K.customAssignments].forEach(k=>adapter.remove(k))},
  session:{xrplWallets:()=>adapter.sessionGet(K.xrplWallets),setXrplWallets:v=>adapter.sessionSet(K.xrplWallets,v)}
 };
}
const store=createStore(globalThis.VERIDUN_CONFIG);
if(typeof module!=='undefined')module.exports={createStore,LocalStorageAdapter,SupabaseAdapter,SupabaseMapping,validateSupabaseConfig,STORE_KEYS};
