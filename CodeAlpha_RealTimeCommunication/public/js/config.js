const isNetlify = location.hostname.includes('netlify.app');
const BACKEND = 'https://codealpha-rtc.onrender.com';

window.API_BASE = isNetlify ? BACKEND : '';
window.SOCKET_URL = window.API_BASE;

window.saveAuth = (data) => {
  if (data?.token) localStorage.setItem('rtc_token', data.token);
  if (data?.username) localStorage.setItem('rtc_username', data.username);
};

window.clearAuth = () => {
  localStorage.removeItem('rtc_token');
  localStorage.removeItem('rtc_username');
};

window.assetUrl = (url) => (url?.startsWith('/') ? `${window.API_BASE}${url}` : url);

window.apiFetch = (url, options = {}) => {
  const headers = { ...options.headers };
  const token = localStorage.getItem('rtc_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${window.API_BASE}${url}`, { credentials: 'include', ...options, headers });
};

window.checkBackend = async () => {
  try {
    const res = await fetch(`${BACKEND}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!isNetlify) return;
  const ok = await checkBackend();
  if (ok) return;
  const banner = document.createElement('div');
  banner.style.cssText = 'background:#e63946;color:#fff;padding:0.75rem 1rem;text-align:center;font-size:0.9rem;line-height:1.5;';
  banner.innerHTML = '⚠️ Backend not running. <a href="https://dashboard.render.com/blueprint/new?repo=https://github.com/MuhammadJamshaid123/CodeAlpha-Developer" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;font-weight:bold;">Click here to deploy on Render</a> → sign in with GitHub → click <strong>Apply</strong> → wait 5 min → refresh this page.';
  document.body.prepend(banner);
});
