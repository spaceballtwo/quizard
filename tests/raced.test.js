// live: match_start carries shared difficulty d when both clients are 0.33+, withheld otherwise
const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket('wss://quizard-server.quizard.workers.dev'); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg,want){ return new Promise(res=>{ const h=raw=>{ const d=JSON.parse(raw); if(!want||d.t===want){ ws.off('message',h); res(d);} }; ws.on('message',h); if(msg) ws.send(JSON.stringify(msg)); setTimeout(()=>res(null),9000); }); }
(async()=>{
  await new Promise(r=>setTimeout(r,25000));
  const A=await connect(), B=await connect();
  const ra=await ask(A,{t:'register',name:'RaceDA',pass:'secretsecret',auto:true,v:'0.33.0'},'auth');
  const rb=await ask(B,{t:'register',name:'RaceDB',pass:'secretsecret',auto:true,v:'0.33.0'},'auth');
  const pms=[ask(A,null,'match_start'), ask(B,null,'match_start')];
  A.send(JSON.stringify({t:'queue', wantLen:11})); B.send(JSON.stringify({t:'queue', wantLen:11}));
  const [ma,mb]=await Promise.all(pms);
  const ok = ma && mb && typeof ma.d==='number' && ma.d===mb.d;
  console.log('both 0.33 ->', ok ? '✓ shared d='+ma.d+' (1000-rated ⇒ 0)' : 'FAIL '+JSON.stringify([ma&&ma.d, mb&&mb.d]));
  for (const w of [A,B]) await ask(w,{t:'delete_account'});
  console.log('teardown done');
  // mixed versions: one client with no v — d must be withheld
  const C=await connect(), D=await connect();
  await ask(C,{t:'register',name:'RaceDC',pass:'secretsecret',auto:true,v:'0.33.0'},'auth');
  await ask(D,{t:'register',name:'RaceDD',pass:'secretsecret',auto:true},'auth');
  const pms2=[ask(C,null,'match_start'), ask(D,null,'match_start')];
  C.send(JSON.stringify({t:'queue', wantLen:11})); D.send(JSON.stringify({t:'queue', wantLen:11}));
  const [mc,md]=await Promise.all(pms2);
  console.log('mixed versions ->', mc && md && mc.d==null && md.d==null ? '✓ d withheld (legacy mix both sides)' : 'FAIL '+JSON.stringify([mc&&mc.d, md&&md.d]));
  for (const w of [C,D]) await ask(w,{t:'delete_account'});
  console.log('teardown done');
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
