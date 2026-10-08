/* App shell: role routing, event wiring, and boot. Loaded last. */
function v81ShowRole(role){document.body.classList.toggle('role-clinician',role==='clinician');$('landing').classList.add('hidden');$('app').classList.add('hidden');$('organizationWorkspace').classList.remove('active');$('verificationWorkspace').classList.remove('active');if(role==='clinician'){$('app').classList.remove('hidden');render()}if(role==='organization'){$('organizationWorkspace').classList.add('active');v81RenderRoles()}if(role==='verification'){$('verificationWorkspace').classList.add('active');v81RenderRoles()}}
function v81RolePicker(){document.body.classList.remove('role-clinician');$('app').classList.add('hidden');$('organizationWorkspace').classList.remove('active');$('verificationWorkspace').classList.remove('active');$('landing').classList.remove('hidden');window.scrollTo(0,0)}
function v81Tabs(btnClass,panelClass,target){document.querySelectorAll('.'+panelClass).forEach(x=>x.classList.toggle('hidden',x.id!==target));document.querySelectorAll('.'+btnClass).forEach(x=>x.classList.toggle('active',x.dataset.target===target))}
function v81RenderRoles(){if(!creds.length)return;creds=creds.map(v81Normalize);const x=v81RoleContext();v81RenderOrganization(x);v81RenderVerifier(x)}
document.addEventListener('DOMContentLoaded',()=>{
$('roleClinician').onclick=()=>v81ShowRole('clinician');
$('roleOrganization').onclick=()=>v81ShowRole('organization');
$('roleVerification').onclick=()=>v81ShowRole('verification');
$('switchRoleClinician').onclick=v81RolePicker;
document.querySelectorAll('.switchRoleV81,.switchRoleAny').forEach(b=>b.onclick=v81RolePicker);
document.querySelectorAll('.orgTab').forEach(b=>b.onclick=()=>v81Tabs('orgTab','orgPanel',b.dataset.target));
document.querySelectorAll('.verifyTab').forEach(b=>b.onclick=()=>v81Tabs('verifyTab','verifyPanel',b.dataset.target));
$('logout').onclick=v81RolePicker;
$('addBtn').onclick=()=>openAddForm();
$('resetDemo').onclick=()=>{if(confirm('Reset demo data to the starting state? Demo credentials stored in this browser will be replaced.')){initNewcomer(true);render();v81RenderRoles()}};
$('save').onclick=addCredentialFromForm;
$('kindSearchV82').oninput=v81SyncAddForm;
$('jurSearchV82').oninput=v81SyncAddForm;
document.querySelectorAll('.xadd').forEach(b=>b.onclick=()=>$('add').close());
document.querySelectorAll('.xproof').forEach(b=>b.onclick=()=>$('proof').close());
document.querySelectorAll('.xonboard').forEach(b=>b.onclick=()=>$('onboard').close());
document.querySelectorAll('.xpass').forEach(b=>b.onclick=()=>$('passport').close());
document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('on'));b.classList.add('on');filter=b.dataset.f;render()});
document.querySelectorAll('.v7nav').forEach(b=>b.onclick=()=>showV7View(b.dataset.view));
$('v7Add').onclick=()=>openAddForm();
$('v7Pass').onclick=()=>showV7View('passportView');
$('v7Tasks').onclick=()=>showV7View('tasksView');
$('v7Share').onclick=openV7Share;
$('v7SharePass').onclick=openV7Share;
$('v7PassportShare2').onclick=openV7Share;
$('v7PassportQR').onclick=openPass;
document.querySelectorAll('.xsharev7').forEach(b=>b.onclick=()=>$('shareV7').close());
$('generateV7Share').onclick=async()=>{const ids=[...document.querySelectorAll('.v7sharecheck:checked')].map(x=>+x.value);if(!ids.length){alert('Select at least one credential.');return}const token=randomShareToken(),duration=$('shareV7Duration').value,payload={ids,duration,created:new Date().toISOString()};v81Log('SHARE_LINK_CREATED',null,{actor_type:'CLINICIAN',detail:{count:ids.length,duration}});const encoded=enc(payload),url=location.origin+location.pathname+'?sharev7='+token+'#'+encoded;
$('shareV7Link').textContent=url;
$('shareV7Result').classList.remove('hidden');const canvas=$('shareV7QR');if(window.QRCode)await QRCode.toCanvas(canvas,url,{width:230,margin:2})};
$('passBtn').onclick=openPass;
$('toPass').onclick=()=>{$('proof').close();openPass()};
$('onboardBtn').onclick=openOnboard;
initAddForm();v81SyncAddForm();
initNewcomer();v81RenderRoles();let params=new URLSearchParams(location.search);if(params.get('sharev7')&&location.hash){publicShareV7(location.hash.slice(1))}else if(params.get('passport'))publicView(params.get('passport'),false);else if(params.get('onboarding'))publicView(params.get('onboarding'),true);else render();
});
