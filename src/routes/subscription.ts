import express from "express";
import { getSubscriptionStatus, createSubscription, updateSubscription, checkPremiumAccess } from "../controllers/subscriptionController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

router.get("/status", getSubscriptionStatus);
router.post("/", createSubscription);
router.put("/:subscriptionId", updateSubscription);
router.get("/access/:feature", checkPremiumAccess);

export default router;
