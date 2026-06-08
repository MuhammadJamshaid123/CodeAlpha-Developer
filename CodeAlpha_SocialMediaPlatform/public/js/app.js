async function initAuth() {
  const res = await fetch('/api/me');
  const { user } = await res.json();
  const userInfo = document.getElementById('user-info');
  const authLink = document.getElementById('auth-link');
  const compose = document.getElementById('compose');

  if (user) {
    if (userInfo) userInfo.innerHTML = `<a href="/profile.html?user=${user.username}">@${user.username}</a>`;
    if (authLink) {
      authLink.textContent = 'Logout';
      authLink.href = '#';
      authLink.onclick = async (e) => { e.preventDefault(); await fetch('/api/logout', { method: 'POST' }); location.href = '/'; };
    }
    if (compose) compose.classList.remove('hidden');
  }
}
initAuth();
