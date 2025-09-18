import express from "express";
import { getUserAnalytics, getMoodAnalytics, getActivityAnalytics, getPremiumAnalytics } from "../controllers/analyticsController";
import { authenticateToken } from "../middleware/auth";
import { requirePremium } from "../middleware/premiumAccess";

const router = express.Router();

router.use(authenticateToken);

router.get("/", getUserAnalytics);
router.get("/mood", getMoodAnalytics);
router.get("/activity", getActivityAnalytics);
router.get("/premium", requirePremium("advancedAnalytics"), getPremiumAnalytics);

export default router;
