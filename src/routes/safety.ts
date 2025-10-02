import express from "express";
import {
  submitReport,
  blockUser,
  getBlockedUsers,
  unblockUser,
  escalateToCrisisSupport
} from "../controllers/safetyController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

router.use(authenticateToken);

// Safety reporting routes
router.post("/report", submitReport);

// User blocking routes
router.post("/block", blockUser);
router.get("/blocked", getBlockedUsers);
router.post("/unblock", unblockUser);

export default router; 