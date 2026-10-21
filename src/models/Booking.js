const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    category: { type: String, required: true },
    tier: { type: String, required: true },
    tierLabel: { type: String, required: true },
    seats: { type: [String], default: [] },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed', index: true },
    attendee: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
    },
    // A copy of the event details at booking time, so tickets stay readable
    // even if the event is later changed or re-scheduled.
    snapshot: {
      title: String,
      subtitle: String,
      image: String,
      venue: String,
      city: String,
      origin: String,
      destination: String,
      startsAt: Date,
      durationMinutes: Number,
    },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
