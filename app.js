(() => {
  const log = document.getElementById('chatLog');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const sendButton = document.getElementById('chatSend');
  const status = document.getElementById('chatStatus');

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

  async function sendMessage(text) {
    messages.push({ role: 'user', content: text });
    setBusy(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message || 'تعذر الحصول على رد، حاول مرة أخرى.');
      }
      messages.push({ role: 'assistant', content: data.reply });
      appendBubble('assistant', data.reply);
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
})();
