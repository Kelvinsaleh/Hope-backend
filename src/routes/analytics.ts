import express from "express";
import { getUserAnalytics, getMoodAnalytics, getActivityAnalytics, getPremiumAnalytics, generateWeeklyReport, getSavedWeeklyReports, triggerWeeklyReportForUser } from "../controllers/analyticsController";
import { authenticateToken } from "../middleware/auth";
import { requirePremium } from "../middleware/premiumAccess";

const router = express.Router();

router.use(authenticateToken);

router.get("/", getUserAnalytics);
router.get("/mood", getMoodAnalytics);
router.get("/activity", getActivityAnalytics);
router.get("/premium", requirePremium("advancedAnalytics"), getPremiumAnalytics);
router.post("/weekly-report", generateWeeklyReport);
router.get("/reports", getSavedWeeklyReports);
// Admin/dev-only endpoint - requires matching ADMIN_TRIGGER_KEY as query param or body.adminKey
router.post('/run-weekly-report/:userId', triggerWeeklyReportForUser);

export default router;
