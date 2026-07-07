(function () {
  const STORAGE_KEY = 'skillctl-docs-lang';
  const DEFAULT_LANG = 'en';
  const PAGES = ['index', 'config', 'commands', 'problems'];
  const HERO_COMMANDS = [
    'skillctl init --with-skill',
    'skillctl add github:xFurti/skillctl#skills/skillctl',
    'skillctl import from-project --dry-run',
    'skillctl install',
    'skillctl sync',
    'skillctl skill validate skills/skillctl',
    'skillctl doctor',
    'skillctl audit --strict',
  ];

  let currentLang = DEFAULT_LANG;
  let currentPage = 'index';
  let heroInterval = null;
  let heroIndex = 0;

  /* ── DOM refs ── */
  const main = document.getElementById('page-content');
  const topbarTitle = document.getElementById('topbar-title');
  const progressBar = document.getElementById('progress-bar');
  const searchInput = document.getElementById('doc-search');
  const toast = document.getElementById('toast');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');

  /* ── Language ── */
  function getLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' || saved === 'it' ? saved : DEFAULT_LANG;
  }

  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyLang(lang);
  }

  function t(key) {
    const bundle = window.TRANSLATIONS?.[currentLang];
    return bundle?.nav?.[key] ?? bundle?.common?.[key] ?? key;
  }

  function applyLang(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    const bundle = window.TRANSLATIONS?.[lang];
    if (!bundle) return;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = bundle.nav?.[key] ?? bundle.common?.[key];
      if (val) el.textContent = val;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = bundle.nav?.[key] ?? bundle.common?.[key];
      if (val) el.placeholder = val;
    });

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    renderPage(currentPage, false);
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

  /* ── Routing ── */
  function pageFromHash() {
    const hash = (location.hash || '#index').slice(1);
    return PAGES.includes(hash) ? hash : 'index';
  }

  function navigate(page, push = true) {
    if (!PAGES.includes(page)) page = 'index';
    if (push && location.hash !== `#${page}`) {
      history.pushState({ page }, '', `#${page}`);
    }
    renderPage(page);
    closeSidebar();
  }

  function renderPage(page, animate = true) {
    currentPage = page;
    document.body.dataset.page = page;

    const bundle = window.TRANSLATIONS?.[currentLang];
    const pageData = bundle?.pages?.[page];
    if (!pageData || !main) return;

    const doRender = () => {
      if (pageData.title) document.title = pageData.title;
      if (topbarTitle) topbarTitle.textContent = pageData.title?.split('—')[0]?.trim() || 'skillctl';
      if (pageData.html) main.innerHTML = pageData.html;

      document.querySelectorAll('.nav-link').forEach((a) => {
        a.classList.toggle('active', a.dataset.page === page);
      });

      enhanceContent(main, page);
      main.scrollTop = 0;
      window.scrollTo(0, 0);
      updateProgress();
    };

    if (animate) {
      main.classList.add('page-exit');
      setTimeout(() => {
        main.classList.remove('page-exit');
        doRender();
      }, 120);
    } else {
      doRender();
    }
  }

  /* ── Content enhancements ── */
  function enhanceContent(container, page) {
    stopHeroAnimation();
    wrapCodeBlocks(container);
    bindInternalLinks(container);
    wrapTables(container);

    if (page === 'index') {
      startHeroAnimation(container);
    }
    if (page === 'commands') {
      enhanceCommandBlocks(container);
      applySearch(searchInput?.value || '');
    }
    if (page === 'problems') {
      buildAccordions(container);
    }
  }

  function wrapCodeBlocks(container) {
    container.querySelectorAll('pre').forEach((pre) => {
      if (pre.closest('.code-wrap') || pre.closest('.hero-terminal')) return;
      const wrap = document.createElement('div');
      wrap.className = 'code-wrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = t('copyLabel');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = pre.querySelector('code') || pre;
        copyText(code.textContent, btn);
      });
      wrap.appendChild(btn);
    });
  }

  function wrapTables(container) {
    container.querySelectorAll('table').forEach((table) => {
      if (table.parentElement.classList.contains('table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function bindInternalLinks(container) {
    container.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const target = a.getAttribute('href').slice(1);
        if (PAGES.includes(target)) {
          e.preventDefault();
          navigate(target);
        }
      });
    });
    container.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const target = el.dataset.nav;
        if (PAGES.includes(target) && el.tagName !== 'A') {
          e.preventDefault();
          navigate(target);
        }
      });
    });
  }

  function enhanceCommandBlocks(container) {
    container.querySelectorAll('.cmd-block').forEach((block, i) => {
      const name = block.querySelector('.cmd-name');
      const desc = block.querySelector('.cmd-desc');
      const pres = block.querySelectorAll('pre');
      const extras = [...block.querySelectorAll('p')].filter((p) => !p.classList.contains('cmd-desc'));

      if (!name) return;

      const header = document.createElement('div');
      header.className = 'cmd-header';
      header.innerHTML = `<span class="cmd-name">${name.textContent}</span><span class="cmd-chevron">▼</span>`;

      const body = document.createElement('div');
      body.className = 'cmd-body';
      if (desc) body.appendChild(desc.cloneNode(true));
      pres.forEach((p) => body.appendChild(p.cloneNode(true)));
      extras.forEach((p) => body.appendChild(p.cloneNode(true)));

      block.innerHTML = '';
      block.appendChild(header);
      block.appendChild(body);

      if (i < 3) block.classList.add('open');

      header.addEventListener('click', () => block.classList.toggle('open'));
    });

    if (!container.querySelector('.search-empty')) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.id = 'search-empty';
      empty.textContent = t('searchNoResults');
      const h2 = container.querySelector('h2');
      if (h2) h2.parentNode.insertBefore(empty, h2.nextSibling);
    }
  }

  function buildAccordions(container) {
    const h2s = [...container.querySelectorAll('h2')];
    if (!h2s.length) return;

    const accordion = document.createElement('div');
    accordion.className = 'accordion';

    h2s.forEach((h2, i) => {
      const item = document.createElement('div');
      item.className = 'accordion-item' + (i === 0 ? ' open' : '');

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'accordion-trigger';
      trigger.innerHTML = `<span>${h2.textContent}</span><span class="accordion-icon">▼</span>`;

      const panel = document.createElement('div');
      panel.className = 'accordion-panel';

      let sibling = h2.nextElementSibling;
      const toRemove = [];
      while (sibling && sibling.tagName !== 'H2' && !sibling.matches('footer, .page-footer')) {
        toRemove.push(sibling);
        panel.appendChild(sibling.cloneNode(true));
        sibling = sibling.nextElementSibling;
      }

      trigger.addEventListener('click', () => item.classList.toggle('open'));

      item.appendChild(trigger);
      item.appendChild(panel);
      accordion.appendChild(item);

      h2.remove();
      toRemove.forEach((el) => el.remove());
    });

    const anchor = container.querySelector('.alert') || container.querySelector('.lead') || container.querySelector('h1');
    if (anchor?.nextSibling) {
      anchor.parentNode.insertBefore(accordion, anchor.nextSibling);
    } else if (anchor) {
      anchor.parentNode.appendChild(accordion);
    } else {
      container.appendChild(accordion);
    }

    wrapCodeBlocks(accordion);
    wrapTables(accordion);
  }

  /* ── Hero typing animation ── */
  function startHeroAnimation(container) {
    const codeEl = container.querySelector('#hero-cmd');
    if (!codeEl) return;

    function typeCommand(cmd) {
      let i = 0;
      codeEl.textContent = '';
      const tick = () => {
        if (i <= cmd.length) {
          codeEl.textContent = cmd.slice(0, i);
          i++;
          setTimeout(tick, 45 + Math.random() * 30);
        }
      };
      tick();
    }

    typeCommand(HERO_COMMANDS[0]);
    heroIndex = 0;
    heroInterval = setInterval(() => {
      heroIndex = (heroIndex + 1) % HERO_COMMANDS.length;
      typeCommand(HERO_COMMANDS[heroIndex]);
    }, 4000);
  }

  function stopHeroAnimation() {
    if (heroInterval) {
      clearInterval(heroInterval);
      heroInterval = null;
    }
  }

  /* ── Search ── */
  function applySearch(query) {
    const q = query.trim().toLowerCase();
    const onCommands = currentPage === 'commands';

    if (!onCommands) {
      if (q && q.length >= 2) {
        const bundle = window.TRANSLATIONS?.[currentLang];
        for (const page of PAGES) {
          const html = bundle?.pages?.[page]?.html || '';
          if (html.toLowerCase().includes(q)) {
            navigate(page);
            setTimeout(() => applySearch(query), 200);
            return;
          }
        }
      }
      return;
    }

    let visible = 0;
    main.querySelectorAll('.cmd-block').forEach((block) => {
      const text = block.textContent.toLowerCase();
      const match = !q || text.includes(q);
      block.classList.toggle('hidden', !match);
      if (match) visible++;
    });

    const empty = document.getElementById('search-empty');
    if (empty) empty.classList.toggle('visible', q.length > 0 && visible === 0);
  }

  /* ── Clipboard ── */
  function copyText(text, btn) {
    navigator.clipboard.writeText(text.trim()).then(() => {
      if (btn) {
        btn.textContent = t('copiedLabel');
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = t('copyLabel');
          btn.classList.remove('copied');
        }, 2000);
      }
      showToast(t('copiedLabel'));
    }).catch(() => showToast('Copy failed'));
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  /* ── Scroll progress ── */
  function updateProgress() {
    const el = document.documentElement;
    const scrollTop = el.scrollTop || document.body.scrollTop;
    const height = el.scrollHeight - el.clientHeight;
    const pct = height > 0 ? (scrollTop / height) * 100 : 0;
    progressBar.style.width = `${pct}%`;
    progressBar.setAttribute('aria-valuenow', Math.round(pct));

    const scrollTopBtn = document.getElementById('scroll-top');
    if (scrollTopBtn) scrollTopBtn.classList.toggle('visible', scrollTop > 400);
  }

  /* ── Mobile sidebar ── */
  function openSidebar() {
    sidebar?.classList.add('open');
    overlay?.removeAttribute('hidden');
  }

  function closeSidebar() {
    sidebar?.classList.remove('open');
    overlay?.setAttribute('hidden', '');
  }

  /* ── Init ── */
  function init() {
    currentLang = getLang();
    initLangSwitcher();

    document.querySelectorAll('.nav-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigate(a.dataset.page);
      });
    });

    window.addEventListener('hashchange', () => navigate(pageFromHash(), false));
    window.addEventListener('popstate', () => navigate(pageFromHash(), false));
    window.addEventListener('scroll', updateProgress, { passive: true });

    searchInput?.addEventListener('input', (e) => applySearch(e.target.value));

    document.getElementById('menu-toggle')?.addEventListener('click', openSidebar);
    document.getElementById('sidebar-close')?.addEventListener('click', closeSidebar);
    overlay?.addEventListener('click', closeSidebar);
    document.getElementById('scroll-top')?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput?.focus();
      }
      if (e.key === 'Escape') {
        searchInput?.blur();
        closeSidebar();
      }
    });

    const page = pageFromHash();
    if (!location.hash) history.replaceState({ page }, '', `#${page}`);
    applyLang(currentLang);
    navigate(page, false);
  }

  document.addEventListener('DOMContentLoaded', init);
})();