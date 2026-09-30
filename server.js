// NIDAR Quiz server - Team AEROVEGA
const express = require('express'), http = require('http'), fs = require('fs'), crypto = require('crypto');

// Settings (override with environment variables if needed)
const C = {
  port: process.env.PORT || 3000,
  aUser: process.env.ADMIN_USER || 'admin',
  aPass: process.env.ADMIN_PASS || 'admin@123',
  pUser: process.env.PARTICIPANT_USER || 'nidar_aerovega',
  pPass: process.env.PARTICIPANT_PASS || 'nidar@123',
  code: process.env.ROOM_CODE || '123456',
  max: +process.env.MAX_PARTICIPANTS || 7,
};

const app = express(), srv = http.createServer(app), io = require('socket.io')(srv);
app.use(express.static(__dirname + '/public'));

let quizzes = [];
try { quizzes = JSON.parse(fs.readFileSync('data.json', 'utf8')); } catch {}
const save = () => fs.writeFileSync('data.json', JSON.stringify(quizzes, null, 1));

const sessions = new Map(); // token -> session
let live = null, qTimer = null; // live = { quizId, phase: lobby|question|closed|done, idx, endsAt }

const parts = () => [...sessions.values()].filter(s => s.role === 'p');
const admins = () => [...sessions.values()].filter(s => s.role === 'a' && s.sid);
const quiz = () => live && quizzes.find(q => q.id === live.quizId);
const board = () => parts().map(p => ({ name: p.name, score: p.score })).sort((a, b) => b.score - a.score);
const norm = v => String(v).trim().toLowerCase().replace(/\s+/g, ' ');

// Public state. Correct answers are never included here.
function state() {
  const q = quiz();
  const x = q && live.idx >= 0 && live.phase !== 'done' ? q.questions[live.idx] : null;
  return {
    phase: live ? live.phase : 'idle', title: q && q.title, total: q && q.questions.length,
    idx: live && live.idx, secs: x && x.secs,
    left: live && live.phase === 'question' ? Math.max(0, live.endsAt - Date.now()) : 0,
    players: parts().filter(p => p.joined).map(p => p.name), max: C.max, code: C.code,
    answered: live && live.idx >= 0 ? parts().filter(p => p.answers[live.idx] !== undefined).length : 0,
    board: board(),
    question: x && { text: x.text, type: x.type, options: x.options, points: x.points },
  };
}
const broadcast = () => io.emit('state', state());
const sendQuizzes = () => admins().forEach(a => io.to(a.sid).emit('quizzes', quizzes));

// Final results with correct answers, sent only after the quiz ends
function results(s) {
  const q = quiz();
  if (!q || !live || live.phase !== 'done') return null;
  const rank = board().findIndex(b => b.name === s.name && b.score === s.score) + 1;
  return {
    score: s.score, rank,
    items: q.questions.map((x, i) => ({
      text: x.text,
      correct: x.type === 'mcq' ? x.options[x.answer] : x.answer.split('|').map(a => a.trim()).join(' / '),
      yours: s.answers[i] === undefined ? null : x.type === 'mcq' ? x.options[s.answers[i]] : s.answers[i],
      ok: !!s.ok[i],
    })),
  };
}

function next() {
  clearTimeout(qTimer);
  live.idx++;
  const q = quiz();
  if (live.idx >= q.questions.length) return finish();
  const x = q.questions[live.idx];
  live.phase = 'question';
  live.endsAt = Date.now() + x.secs * 1000;
  qTimer = setTimeout(() => { live.phase = 'closed'; broadcast(); }, x.secs * 1000);
  broadcast();
}
function finish() {
  clearTimeout(qTimer);
  live.phase = 'done';
  broadcast();
  parts().forEach(p => p.sid && io.to(p.sid).emit('results', results(p)));
}

