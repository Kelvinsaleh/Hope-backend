"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const personalizationController_1 = require("../controllers/personalizationController");
const router = express_1.default.Router();
/**
 * Personalization Routes
 * All routes require authentication
 */
// Get personalization data for current user
router.get("/", auth_1.auth, personalizationController_1.getPersonalization);
// Update personalization preferences (user overrides)
router.put("/", auth_1.auth, personalizationController_1.updatePersonalization);
// Patch for partial updates
router.patch("/", auth_1.auth, personalizationController_1.updatePersonalization);
// Reset personalization (remove inferred patterns)
router.post("/reset", auth_1.auth, personalizationController_1.resetPersonalization);
// Get explainability info (what's being applied and why)
router.get("/explainability", auth_1.auth, personalizationController_1.getExplainability);
// Trigger manual personalization analysis
router.post("/analyze", auth_1.auth, personalizationController_1.triggerAnalysis);
// Get conversation summaries
router.get("/summaries", auth_1.auth, personalizationController_1.getConversationSummaries);
exports.default = router;
