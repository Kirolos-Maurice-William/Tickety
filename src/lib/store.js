const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectDB, isMongoConnected, state } = require('../config/db');
const env = require('../config/env');
const User = require('../models/User');
const Event = require('../models/Event');
const Booking = require('../models/Booking');
const Message = require('../models/Message');
const { buildSeedEvents, deterministicObjectId } = require('../seed');
const { getCategory, getTier, priceFor, tiersWithPrices } = require('./catalog');
const { HttpError, escapeRegex } = require('./http');

const mem = global.__ticketyMemoryStore || {
  events: new Map(),
  users: new Map(),
  bookings: new Map(),
  messages: [],
};
global.__ticketyMemoryStore = mem;

const HEX_ID_REGEX = /^[0-9a-fA-F]{24}$/;

function isObjectIdHex(value) {
  return HEX_ID_REGEX.test(String(value || ''));
}

function newObjectIdString() {
  return new mongoose.Types.ObjectId().toString();
}

function generateReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `TKT-${suffix}`;
}

function serializeEvent(doc, { includeBookedSeats = false } = {}) {
  const raw = doc.toObject ? doc.toObject() : doc;
  const id = String(raw._id || raw.id);
  const tiers = tiersWithPrices(raw.basePrice, raw.category);
  const out = {
    id,
    slug: raw.slug,
    category: raw.category,
    title: raw.title,
    subtitle: raw.subtitle || '',
    description: raw.description,
    image: raw.image,
    tags: raw.tags || [],
    venue: raw.venue || '',
    city: raw.city || '',
    origin: raw.origin || '',
    destination: raw.destination || '',
    operator: raw.operator || '',
    startsAt: new Date(raw.startsAt).toISOString(),
    durationMinutes: raw.durationMinutes || 120,
    basePrice: raw.basePrice,
    capacity: raw.capacity,
    available: raw.available,
    tiers,
  };
  if (includeBookedSeats) {
    out.bookedSeats = Array.isArray(raw.bookedSeats) ? [...raw.bookedSeats] : [];
  }
  return out;
}

function serializeBooking(doc) {
  const raw = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(raw._id || raw.id),
    reference: raw.reference,
    userId: String(raw.user),
    eventId: String(raw.event),
    category: raw.category,
    tier: raw.tier,
    tierLabel: raw.tierLabel,
    seats: Array.isArray(raw.seats) ? [...raw.seats] : [],
    quantity: raw.quantity,
    unitPrice: raw.unitPrice,
    total: raw.total,
    status: raw.status,
    attendee: {
      name: raw.attendee?.name || '',
      email: raw.attendee?.email || '',
    },
    snapshot: {
      title: raw.snapshot?.title || '',
      subtitle: raw.snapshot?.subtitle || '',
      image: raw.snapshot?.image || '',
      venue: raw.snapshot?.venue || '',
      city: raw.snapshot?.city || '',
      origin: raw.snapshot?.origin || '',
      destination: raw.snapshot?.destination || '',
      startsAt: raw.snapshot?.startsAt ? new Date(raw.snapshot.startsAt).toISOString() : null,
      durationMinutes: raw.snapshot?.durationMinutes || 120,
    },
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    cancelledAt: raw.cancelledAt ? new Date(raw.cancelledAt).toISOString() : null,
  };
}

function serializeUser(doc) {
  if (!doc) return null;
  if (typeof doc.toPublic === 'function') return doc.toPublic();
  return {
    id: String(doc._id || doc.id),
    name: doc.name || 'Guest',
    email: doc.email || null,
    phone: doc.phone || '',
    isGuest: Boolean(doc.isGuest),
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
  };
}

