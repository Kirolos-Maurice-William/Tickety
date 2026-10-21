const crypto = require('crypto');
const rawEvents = require('./events');
const { CATEGORIES, allCinemaSeats, capacityFor } = require('../lib/catalog');

function deterministicObjectId(seed) {
  return crypto.createHash('sha1').update(`tickety:${seed}`).digest('hex').slice(0, 24);
}

function hashFloat(seed) {
  const int = crypto.createHash('md5').update(seed).digest().readUInt32BE(0);
  return int / 0xffffffff;
}

function buildStartsAt(baseDate, dayOffset, timeString) {
  const [hours, minutes] = String(timeString || '20:00')
    .split(':')
    .map((n) => Number.parseInt(n, 10) || 0);
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function buildBookedCinemaSeats(slug, soldRatio) {
  const seats = allCinemaSeats();
  const tiers = CATEGORIES.cinema.tiers.map((t) => t.key);
  const booked = [];

  for (const tier of tiers) {
    const targetCount = Math.round(seats.length * soldRatio);
    const ranked = seats
      .map((seat) => {
        // Middle rows (C, D, E) and middle seats (4-7) are slightly more likely to be pre-booked.
        const row = seat[0];
        const num = Number.parseInt(seat.slice(1), 10);
        const centerRowBias = ['C', 'D', 'E'].includes(row) ? -0.18 : 0;
        const centerSeatBias = num >= 4 && num <= 7 ? -0.15 : 0;
        return {
          seat,
          score: hashFloat(`${slug}:${tier}:${seat}`) + centerRowBias + centerSeatBias,
        };
      })
      .sort((a, b) => a.score - b.score);

    for (let i = 0; i < targetCount && i < ranked.length; i += 1) {
      booked.push(`${tier}:${ranked[i].seat}`);
    }
  }

  return booked;
}

function buildSeedEvents(now = new Date()) {
  return rawEvents.map((item) => {
    const _id = deterministicObjectId(`event:${item.slug}`);
    const startsAt = buildStartsAt(now, item.day, item.time);

    if (item.category === 'cinema') {
      const capacity = capacityFor('cinema');
      const bookedSeats = buildBookedCinemaSeats(item.slug, item.sold || 0.25);
      // Ensure seats D5 and D6 in standard tier are kept available for fresh bookings,
      // while imax:E5 and imax:E6 are always in bookedSeats for the sample guest ticket.
      const set = new Set(bookedSeats);
      set.delete('standard:D5');
      set.delete('standard:D6');
      set.add('imax:E5');
      set.add('imax:E6');
      const finalBooked = Array.from(set);
      return {
        _id,
        slug: item.slug,
        category: item.category,
        title: item.title,
        subtitle: item.subtitle || '',
        description: item.description,
        image: item.image,
        tags: item.tags || [],
        venue: item.venue || '',
        city: item.city || '',
        origin: '',
        destination: '',
        operator: '',
        startsAt,
        durationMinutes: item.durationMinutes || 120,
        basePrice: item.basePrice,
        capacity,
        available: Math.max(0, capacity - finalBooked.length),
        bookedSeats: finalBooked,
      };
    }

    const capacity = item.capacity || 200;
    const soldCount = Math.min(capacity, Math.max(0, Math.round(capacity * (item.sold || 0))));
    const available = Math.max(0, capacity - soldCount);

    return {
      _id,
      slug: item.slug,
      category: item.category,
      title: item.title,
      subtitle: item.subtitle || '',
      description: item.description,
      image: item.image,
      tags: item.tags || [],
      venue: item.venue || '',
      city: item.city || '',
      origin: item.origin || '',
      destination: item.destination || '',
      operator: item.operator || '',
      startsAt,
      durationMinutes: item.durationMinutes || 120,
      basePrice: item.basePrice,
      capacity,
      available,
      bookedSeats: [],
    };
  });
}

module.exports = {
  deterministicObjectId,
  buildSeedEvents,
};
