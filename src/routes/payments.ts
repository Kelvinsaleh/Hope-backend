import express from "express";
import { initializePayment, verifyPayment, handleWebhook } from "../controllers/paymentController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// Payment initialization (requires auth)
router.post("/initialize", authenticateToken, initializePayment);

// Payment verification (requires auth)
router.post("/verify", authenticateToken, verifyPayment);

// Webhook handler (no auth required - Paystack calls this)
router.post("/webhook", express.raw({ type: 'application/json' }), handleWebhook);

export default router; 