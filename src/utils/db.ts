import mongoose from "mongoose";
import { logger } from "./logger";

const MONGODB_URI = process.env.MONGODB_URI;

export const connectDB = async () => {
  if (!MONGODB_URI) {
    logger.error("MongoDB connection error: MONGODB_URI is not set");
    // In production we should fail fast; for local dev we log clearly.
    throw new Error("MONGODB_URI environment variable is not set");
  }
  
  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      logger.info("MongoDB already connected");
      return;
    }

    // Configure connection options
    const options: mongoose.ConnectOptions = {
      serverSelectionTimeoutMS: 60000, // Increase to 60 seconds - give more time for connection
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 60000, // Connection timeout - 60 seconds
      maxPoolSize: 10, // Maximum number of connections in the pool
      minPoolSize: 1, // Minimum number of connections in the pool (reduced for faster startup)
      bufferMaxEntries: 0, // Disable mongoose buffering; throw error immediately if not connected
      bufferCommands: false, // Disable mongoose buffering
      retryWrites: true, // Enable retry writes for replica sets
      retryReads: true, // Enable retry reads for replica sets
      // Add heartbeat to keep connection alive
      heartbeatFrequencyMS: 10000, // Send heartbeat every 10 seconds
      // Disable strict mode for connection
      strictQuery: false,
    };

    logger.info("Attempting to connect to MongoDB...");
    logger.info(`MongoDB URI: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`); // Log URI without credentials
    
    // Connect with timeout
    await mongoose.connect(MONGODB_URI, options);
    
    // Wait for connection to be fully established
    await new Promise<void>((resolve, reject) => {
      if (mongoose.connection.readyState === 1) {
        resolve();
        return;
      }
      
      const timeout = setTimeout(() => {
        reject(new Error('MongoDB connection timeout after connect call'));
      }, 5000);
      
      mongoose.connection.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      mongoose.connection.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    
    // Verify connection with a ping
    try {
      await mongoose.connection.db.admin().ping();
      logger.info("✅ Connected to MongoDB successfully (ping verified)");
      
      // Log connection details
      const dbName = mongoose.connection.db?.databaseName;
      const host = mongoose.connection.host;
      logger.info(`Database: ${dbName}, Host: ${host}`);
    } catch (pingError: any) {
      logger.error("MongoDB ping failed:", pingError);
      throw new Error("MongoDB connection verification failed - ping unsuccessful");
    }
  } catch (error: any) {
    logger.error("MongoDB connection error:", error);
    logger.error("Error details:", {
      message: error.message,
      name: error.name,
      code: error.code,
    });
    
    // In production, fail fast if DB is required
    if (process.env.NODE_ENV === 'production') {
      logger.error("Production environment requires MongoDB connection. Exiting...");
      process.exit(1);
    } else {
      logger.warn("Continuing without database connection for development/testing...");
      // Don't exit process for development
    }
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  logger.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected from MongoDB');
});

// Handle process termination
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed through app termination');
  process.exit(0);
});

// Helper function to check if DB is connected
export const isDBConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

// Helper function to wait for DB connection
export const waitForDBConnection = async (maxWaitTime: number = 30000): Promise<boolean> => {
  const startTime = Date.now();
  
  while (mongoose.connection.readyState !== 1) {
    if (Date.now() - startTime > maxWaitTime) {
      logger.error("Database connection timeout");
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before checking again
  }
  
  return true;
};
