import express from 'express';
import http from 'http';
import https from 'https';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { securityHeaders, securityLogging } from './middleware/security';

// Version: 1.0.1 - Email verification enabled
// Import routes
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import memoryEnhancedChatRoutes from './routes/memoryEnhancedChat';
import journalRoutes from './routes/journal';
import meditationRoutes from './routes/meditation';
import moodRoutes from './routes/mood';
import activityRoutes from './routes/activity';
import rescuePairRoutes from './routes/rescuePairs';
import subscriptionRoutes from './routes/subscription';
import paymentRoutes from './routes/payments';
import analyticsRoutes from './routes/analytics';
import safetyRoutes from './routes/safety';
import crisisRoutes from './routes/crisis';
import videoCallRoutes from './routes/videoCall';
import realtimeRoutes from './routes/realtime';
import playlistRoutes from './routes/playlist';
import userRoutes from './routes/user';
import cbtRoutes from './routes/cbt';
import cleanupRoutes from './routes/cleanup';
import apiRoutes from './routes/index';
import personalizationRoutes from './routes/personalization';
import { connectDB } from './utils/db';
import { healthCheck, readinessCheck, keepAlive } from './controllers/healthController';
import seedCommunityData from './scripts/seedCommunity';
import { CommunitySpace } from './models/Community';
import { startWeeklyReportScheduler } from './jobs/weeklyReportScheduler';
import { startPersonalizationAnalysisJob } from './jobs/personalizationAnalysisJob';
import { startSubscriptionMaintenanceJob } from './jobs/subscriptionMaintenance';
import { startJournalReminderJob } from './jobs/journalReminderJob';
import { startInterventionReminderJob } from './jobs/interventionReminderJob';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Enable global keep-alive to reduce cold request setup costs
(http.globalAgent as any).keepAlive = true;
(https.globalAgent as any).keepAlive = true;

// CORS configuration - Security: Restricted to specific domains
const defaultFrontend = 'https://hopementalhealthsupport.xyz';
const allowedOrigins = (() => {
  if (process.env.NODE_ENV === 'production') {
    // Production: Only allow specific domains
    const origins = [
      process.env.FRONTEND_URL || defaultFrontend,
      'https://hopementalhealthsupport.xyz',
      'https://www.hopementalhealthsupport.xyz',
      // Allow specific Vercel deployment if needed
      process.env.VERCEL_PRODUCTION_URL,
    ].filter((url): url is string => Boolean(url) && typeof url === 'string' && url.startsWith('https://'));
    
    // Remove duplicates
    return [...new Set(origins)];
  }
  
  // Development: Allow localhost and specified development URLs
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:8080',  // Flutter web default
    'http://127.0.0.1:8080',  // Flutter web (127.0.0.1 variant)
    process.env.FRONTEND_URL,
    // Allow development domains if specified
    process.env.DEV_FRONTEND_URL,
  ].filter((url): url is string => Boolean(url));
})();

const allowLocalhostInProd = process.env.ALLOW_LOCALHOST_ORIGINS === 'true';

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Security: In production, require origin for web requests
    if (process.env.NODE_ENV === 'production') {
      // Allow requests with no origin ONLY for mobile apps (identified by API key or JWT in Authorization header)
      if (!origin) {
        // Mobile apps will authenticate via JWT token, allow them
        return callback(null, true);
      }

      // Allow localhost origins in production when explicitly enabled (dev/testing)
      if (allowLocalhostInProd && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
        return callback(null, true);
      }
      
      // Check if origin is in the allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Log and reject unauthorized origins
      logger.warn(`CORS blocked origin: ${origin}`, {
        allowedOrigins: allowedOrigins.join(', '),
        ip: origin
      });
      
      return callback(new Error('Not allowed by CORS policy'), false);
    }
    
    // Development: More permissive for localhost
    if (!origin) return callback(null, true);
    
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Log the blocked origin in development
    logger.warn(`CORS blocked origin in development: ${origin}`);
    
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "x-api-key",
    "X-Requested-With",
    "Accept",
    "Origin"
  ],
  exposedHeaders: ["Content-Length"],
  maxAge: 86400 // 24 hours
};

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Additional security headers
app.use(securityHeaders);

// Security logging
app.use(securityLogging);

// Security: Apply CORS middleware
app.use(cors(corsOptions));

// Security: Remove overly permissive CORS headers (cors middleware handles this properly)

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Custom morgan format for better logging
const morganFormat = process.env.NODE_ENV === 'production' 
  ? 'combined' 
  : 'dev';

