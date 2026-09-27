const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));

// ====== НАСТРОЙКИ (только здесь, клиент их не видит) ======
const ADMIN_CODE = 'Madina19';
const USER_CODE = 'QUIZZZ';
const QUESTION_TIME = 15000; // 15 секунд на вопрос
const REVEAL_TIME = 3000;    // показ правильного ответа между вопросами
const MAX_POINTS = 1000;
const MIN_POINTS = 100;

// ====== ВОПРОСЫ: хранятся ТОЛЬКО на сервере ======
const questions = [
  { q: { ru: "Какая структура ядра Windows NT представляет процесс на уровне ядра?",
         kz: "Windows NT ядросындағы процесті ядро деңгейінде ұсынатын құрылым қандай?" },
    o: ["ETHREAD", "EPROCESS", "KPROCESS", "PEB"], a: 1 },
  { q: { ru: "Сколько приоритетов потоков поддерживает планировщик Windows NT?",
         kz: "Windows NT жоспарлаушысы ағындардың қанша басымдығын қолдайды?" },
    o: ["16 (0-15)", "32 (0-31)", "64 (0-63)", "128 (0-127)"], a: 1 },
  { q: { ru: "Что такое IRQL в Windows NT?",
         kz: "Windows NT жүйесіндегі IRQL дегеніміз не?" },
    o: ["Уровень привилегий пользователя", "Уровень запроса прерывания",
        "Код возврата функции", "Идентификатор потока"], a: 1 },
  { q: { ru: "Какой тип APC выполняется в контексте пользовательского режима?",
         kz: "Пайдаланушы режимі контекстінде орындалатын APC түрі қандай?" },
    o: ["Kernel-mode APC", "User-mode APC", "Special kernel APC", "DPC"], a: 1 },
  { q: { ru: "Что делает функция KeWaitForSingleObject?",
         kz: "KeWaitForSingleObject функциясы не істейді?" },
    o: ["Создаёт новый поток", "Ожидает перевода объекта в сигнальное состояние",
        "Завершает процесс", "Повышает приоритет"], a: 1 },
  { q: { ru: "Какая структура содержит информацию о пользовательском режиме процесса?",
         kz: "Процестің пайдаланушы режимі туралы ақпараты бар құрылым қайсы?" },
    o: ["EPROCESS", "KPROCESS", "PEB (Process Environment Block)", "TEB"], a: 2 },
  { q: { ru: "Что такое DPC (Deferred Procedure Call)?",
         kz: "DPC (Deferred Procedure Call) дегеніміз не?" },
    o: ["Синхронный вызов функции", "Отложенный вызов процедуры после ISR",
        "Системный вызов из user mode", "Межпроцессное взаимодействие"], a: 1 },
  { q: { ru: "Какой квант времени по умолчанию для потока в Windows NT (единиц)?",
         kz: "Windows NT жүйесіндегі ағын үшін әдепкі квант уақыты қанша?" },
    o: ["2 единицы", "6 единиц", "18 единиц", "36 единиц"], a: 2 },
  { q: { ru: "Какой уровень IRQL является самым высоким?",
         kz: "Ең жоғары IRQL деңгейі қайсы?" },
    o: ["PASSIVE_LEVEL", "APC_LEVEL", "DISPATCH_LEVEL", "HIGH_LEVEL"], a: 3 },
  { q: { ru: "Что такое Job Object в Windows NT?",
         kz: "Windows NT-дағы Job Object деген не?" },
    o: ["Файл задания печати", "Контейнер для группы процессов с ограничениями",
        "Системный процесс бездействия", "Объект синхронизации потоков"], a: 1 },
  { q: { ru: "Какой API пользовательского режима используется для создания нового процесса?",
         kz: "Жаңа процесті құру үшін пайдаланушы режиміндегі API қандай?" },
    o: ["NtCreateThread", "CreateProcess", "KeAttachProcess", "PsCreateSystemThread"], a: 1 },
  { q: { ru: "Что такое affinity mask у потока?",
         kz: "Ағынның affinity mask дегеніміз не?" },
    o: ["Маска привилегий", "Битовая маска допустимых процессоров для потока",
        "Маска памяти процесса", "Фильтр прерываний"], a: 1 },
  { q: { ru: "Какие два состояния имеет диспетчерный объект Windows NT?",
         kz: "Windows NT диспетчерлік объектісінің қандай екі күйі бар?" },
    o: ["Активное и пассивное", "Сигнальное и несигнальное",
        "Запущенное и остановленное", "Привилегированное и пользовательское"], a: 1 },
  { q: { ru: "Что такое fiber в Windows?",
         kz: "Windows-тағы fiber (талшық) деген не?" },
    o: ["Аппаратный поток", "Поток пользовательского режима, управляемый приложением",
        "Системный драйвер", "Тип APC"], a: 1 },
  { q: { ru: "Какой компонент ядра отвечает за переключение контекста потоков?",
         kz: "Ағындар контекстін ауыстыруға жауапты ядро компоненті қайсы?" },
    o: ["Memory Manager", "I/O Manager", "Scheduler / Dispatcher", "Object Manager"], a: 2 }
];

