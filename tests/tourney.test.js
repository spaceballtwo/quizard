// live: 4 players join a bracket -> seeded, semis start; arena joins pair up
const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket('wss://quizard-server.quizard.workers.dev'); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg,want){ return new Promise(res=>{
  const h=raw=>{ const d=JSON.parse(raw); if(!want || d.t===want){ ws.off('message',h); res(d); } };
  ws.on('message',h); if(msg) ws.send(JSON.stringify(msg));
}); }
setTimeout(()=>{ console.error('WATCHDOG'); process.exit(1); }, 150000);
(async () => {
  await new Promise(r=>setTimeout(r, 18000));
  const conns = await Promise.all([connect(),connect(),connect(),connect()]);
  const regs = [];
  for (let i=0;i<4;i++) regs.push(await ask(conns[i], {t:'register', name:'Bracket'+i, pass:'secretsecret', auto:true}, 'auth'));
  console.log('players:', regs.map(r=>r.name).join(', '));

  const starts = conns.map(c=>ask(c, null, 'tourney_start'));
  const semis = conns.map(c=>ask(c, null, 'match_start'));
  conns.forEach(c=>c.send(JSON.stringify({t:'tourney_join'})));
  const ts = await Promise.all(starts);
  console.log('bracket started -> seeds:', ts.map(t=>t.seed).sort().join(','), ts[0].bracket.length===4?'✓ 4 players seeded':'FAIL');
  const ms = await Promise.all(semis);
  console.log('semifinals ->', ms.every(m=>m.label==='Semifinal'&&m.winPoints===11) ? '✓ both semis live, labeled, first-to-11' : 'FAIL '+JSON.stringify(ms[0]));

  // arena pairing with two fresh players
  const a1=await connect(), a2=await connect();
  await ask(a1,{t:'register',name:'ArenaA',pass:'secretsecret',auto:true},'auth');
  await ask(a2,{t:'register',name:'ArenaB',pass:'secretsecret',auto:true},'auth');
  const am1=ask(a1,null,'match_start'), am2=ask(a2,null,'match_start');
  a1.send(JSON.stringify({t:'arena_join'}));
  await new Promise(r=>setTimeout(r,500));
  a2.send(JSON.stringify({t:'arena_join'}));
  const [x1,x2]=await Promise.all([am1,am2]);
  console.log('arena ->', (x1.label==='Arena'&&x1.winPoints===5) ? '✓ paired, first-to-5' : 'FAIL '+JSON.stringify(x1));
  conns.forEach(c=>c.close()); a1.close(); a2.close();
  console.log('TOURNAMENTS LIVE');
  process.exit(0);
})().catch(e=>{ console.error('FAIL',e); process.exit(1); });
