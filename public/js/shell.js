(function () {
  const TOKEN_KEY = 'tickety_token';
  const USER_KEY = 'tickety_user';

  const CATEGORY_NAV = [
    { key: 'cinema', label: 'Cinema', href: '/cinema' },
    { key: 'concert', label: 'Concerts', href: '/concert' },
    { key: 'football', label: 'Football', href: '/football' },
    { key: 'bus', label: 'Bus', href: '/bus' },
    { key: 'train', label: 'Train', href: '/train' },
    { key: 'plane', label: 'Flights', href: '/plane' },
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCurrency(amount) {
    const n = Number(amount) || 0;
    return `EGP ${n.toLocaleString('en-US')}`;
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDateShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function getStoredToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  let sessionPromise = null;
  let sessionVerified = false;

  function saveSession(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionVerified = true;
    updateSessionUI(user);
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionVerified = false;
  }

  async function apiFetch(url, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getStoredToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function ensureSession() {
    if (sessionVerified && getStoredToken() && getStoredUser()) {
      const cached = getStoredUser();
      updateSessionUI(cached);
      return cached;
    }
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const existingToken = getStoredToken();
      if (existingToken) {
        try {
          const { user } = await apiFetch('/api/auth/me');
          saveSession(existingToken, user);
          return user;
        } catch (_e) {
          clearSession();
        }
      }
      const { token, user } = await apiFetch('/api/auth/guest', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      saveSession(token, user);
      return user;
    })();

    try {
      return await sessionPromise;
    } finally {
      sessionPromise = null;
    }
  }

  async function refreshTicketBadge() {
    try {
      await ensureSession();
      const { bookings } = await apiFetch('/api/bookings');
      const confirmed = (bookings || []).filter((b) => b.status === 'confirmed');
      const countEl = document.getElementById('nav-ticket-count');
      if (countEl) {
        countEl.textContent = String(confirmed.length);
      }
    } catch (_e) {
      // Ignore badge errors silently
    }
  }

  function updateSessionUI(user) {
    const statusEl = document.getElementById('utility-session-label');
    const accountLink = document.getElementById('utility-account-link');
    if (!statusEl || !user) return;

    if (user.isGuest) {
      statusEl.textContent = `Browsing in Guest Mode (${user.name}) — instant booking enabled, no sign-in required.`;
      if (accountLink) accountLink.textContent = 'Account / Sign in';
    } else {
      statusEl.textContent = `Signed in as ${user.name} (${user.email || ''})`;
      if (accountLink) accountLink.textContent = 'Account';
    }
  }

  function showToast(message) {
    let region = document.getElementById('toast-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toast-region';
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    region.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  function activeCategoryFromLocation() {
    const path = window.location.pathname.replace(/^\/+/, '').toLowerCase();
    if (CATEGORY_NAV.some((c) => c.key === path)) return path;
    const params = new URLSearchParams(window.location.search);
    return (params.get('category') || '').toLowerCase();
  }

  function renderHeader() {
    const mount = document.getElementById('site-header');
    if (!mount) return;
    const activeCat = activeCategoryFromLocation();
    const path = window.location.pathname;

    mount.innerHTML = `
      <div class="utility-bar">
        <div class="container utility-bar-inner">
          <span id="utility-session-label" class="utility-note">Initializing guest session...</span>
          <div class="utility-actions">
            <button type="button" id="reset-demo-btn" class="utility-link">Reset Demo Data</button>
            <a href="/contact" class="utility-link">Box Office Inquiry</a>
            <a href="/account" id="utility-account-link" class="utility-link">Account / Sign in</a>
          </div>
        </div>
      </div>
      <header class="site-header">
        <div class="container header-main">
          <a href="/" class="brand">Tickety</a>
          <nav class="nav-categories" aria-label="Ticket categories">
            <a href="/browse" class="nav-link ${path === '/browse' && !activeCat ? 'active' : ''}">All Events</a>
            ${CATEGORY_NAV.map(
              (item) => `
                <a href="${item.href}" class="nav-link ${activeCat === item.key ? 'active' : ''}">${item.label}</a>
              `
            ).join('')}
          </nav>
          <div class="header-right">
            <div class="header-search-wrap">
              <input
                id="global-search-input"
                class="header-search-input"
                type="search"
                placeholder="Search title, city, route..."
                aria-label="Search events and routes"
                autocomplete="off"
              />
              <div id="global-search-dropdown" class="search-dropdown" role="listbox"></div>
            </div>
            <a href="/tickets" class="tickets-nav-link">
              <span>My Tickets</span>
              <span id="nav-ticket-count" class="ticket-count-badge">0</span>
            </a>
          </div>
        </div>
      </header>
    `;

    const resetBtn = document.getElementById('reset-demo-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        resetBtn.disabled = true;
        resetBtn.textContent = 'Resetting...';
        try {
          const data = await apiFetch('/api/demo/reset', {
            method: 'POST',
            body: JSON.stringify({ interactive: true }),
          });
          saveSession(data.token, data.user);
          showToast('Demo catalogue and guest session have been reset.');
          setTimeout(() => window.location.reload(), 500);
        } catch (err) {
          showToast(err.message);
          resetBtn.disabled = false;
          resetBtn.textContent = 'Reset Demo Data';
        }
      });
    }

    setupGlobalSearch();
  }

  function setupGlobalSearch() {
    const input = document.getElementById('global-search-input');
    const dropdown = document.getElementById('global-search-dropdown');
    if (!input || !dropdown) return;

    let timer = null;

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) {
        dropdown.classList.remove('open');
        dropdown.innerHTML = '';
        return;
      }

      timer = setTimeout(async () => {
        try {
          const { events } = await apiFetch(`/api/events?q=${encodeURIComponent(q)}&limit=6`);
          if (!events || events.length === 0) {
            dropdown.innerHTML = `<div class="search-item"><span class="search-item-title">No matching events found.</span></div>`;
            dropdown.classList.add('open');
            return;
          }

          dropdown.innerHTML = events
            .map((ev) => {
              const place = ev.venue ? `${ev.venue}, ${ev.city}` : `${ev.origin} to ${ev.destination}`;
              return `
                <a class="search-item" href="/event?id=${encodeURIComponent(ev.id)}">
                  <div class="search-item-meta">${escapeHtml(ev.category)} &middot; ${escapeHtml(place)}</div>
                  <div class="search-item-title">${escapeHtml(ev.title)}</div>
                </a>
              `;
            })
            .join('');
          dropdown.classList.add('open');
        } catch (_e) {
          dropdown.classList.remove('open');
        }
      }, 220);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) {
          window.location.href = `/browse?q=${encodeURIComponent(q)}`;
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  }

  function renderFooter() {
    const mount = document.getElementById('site-footer');
    if (!mount) return;

    mount.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <div class="footer-heading">Tickety</div>
              <p style="max-width: 44ch; line-height: 1.6;">
                Unified box office and intercity ticketing for cinema screenings, live performances, league fixtures, coaches, rail and regional flights.
              </p>
            </div>
            <div>
              <div class="footer-heading">Catalogue</div>
              <ul class="footer-links">
                <li><a href="/cinema">Cinema</a></li>
                <li><a href="/concert">Concerts</a></li>
                <li><a href="/football">Football</a></li>
                <li><a href="/bus">Bus</a></li>
                <li><a href="/train">Train</a></li>
                <li><a href="/plane">Flights</a></li>
              </ul>
            </div>
            <div>
              <div class="footer-heading">Customer Desk</div>
              <ul class="footer-links">
                <li><a href="/tickets">My Tickets</a></li>
                <li><a href="/account">Account &amp; Guest Session</a></li>
                <li><a href="/contact">Box Office Inquiry</a></li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <span>Tickety Box Office &amp; Travel System</span>
            <span>All prices in Egyptian Pounds (EGP)</span>
          </div>
        </div>
      </footer>
    `;
  }

  function renderEventCard(ev) {
    const locationLine = ev.venue
      ? `${ev.venue}, ${ev.city}`
      : `${ev.origin} &rarr; ${ev.destination}`;

    let statusNote = `${ev.available} available`;
    if (ev.available === 0) {
      statusNote = 'Sold out';
    } else if (ev.available <= 25) {
      statusNote = `Final ${ev.available} remaining`;
    }

    return `
      <a class="event-item" href="/event?id=${encodeURIComponent(ev.id)}">
        <div class="event-media">
          <img src="${escapeHtml(ev.image)}" alt="${escapeHtml(ev.title)}" loading="lazy" />
        </div>
        <div class="event-meta">
          <span>${escapeHtml(ev.category)}</span>
          <span>${formatDateTime(ev.startsAt)}</span>
        </div>
        <h3 class="event-title">${escapeHtml(ev.title)}</h3>
        <p class="event-sub">${locationLine}</p>
        <div class="event-foot">
          <span class="event-price">From ${formatCurrency(ev.basePrice)}</span>
          <span class="event-status-note">${escapeHtml(statusNote)}</span>
        </div>
      </a>
    `;
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderFooter();
    ensureSession().then(() => {
      refreshTicketBadge();
    });
  });

  window.Tickety = {
    escapeHtml,
    formatCurrency,
    formatDateTime,
    formatDateShort,
    apiFetch,
    ensureSession,
    saveSession,
    clearSession,
    getStoredUser,
    refreshTicketBadge,
    showToast,
    renderEventCard,
     activeCategoryFromLocation,
  };
})();
