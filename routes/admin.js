const express = require('express');

function createAdminRouter({ store, requireAdmin, saveData, roomCode, emitState }) {
  const router = express.Router();

  router.use(requireAdmin);
  router.get('/quizzes', (req, res) => res.json(store.quizzes.map(publicQuiz)));
  router.post('/quizzes', (req, res) => {
    const quiz = normalizeQuiz(req.body, undefined, roomCode);
    if (!quiz.title || !quiz.questions.length) return res.status(400).json({ error: 'A title and at least one question are required.' });
    store.quizzes.push(quiz);
    saveData();
    res.status(201).json(publicQuiz(quiz));
  });
  router.put('/quizzes/:id', (req, res) => {
    const index = store.quizzes.findIndex((quiz) => quiz.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Quiz not found.' });
    const quiz = normalizeQuiz(req.body, req.params.id, roomCode);
    if (!quiz.title || !quiz.questions.length) return res.status(400).json({ error: 'A title and at least one question are required.' });
    store.quizzes[index] = quiz;
    saveData();
    res.json(publicQuiz(quiz));
  });
  router.delete('/quizzes/:id', (req, res) => {
    if (store.live.quizId === req.params.id) return res.status(409).json({ error: 'End the live quiz before deleting it.' });
    store.quizzes = store.quizzes.filter((quiz) => quiz.id !== req.params.id);
    saveData();
    res.status(204).end();
  });
  router.post('/quizzes/:id/start', (req, res) => {
    if (store.live.quizId) return res.status(409).json({ error: 'A quiz is already live.' });
    const quiz = store.quizzes.find((item) => item.id === req.params.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    emitState('start', quiz);
    res.json({ ok: true });
  });
  router.get('/results.csv', (req, res) => {
    const rows = [['Name', 'Score', 'Rank', 'Quiz', 'Submitted At']];
    for (const result of store.results) rows.push([result.name, result.score, result.rank, result.quizTitle, result.submittedAt]);
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="nidar-results.csv"');
    res.send(csv);
  });
  return router;
}

function normalizeQuiz(body, id = `quiz_${Date.now()}`, roomCode = '123456') {
  const questions = Array.isArray(body.questions) ? body.questions.slice(0, 100).map((question, index) => {
    const type = question.type === 'fill' ? 'fill' : 'mcq';
    const options = type === 'mcq' ? (Array.isArray(question.options) ? question.options.slice(0, 4).map((option) => String(option).trim()).filter(Boolean) : []) : [];
    const answers = type === 'fill' ? String(question.answer || '').split('|').map((answer) => answer.trim().toLowerCase()).filter(Boolean) : [];
    return { id: question.id || `${id}_q${index + 1}`, type, text: String(question.text || '').trim().slice(0, 1000), options, answer: type === 'mcq' ? String(question.answer || '').toUpperCase() : answers, timer: Math.min(600, Math.max(5, Number(question.timer) || 30)), points: Math.min(1000, Math.max(1, Number(question.points) || 10)) };
  }).filter((question) => question.text && (question.type === 'fill' ? question.answer.length : question.options.length === 4 && ['A', 'B', 'C', 'D'].includes(question.answer))) : [];
  return { id, title: String(body.title || '').trim().slice(0, 160), roomCode, questions, createdAt: body.createdAt || new Date().toISOString() };
}

function publicQuiz(quiz) {
  return { ...quiz, questions: quiz.questions.map(({ answer, ...question }) => ({ ...question, answer })) };
}

module.exports = { createAdminRouter };
