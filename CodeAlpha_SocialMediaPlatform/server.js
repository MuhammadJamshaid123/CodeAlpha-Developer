const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { ready } = require('./db');
const { getSessionMiddleware } = require('../shared/session-config');

const app = express();
const PORT = process.env.PORT || 3002;
let db;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(getSessionMiddleware({ secret: 'codealpha-social-secret', projectDir: __dirname }));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  next();
}

app.get('/api/health', async (req, res) => {
  const row = await db.prepare('SELECT COUNT(*) as count FROM users').get();
  res.json({ ok: true, database: db?.isPostgres ? 'postgresql' : 'sqlite', usersStored: Number(row.count) });
});

app.post('/api/register', async (req, res) => {
  const { username, password, bio } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.prepare('INSERT INTO users (username, password, bio) VALUES (?, ?, ?)').run(username, hash, bio || '');
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    res.json({ success: true, username, userId: result.lastInsertRowid, storedInDatabase: true });
  } catch (e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await db.prepare('SELECT id, username, bio FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user });
});

app.get('/api/posts', async (req, res) => {
  const posts = await db.prepare(`
    SELECT p.*, u.username,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
    FROM posts p JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
  `).all();
  const withLiked = await Promise.all(posts.map(async (p) => ({
    ...p,
    liked: req.session.userId
      ? !!(await db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.session.userId, p.id))
      : false
  })));
  res.json(withLiked);
});

app.post('/api/posts', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
  const result = await db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.session.userId, content.trim());
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/posts/:id', async (req, res) => {
  const post = await db.prepare(`
    SELECT p.*, u.username,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const comments = await db.prepare(`
    SELECT c.*, u.username FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  post.comments = comments;
  post.liked = req.session.userId
    ? !!(await db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.session.userId, post.id))
    : false;
  res.json(post);
});

app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  const postId = req.params.id;
  const existing = await db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.session.userId, postId);
  if (existing) {
    await db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.session.userId, postId);
    res.json({ liked: false });
  } else {
    await db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').run(req.session.userId, postId);
    res.json({ liked: true });
  }
});

app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Comment text required' });
  const result = await db.prepare('INSERT INTO comments (post_id, user_id, text) VALUES (?, ?, ?)').run(req.params.id, req.session.userId, text.trim());
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/users/:username', async (req, res) => {
  const user = await db.prepare('SELECT id, username, bio FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const posts = await db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count
    FROM posts p WHERE p.user_id = ? ORDER BY p.created_at DESC
  `).all(user.id);
  const followerCount = (await db.prepare('SELECT COUNT(*) as c FROM followers WHERE following_id = ?').get(user.id)).c;
  const followingCount = (await db.prepare('SELECT COUNT(*) as c FROM followers WHERE follower_id = ?').get(user.id)).c;
  let isFollowing = false;
  if (req.session.userId) {
    isFollowing = !!(await db.prepare('SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ?').get(req.session.userId, user.id));
  }
  res.json({ user, posts, followerCount, followingCount, isFollowing });
});

app.post('/api/users/:username/follow', requireAuth, async (req, res) => {
  const target = await db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.session.userId) return res.status(400).json({ error: 'Cannot follow yourself' });
  const existing = await db.prepare('SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ?').get(req.session.userId, target.id);
  if (existing) {
    await db.prepare('DELETE FROM followers WHERE follower_id = ? AND following_id = ?').run(req.session.userId, target.id);
    res.json({ following: false });
  } else {
    await db.prepare('INSERT INTO followers (follower_id, following_id) VALUES (?, ?)').run(req.session.userId, target.id);
    res.json({ following: true });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const { bio } = req.body;
  await db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio || '', req.session.userId);
  res.json({ success: true });
});

ready.then((d) => {
  db = d;
  app.listen(PORT, () => console.log(`Social Media Platform running at http://localhost:${PORT}`));
}).catch((err) => {
  console.error('Database connection failed:', err);
  process.exit(1);
});
