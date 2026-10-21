const express = require('express');
const store = require('../lib/store');
const {
  CATEGORIES,
  CATEGORY_KEYS,
  CINEMA_LAYOUT,
  getCategory,
  isValidCinemaSeat,
} = require('../lib/catalog');
const { HttpError, asyncHandler } = require('../lib/http');

const router = express.Router();

router.get('/meta', (_req, res) => {
  res.json({
    categories: CATEGORIES,
    categoryKeys: CATEGORY_KEYS,
    cinemaLayout: CINEMA_LAYOUT,
  });
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      category,
      q,
      city,
      origin,
      destination,
      from,
      to,
      minPrice,
      maxPrice,
      availability,
      sort,
      limit,
    } = req.query;

    if (category && !getCategory(category)) {
      throw new HttpError(400, `Unknown category: ${category}`);
    }

    const allInScope = await store.listEvents({ category });
    const events = await store.listEvents({
      category,
      q,
      city,
      origin,
      destination,
      from,
      to,
      minPrice,
      maxPrice,
      availability,
      sort,
      limit,
    });

    const cities = Array.from(new Set(allInScope.map((e) => e.city).filter(Boolean))).sort();
    const origins = Array.from(new Set(allInScope.map((e) => e.origin).filter(Boolean))).sort();
    const destinations = Array.from(new Set(allInScope.map((e) => e.destination).filter(Boolean))).sort();
    const prices = allInScope.map((e) => e.basePrice);
    const priceBounds = prices.length
      ? { min: Math.min(...prices), max: Math.max(...prices) }
      : { min: 0, max: 1000 };

    res.json({
      events,
      facets: {
        cities,
        origins,
        destinations,
        priceBounds,
      },
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const event = await store.getEventById(req.params.id, { includeBookedSeats: true });
    if (!event) {
      throw new HttpError(404, 'Event not found.');
    }

    const categoryMeta = getCategory(event.category);
    let seatMap = null;

    if (categoryMeta?.seated) {
      const bookedByTier = {};
      for (const tier of categoryMeta.tiers) {
        bookedByTier[tier.key] = [];
      }
      for (const entry of event.bookedSeats || []) {
        const [tierKey, seatCode] = String(entry).split(':');
        if (bookedByTier[tierKey] && isValidCinemaSeat(seatCode)) {
          bookedByTier[tierKey].push(seatCode);
        }
      }
      seatMap = {
        ...CINEMA_LAYOUT,
        bookedByTier,
      };
    }

    const { bookedSeats, ...publicEvent } = event;
    res.json({
      event: publicEvent,
      category: categoryMeta,
      seatMap,
    });
  })
);

module.exports = router;
