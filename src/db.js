import mongoose from 'mongoose';

export async function connectDb(uri, dbName) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000 });
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
