/* PR 14: on-device document extraction for credential cards.
   Everything runs in this browser: pdf.js reads the text inside a PDF,
   Tesseract.js (vendored, WebAssembly) reads images and scans, and jsQR
   (or the built-in BarcodeDetector) reads the eCard QR code. The document
   never goes to an outside AI service, and nothing here uploads anything.
   The libraries load only when someone scans (lazy).

   Output is a set of fields with a confidence each. The nurse confirms or
   corrects them. Extraction NEVER verifies anything: the most a scan can do
   is "Details captured, awaiting verification".

   The pure parts (parseCardText, compareToEntered, …) also run under Node
   for the unit tests in backend/tests/p14.js. */
(function(root){
'use strict';
const FIELDS=['holder_name','credential_id','course','issued_on','renew_by','expires_on','training_center','jurisdiction','multistate'];
/* v14.2: read but informational only (never used for verification, never logged as a field). */
const INFO_FIELDS=['training_center_id'];
/* v14.4: the NIHSS test group (Group A–F) is read as printed, with its own confidence. Like the
   Training Center ID it stays out of the logged field lists (the server allow-list is frozen). */
const NIHSS_INFO_FIELDS=['test_group','nihss_module'];
const FIELD_LABEL={holder_name:'Name on the document',credential_id:'Certificate / card ID',course:'Credential on the document',issued_on:'Issue / completion date',renew_by:'Recommended renewal (month/year)',expires_on:'Expiration date',training_center:'Training center',jurisdiction:'State',multistate:'Multistate (compact)',training_center_id:'Training Center ID',test_group:'NIHSS test group',nihss_module:'NIHSS module',suggested_renewal:'Suggested renewal (calculated, not printed)'};
const ECARD_NOT_FOUND="eCard code not found. Type it from your card; it's needed for AHA verification.";
const TC_ID_NOTE='Who ran the class. Not used for verification.';
const REQUIRED_FIELDS=['holder_name','credential_id','course','issued_on','renew_by'];
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const MON_RE='(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const COURSE_KIND={BLS:'CERT_BLS',ACLS:'CERT_ACLS',PALS:'CERT_PALS'};
const KIND_COURSE={CERT_BLS:'BLS',CERT_ACLS:'ACLS',CERT_PALS:'PALS'};
const pad=n=>String(n).padStart(2,'0');
const clamp=(x,a=0,b=0.995)=>Math.max(a,Math.min(b,x));
function iso(y,m,d){return`${y}-${pad(m)}-${pad(d)}`}
function lastDay(y,m){return new Date(Date.UTC(y,m,0)).getUTCDate()}
function monthIndex(s){const t=String(s).toLowerCase().slice(0,3);return MONTHS.findIndex(m=>m.startsWith(t))+1}
function validDate(y,m,d){return m>=1&&m<=12&&d>=1&&d<=lastDay(y,m)&&y>=1990&&y<=2100}
function monthName(m){const n=MONTHS[m-1]||'';return n.charAt(0).toUpperCase()+n.slice(1)}
/* "06/2028" → valid through the end of June 2028 (AHA: cards are valid for
   two years through the end of the month they were issued). */
function renewToExpiry(renew){const m=/^(\d{4})-(\d{2})$/.exec(renew||'');if(!m)return null;const y=+m[1],mo=+m[2];return iso(y,mo,lastDay(y,mo))}
function interpretRenewal(renew){
 const exp=renewToExpiry(renew);if(!exp)return'';
 const [y,m]=renew.split('-').map(Number);
 return`The card shows a recommended renewal date of ${pad(m)}/${y} (month and year only). AHA cards are valid for two years through the end of the month, so Veridun reads it as valid through ${monthName(m)} ${lastDay(y,m)}, ${y}.`;
}
function addMonths(isoDate,n){const [y,m]=isoDate.split('-').map(Number);const t=y*12+(m-1)+n;return`${Math.floor(t/12)}-${pad(t%12+1)}`}

/* OCR often swaps letters and digits inside a numeric code. */
function fixDigits(s){return String(s).replace(/[Oo]/g,'0').replace(/[Il|!]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/Z/g,'2').replace(/G/g,'6').replace(/[Tt]/g,'7')}
function normCode(raw){
 const s=String(raw||'').toUpperCase().replace(/[\s\-–—._]/g,'');
 if(!s)return null;
 const digits=(s.match(/\d/g)||[]).length;
 const fx=fixDigits(s);if(/^\d{12}$/.test(fx))return{code:fx,type:'AHA'};
 if(digits>=9&&s.length-digits<=3){const f=fx.replace(/\D/g,'');if(f.length===12)return{code:f,type:'AHA'};if(f.length>=10&&f.length<=14)return{code:f,type:'AHA',odd:true}}
 if(/^[A-Z0-9]{6,30}$/.test(s)&&/[A-Z]/.test(s)&&/\d/.test(s))return{code:s,type:'ALNUM'};
 return null;
}
function codeFromQr(payload){
 if(!payload)return null;const p=String(payload);
 let m=/[?&#](?:ecardcode|ecard|code|cardcode|certificateid|certid|id)=([A-Za-z0-9\-]{6,24})/i.exec(p);
 if(m){const n=normCode(m[1]);if(n)return n}
 m=/(?:^|\D)(\d{12})(?:\D|$)/.exec(p);if(m)return{code:m[1],type:'AHA'};
 m=/\/([A-Za-z0-9]{8,20})\/?(?:$|\?)/.exec(p);if(m&&/\d/.test(m[1])){const n=normCode(m[1]);if(n)return n}
 return null;
}

/* ---- text → lines ---- */
function toLines(text){return String(text||'').split(/\r?\n/).map(l=>l.replace(/[\u00a0\t]+/g,' ').replace(/ {2,}/g,'  ').trim()).filter(Boolean)}
/* Dates OCR damaged: "01/20:2026", "04012027", "12731/2026" (slashes read as 1 or 7). Used only next to a date label. */
function garbledDate(s){
 const t=String(s||'');let m=/(?<!\d)(\d{2})[^\d\s]?(\d{2})[^\d\s]?((?:19|20)\d{2})(?!\d)/.exec(t);
 if(m&&validDate(+m[3],+m[1],+m[2]))return{iso:iso(+m[3],+m[1],+m[2]),raw:m[0]};
 m=/(?<!\d)(\d{2})[17](\d{2})[17]((?:19|20)\d{2})(?!\d)/.exec(t);
 if(m&&validDate(+m[3],+m[1],+m[2]))return{iso:iso(+m[3],+m[1],+m[2]),raw:m[0]};
 return null;
}

/* Dates with where they sit, so labels can be matched to values. */
function findDates(lines){
 const full=[],my=[];
 lines.forEach((line,li)=>{
  let rest=line;
  const reNum=/(?<!\d)(0?[1-9]|1[0-2])\s*[\/\-.]\s*(0?[1-9]|[12]\d|3[01])\s*[\/\-.]\s*((?:19|20)\d{2})(?!\d)/g;let m;
  while((m=reNum.exec(line))){const y=+m[3],mo=+m[1],d=+m[2];if(validDate(y,mo,d))full.push({li,pos:m.index,iso:iso(y,mo,d),raw:m[0],numeric:true,dayFirstPossible:d<=12&&d!==mo,monthFirstProven:d>12});rest=rest.replace(m[0],' '.repeat(m[0].length))}
  const reTxt=new RegExp(MON_RE+'\\.?\\s+(\\d{1,2}),?\\s+((?:19|20)\\d{2})','ig');
  while((m=reTxt.exec(line))){const y=+m[3],mo=monthIndex(m[1]),d=+m[2];if(validDate(y,mo,d))full.push({li,pos:m.index,iso:iso(y,mo,d),raw:m[0]});rest=rest.replace(m[0],' '.repeat(m[0].length))}
  const reTxt2=new RegExp('(\\d{1,2})\\s+'+MON_RE+'\\.?,?\\s+((?:19|20)\\d{2})','ig');
  while((m=reTxt2.exec(rest))){const y=+m[3],mo=monthIndex(m[2]),d=+m[1];if(validDate(y,mo,d))full.push({li,pos:m.index,iso:iso(y,mo,d),raw:m[0]});rest=rest.replace(m[0],' '.repeat(m[0].length))}
  const reMy=/(?<![\d\/])(0?[1-9]|1[0-2])\s*[\/\-.]\s*(20\d{2})(?!\d)/g;
  while((m=reMy.exec(rest))){my.push({li,pos:m.index,ym:`${m[2]}-${pad(+m[1])}`,raw:m[0]})}
  const reMy2=new RegExp(MON_RE+'\\.?,?\\s+(20\\d{2})','ig');
  while((m=reMy2.exec(rest))){my.push({li,pos:m.index,ym:`${m[2]}-${pad(monthIndex(m[1]))}`,raw:m[0]})}
 });
 return{full,my};
}
function labelNear(lines,li,re){
 /* same line, or the line just above/below (value-above-label layouts) */
 return re.test(lines[li]||'')?0:re.test(lines[li+1]||'')?1:re.test(lines[li-1]||'')?-1:null;
}

const NAME_STOP=/\b(provider|american|heart|association|red\s*cross|issue|issued|date|renew|renewal|recommended|training|center|centre|instructor|ecard|e-card|code|course|card|completion|certificate|certification|basic|life|support|advanced|cardiovascular|pediatric|successfully|completed|curriculum|program|valid|expires?|cpr|aed|bls|acls|pals|heartcode|location|holder|student|name|has|the|of|and|in|for|this|with|accordance|evaluations?|cognitive|skills?|license|licence|number|board|department|commonwealth|expiration)\b/i;
function cleanName(s){
 let t=String(s||'').replace(/,?\s+\b(RN|R\.N\.|BSN|MSN|LPN|LVN|APRN|NP|CNM|CRNA|DNP|PhD|CCRN|CEN|MBA|MPH)\b[\s,A-Z\-]*$/,'').replace(/[^A-Za-z\u00C0-\u024F'’.\- ]+/g,' ').replace(/\s+/g,' ').trim();
 t=t.replace(/^(mr|mrs|ms|dr)\.?\s+/i,'');
 const words=t.split(' ').filter(w=>w.replace(/[^A-Za-z\u00C0-\u024F]/g,'').length>0);
 if(words.length<2||words.length>5)return null;
 if(words.some(w=>NAME_STOP.test(w)))return null;
 if(/\b(registered|practical|vocational)\s+(professional\s+)?nurse\b/i.test(t))return null;
 if(words.filter(w=>w.replace(/[.'’\-]/g,'').length>=2).length<2)return null;
 return words.map(w=>w===w.toUpperCase()||w===w.toLowerCase()?w.charAt(0).toUpperCase()+w.slice(1).toLowerCase():w).join(' ');
}

/* ---------- per-kind document profiles (data-driven) ----------
   aha_resus  BLS / ACLS / PALS cards (AHA eCard, RQI, Red Cross)
   license    RN licenses: number, state, multistate, dates
   cert       every other certification / course (NIHSS, NRP, TNCC, ENPC,
              AWHONN, CCRN, CEN, C-EFM, …): name, ID, which credential, dates
   record     employment, competency, education: name and dates
   dates_only private kinds (health, screening, references, other) and skills
              checklists: dates only, nothing else is read or kept */
const ID_LABELS={aha_resus:'eCard code',license:'License number',cert:'Certificate / card ID',record:'Reference ID',dates_only:''};
const COURSE_PATTERNS={
 CERT_BLS:'\\bBLS\\b|basic\\s+life\\s+support',CERT_ACLS:'\\bACLS\\b|advanced\\s+cardiovascular\\s+life\\s+support|\\bALS\\b',CERT_PALS:'\\bPALS\\b|pediatric\\s+advanced\\s+life\\s+support',
 CERT_NIHSS:'\\bNIHSS\\b|NIH\\s*stroke\\s*scale',CERT_NRP:'\\bNRP\\b|neonatal\\s+resuscitation',CERT_TNCC:'\\bTNCC\\b|trauma\\s+nursing\\s+core\\s+course',CERT_ENPC:'\\bENPC\\b|emergency\\s+nursing\\s+pediatric\\s+course',
 CERT_FETAL_MONITORING:'fetal\\s+heart\\s+monitoring|\\bFHM\\b',CERT_C_EFM:'\\bC-?EFM\\b|electronic\\s+fetal\\s+monitoring',CERT_CCRN:'\\bCCRN\\b|critical\\s+care\\s+registered\\s+nurse',CERT_PCCN:'\\bPCCN\\b|progressive\\s+care\\s+certified',
 CERT_CEN:'\\bCEN\\b|certified\\s+emergency\\s+nurse',CERT_CPEN:'\\bCPEN\\b|certified\\s+pediatric\\s+emergency',CERT_TCRN:'\\bTCRN\\b|trauma\\s+certified\\s+registered',CERT_CFRN:'\\bCFRN\\b|certified\\s+flight\\s+registered',CERT_CTRN:'\\bCTRN\\b|certified\\s+transport\\s+registered',
 CERT_ABLS:'\\bABLS\\b|advanced\\s+burn\\s+life\\s+support',CERT_ATCN:'\\bATCN\\b|advanced\\s+trauma\\s+care\\s+for\\s+nurses',CERT_STABLE:'S\\.?T\\.?A\\.?B\\.?L\\.?E\\.?',CERT_CHEMO:'chemotherapy\\s*(\\/|and)?\\s*immunotherapy|chemo\\s*\\/?\\s*immuno'
};
/* catalog/registry are top-level consts of other classic scripts (not window props) */
function _globals(){return{catalog:typeof CREDENTIAL_CATALOG!=='undefined'?CREDENTIAL_CATALOG:(root.CREDENTIAL_CATALOG||[]),sources:typeof VERIFICATION_SOURCES!=='undefined'?VERIFICATION_SOURCES:(root.VERIFICATION_SOURCES||[]),jurisdictions:typeof US_JURISDICTIONS!=='undefined'?US_JURISDICTIONS:(root.US_JURISDICTIONS||[])}}
function profileFor(kind,catalog){
 const k=(catalog||_globals().catalog).find(x=>x.kind===kind)||{kind,category:'',privacy:'SHAREABLE'};
 if(['CERT_BLS','CERT_ACLS','CERT_PALS'].includes(kind))return'aha_resus';
 if(kind==='RN_LICENSE'||kind==='RN_LICENSE_MULTISTATE')return'license';
 if(k.privacy==='PRIVATE'||/^SKILLS_/.test(kind))return'dates_only';
 if(k.category==='Certifications'||kind==='QUAL_SPECIALTY_CERT')return'cert';
 return'record';
}
const PROFILE_FIELDS={aha_resus:['holder_name','credential_id','course','issued_on','renew_by','training_center'],license:['holder_name','credential_id','course','jurisdiction','multistate','issued_on','expires_on'],cert:['holder_name','credential_id','course','issued_on','expires_on'],record:['holder_name','issued_on','expires_on'],dates_only:['issued_on','expires_on']};
const PROFILE_REQUIRED={aha_resus:['holder_name','credential_id','course','issued_on','renew_by'],license:['holder_name','credential_id','jurisdiction','expires_on'],cert:['holder_name','course','expires_on'],record:['holder_name','issued_on'],dates_only:['issued_on']};
function _phraseRe(p){return[...p].map(ch=>/[-.]/.test(ch)?'[-. ]?':/\s/.test(ch)?'\\s+':/[*+?^${}()|[\]\\\/]/.test(ch)?'\\'+ch:ch).join('').replace(/(\\s\+)+/g,'\\s+')}
const _patCache={};
function kindPattern(k){
 if(!k)return null;if(_patCache[k.kind]!==undefined)return _patCache[k.kind];
 if(COURSE_PATTERNS[k.kind])return _patCache[k.kind]=new RegExp(COURSE_PATTERNS[k.kind],'i');
 const alts=new Set(),add=x=>{x=String(x||'').trim();if(x.length>=2&&x.length<=40&&!/^(certification|certificate|certified|program|course)$/i.test(x))alts.add(x)};
 String(k.short||'').split(/\s+\/\s+|\s+or\s+/).forEach(x=>add(x.replace(/\s*\(.*\)\s*$/,'')));
 const lab=String(k.label||''),head=lab.split(' — ')[0];if(head!==lab)head.split(/\s+\/\s+/).forEach(add);
 const par=/\(([^)]+)\)/.exec(lab);if(par&&/^[A-Z0-9][A-Z0-9 ,\-]*( or [A-Z0-9\-]+)?$/.test(par[1]))par[1].split(/\s*,\s*|\s+or\s+/).forEach(add);
 if(!alts.size)return _patCache[k.kind]=null;
 /* acronyms match case-sensitively (so "ONC" or "CEN" don't match ordinary words); phrases ignore case */
 const ac=[...alts].filter(x=>!/[a-z]/.test(x)),ph=[...alts].filter(x=>/[a-z]/.test(x));
 const mk=(list,fl)=>list.length?new RegExp('(?<![A-Za-z0-9])('+list.map(_phraseRe).join('|')+')(?![A-Za-z0-9])',fl):null;
 const r1=mk(ac,''),r2=mk(ph,'i');
 const re={source:[r1&&r1.source,r2&&r2.source].filter(Boolean).join(' || '),exec(t){const a=r1&&r1.exec(t),b=r2&&r2.exec(t);return a&&b?(a.index<=b.index?a:b):(a||b)},test(t){return!!this.exec(t)},toString(){return this.source}};
 return _patCache[k.kind]=re;
}
/* Which catalog certifications a text mentions. */
function detectKinds(flat,catalog){
 return(catalog||_globals().catalog).filter(k=>k.category==='Certifications').map(k=>{const re=kindPattern(k);const m=re&&re.exec(flat);return m?{kind:k.kind,short:k.short||k.kind,i:m.index}:null}).filter(Boolean).sort((a,b)=>a.i-b.i);
}
/* Which registry source the document names, among those that cover the kind. */
function detectSource(flat,kind,sources){
 const list=(sources||_globals().sources).filter(s=>s.kinds&&s.kinds.includes(kind)&&s.status==='APPROVED'&&s.docIssuer);
 for(const s of list){try{if(new RegExp(s.docIssuer,'i').test(flat))return{id:s.id,name:s.name,how:'named on the document'}}catch{}}
 return null;
}
const RE_ISSUE=/issue|issued|completion|completed|date\s+of\s+(course|exam|test|completion|certification)|test\s*date|exam\s*date|administered|date\s+given|collected|certified\s+(since|on)|initial|original|awarded|conferred|earned|effective|course\s+date|class\s+date|read\s+on|date\s+read|signed/i;
const RE_EXP=/renew|expir|certified\s+(through|thru|until)|ex[pb]\w{0,2}r\w{0,2}ation|valid\s*(until|through|thru|to)|exp\.?\s*date|\bdue\b|recertif|good\s+through|valid\s+for|next\s*(test|due)/i;
function pickDates(lines,{monthYearOk=true}={}){
 const {full,my}=findDates(lines);
 let issue=full.find(d=>labelNear(lines,d.li,RE_ISSUE)===0&&!RE_EXP.test(lines[d.li]))||full.find(d=>labelNear(lines,d.li,RE_ISSUE)!=null&&!RE_EXP.test(lines[d.li]));
 let exp=full.find(d=>d!==issue&&labelNear(lines,d.li,RE_EXP)===0)||full.find(d=>d!==issue&&labelNear(lines,d.li,RE_EXP)!=null&&!RE_ISSUE.test(lines[d.li]));
 let renewMy=monthYearOk?(my.find(d=>labelNear(lines,d.li,RE_EXP)!=null)||(my.length===1?my[0]:null)):null;
 const used=new Set(full.map(d=>d.li));
 for(let li=0;li<lines.length;li++){if(used.has(li))continue;const isE=RE_EXP.test(lines[li]),isI=!isE&&RE_ISSUE.test(lines[li]);if(!isE&&!isI)continue;
  const g=garbledDate(lines[li]);if(!g)continue;const d={li,pos:0,iso:g.iso,raw:g.raw,garbled:true};full.push(d);
  if(isE&&!exp)exp=d;if(isI&&!issue)issue=d}
 if(!issue&&exp&&renewMy&&exp.iso.slice(0,7)<renewMy.ym){issue=exp;exp=null}
 const sorted=full.slice().sort((a,b)=>a.iso.localeCompare(b.iso));
 /* v14.4: a second copy of the expiration date (wallet card + certificate) is not an issue date */
 const expOnly=d=>RE_EXP.test(lines[d.li]||'')&&!RE_ISSUE.test(lines[d.li]||'');
 if(!issue&&sorted.length&&(renewMy||exp||sorted.length===1))issue=sorted.find(d=>d!==exp&&!(exp&&d.iso===exp.iso&&expOnly(d)))||null;
 if(!issue&&new Set(sorted.map(d=>d.iso)).size>=2){issue=sorted[0];if(!exp)exp=sorted[sorted.length-1]}
 if(!exp&&!renewMy&&sorted.length>=2&&issue){const later=sorted.filter(d=>d.iso>issue.iso);if(later.length===1)exp=later[0]}
 return{issue,exp,renewMy};
}
function findId(lines,flat,reLbl,{allowBare12=false,aha=false}={}){
 for(let i=0;i<lines.length;i++){
  const m=reLbl.exec(lines[i]);if(!m)continue;
  const after=lines[i].slice(m.index+m[0].length).replace(/^[\s:#.\-]+/,'');
  for(const c of [after,lines[i+1]||'',lines[i-1]||'']){
   const tok=(/([A-Za-z]{0,4}[\s\-]?[0-9][A-Za-z0-9\-]{2,24})/.exec(c)||[])[1];if(!tok)continue;
   const raw=tok.replace(/\s+/g,'').toUpperCase();
   if(!aha&&/^[A-Z]{0,4}-?\d{4,14}[A-Z0-9-]*$/.test(raw))return{code:raw,type:/^\d+$/.test(raw)?'NUM':'ALNUM',how:'label',raw:tok,li:c===after?i:c===lines[i+1]?i+1:i-1};
   const n=normCode(tok);if(n)return{...n,how:'label',raw:tok,li:i};
  }
 }
 if(allowBare12){const m=/(?<![\dA-Za-z])(\d{12})(?![\dA-Za-z])/.exec(flat.replace(/(\d{4}) (\d{4}) (\d{4})/g,'$1$2$3'));if(m)return{code:m[1],type:'AHA',how:'pattern'}}
 return null;
}
/* v14.4: certificate numbers on certifications (NIHSS and others). Every value near a
   "Certificate Number / Certificate # / Certificate ID / Test ID" label is a candidate:
   the rest of the label's line, or the cell in the same column on the line above or below
   (value-above-label certificates print "IPA24…  Mar 7, 2024" over "Certificate Number
   Date Completed"). Footer form codes ("KJ-0919 PART1 9/19 © 2019 …") lose; letters + a
   2-digit year (AHA/ASA "IPA24…") is a format hint only. The case is kept as printed. */
/* v14.4: who issued an NIHSS certificate, from the issuer PRINTED on it (never from a logo):
   AHA/ASA, Apex Innovations (incl. NIHSS+), or NIH Stroke Scale International. None or more
   than one → undetermined, and the verifier is asked to identify it. Registry ids. */
const NIHSS_ISSUERS=[
 {id:'aha-asa-nihss',name:'American Heart Association / American Stroke Association',re:/american\s+heart\s+association|american\s+stroke\s+association|learn\.heart\.org|professional\s+education\s+hub|\bheart\.org\b/i},
 {id:'apex-nihss',name:'Apex Innovations',re:/apex\s*innovations|apexinnovations\.com/i},
 {id:'nihss-plus',name:'NIHSS+ (Apex Innovations)',re:/NIHSS\s*\+|nihss\.plus/i,family:'apex-nihss'},
 {id:'nihss-international',name:'NIH Stroke Scale International',re:/NIH\s*Stroke\s*Scale\s*International|nihstrokescale\.org/i}];
const NIHSS_UNDETERMINED='The certificate does not name its issuer clearly, so the verifier is undetermined. Identify the issuer printed on the certificate (AHA/ASA, Apex Innovations, or NIH Stroke Scale International) before verifying. A logo alone is not enough.';
function addMonthsIso(iso,n){const [y,m,d]=String(iso).split('-').map(Number);const t=new Date(Date.UTC(y,m-1+n,1));const last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();t.setUTCDate(Math.min(d,last));return t.toISOString().slice(0,10)}
function nihssIssuer(flat){
 const hits=NIHSS_ISSUERS.map(x=>({x,m:x.re.exec(flat)})).filter(h=>h.m);
 if(!hits.length)return{id:null,note:NIHSS_UNDETERMINED};
 const fams=new Set(hits.map(h=>h.x.family||h.x.id));
 if(fams.size>1)return{id:null,note:'The certificate names more than one possible issuer ('+hits.map(h=>h.x.name).join(', ')+'), so the verifier is undetermined. Check which one issued it before verifying.',ambiguous:true};
 const h=hits.find(h=>h.x.family)||hits[0];return{id:h.x.id,name:h.x.name,raw:h.m[0]};
}
const CERT_FORMAT_HINT=/^[A-Z]{2,4}\d{2}[A-Za-z0-9]{6,}$/;
const FOOTER_LINE=/©|\(c\)\s*\d{4}|copyright|\bpart\s*\d|\brev\.?\s*\d|\bform\s+[A-Z0-9-]+|all\s+rights\s+reserved/i;
function certId(lines,reLbl){
 const segs=l=>{const out=[];const re=/\S+(?:\s{1,2}\S+)*/g;let m;while((m=re.exec(String(l||''))))out.push({t:m[0],i:m.index});return out};
 const tokOf=t=>{const m=/(?:^|[\s:#])([A-Za-z]{0,5}[\-]?[0-9][A-Za-z0-9\-]{3,30})(?=$|[\s,;.])/.exec(' '+t);return m?m[1]:null};
 const cands=[];
 for(let i=0;i<lines.length;i++){
  const m=reLbl.exec(lines[i]);if(!m)continue;
  const ls=segs(lines[i]),k=Math.max(0,ls.findIndex(x=>x.i<=m.index&&m.index<x.i+x.t.length+1));
  const after=lines[i].slice(m.index+m[0].length).replace(/^[\s:#.\-]+/,'').split(/\s{3,}/)[0];
  const push=(t,li,pos,line)=>{const tok=t&&tokOf(t);if(!tok)return;const alnum=tok.replace(/[^A-Za-z0-9]/g,'');if(alnum.length<5||/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(tok))return;
   let sc=pos;if(CERT_FORMAT_HINT.test(tok))sc+=2;if(alnum.length>=8)sc+=1;if(alnum.length<7)sc-=1;if(FOOTER_LINE.test(line||''))sc-=4;if(/^[A-Z]{1,3}-\d{3,4}$/.test(tok))sc-=2;
   cands.push({tok,li,sc,pos})};
  push(after,i,3,lines[i]);
  for(const [d,pos] of [[-1,2],[1,2]]){const L=lines[i+d];if(L==null)continue;const ss=segs(L);
   const cell=ss.length===ls.length?ss[k]:ss.length===1?ss[0]:ss.reduce((b,x)=>!b||Math.abs(x.i-ls[k].i)<Math.abs(b.i-ls[k].i)?x:b,null);
   if(cell)push(cell.t,i+d,pos+(ss.length===ls.length&&ls.length>1?1:0),L)}
 }
 if(!cands.length)return null;
 cands.sort((a,b)=>b.sc-a.sc);const c=cands[0];
 const mixed=/[a-z]/.test(c.tok)&&/[A-Z]/.test(c.tok);const code=mixed?c.tok:c.tok.toUpperCase();
 return{code,type:/^\d+$/.test(code)?'NUM':'ALNUM',how:'label',raw:c.tok,li:c.li,weak:c.sc<3};
}
/* v14.4: some certificates (e.g. AACN CCRN) print the number with no "Number" label, on the same line
   as the issuer's verification address ("aacn.org/verify        ##########"). The verification address is
   the printed anchor; the number must sit beside it (same line, or the line right under it). Any other
   unlabelled number is never used. Confidence stays below "high" so the user checks it. */
const VERIFY_ANCHOR=/\b[a-z0-9.-]+\.(?:org|com|net|gov)\/verif\w*\b|\bverify\s+(?:at|online)\b/i;
function verifyLineId(lines){
 for(let i=0;i<lines.length;i++){const m=VERIFY_ANCHOR.exec(lines[i]);if(!m)continue;
  for(const [L,li] of [[lines[i].slice(m.index+m[0].length),i],[lines[i+1]||'',i+1]]){
   if(li!==i&&!/^\s*\S+\s*$/.test(L))continue;
   const t=/(?:^|\s)([A-Z]{0,3}\d{6,12})(?=\s|$)/.exec(L);if(t&&!FOOTER_LINE.test(lines[li]))return{code:t[1],type:/^\d+$/.test(t[1])?'NUM':'ALNUM',how:'beside the verification address',raw:t[1],li,anchor:true}}
 }
 return null;
}
function findName(lines,flat,{profileName=''}={}){
 let name=null,how='';
 for(let i=0;i<lines.length&&!name;i++){
  const m=/^(?:name|full\s+name|licensee(?:\s+name)?|student(?:\s+name)?|participant(?:\s+name)?|learner(?:\s+name)?|nurse(?:\s+name)?|card\s*holder|holder|issued\s+to|awarded\s+to|presented\s+to|granted\s+to|this\s+(?:certifies|is\s+to\s+certify)\s+that)\s*[:\-]?\s*(.*)$/i.exec(lines[i]);
  if(m){name=cleanName(m[1])||cleanName(lines[i+1]);if(name)how='label'}
 }
 const reDone=/(has\s+)?su\w*ess\w*ly\s+(com|met|pass)\w*|has\s+(completed|met|earned|passed|demonstrated|been\s+(granted|awarded|certified))|is\s+(hereby\s+)?(certified|recognized|licensed)|has\s+su\w+\s+c\w+|having\s+(met|completed)/i;
 for(let i=0;i<lines.length&&!name;i++){
  const m=reDone.exec(lines[i]);if(!m)continue;
  const pre=lines[i].slice(0,m.index).trim();
  name=(pre&&cleanName(pre))||cleanName(lines[i-1])||cleanName(lines[i-2]);if(name)how='before the completion statement';
 }
 /* v14.4: state boards print the name AFTER the grant ("…issues the license of Registered Nurse:" / "is hereby licensed as") */
 const reGrant=/(issues?|grants?|awards?)\s+(the\s+|this\s+)?(?:[A-Z][A-Z-]{1,8}\s+)?(licen[cs]e|registration|certificate|certification)\b[^\n]*?(:|\bto)\s*(.*)$|(is\s+hereby\s+)?licensed\s+(to\s+practice\s+)?as\s+an?\s+[^\n]*?:\s*(.*)$/i;
 for(let i=0;i<lines.length&&!name;i++){
  const m=reGrant.exec(lines[i]);if(!m)continue;
  const rest=(m[5]!=null?m[5]:m[8])||'';
  for(const c of [rest,lines[i+1]]){const n=c&&cleanName(c);if(n){name=n;how='after the grant';break}}
 }
 /* v14.4: a licensee block (name, street address, "City, ST 12345") on license wallet cards */
 const reStreet=/^\s*\d{1,6}[A-Za-z]?\s+[A-Za-z0-9.' ]{2,40}\b(st|street|ave|avenue|blvd|rd|road|dr|drive|way|ln|lane|ct|court|pl|place|cir|circle|ter|terrace|pkwy|hwy|sq|loop|trail|trl|row)\b\.?/i,reCity=/[A-Za-z .'-]{2,30},?\s+[A-Z]{2}\s+\d{5}(-\d{4})?\b/;
 for(let i=0;i<lines.length&&!name;i++){
  if(!reStreet.test(lines[i]))continue;
  if(!(reCity.test(lines[i+1]||'')||reCity.test(lines[i+2]||'')||reCity.test(lines[i])))continue;
  const n=cleanName(lines[i-1]);if(n){name=n;how='licensee address block'}
 }
 if(!name&&profileName){const re=new RegExp(profileName.trim().split(/\s+/).map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[\\s\\S]{0,4}'),'i');const m=re.exec(flat);if(m){name=cleanName(m[0]);how='matches your profile name'}}
 return name?{name,how}:null;
}
function findJurisdiction(flat,jurisdictions){
 /* v14.4: the issuing state comes from board / government wording ("Commonwealth of
    Massachusetts", "Massachusetts Board of Registration in Nursing", "State of Texas",
    "Massachusetts General Laws"). A bare state name is only a weak hint, and never one
    inside a street address ("250 Washington St."), a city ("Washington, DC") or a
    mailing address; 2-letter codes alone are never used (they appear in addresses). */
 const js=jurisdictions||_globals().jurisdictions;let best=null;
 const BOARD='(state\\s+)?board\\s+of\\s+(registered\\s+)?(nursing|nurse|registration)';
 for(const j of js){
  const nm=String(j.name||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');if(!nm)continue;
  const strong=new RegExp('(state\\s+of\\s+'+nm+'\\b|commonwealth\\s+of\\s+'+nm+'\\b|\\b'+nm+'\\s+'+BOARD+'|\\b'+nm+'\\s+board\\b|board\\s+of\\s+(registered\\s+)?nursing[^\\n]{0,12}\\b'+nm+'\\b|\\b'+nm+'\\s+(general\\s+laws|department\\s+of\\s+(public\\s+)?health|division\\s+of\\s+professional|nursing\\s+board|licens\\w+\\s+board))','i');
  const m=strong.exec(flat);if(m&&(!best||best.weak||m.index<best.i))best={code:j.code,name:j.name,i:m.index,weak:false,raw:m[0]};
 }
 if(!best){
  const ADDR=/^\s*(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|way|ln|lane|ct|court|pl|place|sq|square|pkwy|parkway|hwy|highway|cir|circle|ter|terrace|county|co\.|university|hospital|medical|memorial|heights|park|plaza|ave\.)\b\.?/i;
  const weak=[];
  for(const j of js){
   const nm=String(j.name||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');if(!nm)continue;
   const re=new RegExp('\\b'+nm+'\\b','ig');let m;
   while((m=re.exec(flat))){
    const before=flat.slice(Math.max(0,m.index-12),m.index),after=flat.slice(m.index+m[0].length,m.index+m[0].length+14);
    if(/\d[\w\-]*\s+$/.test(before))continue;
    if(/west\s+$/i.test(before))continue;/* Virginia inside West Virginia *//* "250 Washington St." */
    if(ADDR.test(after))continue;
    if(/^,?\s*(D\.?\s?C\.?)\b/.test(after))continue;/* Washington, DC */
    if(/^\s+(state\s+)?(university|college)/i.test(after))continue;
    /* a city/state pair "…, Maine 04101" in a mailing address */
    if(/^\s*\d{5}(-\d{4})?\b/.test(after)&&/,\s*$/.test(before))continue;
    weak.push({code:j.code,name:j.name,i:m.index,weak:true,raw:m[0]});
   }
  }
  if(weak.length){/* the state named most often, then the earliest */
   const cnt={};weak.forEach(w=>cnt[w.code]=(cnt[w.code]||0)+1);weak.sort((a,b)=>cnt[b.code]-cnt[a.code]||a.i-b.i);best=weak[0];best.count=cnt[best.code];
  }
 }
 if(!best||best.weak){/* letter-spaced headings ("T E X A S  B O A R D") lose their spaces in PDF text */
  const ns=flat.replace(/\s+/g,'').toUpperCase();
  for(const j of js){const n=String(j.name||'').replace(/\s+/g,'').toUpperCase();if(!n)continue;const i=Math.min(...[ns.indexOf('STATEOF'+n),ns.indexOf('COMMONWEALTHOF'+n),ns.indexOf(n+'BOARD'),ns.indexOf(n+'STATEBOARD')].map(x=>x<0?1e9:x));if(i<1e9&&(!best||best.weak||i<best.i))best={code:j.code,name:j.name,i,weak:false,raw:j.name}}
 }
 return best;
}

/* ---- v14.2: AHA card labels → values (table rows, header rows, label: value) ----
   AHA eCards print "Training Center Name / Training Center ID / TC City, State /
   TC Phone / Training Site Name / Instructor Name / Instructor ID / eCard Code".
   Each label's value is read from the same cell ("eCard Code: 2611…"), the next
   cell on the same row (a table), or the cell under it on the next line (a header
   row with the values beneath). The eCard code is taken ONLY from the eCard-code
   label (or the QR code, or a bare 12-digit AHA code), never from the Training
   Center ID or Instructor ID. */
const AHA_LABELS=[
 ['tc_id',/\b(?:tr\w{1,4}ing\s*(?:c\w{2,4}r|centre)|TC)\s*(?:ID|I\.D\.?|No\.?|Number|#)(?![A-Za-z])\s*#?/ig],
 ['instructor_id',/\binstructor\s*(?:ID|I\.D\.?|No\.?|Number|#)(?![A-Za-z])\s*#?/ig],
 ['ecard',/\be\s*-?\s*card\s*(?:code|c0de|cod|#|no\.?|number)(?![A-Za-z])\s*#?|\b(?:RQI|eCredential)\s*(?:code|ID|#)(?![A-Za-z])|\bcertificate\s*(?:id|#|number|no\.?|code)(?![A-Za-z])|\bcert(?:ificate)?\s*code(?![A-Za-z])|\bcard\s*(?:code|id)(?![A-Za-z])/ig],
 ['tc_info',/\b(?:TC|tr\w{1,4}ing\s*(?:c\w{2,4}r|centre))\s*(?:info|phone|city(?:\s*,?\s*state)?|location|address|e-?mail)(?![A-Za-z])/ig],
 ['site',/\btr\w{1,4}ing\s*site(?:\s*na\w{1,2}e)?(?![A-Za-z])/ig],
 ['tc_name',/\btr\w{1,4}ing\s*(?:c\w{2,4}r|centre)(?:\s*na\w{1,2}e)?(?![A-Za-z])/ig],
 ['instructor',/\binstructor(?:\s*na\w{1,2}e)?(?![A-Za-z])/ig],
 ['location',/\bcourse\s*location(?![A-Za-z])/ig],
 ['issue',/\bissue\s*date(?![A-Za-z])|\bdate\s*issued(?![A-Za-z])/ig],
 ['renew',/\b(?:recommended\s*)?renew(?:al)?\s*(?:date|by)(?![A-Za-z])/ig],
 ['qr',/\bQR\s*code(?![A-Za-z])/ig]
];
const ID_LABEL_KINDS=['tc_id','instructor_id','ecard'];
function labelHits(line){
 let hits=[];
 for(const [kind,re] of AHA_LABELS){re.lastIndex=0;let m;while((m=re.exec(line))){const h={kind,start:m.index,end:m.index+m[0].length};if(!hits.some(x=>x.start<h.end&&h.start<x.end))hits.push(h);if(!m[0].length)re.lastIndex++}}
 hits.sort((a,b)=>a.start-b.start);
 /* A word like "Training Center" inside a value ("Example Valley Training Center") is
    not a label: name-type labels count only at the start of a cell or right after
    another label; ID/code labels count anywhere. */
 const out=[];
 for(const h of hits){
  const before=line.slice(0,h.start);
  const cellStart=!before.trim()||/\s{2,}$/.test(before)||/[:|]\s*$/.test(before);
  const afterLabel=out.length&&!line.slice(out[out.length-1].end,h.start).trim();
  if(ID_LABEL_KINDS.includes(h.kind)||cellStart||afterLabel)out.push(h);
 }
 return out;
}
function cellsOf(line){const out=[];const re=/\S+(?: \S+)*/g;let m;while((m=re.exec(line)))out.push({t:m[0],s:m.index,e:m.index+m[0].length});return out}
function tokensOf(line){const out=[];const re=/\S+/g;let m;while((m=re.exec(line)))out.push({t:m[0],s:m.index,e:m.index+m[0].length});return out}
/* kind → [{value, li, how}] in reading order */
function ahaLabelValues(lines){
 const out={};const push=(k,v)=>{(out[k]=out[k]||[]).push(v)};
 const hitsAt=lines.map(labelHits);
 for(let li=0;li<lines.length;li++){
  const line=lines[li],hits=hitsAt[li];if(!hits.length)continue;
  const empty=[];
  hits.forEach((h,j)=>{
   const stop=j+1<hits.length?hits[j+1].start:line.length;
   const after=line.slice(h.end,stop).replace(/^[\s:#.\-–]+/,'');
   const cell=after.split(/\s{2,}/)[0].replace(/[\s,;:|]+$/,'').trim();
   if(cell)push(h.kind,{value:cell,li,how:'label',s:h.end+line.slice(h.end,stop).indexOf(cell)});else empty.push({h,j});
  });
  if(!empty.length)continue;
  /* header row: the values sit on the next line (or the line above), under their labels */
  for(const d of [1,-1]){
   const vl=lines[li+d];if(vl==null||hitsAt[li+d].length)continue;
   const cells=cellsOf(vl),toks=tokensOf(vl);
   const pickFrom=(list,h,j)=>{
    if(list.length===hits.length)return list[j];
    if(hits.length===1&&list.length===1)return list[0];
    const c=(h.start+h.end)/2/Math.max(1,line.length);
    return list.slice().sort((a,b)=>Math.abs((a.s+a.e)/2/Math.max(1,vl.length)-c)-Math.abs((b.s+b.e)/2/Math.max(1,vl.length)-c))[0];
   };
   for(const {h,j} of empty){
    const list=cells.length===hits.length?cells:toks.length===hits.length?toks:cells.length>1?cells:toks;
    const v=list.length?pickFrom(list,h,j):null;
    if(v)push(h.kind,{value:v.t,li:li+d,how:d===1?'value under the label':'value above the label',s:v.s,aligned:list.length===hits.length||hits.length===1});
   }
   break;
  }
 }
 return out;
}
/* ---- v14.3: label → value by position (two-column AHA cards) ----
   AHA's current eCard prints two columns of centred labels with the value
   underneath ("Training Center ID / CA…" on the left, "Instructor ID / …" and
   "eCard Code / …" on the right). OCR reads those as merged or reordered lines,
   so for each label we look at the words' boxes: the value is the nearest row of
   words just below the label (or right after it on the same row) that overlaps
   the label horizontally and is not itself a label. Columns are kept apart by
   the gap between word clusters. `geo` = [{t,x0,x1,y0,y1,c,li}], y grows downward. */
function geoLabelValues(geo){
 const out={};Object.defineProperty(out,'boxes',{value:[],enumerable:false});if(!geo||geo.length<4)return out;
 /* OCR noise ("i.", "_.", stray marks from artwork) would break a label apart: drop near-zero-confidence words and pure punctuation */
 const W=geo.filter(w=>w&&/[A-Za-z0-9]/.test(String(w.t||''))&&(w.c==null||w.c>=0.3)&&w.x1>w.x0&&w.y1>w.y0);
 const hs=W.map(w=>w.y1-w.y0).sort((a,b)=>a-b),H=hs[hs.length>>1]||10;
 /* rows: words whose vertical centres are within half a line */
 const rows=[];W.slice().sort((a,b)=>(a.y0+a.y1)-(b.y0+b.y1)).forEach(w=>{const cy=(w.y0+w.y1)/2;let r=rows.find(r=>Math.abs(r.cy-cy)<H*0.5);if(!r){r={cy,ws:[]};rows.push(r)}r.ws.push(w)});
 /* clusters: words in a row separated by less than ~1.6 line heights */
 const clusters=[];
 for(const r of rows){r.ws.sort((a,b)=>a.x0-b.x0);let cur=null;for(const w of r.ws){if(cur&&w.x0-cur.x1<H*1.6){cur.ws.push(w);cur.x1=Math.max(cur.x1,w.x1);cur.y0=Math.min(cur.y0,w.y0);cur.y1=Math.max(cur.y1,w.y1)}else{cur={ws:[w],x0:w.x0,x1:w.x1,y0:w.y0,y1:w.y1};clusters.push(cur)}}}
 const labels=[],labelWords=new Set();
 for(const cl of clusters){
  let s='';const pos=[];cl.ws.forEach((w,i)=>{if(i)s+=' ';pos.push([s.length,s.length+String(w.t).length,w]);s+=String(w.t)});
  for(const h of labelHits(s)){const ws=pos.filter(([a,b])=>a<h.end&&b>h.start).map(p=>p[2]);if(!ws.length)continue;ws.forEach(w=>labelWords.add(w));labels.push({kind:h.kind,x0:Math.min(...ws.map(w=>w.x0)),x1:Math.max(...ws.map(w=>w.x1)),y0:Math.min(...ws.map(w=>w.y0)),y1:Math.max(...ws.map(w=>w.y1)),cl,ws})}
 }
 /* a two-line label ("Training Center Phone / Number"): swallow the continuation word */
 const isLabelish=w=>labelWords.has(w)||/^(number|name|state)$/i.test(String(w.t).replace(/[^A-Za-z]/g,''));
 const val=(ws,how,lab)=>{const t=ws.map(w=>w.t).join(' ');const cs=ws.map(w=>w.c==null?1:w.c);return{value:t,how,li:ws[0].li,wc:0.5*cs.reduce((a,b)=>a+b,0)/cs.length+0.5*Math.min(...cs),geo:true,s:0}};
 for(const L of labels)out.boxes.push({kind:L.kind,x0:L.x0,x1:L.x1,y0:L.y0,y1:L.y1,H});
 for(const L of labels){
  const lw=L.x1-L.x0,cx=(L.x0+L.x1)/2;
  /* same row, right after the label (table layout "Label   value") */
  const after=L.cl.ws.filter(w=>w.x0>=L.x1-1&&!labelWords.has(w));
  const nextLab=labels.filter(o=>o!==L&&o.cl===L.cl&&o.x0>=L.x1).sort((a,b)=>a.x0-b.x0)[0];
  const inline=after.filter(w=>!nextLab||w.x1<=nextLab.x0);
  if(inline.length){(out[L.kind]=out[L.kind]||[]).push(val(inline,'label',L));continue}
  /* table layout: the nearest cluster to the right on the same row, if it is not a label */
  const right=clusters.filter(c=>c!==L.cl&&Math.abs((c.y0+c.y1)/2-(L.y0+L.y1)/2)<H*0.35&&c.x0>L.x1&&c.x0-L.x1<H*14).sort((a,b)=>a.x0-b.x0)[0];
  if(right&&!right.ws.some(w=>labelWords.has(w))&&right.ws.length<=8){(out[L.kind]=out[L.kind]||[]).push(val(right.ws,'label',L));continue}
  /* below: nearest cluster under the label that overlaps it horizontally (a value, not a sentence) */
  let found=false;
  const below=clusters.filter(c=>c.y0>=L.y1-H*0.3&&c.y0-L.y1<H*2.6&&Math.min(c.x1,L.x1+lw*0.15)-Math.max(c.x0,L.x0-lw*0.15)>0)
   .map(c=>({c,ws:c.ws.filter(w=>!isLabelish(w)&&Math.min(w.x1,Math.max(L.x1,cx+lw))-Math.max(w.x0,Math.min(L.x0,cx-lw))>-H)}))
   .sort((a,b)=>a.c.y0-b.c.y0);
  for(const b of below){
   if(b.c.ws.some(w=>labelWords.has(w))&&!b.ws.length)break; /* next label reached: no value */
   if(b.ws.length>8)break;
   if(b.ws.length){(out[L.kind]=out[L.kind]||[]).push(val(b.ws,'value under the label',L));found=true;break}
  }
 }
 return out;
}
const TC_ID_SHAPE=/^[A-Z]{2}\d{5}$/;
function tcIdFrom(v){
 for(const t of String(v||'').split(/\s+/)){
  const u=t.toUpperCase().replace(/[^A-Z0-9]/g,'');if(u.length<4||u.length>12)continue;
  const fx=/^[A-Z]{2}[0-9OIlSBZ]{5}$/.test(u)?u.slice(0,2)+fixDigits(u.slice(2)):u;
  if(/\d/.test(fx))return{code:fx,raw:t};
 }
 return null;
}
/* The eCard code from its own label only. `exclude` holds TC ID / Instructor ID values. */
function ahaCode(lines,flat,labels,{exclude=new Set(),issueYY=null,redCross=false}={}){
 const bad=c=>!c||exclude.has(c.code)||(!redCross&&TC_ID_SHAPE.test(c.code));
 const cands=[];
 for(const v of labels.ecard||[]){
  const whole=normCode(v.value);
  if(whole&&!bad(whole)&&(whole.type==='AHA'&&!whole.odd||!/\s/.test(v.value.trim())))cands.push({...whole,raw:v.value,li:v.li,how:v.how,wc:v.geo?v.wc:null,geo:!!v.geo});
  else for(const t of v.value.split(/\s+/)){const n=normCode(t);if(n&&!bad(n)){cands.push({...n,raw:t,li:v.li,how:v.how,wc:v.geo?v.wc:null,geo:!!v.geo});break}}
 }
 const score=c=>(c.type==='AHA'&&!c.odd?3:c.type==='ALNUM'&&c.code.length>=8?2:1)+(c.how==='label'||c.geo?0.5:0)+(c.geo?0.25:0)+(issueYY&&c.type==='AHA'&&c.code.slice(0,2)===issueYY?0.25:0);
 cands.sort((a,b)=>score(b)-score(a));
 if(cands.length)return cands[0];
 /* No label: a bare 12-digit AHA code (YY + course + 7 digits) not printed as a TC/Instructor ID. */
 const re=/(?<![\dA-Za-z])(\d{4} ?\d{4} ?\d{4})(?![\dA-Za-z])/g;let m;
 for(let li=0;li<lines.length;li++){re.lastIndex=0;while((m=re.exec(lines[li]))){const code=m[1].replace(/ /g,'');if(exclude.has(code))continue;const near=labelHits(lines[li]).some(h=>h.kind==='tc_id'||h.kind==='instructor_id'||h.kind==='tc_info');if(near)continue;return{code,type:'AHA',how:'pattern',raw:m[1],li}}}
 return null;
}

/* ---- v14.2 confidence: from the OCR words that make up each field ----
   OCR route: wordConf = ½·mean + ½·min of Tesseract's per-word confidence for the
   words the value was read from (words on the field's own line are preferred).
   Then: +0.03 when the value sits next to its label, ×0.85 when it was found
   without a label; field-specific factors (damaged date ×0.6, possible day/month
   swap ×0.85, abbreviation-only course ×0.9, …). Capped at 0.97 for OCR.
   Text-layer PDFs start at 0.98 (the text is exact). See docs/EXTRACTION-BENCHMARK.md. */
const LABEL_BONUS=0.03,NO_LABEL=0.85,OCR_CAP=0.97;
const nz=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function buildOcr(ocrLines){
 /* one text line per OCR line; a wide gap between words becomes a column break ("  ") */
 const lines=[],spans=[];
 for(const ws of ocrLines||[]){
  const words=(ws||[]).filter(w=>w&&String(w.t||'').trim());if(!words.length)continue;
  const hs=words.map(w=>w.h||0).filter(Boolean).sort((a,b)=>a-b),hMed=hs.length?hs[Math.floor(hs.length/2)]:0;
  let line='';const sp=[];
  words.forEach((w,i)=>{
   const t=String(w.t).replace(/\s+/g,'');
   if(i){const p=words[i-1];const gap=(w.x0!=null&&p.x1!=null&&hMed)?w.x0-p.x1:0;line+=gap>hMed*1.6?'  ':' '}
   sp.push({s:line.length,e:line.length+t.length,c:Math.max(0,Math.min(1,+w.c||0)),n:nz(t)});line+=t;
  });
  lines.push(line);spans.push(sp);
 }
 return{lines,spans};
}
/* The parser. OCR input: `ocrLines` (per line: [{t,c,x0,x1,h}], c = 0..1) or the
   older `words` map (token → confidence). */
function parseCardText(text,{kind='CERT_BLS',method='PDF_TEXT',qr=null,ocrConf=null,words=null,ocrLines=null,geo=null,profileName='',catalog=null,sources=null,jurisdictions=null}={}){
 const built=method!=='PDF_TEXT'&&ocrLines&&ocrLines.length?buildOcr(ocrLines):null;
 const lines=built?built.lines:toLines(text),flat=lines.join('\n'),profile=profileFor(kind,catalog);
 const spans=built?built.spans:null;
 const base=method==='PDF_TEXT'?0.98:clamp((ocrConf==null?80:ocrConf)/100,0.3,0.97);
 /* legacy token-map confidence (unit tests and callers without word positions) */
 const tokConf=v=>{
  if(method==='PDF_TEXT'||!words)return base;
  const toks=String(v).toLowerCase().split(/\s+/).map(nz).filter(Boolean);
  const keys=Object.keys(words);
  const cs=toks.map(t=>words[t]!=null?words[t]:(()=>{const k=keys.find(k=>k.length>=2&&(k.includes(t)||t.includes(k)));return k?words[k]:null})()).filter(x=>x!=null);
  return cs.length?clamp(0.5*cs.reduce((a,b)=>a+b,0)/cs.length+0.5*Math.min(...cs),0.2,OCR_CAP):base*0.9;
 };
 /* word-level confidence for a value read from line `li` */
 const wordConf=(raw,li)=>{
  if(!spans)return null;
  const toks=String(raw||'').split(/\s+/).map(nz).filter(Boolean);if(!toks.length)return null;
  const order=[];if(li!=null)for(const d of [0,1,-1,2,-2])if(spans[li+d])order.push(li+d);for(let i=0;i<spans.length;i++)if(!order.includes(i))order.push(i);
  const used=new Set(),cs=[];
  for(const t of toks){
   let hit=null;
   for(const L of order){hit=spans[L].find(w=>!used.has(w)&&w.n===t);if(hit)break}
   if(!hit)for(const L of order){hit=spans[L].find(w=>!used.has(w)&&w.n.length>=2&&t.length>=2&&(w.n.includes(t)||t.includes(w.n)));if(hit)break}
   if(hit){used.add(hit);cs.push(hit.c)}else cs.push(Math.min(base,0.6));
  }
  return 0.5*cs.reduce((a,b)=>a+b,0)/cs.length+0.5*Math.min(...cs);
 };
 /* field confidence: words (or text layer) × label match × field factors */
 const C=(raw,li,{label=true,factor=1,wc:given=null}={})=>{
  if(method==='PDF_TEXT')return clamp(base*(label?1:NO_LABEL)*factor);
  const wc=given!=null?given:wordConf(raw,li);const w=wc==null?tokConf(raw):wc;
  return clamp(Math.min(OCR_CAP,w+(label?LABEL_BONUS:0))*(label?1:NO_LABEL)*factor,0,OCR_CAP);
 };
 const lineOf=s=>{const t=nz(s);if(!t)return null;const i=lines.findIndex(l=>nz(l).includes(t));return i<0?null:i};
 const f={};const warnings=[];const notes={};const calculated={};/* v14.4: calculated dates live here, never in fields */const want=PROFILE_FIELDS[profile];
 // ---- issuer / suggested registry source ----
 let issuer=null,source=null;
 if(profile==='aha_resus'){
  issuer=/red\s*cross/i.test(flat)?'RED_CROSS':/\bRQI\b|heartcode\s*complete|rqi1stop/i.test(flat)?'AHA_RQI':/american\s*heart|heart\.org|\bAHA\b/i.test(flat)?'AHA':null;
 }else if(kind==='CERT_NIHSS'){const n=nihssIssuer(flat);if(n.id){source={id:n.id,name:n.name,how:'issuer printed on the certificate: '+String(n.raw).replace(/\s+/g,' ')};issuer=n.id}else notes.verifier=n.note}
 else if(profile!=='dates_only'&&profile!=='license'){source=detectSource(flat,kind,sources);issuer=source?source.id:null}
 // ---- which credential the document is ----
 if(profile==='aha_resus'){
  const title=/\b(BLS|ACLS|PALS)\s*(Provider|Instructor)\b/i.exec(flat);
  let course=null,courseHow='',courseRaw='';
  if(title){course=title[1].toUpperCase();courseHow=title[0];courseRaw=title[0]}
  else{const longs=[[/basic\s+l\w{2,4}\s+su\w*port/i,'BLS'],[/advanced\s+cardio\w*\s+life/i,'ACLS'],[/pediatric\s+advanced\s+l\w{2,4}|\b[a-z]{3,9}i[ct]\s+advanced\s+l\w{2,4}\s+su/i,'PALS'],[/advanced\s+life\s+support/i,'ACLS']].map(([re,c],ix)=>({c,m:re.exec(flat),generic:ix===3})).filter(x=>x.m).map(x=>({...x,i:x.m.index})).sort((a,b)=>(a.generic-b.generic)||(a.i-b.i));
   if(longs.length){course=longs[0].c;courseHow='full course name';courseRaw=longs[0].m[0]}else{const ab=/\b(BLS|ACLS|PALS)\b/.exec(flat);if(ab){course=ab[1];courseHow='abbreviation';courseRaw=ab[0]}}}
  if(course){const instr=/instructor/i.test(courseHow);f.course={value:course+(instr?' Instructor':' Provider'),conf:C(courseRaw,lineOf(courseRaw),{factor:courseHow==='abbreviation'?0.9:1}),how:courseHow};if(instr)warnings.push('This looks like an instructor card, not a provider card.')}
 }else if(profile==='cert'){
  const found=detectKinds(flat,catalog);const self=found.find(x=>x.kind===kind);const top=self||found[0];
  if(top){const cat=(catalog||_globals().catalog).find(k=>k.kind===top.kind);const re=cat&&kindPattern(cat);const mm=re&&re.exec(flat);const raw=mm?mm[0]:top.short;f.course={value:cat?.short||top.short,conf:C(raw,lineOf(raw),{factor:self?1:0.9}),how:self?'names this credential':'names a different credential',kind:top.kind}}
 }
 // ---- dates ----
 const {issue,exp,renewMy}=pickDates(lines,{monthYearOk:profile==='aha_resus'||profile==='cert'});
 /* Day/month order: AHA prints MM/DD/YYYY (documented card format); elsewhere a
    numeric date like 04/05/2026 is ambiguous unless another date on the same
    document has a day above 12 in the same position. */
 const allNum=findDates(lines).full.filter(d=>d.numeric);
 const orderProven=profile==='aha_resus'||allNum.some(d=>d.monthFirstProven);
 const ambig=d=>d&&d.numeric&&d.dayFirstPossible&&!orderProven;
 const dateConf=(d,re)=>C(d.raw,d.li,{label:labelNear(lines,d.li,re)!=null,factor:(d.garbled?0.6:1)*(ambig(d)?0.85:1)});
 const dateHow=d=>d.garbled?'date (damaged print, check it)':ambig(d)?'date (day and month could be swapped, check it)':'date';
 if(issue&&want.includes('issued_on'))f.issued_on={value:issue.iso,conf:dateConf(issue,RE_ISSUE),how:dateHow(issue)};
 if(profile==='aha_resus'){
  if(renewMy)f.renew_by={value:renewMy.ym,conf:C(renewMy.raw,renewMy.li,{label:labelNear(lines,renewMy.li,RE_EXP)!=null}),how:'month/year'};
  else if(exp&&exp!==issue)f.renew_by={value:exp.iso.slice(0,7),conf:dateConf(exp,RE_EXP)*0.95,how:'full date',exact:exp.iso};
  if(f.issued_on&&f.renew_by&&issuer!=='RED_CROSS'){
   const w2=addMonths(f.issued_on.value,24);
   if(w2===f.renew_by.value){f.issued_on.conf=clamp(f.issued_on.conf+0.03,0,method==='PDF_TEXT'?0.995:OCR_CAP);f.renew_by.conf=clamp(f.renew_by.conf+0.03,0,method==='PDF_TEXT'?0.995:OCR_CAP)}
   else{f.issued_on.conf*=0.8;f.renew_by.conf*=0.8;warnings.push(`The renewal month (${f.renew_by.value}) is not two years after the issue date (${f.issued_on.value}). AHA cards renew two years after issue.`)}
  }
 }else if(exp&&exp!==issue)f.expires_on={value:exp.iso,conf:dateConf(exp,RE_EXP),how:dateHow(exp)};
 else if(renewMy&&profile==='cert')f.expires_on={value:renewToExpiry(renewMy.ym),conf:C(renewMy.raw,renewMy.li,{factor:0.9}),how:'month/year → end of month',monthOnly:renewMy.ym};
 if(f.issued_on&&f.expires_on&&f.expires_on.value<=f.issued_on.value){warnings.push('The expiration date is not after the issue date.');f.expires_on.conf*=0.7}
 // ---- AHA labels: Training Center ID, Instructor ID, eCard code ----
 let labels={},ecardBox=null;
 if(profile==='aha_resus'){
  labels=ahaLabelValues(lines);
  /* v14.3: word positions (OCR boxes, or PDF text positions) win where they find a label */
  let g=geo;if(!g&&built&&ocrLines){g=[];let li=0;for(const ws of ocrLines){const words=(ws||[]).filter(w=>w&&String(w.t||'').trim());if(!words.length)continue;words.forEach(w=>{if(w.y0!=null&&w.y1!=null&&w.x0!=null&&w.x1!=null)g.push({t:String(w.t).replace(/\s+/g,''),c:w.c,x0:w.x0,x1:w.x1,y0:w.y0,y1:w.y1,li})});li++}}
  const gl=geoLabelValues(g);ecardBox=(gl.boxes||[]).find(b=>b.kind==='ecard')||null;
  /* When positions explain the card, trust them alone: line-order guesses on a two-column
     card can pair a label with the other column's value (that is how an Instructor ID once
     became the "Training Center ID" and the eCard code got excluded). */
  if(Object.keys(gl).length>=2){const text=labels;labels={...gl};for(const k of ['ecard','tc_id','tc_name'])if(!gl[k]&&text[k])labels[k]=text[k]}
  else for(const k of Object.keys(gl))labels[k]=gl[k].concat(labels[k]||[]);
 }
 const exclude=new Set();
 if(profile==='aha_resus'){
  for(const v of labels.tc_id||[]){const t=tcIdFrom(v.value);if(t){exclude.add(t.code);if(!f.training_center_id)f.training_center_id={value:t.code,conf:C(t.raw,v.li,{factor:v.how==='label'||v.aligned||v.geo?1:0.9,wc:v.geo?v.wc:null}),how:'Training Center ID label',info:true}}}
  for(const v of labels.instructor_id||[])for(const t of v.value.split(/\s+/)){const u=t.toUpperCase().replace(/[^A-Z0-9]/g,'');if(u.length>=4){exclude.add(u);exclude.add(fixDigits(u))}}
  for(const v of labels.tc_info||[])for(const t of v.value.split(/\s+/)){const u=t.replace(/\D/g,'');if(u.length>=7)exclude.add(u)}
 }
 // ---- credential ID ----
 if(want.includes('credential_id')){
  let code;
  if(profile==='aha_resus')code=ahaCode(lines,flat,labels,{exclude,issueYY:f.issued_on?f.issued_on.value.slice(2,4):null,redCross:issuer==='RED_CROSS'});
  else{
   const reLbl=profile==='license'?/(license|licence|lic\.?|registration|certificate)\s*(number|no\.?|#|num)|\bRN\s*(#|no\.?|number)/i
    :/(e\s*-?\s*card|cert\w*|card|test|credential|verification|member|candidate|course\s*completion)\s*(id|#|number|no\.?|code|num)/i;
   code=profile==='cert'?(certId(lines,/(certificate|certification|cert\.?|credential|test|verification|member|candidate|card|customer|aacn)\s*(id|#|number|no\.?|num|code)\b|e\s*-?\s*card\s*(id|#|code)/i)||findId(lines,flat,reLbl,{})||verifyLineId(lines)):findId(lines,flat,reLbl,{});
   /* v14.4: OCR reads 0 as O (and 1 as I/l) inside license numbers: "RNO000099" → RN0000099 */
   if(code&&profile==='license'&&method!=='PDF_TEXT'){const mm=/^([A-Z]{0,4}?)([0-9OIL]{4,})$/.exec(code.code);if(mm&&/[OIL]/.test(mm[2])&&(mm[2].match(/\d/g)||[]).length>=3){code={...code,code:mm[1]+mm[2].replace(/O/g,'0').replace(/[IL]/g,'1'),fixed:true}}}
   if(!code&&profile==='license'){const m=/\b(RN|R\.N\.)\s*[-#:]?\s*(\d{5,10})\b/.exec(flat);if(m)code={code:'RN'+m[2],type:'ALNUM',how:'pattern',raw:m[0]}}
  }
  let q=codeFromQr(qr);if(q&&profile==='aha_resus'&&(exclude.has(q.code)||(issuer!=='RED_CROSS'&&TC_ID_SHAPE.test(q.code))))q=null;
  if(code||q){
   let conf=code?C(code.raw||code.code,code.li!=null?code.li:lineOf(code.raw||code.code),{label:code.how!=='pattern'&&!code.weak,factor:code.how==='pattern'?0.94:code.anchor?0.86:code.weak?0.8:1,wc:code.wc!=null?code.wc:null}):0.97;let how=code?code.how:'qr';
   if(code&&code.odd&&profile==='aha_resus'){conf*=0.6;warnings.push(`The eCard code read as ${code.code.length} digits; AHA codes have 12.`)}
   if(code&&q){if(q.code===code.code)conf=0.995;else if(profile==='aha_resus'){warnings.push('The code printed on the card and the code in its QR code differ. The QR code was used.');code=q;conf=0.9;how='qr'}}
   else if(!code){code=q}
   if(profile==='aha_resus'&&code.type==='AHA'&&code.code.length===12&&f.issued_on){if(code.code.slice(0,2)===f.issued_on.value.slice(2,4))conf=clamp(conf+0.02,0,how==='qr'||method==='PDF_TEXT'?0.995:OCR_CAP);/* v14.3: no penalty otherwise — real 2026 cards print codes starting with 27 */}
   if(profile==='aha_resus'&&code.type==='ALNUM'&&issuer==='AHA')issuer='AHA_RQI';
   f.credential_id={value:code.code,conf:clamp(conf),how};
  }else if(profile==='aha_resus'&&issuer!=='RED_CROSS'){notes.credential_id=ECARD_NOT_FOUND;if(ecardBox)notes._ecardBox=ecardBox}
 }
 // ---- license specifics ----
 if(profile==='license'){
  const j=findJurisdiction(flat,jurisdictions);if(j)f.jurisdiction={value:j.code,conf:C(j.raw||j.name,lineOf(j.raw||j.name),{label:!j.weak,factor:j.weak?(j.count>1?0.9:0.8):1}),how:j.weak?'state name':'issuing board'};
  const single=/(not|non)[\s-]*(valid\s+for\s+)?multi-?\s?state|single[\s-]*state/i.exec(flat),multi=!single&&/multi-?\s?state|compact\s+(license|privilege)|\bNLC\b/i.exec(flat);
  if(single)f.multistate={value:'single-state',conf:C(single[0],lineOf(single[0]),{factor:0.95}),how:'wording'};
  else if(multi)f.multistate={value:'multistate',conf:C(multi[0],lineOf(multi[0]),{factor:0.95}),how:'wording'};
  /* v14.4: license type as printed */
  const lt=/\b(registered\s+(?:professional\s+)?nurse|licensed\s+(?:practical|vocational)\s+nurse|advanced\s+practice\s+registered\s+nurse|nurse\s+practitioner)\b/i.exec(flat);
  if(lt){const t=lt[1].toLowerCase(),v=/^registered/.test(t)?'RN':/practical/.test(t)?'LPN':/vocational/.test(t)?'LVN':'APRN';f.course={value:v,conf:C(lt[0],lineOf(lt[0])),how:'license type printed: '+lt[0].replace(/\s+/g,' ')}}
  /* v14.4: never invent multistate. When the document doesn't say, explain what the issuing state can issue. */
  if(!f.multistate&&f.jurisdiction){const jj=(jurisdictions||_globals().jurisdictions).find(x=>x.code===f.jurisdiction.value);if(jj&&jj.nlc!=='IMPLEMENTED')notes.multistate=`Not printed on the document. ${jj.name} ${jj.nlc?'can\'t issue multistate (compact) licenses yet':'isn\'t in the Nurse Licensure Compact'}, so a ${jj.name} license covers ${jj.name} only.`;else if(jj)notes.multistate='Not printed on the document. Choose single-state or multistate yourself.'}
 }
 // ---- holder name ----
 if(want.includes('holder_name')){const n=findName(lines,flat,{profileName});if(n)f.holder_name={value:n.name,conf:C(n.name,lineOf(n.name),{label:n.how==='label'||n.how.startsWith('before')||n.how.startsWith('after')}),how:n.how}}
 // ---- training center (AHA): its own label, never the TC ID / city / site ----
 if(want.includes('training_center')){
  const okName=v=>v&&v.length>=3&&v.replace(/[^A-Za-z]/g,'').length>=4&&!/^\W*T?C\W*I[DO0]\b/i.test(v)&&/[A-Za-z]{3,}/.test(v)&&!/^(TC|ID|Instructor|Course|Name|Info|Phone|Number|City|State|Site|Code|Address|E-?mail)\b/i.test(v)&&!labelHits(v).length;
  const tn=(labels.tc_name||[]).map(v=>({...v,value:v.value.replace(/^na\w{1,2}e\b\s*/i,'').trim()})).find(v=>okName(v.value));
  if(tn)f.training_center={value:tn.value.slice(0,90),conf:C(tn.value,tn.li,{factor:0.95}),how:'label'};
  else for(let i=0;i<lines.length;i++){
   const m=/tr\w{1,4}ing\s*(?:c\w{2,4}r|centre|site)(?:\s*na\w{1,2}e)?\s*[:#\-]?\s*(.*)$/i.exec(lines[i]);if(!m)continue;
   if(/^\s*(ID|I\.D|#|No\b|Number)/i.test(m[1]))continue;
   const clean=s=>String(s||'').replace(/\b(TC\s*ID|TC\s*Info|Course\s*Location|Instructor.*|eCard.*|Phone.*|ID\s*#?).*$/i,'').split(/\s*[\[\]=|{}<>©®«»*_~]|\s{2,}/)[0].replace(/^[\s:#\-]+|[\s,;:#\-.]+$/g,'').trim();
   let v=clean(m[1]);if(v.length<3||/^(name|id|info)$/i.test(v))v=clean(lines[i+1]);
   v=v.split(' ').filter((w,ix,a)=>!(ix===a.length-1&&w.length<=2&&!/^[A-Z]{2}$/.test(w))).join(' ');
   if(okName(v)){f.training_center={value:v.slice(0,90),conf:C(v,i,{factor:0.92}),how:'label'};break}
  }
 }
 // ---- NIHSS: test group as printed; no expiration invented ----
 if(kind==='CERT_NIHSS'){
  const g=/\b(?:(?:patient|test)\s*)?group\s*[:#\-–]?\s*([A-F])(?![A-Za-z0-9])/i.exec(flat)||/\bNIH\s*Stroke\s*Scale\s*[–\-:]\s*(?:Test\s*)?([A-F])\b(?![A-Za-z0-9])/i.exec(flat);
  if(g)f.test_group={value:g[1].toUpperCase(),raw:g[0].trim(),conf:C(g[0],lineOf(g[0]),{factor:/group/i.test(g[0])?1:0.85}),how:'printed',info:true};
  /* module as printed (initial vs recertification); never inferred from the group */
  const mo=/\b(initial\s+(?:certification|module|course|test)|re-?\s?certification(?:\s+(?:module|course|test))?|renewal\s+(?:module|course|test))\b/i.exec(flat);
  if(mo)f.nihss_module={value:/^init/i.test(mo[1])?'initial':'recertification',raw:mo[0].trim(),conf:C(mo[0],lineOf(mo[0]),{factor:0.95}),how:'printed',info:true};
  /* calculated suggestion, kept apart from the printed expiration (which stays empty): renew
     every 12 months from completion unless the facility rule says otherwise */
  if(!f.expires_on&&f.issued_on)calculated.suggested_renewal={value:addMonthsIso(f.issued_on.value,12),calculated:true,how:'calculated: 12 months from the completion date, not printed on the certificate. The facility rule is final.'};
  if(!f.expires_on)notes.expires_on='No expiration printed on this certificate. Facilities decide how recent an NIHSS must be (often within 12 or 24 months of completion).';
 }
 const fieldsFound=FIELDS.filter(k=>f[k]);
 const required=PROFILE_REQUIRED[profile];
 const missing=required.filter(k=>!f[k]&&!(k==='expires_on'&&f.renew_by));
 if(!source&&profile==='aha_resus'){const sid=suggestedSource(kind,issuer,f.credential_id?.value);source=sid?{id:sid,how:'issuer on the document'}:null}
 if(!source&&profile!=='dates_only'&&kind!=='CERT_NIHSS'){const r=_routeFor(kind,f.jurisdiction?.value,sources);if(r)source={id:r.id,name:r.name,how:'registry route for this credential type'}}
 return{fields:f,calculated,issuer,source,profile,kind,method,warnings,notes,found:fieldsFound,missing,score:fieldsFound.filter(k=>required.includes(k)||k==='credential_id').length,qrFound:!!codeFromQr(qr),textChars:flat.length,fieldsWanted:want,infoFields:profile==='aha_resus'?INFO_FIELDS.slice():kind==='CERT_NIHSS'?NIHSS_INFO_FIELDS.slice():[],required};
}
function _routeFor(kind,jur,sources){
 if(!sources&&typeof primaryRouteFor==='function'){try{return primaryRouteFor(kind,jur||'')}catch{return null}}
 const list=(sources||[]).filter(s=>s.kinds&&s.kinds.includes(kind)&&s.status==='APPROVED');return list[0]||null;
}

/* Expiration the document implies, with how it was read. */
function documentExpiry(fields,issuer){
 /* v14.4: a printed expiration that has passed is shown as expired */
 const r=_documentExpiry(fields,issuer);if(!r)return r;
 const today=new Date().toISOString().slice(0,10);if(r.value&&r.value<today){r.expired=true;r.text+=' That date has passed: this credential is expired.'}
 return r;
}
function _documentExpiry(fields,issuer){
 const e=fields?.expires_on;
 if(e&&e.value)return{value:e.value,text:e.monthOnly?`The document shows ${e.monthOnly.split('-').reverse().join('/')} (month and year only); Veridun reads it as the end of that month, ${e.value}.`:`The document shows an expiration date of ${e.value}.`};
 const r=fields?.renew_by;if(!r||!r.value)return null;
 if(r.exact)return{value:r.exact,text:`The card shows an expiration date of ${r.exact}.`};
 return{value:renewToExpiry(r.value),text:issuer==='RED_CROSS'?`The card shows ${r.value}; Veridun reads it as the end of that month.`:interpretRenewal(r.value)};
}
function nameTokens(s){return String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z\s\-']/g,' ').split(/[\s\-']+/).filter(w=>w.length>0&&!/^(rn|bsn|msn|jr|sr|ii|iii|mr|mrs|ms|dr)$/.test(w))}
function namesMatch(a,b){
 const x=nameTokens(a),y=nameTokens(b);if(!x.length||!y.length)return null;
 const lastX=x[x.length-1],lastY=y[y.length-1];
 const lastOk=lastX===lastY||x.includes(lastY)||y.includes(lastX);
 const firstOk=x[0]===y[0]||x[0][0]===y[0][0]&&(x[0].length===1||y[0].length===1)||x[0].startsWith(y[0])||y[0].startsWith(x[0]);
 return lastOk&&firstOk;
}
const _fmtD=iso=>{if(!iso)return'';const [y,m,d]=String(iso).split('-').map(Number);return d?`${monthName(m).slice(0,3)} ${d}, ${y}`:`${monthName(m)} ${y}`};
/* Compare what the document says with what was entered. Works for every
   kind: dates for all, then name / credential / state / multistate where
   the kind's profile reads them. */
function compareToEntered(values,{kind,expires_on,profileName,issuer,jurisdiction,trainingCenterId=null,catalog=null}={}){
 const out=[];const profile=profileFor(kind,catalog);
 /* v14.2: a Training Center ID typed (or read) as the eCard code can't verify anything */
 if(profile==='aha_resus'&&issuer!=='RED_CROSS'&&values.credential_id){const c=String(values.credential_id).toUpperCase().replace(/[\s\-]/g,'');const tc=String(trainingCenterId||values.training_center_id||'').toUpperCase();if(TC_ID_SHAPE.test(c)||(tc&&c===tc))out.push({field:'credential_id',severity:'info',document:null,entered:values.credential_id,text:`${values.credential_id} looks like the Training Center ID (who ran the class), not the eCard code. AHA verification needs the eCard code printed on the card.`})}
 const exp=documentExpiry({expires_on:values.expires_on?{value:values.expires_on,monthOnly:values.expires_month_only||null}:null,renew_by:values.renew_by?{value:values.renew_by,exact:values.renew_exact}:null},issuer);
 if(exp&&expires_on&&exp.value!==expires_on){
  const days=Math.round((Date.parse(expires_on)-Date.parse(exp.value))/864e5);
  out.push({field:'expires_on',severity:'mismatch',document:exp.value,entered:expires_on,days,text:`Expiration doesn't match the document: you entered ${_fmtD(expires_on)}, the document shows ${_fmtD(exp.value)} (your date is ${Math.abs(days)} day${Math.abs(days)===1?'':'s'} ${days<0?'earlier':'later'}).`,fix:'use-doc-date'});
 }else if(exp&&!expires_on)out.push({field:'expires_on',severity:'info',document:exp.value,entered:null,text:`No expiration entered. The document shows ${_fmtD(exp.value)}.`,fix:'use-doc-date'});
 if(exp&&exp.value<new Date().toISOString().slice(0,10))out.push({field:'expired',severity:'mismatch',document:exp.value,text:`The document shows this expired on ${_fmtD(exp.value)}.`});
 if(profile!=='dates_only'&&values.holder_name&&profileName){const m=namesMatch(values.holder_name,profileName);if(m===false)out.push({field:'holder_name',severity:'mismatch',document:values.holder_name,entered:profileName,text:`Name on the document (${values.holder_name}) doesn't match your profile name (${profileName}).`})}
 if(profile==='aha_resus'&&values.course&&KIND_COURSE[kind]){const c=String(values.course).toUpperCase().split(/\s/)[0];if(c!==KIND_COURSE[kind])out.push({field:'course',severity:'mismatch',document:values.course,entered:KIND_COURSE[kind],text:`The document is a ${values.course} card, but this credential is ${KIND_COURSE[kind]}.`})}
 if(profile==='cert'&&values.course){const cat=(catalog||_globals().catalog);const me=cat.find(k=>k.kind===kind);const re=me&&kindPattern(me);if(re&&!re.test(values.course)){const other=cat.find(k=>k.category==='Certifications'&&k.kind!==kind&&kindPattern(k)?.test(values.course));if(other)out.push({field:'course',severity:'mismatch',document:values.course,entered:me.short||kind,text:`The document is for ${values.course}, but this credential is ${me.short||kind}.`})}}
 /* v14.3: no eCard-code vs issue-year check: real AHA cards issued in 2026 carry codes starting with 27. */
 if(profile==='license'){
  if(values.jurisdiction&&jurisdiction&&values.jurisdiction!==jurisdiction)out.push({field:'jurisdiction',severity:'mismatch',document:values.jurisdiction,entered:jurisdiction,text:`The license on the document is from ${values.jurisdiction.replace('US-','')}, but you selected ${jurisdiction.replace('US-','')}.`});
  if(values.multistate){const docMulti=values.multistate==='multistate',entered=kind==='RN_LICENSE_MULTISTATE';if(docMulti!==entered)out.push({field:'multistate',severity:'mismatch',document:values.multistate,entered:entered?'multistate':'single-state',text:`The document shows a ${values.multistate} license, but you chose ${entered?'multistate':'single-state'}.`})}
 }
 return out;
}
/* Which registry source fits a scanned BLS/ACLS/PALS card. */
function suggestedSource(kind,issuer,code){
 if(issuer==='RED_CROSS')return'redcross-certificate';
 if(issuer==='AHA_RQI'||(code&&/[A-Za-z]/.test(code)))return'aha-rqi';
 return'aha-ecards';
}

/* ---------------- browser pipeline (lazy) ---------------- */
const VENDOR='js/vendor/';
const SRI={tesseract:'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM',jsqr:'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx'};
const abs=p=>new URL(p,(root.document&&document.baseURI)||'http://localhost/').href;
const loaded={};
function loadScript(src,integrity){
 if(loaded[src])return loaded[src];
 return loaded[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;if(integrity){s.integrity=integrity;s.crossOrigin='anonymous'}s.onload=res;s.onerror=()=>{delete loaded[src];rej(new Error('Could not load the document reader ('+src.split('/').pop()+').'))};document.head.appendChild(s)});
}
/* Feature detection + small polyfills. pdf.js (even the legacy build) async-iterates
   ReadableStreams in getTextContent(); Safari before 26 has no ReadableStream async
   iterator ("undefined is not a function (near '...t of e...')"). We read the text stream
   with getReader() ourselves and also patch the iterator so no other path trips on it. */
function polyfill(){
 const RS=root.ReadableStream;
 if(RS&&RS.prototype&&!RS.prototype[Symbol.asyncIterator]){
  const values=function({preventCancel=false}={}){const reader=this.getReader();return{
   next(){return reader.read()},
   async return(v){if(!preventCancel){try{await reader.cancel(v)}catch{}}try{reader.releaseLock()}catch{}return{done:true,value:v}},
   [Symbol.asyncIterator](){return this}}};
  try{Object.defineProperty(RS.prototype,Symbol.asyncIterator,{value:values,configurable:true,writable:true});if(!RS.prototype.values)Object.defineProperty(RS.prototype,'values',{value:values,configurable:true,writable:true})}catch{}
 }
 if(typeof Promise.withResolvers!=='function'){try{Object.defineProperty(Promise,'withResolvers',{configurable:true,writable:true,value:function(){let resolve,reject;const promise=new this((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}})}catch{}}
 const B=root.Blob;
 if(B&&B.prototype&&typeof B.prototype.arrayBuffer!=='function'){B.prototype.arrayBuffer=function(){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsArrayBuffer(this)})}}
}
/* What this browser can do. Missing pieces → friendly message + type the details. */
function capabilities(){
 const has=x=>{try{return!!x()}catch{return false}};
 const canvas=has(()=>document.createElement('canvas').getContext('2d'));
 const base=has(()=>root.Promise&&root.Uint8Array&&root.File&&root.Blob&&root.URL)&&canvas;
 const worker=has(()=>root.Worker);
 const wasm=has(()=>typeof root.WebAssembly==='object'&&typeof root.WebAssembly.instantiate==='function');
 const missing=[];if(!base)missing.push('canvas');if(!worker)missing.push('workers');if(!wasm)missing.push('WebAssembly');
 return{pdf:base&&worker,image:base&&worker&&wasm,missing};
}
class ScanError extends Error{constructor(msg,cause){super(msg);this.name='ScanError';this.friendly=true;this.cause=cause}}
const MANUAL='';/* callers add what to do next (nurse: type it; verifier: check by eye) */
/* Never show a raw JS error to a user: map anything to plain words (raw goes to the console only). */
function friendlyError(e,what='this document'){
 if(e&&e.friendly)return e.message;
 const m=String((e&&e.message)||e||'');
 try{console.warn('[Veridun] document reader:',m)}catch{}
 if(/password/i.test(m))return`${what[0].toUpperCase()+what.slice(1)} is password-protected, so it can't be read here.`+MANUAL;
 if(/Invalid PDF|corrupt|bad XRef|FormatError|Missing PDF/i.test(m))return`${what[0].toUpperCase()+what.slice(1)} looks damaged or isn't a normal PDF, so it couldn't be read here.`+MANUAL;
 if(/Could not download|Signed link|Failed to fetch|NetworkError|Load failed|network/i.test(m))return'The document could not be downloaded right now. Check your connection and try again.'+MANUAL;
 if(/Could not load the document reader|import|module|dynamically imported/i.test(m))return'The document reader could not start in this browser.'+MANUAL;
 return`This browser couldn't read ${what} automatically.`+MANUAL;
}
let pdfjsP=null;
function pdfjs(){polyfill();if(!pdfjsP)pdfjsP=import(abs(VENDOR+'pdfjs-6.4.299-legacy/pdf.min.mjs')).then(m=>{m.GlobalWorkerOptions.workerSrc=abs(VENDOR+'pdfjs-6.4.299-legacy/pdf.worker.min.mjs');return m}).catch(e=>{pdfjsP=null;throw new ScanError('The PDF reader could not start in this browser.'+MANUAL,e)});return pdfjsP}
let workerP=null;
async function ocrWorker(onProgress){
 if(!workerP)workerP=(async()=>{
  await loadScript(VENDOR+'tesseract-7.0.0/tesseract.min.js',SRI.tesseract);
  return root.Tesseract.createWorker('eng',1,{workerPath:abs(VENDOR+'tesseract-7.0.0/worker.min.js'),corePath:abs(VENDOR+'tesseract-7.0.0/core'),langPath:abs(VENDOR+'tesseract-7.0.0/lang'),
   logger:m=>{if(DocExtract._progress&&m&&typeof m.progress==='number')DocExtract._progress(m.status,m.progress)}});
 })().catch(e=>{workerP=null;throw e});
 return workerP;
}
async function sniff(file){
 const b=new Uint8Array(await file.slice(0,8).arrayBuffer());
 if(b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46)return'pdf';
 if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)return'image';
 if(b[0]===0xff&&b[1]===0xd8)return'image';
 if(/^image\/(png|jpe?g|webp|gif)$/.test(file.type||''))return'image';
 return'other';
}
function canvasOf(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c}
async function imageCanvas(file){
 let src;
 try{src=await createImageBitmap(file,{imageOrientation:'from-image'})}catch{src=await new Promise((res,rej)=>{const u=URL.createObjectURL(file),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('That image could not be opened.'))};im.src=u})}
 const w=src.width||src.naturalWidth,h=src.height||src.naturalHeight,big=Math.max(w,h);
 const k=big>2600?2600/big:big<1500?Math.min(2.5,1700/big):1;
 const c=canvasOf(w*k,h*k),x=c.getContext('2d');x.imageSmoothingQuality='high';x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(src,0,0,c.width,c.height);
 if(src.close)src.close();return c;
}
/* v14.3: light background artwork (AHA's grey torch watermark) can hide a printed code
   from OCR. Second look: grey levels, and anything lighter than mid-grey becomes white. */
function whiten(c){
 const o=canvasOf(c.width,c.height),x=o.getContext('2d');x.drawImage(c,0,0);
 const d=x.getImageData(0,0,o.width,o.height),a=d.data;
 for(let i=0;i<a.length;i+=4){const l=0.299*a[i]+0.587*a[i+1]+0.114*a[i+2];const v=l>175?255:Math.max(0,Math.round((l-40)*255/135));a[i]=a[i+1]=a[i+2]=v}
 x.putImageData(d,0,0);return o;
}
function rotate(c,deg){const r=deg%180!==0,o=canvasOf(r?c.height:c.width,r?c.width:c.height),x=o.getContext('2d');x.translate(o.width/2,o.height/2);x.rotate(deg*Math.PI/180);x.drawImage(c,-c.width/2,-c.height/2);return o}
function scaled(c,max){const k=Math.min(1,max/Math.max(c.width,c.height));if(k===1)return c;const o=canvasOf(c.width*k,c.height*k);o.getContext('2d').drawImage(c,0,0,o.width,o.height);return o}
async function decodeQr(c){
 try{if(root.BarcodeDetector){const d=new root.BarcodeDetector({formats:['qr_code']});const r=await d.detect(c);if(r&&r[0]&&r[0].rawValue)return r[0].rawValue}}catch{}
 try{
  await loadScript(VENDOR+'jsqr-1.4.0.js',SRI.jsqr);
  for(const max of [900,1400,2000]){const s=scaled(c,max),d=s.getContext('2d').getImageData(0,0,s.width,s.height);const r=root.jsQR(d.data,d.width,d.height,{inversionAttempts:'attemptBoth'});if(r&&r.data)return r.data}
 }catch{}
 return null;
}
async function ocr(c){
 const w=await ocrWorker();
 const r=await w.recognize(c,{},{text:true,blocks:true});
 const words={},lines=[];
 /* v14.2: keep each word with its own confidence and position, line by line, so a
    field's confidence comes from the words it was read from */
 (r.data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>{
  const ws=[];
  (l.words||[]).forEach(wd=>{const raw=String(wd.text||'').trim();if(!raw)return;const c=(wd.confidence||0)/100,bb=wd.bbox||{};ws.push({t:raw,c,x0:bb.x0,x1:bb.x1,y0:bb.y0,y1:bb.y1,h:bb.y1!=null&&bb.y0!=null?bb.y1-bb.y0:0});const t=raw.toLowerCase().replace(/[^a-z0-9]/g,'');if(t)words[t]=Math.max(words[t]||0,c)});
  if(ws.length)lines.push(ws);
 })));
 return{text:r.data.text||'',conf:r.data.confidence,words,lines};
}
/* Read the text layer with an explicit reader loop (no for-await over a ReadableStream). */
async function textItems(page){
 if(typeof page.streamTextContent==='function'){
  const reader=page.streamTextContent().getReader(),items=[];
  try{for(;;){const{value,done}=await reader.read();if(done)break;if(value&&value.items)for(let i=0;i<value.items.length;i++)items.push(value.items[i])}}
  finally{try{reader.releaseLock()}catch{}}
  return items;
 }
 return(await page.getTextContent()).items;
}
/* v14.3: word boxes from the PDF text layer (for the two-column label reader); y grows downward */
function pdfGeo(items,yOff){
 const out=[];
 for(const it of items){const str=String(it.str||'');if(!str.trim())continue;const x=it.transform[4],y=it.transform[5],h=Math.abs(it.height||it.transform[3]||8),w=it.width||str.length*h*0.5,cw=w/Math.max(1,str.length);
  const re=/\S+/g;let m;while((m=re.exec(str)))out.push({t:m[0],c:1,x0:x+m.index*cw,x1:x+(m.index+m[0].length)*cw,y0:yOff-(y+h*0.8),y1:yOff-(y-h*0.2)})}
 return out;
}
/* v14.4: fillable-form PDFs (state license printouts) keep the name, number and dates in
   form-field values, which the text layer leaves out. Read them as text at their boxes. */
async function formItems(page,have){
 let an=[];try{an=await page.getAnnotations({intent:'display'})}catch{return[]}
 const out=[],seen=new Set((have||[]).map(it=>String(it.str||'').replace(/\s+/g,' ').trim()).filter(Boolean));
 for(const a of an||[]){
  if(!a||a.subtype!=='Widget'||a.hidden||a.noView||!a.rect||(a.fieldType!=='Tx'&&a.fieldType!=='Ch'))continue;
  let ls=Array.isArray(a.textContent)&&a.textContent.length?a.textContent:null;
  if(!ls){let v=a.fieldValue;if(Array.isArray(v))v=v.join(' ');if(typeof v!=='string')continue;ls=v.split(/\r\n|\r|\n/)}
  ls=ls.map(t=>String(t||'').replace(/\s+/g,' ').trim()).filter(Boolean);if(!ls.length)continue;
  const [x0,y0,x1,y1]=a.rect,H=Math.abs(y1-y0),top=Math.max(y0,y1),lh=Math.max(6,Math.min(14,H/ls.length));
  ls.forEach((t,i)=>{if(seen.has(t))return;seen.add(t);out.push({str:t,transform:[lh,0,0,lh,Math.min(x0,x1)+2,top-lh*(i+1)+lh*0.25],height:lh,width:Math.min(Math.abs(x1-x0),t.length*lh*0.5),form:true})});
 }
 return out;
}
async function pdfText(page,geoOut,yOff=0){
 let items=await textItems(page);const rows=[];
 const fi=await formItems(page,items);if(fi.length)items=items.concat(fi);
 if(geoOut)geoOut.push(...pdfGeo(items,yOff));
 for(const it of items){if(!it.str||!it.str.trim())continue;const y=it.transform[5],x=it.transform[4];let row=rows.find(r=>Math.abs(r.y-y)<Math.max(2,(it.height||8)*0.45));if(!row){row={y,items:[]};rows.push(row)}row.items.push({x,s:it.str,w:it.width||0})}
 rows.sort((a,b)=>b.y-a.y);
 return rows.map(r=>{r.items.sort((a,b)=>a.x-b.x);let out='',end=null;for(const i of r.items){if(end!=null)out+=(i.x-end>12?'   ':(i.x-end>1.5?' ':''));out+=i.s;end=i.x+i.w}return out}).join('\n');
}
/* extractFromFile(file,{onProgress,profileName}) → result (see parseCardText) */
async function extractFromFile(file,opts={}){
 polyfill();
 const cap=capabilities();
 try{return await extractInner(file,opts,cap)}
 catch(e){if(e&&e.friendly)throw e;throw new ScanError(friendlyError(e),e)}
}
async function extractInner(file,{onProgress=()=>{},profileName='',kind:credKind='CERT_BLS',debug=false}={},cap=capabilities()){
 let lastText='';
 const t0=performance.now();DocExtract._progress=(s,p)=>onProgress({stage:'ocr',label:s,progress:p});
 const kind=await sniff(file);const P={kind:credKind,profileName};
 if((kind==='pdf'&&!cap.pdf)||(kind==='image'&&!cap.image))return{supported:false,unsupportedReason:'browser',ms:Math.round(performance.now()-t0),fields:{},found:[],missing:(PROFILE_REQUIRED[profileFor(credKind)]||[]).slice(),profile:profileFor(credKind),kind:credKind,fieldsWanted:(PROFILE_FIELDS[profileFor(credKind)]||[]).slice(),warnings:['This browser can\'t read documents on the device (it is missing '+cap.missing.join(', ')+').']};
 if(kind==='other')return{supported:false,ms:Math.round(performance.now()-t0),fields:{},found:[],missing:(PROFILE_REQUIRED[profileFor(credKind)]||[]).slice(),profile:profileFor(credKind),kind:credKind,warnings:['Scanning works on PDF, PNG and JPEG files. Word documents can still be uploaded, but their details have to be typed.']};
 let res=null,rotated=false,canvas=null,qr=null;
 if(kind==='pdf'){
  onProgress({stage:'load',label:'Opening the PDF on this device',progress:0.05});
  const lib=await pdfjs();
  const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true,enableXfa:false}).promise;
  let text='';const geo=[];for(let p=1;p<=Math.min(doc.numPages,2);p++){text+=(await pdfText(await doc.getPage(p),geo,-p*5000))+'\n'}
  onProgress({stage:'qr',label:'Looking for the QR code',progress:0.4});
  const page=await doc.getPage(1),vp0=page.getViewport({scale:1}),k=Math.min(3,1800/Math.max(vp0.width,vp0.height)),vp=page.getViewport({scale:k});
  canvas=canvasOf(vp.width,vp.height);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,canvas,viewport:vp}).promise;
  qr=await decodeQr(canvas);
  if(text.replace(/\s/g,'').length>=40){res=parseCardText(text,{...P,method:'PDF_TEXT',qr,geo});lastText=text}
  /* v14.4: a text layer that explains less than half of what the document should show
     (an image with a footer, flattened artwork) gets read by OCR too; the better read wins */
  const need=r=>r?r.required.filter(k=>r.fields[k]||(k==='expires_on'&&r.fields.renew_by)).length:-1;
  if(!res||need(res)*2<res.required.length){
   onProgress({stage:'ocr',label:res?'Little text in this PDF. Reading it with OCR':'This PDF is a scan. Reading it with OCR',progress:0.5});
   const o=await ocr(canvas);const r2=parseCardText(o.text,{...P,method:'PDF_OCR',qr,ocrConf:o.conf,words:o.words,ocrLines:o.lines});
   if(!res||need(r2)>need(res)||(need(r2)===need(res)&&r2.found.length>res.found.length)){if(res)r2.textLayerThin=true;res=r2;lastText=o.text}
  }
  try{doc.destroy()}catch{}
 }else{
  onProgress({stage:'load',label:'Opening the image on this device',progress:0.05});
  canvas=await imageCanvas(file);
  onProgress({stage:'qr',label:'Looking for the QR code',progress:0.15});
  qr=await decodeQr(canvas);
  onProgress({stage:'ocr',label:'Reading the text (OCR)',progress:0.2});
  const o=await ocr(canvas);lastText=o.text;res=parseCardText(o.text,{...P,method:'IMAGE_OCR',qr,ocrConf:o.conf,words:o.words,ocrLines:o.lines});
  const good=r=>r.found.filter(k=>r.fieldsWanted.includes(k)).length;const enough=Math.min(3,res.fieldsWanted.length);
  if(good(res)<enough){for(const deg of [90,270,180]){onProgress({stage:'ocr',label:`Trying the image turned ${deg}°`,progress:0.6});const c2=rotate(canvas,deg);const o2=await ocr(c2);const r2=parseCardText(o2.text,{...P,method:'IMAGE_OCR',qr,ocrConf:o2.conf,words:o2.words,ocrLines:o2.lines});if(good(r2)>good(res)){res=r2;rotated=deg;lastText=o2.text}if(good(res)>=res.fieldsWanted.length-1)break}}
 }
 /* v14.3: an AHA card read by OCR without its eCard code gets a second look on a whitened copy */
 if(res&&res.method!=='PDF_TEXT'&&res.profile==='aha_resus'&&!res.fields.credential_id&&canvas){
  onProgress({stage:'ocr',label:'Looking again for the eCard code',progress:0.85});
  const base=rotated?rotate(canvas,rotated):canvas;
  /* 1) just the strip under the "eCard Code" label, whitened and enlarged */
  const B=res.notes&&res.notes._ecardBox;
  if(B){
   const lw=B.x1-B.x0,x0=Math.max(0,B.x0-lw*0.6),x1=Math.min(base.width,B.x1+lw*0.6),y0=Math.max(0,B.y1+B.H*0.05),y1=Math.min(base.height,B.y1+B.H*2.4);
   if(x1-x0>4&&y1-y0>4){
    const k=Math.max(1,Math.min(3,60/B.H)),pad=20,cc=canvasOf((x1-x0)*k+pad*2,(y1-y0)*k+pad*2),cx=cc.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,cc.width,cc.height);cx.imageSmoothingQuality='high';cx.drawImage(base,x0,y0,x1-x0,y1-y0,pad,pad,(x1-x0)*k,(y1-y0)*k);
    const o4=await ocr(whiten(cc));
    const ws=(o4.lines||[]).flat().filter(w=>/[A-Za-z0-9]/.test(w.t));
    const cand=parseEcardStrip(ws,res);
    if(cand){res.fields.credential_id=cand;delete res.notes.credential_id;res.found=FIELDS.filter(k=>res.fields[k]);res.missing=res.missing.filter(k=>k!=='credential_id');res.secondLook='strip';
     if(cand.type==='ALNUM'&&res.issuer==='AHA')res.issuer='AHA_RQI';const sid=suggestedSource(res.kind,res.issuer,cand.value);if(sid&&res.source&&res.source.how==='issuer on the document')res.source={id:sid,how:'issuer on the document'}}
   }
  }
 }
 if(res&&res.method!=='PDF_TEXT'&&res.profile==='aha_resus'&&!res.fields.credential_id&&canvas){
  /* 2) the whole page, whitened */
  const base=rotated?rotate(canvas,rotated):canvas;const o3=await ocr(whiten(base));
  const r3=parseCardText(o3.text,{...P,method:res.method,qr,ocrConf:o3.conf,words:o3.words,ocrLines:o3.lines});
  const n=r=>r.found.length+Object.keys(r.fields).filter(k=>!r.found.includes(k)).length;
  if(r3.fields.credential_id&&n(r3)>=n(res)-1){r3.secondLook=true;res=r3;lastText=o3.text}
 }
 if(res&&res.notes)delete res.notes._ecardBox;
 onProgress({stage:'done',label:'Checking the details',progress:1});
 if(debug)res.text=lastText;/* debug only: raw text is never stored or sent */
 res.supported=true;res.rotated=rotated;res.ms=Math.round(performance.now()-t0);res.fileKind=kind;res.qrPayloadKind=qr?(/heart\.org/i.test(qr)?'aha':'other'):null;
 res.expiry=documentExpiry(res.fields,res.issuer);
 return res;
}
/* best eCard-code token in an OCR'd strip: 12 digits (AHA) or letters+digits (RQI), never a TC-ID shape */
function parseEcardStrip(ws,res){
 const tcid=res.fields.training_center_id&&res.fields.training_center_id.value;
 for(const w of ws){
  const n=normCode(w.t);if(!n||n.odd||TC_ID_SHAPE.test(n.code)||n.code===tcid)continue;
  if(n.type!=='AHA'&&!(n.type==='ALNUM'&&n.code.length>=8))continue;
  const c=Math.min(OCR_CAP,(w.c==null?0.8:w.c)+LABEL_BONUS);
  return{value:n.code,conf:clamp(c,0,OCR_CAP),how:'value under the label (second look)',type:n.type};
 }
 return null;
}
async function terminate(){if(workerP){try{(await workerP).terminate()}catch{}workerP=null}}

const DocExtract={INFO_FIELDS,NIHSS_INFO_FIELDS,NIHSS_UNDETERMINED,nihssIssuer,ECARD_NOT_FOUND,TC_ID_NOTE,ahaLabelValues,capabilities,friendlyError,polyfill,ScanError,FIELDS,FIELD_LABEL,REQUIRED_FIELDS,PROFILE_FIELDS,PROFILE_REQUIRED,ID_LABELS,COURSE_PATTERNS,profileFor,detectKinds,detectSource,kindPattern,COURSE_KIND,KIND_COURSE,parseCardText,compareToEntered,documentExpiry,interpretRenewal,renewToExpiry,namesMatch,normCode,codeFromQr,suggestedSource,extractFromFile,terminate,_progress:null};
root.DocExtract=DocExtract;
if(typeof module!=='undefined'&&module.exports)module.exports=DocExtract;
})(typeof window!=='undefined'?window:globalThis);
