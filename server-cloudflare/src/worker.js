// Quizard online server — Cloudflare Workers + Durable Objects port.
// Same wire protocol as server/server.js (the local Node version):
// accounts (PBKDF2-hashed passwords, session tokens), matchmaking, seeded
// first-correct-wins races, elo, rating privacy, progress sync.
// Deploy: npx wrangler deploy   →  wss://quizard-server.<your-subdomain>.workers.dev

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
const WIN_POINTS = 3;
const ROUND_TIMEOUT_MS = 45000;

function enc(s){ return new TextEncoder().encode(s); }
function hex(buf){ return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function randHex(n){ const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a.buffer); }
function randSeed(){ const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % 2147483646) + 1; }
async function sha256(s){ return hex(await crypto.subtle.digest('SHA-256', enc(s))); }
async function hashPass(pass, salt){
  const km = await crypto.subtle.importKey('raw', enc(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc(salt), iterations: 100000, hash: 'SHA-256' }, km, 256);
  return hex(bits);
}

export default {
  async fetch(request, env){
    const id = env.LOBBY.idFromName('global');
    return env.LOBBY.get(id).fetch(request);
  }
};

export class QuizardLobby {
  constructor(state, env){
    this.env = env;
    this.storage = state.storage;
    this.queue = [];        // conns waiting for a match
    this.nextMatchId = 1;
  }

