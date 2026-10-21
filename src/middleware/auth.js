const jwt = require('jsonwebtoken');
const env = require('../config/env');
const store = require('../lib/store');
const { HttpError, asyncHandler } = require('../lib/http');

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      name: user.name,
      email: user.email || null,
      phone: user.phone || '',
      isGuest: Boolean(user.isGuest),
    },
    env.jwtSecret,
    { expiresIn: user.isGuest ? `${env.guestSessionHours}h` : '7d' }
  );
}

async function resolveUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    req.user = null;
    return null;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await store.findUserById(payload.sub, payload);
    req.user = user || null;
    return req.user;
  } catch (_err) {
    req.user = null;
    return null;
  }
}

const optionalAuth = asyncHandler(async (req, _res, next) => {
  await resolveUser(req);
  return next();
});

const requireAuth = asyncHandler(async (req, _res, next) => {
  const user = await resolveUser(req);
  if (!user) {
    throw new HttpError(401, 'Session expired or not signed in.');
  }
  return next();
});

module.exports = {
  signToken,
  optionalAuth,
  requireAuth,
};
