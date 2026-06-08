async function updateCartCount() {
  try {
    const res = await fetch('/api/cart');
    const { items } = await res.json();
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    const badge = document.getElementById('cart-count');
    if (badge) badge.textContent = count;
  } catch (e) { /* ignore */ }
}

async function addToCart(productId, quantity = 1) {
  await fetch('/api/cart/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: Number(productId), quantity: Number(quantity) })
  });
  updateCartCount();
  alert('Added to cart!');
}

async function initAuth() {
  try {
    const res = await fetch('/api/me');
    const { user } = await res.json();
    const userInfo = document.getElementById('user-info');
    const authLink = document.getElementById('auth-link');
    const ordersLink = document.getElementById('orders-link');

    if (user && userInfo) {
      userInfo.innerHTML = `Hi, <strong>${user.username}</strong>`;
      if (authLink) {
        authLink.textContent = 'Logout';
        authLink.href = '#';
        authLink.onclick = async (e) => {
          e.preventDefault();
          await fetch('/api/logout', { method: 'POST' });
          window.location.href = '/';
        };
      }
      if (ordersLink) ordersLink.classList.remove('hidden');
    }
  } catch (e) { /* ignore */ }
}

updateCartCount();
initAuth();
