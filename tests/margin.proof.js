// Margin proof v2 — model-aware. Extracts caps AND model routing from the deployed
// worker source, simulates 90 days of max abuse, prices Haiku vs Sonnet correctly.
const fs = require('fs');
const src = fs.readFileSync('/Users/sam.williams/Developer/ssat-app/server-cloudflare/src/worker.js','utf8');

const daily = src.match(/const daily = plan === 'unlimited' \? (\d+) : \(plan \? (\d+) : (\d+)\)/);
const season = src.match(/const season = plan === 'unlimited' \? (\d+) : \(plan \? (\d+) : (\d+)\)/);
const fall = src.match(/over \? \(plan === 'unlimited' \? (\d+) : \(plan \? (\d+) : (\d+)\)\)/);
const fam = src.match(/\(fam\.total \|\| 0\) >= (\d+)/);
const deepCap = src.match(/plan === 'unlimited' && \(u\.tutorSeason \|\| 0\) < (\d+)/);
const routing = /deep \? 'claude-sonnet-5' : 'claude-haiku-4-5/.test(src);
const repHaiku = /model: 'claude-haiku-4-5[^']*', max_tokens: 450/.test(src);
if (!daily||!season||!fall||!fam||!deepCap||!routing||!repHaiku){ console.log('FAIL: could not extract routing/caps'); process.exit(1); }
const L = { dUnl:+daily[1], dStd:+daily[2], dFree:+daily[3], sUnl:+season[1], sStd:+season[2], sFree:+season[3],
            fbUnl:+fall[1], fbStd:+fall[2], fbFree:+fall[3], fam:+fam[1], deep:+deepCap[1] };
console.log('Extracted:', JSON.stringify(L), '| routing: Sonnet only when deep, reports on Haiku');

const DAYS=90, HAIKU=0.008, SONNET=0.024, REPORT=0.003;
function chatCost(plan, days){
  let seasonUsed=0, cost=0;
  const dCap = plan==='unlimited'?L.dUnl:(plan?L.dStd:L.dFree);
  const sCap = plan==='unlimited'?L.sUnl:(plan?L.sStd:L.sFree);
  const fb  = plan==='unlimited'?L.fbUnl:(plan?L.fbStd:L.fbFree);
  for (let d=0; d<days; d++){
    const eff = seasonUsed>=sCap ? fb : dCap;
    for (let i=0;i<eff;i++){
      const deep = plan==='unlimited' && seasonUsed < L.deep;
      cost += deep ? SONNET : HAIKU;
      if (seasonUsed<sCap) seasonUsed++;
    }
  }
  return cost;
}
function famChatCost(members, eachPlan, days){
  let famTotal=0, cost=0, users=Array.from({length:members},()=>({s:0}));
  const dCap=eachPlan==='unlimited'?L.dUnl:L.dStd, sCap=eachPlan==='unlimited'?L.sUnl:L.sStd, fb=eachPlan==='unlimited'?L.fbUnl:L.fbStd;
  for (let d=0; d<days; d++) for (const u of users){
    let eff = u.s>=sCap ? fb : dCap;
    if (famTotal>=L.fam) eff=Math.min(eff,5);
    for (let i=0;i<eff;i++){
      const deep = eachPlan==='unlimited' && u.s < L.deep;
      cost += deep ? SONNET : HAIKU;
      if (u.s<sCap) u.s++; if (famTotal<L.fam) famTotal++;
    }
  }
  return cost;
}
const repMax = (100 + 70) * REPORT;            // season cap then 1/day trickle
const repMaxUnl = (300 + 60) * REPORT;
const scenarios = [
  ['Solo $79.99 — honest max',        chatCost('solo',DAYS)+repMax,          75,  false],
  ['Solo $79.99 — FRAUD spoofed unl', chatCost('unlimited',DAYS)+repMaxUnl,  75,  true],
  ['Unlimited $99.99 — max',         chatCost('unlimited',DAYS)+repMaxUnl,  100, false],
  ['Family $349.99 — 6 honest max',   famChatCost(6,'solo',DAYS)+6*repMax,   349, false],
  ['Family $349.99 — 6 spoof unl',    famChatCost(6,'unlimited',DAYS)+6*repMaxUnl, 349.99, true],
  ['Free account — honest max',    chatCost('',DAYS),                     0,   false],
];
let allSafe=true, fraudWorst=0;
console.log('');
for (const [name, cost, price, fraud] of scenarios){
  const net30 = price*0.7, margin = net30-cost;
  if (price>0){ if (fraud) fraudWorst=Math.min(fraudWorst, margin); else if (margin<=0) allSafe=false; }
  console.log(name.padEnd(32)+' | max cost $'+cost.toFixed(2).padStart(7)+' | net@-30% $'+net30.toFixed(2).padStart(7)+' | '+(price>0?('margin '+(margin>=0?'+':'')+'$'+margin.toFixed(2)):'(cost only)'));
}
console.log('');
console.log('Fraud worst (plan spoofing, dies at real checkout): '+(fraudWorst>=0?'+':'')+'$'+fraudWorst.toFixed(2));
console.log(allSafe ? 'MARGIN PROOF HOLDS: every honest scenario profitable at Apple-30 max abuse.' : 'PROOF FAILS');
process.exit(allSafe?0:1);
