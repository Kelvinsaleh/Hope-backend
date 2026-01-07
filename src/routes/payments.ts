import express from "express";
import { initializePayment, verifyPayment, handleWebhook, createPaystackSubscription } from "../controllers/paymentController";
import { getSubscriptionStatus, updateUserTier, createSubscription, cancelSubscription } from "../controllers/subscriptionController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// Payment initialization (requires auth)
router.post("/initialize", authenticateToken, initializePayment);

// Payment verification (requires auth)
router.post("/verify", authenticateToken, verifyPayment);

// Webhook handler (no auth required - Paystack calls this)
router.post("/webhook", express.raw({ type: 'application/json' }), handleWebhook);

// Subscription status (requires auth)
router.get("/subscription/status", authenticateToken, getSubscriptionStatus);

// Create a subscription record (frontend may call this after initialization)
router.post("/subscription", authenticateToken, createSubscription);

// Create a subscription in Paystack (recurring)
router.post('/subscription/create', authenticateToken, createPaystackSubscription);

// Cancel subscription
router.post("/subscription/cancel", authenticateToken, cancelSubscription);

// Update user tier (requires auth)
router.post("/users/update-tier", authenticateToken, updateUserTier);

export default router; 