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
router.post("/weekly-report", analyticsController_1.generateWeeklyReport);
exports.default = router;
