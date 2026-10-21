const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const store = require('../lib/store');
const { HttpError, asyncHandler } = require('../lib/http');
const { signToken, optionalAuth, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/guest',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (req.user && req.body?.fresh !== true) {
      return res.json({
        token: signToken(req.user),
        user: req.user,
      });
    }
    const user = await store.createGuestUser();
    const token = signToken(user);
    return res.status(201).json({ token, user });
  })
);

router.post(
  '/register',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const phone = String(req.body?.phone || '').trim();

    if (!name || !email || !password) {
      throw new HttpError(400, 'Name, email address and password are required.');
    }
    if (!validator.isEmail(email)) {
      throw new HttpError(400, 'Enter a valid email address.');
    }
    if (password.length < 6) {
      throw new HttpError(400, 'Password must be at least 6 characters long.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await store.registerOrUpgradeUser({
      existingUserId: req.user?.isGuest ? req.user.id : null,
      name,
      email,
      passwordHash,
      phone,
    });

    const token = signToken(user);
    res.status(201).json({ token, user });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      throw new HttpError(400, 'Email address and password are required.');
    }

    const found = await store.findUserByEmailWithPassword(email);
    if (!found || !found.passwordHash) {
      throw new HttpError(401, 'Invalid email address or password.');
    }

    const valid = await bcrypt.compare(password, found.passwordHash);
    if (!valid) {
      throw new HttpError(401, 'Invalid email address or password.');
    }

    const token = signToken(found.user);
    res.json({ token, user: found.user });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
    const email = req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined;
    const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : undefined;

    if (name !== undefined && !name) {
      throw new HttpError(400, 'Name cannot be empty.');
    }
    if (email && !validator.isEmail(email)) {
      throw new HttpError(400, 'Enter a valid email address.');
    }

    const updated = await store.updateUserProfile(req.user.id, {
      name,
      email: email || undefined,
      phone,
    });
    const token = signToken(updated);
    res.json({ token, user: updated });
  })
);

module.exports = router;
