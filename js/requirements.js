/* Newcomer onboarding requirement evaluation (clinician Home baseline). */
function reqSatisfied(c){if(!c.required)return true;if(c.primary!=='VERIFIED'||!c.prov?.active)return false;if(c.privateOnly)return true;return c.chain==='ACCEPTED'}
function onboarding(){const req=creds.filter(c=>c.required),ok=req.filter(reqSatisfied).length,pct=req.length?Math.round(ok/req.length*100):0;return{req,ok,pct,ready:req.length>0&&ok===req.length}}
