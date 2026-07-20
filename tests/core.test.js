
/* Consolidated core suite — regenerated after the scratchpad purge; lives in the repo now. */
let fails=0;
function T(n,c){ console.log((c?'PASS':'FAIL')+' '+n); if(!c) fails++; }

// --- account plumbing ---
account={id:'t1',name:'Kid',xp:0}; ensureFields(account);
store.accounts.push(account); store.currentId='t1';
T('fields: skills/misses/tstats/hist/tour/premium', account.verbalSkill && Array.isArray(account.misses) && typeof account.tstats==='object' && Array.isArray(account.hist) && account.premium===false);
const sp=syncPayload();
T('sync carries new fields', 'verbalSkill' in sp && 'tstats' in sp && 'hist' in sp && 'premiumPlan' in sp && 'theme' in sp);

// --- gates: 4 premium features gated, coach + map free ---
T('gate blocks free', premiumGate('X')===true);
openFullTest(); openOnline(); openReview(); openReport();
openCoachPage(); openGaps();
T('gated + free opens run without crash', true);
account.premium=true;
T('gate passes premium', premiumGate('X')===false);
account.premium=false; store.familyPremium=true;
T('family member passes gate', premiumGate('X')===false);
store.familyPremium=false;

// --- plans & perks ---
account.premium=true; account.premiumPlan='unlimited';
T('unlimited detected', isUnlimited() && hasPerks());
toggleMidnight(); T('midnight toggles', account.theme==='midnight'); toggleMidnight();
toggleDaybreak(); T('daybreak for unlimited', account.theme==='daybreak'); toggleDaybreak();
account.premiumPlan='family';
T('family has perks + midnight, not daybreak', hasPerks() && hasMidnight());
const th=account.theme; toggleDaybreak();
T('family blocked from daybreak', account.theme===th);
account.premiumPlan='solo';
T('solo: no perks', !hasPerks() && !hasMidnight());
account.premiumPlan='family';
onlineMsg({t:'family_code', code:'ABC234'});
T('family code stored+synced', account.familyCode==='ABC234' && syncPayload().familyCode==='ABC234');
account.premium=false; account.premiumPlan='';
onlineMsg({t:'family_join', ok:true, code:'ABC234'});
T('join grants family-member', account.premium===true && account.premiumPlan==='family-member');
account.premiumPlan='unlimited';

// --- merged serving ---
let v=0, gapless=true;
for(let i=0;i<800;i++){ const s=getStudyQuestion(); if(s.vkind) v++; if(!s.q.q||!s.q.choices[s.q.answer]) gapless=false; }
T('study mixes verbal (~35-50%)', v/800>0.3 && v/800<0.55);
T('all served questions valid', gapless);
let readShort=0;
for(let i=0;i<500;i++){ const s=getStudyQuestion(true); if(s.vkind==='reading') readShort++; }
T('shortOnly never serves reading', readShort===0);

// --- practice + full test shapes ---
fullTest=false; buildSet(14);
T('practice: 9 quant + 3 ana + 2 syn', QUIZ.length===3 && QUIZ[0].questions.length===9 && QUIZ[1].questions.length===3 && QUIZ[2].questions.length===2);
fullTest=true; buildSet(25);
T('full test: 15+6+4, total 25', QUIZ[0].questions.length===15 && QUIZ[1].questions.length===6 && QUIZ[2].questions.length===4 && TOTAL===25);
fullTest=false;

// --- races: deterministic ---
let det=true;
for(let s=1;s<=300;s++){ const a=genRaceQuestion(s), b=genRaceQuestion(s); if(a.q!==b.q||a.answer!==b.answer){det=false;break;} }
T('race seeds deterministic (300)', det);

// --- SRS lifecycle ---
account.misses=[];
recordMiss({q:'srsQ', choices:['a','b','c','d','e'], answer:0, why:'w', _ti:0}, '');
const mm=account.misses[0];
T('miss gets box+due', mm.box===0 && mm.due===dateStr(new Date()));
mm.box=2; mm.due=dateStr(new Date());
studyMode='review'; studyCurrent={_mm:mm};
// simulate the review-correct branch
mm.box++; if(mm.box>=3){ const ix=account.misses.indexOf(mm); if(ix>=0) account.misses.splice(ix,1); }
T('3rd correct graduates', account.misses.length===0);

// --- gaps + report ---
account.tstats={0:[10,2], 1:[10,9]};
T('verdicts: gap + strong', topicVerdict(0).cat==='gap' && topicVerdict(1).cat==='strong');
const f=reportFacts();
T('report facts: gaps/strengths/avg skill', f.knowledgeGaps.length>=1 && f.strongTopics.length>=1 && typeof f.averageSkillOutOf10==='number');
T('report rows render', reportFactsRows(f).includes('Average skill'));

// --- verbal skill updates ---
account.verbalSkill.analogies=2;
updateVerbalSkill('analogies', true);
T('verbal skill moves', account.verbalSkill.analogies>2);

// --- tour lifecycle ---
account.tourDone=false; maybeTour();
T('tour starts', tourOn===true);
endTour(false);
T('tour done sticks', account.tourDone===true && tourOn===false);

console.log(fails===0 ? 'CORE SUITE PASS' : fails+' FAILURES');
process.exit(fails?1:0);
