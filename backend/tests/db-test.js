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
 const as=async(who,fn,keep=false)=>{await db.query('begin');try{
   if(who==='anon'){await db.query("set local role anon");await db.query("select set_config('request.jwt.claims','{\"role\":\"anon\"}',true)")}
   else{await db.query("set local role authenticated");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid('user:'+who),role:'authenticated'})])}
   const r=await fn();await db.query(keep?'commit':'rollback');return r}catch(e){await new Promise(r=>setTimeout(r,5));await db.query('rollback');throw e}};
 const fails=async(who,sql,p=[])=>{try{await as(who,()=>db.query(sql,p));return false}catch(e){return e.message}};
 const rows=async(who,sql,p=[])=>as(who,async()=>(await db.query(sql,p)).rows);

 /* ---------- schema ---------- */
 const tables=['users','clinicians','organizations','organization_members','credential_catalog','jurisdictions','issuers','credentials','credential_verifications','verification_sources','requirement_sets','requirements','assignments','assignment_requirements','share_grants','share_grant_assertions','share_access_events','extension_requests','monitoring_events','audit_events','proofs','analytics_events'];
 ok('schema: all 22 required tables exist',await n(`select count(*) from pg_tables where schemaname='public' and tablename = any($1)`,[tables])===22);
 ok('schema: RLS enabled on every public table',await n(`select count(*) from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r' and not c.relrowsecurity`)===0);
 ok('schema: private helper schema is not granted to anon',!(await one(`select has_schema_privilege('anon','private','USAGE') u`)).u);
 ok('schema: only the owner can run private.sweep_expired_grants()',!(await one(`select has_function_privilege('authenticated','private.sweep_expired_grants()','EXECUTE') a`)).a&&!(await one(`select has_function_privilege('anon','private.sweep_expired_grants()','EXECUTE') a`)).a);

 /* ---------- seeds ---------- */
 ok('seed: 56 jurisdictions, 36 catalog kinds, Massachusetts NLC PENDING',await n(`select count(*) from jurisdictions`)===56&&await n(`select count(*) from credential_catalog`)===36&&(await one(`select nlc_status from jurisdictions where code='US-MA'`)).nlc_status==='PENDING');
 ok('seed: privacy comes from the catalog (health/screening/reference PRIVATE)',await n(`select count(*) from credential_catalog where privacy='PRIVATE' and (kind like 'HEALTH_%' or kind like 'SCREEN_%' or kind='REF_SPECIALTY')`)===await n(`select count(*) from credential_catalog where kind like 'HEALTH_%' or kind like 'SCREEN_%' or kind='REF_SPECIALTY'`));
 ok('seed: demo data — 3 clinicians, 4 orgs, 5 assignments, Alex 19 credentials',await n(`select count(*) from clinicians where is_demo`)===3&&await n(`select count(*) from organizations`)===4&&await n(`select count(*) from assignments`)===5&&await n(`select count(*) from credentials where clinician_id=$1`,[uid('clinician:alex')])===19);
 // Layered requirement count per assignment × specialty must match the JS engine (Boston ICU 12, Houston 11, Oakland ICU/ED/LD 10/12/11, Phoenix ED 13, Denver LD 12)
 const layered=async(slug,spec)=>n(`with sets as (select s.* from assignment_requirements ar join assignments a on a.id=ar.assignment_id join requirement_sets s on s.id=ar.requirement_set_id where a.slug=$1 and (s.layer<>'SPECIALTY' or s.key=$2)),
   r as (select coalesce(r.kind,'RN_AUTH:'||r.jurisdiction_code) k, r.action from requirements r join sets on sets.id=r.requirement_set_id)
   select count(distinct k) from r where action='ADD' and k not in (select k from r where action='WAIVE')`,[slug,spec]);
 const counts=[await layered('boston-icu','ICU'),await layered('houston-rapid','ICU'),await layered('oakland-strike','ICU'),await layered('oakland-strike','ED'),await layered('oakland-strike','LD'),await layered('phoenix-ed','ED'),await layered('denver-ld','LD')];
 ok('seed: layered requirement counts match the browser engine',counts.join()==='12,11,10,12,11,13,12',counts.join());

 /* ---------- anon ---------- */
 ok('anon: can read the credential catalog',(await rows('anon',`select kind from credential_catalog`)).length===36);
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

 await db.end();
 const f=R.filter(r=>r.startsWith('FAIL')).length;console.log(`\n${R.length-f}/${R.length} passed`);process.exit(f?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
