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

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Thought Records
router.post("/thought-records", saveThoughtRecord);
router.get("/thought-records", getThoughtRecords);

// CBT Activities
router.post("/activities", saveCBTActivity);
router.get("/activities", getCBTActivities);

// Progress and Analytics
router.get("/progress", getCBTProgress);
router.get("/insights", getCBTInsights);
router.post("/insights/generate", generateAICBTInsights); // AI-powered insights
router.get("/analytics", getCBTAnalytics);

// Mood Entries with CBT
router.post("/mood-entries", saveMoodEntryWithCBT);
router.get("/mood-entries", getMoodEntriesWithCBT);

export default router;

