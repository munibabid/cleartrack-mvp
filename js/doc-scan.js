/* v14.8 (P0 safety stops): the on-device document reader no longer fills anything in.
   - Account add form: the file is attached and checked on this device for safety signals only
     (js/capture-safety.js): it can BLOCK a save (more than one credential, LVN/LPN, wrong type,
     unsupported type) but never fills a value, picks a type or a license scope.
   - Saved credentials: no "Re-scan document" (it used to overwrite the expiration from the scan).
   - The nurse types every detail exactly as printed; the verifier checks the document.
   Kept from earlier versions: the label helpers below (also used to describe older entries that
   were scanned before v14.8) and the status of those older entries. */
let acctScan=null;/* always null since v14.8: no reader results drive the form */
const SCAN_STATUS_TEXT='Awaiting verification';
const SCANNABLE=f=>!!f&&(/^(application\/pdf|image\/(png|jpe?g|webp))$/i.test(f.type||'')||/\.(pdf|png|jpe?g|webp)$/i.test(f.name||''));
/* Confidence words only (language): High confidence / Please check / Could not read reliably. */
function scanConfChip(c,found=true){
 const w=confidenceWords(c,found),cls=!found||c==null?'none':c>=0.9?'hi':c>=0.7?'mid':'lo';
 return`<span class="conf-v14 conf-${cls}">${ec(w)}</span>`;
}
/* v14.7: which date this is depends on the credential family. Licenses get only an issue date
   (if printed), never a completion date; completion dates are for NIHSS, skills checklists and
   courses. A date the document labels otherwise (e.g. "Effective") keeps its printed label. */
function scanIsLicenseKind(kind){const k=typeof catalogKind==='function'?catalogKind(kind):null;return!!k&&(k.category==='Licenses'||/LICENSE|^LPN|^LVN/.test(k.kind))}
const SCAN_PLAIN_ISSUE=/^(?:date\s+(?:of\s+)?)?(?:issue|issued)(?:\s+date)?$/i;
function scanIssueDateLabel(res,kind){
 if(res?.profile==='dates_only')return'Date on the record (test / completion)';
 const raw=res?.fields?.issued_on?.label;
 if(scanIsLicenseKind(kind)||res?.profile==='license')return raw&&!SCAN_PLAIN_ISSUE.test(raw)?`Date printed as “${raw}” (if printed on the document)`:'Issue date (if printed on the document)';
 if(kind==='CERT_NIHSS'||/^SKILLS_/.test(kind||''))return'Completion date';
 if(/\bcourse\b/i.test(catalogKind(kind)?.label||''))return'Issue / completion date';
 return raw&&!SCAN_PLAIN_ISSUE.test(raw)&&!/complet/i.test(raw)?`Date printed as “${raw}”`:'Issue date';
}
const SCAN_LICENSE_ISSUE_NOTE='The original issue date may differ from the date on this card, which can show the latest renewal. Not required. The verifier confirms the original issue date with the state board during verification.';
/* The add form's document box (the safety check). Saved credentials get no reader box. */
function scanBoxHtml(target){return target==='add'&&typeof captureBoxHtml==='function'?captureBoxHtml('acct'):''}
function scanPaint(){if(typeof capturePaint==='function')capturePaint('acct')}
function scanPaintMismatch(){}
/* Checked before saving so a refusal doesn't re-render (and wipe) the form. */
function scanAddBlocker(){return typeof captureSaveBlocker==='function'?captureSaveBlocker('acct'):null}
/* Status shown on a saved credential (older entries may carry a v14.0–v14.7 scan record). */
function scanCredInfo(c){
 const d=c.metadata?.doc;const evs=(acct()?.cache?.events||[]).filter(e=>e.credential_id===c.id);
 const scanned=!!d?.confirmed||evs.some(e=>e.event_type==='DOCUMENT_SCANNED');
 const mismatch=d?d.mismatch:evs.some(e=>e.event_type==='DOCUMENT_MISMATCH');
 return{scanned,mismatch,doc:d};
}
