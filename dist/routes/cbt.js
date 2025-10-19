"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cbtController_1 = require("../controllers/cbtController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// All routes require authentication
router.use(auth_1.authenticateToken);
// Thought Records
router.post("/thought-records", cbtController_1.saveThoughtRecord);
router.get("/thought-records", cbtController_1.getThoughtRecords);
// CBT Activities
router.post("/activities", cbtController_1.saveCBTActivity);
router.get("/activities", cbtController_1.getCBTActivities);
// Progress and Analytics
router.get("/progress", cbtController_1.getCBTProgress);
router.get("/insights", cbtController_1.getCBTInsights);
router.post("/insights/generate", cbtController_1.generateAICBTInsights); // AI-powered insights
router.get("/analytics", cbtController_1.getCBTAnalytics);
// Mood Entries with CBT
router.post("/mood-entries", cbtController_1.saveMoodEntryWithCBT);
router.get("/mood-entries", cbtController_1.getMoodEntriesWithCBT);
exports.default = router;
