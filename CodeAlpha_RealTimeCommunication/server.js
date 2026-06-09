const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const CryptoJS = require('crypto-js');
const db = require('./db');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://codealpha-realtimecommunication.netlify.app';
const ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'https://codealpha-rtc.onrender.com',
  'https://codealpha-realtimecommunication.onrender.com',
  'http://localhost:3004'
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ALLOWED_ORIGINS, credentials: true } });
const PORT = process.env.PORT || 3004;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'codealpha-secure-key-2024';

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.set('trust proxy', 1);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'codealpha-rtc-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

const rooms = new Map();

function encryptData(data) {
  return CryptoJS.AES.encrypt(JSON.stringify(data), ENCRYPTION_KEY).toString();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  next();
}

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    res.json({ success: true, username });
  } catch (e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
  if (!user || !bcrypt.compareSync(req.body.password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({ user: { id: req.session.userId, username: req.session.username } });
});

app.post('/api/rooms', requireAuth, (req, res) => {
  const roomId = uuidv4().slice(0, 8);
  const { name } = req.body;
  db.prepare('INSERT INTO rooms (id, name, host_id) VALUES (?, ?, ?)').run(roomId, name || `Room ${roomId}`, req.session.userId);
  rooms.set(roomId, { participants: new Map(), whiteboard: [] });
  res.json({ roomId, name: name || `Room ${roomId}` });
});

app.get('/api/rooms', requireAuth, (req, res) => {
  const list = db.prepare('SELECT r.*, u.username as host_name FROM rooms r JOIN users u ON u.id = r.host_id ORDER BY r.created_at DESC').all();
  res.json(list);
});

app.post('/api/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const encryptedMeta = encryptData({ filename: req.file.originalname, size: req.file.size, uploader: req.session.username });
  res.json({
    url: `/uploads/${req.file.filename}`,
    filename: req.file.originalname,
    encrypted: encryptedMeta
  });
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    if (!rooms.has(roomId)) rooms.set(roomId, { participants: new Map(), whiteboard: [] });
    const room = rooms.get(roomId);
    room.participants.set(socket.id, { username, socketId: socket.id });

    const participants = Array.from(room.participants.values());
    socket.to(roomId).emit('user-joined', { socketId: socket.id, username });
    socket.emit('room-users', participants.filter(p => p.socketId !== socket.id));
    socket.emit('whiteboard-state', room.whiteboard);
  });

  socket.on('offer', ({ to, offer }) => socket.to(to).emit('offer', { from: socket.id, offer }));
  socket.on('answer', ({ to, answer }) => socket.to(to).emit('answer', { from: socket.id, answer }));
  socket.on('ice-candidate', ({ to, candidate }) => socket.to(to).emit('ice-candidate', { from: socket.id, candidate }));

  socket.on('chat-message', ({ roomId, message }) => {
    encryptData({ message, sender: socket.username, roomId });
    io.to(roomId).emit('chat-message', {
      username: socket.username,
      message,
      encrypted: true,
      time: new Date().toISOString()
    });
  });

  socket.on('whiteboard-draw', ({ roomId, data }) => {
    const room = rooms.get(roomId);
    if (room) room.whiteboard.push(data);
    socket.to(roomId).emit('whiteboard-draw', data);
  });

  socket.on('whiteboard-clear', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) room.whiteboard = [];
    socket.to(roomId).emit('whiteboard-clear');
  });

  socket.on('file-shared', ({ roomId, file }) => {
    socket.to(roomId).emit('file-shared', { ...file, sharedBy: socket.username });
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        room.participants.delete(socket.id);
        socket.to(socket.roomId).emit('user-left', { socketId: socket.id, username: socket.username });
      }
    }
  });
});

server.listen(PORT, () => console.log(`Real-Time Communication App running at http://localhost:${PORT}`));
