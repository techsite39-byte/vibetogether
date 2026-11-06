import mongoose from 'mongoose'

export async function connectDatabase(uri, databaseName) {
  await mongoose.connect(uri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000,
  })
}
