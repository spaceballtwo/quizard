// Quizard online server — accounts + live head-to-head races.
// Run: node server.js   (or PORT=1234 node server.js)
// Accounts live in accounts.json next to this file. Passwords are scrypt-hashed.
// Race protocol: server picks a random seed per round; both clients generate the
// identical question from it (same generator code both sides). First correct
// answer reported wins the round; first to WIN_POINTS wins the match.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const DB_FILE = path.join(__dirname, 'accounts.json');
const WIN_POINTS = 3;
const ROUND_TIMEOUT_MS = 45000;

let db = { users: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
function saveDB(){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function hashPass(pass, salt){ return crypto.scryptSync(pass, salt, 32).toString('hex'); }
function sha256(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
// Session tokens: client stores the token, server stores only its hash. Re-login rotates it.
function issueToken(key){ const token = crypto.randomBytes(24).toString('hex'); db.users[key].tokenHash = sha256(token); saveDB(); return token; }
function publicStats(key){ const u = db.users[key]; return { rating: u.rating, wins: u.wins, losses: u.losses, showRating: u.showRating !== false }; }
function visibleRating(key){ const u = db.users[key]; return u.showRating === false ? null : u.rating; }

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Quizard server OK\n');
});
const wss = new WebSocketServer({ server });

let queue = [];
let nextMatchId = 1;

function send(ws, obj){ if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

wss.on('connection', (ws) => {
  ws.user = null; ws.match = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    try { handle(ws, m); } catch (e) { send(ws, { t: 'error', msg: 'server error' }); }
  });
  ws.on('close', () => {
    queue = queue.filter(s => s !== ws);
    if (ws.match) forfeit(ws.match, ws);
  });
});

function handle(ws, m){
  if (m.t === 'register'){
    const name = String(m.name || '').trim().slice(0, 16);
    const pass = String(m.pass || '');
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return send(ws, { t: 'auth', ok: false, msg: 'Name must be 3-16 letters, numbers, or _' });
    if (pass.length < 4) return send(ws, { t: 'auth', ok: false, msg: 'Password needs 4+ characters' });
    let key = name.toLowerCase();
    let finalName = name;
    if (db.users[key]){
      if (!m.auto) return send(ws, { t: 'auth', ok: false, msg: 'That name is taken' });
      let found = null;
      for (let i = 2; i <= 99; i++){
        const cand = (name.slice(0, 14) + i);
        if (!db.users[cand.toLowerCase()]){ found = cand; break; }
      }
      if (!found) return send(ws, { t: 'auth', ok: false, msg: 'That name is taken' });
      finalName = found; key = finalName.toLowerCase();
    }
    const salt = crypto.randomBytes(16).toString('hex');
    db.users[key] = { name: finalName, salt, hash: hashPass(pass, salt), wins: 0, losses: 0, rating: 1000 };
    ws.user = key;
    send(ws, { t: 'auth', ok: true, name: finalName, token: issueToken(key), data: null, dataUpdatedAt: 0, ...publicStats(key) });
  }
  else if (m.t === 'login'){
    ws.authFails = ws.authFails || 0;
    if (ws.authFails >= 5){ send(ws, { t: 'auth', ok: false, msg: 'Too many attempts — reconnect and try again' }); return ws.close(); }
    const key = String(m.name || '').trim().toLowerCase();
    const u = db.users[key];
    if (!u || u.hash !== hashPass(String(m.pass || ''), u.salt)){ ws.authFails++; return send(ws, { t: 'auth', ok: false, msg: 'Wrong name or password' }); }
    ws.user = key;
    send(ws, { t: 'auth', ok: true, name: u.name, token: issueToken(key), data: u.data || null, dataUpdatedAt: u.dataUpdatedAt || 0, ...publicStats(key) });
  }
  else if (m.t === 'token_login'){
    const key = String(m.name || '').trim().toLowerCase();
    const u = db.users[key];
    if (!u || !u.tokenHash || u.tokenHash !== sha256(String(m.token || ''))) return send(ws, { t: 'auth', ok: false, msg: 'Session expired — log in again' });
    ws.user = key;
    send(ws, { t: 'auth', ok: true, name: u.name, token: String(m.token), data: u.data || null, dataUpdatedAt: u.dataUpdatedAt || 0, ...publicStats(key) });
  }
  else if (m.t === 'logout'){
    if (ws.user){ delete db.users[ws.user].tokenHash; saveDB(); ws.user = null; }
  }
  else if (m.t === 'sync_up'){
    if (!ws.user || !m.data) return;
    if (JSON.stringify(m.data).length > 65536) return;   // progress blobs are small; reject anything bloated
    db.users[ws.user].data = m.data;
    db.users[ws.user].dataUpdatedAt = Number(m.updatedAt) || Date.now();
    saveDB();
    send(ws, { t: 'synced', updatedAt: db.users[ws.user].dataUpdatedAt });
  }
  else if (m.t === 'coach_consent'){
    if (!ws.user) return;
    db.users[ws.user].coachConsent = true;
    saveDB();
    send(ws, { t: 'coach_consent', ok: true });
  }
  else if (m.t === 'set_privacy'){
    if (!ws.user) return;
    db.users[ws.user].showRating = !!m.showRating;
    saveDB();
    send(ws, { t: 'privacy', showRating: !!m.showRating });
  }
  else if (m.t === 'queue'){
    if (!ws.user || ws.match || queue.includes(ws)) return;
    const opp = queue.find(s => s.user !== ws.user && s.readyState === 1);
    if (opp){ queue = queue.filter(s => s !== opp); startMatch(ws, opp); }
    else { queue.push(ws); send(ws, { t: 'queued' }); }
  }
  else if (m.t === 'cancel_queue'){
    queue = queue.filter(s => s !== ws);
    send(ws, { t: 'queue_cancelled' });
  }
  else if (m.t === 'answer'){
    if (ws.match && m.n === ws.match.round) roundAnswer(ws.match, ws, !!m.correct);
  }
  else if (m.t === 'set_vote'){
    if (!ws.user) return;
    db.users[ws.user].vote = String(m.vote || '').slice(0, 16);
    saveDB();
    send(ws, { t: 'vote_counts', counts: voteCounts(), yours: db.users[ws.user].vote });
  }
  else if (m.t === 'vote_counts'){
    send(ws, { t: 'vote_counts', counts: voteCounts() });
  }
  else if (m.t === 'leaderboard'){
    const top = Object.values(db.users).sort((a, b) => b.rating - a.rating).slice(0, 10)
      .map(u => ({ name: u.name, rating: u.showRating === false ? null : u.rating, wins: u.wins, losses: u.losses }));
    send(ws, { t: 'leaderboard', top });
  }
}

