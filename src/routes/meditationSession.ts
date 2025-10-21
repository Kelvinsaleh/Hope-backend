import express from "express";
import { auth } from "../middleware/auth";
import {
  createMeditationSession,
  getMeditationSessions,
  getMeditationSessionById,
  getMeditationStats,
} from "../controllers/meditationSessionController";

const router = express.Router();

// All routes are protected with authentication
router.use(auth);

// Create a new meditation session
router.post("/", createMeditationSession);

// Get all meditation sessions for user
router.get("/", getMeditationSessions);

// Get meditation statistics
router.get("/stats", getMeditationStats);

// Get specific meditation session
router.get("/:sessionId", getMeditationSessionById);

export default router;

