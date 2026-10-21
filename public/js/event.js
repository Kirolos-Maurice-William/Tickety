document.addEventListener('DOMContentLoaded', async () => {
  const mount = document.getElementById('event-detail-mount');
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('id') || params.get('ticket') || '';

  if (!eventId) {
    mount.innerHTML = `<p>No event specified. <a href="/browse" class="section-link">Return to catalogue</a>.</p>`;
    return;
  }

  const { escapeHtml, formatCurrency, formatDateTime } = window.Tickety;

  try {
    const user = await window.Tickety.ensureSession();
    const { event, category, seatMap } = await window.Tickety.apiFetch(
      `/api/events/${encodeURIComponent(eventId)}`
    );

    document.title = `${event.title} — Tickety`;

    let selectedTier = event.tiers[0]?.key || 'standard';
    let selectedSeats = [];
    let quantity = 1;

    const isSeated = Boolean(category?.seated && seatMap);
    const isSoldOut = event.available === 0;

    const placeFactLabel = event.venue ? 'Venue' : 'Route';
    const placeFactValue = event.venue
      ? `${event.venue}, ${event.city}`
      : `${event.origin} to ${event.destination}`;

    const thirdFactLabel = event.operator ? 'Operator' : 'Availability';
    const thirdFactValue = event.operator
      ? event.operator
      : `${event.available} of ${event.capacity} open`;

    mount.innerHTML = `
      <div class="event-detail-grid">
        <div>
          <img class="detail-photo" src="${escapeHtml(event.image)}" alt="${escapeHtml(event.title)}" />
          <span class="eyebrow">${escapeHtml(category?.label || event.category)} &middot; ${escapeHtml(event.subtitle)}</span>
          <h1 class="display-title">${escapeHtml(event.title)}</h1>

          <div class="detail-facts">
            <div>
              <div class="fact-label">${escapeHtml(placeFactLabel)}</div>
              <div class="fact-value">${escapeHtml(placeFactValue)}</div>
            </div>
            <div>
              <div class="fact-label">Schedule</div>
              <div class="fact-value">${formatDateTime(event.startsAt)}</div>
            </div>
            <div>
              <div class="fact-label">${escapeHtml(thirdFactLabel)}</div>
              <div class="fact-value">${escapeHtml(thirdFactValue)}</div>
            </div>
          </div>

          <p class="lead" style="font-size: 1.1rem; line-height: 1.7;">
            ${escapeHtml(event.description)}
          </p>
        </div>

        <aside class="booking-panel" aria-label="Ticket reservation">
          <div>
            <span class="eyebrow">Reservation Desk</span>
            <h2 class="section-title">Select ${isSeated ? 'Format &amp; Seats' : 'Class &amp; Quantity'}</h2>
          </div>

          <div class="field">
            <span class="field-label">1. Select Tier</span>
            <div id="tier-list" class="tier-list"></div>
          </div>

          ${
            isSeated
              ? `
                <div class="field">
                  <span class="field-label">2. Select Seats (Maximum ${category.maxPerBooking})</span>
                  <div class="cinema-hall">
                    <div class="screen-indicator">Screen</div>
                    <div id="seat-grid" class="seat-grid"></div>
                    <div class="seat-legend">
                      <span class="legend-item"><span class="legend-swatch"></span> Available</span>
                      <span class="legend-item"><span class="legend-swatch selected"></span> Selected</span>
                      <span class="legend-item"><span class="legend-swatch booked"></span> Sold</span>
                    </div>
                  </div>
                </div>
              `
              : `
                <div class="field">
                  <span class="field-label">2. Number of Tickets (Maximum ${category.maxPerBooking})</span>
                  <div class="qty-control">
                    <button type="button" id="qty-dec" class="qty-btn" aria-label="Decrease quantity">&minus;</button>
                    <span id="qty-val" class="qty-value">1</span>
                    <button type="button" id="qty-inc" class="qty-btn" aria-label="Increase quantity">+</button>
                  </div>
                </div>
              `
          }

          <div class="field">
            <label class="field-label" for="attendee-name">Attendee Name</label>
            <input
              id="attendee-name"
              class="input"
              type="text"
              value="${escapeHtml(user?.name || 'Guest')}"
              placeholder="Full name for ticket"
            />
          </div>

          <div id="selection-summary-note" class="notice-banner"></div>

          <div class="order-summary-row">
            <span>Total Due</span>
            <span id="order-total" class="order-total-amount">EGP 0</span>
          </div>

          <button
            type="button"
            id="confirm-booking-btn"
            class="btn btn-primary"
            ${isSoldOut ? 'disabled' : ''}
          >
            ${isSoldOut ? 'Sold Out' : 'Confirm Booking'}
          </button>
        </aside>
      </div>
    `;

    const tierListEl = document.getElementById('tier-list');
    const summaryNoteEl = document.getElementById('selection-summary-note');
    const totalEl = document.getElementById('order-total');
    const confirmBtn = document.getElementById('confirm-booking-btn');

    function currentTierObj() {
      return event.tiers.find((t) => t.key === selectedTier) || event.tiers[0];
    }

    function renderTiers() {
      tierListEl.innerHTML = event.tiers
        .map(
          (t) => `
            <button
              type="button"
              class="tier-option ${t.key === selectedTier ? 'selected' : ''}"
              data-tier="${escapeHtml(t.key)}"
            >
              <span class="tier-name">${escapeHtml(t.label)}</span>
              <span class="tier-price">${formatCurrency(t.price)}</span>
            </button>
          `
        )
        .join('');

      tierListEl.querySelectorAll('.tier-option').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedTier = btn.getAttribute('data-tier');
          selectedSeats = [];
          renderTiers();
          if (isSeated) renderSeatGrid();
          updateSummary();
        });
      });
    }

    function renderSeatGrid() {
      const grid = document.getElementById('seat-grid');
      if (!grid || !seatMap) return;

      const bookedSet = new Set(seatMap.bookedByTier[selectedTier] || []);

      grid.innerHTML = seatMap.rows
        .map((row) => {
          const cells = [];
          for (let n = 1; n <= seatMap.seatsPerRow; n += 1) {
            const code = `${row}${n}`;
            const isBooked = bookedSet.has(code);
            const isSelected = selectedSeats.includes(code);
            cells.push(`
              <button
                type="button"
                class="seat-btn ${isBooked ? 'booked' : ''} ${isSelected ? 'selected' : ''}"
                data-seat="${code}"
                ${isBooked ? 'disabled' : ''}
                aria-label="Seat ${code}"
              >${code}</button>
            `);
            if (n === seatMap.aisleAfter) {
              cells.push(`<span class="seat-aisle" aria-hidden="true"></span>`);
            }
          }
          return `
            <div class="seat-row">
              <span class="seat-row-label">${row}</span>
              ${cells.join('')}
              <span class="seat-row-label">${row}</span>
            </div>
          `;
        })
        .join('');

      grid.querySelectorAll('.seat-btn:not(.booked)').forEach((btn) => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-seat');
          if (selectedSeats.includes(code)) {
            selectedSeats = selectedSeats.filter((s) => s !== code);
          } else {
            if (selectedSeats.length >= category.maxPerBooking) {
              window.Tickety.showToast(`Maximum ${category.maxPerBooking} seats per booking.`);
              return;
            }
            selectedSeats.push(code);
          }
          renderSeatGrid();
          updateSummary();
        });
      });
    }

    function updateSummary() {
      const tier = currentTierObj();
      if (isSeated) {
        const count = selectedSeats.length;
        const total = count * tier.price;
        totalEl.textContent = formatCurrency(total);
        summaryNoteEl.textContent =
          count > 0
            ? `${tier.label} — Selected seats: ${selectedSeats.join(', ')} (${count} × ${formatCurrency(tier.price)})`
            : `${tier.label} — Click available squares on the hall map above to select your seats.`;
        confirmBtn.disabled = isSoldOut || count === 0;
      } else {
        const total = quantity * tier.price;
        totalEl.textContent = formatCurrency(total);
        summaryNoteEl.textContent = `${tier.label} — ${quantity} ${quantity === 1 ? 'ticket' : 'tickets'} × ${formatCurrency(tier.price)}. Seat assignment is printed on your boarding/entry pass.`;
        confirmBtn.disabled = isSoldOut;
      }
    }

    if (!isSeated) {
      const decBtn = document.getElementById('qty-dec');
      const incBtn = document.getElementById('qty-inc');
      const valEl = document.getElementById('qty-val');

      decBtn.addEventListener('click', () => {
        if (quantity > 1) {
          quantity -= 1;
          valEl.textContent = String(quantity);
          updateSummary();
        }
      });

      incBtn.addEventListener('click', () => {
        const max = Math.min(category.maxPerBooking, event.available || category.maxPerBooking);
        if (quantity < max) {
          quantity += 1;
          valEl.textContent = String(quantity);
          updateSummary();
        }
      });
    }

    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      const originalText = confirmBtn.textContent;
      confirmBtn.textContent = 'Issuing Ticket...';

      try {
        const attendeeName = document.getElementById('attendee-name').value.trim() || 'Guest';
        const payload = {
          eventId: event.id,
          tier: selectedTier,
          seats: isSeated ? selectedSeats : [],
          quantity: isSeated ? selectedSeats.length : quantity,
          attendee: { name: attendeeName },
        };

        const { booking } = await window.Tickety.apiFetch('/api/bookings', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        await window.Tickety.refreshTicketBadge();
        window.location.href = `/tickets?booked=${encodeURIComponent(booking.reference)}`;
      } catch (err) {
        window.Tickety.showToast(err.message);
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
      }
    });

    renderTiers();
    if (isSeated) renderSeatGrid();
    updateSummary();
  } catch (err) {
    mount.innerHTML = `<p>${escapeHtml(err.message)} — <a href="/browse" class="section-link">Return to catalogue</a>.</p>`;
  }
});
