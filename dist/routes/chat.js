"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chat_1 = require("../controllers/chat");
const auth_1 = require("../middleware/auth");
const premiumLimits_1 = require("../middleware/premiumLimits");
const router = express_1.default.Router();
// Apply auth middleware to all routes
router.use(auth_1.auth);
// Get all chat sessions for the user
router.get("/sessions", chat_1.getAllChatSessions);
// Create a new chat session
router.post("/sessions", chat_1.createChatSession);
// Get a specific chat session
router.get("/sessions/:sessionId", chat_1.getChatSession);
// Send a message in a chat session (enforce free-tier daily limit)
router.post("/sessions/:sessionId/messages", premiumLimits_1.enforceChatDailyLimit, chat_1.sendMessage);
// Get chat history for a session
router.get("/sessions/:sessionId/history", chat_1.getChatHistory);
exports.default = router;
// let response = pm.response.json()
// pm.globals.set("access_token", response.access_token)
