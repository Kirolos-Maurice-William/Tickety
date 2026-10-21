document.addEventListener('DOMContentLoaded', async () => {
  const { apiFetch, ensureSession, saveSession, showToast, refreshTicketBadge } = window.Tickety;

  const headingEl = document.getElementById('account-heading');
  const noteEl = document.getElementById('account-mode-note');
  const profileForm = document.getElementById('profile-form');
  const nameInput = document.getElementById('profile-name');
  const emailInput = document.getElementById('profile-email');
  const phoneInput = document.getElementById('profile-phone');
  const newGuestBtn = document.getElementById('new-guest-btn');

  const tabRegister = document.getElementById('tab-register');
  const tabLogin = document.getElementById('tab-login');
  const registerForm = document.getElementById('register-form');
  const loginForm = document.getElementById('login-form');

  function populateUser(user) {
    if (!user) return;
    headingEl.textContent = user.isGuest ? `Guest Session (${user.name})` : user.name;
    noteEl.textContent = user.isGuest
      ? 'You are browsing with an isolated temporary guest account. All features—including seat reservation, QR ticket generation and cancellation—are unlocked without signing in.'
      : `Signed in with registered account (${user.email}).`;

    nameInput.value = user.name || '';
    emailInput.value = user.email || '';
    phoneInput.value = user.phone || '';
  }

  const user = await ensureSession();
  populateUser(user);

  if (window.location.pathname === '/login') {
    tabLogin.click();
  }

  tabRegister.addEventListener('click', () => {
    tabRegister.className = 'btn btn-dark';
    tabLogin.className = 'btn btn-ghost';
    registerForm.style.display = 'flex';
    loginForm.style.display = 'none';
  });

  tabLogin.addEventListener('click', () => {
    tabLogin.className = 'btn btn-dark';
    tabRegister.className = 'btn btn-ghost';
    loginForm.style.display = 'flex';
    registerForm.style.display = 'none';
  });

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          phone: phoneInput.value.trim(),
        }),
      });
      saveSession(data.token, data.user);
      populateUser(data.user);
      showToast('Session details updated.');
    } catch (err) {
      showToast(err.message);
    }
  });

  newGuestBtn.addEventListener('click', async () => {
    try {
      const data = await apiFetch('/api/auth/guest', {
        method: 'POST',
        body: JSON.stringify({ fresh: true }),
      });
      saveSession(data.token, data.user);
      populateUser(data.user);
      await refreshTicketBadge();
      showToast('Started a fresh guest session.');
    } catch (err) {
      showToast(err.message);
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('reg-name').value.trim(),
          email: document.getElementById('reg-email').value.trim(),
          password: document.getElementById('reg-password').value,
        }),
      });
      saveSession(data.token, data.user);
      populateUser(data.user);
      registerForm.reset();
      showToast('Account created and current reservations linked.');
    } catch (err) {
      showToast(err.message);
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('login-email').value.trim(),
          password: document.getElementById('login-password').value,
        }),
      });
      saveSession(data.token, data.user);
      populateUser(data.user);
      await refreshTicketBadge();
      loginForm.reset();
      showToast('Signed in.');
    } catch (err) {
      showToast(err.message);
    }
  });
});