// ====== СОСТОЯНИЕ ИГРЫ ======
let phase = 'idle';          // idle | playing | finished
let currentQ = -1;
let questionStartedAt = 0;
let questionTimer = null;
let revealTimer = null;
const users = new Map();
const admins = new Set();
let nextId = 1;

const isAdmin = s => admins.has(s.id);
const userOf = s => users.get(s.data.userId);
const sanitize = str => String(str || '').replace(/[<>&"']/g, '').trim().slice(0, 30);

function userList() {
  return [...users.values()]
    .map(u => ({ id: u.id, name: u.name, status: u.status, score: u.score,
                 progress: u.progress, online: !!u.socketId }))
    .sort((a, b) => b.score - a.score);
}

function broadcastAdmin() {
  io.to('admins').emit('admin:update', {
    phase, currentQ, total: questions.length, users: userList()
  });
}

function broadcastLobby() {
  const waiting = [...users.values()].filter(u => u.status === 'waiting').map(u => u.name);
  io.emit('lobby:update', { phase, waiting });
}

// ====== ХОД ТЕСТА (управляется сервером) ======
function startQuiz() {
  clearTimeout(questionTimer);
  clearTimeout(revealTimer);
  phase = 'playing';
  currentQ = -1;
  users.forEach(u => {
    if (u.status !== 'kicked') { u.status = 'playing'; u.score = 0; u.progress = 0; }
  });
  broadcastLobby();
  nextQuestion();
}

function nextQuestion() {
  currentQ++;
  if (currentQ >= questions.length) return finishQuiz();
  questionStartedAt = Date.now();
  users.forEach(u => { u.answeredCurrent = false; });
  io.emit('quiz:question', {
    qIndex: currentQ,
    total: questions.length,
    deadline: questionStartedAt + QUESTION_TIME,
    serverTime: Date.now(),
    q: questions[currentQ].q,
    o: questions[currentQ].o
  });
  broadcastAdmin();
  questionTimer = setTimeout(endQuestion, QUESTION_TIME + 300);
}

function endQuestion() {
  users.forEach(u => {
    if (u.status === 'playing') u.progress = currentQ + 1;
  });
  io.emit('quiz:questionEnd', { qIndex: currentQ, correct: questions[currentQ].a });
  broadcastAdmin();
  revealTimer = setTimeout(nextQuestion, REVEAL_TIME);
}

function finishQuiz() {
  phase = 'finished';
  users.forEach(u => {
    if (u.status === 'playing') { u.status = 'finished'; u.progress = questions.length; }
  });
  io.emit('quiz:finished', { leaderboard: userList() });
  broadcastLobby();
  broadcastAdmin();
}

// ====== ПОДКЛЮЧЕНИЯ ======
io.on('connection', socket => {

  // Проверка кода
  socket.on('join', ({ code }) => {
    code = String(code || '').trim();
    if (code === ADMIN_CODE) {
      admins.add(socket.id);
      socket.join('admins');
      socket.emit('join:admin');
      broadcastAdmin();
      return;
    }
    if (code === USER_CODE) return socket.emit('join:needName');
    socket.emit('join:error', { key: 'wrongCode' });
  });

  // Регистрация / переподключение игрока
  socket.on('register', ({ code, name }) => {
    if (String(code || '').trim() !== USER_CODE)
      return socket.emit('register:error', { key: 'wrongCode' });
    name = sanitize(name);
    if (!name) return socket.emit('register:error', { key: 'nameRequired' });

    let user = [...users.values()].find(u => u.name.toLowerCase() === name.toLowerCase());
    if (user && user.status === 'kicked')
      return socket.emit('register:error', { key: 'kicked' });
    // имя занято активным (онлайн) игроком
    if (user && user.socketId && user.socketId !== socket.id)
      return socket.emit('register:error', { key: 'nameTaken' });
    // новый игрок не может зайти, когда тест уже идёт
    if (!user && phase === 'playing')
      return socket.emit('register:error', { key: 'alreadyStarted' });

    if (!user) {
      user = { id: 'u' + nextId++, name, score: 0, progress: 0,
               status: 'waiting', answeredCurrent: false, socketId: socket.id };
      users.set(user.id, user);
    } else {
      user.socketId = socket.id; // возврат после обрыва/перезагрузки
      if (phase === 'idle') user.status = 'waiting';
      else if (phase === 'playing' && user.status !== 'finished') user.status = 'playing';
    }
    socket.data.userId = user.id;

    const payload = {
      user: { id: user.id, name: user.name, score: user.score, progress: user.progress },
      phase,
      serverTime: Date.now()
    };
    // если игрок вернулся посреди вопроса — досылаем текущий вопрос
    if (phase === 'playing' && user.status === 'playing' && currentQ >= 0) {
      payload.question = {
        qIndex: currentQ, total: questions.length,
        deadline: questionStartedAt + QUESTION_TIME,
        serverTime: Date.now(),
        q: questions[currentQ].q, o: questions[currentQ].o,
        answered: user.answeredCurrent
      };
    }
    socket.emit('joined', payload);
    broadcastLobby();
    broadcastAdmin();
  });

  // Ответ игрока (очки считает СЕРВЕР по своему времени)
  socket.on('answer', ({ choice }) => {
    const u = userOf(socket);
    if (!u || phase !== 'playing' || u.status !== 'playing' || u.answeredCurrent) return;
    const elapsed = Date.now() - questionStartedAt;
    if (elapsed > QUESTION_TIME) return;
    u.answeredCurrent = true;
    u.progress = currentQ + 1;
    const correct = Number(choice) === questions[currentQ].a;
    let points = 0;
    if (correct) {
      const frac = Math.min(1, elapsed / QUESTION_TIME);
      points = Math.round(MAX_POINTS - frac * (MAX_POINTS - MIN_POINTS));
      u.score += points;
    }
    socket.emit('answer:result', { correct, points, score: u.score });
    broadcastAdmin();
  });

  // Клиент сам сообщил о переключении вкладки/приложения
  socket.on('cheat', () => {
    const u = userOf(socket);
    if (!u) return;
    u.status = 'kicked';
    socket.emit('kicked');
    broadcastLobby();
    broadcastAdmin();
  });

  // Выход
  socket.on('leave', () => {
    const u = userOf(socket);
    if (!u) return;
    if (phase === 'idle') users.delete(u.id); // до старта — убираем из списка
    else u.socketId = null;                    // после старта — храним результат
    broadcastLobby();
    broadcastAdmin();
  });

  // ====== АДМИН ======
  socket.on('admin:start', () => {
    if (!isAdmin(socket) || phase === 'playing') return;
    startQuiz();
  });
  socket.on('admin:stop', () => {
    if (!isAdmin(socket)) return;
    clearTimeout(questionTimer); clearTimeout(revealTimer);
    phase = 'idle'; currentQ = -1;
    users.forEach(u => { if (u.status !== 'kicked') { u.status = 'waiting'; u.score = 0; u.progress = 0; } });
    io.emit('quiz:stopped');
    broadcastLobby(); broadcastAdmin();
  });
  socket.on('admin:reset', () => {
    if (!isAdmin(socket)) return;
    clearTimeout(questionTimer); clearTimeout(revealTimer);
    phase = 'idle'; currentQ = -1;
    users.forEach(u => { if (u.status !== 'kicked') { u.status = 'waiting'; u.score = 0; u.progress = 0; } });
    io.emit('quiz:stopped');
    broadcastLobby(); broadcastAdmin();
  });
  socket.on('admin:clear', () => {
    if (!isAdmin(socket)) return;
    clearTimeout(questionTimer); clearTimeout(revealTimer);
    phase = 'idle'; currentQ = -1;
    users.forEach(u => { if (u.socketId) io.to(u.socketId).emit('kicked'); });
    users.clear();
    broadcastLobby(); broadcastAdmin();
  });
  socket.on('admin:kick', ({ userId }) => {
    if (!isAdmin(socket)) return;
    const u = users.get(userId);
    if (!u) return;
    u.status = 'kicked';
    if (u.socketId) io.to(u.socketId).emit('kicked');
    broadcastLobby(); broadcastAdmin();
  });
  socket.on('admin:resetUser', ({ userId }) => {
    if (!isAdmin(socket)) return;
    const u = users.get(userId);
    if (!u) return;
    u.score = 0; u.progress = 0; u.answeredCurrent = false;
    broadcastAdmin();
  });

  socket.on('disconnect', () => {
    admins.delete(socket.id);
    const u = userOf(socket);
    if (u) u.socketId = null;
    broadcastLobby();
    broadcastAdmin();
  });
});

// ====== ЗАПУСК ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅ Сервер запущен: http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`📱 Для телефонов (эта же Wi-Fi сеть): http://${net.address}:${PORT}`);
      }
    }
  }
});
