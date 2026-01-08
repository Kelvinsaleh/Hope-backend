"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const paymentController_1 = require("../controllers/paymentController");
const subscriptionController_1 = require("../controllers/subscriptionController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Payment initialization (requires auth)
router.post("/initialize", auth_1.authenticateToken, paymentController_1.initializePayment);
// Payment verification (requires auth)
router.post("/verify", auth_1.authenticateToken, paymentController_1.verifyPayment);
// Webhook handler (no auth required - Paystack calls this)
router.post("/webhook", express_1.default.raw({ type: 'application/json' }), paymentController_1.handleWebhook);
// Subscription status (requires auth)
router.get("/subscription/status", auth_1.authenticateToken, subscriptionController_1.getSubscriptionStatus);
// Create a subscription record (frontend may call this after initialization)
router.post("/subscription", auth_1.authenticateToken, subscriptionController_1.createSubscription);
// Create a subscription in Paystack (recurring)
router.post('/subscription/create', auth_1.authenticateToken, paymentController_1.createPaystackSubscription);
// Cancel subscription
router.post("/subscription/cancel", auth_1.authenticateToken, subscriptionController_1.cancelSubscription);
// Update user tier (requires auth)
router.post("/users/update-tier", auth_1.authenticateToken, subscriptionController_1.updateUserTier);
exports.default = router;
