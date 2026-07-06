(function () {
  const STORAGE_KEY = 'skillctl-docs-lang';
  const DEFAULT_LANG = 'en';

  function getLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' || saved === 'it' ? saved : DEFAULT_LANG;
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    applyLang(lang);
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    const page = document.body.dataset.page;
    if (!page || !window.TRANSLATIONS) return;

    const bundle = window.TRANSLATIONS[lang];
    if (!bundle) return;

    // Nav
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = bundle.nav?.[key] ?? bundle.common?.[key];
      if (val) el.textContent = val;
    });

    // Active nav link
    document.querySelectorAll('.nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.page === page);
    });

    // Page content
    const pageData = bundle.pages?.[page];
    const main = document.getElementById('page-content');
    if (pageData && main) {
      if (pageData.title) document.title = pageData.title;
      if (pageData.html) main.innerHTML = pageData.html;
    }

    // Lang buttons
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
  }

  function initLangSwitcher() {
    const container = document.getElementById('lang-switch');
    if (!container) return;
    container.innerHTML = `
      <button type="button" class="lang-btn" data-lang="it">IT</button>
      <button type="button" class="lang-btn" data-lang="en">EN</button>
    `;
    container.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => setLang(btn.dataset.lang));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLangSwitcher();
    applyLang(getLang());
  });
})();