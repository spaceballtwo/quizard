const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
const WSURL = 'wss://quizard-server.quizard.workers.dev';
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket(WSURL); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg,want){ return new Promise(res=>{
  const h=raw=>{ const d=JSON.parse(raw); if(!want || d.t===want){ ws.off('message',h); res(d); } };
  ws.on('message',h); if(msg) ws.send(JSON.stringify(msg));
}); }
setTimeout(()=>{ console.error('WATCHDOG'); process.exit(1); }, 120000);
(async () => {
  await new Promise(r=>setTimeout(r, 15000));
  const A = await connect(), B = await connect();
  const ra = await ask(A, {t:'register', name:'FriendA', pass:'secretsecret', auto:true}, 'auth');
  const rb = await ask(B, {t:'register', name:'FriendB', pass:'secretsecret', auto:true}, 'auth');
  console.log('accounts:', ra.name, rb.name);

  let r = await ask(A, {t:'friend_add', name:'zzz_nobody_zzz'}, 'friend_result');
  console.log('unknown name ->', r.ok===false ? 'rejected ✓ ('+r.msg+')' : 'FAIL accepted');

  r = await ask(A, {t:'friend_add', name:rb.name}, 'friend_result');
  console.log('add friend ->', r.ok===true ? 'added '+r.name+' ✓' : 'FAIL '+JSON.stringify(r));

  const fl = await ask(A, {t:'friends'}, 'friends');
  const fb = fl.list.find(f=>f.name===rb.name);
  console.log('friend list ->', fb ? (fb.online?'shows online ✓':'FAIL offline') : 'FAIL missing');

  const gotChallenge = ask(B, null, 'challenged');
  await ask(A, {t:'challenge', name:rb.name}, 'challenge_result');
  const ch = await gotChallenge;
  console.log('challenge delivered ->', ch.from===ra.name ? '✓ from '+ch.from : 'FAIL');

  const aStart = ask(A, null, 'match_start');
  const bStart = ask(B, null, 'match_start');
  B.send(JSON.stringify({t:'challenge_accept'}));
  const [ma, mb] = await Promise.all([aStart, bStart]);
  console.log('match starts ->', (ma.opp.name===rb.name && mb.opp.name===ra.name) ? '✓ both players in, A vs B' : 'FAIL');
  A.close(); B.close();
  console.log('FRIENDS + CHALLENGES LIVE');
  process.exit(0);
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
