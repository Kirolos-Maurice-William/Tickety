const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { isMongoConnected } = require('./config/db');
const store = require('./lib/store');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const bookingRoutes = require('./routes/bookings');
const contactRoutes = require('./routes/contact');
const demoRoutes = require('./routes/demo');

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(express.json({ limit: '64kb' }));

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' },
});

const apiRouter = express.Router();

apiRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

apiRouter.get('/health', async (_req, res, next) => {
  try {
    await store.ensureReady();
    res.json({
      status: 'ok',
      storage: isMongoConnected() ? 'mongodb' : 'memory',
    });
  } catch (err) {
    next(err);
  }
});

apiRouter.use('/auth', writeLimiter, authRoutes);
apiRouter.use('/events', eventRoutes);
apiRouter.use('/bookings', writeLimiter, bookingRoutes);
apiRouter.use('/contact', writeLimiter, contactRoutes);
apiRouter.use('/demo', writeLimiter, demoRoutes);

app.use('/api', apiRouter);
app.use(apiRouter);

const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir, { extensions: ['html'] }));

const sendPage = (file) => (_req, res) => {
  res.sendFile(path.join(publicDir, file));
};

app.get('/', sendPage('index.html'));
app.get(['/browse', '/cinema', '/concert', '/football', '/bus', '/train', '/plane'], sendPage('browse.html'));
app.get(['/event', '/ticket_detail'], sendPage('event.html'));
app.get(['/tickets', '/PurchasedTickets'], sendPage('tickets.html'));
app.get(['/account', '/login', '/register', '/profile'], sendPage('account.html'));
app.get(['/contact', '/contactUs'], sendPage('contact.html'));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = status < 500 ? err.message : 'An unexpected server error occurred.';
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: message });
});

if (require.main === module) {
  store
    .ensureReady()
    .then(() => {
      app.listen(env.port, () => {
        console.log(`Tickety listening on http://localhost:${env.port}`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize server:', err);
      process.exit(1);
    });
}

module.exports = app;
