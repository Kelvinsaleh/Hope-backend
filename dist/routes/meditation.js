"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const meditationController_1 = require("../controllers/meditationController");
const auth_1 = require("../middleware/auth");
const premiumLimits_1 = require("../middleware/premiumLimits");
const adminAuth_1 = require("../middleware/adminAuth");
const multer_1 = __importDefault(require("multer"));
const router = express_1.default.Router();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit for longer meditations
});
// Public routes
router.get("/", meditationController_1.getMeditations);
router.get("/search", meditationController_1.getMeditations); // Add search endpoint
// Protected routes
router.use(auth_1.authenticateToken);
// Specific routes FIRST (before parameterized routes)
router.get("/sessions", meditationController_1.getMeditationSessions); // This must come before /:meditationId
router.get("/history", meditationController_1.getMeditationHistory);
router.get("/analytics", meditationController_1.getMeditationAnalytics);
router.get("/favorites", meditationController_1.getFavoriteMeditations);
// Admin-only routes
router.post("/", adminAuth_1.requireAdmin, meditationController_1.createMeditation);
router.post("/upload", adminAuth_1.requireAdmin, upload.single('file'), meditationController_1.uploadMeditation);
router.put("/:meditationId", adminAuth_1.requireAdmin, meditationController_1.updateMeditation);
router.delete("/:meditationId", adminAuth_1.requireAdmin, meditationController_1.deleteMeditation);
// Parameterized routes LAST
router.get("/:meditationId", meditationController_1.getMeditation);
router.get("/:meditationId/favorite-status", meditationController_1.checkFavoriteStatus);
router.post("/sessions", premiumLimits_1.enforceMeditationWeeklyLimit, meditationController_1.startMeditationSession);
router.put("/sessions/:sessionId", meditationController_1.completeMeditationSession);
router.post("/:meditationId/favorite", meditationController_1.addToFavorites);
router.delete("/:meditationId/favorite", meditationController_1.removeFromFavorites);
exports.default = router;
