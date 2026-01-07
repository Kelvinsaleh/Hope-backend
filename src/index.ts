import express from 'express';
import http from 'http';
import https from 'https';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { logger } from './utils/logger';

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
import { connectDB } from './utils/db';
import { healthCheck, readinessCheck, keepAlive } from './controllers/healthController';
import seedCommunityData from './scripts/seedCommunity';
import { CommunitySpace } from './models/Community';
import { startWeeklyReportScheduler } from './jobs/weeklyReportScheduler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Enable global keep-alive to reduce cold request setup costs
(http.globalAgent as any).keepAlive = true;
(https.globalAgent as any).keepAlive = true;

// CORS configuration
const defaultFrontend = 'https://ai-therapist-agent-theta.vercel.app';
const allowedOrigins = (() => {
  if (process.env.NODE_ENV === 'production') {
    return [
      process.env.FRONTEND_URL || defaultFrontend,
      'https://ai-therapist-agent-theta.vercel.app',
      'https://ai-therapist-agent-2hx8i5cf8-kelvinsalehs-projects.vercel.app',
      'https://hopementalhealthsupport.xyz',
      'http://hopementalhealthsupport.xyz',
      'https://ultra-predict.co.ke',
      'http://ultra-predict.co.ke'
    ].filter((url): url is string => Boolean(url));
  }
  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:8080',  // Flutter web default
    'http://127.0.0.1:8080',  // Flutter web (127.0.0.1 variant)
    process.env.FRONTEND_URL || defaultFrontend,
    'https://ai-therapist-agent-theta.vercel.app',
    'https://ai-therapist-agent-2hx8i5cf8-kelvinsalehs-projects.vercel.app',
      'https://hopementalhealthsupport.xyz',
      'http://hopementalhealthsupport.xyz',
    'https://ultra-predict.co.ke',
    'http://ultra-predict.co.ke'
  ].filter((url): url is string => Boolean(url));
})();

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all localhost origins (flexible for Flutter web random ports)
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return callback(null, true);
      }
    }
    
    // Check if origin is in the allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow all Vercel preview deployments for this project
    if (origin.endsWith('.vercel.app') && origin.includes('ai-therapist-agent')) {
      return callback(null, true);
    }
    
    // Log the blocked origin for debugging
    console.log(`CORS blocked origin: ${origin}`);
    console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
    
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
  exposedHeaders: ["Content-Length", "X-Foo", "X-Bar"],
  maxAge: 86400 // 24 hours
};

// Middleware
app.use(helmet());

// CORS debugging middleware
app.use((req, res, next) => {
  console.log(`CORS Request - Origin: ${req.headers.origin}, Method: ${req.method}, Path: ${req.path}`);
  next();
});

app.use(cors(corsOptions));

// Additional CORS headers for debugging
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, X-Requested-With, Accept, Origin');
  next();
});

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
connectDB()
  .then(async () => {
    // Auto-seed community spaces on startup
    await autoSeedCommunity();
    // Start weekly report scheduler
    try {
      startWeeklyReportScheduler();
      logger.info('Weekly report scheduler started');
    } catch (e) {
      logger.warn('Failed to start weekly report scheduler', e);
    }
    
    app.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(` Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    logger.error("Failed to connect to database:", err);
    logger.warn("Starting server anyway for testing...");
    app.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT} (without database)`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(` Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  });

export default app;
