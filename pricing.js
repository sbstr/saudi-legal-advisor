(() => {
  const accountBar = document.getElementById('accountBar');
  const plansGrid = document.getElementById('plansGrid');
  const pricingStatus = document.getElementById('pricingStatus');

  function renderAccountBar(user) {
    if (!user) {
      accountBar.hidden = true;
      accountBar.innerHTML = '';
      return;
    }
    accountBar.hidden = false;
    accountBar.innerHTML = '';
    const nameEl = document.createElement('strong');
    nameEl.textContent = user.name || user.email;
    const sep = document.createTextNode(' · ');
    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'link-button';
    logoutBtn.textContent = 'تسجيل الخروج';
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
      window.location.href = 'index.html';
    });
    accountBar.appendChild(nameEl);
    accountBar.appendChild(sep);
    accountBar.appendChild(logoutBtn);
  }

  function renderPlans(plans, user) {
    plansGrid.innerHTML = '';
    for (const plan of plans) {
      const card = document.createElement('article');
      card.className = 'plan-card';

      const title = document.createElement('h3');
      title.textContent = plan.nameAr;

      const price = document.createElement('div');
      price.className = 'plan-price';
      price.textContent = `${plan.priceSar} ر.س `;
      const small = document.createElement('small');
      small.textContent = plan.billingPeriodAr;
      price.appendChild(small);

      const features = document.createElement('ul');
      for (const feature of plan.featuresAr) {
        const li = document.createElement('li');
        li.textContent = feature;
        features.appendChild(li);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button primary';
      button.textContent = 'اشترك الآن';
      button.addEventListener('click', () => {
        if (!user) {
          pricingStatus.textContent = 'الرجاء تسجيل الدخول أولًا قبل الاشتراك.';
          window.location.href = 'index.html';
          return;
        }
        pricingStatus.textContent = 'الدفع الإلكتروني غير مفعّل بعد، سيتم التواصل معك قريبًا لإتمام الاشتراك.';
      });

      card.appendChild(title);
      card.appendChild(price);
      card.appendChild(features);
      card.appendChild(button);
      plansGrid.appendChild(card);
    }
  }

  async function init() {
    let user = null;
    try {
      const meResponse = await fetch('/api/auth/me', { credentials: 'include' });
      const meData = await meResponse.json().catch(() => ({}));
      user = meData.user || null;
    } catch (error) {
      user = null;
    }
    renderAccountBar(user);

    try {
      const plansResponse = await fetch('/api/plans');
      const plansData = await plansResponse.json().catch(() => ({}));
      renderPlans(plansData.plans || [], user);
    } catch (error) {
      pricingStatus.textContent = 'تعذر تحميل الباقات، حاول مرة أخرى.';
    }
  }

  init();
})();
