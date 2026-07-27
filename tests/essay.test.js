const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket('wss://quizard-server.quizard.workers.dev'); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg){ return new Promise(res=>{ ws.once('message', raw=>res(JSON.parse(raw))); ws.send(JSON.stringify(msg)); }); }
async function post(body){ const r=await fetch('https://quizard-server.quizard.workers.dev/essay',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); return {s:r.status, d:await r.json()}; }
setTimeout(()=>{ console.error('WATCHDOG'); process.exit(1); }, 150000);
(async () => {
  await new Promise(r=>setTimeout(r, 18000));
  const ws = await connect();
  const reg = await ask(ws, {t:'login', name:'QuizardDemo', pass:'WizardHat2026'});
  const essay = "The map was wrong, and that was the best thing that ever happened to me. My family was driving to my cousin's house in Vermont when my dad's phone lost signal and the paper map in the glovebox was from 2009. We took the wrong exit and ended up in a tiny town with one diner. Inside the diner there was an old man who used to be a math teacher, and when he saw my SSAT prep book he challenged me to a mental math contest. I lost, but he showed me a trick for multiplying by eleven that I still use. If the map had been right, I would have just sat in the car for two more hours. Instead I learned that being lost is sometimes just being somewhere you didn't plan to learn something.";

  // tier check: solo should be refused
  await ask(ws, {t:'sync_up', data:{ premiumPlan:'solo' }, updatedAt: Date.now()});
  let r = await post({name:reg.name, token:reg.token, prompt:'The map was wrong...', essay});
  console.log('solo tier ->', r.s===403&&r.d.error==='tier' ? '✓ refused (server-enforced!)' : 'FAIL '+JSON.stringify(r.d));

  // unlimited: real feedback
  await ask(ws, {t:'sync_up', data:{ premiumPlan:'unlimited' }, updatedAt: Date.now()});
  r = await post({name:reg.name, token:reg.token, prompt:'The map was wrong...', essay});
  if (r.s!==200 || !r.d.reply){ console.log('FAIL', r.s, JSON.stringify(r.d).slice(0,200)); process.exit(1); }
  console.log('--- SAGE ON THE ESSAY (', r.d.reply.split(/\s+/).length, 'words) ---');
  console.log(r.d.reply);
  ws.close(); process.exit(0);
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
