# Deploy Backend on Render (Required for Login)

Your Netlify site needs a **Render backend** for register, login, video, and whiteboard.

**Netlify (UI):** https://codealpha-realtimecommunication.netlify.app  
**Render (API):** https://codealpha-rtc.onrender.com

---

## One-Click Deploy (Recommended)

**Click this link** (log in to Render with GitHub if asked):

👉 **[Deploy Blueprint on Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/MuhammadJamshaid123/CodeAlpha-Developer)**

---

## Step-by-Step on [dashboard.render.com](https://dashboard.render.com/)

### 1. Open Render Dashboard
- Go to https://dashboard.render.com/
- Sign in (use **Continue with GitHub**)

### 2. Start Blueprint
- Click **New +** (top right)
- Select **Blueprint**

### 3. Connect GitHub (first time only)
- Click **Connect account** next to GitHub
- Allow Render access to your repos
- Find **`CodeAlpha-Developer`** → click **Connect**

**Or use direct link:**  
https://dashboard.render.com/blueprint/new?repo=https://github.com/MuhammadJamshaid123/CodeAlpha-Developer

### 4. Review services
Render reads `render.yaml` and shows **4 web services**:
| Service | App |
|---------|-----|
| `codealpha-rtc` | **Real-Time Communication** ← needed for your Netlify link |
| codealpha-ecommerce | E-commerce |
| codealpha-social | Social Media |
| codealpha-pm | Project Management |

### 5. Deploy
- Blueprint name: `codealpha-developer` (or any name)
- Branch: **main**
- Click **Apply** (or **Deploy Blueprint**)
- Wait **5–10 minutes** for all builds to finish (green **Live** status)

### 6. Verify backend
Open: https://codealpha-rtc.onrender.com/api/health  
You should see: `{"ok":true}`

### 7. Test Netlify app
1. Open https://codealpha-realtimecommunication.netlify.app
2. Refresh the page (red warning should disappear)
3. **Register** → create account → **Create New Room**

> Free Render apps sleep after 15 min. First visit may take ~30 seconds.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Red banner on Netlify | Backend not deployed yet — complete steps above |
| Build failed on Render | Open service → **Logs** → check Node 18+ and `npm install` |
| Login fails after deploy | Hard refresh (Ctrl+F5) or clear site data for netlify.app |
| Video not connecting | Allow camera/mic; use HTTPS (both Netlify and Render provide it) |

---

## GitHub Repo

https://github.com/MuhammadJamshaid123/CodeAlpha-Developer
