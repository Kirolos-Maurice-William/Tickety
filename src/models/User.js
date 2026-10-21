const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 80, default: 'Guest' },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    passwordHash: { type: String, select: false },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    isGuest: { type: Boolean, default: false, index: true },
    // Guest accounts are removed automatically by MongoDB once this date passes.
    expiresAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email || null,
    phone: this.phone || '',
    isGuest: this.isGuest,
    expiresAt: this.expiresAt || null,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
