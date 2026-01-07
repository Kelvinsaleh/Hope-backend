import express from "express";
import {
  createVideoCall,
  getVideoCallStatus,
  joinVideoCall,
  endVideoCall
} from "../controllers/videoCallController";
import { authenticateToken } from "../middleware/auth";
import { requirePremium } from "../middleware/premiumAccess";

const router = express.Router();

router.use(authenticateToken);

// Video call routes (premium only)
router.post("/create", requirePremium('video_call'), createVideoCall);
router.get("/:callId", getVideoCallStatus);
router.post("/:callId/join", requirePremium('video_call'), joinVideoCall);
router.post("/:callId/end", endVideoCall);

export default router; 