io.on('connection', sock => {
  let tok = null;
  const S = () => sessions.get(tok);

  const enter = (t, s, cb) => {
    tok = t; s.sid = sock.id; clearTimeout(s.drop);
    cb({ ok: true, token: t, role: s.role, name: s.name, joined: s.joined });
    if (s.role === 'a') sock.emit('quizzes', quizzes);
    sock.emit('state', state());
    const r = s.role === 'p' && results(s);
    if (r) sock.emit('results', r);
    broadcast();
  };

  sock.on('login', (d, cb) => {
    d = d || {};
    if (d.token && sessions.has(d.token)) return enter(d.token, sessions.get(d.token), cb);
    if (d.token) return cb({ ok: false, err: 'Session expired. Log in again.' });
    if (d.role === 'a') {
      if (d.user !== C.aUser || d.pass !== C.aPass) return cb({ ok: false, err: 'Wrong admin username or password.' });
      const t = crypto.randomUUID(); sessions.set(t, { role: 'a', name: 'Admin' });
      return enter(t, sessions.get(t), cb);
    }
    if (d.user !== C.pUser || d.pass !== C.pPass) return cb({ ok: false, err: 'Wrong username or password.' });
    const name = String(d.name || '').trim().slice(0, 20);
    if (!name) return cb({ ok: false, err: 'Enter your name.' });
    if (parts().length >= C.max) return cb({ ok: false, err: `Login limit reached (${C.max}/${C.max}). Try again when someone leaves.` });
    const t = crypto.randomUUID();
    sessions.set(t, { role: 'p', name, score: 0, answers: {}, ok: {}, joined: false });
    enter(t, sessions.get(t), cb);
  });

  sock.on('join', (code, cb) => {
    const s = S();
    if (!s || s.role !== 'p') return;
    if (String(code).trim() !== C.code) return cb({ ok: false, err: 'Invalid room code.' });
    s.joined = true; cb({ ok: true }); broadcast();
  });

  sock.on('answer', (v, cb) => {
    const s = S();
    if (!s || s.role !== 'p' || !live || live.phase !== 'question' || Date.now() > live.endsAt + 300 || s.answers[live.idx] !== undefined) return cb({ ok: false });
    const x = quiz().questions[live.idx];
    let ok;
    if (x.type === 'mcq') { v = +v; if (!(v >= 0 && v < x.options.length)) return cb({ ok: false }); ok = v === x.answer; }
    else { v = String(v).slice(0, 200); ok = x.answer.split('|').some(a => norm(a) === norm(v)); }
    s.answers[live.idx] = v; s.ok[live.idx] = ok;
    if (ok) s.score += x.points;
    cb({ ok: true }); broadcast();
  });

  // ---- Admin only ----
  const A = fn => (...a) => { const s = S(); if (s && s.role === 'a') fn(...a); };

  sock.on('saveQuiz', A((d, cb) => {
    const qs = (d.questions || []).slice(0, 200).map(x => ({
      type: x.type === 'mcq' ? 'mcq' : 'fill',
      text: String(x.text || '').trim().slice(0, 500),
      options: x.type === 'mcq' ? (x.options || []).slice(0, 6).map(o => String(o).slice(0, 200)) : [],
      answer: x.type === 'mcq' ? +x.answer : String(x.answer || '').trim().slice(0, 200),
      points: Math.min(100, Math.max(1, +x.points || 1)),
      secs: Math.min(600, Math.max(5, +x.secs || 30)),
    }));
    const bad = qs.some(x => !x.text || (x.type === 'mcq' ? x.options.length < 2 || !(x.answer >= 0 && x.answer < x.options.length) : !x.answer));
    if (!d.title || !qs.length || bad) return cb({ ok: false, err: 'Add a title and at least one valid question.' });
    // Every quiz gets the same room code
    quizzes.push({ id: crypto.randomUUID(), title: String(d.title).trim().slice(0, 80), code: C.code, questions: qs });
    save(); sendQuizzes(); cb({ ok: true });
  }));
  sock.on('delete', A(id => {
    if (live && live.quizId === id) return;
    quizzes = quizzes.filter(q => q.id !== id); save(); sendQuizzes();
  }));
  sock.on('open', A(id => {
    if (!quizzes.find(q => q.id === id)) return;
    clearTimeout(qTimer);
    live = { quizId: id, phase: 'lobby', idx: -1 };
    parts().forEach(p => { p.score = 0; p.answers = {}; p.ok = {}; });
    broadcast();
  }));
  sock.on('start', A(() => { if (live && live.phase === 'lobby') next(); }));
  sock.on('next', A(() => { if (live && (live.phase === 'question' || live.phase === 'closed')) next(); }));
  sock.on('end', A(() => { if (live && live.phase !== 'done') finish(); }));
  sock.on('closeRoom', A(() => { clearTimeout(qTimer); live = null; broadcast(); }));

  sock.on('logout', () => { if (S()) { sessions.delete(tok); tok = null; broadcast(); } });
  sock.on('disconnect', () => {
    const s = S();
    if (!s || s.sid !== sock.id) return;
    s.sid = null;
    // Free the participant slot if they do not come back within 20 seconds
    if (s.role === 'p') { const t = tok; s.drop = setTimeout(() => { sessions.delete(t); broadcast(); }, 20000); }
  });
});

srv.listen(C.port, '0.0.0.0', () => console.log(`NIDAR Quiz running on http://localhost:${C.port}`));
