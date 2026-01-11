import express from "express";
import { getSubscriptionStatus, createSubscription, updateSubscription, checkPremiumAccess, updateUserTier, startFreeTrial } from "../controllers/subscriptionController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Subscription routes
router.get("/status", getSubscriptionStatus);
router.post("/", createSubscription);
router.post("/start-trial", startFreeTrial);
router.put("/:subscriptionId", updateSubscription);
router.get("/premium/:feature", checkPremiumAccess);

// User tier management
router.post("/update-tier", updateUserTier);

export default router;
