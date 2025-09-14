import express from "express";
import { sendMemoryEnhancedMessage } from "../controllers/memoryEnhancedChat";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Memory-enhanced chat route
router.post("/", sendMemoryEnhancedMessage);

export default router;
