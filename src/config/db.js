const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URL;
  if (!uri) throw new Error("Missing MONGODB_URI env var");
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 12000),
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 20000),
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 10),
  });
  console.log("MongoDB connected");
}

module.exports = { connectDB };