app.use(morgan(morganFormat, {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    }
  }
}));

// Health check routes
app.get("/health", healthCheck);
app.get("/ready", readinessCheck);
app.get("/keepalive", keepAlive);

// API routes
app.use('/', apiRoutes);
app.use("/auth", authRoutes);
app.use("/chat", chatRoutes);
app.use("/memory-enhanced-chat", memoryEnhancedChatRoutes);
app.use("/journal", journalRoutes);
app.use("/meditation", meditationRoutes); // Support /meditation (singular)
app.use("/meditations", meditationRoutes); // Support /meditations (plural)
app.use("/mood", moodRoutes);
app.use("/activity", activityRoutes);
app.use("/rescue-pairs", rescuePairRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/payments", paymentRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/safety", safetyRoutes);
app.use("/crisis", crisisRoutes);
app.use("/video-calls", videoCallRoutes);
app.use("/realtime", realtimeRoutes);
app.use("/playlists", playlistRoutes);
app.use("/user", userRoutes);
app.use("/cbt", cbtRoutes);
app.use("/cleanup", cleanupRoutes);
app.use("/personalization", personalizationRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  res.status(500).json({ 
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// 404 handler
app.use('*', (req: express.Request, res: express.Response) => {
  logger.warn('Route not found:', {
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Auto-seed function
const autoSeedCommunity = async () => {
  try {
    const spaceCount = await CommunitySpace.countDocuments();
    if (spaceCount < 16) {
      logger.info('🌿 Community spaces not found or incomplete. Seeding automatically...');
      await seedCommunityData();
      logger.info('✅ Community spaces automatically seeded successfully!');
    } else {
      logger.info(`✅ Community spaces already exist (${spaceCount} spaces)`);
    }
  } catch (error) {
    logger.error('Error auto-seeding community spaces:', error);
  }
};

// Start server
logger.info("Starting server initialization...");
logger.info(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
logger.info(`MONGODB_URI: ${process.env.MONGODB_URI ? '***set***' : 'NOT SET'}`);

connectDB()
  .then(async () => {
    logger.info("Database connection successful, proceeding with server startup...");
    // Wait for DB to be fully ready before starting server
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      logger.error('Database connection not ready. ReadyState:', mongoose.connection.readyState);
      throw new Error('Database connection failed - readyState is not 1');
    }
    
    // Verify connection with a simple ping
    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection object is undefined');
      }
      await db.admin().ping();
      logger.info('✅ Database connection verified (ping successful)');
    } catch (pingError: any) {
      logger.error('Database ping failed:', pingError);
      throw new Error('Database connection verification failed - ping unsuccessful');
    }
    
    // Auto-seed community spaces on startup
    await autoSeedCommunity();
    // Start weekly report scheduler
    try {
      startWeeklyReportScheduler();
      logger.info('Weekly report scheduler started');
    } catch (e) {
      logger.warn('Failed to start weekly report scheduler', e);
    }
    
    // Start personalization analysis job
    try {
      startPersonalizationAnalysisJob();
      logger.info('Personalization analysis job started');
    } catch (e) {
      logger.warn('Failed to start personalization analysis job', e);
    }

    try {
      startSubscriptionMaintenanceJob();
      logger.info('Subscription maintenance job started');
    } catch (e) {
      logger.warn('Failed to start subscription maintenance job', e);
    }

    // Start journal reminder job (daily reminders for users who haven't journaled in 3+ days)
    try {
      startJournalReminderJob();
      logger.info('Journal reminder job started');
    } catch (e) {
      logger.warn('Failed to start journal reminder job', e);
    }

    // Start intervention reminder job
    try {
      startInterventionReminderJob();
      logger.info('Intervention reminder job started');
    } catch (e) {
      logger.warn('Failed to start intervention reminder job', e);
    }
    
    app.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(` Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    logger.error("Failed to connect to database:", err);
    logger.error("Error stack:", err.stack);
    logger.error("Database connection is required. Server will not start.");
    logger.error(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    
    // Always exit if database connection fails - don't start server without DB
    logger.error("Exiting due to database connection failure");
    logger.error("Please check:");
    logger.error("1. MONGODB_URI environment variable is set correctly");
    logger.error("2. MongoDB server is accessible from this network");
    logger.error("3. MongoDB credentials are correct");
    logger.error("4. Network/firewall allows connection to MongoDB");
    process.exit(1);
  });

export default app;
