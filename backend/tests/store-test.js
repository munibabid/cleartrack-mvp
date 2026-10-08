#!/usr/bin/env node
/* Unit tests for js/store.js (data-access layer) — runs in Node, no browser,
   no network: fetch is mocked and asserted. Usage: node backend/tests/store-test.js */
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'../..');
const S=require(path.join(root,'js/store.js'));
const R=[];const ok=(n,c,i='')=>{const l=(c?'PASS ':'FAIL ')+n+(i?' — '+i:'');R.push(l);console.log(l)};
const mem=()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),_m:m}};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
const jwt=role=>`${b64({alg:'HS256',typ:'JWT'})}.${b64({iss:'supabase',ref:'demo',role})}.sig`;
const URL_OK='https://abcdefghijklmnop.supabase.co';
(async()=>{
 // default
 let ls=mem(),ss=mem();let st=S.createStore(undefined,{local:ls,session:ss});
 ok('no config → LocalStorageAdapter (browser-only demo)',st.backend.name==='local'&&!st.warning);
 st.credentials.save([{id:1,kind:'CERT_BLS'}]);st.events.append({event_type:'X'});st.shares.save([{id:'s'}]);st.meta.setSeedVersion('4');st.session.setXrplWallets('{"i":"x"}');
 ok('local adapter keeps the existing storage keys (old demo data still loads)',ls._m.has('nursecredx_v2')&&ls._m.has('nursecredx_v81_events')&&ls._m.has('veridun_shares')&&ls._m.get('veridun_demo_seed_version')==='4'&&ss._m.has('nursecredx_wallets_v2'));
 ok('events are append-only through the store API',st.events.list().length===1&&(st.events.append({event_type:'Y'}),st.events.list().length===2)&&typeof st.events.remove==='undefined');
 st.customAssignments.save([{id:'c'}]);st.shareRequests.save([{id:'r'}]);st.clearDemoSharingAndBuilder();
 ok('reset clears shares, requests and published demo assignments only',!ls._m.has('veridun_shares')&&!ls._m.has('veridun_share_requests')&&!ls._m.has('veridun_custom_assignments')&&ls._m.has('nursecredx_v2'));
 ls._m.set('veridun_shares','{corrupt');ok('corrupt JSON falls back safely',Array.isArray(st.shares.load())&&st.shares.load().length===0);

 // config validation — never service keys in the browser
 const v=S.validateSupabaseConfig;
 ok('rejects a service_role JWT',!v({backend:'supabase',supabaseUrl:URL_OK,supabaseAnonKey:jwt('service_role')}).ok);
 ok('rejects an sb_secret_ key',!v({backend:'supabase',supabaseUrl:URL_OK,supabaseAnonKey:'sb_secret_abc123'}).ok);
 ok('rejects any config that includes a service key field',!v({backend:'supabase',supabaseUrl:URL_OK,supabaseAnonKey:jwt('anon'),supabaseServiceKey:'x'}).ok);
 ok('rejects non-Supabase URLs',!v({backend:'supabase',supabaseUrl:'https://evil.example.com',supabaseAnonKey:jwt('anon')}).ok);
 ok('accepts the anon JWT or an sb_publishable_ key',v({backend:'supabase',supabaseUrl:URL_OK,supabaseAnonKey:jwt('anon')}).ok&&v({backend:'supabase',supabaseUrl:URL_OK,supabaseAnonKey:'sb_publishable_abc'}).ok);
 const warn=console.warn;console.warn=()=>{};
 st=S.createStore({backend:'supabase',supabaseUrl:URL_OK,supabaseAnonKey:jwt('service_role')},{local:mem(),session:mem()});console.warn=warn;
 ok('service key config → refused, falls back to local with a warning',st.backend.name==='local'&&/service_role/.test(st.warning));

 // SupabaseAdapter stub
 const calls=[];const fetch=async(url,opt)=>{calls.push({url,opt});return{ok:true,status:200,json:async()=>[]}};
 ls=mem();st=S.createStore({backend:'supabase',supabaseUrl:URL_OK,supabaseAnonKey:jwt('anon')},{local:ls,session:mem(),fetch});
 ok('valid anon config → SupabaseAdapter (stub), not connected',st.backend.name==='supabase'&&/not connected/.test(st.backend.description));
 st.credentials.save([{id:1,kind:'CERT_BLS'}]);st.shares.save([{id:'s'}]);
 ok('UI stays synchronous: writes land in the local cache and are queued',JSON.parse(ls.getItem('nursecredx_v2')).length===1&&st.adapter.outbox.map(o=>o.table).join()==='credentials,share_grants');
 ok('nothing is sent before sign-in',calls.length===0&&(await st.adapter.flush()).reason==='not connected');
 let threw=false;try{await st.adapter.rest('credentials')}catch(e){threw=/sign-in is required/.test(e.message)}ok('REST calls refuse to run without a user session',threw&&calls.length===0);
 st.adapter.setSession('user.jwt.token');await st.adapter.rest('credentials',{query:'select=*'});
 const h=calls[0].opt.headers;
 ok('REST uses anon key + user JWT (RLS), never a service key',calls[0].url===URL_OK+'/rest/v1/credentials?select=*'&&h.apikey===jwt('anon')&&h.Authorization==='Bearer user.jwt.token');
 await st.adapter.rpc('get_share_assertions',{p_grant:'g1'});
 ok('share access goes through the RLS-checked RPC',calls[1].url===URL_OK+'/rest/v1/rpc/get_share_assertions'&&JSON.parse(calls[1].opt.body).p_grant==='g1');

 // mapping
 const M=S.SupabaseMapping,privacy=k=>/^HEALTH_|^SCREEN_|^REF_/.test(k)?'PRIVATE':'SHAREABLE';
 const row=M.credentialToRow({id:5,kind:'EMP_ICU_VERIFIED',type:'EMP_ICU_VERIFIED',name:'ICU Experience',years:3,lastWorked:'2026-09-17',primary:'VERIFIED',expiration:'',file:'resume.pdf'},'clin-1',privacy);
 ok('credential → row: structured facts kept, file name/contents never sent',row.metadata.years===3&&row.metadata.last_worked_on==='2026-09-17'&&!('file' in row)&&row.source_document_path===null&&row.clinician_id==='clin-1');
 const prow=M.credentialToRow({id:6,kind:'HEALTH_TB_CURRENT',type:'HEALTH_TB_CURRENT',name:'TB Screening',years:1,primary:'VERIFIED',expiration:'2027-01-01'},'clin-1',privacy);
 ok('PRIVATE kinds map with empty metadata (no health detail)',JSON.stringify(prow.metadata)==='{}');
 const back=M.rowToCredential({id:'u1',kind:'CERT_BLS',type_code:'CERT_BLS',display_name:'BLS',status:'VERIFIED',expires_on:'2027-11-12',metadata:{}});
 ok('row → credential round-trips the browser model',back.kind==='CERT_BLS'&&back.primary==='VERIFIED'&&back.expiration==='2027-11-12'&&back.prov.active===true);
 const srow=await M.shareToRow({token:'tok-123456789abcdef',duration:'THROUGH_ASSIGNMENT_END',expiresAt:'2027-02-22T07:59:59.000Z',status:'ACTIVE'},{clinicianId:'c',orgId:'o',assignmentId:'a'});
 ok('share → row: only sha256(token) is stored, documents never shared',/^[0-9a-f]{64}$/.test(srow.token_hash)&&srow.token_hash!=='tok-123456789abcdef'&&srow.documents_shared===false&&!('token' in srow));

 // static: the app goes through the store
 const offenders=fs.readdirSync(path.join(root,'js'),{recursive:true}).filter(f=>f.endsWith('.js')&&!/^(store|config)\.js$/.test(f)).filter(f=>/\b(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem|clear)/.test(fs.readFileSync(path.join(root,'js',f),'utf8')));
 ok('no app module touches localStorage/sessionStorage directly',offenders.length===0,offenders.join(','));
 const idx=fs.readFileSync(path.join(root,'index.html'),'utf8');
 ok('index.html loads config.js then store.js before the app modules',idx.indexOf('js/config.js')<idx.indexOf('js/store.js')&&idx.indexOf('js/store.js')<idx.indexOf('js/credential-model.js'));
 ok('committed config is browser-only and holds no keys',/backend: 'local'/.test(fs.readFileSync(path.join(root,'js/config.js'),'utf8'))&&!/eyJ|sb_secret_|sb_publishable_[A-Za-z0-9]{8}/.test(fs.readFileSync(path.join(root,'js/config.js'),'utf8')));
 const f=R.filter(r=>r.startsWith('FAIL')).length;console.log(`\n${R.length-f}/${R.length} passed`);process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
