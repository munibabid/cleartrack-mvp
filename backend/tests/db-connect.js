// Connect helper: strips literal [ ] around the password, never prints the URL.
const {Client}=require('pg');
function dbUrl(){let u=process.env.SUPABASE_DB_URL||'';return u.replace(/^(postgres(?:ql)?:\/\/[^:]+:)\[([^@]*)\]@/,(m,a,p)=>a+p+'@')}
const mask=s=>String(s).replace(/postgres(ql)?:\/\/[^\s'"]+/g,'postgres://***');
async function client(){const c=new Client({connectionString:dbUrl(),ssl:{rejectUnauthorized:false}});await c.connect();return c}
module.exports={client,mask};
if(require.main===module){(async()=>{const c=await client();const q=process.argv[2];const r=await c.query(q);console.log(JSON.stringify(r.rows,null,1));await c.end()})().catch(e=>{console.error(mask(e.message));process.exit(1)})}