async function ensureReady({ forceSeed = false } = {}) {
  await connectDB();
  if (state.seeded && !forceSeed) return;

  const seedDocs = buildSeedEvents(new Date());

  if (isMongoConnected()) {
    if (forceSeed) {
      await Event.deleteMany({});
      await Booking.deleteMany({});
      await User.deleteMany({ isGuest: true });
      await Event.insertMany(seedDocs);
    } else {
      const count = await Event.countDocuments();
      if (count === 0) {
        await Event.insertMany(seedDocs);
      }
    }
  } else {
    if (forceSeed || mem.events.size === 0) {
      mem.events.clear();
      for (const doc of seedDocs) {
        mem.events.set(String(doc._id), { ...doc });
      }
    }
    if (forceSeed) {
      mem.bookings.clear();
      for (const [id, u] of mem.users.entries()) {
        if (u.isGuest) mem.users.delete(id);
      }
    }
  }

  state.seeded = true;
}

async function createSampleBookingForGuest(user) {
  const sampleEventId = deterministicObjectId('event:cinema-quiet-meridian');
  const event = await getEventById(sampleEventId, { includeBookedSeats: true });
  if (!event) return null;

  const unitPrice = priceFor(event.basePrice, 'cinema', 'imax');
  const seats = ['E5', 'E6'];
  const now = new Date();
  const bookingData = {
    _id: newObjectIdString(),
    reference: generateReference(),
    user: user.id,
    event: event.id,
    category: 'cinema',
    tier: 'imax',
    tierLabel: 'IMAX',
    seats,
    quantity: seats.length,
    unitPrice,
    total: unitPrice * seats.length,
    status: 'confirmed',
    attendee: {
      name: user.name || 'Guest',
      email: user.email || '',
    },
    snapshot: {
      title: event.title,
      subtitle: event.subtitle,
      image: event.image,
      venue: event.venue,
      city: event.city,
      origin: event.origin,
      destination: event.destination,
      startsAt: event.startsAt,
      durationMinutes: event.durationMinutes,
    },
    createdAt: now,
  };

  if (isMongoConnected()) {
    const created = await Booking.create(bookingData);
    return serializeBooking(created);
  }
  mem.bookings.set(String(bookingData._id), bookingData);
  return serializeBooking(bookingData);
}

async function listEvents(filters = {}) {
  await ensureReady();

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
    sort = 'date-asc',
    limit,
  } = filters;

  let items = [];
  if (isMongoConnected()) {
    const query = {};
    if (category) query.category = category;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      query.$or = [
        { title: rx },
        { subtitle: rx },
        { description: rx },
        { venue: rx },
        { city: rx },
        { origin: rx },
        { destination: rx },
        { operator: rx },
      ];
    }
    const docs = await Event.find(query).lean();
    items = docs.map((d) => serializeEvent(d));
  } else {
    items = Array.from(mem.events.values()).map((d) => serializeEvent(d));
    if (category) {
      items = items.filter((e) => e.category === category);
    }
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      items = items.filter((e) =>
        [e.title, e.subtitle, e.description, e.venue, e.city, e.origin, e.destination, e.operator].some((field) =>
          rx.test(field || '')
        )
      );
    }
  }

  if (city) {
    items = items.filter((e) => e.city.toLowerCase() === String(city).toLowerCase());
  }
  if (origin) {
    items = items.filter((e) => e.origin.toLowerCase() === String(origin).toLowerCase());
  }
  if (destination) {
    items = items.filter((e) => e.destination.toLowerCase() === String(destination).toLowerCase());
  }
  if (from) {
    const fromTime = new Date(from).getTime();
    if (!Number.isNaN(fromTime)) {
      items = items.filter((e) => new Date(e.startsAt).getTime() >= fromTime);
    }
  }
  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999);
      items = items.filter((e) => new Date(e.startsAt).getTime() <= toDate.getTime());
    }
  }
  if (minPrice !== undefined && minPrice !== '') {
    const min = Number(minPrice);
    if (Number.isFinite(min)) items = items.filter((e) => e.basePrice >= min);
  }
  if (maxPrice !== undefined && maxPrice !== '') {
    const max = Number(maxPrice);
    if (Number.isFinite(max)) items = items.filter((e) => e.basePrice <= max);
  }
  if (availability === 'available') {
    items = items.filter((e) => e.available > 0);
  } else if (availability === 'soldout') {
    items = items.filter((e) => e.available === 0);
  }

  if (sort === 'price-asc') {
    items.sort((a, b) => a.basePrice - b.basePrice);
  } else if (sort === 'price-desc') {
    items.sort((a, b) => b.basePrice - a.basePrice);
  } else if (sort === 'title-asc') {
    items.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  if (limit && Number.isFinite(Number(limit))) {
    items = items.slice(0, Number(limit));
  }

  return items;
}

