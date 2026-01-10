import express from "express";
import {
  saveThoughtRecord,
  getThoughtRecords,
  saveCBTActivity,
  getCBTActivities,
  getCBTProgress,
  getCBTInsights,
  generateAICBTInsights,
  getCBTAnalytics,
  saveMoodEntryWithCBT,
  getMoodEntriesWithCBT,
} from "../controllers/cbtController";
import { authenticateToken } from "../middleware/auth";
import { requirePremium } from "../middleware/premiumAccess";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Thought Records (Premium only)
router.post("/thought-records", requirePremium("CBT thought records"), saveThoughtRecord);
router.get("/thought-records", getThoughtRecords);

// CBT Activities
router.post("/activities", saveCBTActivity);
router.get("/activities", getCBTActivities);

// Progress and Analytics
router.get("/progress", getCBTProgress);
router.get("/insights", getCBTInsights);
router.post("/insights", requirePremium("AI insights"), generateAICBTInsights); // AI-powered insights (accepts both POST /cbt/insights and POST /cbt/insights/generate)
router.post("/insights/generate", requirePremium("AI insights"), generateAICBTInsights); // AI-powered insights (legacy route)
router.get("/analytics", getCBTAnalytics);

// Mood Entries with CBT
router.post("/mood-entries", saveMoodEntryWithCBT);
router.get("/mood-entries", getMoodEntriesWithCBT);

export default router;

