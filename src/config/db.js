const mongoose = require('mongoose');
const { readNumber } = require('./env');

let listenersAttached = false;

function attachConnectionListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err?.message || err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });
}

async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
  if (!uri) throw new Error('Missing MONGODB_URI env var');

  mongoose.set('strictQuery', true);
  attachConnectionListeners();

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: readNumber('MONGO_SERVER_SELECTION_TIMEOUT_MS', 12000),
    socketTimeoutMS: readNumber('MONGO_SOCKET_TIMEOUT_MS', 20000),
    maxPoolSize: readNumber('MONGO_MAX_POOL_SIZE', 10),
    autoIndex: String(process.env.MONGO_AUTO_INDEX || '').toLowerCase() === 'true',
  });

  return mongoose.connection;
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = { connectDB, disconnectDB };
