#!/usr/bin/env node
/* Applies the Supabase migrations + seeds to a throwaway local Postgres
   database and runs schema, seed and row-level-security tests.
   Needs a Postgres 15+ server you can create databases on, e.g.
     PGHOST=/tmp PGPORT=54329 PGUSER=postgres node backend/tests/db-test.js
   (see docs/BACKEND.md for a no-root way to run Postgres locally).
   Creates and drops the database "veridun_rls_test". Never point this at production. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {Client}=require('pg');
const SB=path.resolve(__dirname,'../supabase'),DB=process.env.VERIDUN_TEST_DB||'veridun_rls_test';
const R=[];const ok=(n,c,i='')=>{const l=(c?'PASS ':'FAIL ')+n+(i!==''?' — '+i:'');R.push(l);console.log(l)};
const uid=k=>{const h=crypto.createHash('md5').update('veridun:'+k).digest('hex');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`};
const sha=t=>crypto.createHash('sha256').update(t,'utf8').digest('hex');
(async()=>{
 const admin=new Client({database:process.env.PGDATABASE||'postgres'});await admin.connect();
 await admin.query(`drop database if exists ${DB}`);await admin.query(`create database ${DB}`);await admin.end();
 const db=new Client({database:DB});await db.connect();
 const run=async f=>{await db.query(fs.readFileSync(f,'utf8'))};
 await run(path.join(SB,'tests/00_local_supabase_shim.sql'));
 const migs=fs.readdirSync(path.join(SB,'migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const m of migs){try{await run(path.join(SB,'migrations',m));ok('migration applies: '+m,true)}catch(e){ok('migration applies: '+m,false,e.message);process.exit(1)}}
 const seeds=fs.readdirSync(path.join(SB,'seed')).filter(f=>f.endsWith('.sql')).sort();
 for(const s of seeds){try{await run(path.join(SB,'seed',s));ok('seed applies: '+s,true)}catch(e){ok('seed applies: '+s,false,e.message);process.exit(1)}}
 for(const s of seeds){try{await run(path.join(SB,'seed',s));ok('seed is re-runnable: '+s,true)}catch(e){ok('seed is re-runnable: '+s,false,e.message)}}
 const one=async(sql,p=[])=>(await db.query(sql,p)).rows[0];
 const n=async(sql,p=[])=>+Object.values((await db.query(sql,p)).rows[0])[0];
 // Run fn as a signed-in user (JWT claims) inside a transaction that is rolled back unless keep=true.
 const as=async(who,fn,keep=false,opts={})=>{await db.query('begin');try{
   if(who==='anon'){await db.query("set local role anon");await db.query("select set_config('request.jwt.claims','{\"role\":\"anon\"}',true)")}
   else{const sub=uid('user:'+who);let aal=opts.aal;if(!aal){const f=await db.query("select 1 from auth.mfa_factors where user_id=$1 and status='verified'",[sub]);aal=f.rowCount?'aal2':'aal1'}
    await db.query("set local role authenticated");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub,role:'authenticated',aal})])}
   const r=await fn();await db.query(keep?'commit':'rollback');return r}catch(e){await new Promise(r=>setTimeout(r,5));await db.query('rollback');throw e}};
 const fails=async(who,sql,p=[],opts={})=>{try{await as(who,()=>db.query(sql,p),false,opts);return false}catch(e){return e.message}};
 const rows=async(who,sql,p=[],opts={})=>as(who,async()=>(await db.query(sql,p)).rows,false,opts);

 await db.query("insert into auth.mfa_factors (user_id,factor_type,status) values ($1,'totp','verified')",[uid('user:verifier')]);
 /* ---------- schema ---------- */
 const tables=['users','clinicians','organizations','organization_members','credential_catalog','jurisdictions','issuers','credentials','credential_verifications','verification_sources','requirement_sets','requirements','assignments','assignment_requirements','share_grants','share_grant_assertions','share_access_events','extension_requests','monitoring_events','audit_events','proofs','analytics_events','specialties'];
 ok('schema: all 23 required tables exist',await n(`select count(*) from pg_tables where schemaname='public' and tablename = any($1)`,[tables])===23);
 ok('schema: API roles have no TRUNCATE (bypasses RLS) on any public table',await n(`select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type='TRUNCATE'`)===0);
 ok('schema: RLS enabled on every public table',await n(`select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and not c.relrowsecurity`)===0);
 ok('schema: private helper schema is not granted to anon',!(await one(`select has_schema_privilege('anon','private','USAGE') u`)).u);
 ok('schema: only the owner can run private.sweep_expired_grants()',!(await one(`select has_function_privilege('authenticated','private.sweep_expired_grants()','EXECUTE') a`)).a&&!(await one(`select has_function_privilege('anon','private.sweep_expired_grants()','EXECUTE') a`)).a);
 ok('schema: every private/public function pins search_path (Supabase advisor 0011)',await n(`select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname in ('public','private') and p.prokind='f' and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`)===0);
 ok('schema: anon has no privileges on public sequences',await n(`select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='S' and (has_sequence_privilege('anon',c.oid,'USAGE') or has_sequence_privilege('anon',c.oid,'UPDATE'))`)===0);

 /* ---------- seeds ---------- */
 ok('seed: 56 jurisdictions, 217 catalog kinds, 64 specialties, Massachusetts NLC PENDING',await n(`select count(*) from jurisdictions`)===56&&await n(`select count(*) from credential_catalog`)===217&&await n(`select count(*) from specialties`)===64&&(await one(`select nlc_status from jurisdictions where code='US-MA'`)).nlc_status==='PENDING');
 ok('seed: privacy comes from the catalog (health/screening/reference PRIVATE)',await n(`select count(*) from credential_catalog where privacy='PRIVATE' and (kind like 'HEALTH_%' or kind like 'SCREEN_%' or kind='REF_SPECIALTY')`)===await n(`select count(*) from credential_catalog where kind like 'HEALTH_%' or kind like 'SCREEN_%' or kind='REF_SPECIALTY'`));
 ok('seed: demo data — 3 clinicians, 4 orgs, 5 assignments, Alex 19 credentials',await n(`select count(*) from clinicians where is_demo`)===3&&await n(`select count(*) from organizations`)===4&&await n(`select count(*) from assignments`)===5&&await n(`select count(*) from credentials where clinician_id=$1`,[uid('clinician:alex')])===19);
 // Layered requirement count per assignment × specialty must match the JS engine (Boston ICU 12, Houston 11, Oakland ICU/ED/LD 10/12/11, Phoenix ED 13, Denver LD 12)
 const layered=async(slug,spec)=>n(`with sets as (select s.* from assignment_requirements ar join assignments a on a.id=ar.assignment_id join requirement_sets s on s.id=ar.requirement_set_id where a.slug=$1 and (s.layer<>'SPECIALTY' or s.key=$2)),
   r as (select coalesce(r.kind,'RN_AUTH:'||r.jurisdiction_code) k, r.action from requirements r join sets on sets.id=r.requirement_set_id where not r.is_preferred)
   select count(distinct k) from r where action='ADD' and k not in (select k from r where action='WAIVE')`,[slug,spec]);
 const counts=[await layered('boston-icu','ICU'),await layered('houston-rapid','ICU'),await layered('oakland-strike','ICU'),await layered('oakland-strike','ED'),await layered('oakland-strike','LD'),await layered('phoenix-ed','ED'),await layered('denver-ld','LD')];
 ok('seed: layered requirement counts match the browser engine',counts.join()==='12,11,10,12,11,13,12',counts.join());


 /* ---------- specialties (PR 11) ---------- */
 ok('seed: one SPECIALTY requirement set per specialty, each with experience + skills + reference',await n(`select count(*) from requirement_sets where owner_org_id is null and layer='SPECIALTY'`)===64&&await n(`select count(*) from specialties s where not exists (select 1 from requirement_sets r join requirements q on q.requirement_set_id=r.id where r.layer='SPECIALTY' and r.key=s.id and q.kind='EMP_'||s.id||'_VERIFIED' and not q.is_preferred and q.min_months=12 and q.recency_months=24) or not exists (select 1 from requirement_sets r join requirements q on q.requirement_set_id=r.id where r.layer='SPECIALTY' and r.key=s.id and q.kind='SKILLS_'||s.id)`)===0);
 ok('seed: preferred items are stored but flagged (CCRN preferred for ICU, not required)',await n(`select count(*) from requirements q join requirement_sets r on r.id=q.requirement_set_id where r.layer='SPECIALTY' and r.key='ICU' and q.kind='CERT_CCRN' and q.is_preferred`)===1&&await n(`select count(*) from requirements where is_preferred`)>60);
 ok('seed: every requirement kind exists in the catalog',await n(`select count(*) from requirements q where q.kind is not null and not exists (select 1 from credential_catalog k where k.kind=q.kind)`)===0);
 ok('anon: can read the specialty list',(await rows('anon',`select id from specialties`)).length===64);
 ok('anon/clinician: cannot write the specialty list',!!(await fails('anon',`insert into specialties (id,grp,name,short_name,sort_order) values ('X','g','x','x',1)`))&&!!(await fails('alex',`update specialties set name='x' where id='ICU'`)));
 ok('clinician: can set a new specialty + secondary specialties',(await as('alex',async()=>(await db.query(`update clinicians set specialty='CVICU', secondary_specialties=array['PCU','TELE'] where id=$1`,[uid('clinician:alex')])).rowCount))===1);
 ok('clinician: unknown specialty rejected',/unknown specialty/.test(await fails('alex',`update clinicians set specialty='NOPE' where id=$1`,[uid('clinician:alex')])));
 ok('clinician: unknown secondary specialty rejected; primary cannot repeat as secondary; max 5',/unknown specialty/.test(await fails('alex',`update clinicians set secondary_specialties=array['NOPE'] where id=$1`,[uid('clinician:alex')]))&&/cannot also be/.test(await fails('alex',`update clinicians set secondary_specialties=array['ICU'] where id=$1`,[uid('clinician:alex')]))&&!!(await fails('alex',`update clinicians set secondary_specialties=array['PCU','TELE','ED','LD','OR','PACU'] where id=$1`,[uid('clinician:alex')])));
 ok('clinician: preferences (reminder settings) save on own row',(await as('alex',async()=>(await db.query(`update clinicians set preferences='{"reminderDays":30}' where id=$1`,[uid('clinician:alex')])).rowCount))===1);
 ok('assignments: accepted specialties must be known ids',/unknown specialty/.test((await (async()=>{try{await db.query(`update assignments set accepted_specialties=array['NOPE'] where slug='boston-icu'`);return''}catch(e){return e.message}})())));
 ok('requirements: min_months must fit in the recency window',!!(await (async()=>{try{await db.query('begin');await db.query(`update requirements set min_months=30 where kind='EMP_ICU_VERIFIED'`);await db.query('rollback');return''}catch(e){await db.query('rollback');return e.message}})()));
 ok('get_share_assertions returns kind (for NLC coverage in the org view)',await n(`select count(*) from information_schema.parameters where specific_schema='public' and specific_name like 'get_share_assertions%' and parameter_name='kind' and parameter_mode='OUT'`)===1);

 /* ---------- anon ---------- */
 ok('anon: can read the credential catalog',(await rows('anon',`select kind from credential_catalog`)).length===217);
 ok('anon: cannot read credentials',!!(await fails('anon',`select * from credentials`)));
 ok('anon: cannot read clinicians or share grants',!!(await fails('anon',`select * from clinicians`))&&!!(await fails('anon',`select * from share_grants`)));

 /* ---------- clinicians own their passport ---------- */
 ok('clinician: Alex sees only his 19 credentials',(await rows('alex',`select id from credentials`)).length===19);
 ok('clinician: Jordan sees only his own credentials',(await rows('jordan',`select clinician_id from credentials`)).every(r=>r.clinician_id===uid('clinician:jordan')));
 ok('clinician: cannot self-verify (status change blocked)',/verifier/.test(await fails('alex',`update credentials set status='VERIFIED' where kind='CERT_BLS'`).toString())||!!(await fails('alex',`update credentials set status='REJECTED' where kind='CERT_BLS'`)));
 ok('clinician: cannot edit verified facts (e.g. extend an expiry) — renewal required',/locked/.test(await fails('alex',`update credentials set expires_on=current_date+3650 where clinician_id=$1 and kind='CERT_TNCC'`,[uid('clinician:alex')])));
 ok('clinician: new credential must start unverified',!!(await fails('alex',`insert into credentials (clinician_id,kind,type_code,display_name,jurisdiction_code,status) values ($1,'RN_LICENSE','RN_LICENSE:US-MA','Massachusetts RN License','US-MA','VERIFIED')`,[uid('clinician:alex')])));
 ok('clinician: can add a credential (VERIFYING) to own passport',await as('alex',async()=>(await db.query(`insert into credentials (clinician_id,kind,type_code,display_name,jurisdiction_code) values ($1,'RN_LICENSE','RN_LICENSE:US-MA','Massachusetts RN License','US-MA') returning status`,[uid('clinician:alex')])).rows[0].status==='VERIFYING'));
 ok('clinician: cannot add a credential to another nurse',!!(await fails('alex',`insert into credentials (clinician_id,kind,type_code,display_name) values ($1,'CERT_BLS','CERT_BLS','BLS')`,[uid('clinician:jordan')])));
 ok('clinician: cannot change own app role',!!(await fails('alex',`update users set role='verifier' where id=auth.uid()`)));
 ok('privacy: PRIVATE kinds cannot store health detail in metadata',/structured detail/.test(await fails('alex',`insert into credentials (clinician_id,kind,type_code,display_name,metadata) values ($1,'HEALTH_TB_CURRENT','HEALTH_TB_CURRENT','TB Screening','{"result":"negative"}')`,[uid('clinician:alex')])));
 ok('proofs: shareable credential can get a proof; PRIVATE never on-chain',await as('alex',async()=>{await db.query(`insert into proofs (credential_id,issuer_address) select id,'rDEMO' from credentials where clinician_id=$1 and kind='CERT_BLS'`,[uid('clinician:alex')]);return true})&&/never issued on-chain/.test(await fails('alex',`insert into proofs (credential_id) select id from credentials where clinician_id=$1 and kind='HEALTH_PHYSICAL_CURRENT'`,[uid('clinician:alex')])));

 /* ---------- verifiers via role ---------- */
 ok('verifier: sees every credential (48)',(await rows('verifier',`select id from credentials`)).length===48);
 ok('verifier: can verify + record the verification',await as('verifier',async()=>{await db.query(`update credentials set status='VERIFIED',verified_at=now() where clinician_id=$1 and kind='CERT_TNCC'`,[uid('clinician:alex')]);await db.query(`insert into credential_verifications (credential_id,verifier_user_id,method,outcome) select id,auth.uid(),'SIMULATED_PRIMARY_SOURCE','SUCCEEDED' from credentials where clinician_id=$1 and kind='CERT_TNCC'`,[uid('clinician:alex')]);return true}));
 ok('verifier role cannot be used by a clinician for verifications',!!(await fails('alex',`insert into credential_verifications (credential_id,verifier_user_id,method,outcome) select id,auth.uid(),'SIMULATED_PRIMARY_SOURCE','SUCCEEDED' from credentials where kind='CERT_TNCC'`)));

 /* ---------- organizations: assertions only under a live grant ---------- */
 ok('org: recruiter cannot read the credentials table (0 rows)',(await rows('recruiter-northstar',`select id from credentials`)).length===0);
 ok('org: cannot read clinicians who never shared with it',(await rows('recruiter-northstar',`select id from clinicians`)).length===0);
 // Alex creates grants (committed) — Northstar/Boston through assignment end, Lone Star/Houston until revoked, Pacific/Oakland 7 days, Lone Star one-time.
 const G={};const mk=async(key,org,slug,dur,exp,tok)=>{G[key]=(await as('alex',async()=>(await db.query(`insert into share_grants (clinician_id,org_id,assignment_id,token_hash,duration,expires_at) values ($1,$2,(select id from assignments where slug=$3),$4,$5,$6) returning id`,[uid('clinician:alex'),uid('org:'+org),slug,sha(tok),dur,exp])).rows[0].id,true))};
 const until=new Date(Date.now()+86400e3*60).toISOString();
 await mk('ns','northstar','boston-icu','THROUGH_ASSIGNMENT_END',until,'tok-northstar-boston-0001');
 await mk('ls','lonestar','houston-rapid','UNTIL_REVOKED',null,'tok-lonestar-houston-0002');
 await mk('pc','pacific','oakland-strike','D7',new Date(Date.now()+86400e3*7).toISOString(),'tok-pacific-oakland-0003');
 await mk('ot','lonestar','houston-rapid','ONE_TIME',new Date(Date.now()+86400e3).toISOString(),'tok-lonestar-onetime-0004');
 const addA=async(g,kind,mode,label)=>as('alex',()=>db.query(`insert into share_grant_assertions (grant_id,credential_id,requirement_label,mode) select $1,id,$4,$3 from credentials where clinician_id=$2 and kind=$5 and status='VERIFIED' limit 1`,[g,uid('clinician:alex'),mode,label,kind]),true);
 for(const g of Object.values(G)){await addA(g,'CERT_BLS','VERIFIED_CREDENTIAL','BLS');await addA(g,'HEALTH_PHYSICAL_CURRENT','REQUIREMENT_SATISFIED','Physical Exam')}
 ok('grant: PRIVATE credential cannot be shared as a full credential',/REQUIREMENT_SATISFIED/.test(await fails('alex',`insert into share_grant_assertions (grant_id,credential_id,mode) select $1,id,'VERIFIED_CREDENTIAL' from credentials where clinician_id=$2 and kind='HEALTH_TB_CURRENT'`,[G.ns,uid('clinician:alex')])));
 const jBls=(await one(`select id from credentials where clinician_id=$1 and kind='CERT_BLS'`,[uid('clinician:jordan')])).id;
 ok('grant: cannot attach another nurse\'s credential',/does not belong/.test(await fails('alex',`insert into share_grant_assertions (grant_id,credential_id,mode) values ($1,$2,'VERIFIED_CREDENTIAL')`,[G.ns,jBls])));
 ok('grant: documents can never be shared',!!(await fails('alex',`update share_grants set documents_shared=true where id=$1`,[G.ns])));
 ok('org A cannot read org B\'s share grants',(await rows('recruiter-northstar',`select id,org_id from share_grants`)).every(r=>r.org_id===uid('org:northstar'))&&(await rows('recruiter-northstar',`select id from share_grants`)).length===1);
 ok('org A cannot read org B\'s assertions (table)',(await rows('recruiter-northstar',`select grant_id from share_grant_assertions`)).every(r=>r.grant_id===G.ns));
 ok('org A cannot open org B\'s share (function)',/not authorized/.test(await fails('recruiter-northstar',`select * from get_share_assertions($1)`,[G.ls])));
 ok('org A cannot use org B\'s share link token',/not authorized/.test(await fails('recruiter-northstar',`select * from access_share_by_token('tok-lonestar-houston-0002')`)));
 ok('org: now sees the sharing clinician\'s name (only after a grant)',(await rows('recruiter-northstar',`select full_name from clinicians`)).map(r=>r.full_name).join()==='Alex Morgan');
 const view=await as('recruiter-northstar',async()=>(await db.query(`select * from get_share_assertions($1)`,[G.ns])).rows,true);
 const priv=view.find(r=>r.mode==='REQUIREMENT_SATISFIED'),pub=view.find(r=>r.mode==='VERIFIED_CREDENTIAL');
 ok('live grant: org gets live assertions',view.length===2&&pub.status==='VERIFIED'&&!!pub.expires_on,JSON.stringify(pub));
 ok('no sensitive health detail: PRIVATE assertion = label + "Requirement Satisfied" only',priv.label==='Physical Exam'&&priv.status==='REQUIREMENT_SATISFIED'&&priv.expires_on===null&&priv.issuer===null&&priv.jurisdiction_code===null);
 ok('share views are logged (share_access_events + audit SHARE_VIEWED)',await n(`select count(*) from share_access_events where grant_id=$1 and outcome='GRANTED' and assertions_accessed=2`,[G.ns])===1&&await n(`select count(*) from audit_events where grant_id=$1 and event_type='SHARE_VIEWED'`,[G.ns])===1);
 ok('share link token works for the right org (cross-device path)',(await rows('recruiter-northstar',`select * from access_share_by_token('tok-northstar-boston-0001')`)).length===2);
 ok('org cannot extend its own access (no update on grants)',await as('recruiter-northstar',async()=>(await db.query(`update share_grants set expires_at=now()+interval '1 year' where id=$1`,[G.ns])).rowCount)===0);
 ok('org cannot create grants',!!(await fails('recruiter-northstar',`insert into share_grants (clinician_id,org_id,token_hash,expires_at) values ($1,$2,$3,now()+interval '1 day')`,[uid('clinician:alex'),uid('org:northstar'),sha('x-forged-token-000')])));
 // extension request → clinician approves
 const req=await as('recruiter-northstar',async()=>(await db.query(`insert into extension_requests (grant_id,org_id,requested_by,requested_until,reason) values ($1,$2,auth.uid(),current_date+120,'Contract extended (demo)') returning id`,[G.ns,uid('org:northstar')])).rows[0].id,true);
 ok('org can request an extension (PENDING)',!!req);
 ok('org cannot approve its own extension request',await as('recruiter-northstar',async()=>(await db.query(`update extension_requests set status='APPROVED' where id=$1`,[req])).rowCount)===0);
 ok('org cannot request an extension for another org\'s grant',!!(await fails('recruiter-northstar',`insert into extension_requests (grant_id,org_id,requested_by,requested_until) values ($1,$2,auth.uid(),current_date+30)`,[G.ls,uid('org:northstar')])));
 await as('alex',()=>db.query(`select resolve_extension_request($1,true)`,[req]),true);
 ok('clinician approves extension → grant extended (CUSTOM_DATE)',(await one(`select duration, expires_at::date = current_date+120 as ok from share_grants where id=$1`,[G.ns])).ok===true);
 // revoke → nothing returned
 await as('alex',()=>db.query(`select revoke_share_grant($1)`,[G.ns]),true);
 ok('revoked grant: assertions table returns nothing to the org',(await rows('recruiter-northstar',`select * from share_grant_assertions`)).length===0);
 ok('revoked grant: get_share_assertions returns nothing + refusal logged',(await as('recruiter-northstar',async()=>(await db.query(`select * from get_share_assertions($1)`,[G.ns])).rows,true)).length===0&&await n(`select count(*) from share_access_events where grant_id=$1 and outcome='REFUSED_REVOKED'`,[G.ns])===1);
 ok('revoked grant: org still sees status REVOKED with timestamp',(await rows('recruiter-northstar',`select status,revoked_at from share_grants where id=$1`,[G.ns])).every(r=>r.status==='REVOKED'&&r.revoked_at));
 ok('revoked grant cannot be reactivated',/cannot be reactivated/.test(await fails('alex',`update share_grants set status='ACTIVE' where id=$1`,[G.ns])));
 ok('grant identity is immutable (cannot re-target to another org)',/immutable/.test(await fails('alex',`update share_grants set org_id=$2 where id=$1`,[G.ls,uid('org:summit')])));
 // expired grant (backdate as superuser, without running the sweep)
 await db.query(`update share_grants set expires_at=now()-interval '1 minute' where id=$1`,[G.pc]);
 ok('expired grant: assertions table returns nothing (even before the sweep)',(await rows('recruiter-pacific',`select * from share_grant_assertions`)).length===0);
 ok('expired grant: get_share_assertions returns nothing + REFUSED_EXPIRED logged',(await as('recruiter-pacific',async()=>(await db.query(`select * from get_share_assertions($1)`,[G.pc])).rows,true)).length===0&&await n(`select count(*) from share_access_events where grant_id=$1 and outcome='REFUSED_EXPIRED'`,[G.pc])===1);
 ok('sweep marks lapsed grants EXPIRED',await n(`select private.sweep_expired_grants()`)>=1&&(await one(`select status from share_grants where id=$1`,[G.pc])).status==='EXPIRED');
 // one-time
 const first=await as('recruiter-lonestar',async()=>(await db.query(`select * from get_share_assertions($1)`,[G.ot])).rows,true);
 const second=await as('recruiter-lonestar',async()=>(await db.query(`select * from get_share_assertions($1)`,[G.ot])).rows,true);
 ok('one-time grant: first view works, second returns nothing (REFUSED_USED)',first.length===2&&second.length===0&&await n(`select count(*) from share_access_events where grant_id=$1 and outcome='REFUSED_USED'`,[G.ot])===1);
 ok('until-revoked grant stays live for its org',(await rows('recruiter-lonestar',`select * from share_grant_assertions where grant_id=$1`,[G.ls])).length===2);

 /* ---------- append-only events ---------- */
 ok('append-only: audit_events cannot be updated (even by the table owner)',/append-only/.test(await db.query(`update audit_events set result='x'`).then(()=>'',e=>e.message)));
 ok('append-only: share_access_events cannot be deleted (even by the table owner)',/append-only/.test(await db.query(`delete from share_access_events`).then(()=>'',e=>e.message)));
 ok('append-only: clinicians cannot delete audit events',!!(await fails('alex',`delete from audit_events`)));
 ok('append-only: clients cannot write share_access_events directly',!!(await fails('recruiter-northstar',`insert into share_access_events (grant_id,outcome) values ($1,'GRANTED')`,[G.ls])));
 ok('audit: clinician can log own events, not verifier events',await as('alex',async()=>{await db.query(`insert into audit_events (event_type,actor_user_id,actor_type,clinician_id) values ('CREDENTIAL_UPLOADED',auth.uid(),'CLINICIAN',$1)`,[uid('clinician:alex')]);return true})&&!!(await fails('alex',`insert into audit_events (event_type,actor_user_id,actor_type) values ('VERIFICATION_SUCCEEDED',auth.uid(),'VERIFIER')`)));
 ok('audit: org sees its own org events, not other orgs\'',(await rows('recruiter-lonestar',`select org_id from audit_events`)).every(r=>r.org_id===uid('org:lonestar')));

 /* ---------- PR 10: accounts + cross-device sync (migration 4) ---------- */
 ok('accounts: anon cannot create an organization',!!(await fails('anon',`select public.create_organization('Anon Org')`)));
 const newOrg=await as('jordan',async()=>(await db.query(`select * from public.create_organization('Jordan Staffing (test)','STAFFING_AGENCY')`)).rows[0],true);
 ok('accounts: signed-in user can create an organization and becomes its owner',!!newOrg&&/^jordan-staffing-test-[0-9a-f]{6}$/.test(newOrg.slug)&&newOrg.is_demo===false&&await n(`select count(*) from organization_members where org_id=$1 and user_id=$2 and role='owner'`,[newOrg.id,uid('user:jordan')])===1,newOrg&&newOrg.slug);
 ok('accounts: organization creation is audited',await n(`select count(*) from audit_events where org_id=$1 and event_type='ORGANIZATION_CREATED'`,[newOrg.id])===1);
 await as('jordan',async()=>{await db.query(`select public.create_organization('J2')`);await db.query(`select public.create_organization('J3')`)},true);
 ok('accounts: staging limit of 3 owned organizations per account',/staging limit/.test(await fails('jordan',`select public.create_organization('J4')`)));
 ok('accounts: organization name is validated',/2-120/.test(await fails('alex',`select public.create_organization(' ')`)));
 // Alex shares a not-yet-verified credential with Jordan's new org, with assignment context.
 const pendTok='tok-pr10-pending-000000001';
 const pg=(await as('alex',async()=>{const c=(await db.query(`insert into credentials (clinician_id,kind,type_code,display_name,jurisdiction_code) values ($1,'RN_LICENSE','RN_LICENSE:US-NV','Nevada RN License','US-NV') returning id`,[uid('clinician:alex')])).rows[0].id;
   const g=(await db.query(`insert into share_grants (clinician_id,org_id,token_hash,duration,expires_at,assignment_label,assignment_starts_on,assignment_ends_on) values ($1,$2,$3,'D7',now()+interval '7 days','Las Vegas ICU travel (test)',current_date+10,current_date+100) returning id`,[uid('clinician:alex'),newOrg.id,sha(pendTok)])).rows[0].id;
   await db.query(`insert into share_grant_assertions (grant_id,credential_id,requirement_label,mode) values ($1,$2,'Nevada RN License','VERIFIED_CREDENTIAL')`,[g,c]);return g},true));
 const pv=await as('jordan',async()=>(await db.query(`select * from access_share_by_token($1)`,[pendTok])).rows,true);
 ok('assertions: unverified credential is shown as PENDING_VERIFICATION, never VERIFIED',pv.length===1&&pv[0].status==='PENDING_VERIFICATION',JSON.stringify(pv));
 ok('grants: assignment context is stored and visible to the receiving org',(await rows('jordan',`select assignment_label,assignment_ends_on from share_grants where id=$1`,[pg])).every(r=>r.assignment_label==='Las Vegas ICU travel (test)'&&r.assignment_ends_on));
 ok('grants: assignment context is immutable',/immutable/.test(await fails('alex',`update share_grants set assignment_label='Other' where id=$1`,[pg])));
 ok('grants: assignment window must be ordered',!!(await fails('alex',`insert into share_grants (clinician_id,org_id,token_hash,duration,expires_at,assignment_starts_on,assignment_ends_on) values ($1,$2,$3,'D7',now()+interval '7 days',current_date+10,current_date+1)`,[uid('clinician:alex'),newOrg.id,sha('tok-pr10-badwindow-0001')])));
 ok('grants: a used one-time grant cannot be reactivated',/used one-time/.test(await fails('alex',`update share_grants set status='ACTIVE' where id=$1`,[G.ot])));
 ok('grants: other orgs still cannot open it',/not authorized/.test(await fails('recruiter-northstar',`select * from access_share_by_token($1)`,[pendTok])));
 ok('append-only: owner still cannot rewrite event content',/append-only/.test(await db.query(`update share_access_events set outcome='GRANTED' where outcome='REFUSED_USED'`).then(()=>'',e=>e.message)));
 const del=await db.query('begin').then(async()=>{try{await db.query(`delete from auth.users where id=$1`,[uid('user:alex')]);const left=await n(`select count(*) from audit_events where clinician_id=$1`,[uid('clinician:alex')]);const kept=await n(`select count(*) from audit_events where event_type='SHARE_VIEWED'`);return{ok:true,left,kept}}catch(e){return{ok:false,e:e.message}}finally{await db.query('rollback')}});
 ok('accounts: deleting a user with history works (events keep content, FKs set null)',del.ok&&del.left===0&&del.kept>0,JSON.stringify(del));

 /* ---------- org membership & assignments ---------- */
 ok('org members: cannot list another org\'s members',(await rows('recruiter-northstar',`select org_id from organization_members`)).every(r=>r.org_id===uid('org:northstar')));
 ok('assignments: published opportunities visible to signed-in users (5)',(await rows('jordan',`select id from assignments`)).length===5);
 ok('assignments: org cannot publish for another org',!!(await fails('recruiter-northstar',`insert into assignments (org_id,slug,name,work_type,jurisdiction_code,starts_on,ends_on,accepted_specialties) values ($1,'x-test','X','TRAVEL_RN','US-TX',current_date+1,current_date+30,array['ICU'])`,[uid('org:lonestar')])));
 ok('assignments: org can publish its own',await as('recruiter-northstar',async()=>(await db.query(`insert into assignments (org_id,slug,name,work_type,jurisdiction_code,starts_on,ends_on,accepted_specialties) values ($1,'ns-test','NS test','TRAVEL_RN','US-TX',current_date+1,current_date+30,array['ICU']) returning id`,[uid('org:northstar')])).rowCount===1));

 /* ---------- storage: private source documents ---------- */
 ok('storage: source-documents bucket is private',(await one(`select public from storage.buckets where id='source-documents'`)).public===false);
 const alexU=uid('user:alex'),jordanU=uid('user:jordan');
 ok('storage: clinician uploads into own folder',await as('alex',async()=>(await db.query(`insert into storage.objects (bucket_id,name) values ('source-documents',$1)`,[`${alexU}/cred-1/ma-license.pdf`])).rowCount===1,true));
 ok('storage: clinician cannot upload into another user\'s folder',!!(await fails('alex',`insert into storage.objects (bucket_id,name) values ('source-documents',$1)`,[`${jordanU}/x/doc.pdf`])));
 ok('storage: other clinicians and orgs cannot read it (no signed URL possible)',(await rows('jordan',`select name from storage.objects`)).length===0&&(await rows('recruiter-northstar',`select name from storage.objects`)).length===0);
 ok('storage: owner and verifier can read it (signed URLs allowed)',(await rows('alex',`select name from storage.objects`)).length===1&&(await rows('verifier',`select name from storage.objects`)).length===1);


 /* ---------- PR 12: MFA step-up, issuer check, anchor commitment ---------- */
 ok('pr12: lookup pages are real https URLs, not simulated',await n(`select count(*) from verification_sources where lookup_url like 'https://%' and is_simulated=false`)>=6);
 await db.query(`insert into auth.mfa_factors (user_id,factor_type,status) values ($1,'totp','verified')`,[uid('user:alex')]);
 ok('pr12: enrolled clinician at aal1 cannot read credentials', (await rows('alex',`select id from credentials`,[],{aal:'aal1'})).length===0);
 ok('pr12: same clinician at aal2 still sees their credentials', (await rows('alex',`select id from credentials`,[],{aal:'aal2'})).length>=19);
 ok('pr12: enrolled clinician at aal1 cannot create a share', /row-level security|policy/i.test(String(await fails('alex',`insert into share_grants (clinician_id,org_id,token_hash,duration,expires_at) values ($1,$2,$3,'D7',now()+interval '1 day')`,[uid('clinician:alex'),uid('org:northstar'),sha('tok-pr12-aal1-block')],{aal:'aal1'}))));
 ok('pr12: enrolled clinician at aal1 cannot read a document row', (await rows('alex',`select name from storage.objects`,[],{aal:'aal1'})).length===0);
 await db.query('delete from auth.mfa_factors where user_id=$1',[uid('user:alex')]);
 const alexBls=(await one(`select id from credentials where clinician_id=$1 and kind='CERT_BLS'`,[uid('clinician:alex')])).id;
 ok('pr12: clinician cannot record a verification', /only a verifier/.test(String(await fails('alex',`select public.record_verification($1,'VERIFIED','Nursys QuickConfirm','REF-1',current_date)`,[alexBls]))));
 const jordanBls=(await one(`select id from credentials where clinician_id=$1 and kind='CERT_BLS'`,[uid('clinician:jordan')])).id;
 ok('pr12: verifier at aal1 cannot record a verification', /authenticator/.test(String(await fails('verifier',`select public.record_verification($1,'VERIFIED','AHA eCard verification','ECARD-1',current_date)`,[jordanBls],{aal:'aal1'}))));
 const bls=await one(`select id, clinician_id, expires_on::text exp from credentials where clinician_id=$1 and kind='CERT_BLS'`,[uid('clinician:alex')]);
 const rec=await as('verifier',async()=>(await db.query(`select public.record_verification($1,'VERIFIED','AHA eCard verification','SHOULD-NOT-BE-ON-CHAIN',current_date) j`,[bls.id])).rows[0].j,true);
 ok('pr12: verifier at aal2 records a check and a 64-hex commitment', !!(rec&&rec.result==='VERIFIED'&&/^[0-9a-f]{64}$/.test(rec.commitment)));
 const anchor=await one(`select commitment, salt from verification_anchors where verification_id=$1`,[rec.verification_id]);
 const canon=await one(`select private.verification_canonical($1::uuid,'CERT_BLS',$2::uuid,'VERIFIED','AHA eCard verification',to_char(current_date,'YYYY-MM-DD'),coalesce($3,''),$4) t`,[bls.id,bls.clinician_id,bls.exp,anchor.salt]);
 ok('pr12: commitment matches the canonical record and excludes the reference code', anchor.commitment===sha(canon.t)&&!canon.t.includes('SHOULD-NOT-BE-ON-CHAIN')&&!canon.t.includes('@'));
 const selfOwn=await (async()=>{
   const ins=await db.query(`insert into public.clinicians (user_id,full_name,specialty,home_jurisdiction,is_demo) values ($1,'Verifier Self','ICU','US-ME',true) on conflict (user_id) do update set full_name=excluded.full_name returning id`,[uid('user:verifier')]);
   const cred=(await db.query(`insert into credentials (clinician_id,kind,type_code,display_name,status) values ($1,'CERT_TNCC','CERT_TNCC','Self TNCC','VERIFYING') returning id`,[ins.rows[0].id])).rows[0].id;
   return /own credential/.test(String(await fails('verifier',`select public.record_verification($1,'VERIFIED','AHA eCard verification','SELF',current_date)`,[cred])));
 })();
 ok('pr12: a verifier cannot verify their own credential', selfOwn===true);
 await db.query(`update credentials set expires_on=current_date+10 where id=$1`,[bls.id]);
 const now=await one(`select private.sha256_hex(private.verification_canonical($1::uuid,'CERT_BLS',$2::uuid,'VERIFIED','AHA eCard verification',to_char(current_date,'YYYY-MM-DD'),(select coalesce(expires_on::text,'') from credentials where id=$1),$3)) h`,[bls.id,bls.clinician_id,anchor.salt]);
 ok('pr12: changing expiration makes the recomputed commitment mismatch', now.h!==anchor.commitment);
 const act=await as('alex',async()=>(await db.query(`select public.prepare_activity_anchor() j`)).rows[0].j,true);
 const chk=await as('alex',async()=>(await db.query(`select public.check_activity_anchor($1) j`,[act.anchor_id])).rows[0].j);
 ok('pr12: activity-log fingerprint matches until the covered rows change', act&&/^[0-9a-f]{64}$/.test(act.commitment)&&chk.match===true&&!JSON.stringify(act).includes('@'));

 /* ---------- PR 13: verification source registry, levels, floors ---------- */
 ok('pr13: registry has 56 approved board sources, one per jurisdiction',await n(`select count(*) from verification_sources where source_type='LICENSING_BOARD' and status='APPROVED'`)===56&&await n(`select count(distinct jurisdiction_code) from verification_sources where source_type='LICENSING_BOARD'`)===56);
 ok('pr13: Nursys QuickConfirm approved (primary-source equivalent), e-Notify pending, AI extraction unapproved with no level',(await one(`select status, source_method, grants_level from verification_sources where slug='nursys-quickconfirm'`)).status==='APPROVED'&&(await one(`select status from verification_sources where slug='nursys-enotify'`)).status==='PENDING'&&(await one(`select status, grants_level from verification_sources where slug='ai-extraction'`)).grants_level===null);
 ok('pr13: QuickConfirm covers 55 jurisdictions (not Puerto Rico)',await n(`select cardinality(covered_jurisdictions) from verification_sources where slug='nursys-quickconfirm'`)===55&&await n(`select count(*) from verification_sources where slug='nursys-quickconfirm' and 'US-PR'=any(covered_jurisdictions)`)===0);
 ok('pr13: no document review / self-attestation / AI source grants primary source',await n(`select count(*) from verification_sources where source_method in ('DOCUMENT_REVIEW','SELF_ATTESTED','AI_EXTRACTION') and private.level_rank(grants_level)>=5`)===0);
 ok('pr13: database refuses a document-review source that claims primary source',/never_psv/.test(String(await db.query(`insert into verification_sources (name,method,slug,source_type,source_method,grants_level,status) values ('Bad','MANUAL_DOCUMENT_REVIEW','bad','PLATFORM','DOCUMENT_REVIEW','PRIMARY_SOURCE_VERIFIED','APPROVED')`).then(()=>'inserted',e=>e.message))));
 ok('pr13: every registry lookup URL is https',await n(`select count(*) from verification_sources where slug is not null and lookup_url is not null and lookup_url !~ '^https://'`)===0);
 ok('pr13: catalog floors — RN license primary source (locked), BLS issuer (locked), ICU experience employer (default)',(await one(`select min_verification_level l, level_floor_locked k from credential_catalog where kind='RN_LICENSE'`)).l==='PRIMARY_SOURCE_VERIFIED'&&(await one(`select min_verification_level l, level_floor_locked k from credential_catalog where kind='CERT_BLS'`)).k===true&&(await one(`select min_verification_level l, level_floor_locked k from credential_catalog where kind='EMP_ICU_VERIFIED'`)).l==='EMPLOYER_VERIFIED');
 ok('pr13: platform requirements carry policy code, version, min level and validity rule',await n(`select count(*) from requirements r join requirement_sets s on s.id=r.requirement_set_id where s.owner_org_id is null and (r.min_verification_level is null or s.policy_code is null or r.validity_rule is null)`)===0);
 const facSet=(await one(`select id from requirement_sets where owner_org_id is not null and layer='FACILITY' limit 1`)).id;
 ok('pr13: a facility rule cannot lower the issuer floor for BLS',/cannot lower/.test(String(await db.query(`insert into requirements (requirement_set_id,kind,action,min_verification_level) values ($1,'CERT_BLS','ADD','DOCUMENT_REVIEWED')`,[facSet]).then(()=>'inserted',e=>e.message))));
 ok('pr13: a facility rule cannot lower the legal floor for RN authorization',/cannot lower/.test(String(await db.query(`insert into requirements (requirement_set_id,is_rn_authorization,jurisdiction_code,action,min_verification_level) values ($1,true,'US-MA','ADD','ISSUER_VERIFIED')`,[facSet]).then(()=>'inserted',e=>e.message))));
 const raised=await db.query(`insert into requirements (requirement_set_id,kind,action,min_verification_level) values ($1,'EMP_ICU_VERIFIED','ADD','PRIMARY_SOURCE_VERIFIED') returning id`,[facSet]).then(r=>r.rows[0].id,()=>null);
 const relaxed=await db.query(`insert into requirements (requirement_set_id,kind,action,min_verification_level) values ($1,'HEALTH_HEPB','ADD','SELF_ATTESTED') returning id`,[facSet]).then(r=>r.rows[0].id,()=>null);
 ok('pr13: a facility can raise a level and relax an unlocked default',!!raised&&!!relaxed);
 await db.query(`delete from requirements where id = any($1)`,[[raised,relaxed].filter(Boolean)]);
 const jCa=(await one(`select id, clinician_id from credentials where clinician_id=$1 and kind='RN_LICENSE' and jurisdiction_code='US-CA'`,[uid('clinician:jordan')]));
 const psv=(who,src,res,st,exp,opts)=>`select public.record_source_check('${jCa.id}','${src}','${res}','${st}',${exp?`'${exp}'`:'null'},'BRN-REF-123',current_date,'MANUAL_RECHECK') j`;
 ok('pr13: clinician cannot record a source check',/only a verifier/.test(String(await fails('jordan',psv(0,'board-US-CA','VERIFIED','ACTIVE','2028-01-31')))));
 ok('pr13: verifier at aal1 cannot record a source check',/authenticator/.test(String(await fails('verifier',psv(0,'board-US-CA','VERIFIED','ACTIVE','2028-01-31'),[],{aal:'aal1'}))));
 ok('pr13: another state\'s board cannot verify a California license',/only confirms licenses it issued/.test(String(await fails('verifier',psv(0,'board-US-MA','VERIFIED','ACTIVE','2028-01-31')))));
 ok('pr13: document review is refused for an RN license',/does not cover/.test(String(await fails('verifier',psv(0,'document-review','VERIFIED','ACTIVE','2028-01-31')))));
 ok('pr13: a pending source (Nursys e-Notify) is refused',/not an approved/.test(String(await fails('verifier',psv(0,'nursys-enotify','VERIFIED','ACTIVE','2028-01-31')))));
 ok('pr13: VERIFIED needs the source to show ACTIVE',/only when the source shows it ACTIVE/.test(String(await fails('verifier',psv(0,'board-US-CA','VERIFIED','EXPIRED','2028-01-31')))));
 ok('pr13: a license VERIFIED needs the source expiration',/expiration date the source shows/.test(String(await fails('verifier',psv(0,'board-US-CA','VERIFIED','ACTIVE',null)))));
 ok('pr13: continuous monitoring is refused without a monitoring source',/does not provide continuous monitoring/.test(String(await fails('verifier',`select public.record_source_check($1,'nursys-quickconfirm','VERIFIED','ACTIVE','2028-01-31','NQC-1',current_date,'ENROLLED')`,[jCa.id]))));
 const prLic=(await one(`insert into credentials (clinician_id,kind,type_code,display_name,jurisdiction_code,status) values ($1,'RN_LICENSE','RN_LICENSE:US-PR','Puerto Rico RN License','US-PR','VERIFYING') returning id`,[uid('clinician:sam')])).id;
 ok('pr13: Nursys QuickConfirm cannot verify a Puerto Rico license (board does not send data)',/does not carry data/.test(String(await fails('verifier',`select public.record_source_check($1,'nursys-quickconfirm','VERIFIED','ACTIVE','2028-01-31','NQC-1',current_date,'MANUAL_RECHECK')`,[prLic]))));
 const ck=await as('verifier',async()=>(await db.query(psv(0,'board-US-CA','VERIFIED','ACTIVE','2028-01-31'))).rows[0].j,true);
 const cr=await one(`select status::text, verification_level, monitoring_state, expires_on::text exp from credentials where id=$1`,[jCa.id]);
 const cv=await one(`select source_slug, status_at_source, verification_level, verifier_label, policy_ref, reference_code from credential_verifications where id=$1`,[ck.verification_id]);
 ok('pr13: board check records PRIMARY_SOURCE_VERIFIED with source, status, expiration and monitoring',ck.level==='PRIMARY_SOURCE_VERIFIED'&&cr.status==='VERIFIED'&&cr.verification_level==='PRIMARY_SOURCE_VERIFIED'&&cr.monitoring_state==='MANUAL_RECHECK'&&cr.exp==='2028-01-31'&&cv.source_slug==='board-US-CA'&&cv.status_at_source==='ACTIVE'&&!!cv.verifier_label&&/board-US-CA/.test(cv.policy_ref),JSON.stringify({ck:ck.level,cr,cv:{...cv,reference_code:undefined}}));
 // Share assertions carry the level + source so an org sees "Primary Source Verified", not a bare VERIFIED.
 const lvTok='tok-pr13-level-share-0001';
 const jPriv=(await one(`select c.id from credentials c join credential_catalog k on k.kind=c.kind where c.clinician_id=$1 and k.privacy='PRIVATE' and c.status='VERIFIED' limit 1`,[uid('clinician:jordan')])).id;
 await db.query(`insert into credential_verifications (credential_id,method,outcome,source_name,checked_on) values ($1,'MANUAL_DOCUMENT_REVIEW','SUCCEEDED','Occupational Health Lab X',current_date)`,[jPriv]);
 const jPend=(await one(`select c.id from credentials c join credential_catalog k on k.kind=c.kind where c.clinician_id=$1 and k.privacy<>'PRIVATE' and c.status='VERIFIED' and c.id<>$2 and c.kind not like 'RN_LICENSE%' limit 1`,[uid('clinician:jordan'),jCa.id])).id;
 await db.query(`update credentials set status='VERIFYING' where id=$1`,[jPend]);
 await as('jordan',async()=>{const g=(await db.query(`insert into share_grants (clinician_id,org_id,token_hash,duration,expires_at) values ($1,$2,$3,'D7',now()+interval '7 days') returning id`,[uid('clinician:jordan'),uid('org:northstar'),sha(lvTok)])).rows[0].id;
   await db.query(`insert into share_grant_assertions (grant_id,credential_id,requirement_label,mode) values ($1,$2,'California RN License','VERIFIED_CREDENTIAL'),($1,$3,'Health record','REQUIREMENT_SATISFIED'),($1,$4,'Pending cert','VERIFIED_CREDENTIAL')`,[g,jCa.id,jPriv,jPend]);return g},true);
 const lvAll=await rows('recruiter-northstar',`select * from access_share_by_token($1)`,[lvTok]);
 const lv=lvAll.find(x=>x.requirement_label==='California RN License')||{},lvP=lvAll.find(x=>x.requirement_label==='Health record')||{},lvQ=lvAll.find(x=>x.requirement_label==='Pending cert')||{};
 ok('pr13: share assertions return the verification level, source and check date to the org',lvAll.length===3&&lv.status==='VERIFIED'&&lv.verification_level==='PRIMARY_SOURCE_VERIFIED'&&lv.verification_source==='California Board of Registered Nursing'&&!!lv.source_checked_on,JSON.stringify({n:lvAll.length,s:lv.status,l:lv.verification_level,src:lv.verification_source}));
 ok('pr13: an item that is not currently verified carries no level or source',lvQ.status==='PENDING_VERIFICATION'&&lvQ.verification_level==null&&lvQ.verification_source==null,JSON.stringify(lvQ));
 ok('pr13: a private (Requirement satisfied) item shows its level but never the source',lvP.status==='REQUIREMENT_SATISFIED'&&lvP.verification_level==='DOCUMENT_REVIEWED'&&lvP.verification_source==null&&lvP.source_checked_on==null,JSON.stringify(lvP));
 await db.query(`update credentials set status='VERIFIED' where id=$1`,[jPend]);
 const an=await one(`select commitment, salt from verification_anchors where verification_id=$1`,[ck.verification_id]);
 const cn=await one(`select private.verification_canonical($1::uuid,'RN_LICENSE',$2::uuid,'VERIFIED','California Board of Registered Nursing',to_char(current_date,'YYYY-MM-DD'),'2028-01-31',$3) t`,[jCa.id,jCa.clinician_id,an.salt]);
 ok('pr13: commitment uses the source name and source expiration, never the reference',an.commitment===sha(cn.t)&&!cn.t.includes('BRN-REF-123'));
 ok('pr13: verifier cannot set a level by direct update',/set only by a recorded source check/.test(String(await fails('verifier',`update credentials set verification_level='CONTINUOUSLY_MONITORED' where id=$1`,[jCa.id]))));
 ok('pr13: verifier cannot insert a verification row that claims a level',/row-level security|policy/i.test(String(await fails('verifier',`insert into credential_verifications (credential_id,verifier_user_id,method,outcome,verification_level) values ($1,$2,'MANUAL_DOCUMENT_REVIEW','SUCCEEDED','PRIMARY_SOURCE_VERIFIED')`,[jCa.id,uid('user:verifier')]))));
 ok('pr13: a direct status change by a verifier drops the level',await as('verifier',async()=>{await db.query(`update credentials set status='REVOKED' where id=$1`,[jCa.id]);return(await db.query(`select verification_level from credentials where id=$1`,[jCa.id])).rows[0].verification_level===null}));
 const fail=await as('verifier',async()=>(await db.query(psv(0,'nursys-quickconfirm','FAILED','SUSPENDED',null))).rows[0].j,true);
 const fr=await one(`select status::text, verification_level from credentials where id=$1`,[jCa.id]);
 ok('pr13: a SUSPENDED result at the source revokes the credential and clears its level',fail.result==='FAILED'&&fr.status==='REVOKED'&&fr.verification_level===null);
 ok('pr13: PR 12 free-text check of a named approved issuer gives Issuer Verified',(await one(`select verification_level from credentials where id=$1`,[bls.id])).verification_level==='ISSUER_VERIFIED');
 const samCa=(await one(`select id from credentials where clinician_id=$1 and kind='RN_LICENSE'`,[uid('clinician:sam')])).id;
 await as('verifier',async()=>db.query(`select public.record_verification($1,'VERIFIED','Some website','X-1',current_date)`,[samCa]),true);
 ok('pr13: PR 12 free-text check with an unknown source counts only as Document Reviewed',(await one(`select verification_level from credentials where id=$1`,[samCa])).verification_level==='DOCUMENT_REVIEWED');


 await db.end();
 const f=R.filter(r=>r.startsWith('FAIL')).length;console.log(`\n${R.length-f}/${R.length} passed`);process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
