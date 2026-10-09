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
const FIELD_LABEL={holder_name:'Name on the document',credential_id:'Certificate / card ID',course:'Credential on the document',issued_on:'Issue / completion date',renew_by:'Recommended renewal (month/year)',expires_on:'Expiration date',training_center:'Training center',jurisdiction:'State',multistate:'Multistate (compact)'};
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
 if(digits>=9){const f=fx.replace(/\D/g,'');if(f.length===12)return{code:f,type:'AHA'};if(f.length>=10&&f.length<=14)return{code:f,type:'AHA',odd:true}}
 if(/^[A-Z0-9]{6,20}$/.test(s)&&/[A-Z]/.test(s)&&/\d/.test(s))return{code:s,type:'ALNUM'};
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
  while((m=reNum.exec(line))){const y=+m[3],mo=+m[1],d=+m[2];if(validDate(y,mo,d))full.push({li,pos:m.index,iso:iso(y,mo,d),raw:m[0]});rest=rest.replace(m[0],' '.repeat(m[0].length))}
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

const NAME_STOP=/\b(provider|american|heart|association|red\s*cross|issue|issued|date|renew|renewal|recommended|training|center|centre|instructor|ecard|e-card|code|course|card|completion|certificate|certification|basic|life|support|advanced|cardiovascular|pediatric|successfully|completed|curriculum|program|valid|expires?|cpr|aed|bls|acls|pals|heartcode|location|holder|student|name|has|the|of|and|in|for|this|with|accordance|evaluations?|cognitive|skills?)\b/i;
function cleanName(s){
 let t=String(s||'').replace(/,?\s+\b(RN|R\.N\.|BSN|MSN|LPN|LVN|APRN|NP|CNM|CRNA|DNP|PhD|CCRN|CEN|MBA|MPH)\b[\s,A-Z\-]*$/,'').replace(/[^A-Za-z\u00C0-\u024F'’.\- ]+/g,' ').replace(/\s+/g,' ').trim();
 t=t.replace(/^(mr|mrs|ms|dr)\.?\s+/i,'');
 const words=t.split(' ').filter(w=>w.replace(/[^A-Za-z\u00C0-\u024F]/g,'').length>0);
 if(words.length<2||words.length>5)return null;
 if(words.some(w=>NAME_STOP.test(w)))return null;
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
const PROFILE_FIELDS={aha_resus:['holder_name','credential_id','course','issued_on','renew_by','training_center'],license:['holder_name','credential_id','jurisdiction','multistate','issued_on','expires_on'],cert:['holder_name','credential_id','course','issued_on','expires_on'],record:['holder_name','issued_on','expires_on'],dates_only:['issued_on','expires_on']};
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
const RE_EXP=/renew|expir|ex[pb]\w{0,2}r\w{0,2}ation|valid\s*(until|through|thru|to)|exp\.?\s*date|\bdue\b|recertif|good\s+through|valid\s+for|next\s*(test|due)/i;
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
 if(!issue&&sorted.length&&(renewMy||exp||sorted.length===1))issue=sorted.find(d=>d!==exp)||null;
 if(!issue&&sorted.length>=2){issue=sorted[0];if(!exp)exp=sorted[sorted.length-1]}
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
   if(!aha&&/^[A-Z]{0,4}-?\d{4,14}[A-Z0-9-]*$/.test(raw))return{code:raw,type:/^\d+$/.test(raw)?'NUM':'ALNUM',how:'label'};
   const n=normCode(tok);if(n)return{...n,how:'label'};
  }
 }
 if(allowBare12){const m=/(?<![\dA-Za-z])(\d{12})(?![\dA-Za-z])/.exec(flat.replace(/(\d{4}) (\d{4}) (\d{4})/g,'$1$2$3'));if(m)return{code:m[1],type:'AHA',how:'pattern'}}
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
 if(!name&&profileName){const re=new RegExp(profileName.trim().split(/\s+/).map(w=>w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[\\s\\S]{0,4}'),'i');const m=re.exec(flat);if(m){name=cleanName(m[0]);how='matches your profile name'}}
 return name?{name,how}:null;
}
function findJurisdiction(flat,jurisdictions){
 const js=jurisdictions||_globals().jurisdictions;let best=null;
 for(const j of js){
  const nm=String(j.name||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(!nm)continue;
  const strong=new RegExp('(state\\s+of\\s+'+nm+'|'+nm+'\\s+(state\\s+)?board\\s+of\\s+(registered\\s+)?nursing|'+nm+'\\s+board|board\\s+of\\s+nursing[^\\n]{0,12}'+nm+'|commonwealth\\s+of\\s+'+nm+')','i');
  const m=strong.exec(flat);if(m&&(!best||best.weak||m.index<best.i))best={code:j.code,name:j.name,i:m.index,weak:false};
  if(!best){const w=new RegExp('\\b'+nm+'\\b','i').exec(flat);if(w)best={code:j.code,name:j.name,i:w.index,weak:true}}
 }
 if(!best||best.weak){/* letter-spaced headings ("T E X A S  B O A R D") lose their spaces in PDF text */
  const ns=flat.replace(/\s+/g,'').toUpperCase();
  for(const j of js){const n=String(j.name||'').replace(/\s+/g,'').toUpperCase();if(!n)continue;const i=Math.min(...[ns.indexOf('STATEOF'+n),ns.indexOf(n+'BOARD'),ns.indexOf(n+'STATEBOARD')].map(x=>x<0?1e9:x));if(i<1e9&&(!best||best.weak||i<best.i))best={code:j.code,name:j.name,i,weak:false}}
 }
 return best;
}

/* The parser. `words` (optional) maps OCR tokens → confidence 0..1. */
function parseCardText(text,{kind='CERT_BLS',method='PDF_TEXT',qr=null,ocrConf=null,words=null,profileName='',catalog=null,sources=null,jurisdictions=null}={}){
 const lines=toLines(text),flat=lines.join('\n'),profile=profileFor(kind,catalog);
 const base=method==='PDF_TEXT'?0.98:clamp((ocrConf==null?80:ocrConf)/100,0.3,0.97);
 const tokConf=v=>{
  if(method==='PDF_TEXT'||!words)return base;
  const toks=String(v).toLowerCase().split(/[\s\/\-]+/).map(t=>t.replace(/[^a-z0-9]/g,'')).filter(Boolean);
  const cs=toks.map(t=>words[t]).filter(x=>x!=null);
  return cs.length?clamp(cs.reduce((a,b)=>a+b,0)/cs.length,0.2,0.97):base*0.9;
 };
 const f={};const warnings=[];const want=PROFILE_FIELDS[profile];
 // ---- issuer / suggested registry source ----
 let issuer=null,source=null;
 if(profile==='aha_resus'){
  issuer=/red\s*cross/i.test(flat)?'RED_CROSS':/\bRQI\b|heartcode\s*complete|rqi1stop/i.test(flat)?'AHA_RQI':/american\s*heart|heart\.org|\bAHA\b/i.test(flat)?'AHA':null;
 }else if(profile!=='dates_only'&&profile!=='license'){source=detectSource(flat,kind,sources);issuer=source?source.id:null}
 // ---- which credential the document is ----
 if(profile==='aha_resus'){
  const title=/\b(BLS|ACLS|PALS)\s*(Provider|Instructor)\b/i.exec(flat);
  let course=null,courseHow='';
  if(title){course=title[1].toUpperCase();courseHow=title[0]}
  else{const longs=[[/basic\s+l\w{2,4}\s+su\w*port/i,'BLS'],[/advanced\s+cardio\w*\s+life/i,'ACLS'],[/pediatric\s+advanced\s+l\w{2,4}|\b[a-z]{3,9}i[ct]\s+advanced\s+l\w{2,4}\s+su/i,'PALS'],[/advanced\s+life\s+support/i,'ACLS']].map(([re,c],ix)=>({c,i:flat.search(re),generic:ix===3})).filter(x=>x.i>=0).sort((a,b)=>(a.generic-b.generic)||(a.i-b.i));
   if(longs.length){course=longs[0].c;courseHow='full course name'}else{const ab=/\b(BLS|ACLS|PALS)\b/.exec(flat);if(ab){course=ab[1];courseHow='abbreviation'}}}
  if(course){const instr=/instructor/i.test(courseHow);f.course={value:course+(instr?' Instructor':' Provider'),conf:clamp(tokConf(course)*(courseHow==='abbreviation'?0.85:1)),how:courseHow};if(instr)warnings.push('This looks like an instructor card, not a provider card.')}
 }else if(profile==='cert'){
  const found=detectKinds(flat,catalog);const self=found.find(x=>x.kind===kind);const top=self||found[0];
  if(top){const cat=(catalog||_globals().catalog).find(k=>k.kind===top.kind);f.course={value:cat?.short||top.short,conf:clamp(tokConf(top.short)*(self?1:0.9)),how:self?'names this credential':'names a different credential',kind:top.kind}}
 }
 // ---- dates ----
 const {issue,exp,renewMy}=pickDates(lines,{monthYearOk:profile==='aha_resus'||profile==='cert'});
 if(issue&&want.includes('issued_on'))f.issued_on={value:issue.iso,conf:clamp(tokConf(issue.raw)*(labelNear(lines,issue.li,RE_ISSUE)!=null?1:0.85)*(issue.garbled?0.6:1)),how:issue.garbled?'date (damaged print, check it)':'date'};
 if(profile==='aha_resus'){
  if(renewMy)f.renew_by={value:renewMy.ym,conf:clamp(tokConf(renewMy.raw)*(labelNear(lines,renewMy.li,RE_EXP)!=null?1:0.85)),how:'month/year'};
  else if(exp&&exp!==issue)f.renew_by={value:exp.iso.slice(0,7),conf:clamp(tokConf(exp.raw)*0.95),how:'full date',exact:exp.iso};
  if(f.issued_on&&f.renew_by&&issuer!=='RED_CROSS'){
   const w2=addMonths(f.issued_on.value,24);
   if(w2===f.renew_by.value){f.issued_on.conf=clamp(f.issued_on.conf+0.03);f.renew_by.conf=clamp(f.renew_by.conf+0.03)}
   else{f.issued_on.conf*=0.8;f.renew_by.conf*=0.8;warnings.push(`The renewal month (${f.renew_by.value}) is not two years after the issue date (${f.issued_on.value}). AHA cards renew two years after issue.`)}
  }
 }else if(exp&&exp!==issue)f.expires_on={value:exp.iso,conf:clamp(tokConf(exp.raw)*(labelNear(lines,exp.li,RE_EXP)!=null?1:0.85)*(exp.garbled?0.6:1)),how:exp.garbled?'date (damaged print, check it)':'date'};
 else if(renewMy&&profile==='cert')f.expires_on={value:renewToExpiry(renewMy.ym),conf:clamp(tokConf(renewMy.raw)*0.9),how:'month/year → end of month',monthOnly:renewMy.ym};
 if(f.issued_on&&f.expires_on&&f.expires_on.value<=f.issued_on.value){warnings.push('The expiration date is not after the issue date.');f.expires_on.conf*=0.7}
 // ---- credential ID ----
 if(want.includes('credential_id')){
  const reLbl=profile==='license'?/(license|licence|lic\.?|registration|certificate)\s*(number|no\.?|#|num)|\bRN\s*(#|no\.?|number)/i
   :profile==='aha_resus'?/e\s*-?\s*card\s*(?:code|c0de)|certificate\s*(?:id|#|number|no\.?)|cert(?:ificate)?\s*code|card\s*(?:code|id)/i
   :/(e\s*-?\s*card|cert\w*|card|test|credential|verification|member|candidate|course\s*completion)\s*(id|#|number|no\.?|code|num)/i;
  let code=findId(lines,flat,reLbl,{allowBare12:profile==='aha_resus',aha:profile==='aha_resus'});
  if(!code&&profile==='license'){const m=/\b(RN|R\.N\.)\s*[-#:]?\s*(\d{5,10})\b/.exec(flat);if(m)code={code:'RN'+m[2],type:'ALNUM',how:'pattern'}}
  const q=codeFromQr(qr);
  if(code||q){
   let conf=code?tokConf(code.code)*(code.how==='label'?1:0.8):0.97;let how=code?code.how:'qr';
   if(code&&code.odd&&profile==='aha_resus'){conf*=0.6;warnings.push(`The eCard code read as ${code.code.length} digits; AHA codes have 12.`)}
   if(code&&q){if(q.code===code.code)conf=0.995;else if(profile==='aha_resus'){warnings.push('The code printed on the card and the code in its QR code differ. The QR code was used.');code=q;conf=0.9;how='qr'}}
   else if(!code){code=q}
   if(profile==='aha_resus'&&code.type==='AHA'&&code.code.length===12&&f.issued_on){if(code.code.slice(0,2)===f.issued_on.value.slice(2,4))conf=clamp(conf+0.02);else{conf*=0.85;warnings.push(`The eCard code starts with ${code.code.slice(0,2)}, but AHA codes start with the last two digits of the issue year (${f.issued_on.value.slice(2,4)}).`)}}
   if(profile==='aha_resus'&&code.type==='ALNUM'&&issuer==='AHA')issuer='AHA_RQI';
   f.credential_id={value:code.code,conf:clamp(conf),how};
  }
 }
 // ---- license specifics ----
 if(profile==='license'){
  const j=findJurisdiction(flat,jurisdictions);if(j)f.jurisdiction={value:j.code,conf:clamp(tokConf(j.name)*(j.weak?0.75:1)),how:j.weak?'state name':'issuing board'};
  if(/(not|non)[\s-]*(valid\s+for\s+)?multi-?\s?state|single[\s-]*state/i.test(flat))f.multistate={value:'single-state',conf:clamp(base*0.95),how:'wording'};
  else if(/multi-?\s?state|compact\s+(license|privilege)|\bNLC\b/i.test(flat))f.multistate={value:'multistate',conf:clamp(base*0.95),how:'wording'};
 }
 // ---- holder name ----
 if(want.includes('holder_name')){const n=findName(lines,flat,{profileName});if(n)f.holder_name={value:n.name,conf:clamp(tokConf(n.name)*(n.how==='label'||n.how.startsWith('before')?1:0.85)),how:n.how}}
 // ---- training center (AHA) ----
 if(want.includes('training_center'))for(let i=0;i<lines.length;i++){
  const m=/tr\w{1,4}ing\s*(?:c\w{2,4}r|centre|site)(?:\s*na\w{1,2}e)?\s*[:#\-]?\s*(.*)$/i.exec(lines[i]);if(!m)continue;
  const clean=s=>String(s||'').replace(/\b(TC\s*ID|TC\s*Info|Course\s*Location|Instructor.*|eCard.*|Phone.*|ID\s*#?).*$/i,'').split(/\s*[\[\]=|{}<>©®«»*_~]|\s{3,}/)[0].replace(/^[\s:#\-]+|[\s,;:#\-.]+$/g,'').trim();
  let v=clean(m[1]);if(v.length<3||/^(name|id|info)$/i.test(v))v=clean(lines[i+1]);
  v=v.split(' ').filter((w,ix,a)=>!(ix===a.length-1&&w.length<=2&&!/^[A-Z]{2}$/.test(w))).join(' ');
  if(v.length>=3&&/[A-Za-z]{3,}/.test(v)&&!/^(TC|ID|Instructor|Course)/i.test(v)){f.training_center={value:v.slice(0,90),conf:clamp(tokConf(v)*0.92),how:'label'};break}
 }
 const fieldsFound=FIELDS.filter(k=>f[k]);
 const required=PROFILE_REQUIRED[profile];
 const missing=required.filter(k=>!f[k]&&!(k==='expires_on'&&f.renew_by));
 if(!source&&profile==='aha_resus'){const sid=suggestedSource(kind,issuer,f.credential_id?.value);source=sid?{id:sid,how:'issuer on the document'}:null}
 if(!source&&profile!=='dates_only'){const r=_routeFor(kind,f.jurisdiction?.value,sources);if(r)source={id:r.id,name:r.name,how:'registry route for this credential type'}}
 return{fields:f,issuer,source,profile,kind,method,warnings,found:fieldsFound,missing,score:fieldsFound.filter(k=>required.includes(k)||k==='credential_id').length,qrFound:!!codeFromQr(qr),textChars:flat.length,fieldsWanted:want,required};
}
function _routeFor(kind,jur,sources){
 if(!sources&&typeof primaryRouteFor==='function'){try{return primaryRouteFor(kind,jur||'')}catch{return null}}
 const list=(sources||[]).filter(s=>s.kinds&&s.kinds.includes(kind)&&s.status==='APPROVED');return list[0]||null;
}

/* Expiration the document implies, with how it was read. */
function documentExpiry(fields,issuer){
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
function compareToEntered(values,{kind,expires_on,profileName,issuer,jurisdiction,catalog=null}={}){
 const out=[];const profile=profileFor(kind,catalog);
 const exp=documentExpiry({expires_on:values.expires_on?{value:values.expires_on,monthOnly:values.expires_month_only||null}:null,renew_by:values.renew_by?{value:values.renew_by,exact:values.renew_exact}:null},issuer);
 if(exp&&expires_on&&exp.value!==expires_on){
  const days=Math.round((Date.parse(expires_on)-Date.parse(exp.value))/864e5);
  out.push({field:'expires_on',severity:'mismatch',document:exp.value,entered:expires_on,days,text:`Expiration doesn't match the document: you entered ${_fmtD(expires_on)}, the document shows ${_fmtD(exp.value)} (${Math.abs(days)} day${Math.abs(days)===1?'':'s'} ${days<0?'earlier':'later'}).`,fix:'use-doc-date'});
 }else if(exp&&!expires_on)out.push({field:'expires_on',severity:'info',document:exp.value,entered:null,text:`No expiration entered. The document shows ${_fmtD(exp.value)}.`,fix:'use-doc-date'});
 if(exp&&exp.value<new Date().toISOString().slice(0,10))out.push({field:'expired',severity:'mismatch',document:exp.value,text:`The document shows this expired on ${_fmtD(exp.value)}.`});
 if(profile!=='dates_only'&&values.holder_name&&profileName){const m=namesMatch(values.holder_name,profileName);if(m===false)out.push({field:'holder_name',severity:'mismatch',document:values.holder_name,entered:profileName,text:`Name on the document (${values.holder_name}) doesn't match your profile name (${profileName}).`})}
 if(profile==='aha_resus'&&values.course&&KIND_COURSE[kind]){const c=String(values.course).toUpperCase().split(/\s/)[0];if(c!==KIND_COURSE[kind])out.push({field:'course',severity:'mismatch',document:values.course,entered:KIND_COURSE[kind],text:`The document is a ${values.course} card, but this credential is ${KIND_COURSE[kind]}.`})}
 if(profile==='cert'&&values.course){const cat=(catalog||_globals().catalog);const me=cat.find(k=>k.kind===kind);const re=me&&kindPattern(me);if(re&&!re.test(values.course)){const other=cat.find(k=>k.category==='Certifications'&&k.kind!==kind&&kindPattern(k)?.test(values.course));if(other)out.push({field:'course',severity:'mismatch',document:values.course,entered:me.short||kind,text:`The document is for ${values.course}, but this credential is ${me.short||kind}.`})}}
 if(profile==='aha_resus'&&values.credential_id&&values.issued_on&&/^\d{12}$/.test(values.credential_id)&&values.credential_id.slice(0,2)!==values.issued_on.slice(2,4))out.push({field:'credential_id',severity:'mismatch',document:values.credential_id,text:`The eCard code should start with the issue year (${values.issued_on.slice(2,4)}), but it starts with ${values.credential_id.slice(0,2)}.`});
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
let pdfjsP=null;
function pdfjs(){if(!pdfjsP)pdfjsP=import(abs(VENDOR+'pdfjs-6.4.299/pdf.min.mjs')).then(m=>{m.GlobalWorkerOptions.workerSrc=abs(VENDOR+'pdfjs-6.4.299/pdf.worker.min.mjs');return m}).catch(e=>{pdfjsP=null;throw e});return pdfjsP}
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
 const words={};
 (r.data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>(l.words||[]).forEach(wd=>{const t=String(wd.text||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(t)words[t]=Math.max(words[t]||0,(wd.confidence||0)/100)}))));
 return{text:r.data.text||'',conf:r.data.confidence,words};
}
async function pdfText(page){
 const tc=await page.getTextContent();const rows=[];
 for(const it of tc.items){if(!it.str||!it.str.trim())continue;const y=it.transform[5],x=it.transform[4];let row=rows.find(r=>Math.abs(r.y-y)<Math.max(2,(it.height||8)*0.45));if(!row){row={y,items:[]};rows.push(row)}row.items.push({x,s:it.str,w:it.width||0})}
 rows.sort((a,b)=>b.y-a.y);
 return rows.map(r=>{r.items.sort((a,b)=>a.x-b.x);let out='',end=null;for(const i of r.items){if(end!=null)out+=(i.x-end>12?'   ':(i.x-end>1.5?' ':''));out+=i.s;end=i.x+i.w}return out}).join('\n');
}
/* extractFromFile(file,{onProgress,profileName}) → result (see parseCardText) */
async function extractFromFile(file,{onProgress=()=>{},profileName='',kind:credKind='CERT_BLS',debug=false}={}){
 let lastText='';
 const t0=performance.now();DocExtract._progress=(s,p)=>onProgress({stage:'ocr',label:s,progress:p});
 const kind=await sniff(file);const P={kind:credKind,profileName};
 if(kind==='other')return{supported:false,ms:Math.round(performance.now()-t0),fields:{},found:[],missing:(PROFILE_REQUIRED[profileFor(credKind)]||[]).slice(),profile:profileFor(credKind),kind:credKind,warnings:['Scanning works on PDF, PNG and JPEG files. Word documents can still be uploaded, but their details have to be typed.']};
 let res=null,rotated=false,canvas=null,qr=null;
 if(kind==='pdf'){
  onProgress({stage:'load',label:'Opening the PDF on this device',progress:0.05});
  const lib=await pdfjs();
  const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true,enableXfa:false}).promise;
  let text='';for(let p=1;p<=Math.min(doc.numPages,2);p++){text+=(await pdfText(await doc.getPage(p)))+'\n'}
  onProgress({stage:'qr',label:'Looking for the QR code',progress:0.4});
  const page=await doc.getPage(1),vp0=page.getViewport({scale:1}),k=Math.min(3,1800/Math.max(vp0.width,vp0.height)),vp=page.getViewport({scale:k});
  canvas=canvasOf(vp.width,vp.height);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,canvas,viewport:vp}).promise;
  qr=await decodeQr(canvas);
  if(text.replace(/\s/g,'').length>=40){res=parseCardText(text,{...P,method:'PDF_TEXT',qr});lastText=text}
  else{onProgress({stage:'ocr',label:'This PDF is a scan. Reading it with OCR',progress:0.5});const o=await ocr(canvas);lastText=o.text;res=parseCardText(o.text,{...P,method:'PDF_OCR',qr,ocrConf:o.conf,words:o.words})}
  try{doc.destroy()}catch{}
 }else{
  onProgress({stage:'load',label:'Opening the image on this device',progress:0.05});
  canvas=await imageCanvas(file);
  onProgress({stage:'qr',label:'Looking for the QR code',progress:0.15});
  qr=await decodeQr(canvas);
  onProgress({stage:'ocr',label:'Reading the text (OCR)',progress:0.2});
  const o=await ocr(canvas);lastText=o.text;res=parseCardText(o.text,{...P,method:'IMAGE_OCR',qr,ocrConf:o.conf,words:o.words});
  const good=r=>r.found.filter(k=>r.fieldsWanted.includes(k)).length;const enough=Math.min(3,res.fieldsWanted.length);
  if(good(res)<enough){for(const deg of [90,270,180]){onProgress({stage:'ocr',label:`Trying the image turned ${deg}°`,progress:0.6});const c2=rotate(canvas,deg);const o2=await ocr(c2);const r2=parseCardText(o2.text,{...P,method:'IMAGE_OCR',qr,ocrConf:o2.conf,words:o2.words});if(good(r2)>good(res)){res=r2;rotated=deg;lastText=o2.text}if(good(res)>=res.fieldsWanted.length-1)break}}
 }
 onProgress({stage:'done',label:'Checking the details',progress:1});
 if(debug)res.text=lastText;/* debug only: raw text is never stored or sent */
 res.supported=true;res.rotated=rotated;res.ms=Math.round(performance.now()-t0);res.fileKind=kind;res.qrPayloadKind=qr?(/heart\.org/i.test(qr)?'aha':'other'):null;
 res.expiry=documentExpiry(res.fields,res.issuer);
 return res;
}
async function terminate(){if(workerP){try{(await workerP).terminate()}catch{}workerP=null}}

const DocExtract={FIELDS,FIELD_LABEL,REQUIRED_FIELDS,PROFILE_FIELDS,PROFILE_REQUIRED,ID_LABELS,COURSE_PATTERNS,profileFor,detectKinds,detectSource,kindPattern,COURSE_KIND,KIND_COURSE,parseCardText,compareToEntered,documentExpiry,interpretRenewal,renewToExpiry,namesMatch,normCode,codeFromQr,suggestedSource,extractFromFile,terminate,_progress:null};
root.DocExtract=DocExtract;
if(typeof module!=='undefined'&&module.exports)module.exports=DocExtract;
})(typeof window!=='undefined'?window:globalThis);
