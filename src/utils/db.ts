import mongoose from "mongoose";
import { logger } from "./logger";

// Disable Mongoose buffering globally to fail fast if not connected
// This prevents operations from being queued indefinitely when DB is disconnected
mongoose.set('bufferCommands', false);

const resolveMongoUri = (): string => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    logger.error("MongoDB connection error: MONGODB_URI is not set");
    // In production we should fail fast; for local dev we log clearly.
    throw new Error("MONGODB_URI (or MONGO_URI) environment variable is not set");
  }
  return uri;
};

export const connectDB = async () => {
  const mongoUri = resolveMongoUri();

  try {
    // Check if already connected
    if (mongoose.connection.readyState === 1) {
      logger.info("MongoDB already connected");
      // Verify connection is still alive with a ping
      try {
        const db = mongoose.connection.db;
        if (db) {
          await db.admin().ping();
          logger.info("✅ MongoDB connection verified (ping successful)");
          return;
        }
      } catch (pingError) {
        logger.warn("Existing connection ping failed, reconnecting...");
        // Connection is stale, disconnect and reconnect
        await mongoose.disconnect();
      }
    }

    // Configure connection options
    const options: mongoose.ConnectOptions = {
      serverSelectionTimeoutMS: 30000, // 30 seconds - reasonable timeout
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 30000, // Connection timeout - 30 seconds
      maxPoolSize: 10, // Maximum number of connections in the pool
      minPoolSize: 1, // Minimum number of connections in the pool
      retryWrites: true, // Enable retry writes for replica sets
      retryReads: true, // Enable retry reads for replica sets
      heartbeatFrequencyMS: 10000, // Send heartbeat every 10 seconds to keep connection alive
    };

    logger.info("Attempting to connect to MongoDB...");
    const maskedUri = mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    logger.info(`MongoDB URI: ${maskedUri}`);
    logger.info(`Connection options: serverSelectionTimeoutMS=${options.serverSelectionTimeoutMS}ms, connectTimeoutMS=${options.connectTimeoutMS}ms`);
    
    // Set up connection event listener BEFORE calling connect
    let connectionResolved = false;
    
    const connectionPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!connectionResolved) {
          connectionResolved = true;
          reject(new Error(`MongoDB connection timeout after ${options.serverSelectionTimeoutMS! + 5000}ms. ReadyState: ${mongoose.connection.readyState}`));
        }
      }, options.serverSelectionTimeoutMS! + 5000); // Add 5s buffer
      
      const onConnected = () => {
        if (!connectionResolved) {
          connectionResolved = true;
          clearTimeout(timeout);
          mongoose.connection.removeListener('connected', onConnected);
          mongoose.connection.removeListener('error', onError);
          logger.info('MongoDB "connected" event fired');
          resolve();
        }
      };
      
      const onError = (err: any) => {
        if (!connectionResolved) {
          connectionResolved = true;
          clearTimeout(timeout);
          mongoose.connection.removeListener('connected', onConnected);
          mongoose.connection.removeListener('error', onError);
          logger.error('MongoDB "error" event fired:', err);
          reject(err);
        }
      };
      
      // Set up listeners before connecting
      mongoose.connection.once('connected', onConnected);
      mongoose.connection.once('error', onError);
    });
    
    // Start the connection attempt
    logger.info('Calling mongoose.connect()...');
    const connectStartTime = Date.now();
    
    try {
      // Call connect - this returns a promise that resolves when connection is ready
      await mongoose.connect(mongoUri, options);
      const connectDuration = Date.now() - connectStartTime;
      logger.info(`mongoose.connect() resolved after ${connectDuration}ms`);
    } catch (connectErr: any) {
      logger.error('mongoose.connect() threw error:', connectErr);
      throw connectErr;
    }
    
    // Wait for the connection event (in case connect() resolved before event fired)
    try {
      await Promise.race([
        connectionPromise,
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Connection event timeout')), 2000);
        })
      ]);
    } catch (eventErr) {
      // If connection event doesn't fire but readyState is 1, that's okay
      if (mongoose.connection.readyState === 1) {
        logger.warn('Connection event did not fire, but readyState is 1. Continuing...');
      } else {
        logger.error('Connection event error:', eventErr);
        throw eventErr;
      }
    }
    
    // Verify connection state
    if (mongoose.connection.readyState !== 1) {
      throw new Error(`MongoDB connection failed - readyState is ${mongoose.connection.readyState} (expected 1)`);
    }
    
    logger.info(`MongoDB connection established. ReadyState: ${mongoose.connection.readyState}`);
    
    // Verify connection with a ping
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection object is undefined");
    }
    
    await db.admin().ping();
    logger.info("✅ Connected to MongoDB successfully (ping verified)");
    
    // Log connection details
    const dbName = db.databaseName;
    const host = mongoose.connection.host;
    logger.info(`Database: ${dbName}, Host: ${host}`);
  } catch (error: any) {
    logger.error("MongoDB connection error:", error);
    logger.error("Error details:", {
      message: error.message,
      name: error.name,
      code: error.code,
      readyState: mongoose.connection.readyState,
    });
    
    // Log connection string info (masked) for debugging
    if (mongoUri) {
      try {
        const uriParts = mongoUri.split('@');
        if (uriParts.length > 1) {
          const hostPart = uriParts[1].split('/')[0];
          logger.error(`Connection target: ${hostPart}`);
        }
      } catch (uriError) {
        // Ignore URI parsing errors
      }
    }
    
    // Always throw - don't start server without DB
    throw error;
  }
};

// Track connection state
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Handle connection events
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to MongoDB');
  reconnectAttempts = 0; // Reset reconnect attempts on successful connection
  isReconnecting = false;
});

mongoose.connection.on('error', (err) => {
  logger.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', async () => {
  logger.warn('Mongoose disconnected from MongoDB');
  
  // Attempt to reconnect if not already reconnecting and we have a URI
  if (!isReconnecting && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    isReconnecting = true;
    reconnectAttempts++;
    
    logger.info(`Attempting to reconnect to MongoDB (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    try {
      // Wait a bit before reconnecting (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      await connectDB();
      logger.info('✅ Successfully reconnected to MongoDB');
    } catch (reconnectError) {
      logger.error(`Reconnection attempt ${reconnectAttempts} failed:`, reconnectError);
      isReconnecting = false;
      
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        logger.error('Max reconnection attempts reached. Manual intervention may be required.');
      }
    }
  } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error('Max reconnection attempts reached. Database connection lost.');
  }
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
  
  // If already connected, verify with ping
  if (mongoose.connection.readyState === 1) {
    try {
      const db = mongoose.connection.db;
      if (db) {
        await db.admin().ping();
        return true;
      }
    } catch (pingError) {
      logger.warn("Connection ping failed, connection may be stale");
      // Continue to wait/retry logic below
    }
  }
  
  // Wait for connection to be established
  while (mongoose.connection.readyState !== 1) {
    if (Date.now() - startTime > maxWaitTime) {
      logger.error(`Database connection timeout after ${maxWaitTime}ms. ReadyState: ${mongoose.connection.readyState}`);
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before checking again
  }
  
  // Verify connection with ping before returning
  try {
    const db = mongoose.connection.db;
    if (db) {
      await db.admin().ping();
      return true;
    }
  } catch (pingError) {
    logger.error("Connection ping failed after readyState check:", pingError);
    return false;
  }
  
  return false;
};