async function getEventById(idOrSlug, { includeBookedSeats = false } = {}) {
  await ensureReady();
  const key = String(idOrSlug || '').trim();
  if (!key) return null;

  if (isMongoConnected()) {
    let doc = null;
    if (isObjectIdHex(key)) {
      doc = await Event.findById(key).lean();
    }
    if (!doc) {
      doc = await Event.findOne({ slug: key }).lean();
    }
    return doc ? serializeEvent(doc, { includeBookedSeats }) : null;
  }

  let doc = mem.events.get(key);
  if (!doc) {
    doc = Array.from(mem.events.values()).find((e) => e.slug === key);
  }
  return doc ? serializeEvent(doc, { includeBookedSeats }) : null;
}

async function createGuestUser() {
  await ensureReady();
  const expiresAt = new Date(Date.now() + env.guestSessionHours * 60 * 60 * 1000);
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  const name = `Guest ${suffix}`;

  let user;
  if (isMongoConnected()) {
    const doc = await User.create({
      name,
      isGuest: true,
      expiresAt,
    });
    user = serializeUser(doc);
  } else {
    const _id = newObjectIdString();
    const doc = {
      _id,
      name,
      email: null,
      phone: '',
      isGuest: true,
      expiresAt,
      createdAt: new Date(),
    };
    mem.users.set(_id, doc);
    user = serializeUser(doc);
  }

  await createSampleBookingForGuest(user);
  return user;
}

async function findUserById(userId, fallbackClaims = null) {
  await ensureReady();
  const id = String(userId || '');
  if (!id) return null;

  if (isMongoConnected()) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await User.findById(id);
    if (doc) return serializeUser(doc);
    if (fallbackClaims && fallbackClaims.isGuest) {
      const recreated = await User.create({
        _id: id,
        name: fallbackClaims.name || 'Guest',
        isGuest: true,
        expiresAt: new Date(Date.now() + env.guestSessionHours * 60 * 60 * 1000),
      });
      await createSampleBookingForGuest(serializeUser(recreated));
      return serializeUser(recreated);
    }
    return null;
  }

  let doc = mem.users.get(id);
  if (!doc && fallbackClaims) {
    doc = {
      _id: id,
      name: fallbackClaims.name || 'Guest',
      email: fallbackClaims.email || null,
      phone: fallbackClaims.phone || '',
      isGuest: Boolean(fallbackClaims.isGuest),
      expiresAt: fallbackClaims.isGuest
        ? new Date(Date.now() + env.guestSessionHours * 60 * 60 * 1000)
        : null,
      createdAt: new Date(),
    };
    mem.users.set(id, doc);
    if (doc.isGuest) {
      await createSampleBookingForGuest(serializeUser(doc));
    }
  }
  return doc ? serializeUser(doc) : null;
}

async function findUserByEmailWithPassword(email) {
  await ensureReady();
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  if (isMongoConnected()) {
    const doc = await User.findOne({ email: normalized }).select('+passwordHash');
    if (!doc) return null;
    return {
      user: serializeUser(doc),
      passwordHash: doc.passwordHash,
    };
  }

  const doc = Array.from(mem.users.values()).find((u) => u.email === normalized);
  if (!doc) return null;
  return {
    user: serializeUser(doc),
    passwordHash: doc.passwordHash,
  };
}

