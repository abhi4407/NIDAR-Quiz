(() => {
  const portalRole = new URLSearchParams(window.location.search).get('portal') === 'admin' ? 'admin' : 'participant';
  const originalRenderLogin = window.renderLogin;
  const originalRenderAdmin = window.renderAdmin;
  const originalRenderParticipantJoin = window.renderParticipantJoin;
  const originalRenderBuilders = window.renderBuilders;
  const originalConnect = window.connect;

  function renderPortalLogin() {
    originalRenderLogin(portalRole);
    document.querySelector('#login-form button[type="button"]')?.remove();
  }

  function updateRoomAccess(code) {
    const codeElement = document.querySelector('#active-room-code');
    const messageElement = document.querySelector('#room-access-message');
    const copyButton = document.querySelector('#copy-participant-link');
    const createButton = document.querySelector('#create-room');
    if (!codeElement || !messageElement || !copyButton || !createButton) return;
    codeElement.textContent = code || 'No active room';
    messageElement.textContent = code ? 'Share this room code or participant link.' : 'Create a room before inviting participants.';
    copyButton.disabled = !code;
    createButton.textContent = code ? 'New Room' : 'Create Room';
    const invite = new URL(window.location.href);
    invite.search = '';
    invite.searchParams.set('portal', 'participant');
    if (code) invite.searchParams.set('room', code);
    copyButton.dataset.invite = invite.toString();
  }

  window.renderLogin = renderPortalLogin;
  window.renderLanding = renderPortalLogin;
  window.renderParticipantJoin = function renderParticipantJoinWithRoom() {
    originalRenderParticipantJoin();
    const input = document.querySelector('#join-form input[name="code"]');
    const linkedCode = new URLSearchParams(window.location.search).get('room');
    if (input && (linkedCode || roomCode)) input.value = linkedCode || roomCode;
  };
  window.renderBuilders = function renderBuildersWithUnansweredQuestions() {
    originalRenderBuilders();
    document.querySelectorAll('.question-builder').forEach((builder, index) => {
      const question = window.builderQuestions[index];
      if (question?.type !== 'mcq' || /^[A-D]$/.test(question.answer)) return;
      const answerLabel = [...builder.querySelectorAll('label')].find((label) => label.textContent.includes('Correct option'));
      const answerSelect = answerLabel?.querySelector('select');
      if (!answerSelect) return;
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose correct option';
      placeholder.selected = true;
      answerSelect.prepend(placeholder);
      answerSelect.value = '';
    });
  };
  window.renderAdmin = async function renderAdminWithRoomAccess() {
    await originalRenderAdmin();
    const grid = app.querySelector('.dashboard-grid');
    if (!grid) return;
    const roomPanel = document.createElement('section');
    roomPanel.className = 'panel';
    roomPanel.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:24px';
    roomPanel.innerHTML = '<div><div class="eyebrow">LIVE ROOM</div><h3 id="active-room-code" style="font-family:Orbitron;margin:10px 0 4px">No active room</h3><p id="room-access-message" class="muted" style="margin:0">Create a room before inviting participants.</p></div><div class="button-row" style="margin:0"><button id="create-room" class="button secondary small" type="button">Create Room</button><button id="copy-participant-link" class="button secondary small" type="button" disabled>Copy participant link</button></div>';
    app.insertBefore(roomPanel, grid);
    app.querySelectorAll('.quiz-card p').forEach((line) => { line.textContent = line.textContent.replace(/\s*·\s*Room.*$/, ''); });
    const libraryRoom = app.querySelector('.dashboard-grid .panel .section-title .status');
    if (libraryRoom) libraryRoom.textContent = roomCode ? `ROOM ${roomCode}` : 'ROOM READY';
    updateRoomAccess(roomCode);
    document.querySelector('#create-room').onclick = async () => {
      try {
        const response = await api('/api/admin/rooms', { method: 'POST' });
        roomCode = response.roomCode;
        updateRoomAccess(roomCode);
        const currentLibraryRoom = app.querySelector('.dashboard-grid .panel .section-title .status');
        if (currentLibraryRoom) currentLibraryRoom.textContent = `ROOM ${roomCode}`;
        toast(`Room ${roomCode} is ready for participants.`);
      } catch (error) {
        toast(error.message);
      }
    };
    document.querySelector('#copy-participant-link').onclick = async () => {
      try {
        await navigator.clipboard.writeText(document.querySelector('#copy-participant-link').dataset.invite);
        toast('Participant link copied.');
      } catch {
        toast('Could not copy link. Room code: ' + roomCode);
      }
    };
  };
  window.connect = function connectWithoutAnswerDisclosure() {
    originalConnect();
    if (!socket) return;
    socket.off('question-ended');
    socket.on('question-ended', () => toast('Question closed.'));
  };
  window.startQuiz = async function startQuizAndCreateRoom(id) {
    try {
      const response = await api(`/api/admin/quizzes/${id}/start`, { method: 'POST' });
      roomCode = response.roomCode;
      updateRoomAccess(roomCode);
      const libraryRoom = app.querySelector('.dashboard-grid .panel .section-title .status');
      if (libraryRoom) libraryRoom.textContent = `ROOM ${roomCode}`;
      toast(`Quiz started. Room ${roomCode} is ready.`);
    } catch (error) {
      toast(error.message);
    }
  };
   const originalSaveQuiz = window.saveQuiz;
   window.saveQuiz = async function saveQuizWithAnswerValidation(id) {
     const invalidIndex = window.builderQuestions.findIndex((question) => {
       if (!question.text.trim()) return true;
       if (question.type === 'mcq') return question.options.length !== 4 || question.options.some((option) => !option.trim()) || !/^[A-D]$/.test(question.answer);
       return !String(question.answer || '').split('|').some((answer) => answer.trim());
     });
     if (invalidIndex >= 0) {
       toast(`Complete the text, options, and correct answer for question ${invalidIndex + 1}.`);
       return;
     }
     return originalSaveQuiz(id);
   };

  if (token && role !== portalRole) {
    api('/api/logout', { method: 'POST' }).catch(() => {});
    token = null;
    role = null;
    localStorage.removeItem('nidar-token');
    localStorage.removeItem('nidar-role');
  }
  if (!token) renderPortalLogin();
})();
