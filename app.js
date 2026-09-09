(() => {
  const log = document.getElementById('chatLog');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const sendButton = document.getElementById('chatSend');
  const status = document.getElementById('chatStatus');
  const trialBanner = document.getElementById('trialBanner');

  const messages = [];

  function appendBubble(role, text) {
    const bubble = document.createElement('article');
    bubble.className = `chat-bubble ${role}`;
    const p = document.createElement('p');
    p.textContent = text;
    bubble.appendChild(p);
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  function setBusy(busy) {
    input.disabled = busy;
    sendButton.disabled = busy;
    status.textContent = busy ? 'المستشار يراجع استفسارك…' : '';
  }

  function updateTrialBanner(user) {
    if (!user || !trialBanner) return;
    window.currentUser = user;
    if (user.consultationsRemaining === Infinity) {
      trialBanner.hidden = true;
      return;
    }
    trialBanner.hidden = false;
    if (user.plan === 'free' && user.consultationsRemaining <= 0) {
      trialBanner.innerHTML = 'استنفدت استشارتك المجانية. <a href="pricing.html">اشترك في إحدى الباقات</a> للمتابعة.';
    } else if (user.plan && user.plan !== 'free') {
      trialBanner.textContent = `المتبقي من باقتك: ${user.consultationsRemaining} استشارة`;
    } else {
      trialBanner.textContent = `المتبقي من تجربتك المجانية: ${user.consultationsRemaining} استشارة`;
    }
  }

  async function sendMessage(text) {
    messages.push({ role: 'user', content: text });
    setBusy(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401 && typeof window.logoutCurrentUser === 'function') {
          window.logoutCurrentUser();
        }
        throw new Error(data?.error?.message || 'تعذر الحصول على رد، حاول مرة أخرى.');
      }
      messages.push({ role: 'assistant', content: data.reply });
      appendBubble('assistant', data.reply);
      updateTrialBanner(data.user);
    } catch (error) {
      appendBubble('error', error.message || 'حدث خطأ غير متوقع، حاول مرة أخرى.');
      messages.pop();
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    appendBubble('user', text);
    input.value = '';
    sendMessage(text);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  document.addEventListener('authchanged', (event) => {
    updateTrialBanner(event.detail.user);
  });
})();
