import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { logger } from './utils/logger';

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
import { connectDB } from './utils/db';
import { healthCheck, readinessCheck } from './controllers/healthController';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// CORS configuration
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://ai-therapist-agent-2hx8i5cf8-kelvinsalehs-projects.vercel.app",
    "https://ultra-predict.co.ke",
    process.env.FRONTEND_URL
  ].filter((url): url is string => Boolean(url)),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// API routes
app.use("/auth", authRoutes);
app.use("/chat", chatRoutes);
app.use("/memory-enhanced-chat", memoryEnhancedChatRoutes);
app.use("/journal", journalRoutes);
app.use("/meditation", meditationRoutes);
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

// Start server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(` Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    logger.error("Failed to connect to database:", err);
    process.exit(1);
  });

export default app;
