"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
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
const analytics_1 = __importDefault(require("./routes/analytics"));
const db_1 = require("./utils/db");
const healthController_1 = require("./controllers/healthController");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8000;
// CORS configuration
const corsOptions = {
    origin: [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://ai-therapist-agent-2hx8i5cf8-kelvinsalehs-projects.vercel.app",
        "https://ultra-predict.co.ke",
        process.env.FRONTEND_URL
    ].filter((url) => Boolean(url)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use((0, morgan_1.default)("dev"));
// Health check routes
app.get("/health", healthController_1.healthCheck);
app.get("/ready", healthController_1.readinessCheck);
// API routes
app.use("/auth", auth_1.default);
app.use("/chat", chat_1.default);
app.use("/chat/memory-enhanced", memoryEnhancedChat_1.default);
app.use("/journal", journal_1.default);
app.use("/meditation", meditation_1.default);
app.use("/mood", mood_1.default);
app.use("/activity", activity_1.default);
app.use("/rescue-pairs", rescuePairs_1.default);
app.use("/subscription", subscription_1.default);
app.use("/analytics", analytics_1.default);
// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});
// Start server
(0, db_1.connectDB)()
    .then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/health`);
    });
})
    .catch((err) => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
});
exports.default = app;
