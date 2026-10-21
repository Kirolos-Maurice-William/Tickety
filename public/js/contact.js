document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('contact-form');
  const feedbackEl = document.getElementById('contact-feedback');
  const submitBtn = document.getElementById('contact-submit');

  const user = await window.Tickety.ensureSession();
  if (user) {
    const nameInput = document.getElementById('contact-name');
    const emailInput = document.getElementById('contact-email');
    if (nameInput && user.name && !user.isGuest) nameInput.value = user.name;
    if (emailInput && user.email) emailInput.value = user.email;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    feedbackEl.style.display = 'none';

    try {
      const res = await window.Tickety.apiFetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('contact-name').value.trim(),
          email: document.getElementById('contact-email').value.trim(),
          message: document.getElementById('contact-message').value.trim(),
        }),
      });
      feedbackEl.textContent = res.message;
      feedbackEl.style.display = 'block';
      document.getElementById('contact-message').value = '';
    } catch (err) {
      feedbackEl.textContent = err.message;
      feedbackEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
    }
  });
});
