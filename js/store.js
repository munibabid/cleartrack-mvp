/* Data-access layer. Every read and write of persisted app data goes through
   `store`, so views never touch storage directly.

   Two adapters, two kinds of data:
   - LocalStorageAdapter — the DEMO (Alex Morgan, the Boston tour, simulated
     verification). Always this browser only, same keys as before. Signed in
     or not, the demo never leaves the device.
   - SupabaseAdapter (PR 10) — YOUR ACCOUNT. Email magic-link sign-in with
     Supabase Auth, then the clinician profile, credentials, live shares,
     extension requests and access events are read from / written to the
     Supabase project with ONLY the publishable key + the user's JWT; row-level
     security decides what each user can see. Account data is cached in
     memory only (never localStorage), and source documents go straight to
     the private `source-documents` bucket (signed URLs, 60 s).
     supabase-js is vendored (js/vendor, pinned + SRI) and loaded lazily, so
     the signed-out demo makes no backend requests at all.
     Service-role / secret keys are refused.

   Staging only: this is a pre-compliance backend. Do not store real PHI. */
const STORE_KEYS={credentials:'nursecredx_v2',events:'nursecredx_v81_events',shares:'veridun_shares',shareRequests:'veridun_share_requests',customAssignments:'veridun_custom_assignments',demoAnchor:'veridun_demo_anchor',seedVersion:'veridun_demo_seed_version',xrplWallets:'nursecredx_wallets_v2',pendingShare:'veridun_pending_share_token'};
const SUPABASE_JS={src:'js/vendor/supabase-js-2.117.2.umd.js',integrity:'sha384-Rj26LVGvoeRVR6+mwQmFfcR3QOBEwT+ZmuCWpuiqeTzJpCs0ER4ITAWGb4Hiy3Ok',version:'2.117.2'};

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
/* Accounts config: `accounts:{provider:'supabase',supabaseUrl,supabaseAnonKey}`
   (current form) or the PR 8 form `backend:'supabase',supabaseUrl,…`. */