function voteCounts(){
  const counts = {};
  for (const u of Object.values(db.users)){ if (u.vote) counts[u.vote] = (counts[u.vote] || 0) + 1; }
  return counts;
}

function startMatch(a, b){
  const match = { id: nextMatchId++, players: [a, b], score: [0, 0], round: 0, answered: new Set(), roundWon: false, done: false, timer: null };
  a.match = b.match = match;
  const [ua, ub] = [db.users[a.user], db.users[b.user]];
  send(a, { t: 'match_start', opp: { name: ub.name, rating: visibleRating(b.user) }, winPoints: WIN_POINTS });
  send(b, { t: 'match_start', opp: { name: ua.name, rating: visibleRating(a.user) }, winPoints: WIN_POINTS });
  setTimeout(() => nextRound(match), 2500);
}

function scoreFor(match, p){ const i = match.players.indexOf(p); return { you: match.score[i], opp: match.score[1 - i] }; }

function nextRound(match){
  if (match.done) return;
  match.round++;
  match.answered = new Set();
  match.roundWon = false;
  const seed = crypto.randomInt(1, 2147483647);
  match.players.forEach(p => send(p, { t: 'round', n: match.round, seed, score: scoreFor(match, p) }));
  clearTimeout(match.timer);
  match.timer = setTimeout(() => {
    if (!match.roundWon && !match.done){
      match.players.forEach(p => send(p, { t: 'round_result', n: match.round, winner: null, score: scoreFor(match, p) }));
      setTimeout(() => nextRound(match), 2200);
    }
  }, ROUND_TIMEOUT_MS);
}

function roundAnswer(match, ws, correct){
  if (match.done || match.roundWon || match.answered.has(ws)) return;
  match.answered.add(ws);
  const i = match.players.indexOf(ws);
  if (correct){
    match.roundWon = true;
    clearTimeout(match.timer);
    match.score[i]++;
    match.players.forEach(p => send(p, { t: 'round_result', n: match.round, winner: db.users[ws.user].name, youWon: p === ws, score: scoreFor(match, p) }));
    if (match.score[i] >= WIN_POINTS) return endMatch(match, i);
    setTimeout(() => nextRound(match), 2200);
  } else {
    send(ws, { t: 'locked', n: match.round });
    if (match.answered.size >= 2 && !match.roundWon){
      clearTimeout(match.timer);
      match.players.forEach(p => send(p, { t: 'round_result', n: match.round, winner: null, score: scoreFor(match, p) }));
      setTimeout(() => nextRound(match), 2200);
    }
  }
}

function endMatch(match, wi){
  if (match.done) return;
  match.done = true;
  clearTimeout(match.timer);
  const w = match.players[wi], l = match.players[1 - wi];
  const uw = db.users[w.user], ul = db.users[l.user];
  const expected = 1 / (1 + Math.pow(10, (ul.rating - uw.rating) / 400));
  const delta = Math.max(1, Math.round(24 * (1 - expected)));
  uw.rating += delta;
  ul.rating = Math.max(100, ul.rating - delta);
  uw.wins++; ul.losses++;
  saveDB();
  send(w, { t: 'match_end', won: true,  delta: +delta, rating: uw.rating, score: scoreFor(match, w) });
  send(l, { t: 'match_end', won: false, delta: -delta, rating: ul.rating, score: scoreFor(match, l) });
  match.players.forEach(p => { p.match = null; });
}

function forfeit(match, quitter){
  if (match.done) return;
  endMatch(match, 1 - match.players.indexOf(quitter));
}

server.listen(PORT, () => console.log('Quizard server running on http://localhost:' + PORT));
