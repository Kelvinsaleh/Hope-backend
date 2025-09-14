import express from "express";
import {
  getMeditations,
  getMeditation,
  createMeditation,
  startMeditationSession,
  completeMeditationSession,
  getMeditationHistory,
  getMeditationAnalytics,
} from "../controllers/meditationController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// Public routes (no authentication required)
router.get("/", getMeditations);
router.get("/:meditationId", getMeditation);

// Protected routes (authentication required)
router.use(authenticateToken);

router.post("/", createMeditation);
router.post("/sessions", startMeditationSession);
router.put("/sessions/:sessionId/complete", completeMeditationSession);
router.get("/history", getMeditationHistory);
router.get("/analytics", getMeditationAnalytics);

export default router;
import express from "express";
import {
  getMeditations,
  getMeditation,
  createMeditation,
  startMeditationSession,
  completeMeditationSession,
  getMeditationHistory,
  getMeditationAnalytics,
} from "../controllers/meditationController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// Public routes (no authentication required)
router.get("/", getMeditations);
router.get("/:meditationId", getMeditation);

// Protected routes (authentication required)
router.use(authenticateToken);

router.post("/", createMeditation);
router.post("/sessions", startMeditationSession);
router.put("/sessions/:sessionId/complete", completeMeditationSession);
router.get("/history", getMeditationHistory);
router.get("/analytics", getMeditationAnalytics);

export default router;
