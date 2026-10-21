const mongoose = require('mongoose');
const env = require('./env');

const state = global.__ticketyDbState || {
  mode: 'uninitialized', // 'mongo' | 'memory'
  promise: null,
  seeded: false,
};
global.__ticketyDbState = state;

async function connectDB() {
  if (state.mode === 'mongo' && mongoose.connection.readyState === 1) {
    return state.mode;
  }
  if (state.mode === 'memory') {
    return state.mode;
  }
  if (state.promise) {
    return state.promise;
  }

  state.promise = (async () => {
    if (!env.mongoUri) {
      state.mode = 'memory';
      return state.mode;
    }

    try {
      await mongoose.connect(env.mongoUri, {
        dbName: env.mongoDbName,
        serverSelectionTimeoutMS: 3500,
      });
      state.mode = 'mongo';
      return state.mode;
    } catch (err) {
      console.warn(`MongoDB unavailable (${err.message}); falling back to in-memory store.`);
      state.mode = 'memory';
      return state.mode;
    } finally {
      state.promise = null;
    }
  })();

  return state.promise;
}

function isMongoConnected() {
  return state.mode === 'mongo' && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  isMongoConnected,
  state,
};
