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
 // v14.6 demo references: own keys, answers kept apart, cleared by Reset Demo Data
 ok('references start empty (answers default to an empty map, not a list)',Array.isArray(st.references.load())&&st.references.load().length===0&&JSON.stringify(st.referenceResponses.load())==='{}');
 st.references.save([{id:'rf1',status:'COMPLETED'}]);st.referenceResponses.save({rf1:{comments:'x'}});
 ok('references and answers use separate keys',ls._m.has('veridun_references')&&ls._m.has('veridun_reference_responses')&&!ls._m.get('veridun_references').includes('comments'));
 st.clearDemoSharingAndBuilder();ok('reset clears demo references and their answers',!ls._m.has('veridun_references')&&!ls._m.has('veridun_reference_responses')&&ls._m.has('nursecredx_v2'));
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

 // SupabaseAdapter (PR 10): real accounts, tested against a mocked supabase-js client
 const SESSION={access_token:'user.jwt',user:{id:'11111111-1111-4111-8111-111111111111',email:'nurse@test.dev'}};
 const mockClient=db=>{const calls=[],storageCalls=[];
  const from=table=>{const st={table,op:'select',filters:[],payload:null,single:false,maybe:false};const b={
   select(){return b},insert(p){st.op='insert';st.payload=p;return b},update(p){st.op='update';st.payload=p;return b},delete(){st.op='delete';return b},
   eq(k,v){st.filters.push([k,v]);return b},in(k,v){st.filters.push([k,v]);return b},order(){return b},limit(){return b},single(){st.single=true;return b},maybeSingle(){st.maybe=true;return b},
   then(res,rej){calls.push(st);const match=r=>st.filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v);let data=null;
    if(st.op==='insert'){const rows=[].concat(st.payload).map(r=>({...r}));(db[table]??=[]).push(...rows);data=st.single?rows[0]:rows}
    else if(st.op==='update'){const rows=(db[table]||[]).filter(match);rows.forEach(r=>Object.assign(r,st.payload));data=st.single?rows[0]:rows}
    else if(st.op==='delete'){db[table]=(db[table]||[]).filter(r=>!match(r))}
    else{const rows=(db[table]||[]).filter(match);data=(st.single||st.maybe)?(rows[0]||null):rows}
    return Promise.resolve({data,error:null}).then(res,rej)}};return b};
  return{calls,storageCalls,from,rpc:async(fn,args)=>{calls.push({rpc:fn,args});if(fn==='revoke_share_grant')(db.share_grants||[]).filter(g=>g.id===args.p_grant).forEach(g=>{g.status='REVOKED';g.revoked_at=new Date().toISOString()});return{data:[],error:null}},
   storage:{from:bucket=>({upload:async(path)=>{storageCalls.push({op:'upload',bucket,path});return{data:{path},error:null}},remove:async(p)=>{storageCalls.push({op:'remove',bucket,p});return{data:null,error:null}},createSignedUrl:async(path,sec)=>{storageCalls.push({op:'sign',bucket,path,sec});return{data:{signedUrl:'https://signed.example/'+path},error:null}}})},
   auth:{onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},getSession:async()=>({data:{session:SESSION},error:null}),signOut:async()=>({error:null}),signInWithOtp:async o=>{calls.push({otp:o});return{error:null}}}}};
 const db={},created=[];let client;
 const createClient=(url,key,opts)=>{created.push({url,key,opts});client=mockClient(db);return client};
 ls=mem();st=S.createStore({backend:'local',accounts:{provider:'supabase',supabaseUrl:URL_OK,supabaseAnonKey:'sb_publishable_abc'}},{local:ls,session:mem(),createClient});
 ok('accounts config → SupabaseAdapter for the account, demo data stays in LocalStorageAdapter',st.account instanceof S.SupabaseAdapter&&st.adapter instanceof S.LocalStorageAdapter&&st.backend.name==='local'&&!st.account.signedIn);
 ok('signed out: supabase-js is not even created (no network, no script load)',created.length===0);
 ok('legacy PR 8 form (backend:"supabase") is still understood',S.createStore({backend:'supabase',supabaseUrl:URL_OK,supabaseAnonKey:jwt('anon')},{local:mem(),session:mem(),createClient:()=>{throw new Error('x')}}).account instanceof S.SupabaseAdapter);
 console.warn=()=>{};const bad=S.createStore({backend:'local',accounts:{supabaseUrl:URL_OK,supabaseAnonKey:'sb_secret_zzz'}},{local:mem(),session:mem()});console.warn=warn;
 ok('a secret key inside accounts config → accounts disabled, demo unaffected',!bad.account&&/secret/.test(bad.warning)&&bad.backend.name==='local');
 ok('hasStoredSession() is a synchronous local check of sb-<ref>-auth-token',!st.account.hasStoredSession()&&(ls.setItem('sb-abcdefghijklmnop-auth-token','{}'),st.account.hasStoredSession()));
 ls.removeItem('sb-abcdefghijklmnop-auth-token');
 ok('magic-link callback detection (implicit flow hash, errors)',S.SupabaseAdapter.urlHasAuthCallback({hash:'#access_token=x&refresh_token=y',search:''})&&S.SupabaseAdapter.urlHasAuthCallback({hash:'#error=access_denied&error_description=expired',search:''})&&!S.SupabaseAdapter.urlHasAuthCallback({hash:'',search:'?share=abc'}));
 await st.account.init();
 ok('init(): client uses the publishable key, implicit flow, project-scoped session key',created.length===1&&created[0].key==='sb_publishable_abc'&&created[0].opts.auth.flowType==='implicit'&&created[0].opts.auth.storageKey==='sb-abcdefghijklmnop-auth-token'&&st.account.signedIn);
 await st.account.sendMagicLink('nurse@test.dev','https://munibabid.github.io/cleartrack-mvp/');
 ok('magic link: emailRedirectTo is passed through',client.calls.some(c=>c.otp&&c.otp.options.emailRedirectTo==='https://munibabid.github.io/cleartrack-mvp/'));
 let threw2=false;try{await st.account.sendMagicLink('not-an-email','x')}catch{threw2=true}ok('magic link: invalid email refused locally',threw2);
 await st.account.saveProfile({full_name:'Test Nurse',specialty:'ED',home_jurisdiction:'US-TX'});
 ok('profile: inserted for the signed-in user',db.clinicians.length===1&&db.clinicians[0].user_id===SESSION.user.id&&st.account.cache.profile.full_name==='Test Nurse');
 const lsBefore=JSON.stringify([...ls._m.entries()]);
 const fakeFile={name:'My License (scan).pdf',size:1000,type:'application/pdf'};
 const cr=await st.account.addCredential({kind:'RN_LICENSE',type_code:'RN_LICENSE:US-TX',display_name:'Texas RN License',jurisdiction_code:'US-TX',expires_on:'2028-01-31',status:'VERIFIED'},fakeFile);
 ok('credential: always saved as VERIFYING (the client can never mark it verified)',db.credentials[0].status==='VERIFYING');
 const up=client.storageCalls.find(c=>c.op==='upload');
 ok('upload: private bucket, path <user id>/<credential id>/<safe name>',up&&up.bucket==='source-documents'&&up.path.startsWith(SESSION.user.id+'/'+cr.id+'/')&&/My_License_scan_\.pdf$/.test(up.path),up&&up.path);
 ok('credential row stores only the object path (no file name field, no contents)',db.credentials[0].source_document_path===up.path&&!('file' in db.credentials[0]));
 const url=await st.account.documentUrl(cr.id);
 ok('documents open through a 60-second signed URL',/^https:\/\/signed\.example\//.test(url)&&client.storageCalls.find(c=>c.op==='sign').sec===60);
 let big=false;try{st.account.checkFile({name:'x.pdf',size:11*1048576,type:'application/pdf'})}catch{big=true}let typ=false;try{st.account.checkFile({name:'x.exe',size:10,type:'application/x-msdownload'})}catch{typ=true}
 ok('upload limits: 10 MB, PDF/PNG/JPEG/DOC/DOCX only',big&&typ);
 const sh=await st.account.createShare({orgId:'org-1',assertions:[{credentialId:cr.id,mode:'VERIFIED_CREDENTIAL',requirementLabel:'Texas RN License'}],duration:'D7',expiresAt:new Date(Date.now()+7*864e5).toISOString(),assignmentLabel:'Houston ICU'});
 const g=db.share_grants[0];
 ok('share: only sha256(token) is sent; the token never leaves the browser',/^[0-9a-f]{64}$/.test(g.token_hash)&&g.token_hash!==sh.token&&!JSON.stringify(client.calls.filter(c=>c.table)).includes(sh.token)&&/^[0-9a-f]{32}$/.test(sh.token));
 ok('share: documents never shared, assertions attached, assignment context stored',g.documents_shared===false&&db.share_grant_assertions.length===1&&g.assignment_label==='Houston ICU');
 ok('account data never touches localStorage (memory cache only)',JSON.stringify([...ls._m.entries()])===lsBefore);
 await st.account.revokeShare(g.id);
 ok('revoke goes through the revoke_share_grant RPC',client.calls.some(c=>c.rpc==='revoke_share_grant'&&c.args.p_grant===g.id));
 st.account.cache.shares=[{...g,status:'REVOKED'}];let fin=false;try{await st.account.extendShare(g.id,{duration:'D30',expiresAt:new Date(Date.now()+30*864e5).toISOString()})}catch(e){fin=/cannot be extended/.test(e.message)}
 ok('revocation is final: extending a revoked share is refused',fin);
 await st.account.resolveExtension('req-1',true);
 ok('extension approval goes through resolve_extension_request (clinician only)',client.calls.some(c=>c.rpc==='resolve_extension_request'&&c.args.p_approve===true));
 ok('share link/code parsing',S.parseShareToken('https://munibabid.github.io/cleartrack-mvp/?share=0123456789abcdef0123456789ABCDEF')==='0123456789abcdef0123456789abcdef'&&S.parseShareToken('0123456789abcdef0123456789abcdef')&&!S.parseShareToken('hello'));
 await st.account.signOut();
 ok('sign-out clears the in-memory account cache',!st.account.signedIn&&st.account.cache.credentials.length===0&&!st.account.cache.profile);

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
 const offenders=fs.readdirSync(path.join(root,'js'),{recursive:true}).filter(f=>f.endsWith('.js')&&!/^(store|config)\.js$/.test(f)&&!/^vendor[\/]/.test(f)).filter(f=>/\b(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem|clear)/.test(fs.readFileSync(path.join(root,'js',f),'utf8')));
 ok('no app module touches localStorage/sessionStorage directly',offenders.length===0,offenders.join(','));
 const idx=fs.readFileSync(path.join(root,'index.html'),'utf8');
 ok('index.html loads config.js then store.js before the app modules',idx.indexOf('js/config.js')<idx.indexOf('js/store.js')&&idx.indexOf('js/store.js')<idx.indexOf('js/credential-model.js'));
 const cfgSrc=fs.readFileSync(path.join(root,'js/config.js'),'utf8');
 ok('committed config: demo stays browser-only; only the public publishable key is present (no secret/service keys)',/backend: 'local'/.test(cfgSrc)&&/sb_publishable_/.test(cfgSrc)&&!/eyJ|sb_secret_|service_role/i.test(cfgSrc.replace(/NEVER put the service_role[^*]*/,'')));
 const vend=fs.readFileSync(path.join(root,S.SUPABASE_JS.src));
 ok('vendored supabase-js matches its pinned SRI hash',S.SUPABASE_JS.integrity==='sha384-'+require('crypto').createHash('sha384').update(vend).digest('base64'));
 const f=R.filter(r=>r.startsWith('FAIL')).length;console.log(`\n${R.length-f}/${R.length} passed`);process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
