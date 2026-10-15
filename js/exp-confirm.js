/* v14.7: the nurse explicitly confirms the expiration date before saving.
   One canonical expiration field (scan prefill or typed, as before). Next to it:
   - a value is present: "I confirm this expiration date matches my document";
   - no value: "No expiration date on this document".
   Saving is blocked until it is ticked. Changing the date or choosing a new file
   clears the tick. What is recorded: where the date came from (document scan or
   typed, or none printed), that the nurse confirmed it, and when.
   Forms: 'add' = demo Add Credential dialog (#dt, #fl),
          'acct' = signed-in account add form (#acctExpV10, #acctFileV10). */
const EXP_CONFIRM_TEXT={value:'I confirm this expiration date matches my document',none:'No expiration date on this document'};
/* t150u: RN licenses need a current-practice-through date (license expiration, or the registration's
   through date where a state authorizes practice by time-limited registration). If it isn't printed the
   nurse says so; the license is saved with no date and stays "Awaiting primary-source verification"
   with no RN readiness credit. The generic "No expiration date on this document" is not used for them. */
const EXP_CONFIRM_RN_NONE='The current-practice-through date isn\'t printed on my document';
function expConfirmIsLicense(p){try{const k=typeof CAPTURE_FORMS!=='undefined'?CAPTURE_FORMS[p].kind():'';return k==='RN_LICENSE'||k==='RN_LICENSE_MULTISTATE'}catch(e){return false}}
function expConfirmNoneText(p){return expConfirmIsLicense(p)?EXP_CONFIRM_RN_NONE:EXP_CONFIRM_TEXT.none}
const EXP_CONFIRM_FORMS={add:{input:'dt',file:'fl',row:'dtRowV144'},acct:{input:'acctExpV10',file:'acctFileV10',row:'acctExpDateRowV10'}};
const EXP_SOURCE_TEXT={DOCUMENT_SCAN:'read from the document scan',TYPED:'typed by you',NONE_PRINTED:'no expiration printed on the document'};
const expConfirmGen={add:0,acct:0};
function expConfirmHtml(p){return`<div class="exp-confirm-v147" id="${p}ExpConfirmV147"><label class="exp-confirm-lbl-v147"><input type="checkbox" id="${p}ExpOkV147"> <span id="${p}ExpOkTextV147">${EXP_CONFIRM_TEXT.none}</span></label><div class="small" id="${p}ExpOkStateV147">Required before saving.</div></div>`}
function expConfirmEls(p){const f=EXP_CONFIRM_FORMS[p];return{f,el:$(f.input),cb:$(p+'ExpOkV147'),txt:$(p+'ExpOkTextV147'),st:$(p+'ExpOkStateV147')}}
function expConfirmValid(p){const{el,cb}=expConfirmEls(p);return!!(el&&cb&&cb.checked&&cb.dataset.forValue===(el.value||'')&&cb.dataset.forFile===String(expConfirmGen[p]))}
function expConfirmSync(p){
 const{el,cb,txt,st}=expConfirmEls(p);if(!el||!cb)return;
 if(cb.checked&&!expConfirmValid(p))cb.checked=false;
 const v=el.value||'';cb.closest('.exp-confirm-v147').dataset.mode=v?'value':'none';
 if(txt)txt.textContent=v?EXP_CONFIRM_TEXT.value:expConfirmNoneText(p);
 const lic=expConfirmIsLicense(p);
 if(st)st.textContent=cb.checked?`Confirmed by you · ${fmtDT(cb.dataset.at)}`+(lic&&!v?' · the date will show as “Awaiting primary-source verification”':''):v?'Required before saving: check the date against your document.':lic?'Required before saving: enter the date printed on your license, or tick this if it isn\'t printed. Never enter a date that isn\'t printed. Without a date the license gets no readiness credit until a verifier confirms it with the board.':'Required before saving: tick this if your document has no expiration date, or enter the date.';
 expConfirmLabel(p);
}
function expConfirmReset(p){const{cb}=expConfirmEls(p);expConfirmGen[p]++;if(cb){cb.checked=false;delete cb.dataset.forValue}expConfirmSync(p)}
function expConfirmTick(p){const{el,cb}=expConfirmEls(p);if(!el||!cb)return;cb.checked=true;cb.dataset.forValue=el.value||'';cb.dataset.forFile=String(expConfirmGen[p]);cb.dataset.at=new Date().toISOString();expConfirmSync(p)}
function expConfirmNeeded(p){const{f,el}=expConfirmEls(p);const row=$(f.row);return!!el&&!!row&&!row.classList.contains('hidden')}
function expConfirmBlocker(p){
 if(!expConfirmNeeded(p)||expConfirmValid(p))return null;
 const{el}=expConfirmEls(p);
 return el.value?`Confirm the expiration date: tick “${EXP_CONFIRM_TEXT.value}”.`:`Enter the ${expConfirmIsLicense(p)?'current-practice-through date':'expiration date'}, or tick “${expConfirmNoneText(p)}”.`;
}
/* Provenance of the confirmed expiration (null when the field isn't shown). */
function expConfirmRecord(p,source){
 if(!expConfirmNeeded(p)||!expConfirmValid(p))return null;
 const{el,cb}=expConfirmEls(p),v=el.value||'';
 /* the date itself stays in the credential's own expiration field; only where it came from is recorded */
 return{source:v?(source||'TYPED'):'NONE_PRINTED',has_expiration:!!v,confirmed_by:'CLINICIAN',confirmed_at:cb.dataset.at};
}
/* the date field's label follows the credential type */
function expConfirmLabel(p){
 const{f}=expConfirmEls(p),l=document.querySelector(`label[for=${f.input}]`);if(!l)return;
 let t=l.querySelector('.exp-lbl-v150');if(!t){const extra=l.querySelector('span[id]');t=document.createElement('span');t.className='exp-lbl-v150';[...l.childNodes].filter(n=>n!==extra).forEach(n=>n.remove());l.insertBefore(t,extra||null)}
 t.innerHTML=expConfirmIsLicense(p)?'Current-practice-through date <span class="small">(the license expiration date; where your state uses a time-limited registration, the date the registration runs through · only if printed)</span> ':'Expiration date <span class="small">(if it has one)</span> ';
}
function expConfirmText(x){if(!x)return'';return`Confirmed by the nurse · ${EXP_SOURCE_TEXT[x.source]||x.source} · ${fmtDT(x.confirmed_at)}`}
document.addEventListener('DOMContentLoaded',()=>{
 const byInput={},byFile={};Object.entries(EXP_CONFIRM_FORMS).forEach(([p,f])=>{byInput[f.input]=p;byFile[f.file]=p});
 const on=e=>{const t=e.target;if(!t?.id)return;
  if(byInput[t.id])return expConfirmSync(byInput[t.id]);
  if(byFile[t.id]&&e.type==='change')return expConfirmReset(byFile[t.id]);
  const m=/^(add|acct)ExpOkV147$/.exec(t.id);if(m&&e.type==='change'){if(t.checked)expConfirmTick(m[1]);else expConfirmSync(m[1])}};
 document.addEventListener('input',on,true);document.addEventListener('change',on,true);
});
