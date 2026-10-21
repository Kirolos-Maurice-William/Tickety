const express = require('express');
const validator = require('validator');
const store = require('../lib/store');
const { HttpError, asyncHandler } = require('../lib/http');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!name || !email || !message) {
      throw new HttpError(400, 'Name, email address and message are required.');
    }
    if (!validator.isEmail(email)) {
      throw new HttpError(400, 'Enter a valid email address.');
    }
    if (message.length < 10) {
      throw new HttpError(400, 'Please provide a message of at least 10 characters.');
    }

    const saved = await store.createMessage({ name, email, message });
    res.status(201).json({
      id: saved.id,
      message: 'Your inquiry has been recorded. Our box office desk responds within one business day.',
    });
  })
);

module.exports = router;
