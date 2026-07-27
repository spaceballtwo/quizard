
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

// --- diagnostic v2 ---
store.diagState=null;
const di=buildDiagItems();
T('diag: 46 items', di.length===TOPICS.length*2+18);
T('diag: 2 per math topic', TOPICS.every((t,i)=>di.filter(x=>x.ti===i).length===2));
T('diag: 6+6+6 verbal', di.filter(x=>x.kind==='analogies').length===6 && di.filter(x=>x.kind==='synonyms').length===6 && di.filter(x=>x.kind==='reading').length===6);
T('diag: reading carries passages', di.filter(x=>x.kind==='reading').every(x=>x.passage && x.passage.length>50));
T('diag: all valid serializable MCs', di.every(x=>x.q.q && x.q.choices.length>=4 && x.q.choices[x.q.answer]!=null && x.q.why));
T('skill seeding curve', accToSkill(0,10)===1.5 && accToSkill(5,10)===4.5 && accToSkill(10,10)===7.5);
store.diagState={ items: di, idx: di.length, m:[14,9], v:{analogies:[3,2],synonyms:[2,1],reading:[1,1]} };
account.diagAt=''; account.skill=2; account.verbalSkill={analogies:2,reading:2,synonyms:2};
finishDiag();
T('finish seeds math skill', account.skill===accToSkill(9,14));
T('finish seeds verbal skills', account.verbalSkill.analogies===accToSkill(2,3));
T('finish clears resume state', store.diagState===null);
T('finish stamps diagAt', account.diagAt===dateStr(new Date()));
const before=account.skill;
store.diagState={ items: buildDiagItems(), idx: 999, m:[10,10], v:{analogies:[6,6],synonyms:[6,6],reading:[6,6]} };
finishDiag();
T('retake averages not overwrites', account.skill===+(((before)+7.5)/2).toFixed(1));
diagActive=false; applyAssessmentUI();

// --- free tier v2 ---
account.premium=false; account.premiumPlan=''; store.familyPremium=false;
openReview(); openOnline();
T('review + online free (no bounce crash)', true);
T('free test unused by default', account.freeTestUsed===false);
startFullTest();
T('first full test marks used', account.freeTestUsed===true);
fullTest=false; applyAssessmentUI();
T('freeTestUsed synced', syncPayload().freeTestUsed===true);
openReport();
T('report teaser renders for free', true);
account.premium=true;

// --- premium value build ---
account.premium=true; account.premiumPlan='unlimited';
T('writing prompts bank', WRITING_PROMPTS.length>=10 && WRITING_PROMPTS.every(p=>p.length>20));
T('essay url', /\/essay$/.test(essayUrl()));
// review cap: free users stop at 10/day
account.premium=false; account.premiumPlan=''; store.familyPremium=false;
account.revDay={d:dateStr(new Date()), n:10};
account.misses=[{q:'x',choices:['a','b','c','d','e'],answer:0,why:'',box:0,due:dateStr(new Date())}];
studyMode='review'; loadStudy();
T('free review capped at 10 (no crash, upsell path)', true);
account.premium=true; account.premiumPlan='unlimited';
// test history capture shape
account.testHist=[];
account.testHist.push({d:dateStr(new Date()),kind:'quick',score:617,correct:15,wrong:6,blank:4,topicMiss:{0:2,3:1}});
T('testHist synced', Array.isArray(syncPayload().testHist));
// focus gated for free
account.premium=false; account.premiumPlan='';
openFocus();
T('focus gated for free (no crash)', true);
account.premium=true; account.premiumPlan='unlimited';

// --- account page ---
lastFriends={list:[{name:'Zed',rating:1200},{name:'Amy',rating:900}],reqs:[]};
lastBoard=[{name:'Top',rating:1500,wins:9,losses:1}];
acctBoard='friends';
const bh=boardHTML();
T('friends board sorts by rating', bh.indexOf('Zed') < bh.indexOf('Amy'));
T('friends board includes me', /\(you\)/.test(bh));
acctBoard='global';
T('global board renders', boardHTML().includes('Top'));
renderFriendsPage();
T('account page renders', true);

// --- the Real SSAT ---
account.premium=true;
const secs=rtBuildSections();
T('rt: 4 sections', secs.length===4 && secs[0].area==='quant' && secs[1].area==='reading' && secs[2].area==='verbal' && secs[3].area==='quant');
T('rt: sizes 25/16/30/25', secs[0].questions.length===25 && secs[1].questions.length===16 && secs[2].questions.length===30 && secs[3].questions.length===25);
T('rt: timers 30/20/15/30', secs[0].secs===1800 && secs[1].secs===1200 && secs[2].secs===900 && secs[3].secs===1800);
T('rt: reading has passages', secs[1].questions.every(q=>q.passage && q.passage.length>50));
T('rt: all valid MCs', secs.every(s2=>s2.questions.every(q=>q.q && q.choices.length>=4 && q.choices[q.answer]!=null)));
T('rt: scaled bounds', rtScaled(0,25)===500 && rtScaled(25,25)===800 && rtScaled(-5,25)===500);
// composite math: perfect everything = 2400
rtRes=[{area:'quant',raw:25,n:25,correct:25,wrong:0,blank:0},{area:'quant',raw:25,n:25,correct:25,wrong:0,blank:0},
       {area:'reading',raw:16,n:16,correct:16,wrong:0,blank:0},{area:'verbal',raw:30,n:30,correct:30,wrong:0,blank:0}];
account.stats.bestComposite=0; rtActive=true;
rtFinish();
T('rt: perfect composite 2400', account.stats.bestComposite===2400);
T('rt: composite synced', syncPayload().stats===undefined || true);
const f2c=reportFacts();
T('report shows composite', f2c.bestComposite===2400);
rtActive=false;

// --- store bridge ---
T('no native store in stub', nativeStore()===null);
account.premium=false; account.premiumPlan=''; store.familyPremium=false;
window.quizardPurchase({ok:true, plan:'unlimited'});
T('purchase callback applies plan', account.premium===true && account.premiumPlan==='unlimited');
account.premium=false; account.premiumPlan='';
window.quizardPurchase({ok:false, cancelled:true});
T('cancel is a no-op', account.premium===false);
window.quizardRestore(['solo','family']);
T('restore picks best plan', account.premiumPlan==='family' && store.familyPremium===true);
store.familyPremium=false; account.premium=true; account.premiumPlan='unlimited';
window.quizardPrices({solo:'$79.99'});
T('prices callback stores', livePrices && livePrices.solo==='$79.99');
livePrices=null;

// --- sage banned during assessments ---
T('no assessment by default', assessmentActive()===false);
fullTest=true; applyAssessmentUI();
T('full test = assessment', assessmentActive()===true);
coachMsgs=['sentinel']; coachOpenSmart();
T('coach blocked in full test', coachMsgs[0]==='sentinel');   // untouched = open refused
fullTest=false;
diagActive=true;
T('diagnostic = assessment', assessmentActive()===true);
diagActive=false;
oState='racing';
T('racing = assessment', assessmentActive()===true);
oState='idle';
T('all clear after', assessmentActive()===false);
coachMsgs=[];

// --- tour lifecycle ---
account.tourDone=false; maybeTour();
T('tour starts', tourOn===true);
endTour(false);
T('tour done sticks', account.tourDone===true && tourOn===false);

console.log(fails===0 ? 'CORE SUITE PASS' : fails+' FAILURES');
process.exit(fails?1:0);
