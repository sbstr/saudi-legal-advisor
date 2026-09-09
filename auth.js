(() => {
  const authShell = document.getElementById('authShell');
  const chatSection = document.getElementById('chatSection');
  const accountBar = document.getElementById('accountBar');
  const trialBanner = document.getElementById('trialBanner');
  const authStatus = document.getElementById('authStatus');

  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  const googleDivider = document.getElementById('googleDivider');
  const googleBtnSlot = document.getElementById('googleBtnSlot');

  if (!authShell) return; // page has no auth UI (shouldn't happen on index.html)

  function setAuthStatus(message) {
    authStatus.textContent = message || '';
  }

  function switchTab(target) {
    const isLogin = target === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    setAuthStatus('');
  }

  tabLogin.addEventListener('click', () => switchTab('login'));
  tabRegister.addEventListener('click', () => switchTab('register'));

  function renderConsultationsText(user) {
    if (!user) return '';
    if (user.consultationsRemaining === Infinity) return 'استشارات غير محدودة';
    if (user.plan && user.plan !== 'free') {
      return `المتبقي من باقتك: ${user.consultationsRemaining} استشارة`;
    }
    return `المتبقي من تجربتك المجانية: ${user.consultationsRemaining} استشارة`;
  }

  function renderLoggedIn(user) {
    authShell.hidden = true;
    chatSection.hidden = false;
    accountBar.hidden = false;
    accountBar.innerHTML = '';

    const nameEl = document.createElement('strong');
    nameEl.textContent = user.name || user.email;
    const sep = document.createTextNode(' · ');
    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'link-button';
    logoutBtn.textContent = 'تسجيل الخروج';
    logoutBtn.addEventListener('click', logout);

    accountBar.appendChild(nameEl);
    accountBar.appendChild(sep);
    accountBar.appendChild(logoutBtn);

    if (user.plan === 'free' && user.consultationsRemaining <= 0) {
      trialBanner.hidden = false;
      trialBanner.innerHTML = 'استنفدت استشارتك المجانية. <a href="pricing.html">اشترك في إحدى الباقات</a> للمتابعة.';
    } else {
      trialBanner.hidden = false;
      trialBanner.textContent = renderConsultationsText(user);
    }
  }

  function renderLoggedOut() {
    authShell.hidden = false;
    chatSection.hidden = true;
    accountBar.hidden = true;
    accountBar.innerHTML = '';
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (error) {
      // ignore network errors on logout
    }
    window.currentUser = null;
    renderLoggedOut();
  }

  function applyUser(user) {
    window.currentUser = user;
    if (user) {
      renderLoggedIn(user);
      document.dispatchEvent(new CustomEvent('authchanged', { detail: { user } }));
    } else {
      renderLoggedOut();
    }
  }

  async function refreshMe() {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      applyUser(data.user || null);
    } catch (error) {
      applyUser(null);
    }
  }

  async function submitAuth(url, payload) {
    setAuthStatus('جارٍ التحقق…');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message || 'تعذّر إتمام العملية.');
      }
      setAuthStatus('');
      applyUser(data.user);
    } catch (error) {
      setAuthStatus(error.message || 'حدث خطأ غير متوقع.');
    }
  }

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth('/api/auth/login', {
      email: document.getElementById('loginEmail').value.trim(),
      password: document.getElementById('loginPassword').value
    });
  });

  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth('/api/auth/register', {
      name: document.getElementById('registerName').value.trim(),
      email: document.getElementById('registerEmail').value.trim(),
      password: document.getElementById('registerPassword').value
    });
  });

  function handleGoogleCredential(response) {
    submitAuth('/api/auth/google', { credential: response.credential });
  }

  async function setupGoogle() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json().catch(() => ({}));
      if (!data.googleClientId || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: data.googleClientId,
        callback: handleGoogleCredential
      });
      window.google.accounts.id.renderButton(googleBtnSlot, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with' });
      googleDivider.hidden = false;
    } catch (error) {
      // Google sign-in stays hidden if config/script isn't available.
    }
  }

  window.logoutCurrentUser = logout;
  refreshMe();
  window.addEventListener('load', setupGoogle);
})();
