"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const journalController_1 = require("../controllers/journalController");
const auth_1 = require("../middleware/auth");
const premiumLimits_1 = require("../middleware/premiumLimits");
const router = express_1.default.Router();
// All routes require authentication
router.use(auth_1.authenticateToken);
// Journal entry routes
router.post("/", premiumLimits_1.enforceJournalWeeklyLimit, journalController_1.createJournalEntry);
router.get("/", journalController_1.getJournalEntries);
router.get("/analytics", journalController_1.getJournalAnalytics);
router.get("/:entryId", journalController_1.getJournalEntry);
router.put("/:entryId", journalController_1.updateJournalEntry);
router.delete("/:entryId", journalController_1.deleteJournalEntry);
exports.default = router;