async function registerOrUpgradeUser({ existingUserId, name, email, passwordHash, phone = '' }) {
  await ensureReady();
  const normalizedEmail = String(email).trim().toLowerCase();

  if (isMongoConnected()) {
    const conflict = await User.findOne({ email: normalizedEmail });
    if (conflict && String(conflict._id) !== String(existingUserId || '')) {
      throw new HttpError(409, 'An account with this email already exists.');
    }

    if (existingUserId && mongoose.Types.ObjectId.isValid(existingUserId)) {
      const existing = await User.findById(existingUserId);
      if (existing && existing.isGuest) {
        existing.name = name;
        existing.email = normalizedEmail;
        existing.passwordHash = passwordHash;
        if (phone) existing.phone = phone;
        existing.isGuest = false;
        existing.expiresAt = undefined;
        await existing.save();
        return serializeUser(existing);
      }
    }

    const created = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      phone,
      isGuest: false,
    });
    return serializeUser(created);
  }

  const conflict = Array.from(mem.users.values()).find(
    (u) => u.email === normalizedEmail && String(u._id) !== String(existingUserId || '')
  );
  if (conflict) {
    throw new HttpError(409, 'An account with this email already exists.');
  }

  if (existingUserId && mem.users.has(String(existingUserId))) {
    const existing = mem.users.get(String(existingUserId));
    if (existing.isGuest) {
      existing.name = name;
      existing.email = normalizedEmail;
      existing.passwordHash = passwordHash;
      if (phone) existing.phone = phone;
      existing.isGuest = false;
      existing.expiresAt = null;
      return serializeUser(existing);
    }
  }

  const _id = newObjectIdString();
  const doc = {
    _id,
    name,
    email: normalizedEmail,
    passwordHash,
    phone,
    isGuest: false,
    expiresAt: null,
    createdAt: new Date(),
  };
  mem.users.set(_id, doc);
  return serializeUser(doc);
}

async function updateUserProfile(userId, { name, email, phone }) {
  await ensureReady();
  const id = String(userId);
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

  if (isMongoConnected()) {
    if (normalizedEmail) {
      const conflict = await User.findOne({ email: normalizedEmail, _id: { $ne: id } });
      if (conflict) {
        throw new HttpError(409, 'That email address is already in use.');
      }
    }
    const user = await User.findById(id);
    if (!user) throw new HttpError(404, 'Account not found.');
    if (name !== undefined) user.name = name;
    if (normalizedEmail !== null) user.email = normalizedEmail;
    if (phone !== undefined) user.phone = phone;
    await user.save();
    return serializeUser(user);
  }

  const user = mem.users.get(id);
  if (!user) throw new HttpError(404, 'Account not found.');
  if (normalizedEmail) {
    const conflict = Array.from(mem.users.values()).find(
      (u) => u.email === normalizedEmail && String(u._id) !== id
    );
    if (conflict) throw new HttpError(409, 'That email address is already in use.');
  }
  if (name !== undefined) user.name = name;
  if (normalizedEmail !== null) user.email = normalizedEmail;
  if (phone !== undefined) user.phone = phone;
  return serializeUser(user);
}