function accountsConfig(cfg){
 if(!cfg)return null;
 if(cfg.accounts&&typeof cfg.accounts==='object')return{backend:'supabase',...cfg.accounts,supabaseServiceKey:cfg.accounts.supabaseServiceKey||cfg.supabaseServiceKey,serviceRoleKey:cfg.accounts.serviceRoleKey||cfg.serviceRoleKey};
 if(cfg.backend==='supabase')return cfg;
 return null;
}
const SHARE_TOKEN_RE=/^[0-9a-f]{32,128}$/i;
/* Accepts a full share link (…?share=<token>) or the bare code. */
function parseShareToken(input){
 const s=String(input||'').trim();if(!s)return null;
 let t=s;const m=s.match(/[?&#]share=([^&#\s]+)/);if(m)t=decodeURIComponent(m[1]);
 t=t.replace(/[\s-]/g,'');return SHARE_TOKEN_RE.test(t)?t.toLowerCase():null;
}
function randomHex(bytes){return[...crypto.getRandomValues(new Uint8Array(bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')}
function safeFileName(name){const n=String(name||'document').normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(-80);return n||'document'}
const DOC_TYPES=['application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const DOC_MAX_BYTES=10485760;
function emptyAccountCache(){return{profile:null,credentials:[],shares:[],requests:[],accessEvents:[],events:[],memberships:[],hydratedAt:null}}

class SupabaseAdapter{
 constructor(cfg,deps={}){
  const v=validateSupabaseConfig(cfg);if(!v.ok)throw new Error('SupabaseAdapter: '+v.reason);
  this.url=cfg.supabaseUrl.replace(/\/$/,'');this.anonKey=cfg.supabaseAnonKey;
  this.ref=(this.url.match(/^https?:\/\/([^.\/:]+)/)||[])[1]||'local';
  this.local=deps.local||globalThis.localStorage;this.fetch=deps.fetch||globalThis.fetch?.bind(globalThis);
  this.loadScript=deps.loadScript||defaultLoadScript;this.createClientImpl=deps.createClient||null;
  this.client=null;this.session=null;this.cache=emptyAccountCache();this.tokens={};this.listeners=new Set();this.lastError=null;
 }
 get name(){return'supabase'}
 get signedIn(){return!!this.session}
 get connected(){return this.signedIn}
 get user(){return this.session?.user||null}
 get email(){return this.user?.email||''}
 get description(){return this.signedIn?`Your account (${this.email}): Supabase staging, row-level security enforced. Account data is kept in memory on this device, never in localStorage`:'Accounts: Supabase staging (signed out)'}
 get storageKey(){return`sb-${this.ref}-auth-token`}
 /* Synchronous, no network: is there a saved Supabase session on this device? */
 hasStoredSession(){try{return!!this.local?.getItem(this.storageKey)}catch{return false}}
 static urlHasAuthCallback(loc=globalThis.location){const s=(loc?.hash||'')+'&'+(loc?.search||'');return/(^|[#&?])(access_token|refresh_token|error_description|error_code)=/.test(s)||/[?&](token_hash|code)=/.test(loc?.search||'')}
 onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
 emit(type){this.listeners.forEach(fn=>{try{fn(type,this)}catch(e){console.error(e)}})}
 ensureClient(){if(!this._clientP)this._clientP=this.makeClient().catch(e=>{this._clientP=null;throw e});return this._clientP}
 async makeClient(){
  let create=this.createClientImpl;
  if(!create){if(!globalThis.supabase?.createClient)await this.loadScript(SUPABASE_JS.src,SUPABASE_JS.integrity);create=globalThis.supabase.createClient}
  this.client=create(this.url,this.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:this.storageKey}});
  this.client.auth.onAuthStateChange((event,session)=>{
   const prev=this.session?.user?.id;this.session=session||null;
   if(!session){if(prev){this.cache=emptyAccountCache();this.tokens={};this.emit('signedOut')}return}
   if(prev!==session.user.id){this.cache=emptyAccountCache();this.tokens={};
    /* never await Supabase calls inside this callback (supabase-js deadlock) */
    setTimeout(()=>this.hydrate().then(()=>this.emit('signedIn')).catch(e=>{this.lastError=e.message;this.emit('error')}),0)}
  });
  return this.client;
 }
 /* Restores a saved session (or completes a magic-link redirect) and loads the account. */
 init(){if(!this._initP)this._initP=this.restore().finally(()=>{this._initP=null});return this._initP}
 async restore(){
  const c=await this.ensureClient();const{data,error}=await c.auth.getSession();if(error)throw new Error(error.message);
  this.session=data.session||null;if(this.session&&!this.cache.hydratedAt)await this.hydrate();return this.session;
 }
 async sendMagicLink(email,redirectTo){
  const e=String(email||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw new Error('Enter a valid email address.');
  const c=await this.ensureClient();const{error}=await c.auth.signInWithOtp({email:e,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}});
  if(error)throw new Error(/rate limit/i.test(error.message)?'Too many sign-in emails were sent recently. Wait a few minutes and try again.':error.message);
  return true;
 }
 /* Not shown in the UI. Used by automated tests with throwaway accounts. */
 async signInWithPassword(email,password){const c=await this.ensureClient();const{data,error}=await c.auth.signInWithPassword({email,password});if(error)throw new Error(error.message);this.session=data.session;await this.hydrate();return data.session}
 async signOut(){if(this.client)await this.client.auth.signOut().catch(()=>{});this.session=null;this.cache=emptyAccountCache();this.tokens={};this.emit('signedOut')}
 need(){if(!this.session)throw new Error('Sign in first.');return this.client}
 async run(q,label){const{data,error}=await q;if(error){const m=`${label}: ${error.message}`;this.lastError=m;throw new Error(m)}return data}
 /* Reload everything this user may see. RLS scopes every query. */
 hydrate(){if(!this._hydrating)this._hydrating=this.loadAll().finally(()=>{this._hydrating=null});return this._hydrating}
 async loadAll(){
  const c=this.need(),uid=this.user.id,cache=emptyAccountCache();
  cache.profile=await this.run(c.from('clinicians').select('*').eq('user_id',uid).maybeSingle(),'Load profile');
  cache.memberships=await this.run(c.from('organization_members').select('org_id,role,organizations(id,name,slug,org_type)').eq('user_id',uid),'Load organizations');
  if(cache.profile){
   const cid=cache.profile.id;
   cache.credentials=await this.run(c.from('credentials').select('*').eq('clinician_id',cid).order('created_at'),'Load credentials');
   cache.shares=await this.run(c.from('share_grants').select('*,organizations(name),share_grant_assertions(credential_id,requirement_label,mode)').eq('clinician_id',cid).order('created_at',{ascending:false}),'Load shares');
   const ids=cache.shares.map(s=>s.id);
   if(ids.length){
    cache.requests=await this.run(c.from('extension_requests').select('*').in('grant_id',ids).order('created_at',{ascending:false}),'Load extension requests');
    cache.accessEvents=await this.run(c.from('share_access_events').select('id,grant_id,outcome,assertions_accessed,occurred_at').in('grant_id',ids).order('occurred_at',{ascending:false}).limit(500),'Load access events');
   }
   cache.events=await this.run(c.from('audit_events').select('id,event_type,actor_type,result,detail,occurred_at,grant_id,credential_id').eq('clinician_id',cid).order('occurred_at',{ascending:false}).limit(100),'Load activity');
  }
  cache.hydratedAt=new Date().toISOString();this.cache=cache;this.emit('hydrated');return cache;
 }
 async log(event_type,{result=null,detail={},credential_id=null,grant_id=null,org_id=null,actor_type='CLINICIAN'}={}){
  const c=this.need();const clinician_id=actor_type==='CLINICIAN'?this.cache.profile?.id||null:null;
  const{error}=await c.from('audit_events').insert({event_type,actor_user_id:this.user.id,actor_type,clinician_id,org_id,credential_id,grant_id,result,detail});
  if(error)console.warn('[Veridun] audit log failed:',error.message);
 }
 /* ---- profile ---- */
 async saveProfile({full_name,post_nominals,specialty,home_jurisdiction}){
  const c=this.need();const row={full_name:String(full_name||'').trim(),post_nominals:String(post_nominals||'').trim()||null,specialty,home_jurisdiction:home_jurisdiction||null};
  if(!row.full_name)throw new Error('Enter your name.');
  const p=this.cache.profile?await this.run(c.from('clinicians').update(row).eq('id',this.cache.profile.id).select().single(),'Save profile')
   :await this.run(c.from('clinicians').insert({...row,user_id:this.user.id}).select().single(),'Create profile');
  const first=!this.cache.profile;this.cache.profile=p;await this.log(first?'PROFILE_CREATED':'PROFILE_UPDATED',{detail:{specialty:p.specialty,home_jurisdiction:p.home_jurisdiction}});
  if(first)await this.hydrate();return p;
 }
 /* ---- credentials (always start VERIFYING; only a verifier can change that) ---- */
 checkFile(file){if(!file)return;if(file.size>DOC_MAX_BYTES)throw new Error('Documents must be 10 MB or smaller.');if(file.type&&!DOC_TYPES.includes(file.type))throw new Error('Upload a PDF, PNG, JPEG, DOC or DOCX file.')}
 async addCredential({kind,type_code,display_name,jurisdiction_code,expires_on,metadata},file){
  const c=this.need();if(!this.cache.profile)throw new Error('Set up your profile first.');this.checkFile(file);
  const row={id:SupabaseMapping.uuid(),clinician_id:this.cache.profile.id,kind,type_code,display_name,jurisdiction_code:jurisdiction_code||null,status:'VERIFYING',expires_on:expires_on||null,metadata:metadata||{}};
  let saved=await this.run(c.from('credentials').insert(row).select().single(),'Save credential');
  this.cache.credentials.push(saved);
  if(file)saved=await this.uploadDocument(saved.id,file);
  await this.log('CREDENTIAL_ADDED',{credential_id:saved.id,result:'PENDING_VERIFICATION',detail:{kind,jurisdiction:jurisdiction_code||null,document:file?'PRIVATE_BUCKET':'NONE'}});
  return saved;
 }
 async uploadDocument(credentialId,file){
  const c=this.need();this.checkFile(file);const cred=this.cache.credentials.find(x=>x.id===credentialId);if(!cred)throw new Error('Credential not found.');
  const path=`${this.user.id}/${credentialId}/${Date.now()}-${safeFileName(file.name)}`;
  const{error}=await c.storage.from('source-documents').upload(path,file,{upsert:false,contentType:file.type||undefined});if(error)throw new Error('Upload: '+error.message);
  const old=cred.source_document_path;
  const saved=await this.run(c.from('credentials').update({source_document_path:path}).eq('id',credentialId).select().single(),'Link document');
  if(old)await c.storage.from('source-documents').remove([old]).catch(()=>{});
  Object.assign(cred,saved);return cred;
 }
 async documentUrl(credentialId,seconds=60){
  const c=this.need();const cred=this.cache.credentials.find(x=>x.id===credentialId);if(!cred?.source_document_path)throw new Error('No document uploaded.');
  const{data,error}=await c.storage.from('source-documents').createSignedUrl(cred.source_document_path,seconds);if(error)throw new Error('Signed link: '+error.message);return data.signedUrl;
 }
 async deleteCredential(credentialId){
  const c=this.need();const cred=this.cache.credentials.find(x=>x.id===credentialId);if(!cred)return;
  await this.run(c.from('credentials').delete().eq('id',credentialId),'Delete credential');
  if(cred.source_document_path)await c.storage.from('source-documents').remove([cred.source_document_path]).catch(()=>{});
  this.cache.credentials=this.cache.credentials.filter(x=>x.id!==credentialId);
  await this.log('CREDENTIAL_DELETED',{result:'DELETED',detail:{kind:cred.kind}});
 }
 /* ---- organizations ---- */
 async listOrganizations(){const c=this.need();return this.run(c.from('organizations').select('id,name,slug,org_type').eq('is_demo',false).order('name'),'Load organizations')}
 async createOrganization(name,orgType){const c=this.need();const org=await this.run(c.rpc('create_organization',{p_name:name,p_org_type:orgType||null}),'Create organization');await this.hydrate();return org}
 /* ---- shares (clinician) ---- */
 async createShare({orgId,assertions,duration,customDate,expiresAt,assignmentLabel,startsOn,endsOn}){
  const c=this.need();if(!this.cache.profile)throw new Error('Set up your profile first.');
  if(!orgId)throw new Error('Choose an organization.');if(!assertions?.length)throw new Error('Choose at least one credential to share.');
  if(duration!=='UNTIL_REVOKED'&&!expiresAt)throw new Error('This access length needs an end date.');
  const token=randomHex(16),id=SupabaseMapping.uuid();
  const row={id,clinician_id:this.cache.profile.id,org_id:orgId,token_hash:await SupabaseMapping.sha256Hex(token),duration,custom_until:duration==='CUSTOM_DATE'?customDate:null,
   expires_at:duration==='UNTIL_REVOKED'?null:expiresAt,status:'ACTIVE',documents_shared:false,assignment_label:String(assignmentLabel||'').trim()||null,assignment_starts_on:startsOn||null,assignment_ends_on:endsOn||null};
  await this.run(c.from('share_grants').insert(row),'Create share');
  const{error}=await c.from('share_grant_assertions').insert(assertions.map(a=>({grant_id:id,credential_id:a.credentialId,requirement_label:a.requirementLabel||null,mode:a.mode})));
  if(error){await c.rpc('revoke_share_grant',{p_grant:id});throw new Error('Share assertions: '+error.message+' (the share was revoked)')}
  this.tokens[id]=token;
  await this.log('SHARE_CREATED',{grant_id:id,org_id:orgId,result:duration,detail:{assertions:assertions.length,documents:'NOT_SHARED',expires_at:row.expires_at}});
  await this.hydrate();return{id,token};
 }
 shareToken(id){return this.tokens[id]||null}
 async revokeShare(id){const c=this.need();await this.run(c.rpc('revoke_share_grant',{p_grant:id}),'Revoke share');await this.hydrate()}
 async extendShare(id,{duration,customDate,expiresAt}){
  const c=this.need();const s=this.cache.shares.find(x=>x.id===id);if(!s)throw new Error('Share not found.');
  if(s.status==='REVOKED')throw new Error('Revoked shares cannot be extended. Create a new share.');
  if(s.status==='USED')throw new Error('This one-time share was already viewed. Create a new share.');
  const upd={duration,custom_until:duration==='CUSTOM_DATE'?customDate:null,expires_at:duration==='UNTIL_REVOKED'?null:expiresAt};
  if(duration!=='UNTIL_REVOKED'&&!expiresAt)throw new Error('This access length needs an end date.');
  if(s.status==='EXPIRED'||s.status==='ACTIVE'){upd.status='ACTIVE';upd.expired_at=null}
  await this.run(c.from('share_grants').update(upd).eq('id',id),'Extend share');
  await this.log('SHARE_EXTENDED',{grant_id:id,org_id:s.org_id,result:duration,detail:{expires_from:s.expires_at,expires_to:upd.expires_at,via:'CLINICIAN'}});
  await this.hydrate();
 }
 async resolveExtension(requestId,approve){const c=this.need();await this.run(c.rpc('resolve_extension_request',{p_request:requestId,p_approve:!!approve}),'Resolve extension request');await this.hydrate()}
 /* ---- organization side ---- */
 async orgShares(orgId){
  const c=this.need();
  const grants=await this.run(c.from('share_grants').select('id,status,duration,expires_at,revoked_at,used_at,created_at,assignment_label,assignment_starts_on,assignment_ends_on,clinician_id,clinicians(full_name,post_nominals,specialty)').eq('org_id',orgId).order('created_at',{ascending:false}),'Load shared Passports');
  const reqs=grants.length?await this.run(c.from('extension_requests').select('id,grant_id,requested_until,reason,status,created_at,resolved_at').eq('org_id',orgId).order('created_at',{ascending:false}),'Load extension requests'):[];
  return grants.map(g=>({...g,requests:reqs.filter(r=>r.grant_id===g.id)}));
 }
 /* Opens a share by link/code through access_share_by_token (logged, live-grant rule). */
 async openShare(linkOrCode){
  const c=this.need();const token=parseShareToken(linkOrCode);if(!token)return{ok:false,reason:'INVALID'};
  const hash=await SupabaseMapping.sha256Hex(token);
  const meta=await this.run(c.from('share_grants').select('id,org_id,status,duration,expires_at,revoked_at,used_at,assignment_label,assignment_starts_on,assignment_ends_on,clinicians(full_name,post_nominals,specialty),organizations(name)').eq('token_hash',hash).maybeSingle(),'Open share');
  if(!meta)return{ok:false,reason:'NOT_FOUND'};
  const{data,error}=await c.rpc('access_share_by_token',{p_token:token});
  if(error)return{ok:false,reason:/not authorized/i.test(error.message)?'NOT_FOUND':'ERROR',error:error.message,share:meta};
  return this.shareOutcome(meta,data||[]);
 }
 async openShareById(grantId){
  const c=this.need();
  const meta=await this.run(c.from('share_grants').select('id,org_id,status,duration,expires_at,revoked_at,used_at,assignment_label,assignment_starts_on,assignment_ends_on,clinicians(full_name,post_nominals,specialty),organizations(name)').eq('id',grantId).maybeSingle(),'Open share');
  if(!meta)return{ok:false,reason:'NOT_FOUND'};
  const{data,error}=await c.rpc('get_share_assertions',{p_grant:grantId});
  if(error)return{ok:false,reason:'ERROR',error:error.message,share:meta};
  return this.shareOutcome(meta,data||[]);
 }
 shareOutcome(meta,rows){
  if(rows.length)return{ok:true,share:meta,assertions:rows};
  if(meta.status==='REVOKED'||meta.revoked_at)return{ok:false,reason:'REVOKED',share:meta};
  if(meta.status==='USED'||(meta.duration==='ONE_TIME'&&meta.used_at))return{ok:false,reason:'USED',share:meta};
  if(meta.status==='EXPIRED'||(meta.expires_at&&new Date(meta.expires_at)<=new Date()))return{ok:false,reason:'EXPIRED',share:meta};
  return{ok:true,share:meta,assertions:[]};
 }
 async requestExtension(grantId,orgId,requestedUntil,reason){
  const c=this.need();if(!/^\d{4}-\d{2}-\d{2}$/.test(requestedUntil||''))throw new Error('Choose the date you need access until.');
  const r=await this.run(c.from('extension_requests').insert({grant_id:grantId,org_id:orgId,requested_by:this.user.id,requested_until:requestedUntil,reason:String(reason||'').trim().slice(0,500)||null}).select().single(),'Request extension');
  await this.log('SHARE_EXTENSION_REQUESTED',{actor_type:'ORGANIZATION',org_id:orgId,grant_id:grantId,result:'PENDING',detail:{requested_until:requestedUntil}});
  return r;
 }
 /* A share link opened before sign-in survives the magic-link round trip.
    Holds only the share token (no health data); cleared once used. */
 setPendingShare(token){try{token?this.local.setItem(STORE_KEYS.pendingShare,token):this.local.removeItem(STORE_KEYS.pendingShare)}catch{}}
 takePendingShare(){try{const t=this.local.getItem(STORE_KEYS.pendingShare);if(t)this.local.removeItem(STORE_KEYS.pendingShare);return t}catch{return null}}
}
function defaultLoadScript(src,integrity){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;if(integrity){s.integrity=integrity;s.crossOrigin='anonymous'}s.onload=res;s.onerror=()=>rej(new Error('Could not load the sign-in library ('+src+')'));document.head.appendChild(s)})}

function createStore(cfg,deps={}){
 let account=null,warning=null;const acfg=accountsConfig(cfg);
 if(acfg){try{account=new SupabaseAdapter(acfg,deps)}catch(e){warning=e.message}}
 if(warning&&globalThis.console)console.warn('[Veridun store] '+warning+' — accounts disabled; the demo stays browser-only.');
 /* Demo data always lives in this browser. */
 const adapter=new LocalStorageAdapter(deps.local,deps.session);
 const K=STORE_KEYS,list=k=>()=>adapter.readJSON(k,[]),put=k=>v=>adapter.writeJSON(k,v);
 return{
  adapter,account,warning,
  backend:{get name(){return account&&account.signedIn?'supabase':adapter.name},
   get description(){return adapter.description+(account?(account.signedIn?' · '+account.description:' · Accounts available (Supabase staging), signed out'):'')},get warning(){return warning}},
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
if(typeof module!=='undefined')module.exports={createStore,LocalStorageAdapter,SupabaseAdapter,SupabaseMapping,validateSupabaseConfig,accountsConfig,parseShareToken,safeFileName,STORE_KEYS,SUPABASE_JS};
