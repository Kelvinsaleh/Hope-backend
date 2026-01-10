import express from "express";
import { auth } from "../middleware/auth";
import {
  getPersonalization,
  updatePersonalization,
  resetPersonalization,
  getExplainability,
  triggerAnalysis,
  getConversationSummaries,
} from "../controllers/personalizationController";

const router = express.Router();

/**
 * Personalization Routes
 * All routes require authentication
 */

// Get personalization data for current user
router.get("/", auth, getPersonalization);

// Update personalization preferences (user overrides)
router.put("/", auth, updatePersonalization);

// Patch for partial updates
router.patch("/", auth, updatePersonalization);

// Reset personalization (remove inferred patterns)
router.post("/reset", auth, resetPersonalization);

// Get explainability info (what's being applied and why)
router.get("/explainability", auth, getExplainability);

// Trigger manual personalization analysis
router.post("/analyze", auth, triggerAnalysis);

// Get conversation summaries
router.get("/summaries", auth, getConversationSummaries);

export default router;

