const express = require('express');
const env = require('../config/env');
const store = require('../lib/store');
const { signToken } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../lib/http');

const router = express.Router();

const handleReset = asyncHandler(async (req, res) => {
  // When CRON_SECRET is configured and request comes from an automated job, verify it.
  // Interactive demo resets from the web client pass `{ interactive: true }`.
  const isInteractive = Boolean(req.body?.interactive);
  if (env.cronSecret && !isInteractive) {
    const header = req.headers.authorization || '';
    if (header !== `Bearer ${env.cronSecret}`) {
      throw new HttpError(401, 'Unauthorized cron invocation.');
    }
  }

  const info = await store.resetDemoData();
  const user = await store.createGuestUser();
  const token = signToken(user);

  res.json({
    ...info,
    token,
    user,
  });
});

router.post('/reset', handleReset);
router.get('/reset', handleReset);

module.exports = router;
