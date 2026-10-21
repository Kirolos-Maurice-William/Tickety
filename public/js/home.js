document.addEventListener('DOMContentLoaded', async () => {
  const venueGrid = document.getElementById('home-venue-grid');
  const transitGrid = document.getElementById('home-transit-grid');
  const searchForm = document.getElementById('hero-search-form');

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = document.getElementById('hero-search-q').value.trim();
      const cat = document.getElementById('hero-search-cat').value;
      const params = new URLSearchParams();
      if (cat) params.set('category', cat);
      if (q) params.set('q', q);
      const target = cat && !q ? `/${cat}` : `/browse?${params.toString()}`;
      window.location.href = target;
    });
  }

  try {
    const { events } = await window.Tickety.apiFetch('/api/events');
    const venueEvents = (events || [])
      .filter((e) => ['cinema', 'concert', 'football'].includes(e.category))
      .slice(0, 6);
    const transitEvents = (events || [])
      .filter((e) => ['bus', 'train', 'plane'].includes(e.category))
      .slice(0, 6);

    if (venueGrid) {
      venueGrid.innerHTML = venueEvents.map(window.Tickety.renderEventCard).join('');
    }
    if (transitGrid) {
      transitGrid.innerHTML = transitEvents.map(window.Tickety.renderEventCard).join('');
    }
  } catch (err) {
    if (venueGrid) {
      venueGrid.innerHTML = `<p>${window.Tickety.escapeHtml(err.message)}</p>`;
    }
  }
});
