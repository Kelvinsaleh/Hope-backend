import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

export const connectDB = async () => {
  if (!MONGODB_URI) {
    console.error("MongoDB connection error: MONGODB_URI is not set");
    // In production we should fail fast; for local dev we log clearly.
    return;
  }
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });
    console.info("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    console.warn("Continuing without database connection for testing...");
    // Don't exit process for now, allow server to start
  }
};