async function createBooking({ user, eventId, tierKey, seats = [], quantity = 1, attendee = {} }) {
  await ensureReady();
  const event = await getEventById(eventId, { includeBookedSeats: true });
  if (!event) {
    throw new HttpError(404, 'Event not found.');
  }

  const category = getCategory(event.category);
  const tier = getTier(event.category, tierKey);
  if (!category || !tier) {
    throw new HttpError(400, 'Invalid ticket tier selected.');
  }

  let normalizedSeats = [];
  let finalQty = 0;

  if (category.seated) {
    if (!Array.isArray(seats) || seats.length === 0) {
      throw new HttpError(400, 'Select at least one seat.');
    }
    normalizedSeats = Array.from(new Set(seats.map((s) => String(s).trim().toUpperCase())));
    if (normalizedSeats.length > category.maxPerBooking) {
      throw new HttpError(400, `A maximum of ${category.maxPerBooking} seats can be booked at once.`);
    }
    finalQty = normalizedSeats.length;
  } else {
    finalQty = Number.parseInt(quantity, 10);
    if (!Number.isFinite(finalQty) || finalQty < 1) {
      throw new HttpError(400, 'Quantity must be at least 1.');
    }
    if (finalQty > category.maxPerBooking) {
      throw new HttpError(400, `A maximum of ${category.maxPerBooking} tickets can be booked at once.`);
    }
  }

  const keysToReserve = normalizedSeats.map((s) => `${tier.key}:${s}`);

  // Atomic inventory reservation
  if (isMongoConnected()) {
    const filter = {
      _id: event.id,
      available: { $gte: finalQty },
    };
    const update = {
      $inc: { available: -finalQty },
    };
    if (keysToReserve.length > 0) {
      filter.bookedSeats = { $nin: keysToReserve };
      update.$push = { bookedSeats: { $each: keysToReserve } };
    }
    const updatedEvent = await Event.findOneAndUpdate(filter, update, { new: true });
    if (!updatedEvent) {
      throw new HttpError(
        409,
        category.seated
          ? 'One or more of the selected seats are no longer available.'
          : 'Not enough tickets remaining for this event.'
      );
    }
  } else {
    const memEvent = mem.events.get(event.id);
    if (!memEvent || memEvent.available < finalQty) {
      throw new HttpError(409, 'Not enough tickets remaining for this event.');
    }
    if (keysToReserve.length > 0) {
      const taken = new Set(memEvent.bookedSeats || []);
      const conflict = keysToReserve.filter((k) => taken.has(k));
      if (conflict.length > 0) {
        const readable = conflict.map((k) => k.split(':')[1]).join(', ');
        throw new HttpError(409, `Seats ${readable} are already booked.`);
      }
      memEvent.bookedSeats = [...taken, ...keysToReserve];
    }
    memEvent.available -= finalQty;
  }

  const unitPrice = priceFor(event.basePrice, event.category, tier.key);
  const total = unitPrice * finalQty;
  const bookingPayload = {
    _id: newObjectIdString(),
    reference: generateReference(),
    user: user.id,
    event: event.id,
    category: event.category,
    tier: tier.key,
    tierLabel: tier.label,
    seats: normalizedSeats,
    quantity: finalQty,
    unitPrice,
    total,
    status: 'confirmed',
    attendee: {
      name: (attendee.name || user.name || 'Guest').trim(),
      email: (attendee.email || user.email || '').trim(),
    },
    snapshot: {
      title: event.title,
      subtitle: event.subtitle,
      image: event.image,
      venue: event.venue,
      city: event.city,
      origin: event.origin,
      destination: event.destination,
      startsAt: event.startsAt,
      durationMinutes: event.durationMinutes,
    },
    createdAt: new Date(),
  };

  if (isMongoConnected()) {
    const doc = await Booking.create(bookingPayload);
    return serializeBooking(doc);
  }

  mem.bookings.set(String(bookingPayload._id), bookingPayload);
  return serializeBooking(bookingPayload);
}

