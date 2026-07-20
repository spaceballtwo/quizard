// Live spoof-proof test: device A starts a test; device B (same account) asks Sage anyway.
const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
const WSURL = 'wss://quizard-server.quizard.workers.dev';
const HTTP = 'https://quizard-server.quizard.workers.dev/tutor';
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket(WSURL); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg){ return new Promise(res=>{ ws.once('message', raw=>res(JSON.parse(raw))); ws.send(JSON.stringify(msg)); }); }
async function post(body){ const r=await fetch(HTTP,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); return {s:r.status, d:await r.json()}; }
setTimeout(()=>{ console.error('WATCHDOG: stuck'); process.exit(1); }, 120000);
(async () => {
  console.log('connecting…');
  const A = await connect();
  console.log('connected');
  const reg = await ask(A, {t:'register', name:'SpoofKid', pass:'secretsecret', auto:true});
  await ask(A, {t:'coach_consent'});
  const msg = { name:reg.name, token:reg.token, context:{general:true, progress:'Skill 4/10.'}, messages:[{role:'user', content:'hint?'}] };

  let r = await post(msg);
  console.log('before test:', r.s, r.s===200?'Sage answers ✓':JSON.stringify(r.d));

  await ask(A, {t:'assess_start', mins:5});
  r = await post(msg);                                          // "the phone in the other hand"
  console.log('during test (2nd device):', r.s, r.d.error, r.s===403&&r.d.error==='assessment'?'✓ SERVER BLOCKS':'✗ FAILED');

  await ask(A, {t:'assess_end'});
  r = await post(msg);
  console.log('after test:', r.s, r.s===200?'Sage back ✓':JSON.stringify(r.d));
  A.close();
  process.exit(0);
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
