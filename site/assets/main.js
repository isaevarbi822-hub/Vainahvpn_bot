(() => {
  const button = document.querySelector('[data-menu-button]');
  const drawer = document.querySelector('[data-mobile-nav]');
  if (button && drawer) {
    const close = () => { drawer.classList.remove('open');button.setAttribute('aria-expanded', 'false');button.setAttribute('aria-label','Открыть меню'); };
    button.addEventListener('click', () => {
      const open = !drawer.classList.contains('open');
      drawer.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    });
    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', () => { if(window.innerWidth>850)close(); });
  }
  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  document.querySelectorAll('[data-tab-set]').forEach(root => {
    const tabs = [...root.querySelectorAll('[role=tab]')];
    const panels = [...root.querySelectorAll('[role=tabpanel]')];
    const select = tab => {
      const id = tab.getAttribute('aria-controls');
      tabs.forEach(t => { const active = t === tab; t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1; });
      panels.forEach(panel => { panel.hidden = panel.id !== id; });
    };
    tabs.forEach((tab,i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', e => {
        if (!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
        e.preventDefault();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length-1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].focus();select(tabs[next]);
      });
    });
    if(tabs.length) select(tabs.find(t=>t.getAttribute('aria-selected')==='true') || tabs[0]);
  });

  document.querySelectorAll('[data-faq-search]').forEach(search => {
    const target = document.getElementById(search.dataset.faqSearch);
    if (!target) return;
    const items = [...target.querySelectorAll('details')];
    const empty = target.querySelector('.empty-results');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLocaleLowerCase('ru');
      let visible=0;
      items.forEach(item=>{
        const matches = !q || (item.textContent||'').toLocaleLowerCase('ru').includes(q);
        item.hidden = !matches;
        if (matches) visible++;
      });
      if(empty)empty.style.display=visible?'none':'block';
    });
  });

  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('js-ready');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);} });
    }, {threshold:0.06,rootMargin:'0px 0px 35px 0px'});
    document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
  }
})();