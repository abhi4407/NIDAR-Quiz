require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { Server } = require('socket.io');
const { createAdminRouter } = require('./routes/admin');

const config = { port: Number(process.env.PORT) || 3000, adminUser: process.env.ADMIN_USER || 'admin', adminPass: process.env.ADMIN_PASS || 'admin@123', participantUser: process.env.PARTICIPANT_USER || 'nidar_aerovega', participantPass: process.env.PARTICIPANT_PASS || 'nidar@123', maxParticipants: Number(process.env.MAX_PARTICIPANTS) || 7, frontendUrl: (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '') };
const allowOrigin = (origin, callback) => {
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
  const allowed = !origin || !config.frontendUrl || origin === config.frontendUrl || localOrigin;
  callback(allowed ? null : new Error('Origin not allowed.'), allowed);
};
const dataPath = path.join(__dirname, 'data.json');
let store = loadData();
store.sessions = new Map();
store.participants = new Map();
store.lastRoomCode = null;
store.live = { quizId: null, roomCode: null, questionIndex: -1, questionEnded: false, endsAt: 0, answers: new Map(), timer: null };
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowOrigin } });
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(cors({ origin: allowOrigin }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => res.json({ roomCode: store.live.roomCode || null, maxParticipants: config.maxParticipants, participantCount: store.participants.size, live: Boolean(store.live.quizId) }));
app.post('/api/login', (req, res) => {
  const { role, username, password } = req.body || {};
  if (role === 'admin' && username === config.adminUser && password === config.adminPass) return res.json({ token: issueToken('admin'), role: 'admin' });
  if (role === 'participant' && username === config.participantUser && password === config.participantPass) {
    const participantSessions = [...store.sessions.values()].filter((session) => session.role === 'participant').length;
    if (participantSessions >= config.maxParticipants) return res.status(403).json({ error: `Login limit reached (${config.maxParticipants}/${config.maxParticipants})` });
    return res.json({ token: issueToken('participant'), role: 'participant' });
  }
  res.status(401).json({ error: 'Invalid credentials.' });
});
app.post('/api/logout', auth, (req, res) => { destroySession(req.token); res.json({ ok: true }); });
app.use('/api/admin', auth, createAdminRouter({ store, requireAdmin, saveData, createRoom, emitState: startLiveQuiz }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

io.use((socket, next) => { const session = store.sessions.get(socket.handshake.auth?.token); if (!session) return next(new Error('Unauthorized')); socket.session = session; socket.token = socket.handshake.auth.token; next(); });
io.on('connection', (socket) => {
  if (socket.session.role === 'admin') {
    socket.on('next-question', () => { if (store.live.quizId) endQuestion(); nextQuestion(); });
    socket.on('end-quiz', () => { if (store.live.quizId) endQuiz(); });
  }
  if (socket.session.role === 'participant') {
    socket.on('join-room', ({ code, name }) => {
      if (!store.live.roomCode) return socket.emit('error-message', 'There is no room open. Ask the admin to create one.');
      if (String(code) !== store.live.roomCode) return socket.emit('error-message', 'Invalid room code.');
      const displayName = sanitizeText(name).slice(0, 40) || 'Anonymous pilot';
      store.participants.set(socket.id, { socketId: socket.id, name: displayName, score: 0, answers: [], joinedAt: Date.now() });
      socket.join('quiz-room');
      socket.emit('joined', { name: displayName, live: Boolean(store.live.quizId) });
      broadcastLobby();
      if (store.live.quizId) sendCurrentQuestion(socket);
    });
    socket.on('submit-answer', ({ answer }) => submitAnswer(socket, answer));
  }
  socket.on('disconnect', () => {
    if (socket.session.role === 'participant') store.sessions.delete(socket.token);
    if (store.participants.delete(socket.id)) broadcastLobby();
  });
});

function auth(req, res, next) { const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.session; const session = store.sessions.get(token); if (!session) return res.status(401).json({ error: 'Unauthorized.' }); req.token = token; req.session = session; next(); }
function requireAdmin(req, res, next) { return req.session?.role === 'admin' ? next() : res.status(403).json({ error: 'Admin access required.' }); }
function issueToken(role) { const token = crypto.randomBytes(32).toString('hex'); store.sessions.set(token, { role, createdAt: Date.now() }); return token; }
function generateRoomCode() { let roomCode; do { roomCode = String(crypto.randomInt(100000, 1000000)); } while (roomCode === store.lastRoomCode); store.lastRoomCode = roomCode; return roomCode; }
function createRoom() { if (store.live.quizId) throw new Error('End the live quiz before creating another room.'); if (store.participants.size) throw new Error('Participants are already connected to the current room.'); store.live = { quizId: null, roomCode: generateRoomCode(), questionIndex: -1, questionEnded: false, endsAt: 0, answers: new Map(), timer: null }; broadcastLobby(); return store.live.roomCode; }
function destroySession(token) { store.sessions.delete(token); }
function startLiveQuiz(verb, quiz) { if (verb !== 'start') return null; const roomCode = store.live.roomCode || createRoom(); store.live.quizId = quiz.id; store.live.questionIndex = -1; store.live.questionEnded = false; store.live.endsAt = 0; store.live.answers = new Map(); store.live.timer = null; nextQuestion(); return roomCode; }
function nextQuestion() { clearTimeout(store.live.timer); const quiz = store.quizzes.find((item) => item.id === store.live.quizId); if (!quiz) return endQuiz(); store.live.questionIndex += 1; if (store.live.questionIndex >= quiz.questions.length) return endQuiz(); store.live.answers = new Map(); store.live.questionEnded = false; const question = quiz.questions[store.live.questionIndex]; store.live.endsAt = Date.now() + question.timer * 1000; io.to('quiz-room').emit('question', { index: store.live.questionIndex, total: quiz.questions.length, text: question.text, type: question.type, options: question.options, endsAt: store.live.endsAt, timer: question.timer, points: question.points }); store.live.timer = setTimeout(endQuestion, question.timer * 1000); broadcastLobby(); }
function endQuestion() { const quiz = store.quizzes.find((item) => item.id === store.live.quizId); if (!quiz || store.live.questionIndex < 0 || store.live.questionEnded) return; store.live.questionEnded = true; const question = quiz.questions[store.live.questionIndex]; for (const participant of store.participants.values()) { const answer = store.live.answers.get(participant.socketId); participant.answers[store.live.questionIndex] = { answer: answer ?? '', correct: isCorrect(question, answer) }; if (isCorrect(question, answer)) participant.score += question.points; } io.to('quiz-room').emit('question-ended', { index: store.live.questionIndex }); }
function submitAnswer(socket, answer) { const quiz = store.quizzes.find((item) => item.id === store.live.quizId); if (!quiz || Date.now() >= store.live.endsAt || store.live.answers.has(socket.id)) return; const participant = store.participants.get(socket.id); if (!participant) return; store.live.answers.set(socket.id, sanitizeText(answer).slice(0, 500)); socket.emit('answer-accepted'); }
function endQuiz() { clearTimeout(store.live.timer); const quiz = store.quizzes.find((item) => item.id === store.live.quizId); if (!quiz) return; endQuestion(); const ranking = [...store.participants.values()].sort((a, b) => b.score - a.score); const leaderboard = ranking.map((participant, index) => ({ name: participant.name, score: participant.score, rank: index + 1 })); for (const participant of ranking) store.results.push({ name: participant.name, score: participant.score, rank: leaderboard.find((entry) => entry.name === participant.name)?.rank, quizTitle: quiz.title, submittedAt: new Date().toISOString() }); saveData(); io.to('quiz-room').emit('quiz-ended', { leaderboard, quiz: { title: quiz.title } }); for (const participant of store.participants.values()) io.sockets.sockets.get(participant.socketId)?.leave('quiz-room'); store.participants.clear(); store.live = { quizId: null, roomCode: null, questionIndex: -1, endsAt: 0, answers: new Map(), timer: null }; broadcastLobby(); }
function sendCurrentQuestion(socket) { const quiz = store.quizzes.find((item) => item.id === store.live.quizId); const question = quiz?.questions[store.live.questionIndex]; if (question && Date.now() < store.live.endsAt) socket.emit('question', { index: store.live.questionIndex, total: quiz.questions.length, text: question.text, type: question.type, options: question.options, endsAt: store.live.endsAt, timer: question.timer, points: question.points }); }
function broadcastLobby() { io.emit('lobby-state', { participants: [...store.participants.values()].map(({ name, score }) => ({ name, score })), count: store.participants.size, max: config.maxParticipants, live: Boolean(store.live.quizId), questionIndex: store.live.questionIndex }); }
function isCorrect(question, answer) { if (answer == null) return false; return question.type === 'mcq' ? String(answer).toUpperCase() === question.answer : question.answer.includes(String(answer).trim().toLowerCase()); }
function sanitizeText(value) { return String(value ?? '').replace(/[<>]/g, ''); }
function loadData() { try { return JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch { return { quizzes: [], results: [] }; } }
function saveData() { fs.writeFileSync(dataPath, JSON.stringify({ quizzes: store.quizzes, results: store.results }, null, 2)); }
server.listen(config.port, '0.0.0.0', () => console.log(`NIDAR Quiz running on http://localhost:${config.port}`));
