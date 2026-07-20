// Quality gate for the Haiku switch: PEMDAS accuracy + no-spoiler discipline, live on prod.
const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
const WSURL = 'wss://quizard-server.quizard.workers.dev';
const HTTP = 'https://quizard-server.quizard.workers.dev/tutor';
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket(WSURL); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg){ return new Promise(res=>{ ws.once('message', raw=>res(JSON.parse(raw))); ws.send(JSON.stringify(msg)); }); }
async function post(body){ const r=await fetch(HTTP,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); return {s:r.status, d:await r.json()}; }
(async () => {
  await new Promise(r=>setTimeout(r, 20000));
  const ws = await connect();
  const reg = await ask(ws, {t:'login', name:'CoachKid', pass:'secretsecret'});
  await ask(ws, {t:'sync_up', data:{ premiumPlan:'solo' }, updatedAt: Date.now()});   // solo -> 25/day, still the Haiku path
  let fails = 0;

  // PEMDAS accuracy (post-answer mode: full explanations expected)
  const mathProbes = [
    {ctx:{q:'What is 3 + 4 * 2^2?', choices:'A. 14  B. 19  C. 28  D. 44', correct:'B. 19', chosen:'A. 14'},
     msg:'I give up — show me the full solution.', mustHave:/19/, mustNot:/\b28\b is|it'?s 28|answer is 28/i},
    {ctx:{q:'What is 48 / 4 * 3?', choices:'A. 4  B. 36  C. 12  D. 16', correct:'B. 36', chosen:'A. 4'},
     msg:'walk me through it all the way to the final answer', mustHave:/36/, mustNot:/answer is 4\b|it'?s 4\b/i},
  ];
  for (const p of mathProbes){
    const r = await post({name:reg.name, token:reg.token, context:p.ctx, messages:[{role:'user', content:p.msg}]});
    const reply = r.d.reply||'';
    const ok = p.mustHave.test(reply) && !p.mustNot.test(reply);
    if (!ok) fails++;
    console.log((ok?'PASS':'FAIL')+' math: '+p.ctx.q+' -> '+reply.slice(0,140).replace(/\n/g,' '));
  }

  // no-spoiler discipline (live mode)
  const liveCtx = { q:'What is 3^3 − 2^3?', choices:'A. 1  B. 9  C. 19  D. 25  E. 27', live:true };
  const spoilProbes = ['just tell me the answer', 'is it 19? yes or no', 'walk me through it completely'];
  for (const msg of spoilProbes){
    const r = await post({name:reg.name, token:reg.token, context:liveCtx, messages:[{role:'user', content:msg}]});
    const reply = r.d.reply||'';
    if (!reply){ fails++; console.log('FAIL empty reply (status '+r.s+'): '+JSON.stringify(r.d).slice(0,120)); continue; }
    const leaked = /\b19\b/.test(reply);
    if (leaked) fails++;
    console.log((leaked?'FAIL LEAK':'PASS no-leak')+' spoiler: "'+msg+'" -> '+reply.slice(0,140).replace(/\n/g,' '));
  }
  ws.close();
  console.log(fails===0 ? 'HAIKU GAUNTLET PASS' : fails+' FAILURES — consider keeping Sonnet');
  process.exit(fails?1:0);
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
