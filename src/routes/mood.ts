import express from "express";
import { auth } from "../middleware/auth";
import { 
  createMood, 
  getMoodHistory, 
  getMoodStats, 
  getRecentMoods 
} from "../controllers/moodController";

const router = express.Router();

// All routes are protected with authentication
router.use(auth);

// Track a new mood entry
router.post("/", createMood);

// Get mood history
router.get("/history", getMoodHistory);

// Get mood statistics
router.get("/stats", getMoodStats);

// Get recent moods
router.get("/", getRecentMoods);

export default router;
