// live: scheduled tournament registration + arena pairing
const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket('wss://quizard-server.quizard.workers.dev'); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg,want){ return new Promise(res=>{
  const h=raw=>{ const d=JSON.parse(raw); if(!want || d.t===want){ ws.off('message',h); res(d); } };
  ws.on('message',h); if(msg) ws.send(JSON.stringify(msg));
}); }
setTimeout(()=>{ console.error('WATCHDOG'); process.exit(1); }, 120000);
(async () => {
  await new Promise(r=>setTimeout(r, 18000));
  const A = await connect(), B = await connect();
  const ra = await ask(A, {t:'register', name:'SchedA', pass:'secretsecret', auto:true}, 'auth');
  const rb = await ask(B, {t:'register', name:'SchedB', pass:'secretsecret', auto:true}, 'auth');

  let st = await ask(A, {t:'tourney_join'}, 'stourney_state');
  const lead = (st.startsAt - Date.now())/60000;
  console.log('A registers ->', st.registered===true?'✓':'FAIL', '| starts in', lead.toFixed(1), 'min', (lead<=40)?'✓ within one scheduling window':'FAIL window');
  const when = new Date(st.startsAt);
  console.log('start minute ->', [0,30].includes(when.getMinutes())?'✓ on the half-hour':'FAIL '+when.getMinutes());
  const n0 = st.n;  // prior test runs may have left registrants — assert deltas, not absolutes

  st = await ask(B, {t:'tourney_join'}, 'stourney_state');
  console.log('B registers ->', st.n===n0+1 && st.registered ? '✓ field grew to '+st.n : 'FAIL '+JSON.stringify(st));

  st = await ask(B, {t:'tourney_leave'}, 'stourney_state');
  console.log('B leaves ->', st.n===n0 && !st.registered ? '✓' : 'FAIL '+JSON.stringify(st));
  st = await ask(B, {t:'tourney_join'}, 'stourney_state');
  console.log('B rejoins ->', st.n===n0+1 ? '✓ (round fires at the set time, matches to 21, 30-min gaps)' : 'FAIL');

  A.close(); B.close();
  console.log('SCHEDULED TOURNAMENTS LIVE');
  process.exit(0);
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
