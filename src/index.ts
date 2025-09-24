import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

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
app.use(express.json());
app.use(morgan("dev"));

// Health check routes
app.get("/health", healthCheck);
app.get("/ready", readinessCheck);

// API routes
app.use("/auth", authRoutes);
app.use("/chat", chatRoutes);
app.use("/chat/memory-enhanced", memoryEnhancedChatRoutes);
app.use("/journal", journalRoutes);
app.use("/meditation", meditationRoutes);
app.use("/mood", moodRoutes);
app.use("/activity", activityRoutes);
app.use("/rescue-pairs", rescuePairRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/payments", paymentRoutes);
app.use("/analytics", analyticsRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  });

export default app;
