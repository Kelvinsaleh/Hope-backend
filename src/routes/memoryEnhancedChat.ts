import express from "express";
import { sendMemoryEnhancedMessage, getUserMemories, updateMemory, deleteMemory } from "../controllers/memoryEnhancedChat";
import { authenticateToken } from "../middleware/auth";
import { enforceChatDailyLimit } from "../middleware/premiumLimits";
import { aiChatRateLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Memory-enhanced chat route with rate limiting
router.post("/", enforceChatDailyLimit, aiChatRateLimiter.middleware(), sendMemoryEnhancedMessage);

// Get user's stored memories (LongTermMemory facts)
router.get("/memories", getUserMemories);

// Update a memory
router.put("/memories/:memoryId", updateMemory);

// Delete a memory
router.delete("/memories/:memoryId", deleteMemory);

export default router;
