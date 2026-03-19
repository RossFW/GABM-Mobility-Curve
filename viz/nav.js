// ============================================================
// Shared Navigation — injected into all pages
// ============================================================
'use strict';

(function() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const links = [
    { href: 'index.html',       label: 'INTRODUCTION' },
    { href: 'methodology.html', label: 'METHODOLOGY' },
    { href: 'town.html',        label: 'SIMULATION' },
    { href: 'analytics.html',   label: 'ANALYTICS' },
  ];

  const nav = document.createElement('nav');
  nav.id = 'site-nav';
  nav.innerHTML = links.map(l => {
    const active = currentPage === l.href ? ' class="active"' : '';
    const label = l.label.charAt(0) + l.label.slice(1).toLowerCase();
    return `<a href="${l.href}"${active}>${label}</a>`;
  }).join('<span class="nav-sep"> / </span>');

  // Insert at top of #app or body
  const app = document.getElementById('app');
  if (app) app.prepend(nav);
  else document.body.prepend(nav);

  // Academic style — consistent across both pages
  const style = document.createElement('style');
  style.textContent = `
    #site-nav {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 0 12px;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 13px;
    }
    #site-nav a {
      color: #555;
      text-decoration: none;
      padding: 2px 4px;
      transition: color 0.15s;
    }
    #site-nav a:hover  { color: #111; }
    #site-nav a.active { color: #111; font-weight: bold; }
    #site-nav .nav-sep { color: #bbb; padding: 0 2px; }
  `;
  document.head.appendChild(style);
})();
