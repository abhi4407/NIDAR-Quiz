window.parseBulk = function parseBulk() {
  const lines = document.querySelector('#bulk').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const questions = [];
  let current;

  const startQuestion = (text) => {
    current = { text, options: ['', '', '', ''], answer: '', timer: 30, points: 10 };
    questions.push(current);
  };

  for (const line of lines) {
    const numbered = line.match(/^(?:Q\s*)?\d+\s*[.):]\s*(.*)$/i);
    if (numbered) {
      startQuestion(numbered[1]);
      continue;
    }

    const answer = line.match(/^(?:Ans(?:wer)?|Correct\s+answer)\s*:\s*(.*)$/i);
    if (answer) {
      if (!current) startQuestion('');
      current.answer = answer[1].trim().toUpperCase();
      continue;
    }

    if (/^[A-D][.)]\s*/i.test(line)) {
      if (!current) startQuestion('');
      for (const option of line.matchAll(/(?:^|\s)([A-D])[.)]\s*(.*?)(?=\s+[A-D][.)]|$)/gi)) {
        current.options[option[1].toUpperCase().charCodeAt(0) - 65] = option[2].trim();
      }
      continue;
    }

    if (!current || current.answer || current.options.some(Boolean)) startQuestion(line);
    else current.text += `${current.text ? ' ' : ''}${line}`;
  }

  const parsed = questions.filter((question) => question.text).map((question) => {
    const isMcq = question.options.every(Boolean);
    return {
      ...question,
      type: isMcq ? 'mcq' : 'fill',
      answer: question.answer
    };
  });

  window.builderQuestions = parsed;
  renderBuilders();
  toast(parsed.length
    ? `Parsed ${parsed.length} question(s). Confirm each correct answer.`
    : 'No questions found. Put each question on its own line or start it with Q1.');
};
