import express from "express";
import {
  findMatches,
  acceptRescuePair,
  rejectRescuePair,
  getUserRescuePairs,
  updateRescuePairStatus,
  createRescuePair,
  getRescuePairDetails,
  findMatchesEnhanced,
  acceptMatchEnhanced,
  getActiveMatches
} from "../controllers/rescuePairController";
import { 
  sendMatchMessage, 
  getMatchMessages 
} from "../controllers/matchMessagingController";
import { authenticateToken } from "../middleware/auth";
import { requirePremium } from "../middleware/premiumAccess";

const router = express.Router();

router.use(authenticateToken);

// Enhanced matching routes
router.post("/find-matches", requirePremium('matching'), findMatchesEnhanced);
router.post("/accept", requirePremium('matching'), acceptMatchEnhanced);
router.get("/active", requirePremium('matching'), getActiveMatches);

// Original rescue pair routes
router.get("/matches", findMatches);
router.post("/", createRescuePair);
router.post("/:pairId/accept", acceptRescuePair);
router.post("/:pairId/reject", rejectRescuePair);
router.get("/", getUserRescuePairs);
router.put("/:pairId/status", updateRescuePairStatus);
router.get("/:pairId", getRescuePairDetails);

// Messaging routes
router.get("/:matchId/messages", getMatchMessages);
router.post("/:matchId/messages", sendMatchMessage);

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
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to end match" });
  }
});

export default router;
