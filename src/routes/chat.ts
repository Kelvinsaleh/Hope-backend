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

export default router;

// let response = pm.response.json()
// pm.globals.set("access_token", response.access_token)
