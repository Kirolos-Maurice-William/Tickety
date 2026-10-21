/**
 * Single source of truth for categories, ticket tiers and pricing rules.
 * Prices are always calculated on the server from this table; the client only displays them.
 */

const CATEGORIES = {
  cinema: {
    key: 'cinema',
    label: 'Cinema',
    singular: 'Film',
    kind: 'venue',
    seated: true,
    maxPerBooking: 8,
    tiers: [
      { key: 'standard', label: 'Standard', surcharge: 0 },
      { key: 'max', label: 'MAX', surcharge: 50 },
      { key: 'imax', label: 'IMAX', surcharge: 100 },
      { key: 'gold', label: 'Gold Class', surcharge: 150 },
    ],
  },
  concert: {
    key: 'concert',
    label: 'Concerts',
    singular: 'Concert',
    kind: 'venue',
    seated: false,
    maxPerBooking: 10,
    tiers: [
      { key: 'standard', label: 'Standard', surcharge: 0 },
      { key: 'gold', label: 'Gold Circle', surcharge: 150 },
      { key: 'vip', label: 'VIP', surcharge: 400 },
    ],
  },
  football: {
    key: 'football',
    label: 'Football',
    singular: 'Match',
    kind: 'venue',
    seated: false,
    maxPerBooking: 10,
    tiers: [
      { key: 'third', label: 'Third Level', surcharge: 0 },
      { key: 'second', label: 'Second Level', surcharge: 60 },
      { key: 'first', label: 'First Level', surcharge: 150 },
      { key: 'vip', label: 'VIP Box', surcharge: 600 },
    ],
  },
  bus: {
    key: 'bus',
    label: 'Bus',
    singular: 'Coach',
    kind: 'route',
    seated: false,
    maxPerBooking: 10,
    tiers: [
      { key: 'economy', label: 'Economy', surcharge: 0 },
      { key: 'comfort', label: 'Comfort', surcharge: 80 },
      { key: 'business', label: 'Business', surcharge: 200 },
    ],
  },
  train: {
    key: 'train',
    label: 'Train',
    singular: 'Train',
    kind: 'route',
    seated: false,
    maxPerBooking: 10,
    tiers: [
      { key: 'second', label: 'Second Class', surcharge: 0 },
      { key: 'first', label: 'First Class', surcharge: 150 },
      { key: 'sleeper', label: 'Sleeper Cabin', surcharge: 900 },
    ],
  },
  plane: {
    key: 'plane',
    label: 'Flights',
    singular: 'Flight',
    kind: 'route',
    seated: false,
    maxPerBooking: 9,
    tiers: [
      { key: 'economy', label: 'Economy', surcharge: 0 },
      { key: 'premium', label: 'Premium Economy', surcharge: 2200 },
      { key: 'business', label: 'Business', surcharge: 7500 },
    ],
  },
};

const CATEGORY_KEYS = Object.keys(CATEGORIES);

/** Cinema halls share one layout: rows A-G, 10 seats per row, aisle after seat 5. */
const CINEMA_LAYOUT = {
  rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  seatsPerRow: 10,
  aisleAfter: 5,
};

function getCategory(key) {
  return CATEGORIES[key] || null;
}

function getTier(categoryKey, tierKey) {
  const category = getCategory(categoryKey);
  if (!category) return null;
  return category.tiers.find((tier) => tier.key === tierKey) || null;
}

function priceFor(basePrice, categoryKey, tierKey) {
  const tier = getTier(categoryKey, tierKey);
  if (!tier) return null;
  return basePrice + tier.surcharge;
}

function tiersWithPrices(basePrice, categoryKey) {
  const category = getCategory(categoryKey);
  if (!category) return [];
  return category.tiers.map((tier) => ({
    key: tier.key,
    label: tier.label,
    price: basePrice + tier.surcharge,
  }));
}

function allCinemaSeats() {
  const seats = [];
  for (const row of CINEMA_LAYOUT.rows) {
    for (let n = 1; n <= CINEMA_LAYOUT.seatsPerRow; n += 1) seats.push(`${row}${n}`);
  }
  return seats;
}

const CINEMA_SEATS = new Set(allCinemaSeats());

function isValidCinemaSeat(seat) {
  return CINEMA_SEATS.has(seat);
}

/** Total sellable capacity of an event across all tiers. */
function capacityFor(categoryKey, perTierCapacity) {
  const category = getCategory(categoryKey);
  if (category && category.seated) return CINEMA_SEATS.size * category.tiers.length;
  return perTierCapacity;
}

module.exports = {
  CATEGORIES,
  CATEGORY_KEYS,
  CINEMA_LAYOUT,
  getCategory,
  getTier,
  priceFor,
  tiersWithPrices,
  allCinemaSeats,
  isValidCinemaSeat,
  capacityFor,
};
