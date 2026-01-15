"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const memoryEnhancedChat_1 = require("../controllers/memoryEnhancedChat");
const auth_1 = require("../middleware/auth");
const premiumLimits_1 = require("../middleware/premiumLimits");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = express_1.default.Router();
// All routes require authentication
router.use(auth_1.authenticateToken);
// Memory-enhanced chat route with rate limiting
router.post("/", premiumLimits_1.enforceChatDailyLimit, rateLimiter_1.aiChatRateLimiter.middleware(), memoryEnhancedChat_1.sendMemoryEnhancedMessage);
// Get user's stored memories (LongTermMemory facts)
router.get("/memories", memoryEnhancedChat_1.getUserMemories);
exports.default = router;
