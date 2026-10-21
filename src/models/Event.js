const mongoose = require('mongoose');
const { CATEGORY_KEYS } = require('../lib/catalog');

const eventSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    category: { type: String, enum: CATEGORY_KEYS, required: true, index: true },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    description: { type: String, required: true },
    image: { type: String, default: '' },
    tags: { type: [String], default: [] },

    // Venue based events (cinema, concert, football)
    venue: { type: String, default: '' },
    city: { type: String, default: '' },

    // Route based events (bus, train, plane)
    origin: { type: String, default: '' },
    destination: { type: String, default: '' },
    operator: { type: String, default: '' },

    startsAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 120 },
    basePrice: { type: Number, required: true, min: 0 },

    capacity: { type: Number, required: true, min: 0 },
    available: { type: Number, required: true, min: 0 },

    // Cinema only. Each entry is "<tier>:<seat>", for example "imax:C7".
    bookedSeats: { type: [String], default: [] },
  },
  { timestamps: true }
);

eventSchema.index({ category: 1, startsAt: 1 });

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);
