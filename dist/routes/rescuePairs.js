"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const rescuePairController_1 = require("../controllers/rescuePairController");
const matchMessagingController_1 = require("../controllers/matchMessagingController");
const auth_1 = require("../middleware/auth");
const premiumAccess_1 = require("../middleware/premiumAccess");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
// Enhanced matching routes
router.post("/find-matches", (0, premiumAccess_1.requirePremium)('matching'), rescuePairController_1.findMatchesEnhanced);
router.post("/accept", (0, premiumAccess_1.requirePremium)('matching'), rescuePairController_1.acceptMatchEnhanced);
router.get("/active", (0, premiumAccess_1.requirePremium)('matching'), rescuePairController_1.getActiveMatches);
// Original rescue pair routes
router.get("/matches", rescuePairController_1.findMatches);
router.post("/", rescuePairController_1.createRescuePair);
router.post("/:pairId/accept", rescuePairController_1.acceptRescuePair);
router.post("/:pairId/reject", rescuePairController_1.rejectRescuePair);
router.get("/", rescuePairController_1.getUserRescuePairs);
router.put("/:pairId/status", rescuePairController_1.updateRescuePairStatus);
router.get("/:pairId", rescuePairController_1.getRescuePairDetails);
// Messaging routes
router.get("/:matchId/messages", matchMessagingController_1.getMatchMessages);
router.post("/:matchId/messages", matchMessagingController_1.sendMatchMessage);
// Chat creation route
router.post("/:matchId/chat/create", async (req, res) => {
    try {
        const { matchId } = req.params;
        const { participants } = req.body;
        // In a real implementation, create chat session
        const chatId = `chat_${matchId}_${Date.now()}`;
        res.json({
            success: true,
            chatId,
            participants,
            createdAt: new Date()
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: "Failed to create chat" });
    }
});
// End match route
router.post("/end-match", async (req, res) => {
    try {
        const { user1Id, user2Id, reason, endedBy } = req.body;
        // In real implementation, update RescuePair status
        res.json({
            success: true,
            message: "Match ended successfully"
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: "Failed to end match" });
    }
});
exports.default = router;
