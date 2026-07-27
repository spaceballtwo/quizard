// live: your rank row must agree with the ladder — rank N means row N shows your name
const WebSocket = require('/Users/sam.williams/Developer/ssat-app/server/node_modules/ws');
function connect(){ return new Promise((res,rej)=>{ const ws=new WebSocket('wss://quizard-server.quizard.workers.dev'); ws.on('open',()=>res(ws)); ws.on('error',rej); }); }
function ask(ws,msg,want){ return new Promise(res=>{
  const h=raw=>{ const d=JSON.parse(raw); if(!want || d.t===want){ ws.off('message',h); res(d); } };
  ws.on('message',h); if(msg) ws.send(JSON.stringify(msg));
  setTimeout(()=>res(null), 8000);
}); }
(async () => {
  const ws = await connect();
  const a = await ask(ws, {t:'register', name:'RankProbe', pass:'secretsecret', auto:true}, 'auth');
  const lb = await ask(ws, {t:'leaderboard'}, 'leaderboard');
  const me = a.name || 'RankProbe';
  const inTop = lb.top.findIndex(u=>u.name===me);
  const consistent = lb.you.rank<=10 ? (inTop===lb.you.rank-1) : (inTop===-1);
  console.log('you:', '#'+lb.you.rank, 'of', lb.you.total, '| in list at row', inTop+1 || 'none', '|', consistent?'✓ CONSISTENT':'✗ MISMATCH');
  await ask(ws, {t:'delete_account'});   // teardown: leave no ghosts
  console.log('probe account deleted');
  ws.close(); process.exit(consistent?0:1);
})().catch(e=>{ console.error(e); process.exit(1); });
