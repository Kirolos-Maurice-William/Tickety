const express = require('express');
const QRCode = require('qrcode');
const store = require('../lib/store');
const { isValidCinemaSeat } = require('../lib/catalog');
const { HttpError, asyncHandler } = require('../lib/http');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function attachQr(booking) {
  const payload = JSON.stringify({
    ref: booking.reference,
    event: booking.snapshot?.title || booking.eventId,
    tier: booking.tierLabel,
    seats: booking.seats,
    qty: booking.quantity,
    status: booking.status,
  });

  const qrSvg = await QRCode.toString(payload, {
    type: 'svg',
    margin: 0,
    color: {
      dark: '#111111',
      light: '#00000000',
    },
  });

  return { ...booking, qrSvg };
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const list = await store.listBookingsForUser(req.user.id);
    const bookings = await Promise.all(list.map(attachQr));
    res.json({ bookings });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await store.getBookingForUser(req.params.id, req.user.id);
    if (!booking) {
      throw new HttpError(404, 'Booking not found.');
    }
    res.json({ booking: await attachQr(booking) });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { eventId, tier, seats, quantity, attendee } = req.body || {};
    if (!eventId || !tier) {
      throw new HttpError(400, 'Event and ticket tier are required.');
    }

    if (Array.isArray(seats) && seats.length > 0) {
      const invalid = seats.filter((s) => !isValidCinemaSeat(String(s).trim().toUpperCase()));
      if (invalid.length > 0) {
        throw new HttpError(400, `Invalid seat selection: ${invalid.join(', ')}`);
      }
    }

    const created = await store.createBooking({
      user: req.user,
      eventId,
      tierKey: tier,
      seats,
      quantity,
      attendee: attendee || {},
    });

    res.status(201).json({ booking: await attachQr(created) });
  })
);

router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { seats, quantity } = req.body || {};
    const updated = await store.cancelBooking({
      bookingId: req.params.id,
      userId: req.user.id,
      seatsToCancel: seats,
      quantityToCancel: quantity,
    });
    res.json({ booking: await attachQr(updated) });
  })
);

module.exports = router;
