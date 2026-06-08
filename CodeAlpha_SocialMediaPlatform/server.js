const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3002;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'codealpha-social-secret',
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

app.post('/api/register', (req, res) => {
  const { username, password, bio } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, bio) VALUES (?, ?, ?)').run(username, hash, bio || '');
    req.session.userId = result.lastInsertRowid;
    req.session.username = username;
    res.json({ success: true, username });
  } catch (e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ success: true, username: user.username });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, username, bio FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user });
});

app.get('/api/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.username,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
    FROM posts p JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
  `).all();
  const withLiked = posts.map(p => ({
    ...p,
    liked: req.session.userId
      ? !!db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.session.userId, p.id)
      : false
  }));
  res.json(withLiked);
});

app.post('/api/posts', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
  const result = db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.session.userId, content.trim());
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/posts/:id', (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.username,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const comments = db.prepare(`
    SELECT c.*, u.username FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  post.comments = comments;
  post.liked = req.session.userId
    ? !!db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.session.userId, post.id)
    : false;
  res.json(post);
});

app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const postId = req.params.id;
  const existing = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.session.userId, postId);
  if (existing) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.session.userId, postId);
    res.json({ liked: false });
  } else {
    db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').run(req.session.userId, postId);
    res.json({ liked: true });
  }
});

app.post('/api/posts/:id/comments', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Comment text required' });
  const result = db.prepare('INSERT INTO comments (post_id, user_id, text) VALUES (?, ?, ?)').run(req.params.id, req.session.userId, text.trim());
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/users/:username', (req, res) => {
  const user = db.prepare('SELECT id, username, bio FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const posts = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as like_count
    FROM posts p WHERE p.user_id = ? ORDER BY p.created_at DESC
  `).all(user.id);
  const followerCount = db.prepare('SELECT COUNT(*) as c FROM followers WHERE following_id = ?').get(user.id).c;
  const followingCount = db.prepare('SELECT COUNT(*) as c FROM followers WHERE follower_id = ?').get(user.id).c;
  let isFollowing = false;
  if (req.session.userId) {
    isFollowing = !!db.prepare('SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ?').get(req.session.userId, user.id);
  }
  res.json({ user, posts, followerCount, followingCount, isFollowing });
});

app.post('/api/users/:username/follow', requireAuth, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.session.userId) return res.status(400).json({ error: 'Cannot follow yourself' });
  const existing = db.prepare('SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ?').get(req.session.userId, target.id);
  if (existing) {
    db.prepare('DELETE FROM followers WHERE follower_id = ? AND following_id = ?').run(req.session.userId, target.id);
    res.json({ following: false });
  } else {
    db.prepare('INSERT INTO followers (follower_id, following_id) VALUES (?, ?)').run(req.session.userId, target.id);
    res.json({ following: true });
  }
});

app.put('/api/profile', requireAuth, (req, res) => {
  const { bio } = req.body;
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio || '', req.session.userId);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Social Media Platform running at http://localhost:${PORT}`));
