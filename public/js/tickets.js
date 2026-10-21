document.addEventListener('DOMContentLoaded', async () => {
  const { escapeHtml, formatCurrency, formatDateTime, apiFetch, showToast } = window.Tickety;

  const listEl = document.getElementById('tickets-list');
  const summaryEl = document.getElementById('tickets-summary-label');
  const filterCatEl = document.getElementById('tickets-filter-cat');
  const bannerEl = document.getElementById('booked-banner');

  const modalBackdrop = document.getElementById('cancel-modal');
  const modalBody = document.getElementById('cancel-modal-body');
  const modalCloseBtn = document.getElementById('cancel-modal-close');
  const modalConfirmBtn = document.getElementById('cancel-modal-confirm');

  const params = new URLSearchParams(window.location.search);
  const justBookedRef = params.get('booked');
  if (justBookedRef) {
    bannerEl.style.display = 'block';
    bannerEl.textContent = `Booking confirmed under reference ${justBookedRef}. Present the QR pass below at the venue or boarding gate.`;
  }

  let allBookings = [];
  let activeBookingToCancel = null;

  async function loadBookings() {
    try {
      await window.Tickety.ensureSession();
      const { bookings } = await apiFetch('/api/bookings');
      allBookings = bookings || [];
      renderBookings();
    } catch (err) {
      summaryEl.textContent = err.message;
    }
  }

  function renderBookings() {
    const cat = filterCatEl.value;
    const filtered = allBookings.filter((b) => cat === 'all' || b.category === cat);
    const activeCount = filtered.filter((b) => b.status === 'confirmed').length;

    summaryEl.textContent = `${activeCount} active ${activeCount === 1 ? 'reservation' : 'reservations'} (${filtered.length} total)`;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="notice-banner">
          No reservations found in this view. <a href="/browse" class="section-link">Browse upcoming screenings, concerts and departures</a>.
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered
      .map((b) => {
        const snap = b.snapshot || {};
        const place = snap.venue
          ? `${snap.venue}, ${snap.city}`
          : `${snap.origin} to ${snap.destination}`;
        const isCancelled = b.status === 'cancelled';
        const seatSpec =
          b.seats && b.seats.length > 0
            ? `<span><strong>Seats:</strong> ${escapeHtml(b.seats.join(', '))}</span>`
            : `<span><strong>Quantity:</strong> ${b.quantity}</span>`;

        return `
          <article class="ticket-stub ${isCancelled ? 'cancelled' : ''}" data-booking-id="${escapeHtml(b.id)}">
            <div class="ticket-stub-media">
              <img src="${escapeHtml(snap.image || '/images/events/cinema-quiet-meridian.webp')}" alt="${escapeHtml(snap.title)}" />
            </div>

            <div class="ticket-stub-body">
              <div class="event-meta">
                <span>${escapeHtml(b.category)} &middot; ${escapeHtml(b.tierLabel)}</span>
                <span>Status: ${isCancelled ? 'Cancelled' : 'Confirmed'}</span>
              </div>
              <h2 class="event-title">
                <a href="/event?id=${encodeURIComponent(b.eventId)}">${escapeHtml(snap.title || 'Event')}</a>
              </h2>
              <p class="event-sub">${escapeHtml(place)}</p>

              <div class="ticket-stub-specs">
                <span><strong>Date:</strong> ${formatDateTime(snap.startsAt)}</span>
                ${seatSpec}
                <span><strong>Attendee:</strong> ${escapeHtml(b.attendee?.name || 'Guest')}</span>
                <span><strong>Total:</strong> ${formatCurrency(b.total)}</span>
              </div>

              ${
                !isCancelled
                  ? `
                    <div style="padding-top: 0.5rem;">
                      <button
                        type="button"
                        class="btn btn-ghost cancel-booking-trigger"
                        style="padding: 0.45rem 1rem; font-size: 0.9rem;"
                        data-id="${escapeHtml(b.id)}"
                      >
                        ${b.seats?.length > 1 ? 'Cancel Seats or Booking' : 'Cancel Booking'}
                      </button>
                    </div>
                  `
                  : ''
              }
            </div>

            <div class="ticket-stub-qr">
              <div class="qr-box">${b.qrSvg || ''}</div>
              <span class="reference-code">${escapeHtml(b.reference)}</span>
            </div>
          </article>
        `;
      })
      .join('');

    listEl.querySelectorAll('.cancel-booking-trigger').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const booking = allBookings.find((x) => x.id === id);
        if (booking) openCancelModal(booking);
      });
    });
  }

  function openCancelModal(booking) {
    activeBookingToCancel = booking;
    const hasSeats = booking.seats && booking.seats.length > 0;

    if (hasSeats) {
      modalBody.innerHTML = `
        <p>${escapeHtml(booking.snapshot?.title || '')} &mdash; Reference ${escapeHtml(booking.reference)}</p>
        <div class="field">
          <span class="field-label">Select seats to release</span>
          <div class="seat-check-grid">
            ${booking.seats
              .map(
                (s) => `
                  <label class="seat-check-label">
                    <input type="checkbox" name="cancel-seat" value="${escapeHtml(s)}" checked />
                    <span>Seat ${escapeHtml(s)}</span>
                  </label>
                `
              )
              .join('')}
          </div>
        </div>
      `;
    } else {
      modalBody.innerHTML = `
        <p>${escapeHtml(booking.snapshot?.title || '')} &mdash; Reference ${escapeHtml(booking.reference)}</p>
        <div class="field">
          <label class="field-label" for="cancel-qty-input">Number of tickets to cancel (1 to ${booking.quantity})</label>
          <input
            id="cancel-qty-input"
            class="input"
            type="number"
            min="1"
            max="${booking.quantity}"
            value="${booking.quantity}"
          />
        </div>
      `;
    }

    modalBackdrop.classList.add('open');
  }

  function closeCancelModal() {
    modalBackdrop.classList.remove('open');
    activeBookingToCancel = null;
  }

  modalCloseBtn.addEventListener('click', closeCancelModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeCancelModal();
  });

  modalConfirmBtn.addEventListener('click', async () => {
    if (!activeBookingToCancel) return;
    const b = activeBookingToCancel;
    const hasSeats = b.seats && b.seats.length > 0;
    let payload = {};

    if (hasSeats) {
      const checked = Array.from(modalBody.querySelectorAll('input[name="cancel-seat"]:checked')).map(
        (el) => el.value
      );
      if (checked.length === 0) {
        showToast('Select at least one seat to cancel.');
        return;
      }
      payload = { seats: checked };
    } else {
      const qtyInput = document.getElementById('cancel-qty-input');
      const qty = Number.parseInt(qtyInput?.value || '1', 10);
      payload = { quantity: qty };
    }

    modalConfirmBtn.disabled = true;
    try {
      await apiFetch(`/api/bookings/${encodeURIComponent(b.id)}/cancel`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeCancelModal();
      showToast('Reservation updated and inventory released.');
      await window.Tickety.refreshTicketBadge();
      await loadBookings();
    } catch (err) {
      showToast(err.message);
    } finally {
      modalConfirmBtn.disabled = false;
    }
  });

  filterCatEl.addEventListener('change', renderBookings);

  loadBookings();
});
