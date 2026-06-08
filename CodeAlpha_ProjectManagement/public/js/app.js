let socket;

async function initAuth() {
  const res = await fetch('/api/me');
  const { user } = await res.json();
  const userInfo = document.getElementById('user-info');
  const authLink = document.getElementById('auth-link');
  const notifs = document.getElementById('notifications');

  if (user) {
    if (userInfo) userInfo.textContent = `@${user.username}`;
    if (authLink) {
      authLink.textContent = 'Logout';
      authLink.href = '#';
      authLink.onclick = async (e) => { e.preventDefault(); await fetch('/api/logout', { method: 'POST' }); location.href = '/login.html'; };
    }
    if (notifs) {
      notifs.classList.remove('hidden');
      socket = io();
      socket.emit('join-user', user.id);
      socket.on('notification', () => loadNotifications());
      loadNotifications();
    }
  }
}

async function loadNotifications() {
  const notifs = await fetch('/api/notifications').then(r => r.json());
  const unread = notifs.filter(n => !n.read).length;
  const countEl = document.getElementById('notif-count');
  if (countEl) countEl.textContent = unread;
  const listEl = document.getElementById('notif-list');
  if (listEl) {
    listEl.innerHTML = notifs.length ? notifs.map(n =>
      `<div class="notif-item">${n.message}<br><small>${new Date(n.created_at).toLocaleString()}</small></div>`
    ).join('') : '<p style="padding:1rem">No notifications</p>';
  }
}

function toggleNotifs() {
  const list = document.getElementById('notif-list');
  list.classList.toggle('hidden');
  if (!list.classList.contains('hidden')) {
    fetch('/api/notifications/read', { method: 'POST' });
    document.getElementById('notif-count').textContent = '0';
  }
}

initAuth();
