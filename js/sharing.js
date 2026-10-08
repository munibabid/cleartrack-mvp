/* Passport QR and selective share links. */
function enc(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function dec(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return JSON.parse(decodeURIComponent(escape(atob(s))))}
function passPayload(){const a=creds.filter(c=>c.chain==='ACCEPTED'),ob=onboarding();if(!a.length)return null;return{issuer:a[0].issuer,subject:a[0].subject,types:a.map(c=>({t:c.type,n:c.name,e:c.expiration||'',s:c.prov?.source||'',v:c.prov?.verifiedAt||''})),onboarding:{ready:ob.ready,pct:ob.pct,required:ob.req.map(c=>({n:c.name,ok:reqSatisfied(c)}))}}}
function randomShareToken(){return [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('')}
function openV7Share(){
 const shareable=creds.filter(c=>c.primary==='VERIFIED'&&c.prov?.active&&!c.privateOnly);
 $('shareV7Options').innerHTML=shareable.map(c=>`<label class="share-option"><span><b>${ec(c.name)}</b><span class="small">${ec(catFor(c))} · ${ec(userChain(c))}</span></span><input type="checkbox" class="v7sharecheck" value="${c.id}" checked></label>`).join('');
 $('shareV7Result').classList.add('hidden');$('shareV7').showModal()
}
async function openPass(){let a=creds.filter(c=>c.chain==='ACCEPTED');$('passRows').innerHTML=a.length?a.map(c=>`<div class="passrow"><div><b>${ec(c.name)}</b><div class="small">${ec(c.prov?.source||'Verified source')} · ${c.prov?.verifiedAt?new Date(c.prov.verifiedAt).toLocaleDateString():''}</div><div class="small mono">${ec(c.type)}</div></div><span class="badge ACCEPTED">CREDENTIAL SECURED</span></div>`).join(''):'<div class="empty"><b>No accepted XRPL credentials yet.</b></div>';let valid=a.filter(c=>c.primary==='VERIFIED'&&c.prov?.active&&(!c.expiration||new Date(c.expiration)>=new Date())).length;$('score').textContent=a.length?Math.round(valid/a.length*100)+'%':'0%';const payload=passPayload(),url=payload?location.origin+location.pathname+'?passport='+enc(payload):location.origin+location.pathname;$('passUrl').textContent=url;const q=$('qr'),oq=$('onboardQR');q.getContext('2d').clearRect(0,0,q.width,q.height);oq.getContext('2d').clearRect(0,0,oq.width,oq.height);if(payload&&window.QRCode)await QRCode.toCanvas(q,url,{width:230,margin:2});const ob=onboarding();if(ob.ready&&payload){const ourl=location.origin+location.pathname+'?onboarding='+enc(payload);$('onboardUrl').textContent=ourl;$('onboardQRStatus').innerHTML='<span class="badge READY">ONBOARDING COMPLETE</span>';if(window.QRCode)await QRCode.toCanvas(oq,ourl,{width:230,margin:2})}else{$('onboardUrl').textContent='';$('onboardQRStatus').textContent=`${ob.ok}/${ob.req.length} required onboarding items satisfied`}$('passport').showModal()}
function publicShareV7(encoded){
 $('landing').classList.add('hidden');$('app').classList.add('hidden');$('public').classList.remove('hidden');
 let d;try{d=dec(encoded)}catch{$('pubStatus').textContent='Invalid NurseCredX share link';return}
 $('pubStatus').textContent='Shared Professional Passport';
 const selected=creds.filter(c=>d.ids.includes(c.id)&&c.primary==='VERIFIED'&&c.prov?.active&&!c.privateOnly);
 $('pubRows').innerHTML=selected.map(c=>`<div class="passrow"><div><b>${ec(c.name)}</b><div class="small">${ec(c.prov?.source||'Verified source')}</div></div><span class="badge ${userChainClass(c)}">${ec(userChain(c))}</span></div>`).join('');
 $('pubScore').textContent=selected.length?Math.round(selected.filter(c=>c.chain==='ACCEPTED').length/selected.length*100)+'%':'0%';
 $('pubOnboard').innerHTML=`<b>Access</b><div class="small" style="margin-top:5px">${ec(d.duration||'Selected duration')}</div>`;
}
