/* Assignment readiness: does the passport satisfy an assignment's requirements
   for the full assignment duration? XRPL proof is NOT required here. */
function v81Match(req,c){if(c.primary!=='VERIFIED'||!c.prov?.active)return false;if(req.type==='RN_LICENSE')return(c.type==='RN_LICENSE'||String(c.type).startsWith('RN_'))&&c.jurisdiction===req.jurisdiction;return c.type===req.type}
function v81Assignment(a){let ok=0,missing=[];a.reqs.forEach(r=>{const c=creds.find(x=>v81Match(r,x));if(!c){missing.push(r.label);return}const exp=c.official_expiration_date||c.expiration;if(exp&&a.end&&new Date(exp)<new Date(a.end)){missing.push(r.label+' — renew before submission');return}ok++});return{ok,total:a.reqs.length,missing,ready:missing.length===0}}
function v7Readiness(){
 const req=creds.filter(c=>c.required),ok=req.filter(c=>c.primary==='VERIFIED'&&c.prov?.active).length;
 return req.length?Math.round(ok/req.length*100):0
}
function v7ReqMatch(type){
 const c=creds.find(x=>x.type===type);return !!(c&&c.primary==='VERIFIED'&&c.prov?.active)
}
