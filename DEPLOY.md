# Deploy Live Links — CodeAlpha Projects

These apps are **full-stack Node.js servers** (Express + SQLite + Socket.io). They cannot run as static-only sites on Netlify alone.

## Architecture

| Layer | Platform | URL |
|-------|----------|-----|
| Portfolio landing page | **Netlify** | https://codealpha-developer.netlify.app |
| 4 backend apps | **Render** (free) | `*.onrender.com` |

---

## Step 1 — Deploy apps on Render (5 minutes)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Sign up / log in with **GitHub**
3. Click **New +** → **Blueprint**
4. Connect repo: `MuhammadJamshaid123/CodeAlpha-Developer`
5. Render detects `render.yaml` and creates **4 web services**
6. Click **Apply** and wait for all builds to finish (~5–10 min)

### Live app URLs (after Render deploy)

| Project | Live URL |
|---------|----------|
| E-commerce Store | https://codealpha-ecommerce.onrender.com |
| Social Media | https://codealpha-social.onrender.com |
| Project Management | https://codealpha-pm.onrender.com |
| Real-Time Communication | https://codealpha-rtc.onrender.com |

> Free tier apps sleep after 15 min inactivity. First visit may take ~30 seconds to wake up.

---

## Step 2 — Deploy landing page on Netlify (3 minutes)

1. Go to [Netlify](https://app.netlify.com)
2. Sign up / log in with **GitHub**
3. Click **Add new site** → **Import an existing project**
4. Select repo: `MuhammadJamshaid123/CodeAlpha-Developer`
5. Build settings (auto-detected from `netlify.toml`):
   - **Publish directory:** `deploy`
   - **Build command:** (leave default or empty)
6. Click **Deploy site**
7. **Important:** After deploy, copy your **actual URL** from the Netlify dashboard (e.g. `https://random-name-12345.netlify.app`). Do NOT use a guessed URL.

### Rename your site (optional)

To get `https://codealpha-developer.netlify.app`:

1. In Netlify dashboard → your site → **Domain management**
2. Click **Options** on the `*.netlify.app` domain → **Edit site name**
3. Enter: `codealpha-developer`
4. Save — only works if the name is not already taken

Your Netlify URL will look like: `https://YOUR-SITE-NAME.netlify.app` (from dashboard, not guessed)

---

## Step 3 — Verify

1. Open your Netlify landing page
2. Click each project link — all 4 should load
3. Register a test account on each app
4. For **Real-Time Communication**: open the same room in two browser tabs to test video/whiteboard

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| App shows "Application failed to respond" | Wait 30s and refresh (cold start) |
| Login not working | Clear cookies; ensure `NODE_ENV=production` is set on Render |
| WebRTC video not connecting | Use HTTPS URLs (Render provides this automatically) |
| Build fails on Render | Check logs; ensure Node 18+ is used |

---

## GitHub Repo

https://github.com/MuhammadJamshaid123/CodeAlpha-Developer
