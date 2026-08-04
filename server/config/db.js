import mongoose from 'mongoose';

/**
 * Connect to MongoDB using MONGODB_URI. In the test environment the connection
 * is handled by mongodb-memory-server (see tests/setup.js), so this is only
 * used by the running server.
 */
export async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log('MongoDB connected');
  return mongoose.connection;
}
