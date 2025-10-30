import express from "express";
import {
  getMeditations,
  getMeditation,
  createMeditation,
  uploadMeditation,
  updateMeditation,
  deleteMeditation,
  startMeditationSession,
  completeMeditationSession,
  getMeditationHistory,
  getMeditationAnalytics,
  getMeditationSessions,
  addToFavorites,
  removeFromFavorites,
  getFavoriteMeditations,
  checkFavoriteStatus
} from "../controllers/meditationController";
import { authenticateToken } from "../middleware/auth";
import { enforceMeditationWeeklyLimit } from "../middleware/premiumLimits";
import { requirePremium } from "../middleware/premiumAccess";
import { requireAdmin } from "../middleware/adminAuth";
import multer from "multer";

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit for longer meditations
});

// Public routes
router.get("/", getMeditations);
router.get("/search", getMeditations); // Add search endpoint

// Protected routes
router.use(authenticateToken);

// Specific routes FIRST (before parameterized routes)
router.get("/sessions", getMeditationSessions); // This must come before /:meditationId
router.get("/history", getMeditationHistory);
router.get("/analytics", getMeditationAnalytics);
router.get("/favorites", getFavoriteMeditations);

// Admin-only routes
router.post("/", requireAdmin, createMeditation);
router.post("/upload", requireAdmin, upload.single('file'), uploadMeditation);
router.put("/:meditationId", requireAdmin, updateMeditation);
router.delete("/:meditationId", requireAdmin, deleteMeditation);

// Parameterized routes LAST
router.get("/:meditationId", getMeditation);
router.get("/:meditationId/favorite-status", checkFavoriteStatus);
router.post("/sessions", enforceMeditationWeeklyLimit, startMeditationSession);
router.put("/sessions/:sessionId", completeMeditationSession);
router.post("/:meditationId/favorite", addToFavorites);
router.delete("/:meditationId/favorite", removeFromFavorites);

export default router;
