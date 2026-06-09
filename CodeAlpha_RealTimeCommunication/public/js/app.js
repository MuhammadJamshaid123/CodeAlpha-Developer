async function initAuth() {
  const res = await apiFetch('/api/me');
  const { user } = await res.json();
  const userInfo = document.getElementById('user-info');
  const authLink = document.getElementById('auth-link');

  if (user) {
    if (userInfo) userInfo.textContent = `@${user.username}`;
    if (authLink) {
      authLink.textContent = 'Logout';
      authLink.href = '#';
      authLink.onclick = async (e) => {
        e.preventDefault();
        await apiFetch('/api/logout', { method: 'POST' });
        location.href = '/login.html';
      };
    }
  }
}
initAuth();