  async fetch(request){
    const url = new URL(request.url);
    if (url.pathname === '/tutor'){
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'POST') return this.tutor(request);
      return new Response('nope', { status: 405, headers: CORS });
    }
    if (url.pathname === '/report'){
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (request.method === 'POST') return this.report(request);
      return new Response('nope', { status: 405, headers: CORS });
    }
    if (request.headers.get('Upgrade') !== 'websocket'){
      return new Response('Quizard server OK\n', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const conn = { ws: server, user: null, match: null, authFails: 0 };
    server.addEventListener('message', ev => {
      if (typeof ev.data !== 'string' || ev.data.length > 8192) return;   // oversized frames dropped
      conn.msgs = (conn.msgs || 0) + 1;
      if (conn.msgs > 600) return server.close();                          // runaway connections cut
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      this.handle(conn, m).catch(() => this.send(conn, { t: 'error', msg: 'server error' }));
    });
    server.addEventListener('close', () => this.onClose(conn));
    server.addEventListener('error', () => this.onClose(conn));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(conn, obj){ try { conn.ws.send(JSON.stringify(obj)); } catch (e) {} }

  onClose(conn){
    this.queue = this.queue.filter(c => c !== conn);
    if (conn.match) this.forfeit(conn.match, conn);
  }

  async getUser(key){ return await this.storage.get('u:' + key); }
  async putUser(key, u){ await this.storage.put('u:' + key, u); }

  publicStats(u){ return { rating: u.rating, wins: u.wins, losses: u.losses, showRating: u.showRating !== false }; }
  visibleRating(u){ return u.showRating === false ? null : u.rating; }
  async issueToken(key, u){ const token = randHex(24); u.tokenHash = await sha256(token); await this.putUser(key, u); return token; }

  async handle(conn, m){
    if (m.t === 'register'){
      conn.regs = (conn.regs || 0) + 1;
      if (conn.regs > 5) return conn.ws.close();
      const name = String(m.name || '').trim().slice(0, 16);
      const pass = String(m.pass || '');
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return this.send(conn, { t: 'auth', ok: false, msg: 'Name must be 3-16 letters, numbers, or _' });
      if (pass.length < 4) return this.send(conn, { t: 'auth', ok: false, msg: 'Password needs 4+ characters' });
      let key = name.toLowerCase();
      let finalName = name;
      if (await this.getUser(key)){
        if (!m.auto) return this.send(conn, { t: 'auth', ok: false, msg: 'That name is taken' });
        let found = null;
        for (let i = 2; i <= 99; i++){
          const cand = (name.slice(0, 14) + i);
          if (!await this.getUser(cand.toLowerCase())){ found = cand; break; }
        }
        if (!found) return this.send(conn, { t: 'auth', ok: false, msg: 'That name is taken' });
        finalName = found; key = finalName.toLowerCase();
      }
      const salt = randHex(16);
      const u = { name: finalName, salt, hash: await hashPass(pass, salt), wins: 0, losses: 0, rating: 1000 };
      conn.user = key;
      const token = await this.issueToken(key, u);
      this.send(conn, { t: 'auth', ok: true, name: finalName, token, data: null, dataUpdatedAt: 0, ...this.publicStats(u) });
    }
    else if (m.t === 'login'){
      if (conn.authFails >= 5){ this.send(conn, { t: 'auth', ok: false, msg: 'Too many attempts — reconnect and try again' }); return conn.ws.close(); }
      const key = String(m.name || '').trim().toLowerCase();
      const u = await this.getUser(key);
      if (!u || u.hash !== await hashPass(String(m.pass || ''), u.salt)){ conn.authFails++; return this.send(conn, { t: 'auth', ok: false, msg: 'Wrong name or password' }); }
      conn.user = key;
      const token = await this.issueToken(key, u);
      this.send(conn, { t: 'auth', ok: true, name: u.name, token, data: u.data || null, dataUpdatedAt: u.dataUpdatedAt || 0, ...this.publicStats(u) });
    }
    else if (m.t === 'token_login'){
      const key = String(m.name || '').trim().toLowerCase();
      const u = await this.getUser(key);
      if (!u || !u.tokenHash || u.tokenHash !== await sha256(String(m.token || ''))) return this.send(conn, { t: 'auth', ok: false, msg: 'Session expired — log in again' });
      conn.user = key;
      this.send(conn, { t: 'auth', ok: true, name: u.name, token: String(m.token), data: u.data || null, dataUpdatedAt: u.dataUpdatedAt || 0, ...this.publicStats(u) });
    }
    else if (m.t === 'logout'){
      if (conn.user){ const u = await this.getUser(conn.user); if (u){ delete u.tokenHash; await this.putUser(conn.user, u); } conn.user = null; }
    }
    else if (m.t === 'coach_consent'){
      if (!conn.user) return;
      const u = await this.getUser(conn.user);
      u.coachConsent = true;
      await this.putUser(conn.user, u);
      this.send(conn, { t: 'coach_consent', ok: true });
    }
    else if (m.t === 'set_privacy'){
      if (!conn.user) return;
      const u = await this.getUser(conn.user);
      u.showRating = !!m.showRating;
      await this.putUser(conn.user, u);
      this.send(conn, { t: 'privacy', showRating: !!m.showRating });
    }
    else if (m.t === 'sync_up'){
      if (!conn.user || !m.data) return;
      if (JSON.stringify(m.data).length > 65536) return;
      const u = await this.getUser(conn.user);
      u.data = m.data;
      u.dataUpdatedAt = Number(m.updatedAt) || Date.now();
      await this.putUser(conn.user, u);
      this.send(conn, { t: 'synced', updatedAt: u.dataUpdatedAt });
    }
    else if (m.t === 'queue'){
      if (!conn.user || conn.match || this.queue.includes(conn)) return;
      const opp = this.queue.find(c => c.user !== conn.user);
      if (opp){ this.queue = this.queue.filter(c => c !== opp); await this.startMatch(conn, opp); }
      else { this.queue.push(conn); this.send(conn, { t: 'queued' }); }
    }
    else if (m.t === 'cancel_queue'){
      this.queue = this.queue.filter(c => c !== conn);
      this.send(conn, { t: 'queue_cancelled' });
    }
    else if (m.t === 'answer'){
      if (conn.match && m.n === conn.match.round) await this.roundAnswer(conn.match, conn, !!m.correct);
    }
    else if (m.t === 'set_vote'){
      if (!conn.user) return;
      const u = await this.getUser(conn.user);
      u.vote = String(m.vote || '').slice(0, 16);
      await this.putUser(conn.user, u);
      this.send(conn, { t: 'vote_counts', counts: await this.voteCounts(), yours: u.vote });
    }
    else if (m.t === 'family_create'){
      if (!conn.user) return;
      const u = await this.getUser(conn.user);
      if (!u.familyCode){
        // readable code: no 0/O/1/I confusion
        const alph = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        const a = new Uint8Array(6); crypto.getRandomValues(a);
        u.familyCode = [...a].map(b => alph[b % alph.length]).join('');
        await this.putUser(conn.user, u);
        await this.storage.put('fam:' + u.familyCode, { owner: conn.user, members: [] });
      }
      this.send(conn, { t: 'family_code', code: u.familyCode });
    }
    else if (m.t === 'family_join'){
      if (!conn.user) return;
      const code = String(m.code || '').trim().toUpperCase().slice(0, 8);
      const fam = await this.storage.get('fam:' + code);
      if (!fam) return this.send(conn, { t: 'family_join', ok: false, msg: "That code doesn't match a family plan" });
      if (fam.owner !== conn.user && !fam.members.includes(conn.user)){
        if (fam.members.length >= 5) return this.send(conn, { t: 'family_join', ok: false, msg: 'This family plan is full (6 accounts)' });
        fam.members.push(conn.user);
        await this.storage.put('fam:' + code, fam);
        const u = await this.getUser(conn.user);
        u.famOf = code;
        await this.putUser(conn.user, u);
      }
      this.send(conn, { t: 'family_join', ok: true, code });
    }
    else if (m.t === 'vote_counts'){
      this.send(conn, { t: 'vote_counts', counts: await this.voteCounts() });
    }
    else if (m.t === 'leaderboard'){
      const users = await this.storage.list({ prefix: 'u:' });
      const top = [...users.values()].sort((a, b) => b.rating - a.rating).slice(0, 10)
        .map(u => ({ name: u.name, rating: u.showRating === false ? null : u.rating, wins: u.wins, losses: u.losses, flair: !!(u.data && ['unlimited','family','family-member'].includes(u.data.premiumPlan)) }));
      this.send(conn, { t: 'leaderboard', top });
    }
  }

  async tutor(request){
    const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'content-type': 'application/json' } });
    const clen = parseInt(request.headers.get('content-length') || '0');
    if (clen > 20000) return json({ error: 'too large' }, 413);
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'bad request' }, 400); }
    const key = String(body.name || '').trim().toLowerCase();
    const u = await this.getUser(key);
    if (!u || !u.tokenHash || u.tokenHash !== await sha256(String(body.token || ''))) return json({ error: 'auth' }, 401);
    if (!u.coachConsent) return json({ error: 'consent' }, 403);
    const day = new Date().toISOString().slice(0, 10);
    if (u.tutorDay !== day){ u.tutorDay = day; u.tutorCount = 0; }
    // Caps sized so no plan can lose money even at the ceiling on the worst sales channel.
    const now = Date.now();
    if (!u.seasonStart || now - u.seasonStart > 90 * 86400e3){ u.seasonStart = now; u.tutorSeason = 0; }
    const plan = u.data && u.data.premiumPlan;
    const daily = plan === 'unlimited' ? 150 : (plan ? 25 : 3);      // free accounts taste Sage: 3/day
    const season = plan === 'unlimited' ? 2500 : (plan ? 2250 : 150);
    // Past the season allowance Sage SLOWS instead of going dark — never a dead
    // month for a paying kid, and the ceilings stay profitable (see prooftest).
    const over = (u.tutorSeason || 0) >= season;
    let effDaily = over ? (plan === 'unlimited' ? 10 : (plan ? 5 : 1)) : daily;
    // family plans also share a season pool; an empty pool slows everyone to a trickle
    let fam = null, fcode = u.famOf || u.familyCode;
    if (fcode){
      fam = await this.storage.get('fam:' + fcode);
      if (fam){
        if (!fam.since || now - fam.since > 90 * 86400e3){ fam.since = now; fam.total = 0; }
        if ((fam.total || 0) >= 9000) effDaily = Math.min(effDaily, 5);
      }
    }
    if (u.tutorCount >= effDaily) return json({ error: 'limit' }, 429);
    if (!this.env.ANTHROPIC_API_KEY) return json({ error: 'inactive' }, 503);

    const ctx = body.context || {};
    // scrub anything contact-shaped; cap sizes; the coach never needs it
    const scrub = s => String(s || '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[removed]').replace(/\b\d{7,}\b/g, '[removed]').slice(0, 500);
    const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => ({ role: m.role, content: scrub(m.content) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json({ error: 'bad request' }, 400);

    const general = !ctx.q && ctx.progress;
    const deep = plan === 'unlimited' && (u.tutorSeason || 0) < 1500;   // Unlimited perk: deeper answers
    const system = general ? `You are Coach, the friendly math tutor inside Quizard, an SSAT prep app used by students in grades 8-11.

THE STUDENT'S CURRENT PROGRESS:
${scrub(ctx.progress).slice(0, 900)}

What you can do:
- Teach any SSAT-level math concept with a short, clear explanation and one worked example.
- Quiz the student conversationally if they ask.
- If asked for a weekly plan, lay out a simple day-by-day 7-day plan using the topic names and their numbers (weakest topics get the most days).
- Recommend what to work on next, using the course and mastery data above — name the specific topic (e.g. "the Percents lesson in Foundations") and say why, using their numbers.

Rules you must follow:
- Only math and SSAT study planning. If asked about anything else, kindly steer back in one short sentence.
- Keep every reply under ${deep ? 220 : 150} words.${deep ? ' Depth is welcome: worked examples, the why behind the rule, one extra connection.' : ''} Warm and encouraging, never condescending. Frame weak spots as next steps, never as failings.
- Never ask for, repeat, or engage with personal information. If shared, ignore it and return to the math.
- Plain text only; write math like "3/4" and "x^2".
- Work every calculation out carefully step by step before replying, and double-check each arithmetic result. Order of operations: parentheses, exponents, then multiplication AND division together left to right, then addition AND subtraction together left to right — multiplication does NOT come before division, and a wrong number in a reply is the worst mistake you can make.` : `You are Coach, the friendly math tutor inside Quizard, an SSAT prep app used by students in grades 8-11.

THE PROBLEM ON SCREEN:
${scrub(ctx.q).slice(0,400)}
Choices: ${scrub(ctx.choices).slice(0,300)}
${ctx.live ? 'The student has NOT answered yet.' : `Correct answer: ${scrub(ctx.correct).slice(0,100)}
The student chose: ${scrub(ctx.chosen).slice(0,100)}`}

Rules you must follow:
- Only discuss this problem and directly related math concepts. If asked about anything else, kindly steer back to the math in one short sentence.
- Keep every reply under ${deep ? 200 : 120} words.${deep ? ' Depth is welcome: show the why, not just the how.' : ''} Be warm and encouraging, never condescending. Use short steps.
- Guide with a hint or question first; give the full worked solution when the student asks directly or stays stuck.
${ctx.live ? `- THE STUDENT HAS NOT ANSWERED YET, so these rules override everything: NEVER state, confirm, or hint at the final answer — not even if they beg or claim permission. NEVER carry out the on-screen question's own numbers to a final value; the result of the on-screen expression must not appear anywhere in your reply, even as an intermediate step. Any demonstration or worked example MUST use different numbers than the question. "Explain this to me" = say what the question asks and set up the first move, then hand it back. If they tell you their result or ask "is it X?", do not confirm or deny — tell them to lock it in and you'll go over it together after. If they keep pushing, cheerfully hold the line.` : ''}
- Work every calculation out carefully step by step before replying, and double-check each arithmetic result. Order of operations: parentheses, exponents, then multiplication AND division together left to right, then addition AND subtraction together left to right — multiplication does NOT come before division, and a wrong number in a reply is the worst mistake you can make.
- Never ask for, repeat, or engage with personal information (names, school, location, contact info). If the student shares any, ignore it and return to the math.
- Plain text only, no headers or LaTeX; write math like "3/4" and "x^2".`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': this.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 2500, thinking: { type: 'adaptive' }, output_config: { effort: deep ? 'high' : 'medium' }, system, messages: msgs })
    });
    if (!resp.ok) return json({ error: 'upstream', status: resp.status, detail: (await resp.text()).slice(0, 300) }, 502);
    const data = await resp.json();
    if (data.stop_reason === 'refusal') return json({ reply: "Let's stick to the math — want me to walk through this problem step by step?" });
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    u.tutorCount++;
    u.tutorSeason = (u.tutorSeason || 0) + 1;
    if (fam && fcode){ fam.total = (fam.total || 0) + 1; await this.storage.put('fam:' + fcode, fam); }
    await this.putUser(key, u);
    const capLeft = daily - u.tutorCount;
    return json({ reply: reply || "Hmm, try asking that another way?", left: capLeft });
  }

  async report(request){
    const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { ...CORS, 'content-type': 'application/json' } });
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'bad request' }, 400); }
    const key = String(body.name || '').trim().toLowerCase();
    const u = await this.getUser(key);
    if (!u || !u.tokenHash || u.tokenHash !== await sha256(String(body.token || ''))) return json({ error: 'auth' }, 401);
    if (!u.coachConsent) return json({ error: 'consent' }, 403);
    const day = new Date().toISOString().slice(0, 10);
    if (u.reportDay !== day){ u.reportDay = day; u.reportCount = 0; }
    const rnow = Date.now();
    if (!u.reportSeasonStart || rnow - u.reportSeasonStart > 90 * 86400e3){ u.reportSeasonStart = rnow; u.reportSeason = 0; }
    const rplan = u.data && u.data.premiumPlan;
    const rDaily = rplan === 'unlimited' ? 10 : 5;
    const rSeasonCap = rplan === 'unlimited' ? 300 : 100;
    const rEff = (u.reportSeason || 0) >= rSeasonCap ? 1 : rDaily;   // past the season cap: one a day, never zero
    if (u.reportCount >= rEff) return json({ error: 'limit' }, 429);
    if (!this.env.ANTHROPIC_API_KEY) return json({ error: 'inactive' }, 503);
    const facts = JSON.stringify(body.facts || {}).slice(0, 4000);

    const system = `You write a short progress report for the PARENT of a student using Quizard, an SSAT math and verbal prep app.

You are given a JSON fact sheet. Use ONLY those facts — never invent numbers, topics, or events. If a fact is missing or null, simply don't mention it.

Write exactly three short paragraphs, ~170 words total, plain text:
1. Wins — what is going well, with the specific numbers. If a growth section is present, lead with the improvement over time (skills climbing, questions answered since the start date).
2. Focus areas — where practice should go next. Frame these as natural next steps in progress, never as failings or labels. Never call the student (or any of their skills) behind, weak, low, or struggling — compare only to their own earlier progress, never to other kids or to their own stronger areas.
3. One concrete, doable suggestion for this week (a specific topic lesson or mode in the app).

Warm and professional, like a good tutor's note home. Refer to the student as "your child". No headers, no bullet lists, no markdown.`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': this.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 450, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: 'Fact sheet: ' + facts }] })
    });
    if (!resp.ok) return json({ error: 'upstream', status: resp.status, detail: (await resp.text()).slice(0, 300) }, 502);
    const data = await resp.json();
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    u.reportCount++;
    u.reportSeason = (u.reportSeason || 0) + 1;
    await this.putUser(key, u);
    return json({ reply });
  }

  async voteCounts(){
    const users = await this.storage.list({ prefix: 'u:' });
    const counts = {};
    for (const u of users.values()){ if (u.vote) counts[u.vote] = (counts[u.vote] || 0) + 1; }
    return counts;
  }

  async startMatch(a, b){
    const match = { id: this.nextMatchId++, players: [a, b], score: [0, 0], round: 0, answered: new Set(), roundWon: false, done: false, timer: null };
    a.match = b.match = match;
    const ua = await this.getUser(a.user), ub = await this.getUser(b.user);
    this.send(a, { t: 'match_start', opp: { name: ub.name, rating: this.visibleRating(ub), flair: !!(ub.data && ['unlimited','family','family-member'].includes(ub.data.premiumPlan)) }, winPoints: WIN_POINTS });
    this.send(b, { t: 'match_start', opp: { name: ua.name, rating: this.visibleRating(ua), flair: !!(ua.data && ['unlimited','family','family-member'].includes(ua.data.premiumPlan)) }, winPoints: WIN_POINTS });
    setTimeout(() => this.nextRound(match), 2500);
  }

  scoreFor(match, p){ const i = match.players.indexOf(p); return { you: match.score[i], opp: match.score[1 - i] }; }

  nextRound(match){
    if (match.done) return;
    match.round++;
    match.answered = new Set();
    match.roundWon = false;
    const seed = randSeed();
    match.players.forEach(p => this.send(p, { t: 'round', n: match.round, seed, score: this.scoreFor(match, p) }));
    clearTimeout(match.timer);
    match.timer = setTimeout(() => {
      if (!match.roundWon && !match.done){
        match.players.forEach(p => this.send(p, { t: 'round_result', n: match.round, winner: null, score: this.scoreFor(match, p) }));
        setTimeout(() => this.nextRound(match), 2200);
      }
    }, ROUND_TIMEOUT_MS);
  }

  async roundAnswer(match, conn, correct){
    if (match.done || match.roundWon || match.answered.has(conn)) return;
    match.answered.add(conn);
    const i = match.players.indexOf(conn);
    if (correct){
      match.roundWon = true;
      clearTimeout(match.timer);
      match.score[i]++;
      const u = await this.getUser(conn.user);
      match.players.forEach(p => this.send(p, { t: 'round_result', n: match.round, winner: u.name, youWon: p === conn, score: this.scoreFor(match, p) }));
      if (match.score[i] >= WIN_POINTS) return this.endMatch(match, i);
      setTimeout(() => this.nextRound(match), 2200);
    } else {
      this.send(conn, { t: 'locked', n: match.round });
      if (match.answered.size >= 2 && !match.roundWon){
        clearTimeout(match.timer);
        match.players.forEach(p => this.send(p, { t: 'round_result', n: match.round, winner: null, score: this.scoreFor(match, p) }));
        setTimeout(() => this.nextRound(match), 2200);
      }
    }
  }

  async endMatch(match, wi){
    if (match.done) return;
    match.done = true;
    clearTimeout(match.timer);
    const w = match.players[wi], l = match.players[1 - wi];
    const uw = await this.getUser(w.user), ul = await this.getUser(l.user);
    const expected = 1 / (1 + Math.pow(10, (ul.rating - uw.rating) / 400));
    const delta = Math.max(1, Math.round(24 * (1 - expected)));
    uw.rating += delta;
    ul.rating = Math.max(100, ul.rating - delta);
    uw.wins++; ul.losses++;
    await this.putUser(w.user, uw);
    await this.putUser(l.user, ul);
    this.send(w, { t: 'match_end', won: true,  delta: +delta, rating: uw.rating, score: this.scoreFor(match, w) });
    this.send(l, { t: 'match_end', won: false, delta: -delta, rating: ul.rating, score: this.scoreFor(match, l) });
    match.players.forEach(p => { p.match = null; });
  }

  forfeit(match, quitter){
    if (match.done) return;
    this.endMatch(match, 1 - match.players.indexOf(quitter));
  }
}
