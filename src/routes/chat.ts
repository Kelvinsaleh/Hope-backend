import express from "express";
import {
  createChatSession,
  getChatSession,
  sendMessage,
  getChatHistory,
  getAllChatSessions,
  completeChatSession,
  deleteChatSession,
} from "../controllers/chat";
import { auth } from "../middleware/auth";
import { enforceChatDailyLimit } from "../middleware/premiumLimits";
import { ChatSession } from "../models/ChatSession";
import { Types } from "mongoose";
import { generateChatTitle } from "../utils/chatTitleGenerator";
import { logger } from "../utils/logger";

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Get all chat sessions for the user
router.get("/sessions", getAllChatSessions);

// Create a new chat session
router.post("/sessions", createChatSession);

// Get a specific chat session
router.get("/sessions/:sessionId", getChatSession);

// Send a message in a chat session (enforce free-tier daily limit)
router.post("/sessions/:sessionId/messages", enforceChatDailyLimit, sendMessage);

// Get chat history for a session
router.get("/sessions/:sessionId/history", getChatHistory);

// Complete a chat session
router.post("/sessions/:sessionId/complete", completeChatSession);

// Delete a chat session
router.delete("/sessions/:sessionId", deleteChatSession);

// Generate title for a specific session (manual trigger)
router.post("/sessions/:sessionId/generate-title", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = new Types.ObjectId((req as any).user._id);

    const session = await ChatSession.findOne({ sessionId, userId });

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

    const title = await generateChatTitle(session.messages.map(m => ({
      role: m.role,
      content: m.content
    })));

    session.title = title;
    await session.save();

    logger.info(`Manually generated title for session ${sessionId}: "${title}"`);

    res.json({
      success: true,
      title,
      message: "Title generated successfully"
    });
  } catch (error) {
    logger.error("Generate title error:", error);
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
    const userId = new Types.ObjectId((req as any).user._id);

    const sessions = await ChatSession.find({
      userId,
      $or: [
        { title: { $exists: false } },
        { title: null },
        { title: "" }
      ],
      messages: { $exists: true }
    }).limit(10); // Process up to 10 sessions

    const sessionsWithEnoughMessages = sessions.filter(s => s.messages && s.messages.length >= 2);

    logger.info(`Bulk generating titles for ${sessionsWithEnoughMessages.length} sessions for user ${userId}`);

    const results = await Promise.allSettled(
      sessionsWithEnoughMessages.map(async (session) => {
        try {
          const title = await generateChatTitle(session.messages.map(m => ({
            role: m.role,
            content: m.content
          })));

          await ChatSession.updateOne(
            { _id: session._id },
            { $set: { title } }
          );

          logger.info(`Generated title for session ${session.sessionId}: "${title}"`);
          return { sessionId: session.sessionId, title, success: true };
        } catch (error) {
          logger.error(`Failed to generate title for session ${session.sessionId}:`, error);
          return { sessionId: session.sessionId, success: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    const failed = results.length - successful;

    res.json({
      success: true,
      message: `Generated titles for ${successful} sessions`,
      processed: results.length,
      successful,
      failed,
      results: results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
    });
  } catch (error) {
    logger.error("Bulk generate titles error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate titles",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;

// let response = pm.response.json()
// pm.globals.set("access_token", response.access_token)
