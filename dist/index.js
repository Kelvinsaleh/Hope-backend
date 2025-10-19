"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./utils/logger");
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const chat_1 = __importDefault(require("./routes/chat"));
const memoryEnhancedChat_1 = __importDefault(require("./routes/memoryEnhancedChat"));
const journal_1 = __importDefault(require("./routes/journal"));
const meditation_1 = __importDefault(require("./routes/meditation"));
const mood_1 = __importDefault(require("./routes/mood"));
const activity_1 = __importDefault(require("./routes/activity"));
const rescuePairs_1 = __importDefault(require("./routes/rescuePairs"));
const subscription_1 = __importDefault(require("./routes/subscription"));
const payments_1 = __importDefault(require("./routes/payments"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const safety_1 = __importDefault(require("./routes/safety"));
const crisis_1 = __importDefault(require("./routes/crisis"));
const videoCall_1 = __importDefault(require("./routes/videoCall"));
const realtime_1 = __importDefault(require("./routes/realtime"));
const playlist_1 = __importDefault(require("./routes/playlist"));
const user_1 = __importDefault(require("./routes/user"));
const cbt_1 = __importDefault(require("./routes/cbt"));
const db_1 = require("./utils/db");
const healthController_1 = require("./controllers/healthController");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8000;
// Enable global keep-alive to reduce cold request setup costs
http_1.default.globalAgent.keepAlive = true;
https_1.default.globalAgent.keepAlive = true;
// CORS configuration
const defaultFrontend = 'https://ai-therapist-agent-theta.vercel.app';
const allowedOrigins = (() => {
    if (process.env.NODE_ENV === 'production') {
        return [process.env.FRONTEND_URL || defaultFrontend].filter((url) => Boolean(url));
    }
    return [
        'http://localhost:3000',
        'http://localhost:3001',
        process.env.FRONTEND_URL || defaultFrontend,
    ].filter((url) => Boolean(url));
})();
const corsOptions = {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
};
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Custom morgan format for better logging
const morganFormat = process.env.NODE_ENV === 'production'
    ? 'combined'
    : 'dev';
app.use((0, morgan_1.default)(morganFormat, {
    stream: {
        write: (message) => {
            logger_1.logger.info(message.trim());
        }
    }
}));
// Health check routes
app.get("/health", healthController_1.healthCheck);
app.get("/ready", healthController_1.readinessCheck);
app.get("/keepalive", healthController_1.keepAlive);
// API routes
app.use("/auth", auth_1.default);
app.use("/chat", chat_1.default);
app.use("/memory-enhanced-chat", memoryEnhancedChat_1.default);
app.use("/journal", journal_1.default);
app.use("/meditation", meditation_1.default);
app.use("/mood", mood_1.default);
app.use("/activity", activity_1.default);
app.use("/rescue-pairs", rescuePairs_1.default);
app.use("/subscription", subscription_1.default);
app.use("/payments", payments_1.default);
app.use("/analytics", analytics_1.default);
app.use("/safety", safety_1.default);
app.use("/crisis", crisis_1.default);
app.use("/video-calls", videoCall_1.default);
app.use("/realtime", realtime_1.default);
app.use("/playlists", playlist_1.default);
app.use("/user", user_1.default);
app.use("/cbt", cbt_1.default);
// Error handling middleware
app.use((err, req, res, next) => {
    logger_1.logger.error('Unhandled error:', {
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
app.use('*', (req, res) => {
    logger_1.logger.warn('Route not found:', {
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
    logger_1.logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});
// Start server
(0, db_1.connectDB)()
    .then(() => {
    app.listen(PORT, () => {
        logger_1.logger.info(`🚀 Server is running on port ${PORT}`);
        logger_1.logger.info(`📊 Health check: http://localhost:${PORT}/health`);
        logger_1.logger.info(` Environment: ${process.env.NODE_ENV || 'development'}`);
    });
})
    .catch((err) => {
    logger_1.logger.error("Failed to connect to database:", err);
    logger_1.logger.warn("Starting server anyway for testing...");
    app.listen(PORT, () => {
        logger_1.logger.info(`🚀 Server is running on port ${PORT} (without database)`);
        logger_1.logger.info(`📊 Health check: http://localhost:${PORT}/health`);
        logger_1.logger.info(` Environment: ${process.env.NODE_ENV || 'development'}`);
    });
});
exports.default = app;
