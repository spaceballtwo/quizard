// live: profane names rejected at the door; auto flow falls back clean; wall answers
const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket('wss://quizard-server.quizard.workers.dev'); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg,want){ return new Promise(res=>{
  const h=raw=>{ const d=JSON.parse(raw); if(!want || d.t===want){ ws.off('message',h); res(d); } };
  ws.on('message',h); if(msg) ws.send(JSON.stringify(msg));
  setTimeout(()=>res(null), 8000);
}); }
(async () => {
  await new Promise(r=>setTimeout(r, 25000));  // let the deploy propagate to the DO
  let ws = await connect();
  let r = await ask(ws, {t:'register', name:'Sh1tLord', pass:'secretsecret'}, 'auth');
  console.log('leet profanity ->', r && r.ok===false ? '✓ rejected: "'+r.msg+'"' : 'FAIL '+JSON.stringify(r));
  r = await ask(ws, {t:'register', name:'fvcker99', pass:'secretsecret'}, 'auth');
  console.log('v-swap evasion ->', r && r.ok===false ? '✓ rejected' : 'FAIL '+JSON.stringify(r));
  ws.close(); ws = await connect();
  r = await ask(ws, {t:'register', name:'B1tchQueen', pass:'secretsecret', auto:true}, 'auth');
  const cleanAuto = r && r.ok && /^Wizard/.test(r.name);
  console.log('auto flow fallback ->', cleanAuto ? '✓ became '+r.name : 'FAIL '+JSON.stringify(r));
  const wall = await ask(ws, {t:'wall'}, 'wall');
  console.log('wall ->', wall && Array.isArray(wall.list) ? '✓ list ('+wall.list.length+' names)' : 'FAIL');
  const st = await ask(ws, {t:'tourney_state'}, 'stourney_state');
  console.log('tourney state ->', st ? (st.none ? '✓ no event (monthly window opens Aug 27)' : (st.monthly?'monthly live: '+st.mlabel:'ad-hoc present')) : 'FAIL');
  if (cleanAuto){ await ask(ws, {t:'delete_account'}); console.log('teardown: '+r.name+' deleted'); }
  ws.close();
  for (const n of ['Sh1tLord','fvcker99','B1tchQueen']){
    const w2 = await connect();
    const a = await ask(w2, {t:'login', name:n, pass:'secretsecret'}, 'auth');
    if (a && a.ok){ await ask(w2, {t:'delete_account'}); console.log('cleanup:', n, 'deleted'); }
    w2.close();
  }
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
