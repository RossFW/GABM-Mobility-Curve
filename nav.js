// ============================================================
// Shared Navigation — injected into all pages
// ============================================================
'use strict';

(function() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const links = [
    { href: 'town.html',      label: 'SIMULATION' },
    { href: 'analytics.html', label: 'ANALYTICS' },
  ];

  const isAnalytics = currentPage === 'analytics.html';

  const nav = document.createElement('nav');
  nav.id = 'site-nav';
  nav.innerHTML = links.map(l => {
    const active = currentPage === l.href ? ' class="active"' : '';
    return `<a href="${l.href}"${active}>${isAnalytics ? l.label.charAt(0) + l.label.slice(1).toLowerCase() : l.label}</a>`;
  }).join(isAnalytics ? '<span class="nav-sep"> / </span>' : '<span class="nav-sep">|</span>');

  // Insert at top of #app or body
  const app = document.getElementById('app');
  if (app) app.prepend(nav);
  else document.body.prepend(nav);

  // Inject styles — academic on analytics, gaming elsewhere
  const style = document.createElement('style');
  if (isAnalytics) {
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
  } else {
    style.textContent = `
      #site-nav {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 4px 10px;
        font-family: 'Press Start 2P', monospace;
        font-size: 8px;
        letter-spacing: 2px;
      }
      #site-nav a {
        color: #4a6580;
        text-decoration: none;
        padding: 4px 8px;
        transition: color 0.15s;
      }
      #site-nav a:hover { color: #e2e8f0; }
      #site-nav a.active {
        color: #e2e8f0;
        border-bottom: 2px solid #3B82F6;
      }
      #site-nav .nav-sep { color: #1e2d40; font-size: 10px; }
    `;
  }
  document.head.appendChild(style);
})();
