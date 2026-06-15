# Railway Deployment — Live Apps + PostgreSQL Database

Deploy all 4 CodeAlpha projects on [Railway](https://railway.app) with a **live PostgreSQL database** that persists your data.

## How it works

| Environment | Database |
|-------------|----------|
| **Local** (`npm start`) | SQLite file (`db.sqlite3`) |
| **Railway** (production) | PostgreSQL via `DATABASE_URL` |

When Railway sets `DATABASE_URL`, each app automatically connects to PostgreSQL. No code changes needed after setup.

---

## Step 1 — Create Railway project

1. Go to [railway.app](https://railway.app) and sign in with **GitHub**
2. Click **New Project** → **Deploy from GitHub repo**
3. Select: `MuhammadJamshaid123/CodeAlpha-Developer`

---

## Step 2 — Add 4 web services

For each project, add a service:

| Service name | Root directory |
|--------------|----------------|
| ecommerce | `CodeAlpha_EcommerceStore` |
| social | `CodeAlpha_SocialMediaPlatform` |
| pm | `CodeAlpha_ProjectManagement` |
| rtc | `CodeAlpha_RealTimeCommunication` |

**Per service settings (CRITICAL):**

1. Open service → **Settings** → **Source**
2. Set **Root Directory** to the folder from the table above (e.g. `CodeAlpha_EcommerceStore`)
3. **Start command:** `npm start`
4. **Build command:** `npm install` (or leave empty — `nixpacks.toml` handles it)
5. Add variable: `NODE_ENV` = `production`

> **Build fails with "package.json not found"?** You forgot **Root Directory**. Railway must NOT deploy from repo root — each app lives in its own subfolder.

---

## Step 2b — Fix a failed build (your current service)

If your [Railway build](https://railway.com) shows failed:

1. Open the service → **Settings** → **Source**
2. Set **Root Directory** — pick ONE:
   - `CodeAlpha_EcommerceStore`
   - `CodeAlpha_SocialMediaPlatform`
   - `CodeAlpha_ProjectManagement`
   - `CodeAlpha_RealTimeCommunication`
3. Go to **Variables** → add `NODE_ENV` = `production`
4. Add **PostgreSQL** → link `DATABASE_URL` (see Step 3)
5. Click **Deploy** → **Redeploy**

---

## Step 3 — Add PostgreSQL database (live database)

1. In your Railway project, click **+ New** → **Database** → **PostgreSQL**
2. Railway creates a PostgreSQL instance with a `DATABASE_URL`

### Connect database to each web service

For **each** of the 4 web services:

1. Open the service → **Variables** tab
2. Click **+ New Variable** → **Add Reference**
3. Select the PostgreSQL service → choose `DATABASE_URL`
4. Redeploy the service

Each app will now use the **same PostgreSQL server** with separate tables (no conflicts).

> **Tip:** For production, use **one PostgreSQL per app** (add 4 databases) for full isolation.

---

## Step 4 — Get your live URLs

1. Open each web service → **Settings** → **Networking**
2. Click **Generate Domain**
3. Your live URLs will look like:
   - `https://ecommerce-production-xxxx.up.railway.app`
   - `https://social-production-xxxx.up.railway.app`
   - etc.

---

## Verify database is connected

Visit each app's health endpoint:

```
https://YOUR-APP.up.railway.app/api/health
```

Expected response:
```json
{ "ok": true, "database": "postgresql" }
```

If it shows `"sqlite"`, the `DATABASE_URL` variable is not linked — repeat Step 3.

---

## Environment variables (optional)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Auto-set by Railway PostgreSQL |
| `NODE_ENV` | Set to `production` |
| `SESSION_SECRET` | Random secret for sessions |
| `ENCRYPTION_KEY` | RTC app encryption key |

---

## GitHub repo

https://github.com/MuhammadJamshaid123/CodeAlpha-Developer

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails | Check Railway logs; ensure root directory is correct |
| `database: sqlite` on live | Link `DATABASE_URL` from PostgreSQL service |
| Login not working | Set `NODE_ENV=production` and redeploy |
| WebRTC not working | Use HTTPS Railway URL; allow camera/mic |
