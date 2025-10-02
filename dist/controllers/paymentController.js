"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhook = exports.verifyPayment = exports.initializePayment = void 0;
const logger_1 = require("../utils/logger");
const User_1 = require("../models/User");
const Subscription_1 = require("../models/Subscription");
const mongoose_1 = require("mongoose");
// Paystack configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const PLANS = [
    {
        id: 'monthly',
        name: 'Monthly Plan',
        price: 7.99,
        currency: 'USD',
        interval: 'monthly',
        paystackPlanCode: 'PLN_monthly_premium'
    },
    {
        id: 'annually',
        name: 'Annual Plan',
        price: 79.99,
        currency: 'USD',
        interval: 'annually',
        paystackPlanCode: 'PLN_annual_premium'
    }
];
// Initialize payment with Paystack
const initializePayment = async (req, res) => {
    try {
        const { email, planId, userId, metadata } = req.body;
        if (!email || !planId || !userId) {
            return res.status(400).json({
                success: false,
                error: "Missing required fields: email, planId, userId"
            });
        }
        const plan = PLANS.find(p => p.id === planId);
        if (!plan) {
            return res.status(400).json({
                success: false,
                error: "Invalid plan selected"
            });
        }
        // Verify user exists
        const user = await User_1.User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "User not found"
            });
        }
        // Create Paystack transaction
        const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                amount: Math.round(plan.price * 100), // Convert to kobo/cent
                currency: plan.currency,
                reference: `HOPE_${Date.now()}_${userId}`,
                metadata: {
                    userId,
                    planId,
                    planName: plan.name,
                    ...metadata
                },
                callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success`
            })
        });
        const paystackData = await paystackResponse.json();
        if (!paystackData.status) {
            throw new Error(paystackData.message || 'Failed to initialize payment');
        }
        // Store pending subscription
        const pendingSubscription = new Subscription_1.Subscription({
            userId: new mongoose_1.Types.ObjectId(userId),
            planId,
            planName: plan.name,
            amount: plan.price,
            currency: plan.currency,
            status: 'pending',
            paystackReference: paystackData.data.reference,
            paystackAccessCode: paystackData.data.access_code
        });
        await pendingSubscription.save();
        res.json({
            success: true,
            authorization_url: paystackData.data.authorization_url,
            access_code: paystackData.data.access_code,
            reference: paystackData.data.reference
        });
    }
    catch (error) {
        logger_1.logger.error("Payment initialization error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to initialize payment"
        });
    }
};
exports.initializePayment = initializePayment;
// Verify payment with Paystack
const verifyPayment = async (req, res) => {
    try {
        const { reference } = req.body;
        if (!reference) {
            return res.status(400).json({
                success: false,
                error: "Payment reference is required"
            });
        }
        // Verify with Paystack
        const paystackResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`
            }
        });
        const paystackData = await paystackResponse.json();
        if (!paystackData.status || paystackData.data.status !== 'success') {
            return res.status(400).json({
                success: false,
                error: "Payment verification failed"
            });
        }
        const transaction = paystackData.data;
        const userId = transaction.metadata.userId;
        const planId = transaction.metadata.planId;
        // Find pending subscription
        const pendingSubscription = await Subscription_1.Subscription.findOne({
            paystackReference: reference,
            status: 'pending'
        });
        if (!pendingSubscription) {
            return res.status(404).json({
                success: false,
                error: "Pending subscription not found"
            });
        }
        // Calculate subscription dates
        const now = new Date();
        const expiresAt = new Date();
        if (planId === 'monthly') {
            expiresAt.setMonth(expiresAt.getMonth() + 1);
        }
        else if (planId === 'annually') {
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        }
        // Update subscription to active
        pendingSubscription.status = 'active';
        pendingSubscription.startDate = now;
        pendingSubscription.expiresAt = expiresAt;
        pendingSubscription.paystackTransactionId = transaction.id;
        await pendingSubscription.save();
        // Deactivate any existing active subscriptions
        await Subscription_1.Subscription.updateMany({
            userId: pendingSubscription.userId,
            status: 'active',
            _id: { $ne: pendingSubscription._id }
        }, { status: 'cancelled' });
        res.json({
            success: true,
            message: "Payment verified successfully",
            subscription: {
                id: pendingSubscription._id,
                planId,
                status: 'active',
                expiresAt
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Payment verification error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to verify payment"
        });
    }
};
exports.verifyPayment = verifyPayment;
// Webhook handler for Paystack events
const handleWebhook = async (req, res) => {
    try {
        const signature = req.headers['x-paystack-signature'];
        const body = JSON.stringify(req.body);
        // Verify webhook signature (implement proper verification)
        // For now, we'll process the webhook directly
        const event = req.body;
        if (event.event === 'charge.success') {
            const transaction = event.data;
            const reference = transaction.reference;
            // Find and update subscription
            const subscription = await Subscription_1.Subscription.findOne({
                paystackReference: reference,
                status: 'pending'
            });
            if (subscription) {
                subscription.status = 'active';
                subscription.paystackTransactionId = transaction.id;
                await subscription.save();
            }
        }
        res.status(200).json({ received: true });
    }
    catch (error) {
        logger_1.logger.error("Webhook error:", error);
        res.status(500).json({ error: "Webhook processing failed" });
    }
};
exports.handleWebhook = handleWebhook;
