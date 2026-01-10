"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const analyticsController_1 = require("../controllers/analyticsController");
const auth_1 = require("../middleware/auth");
const premiumAccess_1 = require("../middleware/premiumAccess");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
router.get("/", analyticsController_1.getUserAnalytics);
router.get("/mood", analyticsController_1.getMoodAnalytics);
router.get("/activity", analyticsController_1.getActivityAnalytics);
router.get("/premium", (0, premiumAccess_1.requirePremium)("advancedAnalytics"), analyticsController_1.getPremiumAnalytics);
router.post("/weekly-report", (0, premiumAccess_1.requirePremium)("weekly report generation"), analyticsController_1.generateWeeklyReport);
router.get("/reports", analyticsController_1.getSavedWeeklyReports);
// Admin/dev-only endpoint - requires matching ADMIN_TRIGGER_KEY as query param or body.adminKey
router.post('/run-weekly-report/:userId', analyticsController_1.triggerWeeklyReportForUser);
exports.default = router;
