document.addEventListener('DOMContentLoaded', async () => {
  const CATEGORY_TITLES = {
    cinema: { eyebrow: 'Screenings & Halls', title: 'Cinema' },
    concert: { eyebrow: 'Orchestral & Live Music', title: 'Concerts' },
    football: { eyebrow: 'Domestic & International Fixtures', title: 'Football' },
    bus: { eyebrow: 'Intercity Coach Network', title: 'Bus Departures' },
    train: { eyebrow: 'National Rail & Sleeper Lines', title: 'Train Departures' },
    plane: { eyebrow: 'Domestic & Regional Aviation', title: 'Flights' },
  };

  const category = window.Tickety.activeCategoryFromLocation();
  const urlParams = new URLSearchParams(window.location.search);

  const eyebrowEl = document.getElementById('browse-eyebrow');
  const titleEl = document.getElementById('browse-title');
  const qInput = document.getElementById('filter-q');
  const cityWrap = document.getElementById('field-city-wrap');
  const citySelect = document.getElementById('filter-city');
  const originWrap = document.getElementById('field-origin-wrap');
  const originSelect = document.getElementById('filter-origin');
  const destWrap = document.getElementById('field-destination-wrap');
  const destSelect = document.getElementById('filter-destination');
  const priceWrap = document.getElementById('field-price-wrap');
  const maxPriceInput = document.getElementById('filter-max-price');
  const availSelect = document.getElementById('filter-availability');
  const sortSelect = document.getElementById('filter-sort');
  const resetBtn = document.getElementById('filter-reset-btn');
  const countEl = document.getElementById('results-count');
  const gridEl = document.getElementById('browse-grid');

  if (category && CATEGORY_TITLES[category]) {
    eyebrowEl.textContent = CATEGORY_TITLES[category].eyebrow;
    titleEl.textContent = CATEGORY_TITLES[category].title;
    document.title = `${CATEGORY_TITLES[category].title} — Tickety`;
  }

  const isRouteCategory = ['bus', 'train', 'plane'].includes(category);
  if (isRouteCategory) {
    cityWrap.style.display = 'none';
    priceWrap.style.display = 'none';
    originWrap.style.display = '';
    destWrap.style.display = '';
  }

  if (urlParams.get('q')) {
    qInput.value = urlParams.get('q');
  }

  let facetsPopulated = false;

  async function loadCatalogue() {
    const query = new URLSearchParams();
    if (category) query.set('category', category);
    if (qInput.value.trim()) query.set('q', qInput.value.trim());
    if (!isRouteCategory && citySelect.value) query.set('city', citySelect.value);
    if (isRouteCategory && originSelect.value) query.set('origin', originSelect.value);
    if (isRouteCategory && destSelect.value) query.set('destination', destSelect.value);
    if (!isRouteCategory && maxPriceInput.value) query.set('maxPrice', maxPriceInput.value);
    if (availSelect.value) query.set('availability', availSelect.value);
    if (sortSelect.value) query.set('sort', sortSelect.value);

    try {
      const { events, facets } = await window.Tickety.apiFetch(`/api/events?${query.toString()}`);

      if (!facetsPopulated && facets) {
        facetsPopulated = true;
        if (facets.cities?.length) {
          citySelect.innerHTML =
            '<option value="">All Cities</option>' +
            facets.cities
              .map((c) => `<option value="${window.Tickety.escapeHtml(c)}">${window.Tickety.escapeHtml(c)}</option>`)
              .join('');
        }
        if (facets.origins?.length) {
          originSelect.innerHTML =
            '<option value="">All Origins</option>' +
            facets.origins
              .map((o) => `<option value="${window.Tickety.escapeHtml(o)}">${window.Tickety.escapeHtml(o)}</option>`)
              .join('');
        }
        if (facets.destinations?.length) {
          destSelect.innerHTML =
            '<option value="">All Destinations</option>' +
            facets.destinations
              .map((d) => `<option value="${window.Tickety.escapeHtml(d)}">${window.Tickety.escapeHtml(d)}</option>`)
              .join('');
        }
      }

      countEl.textContent = `${events.length} ${events.length === 1 ? 'listing' : 'listings'} shown`;

      if (events.length === 0) {
        gridEl.innerHTML = `<p>No listings match the selected criteria.</p>`;
        return;
      }

      gridEl.innerHTML = events.map(window.Tickety.renderEventCard).join('');
    } catch (err) {
      countEl.textContent = err.message;
    }
  }

  let debounce = null;
  qInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(loadCatalogue, 200);
  });
  maxPriceInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(loadCatalogue, 200);
  });

  [citySelect, originSelect, destSelect, availSelect, sortSelect].forEach((el) => {
    el.addEventListener('change', loadCatalogue);
  });

  resetBtn.addEventListener('click', () => {
    qInput.value = '';
    citySelect.value = '';
    originSelect.value = '';
    destSelect.value = '';
    maxPriceInput.value = '';
    availSelect.value = '';
    sortSelect.value = 'date-asc';
    loadCatalogue();
  });

  loadCatalogue();
});
