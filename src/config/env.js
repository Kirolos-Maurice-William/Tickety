require('dotenv').config();

const isVercel = Boolean(process.env.VERCEL);
const isProduction = isVercel || process.env.NODE_ENV === 'production';

module.exports = {
  isProduction,
  isVercel,
  port: Number(process.env.PORT) || 3000,
  mongoUri: (process.env.MONGO_URI || '').trim(),
  mongoDbName: (process.env.MONGO_DB_NAME || 'tickety').trim(),
  jwtSecret: (process.env.JWT_SECRET || 'tickety-default-jwt-secret-change-in-production').trim(),
  cronSecret: (process.env.CRON_SECRET || '').trim(),
  guestSessionHours: Number(process.env.GUEST_SESSION_HOURS) || 24,
};
