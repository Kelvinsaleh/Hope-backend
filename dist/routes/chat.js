"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chat_1 = require("../controllers/chat");
const auth_1 = require("../middleware/auth");
const premiumLimits_1 = require("../middleware/premiumLimits");
const ChatSession_1 = require("../models/ChatSession");
const mongoose_1 = require("mongoose");
const chatTitleGenerator_1 = require("../utils/chatTitleGenerator");
const logger_1 = require("../utils/logger");
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
// Complete a chat session
router.post("/sessions/:sessionId/complete", chat_1.completeChatSession);
// Delete a chat session
router.delete("/sessions/:sessionId", chat_1.deleteChatSession);
// Generate title for a specific session (manual trigger)
router.post("/sessions/:sessionId/generate-title", async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const session = await ChatSession_1.ChatSession.findOne({ sessionId, userId });
        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Chat session not found"
            });
        }
        if (session.messages.length < 2) {
            return res.status(400).json({
                success: false,
                message: "Session needs at least 2 messages to generate a title"
            });
        }
        const title = await (0, chatTitleGenerator_1.generateChatTitle)(session.messages.map(m => ({
            role: m.role,
            content: m.content
        })));
        session.title = title;
        await session.save();
        logger_1.logger.info(`Manually generated title for session ${sessionId}: "${title}"`);
        res.json({
            success: true,
            title,
            message: "Title generated successfully"
        });
    }
    catch (error) {
        logger_1.logger.error("Generate title error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate title",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});
// Generate titles for all sessions without them (bulk operation)
router.post("/sessions/bulk/generate-titles", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const sessions = await ChatSession_1.ChatSession.find({
            userId,
            $or: [
                { title: { $exists: false } },
                { title: null },
                { title: "" }
            ],
            messages: { $exists: true }
        }).limit(10); // Process up to 10 sessions
        const sessionsWithEnoughMessages = sessions.filter(s => s.messages && s.messages.length >= 2);
        logger_1.logger.info(`Bulk generating titles for ${sessionsWithEnoughMessages.length} sessions for user ${userId}`);
        const results = await Promise.allSettled(sessionsWithEnoughMessages.map(async (session) => {
            try {
                const title = await (0, chatTitleGenerator_1.generateChatTitle)(session.messages.map(m => ({
                    role: m.role,
                    content: m.content
                })));
                await ChatSession_1.ChatSession.updateOne({ _id: session._id }, { $set: { title } });
                logger_1.logger.info(`Generated title for session ${session.sessionId}: "${title}"`);
                return { sessionId: session.sessionId, title, success: true };
            }
            catch (error) {
                logger_1.logger.error(`Failed to generate title for session ${session.sessionId}:`, error);
                return { sessionId: session.sessionId, success: false, error: error instanceof Error ? error.message : "Unknown error" };
            }
        }));
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failed = results.length - successful;
        res.json({
            success: true,
            message: `Generated titles for ${successful} sessions`,
            processed: results.length,
            successful,
            failed,
            results: results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
        });
    }
    catch (error) {
        logger_1.logger.error("Bulk generate titles error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate titles",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});
exports.default = router;
// let response = pm.response.json()
// pm.globals.set("access_token", response.access_token)
