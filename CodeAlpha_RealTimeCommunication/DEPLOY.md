# Deploy Full App — Netlify + Render

The live Netlify URL serves the UI. The **backend must run on Render** for login, video, chat, and whiteboard.

## Step 1 — Push code to GitHub

```bash
gh auth login
cd CodeAlpha_RealTimeCommunication
gh repo create CodeAlpha_RealTimeCommunication --public --source=. --remote=origin --push
```

## Step 2 — Deploy backend on Render (required)

1. Open [Render Dashboard](https://dashboard.render.com)
2. Sign in with **GitHub**
3. Click **New +** → **Blueprint**
4. Select repo: `CodeAlpha_RealTimeCommunication`
5. Render reads `render.yaml` automatically
6. Click **Apply** and wait ~5–10 minutes

Backend URL: **https://codealpha-realtimecommunication.onrender.com**

## Step 3 — Netlify (already deployed)

Frontend URL: **https://codealpha-realtimecommunication.netlify.app**

Redeploy after changes:

```bash
netlify deploy --dir=public
netlify api restoreSiteDeploy --data '{"site_id":"1ef6c10e-b2e2-4783-ab3b-5ea227e082b4","deploy_id":"YOUR_DEPLOY_ID"}'
```

## How it works

| Layer | Platform | Role |
|-------|----------|------|
| UI | Netlify | HTML, CSS, JS at `*.netlify.app` |
| API + Socket.io | Render | Express, SQLite, WebRTC signaling |

On Netlify, the frontend calls the Render API with session cookies (`config.js`).

## Verify

1. Open https://codealpha-realtimecommunication.netlify.app
2. Register a new account
3. Create a room → allow camera/mic
4. Open the same room in another tab/browser to test video & whiteboard

> Free Render apps sleep after 15 min. First visit may take ~30 seconds to wake up.
