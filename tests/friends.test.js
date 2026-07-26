// mutual friends + match formats, live on prod
const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
const WSURL = 'wss://quizard-server.quizard.workers.dev';
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket(WSURL); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg,want){ return new Promise(res=>{
  const h=raw=>{ const d=JSON.parse(raw); if(!want || d.t===want){ ws.off('message',h); res(d); } };
  ws.on('message',h); if(msg) ws.send(JSON.stringify(msg));
}); }
setTimeout(()=>{ console.error('WATCHDOG TIMEOUT'); process.exit(1); }, 150000);
(async () => {
  await new Promise(r=>setTimeout(r, 18000));
  const A = await connect(), B = await connect();
  const ra = await ask(A, {t:'register', name:'MutualA', pass:'secretsecret', auto:true}, 'auth');
  const rb = await ask(B, {t:'register', name:'MutualB', pass:'secretsecret', auto:true}, 'auth');
  console.log('accounts:', ra.name, rb.name);

  // request is not instant friendship
  const bGotReq = ask(B, null, 'friend_request');
  const res1 = await ask(A, {t:'friend_add', name:rb.name}, 'friend_result');
  console.log('request sent ->', res1.requested===true ? '✓ pending, not instant' : 'FAIL '+JSON.stringify(res1));
  const ping = await bGotReq;
  console.log('B pinged ->', ping.from===ra.name ? '✓' : 'FAIL');

  let fA = await ask(A, {t:'friends'}, 'friends');
  console.log('A friends before accept ->', fA.list.length===0 ? '✓ empty' : 'FAIL not mutual-gated');
  let fB = await ask(B, {t:'friends'}, 'friends');
  console.log('B sees request ->', fB.reqs.some(r=>r.name===ra.name) ? '✓' : 'FAIL');

  // accept -> mutual
  fB = await ask(B, {t:'friend_respond', name:ra.name, accept:true}, 'friends');
  console.log('B friends after accept ->', fB.list.some(f=>f.name===ra.name) ? '✓' : 'FAIL');
  fA = await ask(A, {t:'friends'}, 'friends');
  console.log('A friends after accept ->', fA.list.some(f=>f.name===rb.name) ? '✓ mutual' : 'FAIL');

  // challenge to 21 carries through to the match
  const bChal = ask(B, null, 'challenged');
  await ask(A, {t:'challenge', name:rb.name, len:21}, 'challenge_result');
  const ch = await bChal;
  console.log('challenge len ->', ch.len===21 ? '✓ 21' : 'FAIL '+ch.len);
  const aStart = ask(A, null, 'match_start'), bStart = ask(B, null, 'match_start');
  B.send(JSON.stringify({t:'challenge_accept'}));
  const [ma, mb] = await Promise.all([aStart, bStart]);
  console.log('match winPoints ->', (ma.winPoints===21 && mb.winPoints===21) ? '✓ first to 21' : 'FAIL '+ma.winPoints);
  A.close(); B.close();
  console.log('MUTUAL FRIENDS + FORMATS LIVE');
  process.exit(0);
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
