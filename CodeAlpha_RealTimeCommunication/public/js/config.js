const isNetlify = location.hostname.includes('netlify.app');
const BACKEND = 'https://codealpha-rtc.onrender.com';

window.API_BASE = isNetlify ? BACKEND : '';
window.SOCKET_URL = window.API_BASE;

window.apiFetch = (url, options = {}) =>
  fetch(`${window.API_BASE}${url}`, { credentials: 'include', ...options });

window.checkBackend = async () => {
  try {
    const res = await apiFetch('/api/me');
    return res.status < 500;
  } catch {
    return false;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!isNetlify) return;
  const ok = await checkBackend();
  if (ok) return;
  const banner = document.createElement('div');
  banner.style.cssText = 'background:#e63946;color:#fff;padding:0.75rem 1rem;text-align:center;font-size:0.9rem;';
  banner.innerHTML = '⏳ Backend is waking up (first visit may take 30s). If login fails, wait and refresh.';
  document.body.prepend(banner);
});
