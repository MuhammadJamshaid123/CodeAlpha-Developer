const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const { ready } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 3003;
let db;

app.set('trust proxy', 1);
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'codealpha-pm-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  next();
}

async function notifyUser(userId, message) {
  await db.prepare('INSERT INTO notifications (user_id, message) VALUES (?, ?)').run(userId, message);
  io.to(`user-${userId}`).emit('notification', { message, created_at: new Date().toISOString() });
}

async function isProjectMember(projectId, userId) {
  const project = await db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return false;
  if (project.owner_id === userId) return true;
  return !!(await db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId));
}

io.on('connection', (socket) => {
  socket.on('join-user', (userId) => socket.join(`user-${userId}`));
  socket.on('join-project', (projectId) => socket.join(`project-${projectId}`));
});

app.get('/api/health', (req, res) => res.json({ ok: true, database: db?.isPostgres ? 'postgresql' : 'sqlite' }));

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hash);
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    res.json({ success: true, username });
  } catch (e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(req.body.username);
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

app.get('/api/users', requireAuth, async (req, res) => {
  res.json(await db.prepare('SELECT id, username FROM users').all());
});

app.get('/api/projects', requireAuth, async (req, res) => {
  const projects = await db.prepare(`
    SELECT p.*, u.username as owner_name FROM projects p
    JOIN users u ON u.id = p.owner_id
    WHERE p.owner_id = ? OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
    ORDER BY p.created_at DESC
  `).all(req.session.userId, req.session.userId);
  res.json(projects);
});

app.post('/api/projects', requireAuth, async (req, res) => {
  const { name, description } = req.body;
  const result = await db.prepare('INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)').run(name, description || '', req.session.userId);
  await db.prepare('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(result.lastInsertRowid, req.session.userId, 'owner');
  io.emit('project-created', { id: result.lastInsertRowid, name });
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/projects/:id', requireAuth, async (req, res) => {
  if (!(await isProjectMember(req.params.id, req.session.userId))) return res.status(403).json({ error: 'Access denied' });
  const project = await db.prepare('SELECT p.*, u.username as owner_name FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?').get(req.params.id);
  const members = await db.prepare(`
    SELECT u.id, u.username, pm.role FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ?
  `).all(req.params.id);
  const tasks = await db.prepare(`
    SELECT t.*, u.username as assignee_name FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id WHERE t.project_id = ? ORDER BY t.position, t.created_at
  `).all(req.params.id);
  res.json({ project, members, tasks });
});

app.post('/api/projects/:id/members', requireAuth, async (req, res) => {
  const projectId = req.params.id;
  if (!(await isProjectMember(projectId, req.session.userId))) return res.status(403).json({ error: 'Access denied' });
  const { userId } = req.body;
  try {
    await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?)').run(projectId, userId);
    const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    await notifyUser(userId, 'You were added to a project');
    io.to(`project-${projectId}`).emit('member-added', { userId, username: user.username });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'User already a member' });
  }
});

app.post('/api/projects/:id/tasks', requireAuth, async (req, res) => {
  const projectId = req.params.id;
  if (!(await isProjectMember(projectId, req.session.userId))) return res.status(403).json({ error: 'Access denied' });
  const { title, description, assignee_id, status } = req.body;
  const maxPos = await db.prepare('SELECT COALESCE(MAX(position), 0) as m FROM tasks WHERE project_id = ? AND status = ?').get(projectId, status || 'todo');
  const result = await db.prepare('INSERT INTO tasks (project_id, title, description, assignee_id, status, position) VALUES (?, ?, ?, ?, ?, ?)').run(
    projectId, title, description || '', assignee_id || null, status || 'todo', maxPos.m + 1
  );
  if (assignee_id) await notifyUser(assignee_id, `You were assigned: ${title}`);
  io.to(`project-${projectId}`).emit('task-updated', { action: 'created', taskId: result.lastInsertRowid });
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task || !(await isProjectMember(task.project_id, req.session.userId))) return res.status(403).json({ error: 'Access denied' });
  const { title, description, status, assignee_id, position } = req.body;
  await db.prepare('UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), assignee_id = COALESCE(?, assignee_id), position = COALESCE(?, position) WHERE id = ?')
    .run(title, description, status, assignee_id, position, req.params.id);
  if (assignee_id && assignee_id !== task.assignee_id) {
    await notifyUser(assignee_id, `You were assigned: ${title || task.title}`);
  }
  io.to(`project-${task.project_id}`).emit('task-updated', { action: 'updated', taskId: task.id });
  res.json({ success: true });
});

app.get('/api/tasks/:id/comments', requireAuth, async (req, res) => {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task || !(await isProjectMember(task.project_id, req.session.userId))) return res.status(403).json({ error: 'Access denied' });
  const comments = await db.prepare(`
    SELECT c.*, u.username FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json(comments);
});

app.post('/api/tasks/:id/comments', requireAuth, async (req, res) => {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task || !(await isProjectMember(task.project_id, req.session.userId))) return res.status(403).json({ error: 'Access denied' });
  const { text } = req.body;
  await db.prepare('INSERT INTO task_comments (task_id, user_id, text) VALUES (?, ?, ?)').run(req.params.id, req.session.userId, text);
  if (task.assignee_id && task.assignee_id !== req.session.userId) {
    await notifyUser(task.assignee_id, `New comment on: ${task.title}`);
  }
  io.to(`project-${task.project_id}`).emit('task-updated', { action: 'commented', taskId: task.id });
  res.json({ success: true });
});

app.get('/api/notifications', requireAuth, async (req, res) => {
  const notifications = await db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(req.session.userId);
  res.json(notifications);
});

app.post('/api/notifications/read', requireAuth, async (req, res) => {
  await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.session.userId);
  res.json({ success: true });
});

ready.then((d) => {
  db = d;
  server.listen(PORT, () => console.log(`Project Management Tool running at http://localhost:${PORT}`));
}).catch((err) => {
  console.error('Database connection failed:', err);
  process.exit(1);
});