async function listBookingsForUser(userId) {
  await ensureReady();
  const id = String(userId);

  if (isMongoConnected()) {
    if (!mongoose.Types.ObjectId.isValid(id)) return [];
    const docs = await Booking.find({ user: id }).sort({ createdAt: -1 }).lean();
    return docs.map(serializeBooking);
  }

  const items = Array.from(mem.bookings.values())
    .filter((b) => String(b.user) === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items.map(serializeBooking);
}

async function getBookingForUser(bookingId, userId) {
  await ensureReady();
  const bId = String(bookingId);
  const uId = String(userId);

  if (isMongoConnected()) {
    let doc = null;
    if (isObjectIdHex(bId)) {
      doc = await Booking.findOne({ _id: bId, user: uId }).lean();
    }
    if (!doc) {
      doc = await Booking.findOne({ reference: bId.toUpperCase(), user: uId }).lean();
    }
    return doc ? serializeBooking(doc) : null;
  }

  let doc = mem.bookings.get(bId);
  if (!doc) {
    doc = Array.from(mem.bookings.values()).find(
      (b) => b.reference === bId.toUpperCase() && String(b.user) === uId
    );
  }
  if (!doc || String(doc.user) !== uId) return null;
  return serializeBooking(doc);
}

async function cancelBooking({ bookingId, userId, seatsToCancel = [], quantityToCancel }) {
  await ensureReady();
  const existing = await getBookingForUser(bookingId, userId);
  if (!existing) {
    throw new HttpError(404, 'Booking not found.');
  }
  if (existing.status === 'cancelled') {
    throw new HttpError(400, 'This booking has already been cancelled.');
  }

  const isSeated = existing.seats && existing.seats.length > 0;
  let releaseSeats = [];
  let releaseQty = 0;
  let remainingSeats = [...existing.seats];
  let remainingQty = existing.quantity;

  if (isSeated) {
    const requested = Array.isArray(seatsToCancel) && seatsToCancel.length > 0
      ? seatsToCancel.map((s) => String(s).trim().toUpperCase())
      : [...existing.seats];
    releaseSeats = existing.seats.filter((s) => requested.includes(s));
    if (releaseSeats.length === 0) {
      throw new HttpError(400, 'Select at least one valid seat from this booking to cancel.');
    }
    remainingSeats = existing.seats.filter((s) => !releaseSeats.includes(s));
    releaseQty = releaseSeats.length;
    remainingQty = remainingSeats.length;
  } else {
    const reqQty = quantityToCancel !== undefined ? Number.parseInt(quantityToCancel, 10) : existing.quantity;
    if (!Number.isFinite(reqQty) || reqQty < 1 || reqQty > existing.quantity) {
      throw new HttpError(400, `Cancel quantity must be between 1 and ${existing.quantity}.`);
    }
    releaseQty = reqQty;
    remainingQty = existing.quantity - releaseQty;
  }

  const keysToPull = releaseSeats.map((s) => `${existing.tier}:${s}`);

  // Restore event inventory
  if (isMongoConnected()) {
    const update = { $inc: { available: releaseQty } };
    if (keysToPull.length > 0) {
      update.$pull = { bookedSeats: { $in: keysToPull } };
    }
    await Event.findByIdAndUpdate(existing.eventId, update);
  } else {
    const memEvent = mem.events.get(existing.eventId);
    if (memEvent) {
      memEvent.available = Math.min(memEvent.capacity, memEvent.available + releaseQty);
      if (keysToPull.length > 0) {
        const pullSet = new Set(keysToPull);
        memEvent.bookedSeats = (memEvent.bookedSeats || []).filter((k) => !pullSet.has(k));
      }
    }
  }

  const now = new Date();
  const nextStatus = remainingQty === 0 ? 'cancelled' : 'confirmed';
  const nextTotal = remainingQty * existing.unitPrice;

  if (isMongoConnected()) {
    const updated = await Booking.findByIdAndUpdate(
      existing.id,
      {
        $set: {
          seats: remainingSeats,
          quantity: remainingQty,
          total: nextTotal,
          status: nextStatus,
          cancelledAt: nextStatus === 'cancelled' ? now : undefined,
        },
      },
      { new: true }
    ).lean();
    return serializeBooking(updated);
  }

  const memBooking = mem.bookings.get(existing.id);
  memBooking.seats = remainingSeats;
  memBooking.quantity = remainingQty;
  memBooking.total = nextTotal;
  memBooking.status = nextStatus;
  if (nextStatus === 'cancelled') memBooking.cancelledAt = now;
  return serializeBooking(memBooking);
}

async function createMessage({ name, email, message }) {
  await ensureReady();
  const payload = {
    _id: newObjectIdString(),
    name: String(name).trim(),
    email: String(email).trim(),
    message: String(message).trim(),
    createdAt: new Date(),
  };

  if (isMongoConnected()) {
    const doc = await Message.create(payload);
    return { id: String(doc._id), createdAt: doc.createdAt };
  }

  mem.messages.push(payload);
  return { id: payload._id, createdAt: payload.createdAt };
}

async function resetDemoData() {
  await ensureReady({ forceSeed: true });
  return { reset: true, eventsCount: 24, timestamp: new Date().toISOString() };
}

module.exports = {
  ensureReady,
  listEvents,
  getEventById,
  createGuestUser,
  findUserById,
  findUserByEmailWithPassword,
  registerOrUpgradeUser,
  updateUserProfile,
  createBooking,
  listBookingsForUser,
  getBookingForUser,
  cancelBooking,
  createMessage,
  resetDemoData,
};
