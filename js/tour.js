/* Golden-demo guided tour (PR6). Optional: started from "Start Demo Tour".
   Resets demo data, then walks the Boston golden path in 11 steps:
   readiness → 11/12 → add MA license → pending → simulated check → 12/12 →
   assignment-scoped share → org sees access → revoke → audit log.
   Auto-play advances every TOUR_STEP_MS (about 75 seconds in total). */
const TOUR_STEP_MS=7000;
let tourState=null;
function tourQuiet(fn){const a=window.alert,c=window.confirm;window.alert=()=>{};window.confirm=()=>true;try{return fn()}finally{window.alert=a;window.confirm=c}}
function tourCloseDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close())}
function tourOrgTab(t){v81Tabs('orgTab','orgPanel',t)}
function tourVerTab(t){v81Tabs('verifyTab','verifyPanel',t)}
function tourBostonCard(){return[...document.querySelectorAll('#oppListV82 .opp-card-v7')].find(c=>/Boston Travel ICU/.test(c.textContent))||null}
function tourPanel(id){const e=$(id);return e?(e.closest('.panel-v81')||e):null}
const TOUR_STEPS=[
 {title:'Can this nurse start this assignment?',body:'Veridun is a portable, verified RN Passport plus an assignment-readiness engine. This tour runs the golden demo on fresh demo data. All verification is simulated.',run(){v81RolePicker()},target:()=>document.querySelector('.role-cards')},
 {title:'Portable readiness',body:'Alex Morgan, an ICU travel RN, keeps one verified Passport. It is reused across opportunities: 2 of 3 are ready to submit today, with no re-collecting documents.',run(){v81ShowRole('clinician');showV7View('homeView')},target:()=>$('homeReadyV85')},
 {title:'Boston Travel ICU: 11/12',body:'Requirements are layered: Massachusetts licensure + Travel RN base + ICU module + facility + dates. Alex\'s Arizona multistate license doesn\'t cover Massachusetts (NLC enacted, not yet in effect), so one item is missing.',run(){showV7View('opportunitiesView')},target:tourBostonCard},
 {title:'Complete the missing requirement',body:'One tap opens Add Credential pre-filled from the RN catalog: RN License (single-state) · Massachusetts. Privacy is set automatically and the source document stays private. Next saves it.',run(){completeMissingRequirement('boston-icu')},target:()=>$('add')},
 {title:'Pending verification',body:'The new license is classified and queued. It shows under Awaiting Verification in the Task Center and in the Verification Console queue.',run(){if($('add').open){$('dt').value=isoDaysFromNow(730);tourQuiet(addCredentialFromForm)}tourCloseDialogs();showV7View('tasksView')},target:()=>$('taskAwaitV85')},
 {title:'Verification Console',body:'A verifier runs a simulated primary-source check. No real board is contacted, and the provenance record says so. Next runs the check.',run(){v81ShowRole('verification');tourVerTab('verifyOverview')},target:()=>tourPanel('verifyQueuePreviewV81')},
 {title:'12/12: assignment ready',body:'The check succeeds (simulated) and readiness updates instantly: Boston is 12/12. The XRPL proof stays optional; readiness never depends on it.',run(){const c=creds.find(x=>x.kind==='RN_LICENSE'&&x.jurisdiction==='US-MA'&&x.primary==='VERIFYING');if(c)tourQuiet(()=>v81Verify(c.id));v81ShowRole('clinician');showV7View('opportunitiesView')},target:tourBostonCard},
 {title:'Share only what Boston needs',body:'Alex shares an assignment-scoped Passport with Northstar. Only Boston\'s 12 assertions are included, health and screening go as "Requirement Satisfied", documents are not shared, and access runs Through Assignment End. Next approves.',run(){openShareDialog({assignmentId:'boston-icu'})},target:()=>$('shareV7')},
 {title:'Northstar sees live access',body:'The organization sees PASSPORT ACCESS: ACTIVE, live 12/12 readiness and the expiry. Each view is checked against the grant and logged.',run(){if($('shareV7').open&&!$('shareFormV83').classList.contains('hidden'))tourQuiet(approveShare);tourCloseDialogs();v81ShowRole('organization');$('orgViewAsV83').value='northstar';orgViewAs='northstar';v81RenderRoles();tourOrgTab('orgOverview')},target:()=>tourPanel('orgAccessV83')},
 {title:'Revocation is immediate',body:'Alex revokes access, and Northstar immediately sees "Passport access revoked by clinician" with a timestamp. In the app Alex confirms first, and revoking doesn\'t erase what the organization already saved.',run(){const s=loadShares().find(x=>x.orgId==='northstar'&&x.status==='ACTIVE');if(s)revokeShare(s.id);v81RenderRoles();tourOrgTab('orgOverview')},target:()=>tourPanel('orgAccessV83')},
 {title:'Every step is in the audit log',body:'The upload, classification, simulated check, readiness change, share, view and revocation are all append-only events. Every metric in the demo is computed from them. Tour complete. Explore on your own.',run(){v81ShowRole('verification');tourVerTab('verifyAuditV81')},target:()=>tourPanel('verifyAuditBodyV81')}
];
function isoDaysFromNow(n){const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function tourCard(){
 let el=$('tourCardV86');if(el)return el;el=document.createElement('div');el.id='tourCardV86';el.className='tour-card-v86';el.setAttribute('role','dialog');el.setAttribute('aria-live','polite');el.setAttribute('aria-label','Demo tour');
 el.innerHTML=`<div class="tour-top-v86"><span class="badge PENDING">DEMO TOUR</span><span class="small" id="tourStepV86"></span><button class="tour-x-v86" id="tourExitV86" aria-label="Exit tour">✕</button></div><div class="tour-bar-v86"><i id="tourBarV86"></i></div><h3 id="tourTitleV86"></h3><p id="tourBodyV86" class="small"></p><div class="tour-acts-v86"><button class="sec mini" id="tourAutoV86">▶ Auto-play</button><button class="pri" id="tourNextV86">Next ▸</button></div>`;
 document.body.appendChild(el);
 $('tourExitV86').onclick=()=>endTour();$('tourNextV86').onclick=()=>tourNext();$('tourAutoV86').onclick=()=>tourToggleAuto();
 return el;
}
function tourClearHL(){document.querySelectorAll('.tour-hl-v86').forEach(x=>x.classList.remove('tour-hl-v86'))}
function tourShow(i){
 const st=TOUR_STEPS[i];tourState.i=i;tourClearHL();
 try{st.run()}catch(e){console.warn('tour step',i,e)}
 const card=tourCard(),host=document.querySelector('dialog[open]')||document.body;if(card.parentElement!==host)host.appendChild(card);
 $('tourStepV86').textContent=`Step ${i+1} of ${TOUR_STEPS.length}`;$('tourTitleV86').textContent=st.title;$('tourBodyV86').textContent=st.body;
 $('tourBarV86').style.width=Math.round((i+1)/TOUR_STEPS.length*100)+'%';
 const last=i===TOUR_STEPS.length-1;$('tourNextV86').textContent=last?'Finish':'Next ▸';
 const t=st.target&&st.target();if(t&&t.tagName!=='DIALOG'){t.classList.add('tour-hl-v86');t.scrollIntoView({block:t.getBoundingClientRect().height>window.innerHeight*0.55?'start':'center',behavior:'auto'})}
 tourSchedule();
}
function tourSchedule(){clearTimeout(tourState.timer);if(tourState.auto)tourState.timer=setTimeout(()=>tourNext(),TOUR_STEP_MS)}
function tourToggleAuto(){tourState.auto=!tourState.auto;$('tourAutoV86').textContent=tourState.auto?'❚❚ Pause':'▶ Auto-play';tourSchedule()}
function tourNext(){if(!tourState)return;if(tourState.i>=TOUR_STEPS.length-1){endTour(true);return}tourShow(tourState.i+1)}
function startTour(opts={}){
 if(!opts.skipConfirm&&!confirm('Start the demo tour (about 75 seconds)?\n\nThe tour resets demo data in this browser to the starting state: Alex\'s Passport, shares, access requests and published demo assignments.'))return;
 if(tourState)endTour();
 tourCloseDialogs();initNewcomer(true);render();v81RenderRoles();
 tourState={i:0,auto:!!opts.auto,timer:null};tourCard();$('tourAutoV86').textContent=tourState.auto?'❚❚ Pause':'▶ Auto-play';
 v81Log('DEMO_TOUR_STARTED',null,{actor_type:'SYSTEM',result:'STARTED'});
 tourShow(0);
}
function endTour(done){if(!tourState)return;clearTimeout(tourState.timer);if(done)v81Log('DEMO_TOUR_COMPLETED',null,{actor_type:'SYSTEM',result:'COMPLETED'});tourState=null;tourClearHL();const c=$('tourCardV86');if(c)c.remove()}
document.addEventListener('keydown',e=>{if(tourState&&e.key==='Escape'&&!document.querySelector('dialog[open]'))endTour()});
document.querySelectorAll('.startTourV86').forEach(b=>b.onclick=()=>startTour());
