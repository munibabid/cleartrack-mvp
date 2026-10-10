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
 if(txt)txt.textContent=v?EXP_CONFIRM_TEXT.value:EXP_CONFIRM_TEXT.none;
 if(st)st.textContent=cb.checked?`Confirmed by you · ${fmtDT(cb.dataset.at)}`:v?'Required before saving: check the date against your document.':'Required before saving: tick this if your document has no expiration date, or enter the date.';
}
function expConfirmReset(p){const{cb}=expConfirmEls(p);expConfirmGen[p]++;if(cb){cb.checked=false;delete cb.dataset.forValue}expConfirmSync(p)}
function expConfirmTick(p){const{el,cb}=expConfirmEls(p);if(!el||!cb)return;cb.checked=true;cb.dataset.forValue=el.value||'';cb.dataset.forFile=String(expConfirmGen[p]);cb.dataset.at=new Date().toISOString();expConfirmSync(p)}
function expConfirmNeeded(p){const{f,el}=expConfirmEls(p);const row=$(f.row);return!!el&&!!row&&!row.classList.contains('hidden')}
function expConfirmBlocker(p){
 if(!expConfirmNeeded(p)||expConfirmValid(p))return null;
 const{el}=expConfirmEls(p);
 return el.value?`Confirm the expiration date: tick “${EXP_CONFIRM_TEXT.value}”.`:`Enter the expiration date, or tick “${EXP_CONFIRM_TEXT.none}”.`;
}
/* Provenance of the confirmed expiration (null when the field isn't shown). */
function expConfirmRecord(p,source){
 if(!expConfirmNeeded(p)||!expConfirmValid(p))return null;
 const{el,cb}=expConfirmEls(p),v=el.value||'';
 /* the date itself stays in the credential's own expiration field; only where it came from is recorded */
 return{source:v?(source||'TYPED'):'NONE_PRINTED',has_expiration:!!v,confirmed_by:'CLINICIAN',confirmed_at:cb.dataset.at};
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
