(() => {
  const accountBar = document.getElementById('accountBar');
  const form = document.getElementById('supportForm');
  const status = document.getElementById('supportStatus');

  async function renderAccountBar() {
    if (!accountBar) return;
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      const user = data.user || null;
      if (!user) {
        accountBar.hidden = true;
        return;
      }
      accountBar.hidden = false;
      accountBar.innerHTML = '';
      const nameEl = document.createElement('strong');
      nameEl.textContent = user.name || user.email;
      accountBar.appendChild(nameEl);
      if (!document.getElementById('supportEmail').value) {
        document.getElementById('supportEmail').value = user.email;
      }
      if (!document.getElementById('supportName').value) {
        document.getElementById('supportName').value = user.name || '';
      }
    } catch (error) {
      accountBar.hidden = true;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = 'جارٍ الإرسال…';
    const payload = {
      name: document.getElementById('supportName').value.trim(),
      email: document.getElementById('supportEmail').value.trim(),
      topic: document.getElementById('supportTopic').value,
      message: document.getElementById('supportMessage').value.trim()
    };
    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message || 'تعذر إرسال رسالتك، حاول مرة أخرى.');
      }
      status.textContent = 'تم استلام رسالتك، سنعاود التواصل معك قريبًا.';
      form.reset();
    } catch (error) {
      status.textContent = error.message || 'حدث خطأ غير متوقع.';
    }
  });

  renderAccountBar();
})();
