"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserTier = exports.checkPremiumAccess = exports.cancelSubscription = exports.updateSubscription = exports.createSubscription = exports.getSubscriptionStatus = void 0;
const Subscription_1 = require("../models/Subscription");
const User_1 = require("../models/User");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
const getSubscriptionStatus = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const activeSubscription = await Subscription_1.Subscription.findOne({
            userId,
            status: 'active',
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 });
        const isPremium = !!activeSubscription;
        const userTier = isPremium ? 'premium' : 'free';
        res.json({
            success: true,
            isPremium,
            userTier,
            subscription: activeSubscription ? {
                id: activeSubscription._id,
                planId: activeSubscription.planId,
                planName: activeSubscription.planName,
                expiresAt: activeSubscription.expiresAt,
                status: activeSubscription.status
            } : null
        });
    }
    catch (error) {
        logger_1.logger.error("Error getting subscription status:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get subscription status"
        });
    }
};
exports.getSubscriptionStatus = getSubscriptionStatus;
const createSubscription = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { planId, planName, amount, currency } = req.body;
        const subscription = new Subscription_1.Subscription({
            userId,
            planId,
            planName,
            amount,
            currency,
            status: 'pending'
        });
        await subscription.save();
        res.json({
            success: true,
            message: "Subscription created",
            subscription: {
                id: subscription._id,
                planId,
                status: 'pending'
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Error creating subscription:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create subscription"
        });
    }
};
exports.createSubscription = createSubscription;
const updateSubscription = async (req, res) => {
    try {
        const { subscriptionId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const updates = req.body;
        const subscription = await Subscription_1.Subscription.findOneAndUpdate({ _id: subscriptionId, userId }, updates, { new: true });
        if (!subscription) {
            return res.status(404).json({
                success: false,
                error: "Subscription not found"
            });
        }
        res.json({
            success: true,
            message: "Subscription updated",
            subscription
        });
    }
    catch (error) {
        logger_1.logger.error("Error updating subscription:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update subscription"
        });
    }
};
exports.updateSubscription = updateSubscription;
const cancelSubscription = async (req, res) => {
    try {
        const requesterUserId = req.user && req.user._id ? new mongoose_1.Types.ObjectId(req.user._id) : null;
        const { subscriptionId, userId: bodyUserId } = req.body;
        // Determine which user to act on
        const targetUserId = bodyUserId ? new mongoose_1.Types.ObjectId(bodyUserId) : requesterUserId;
        if (!targetUserId) {
            return res.status(400).json({ success: false, error: 'User id is required' });
        }
        let subscription;
        if (subscriptionId) {
            subscription = await Subscription_1.Subscription.findOneAndUpdate({ _id: subscriptionId, userId: targetUserId, status: 'active' }, { status: 'cancelled', cancelledAt: new Date() }, { new: true });
        }
        else {
            // Cancel the most recent active subscription for the user
            subscription = await Subscription_1.Subscription.findOneAndUpdate({ userId: targetUserId, status: 'active', expiresAt: { $gt: new Date() } }, { status: 'cancelled', cancelledAt: new Date() }, { sort: { createdAt: -1 }, new: true });
        }
        if (!subscription) {
            return res.status(404).json({ success: false, error: 'Active subscription not found' });
        }
        // If subscription has a Paystack subscription code, try to disable it
        if (subscription.paystackSubscriptionCode) {
            try {
                const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
                await fetch(`https://api.paystack.co/subscription/disable`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ code: subscription.paystackSubscriptionCode })
                });
            }
            catch (err) {
                logger_1.logger.warn('Failed to disable Paystack subscription:', err);
            }
        }
        // Update local subscription and user record to free tier
        subscription.status = 'cancelled';
        subscription.cancelledAt = new Date();
        await subscription.save();
        await User_1.User.findByIdAndUpdate(targetUserId, {
            $set: {
                'subscription.isActive': false,
                'subscription.tier': 'free',
                'subscription.expiresAt': new Date()
            }
        });
        res.json({ success: true, message: 'Subscription cancelled' });
    }
    catch (error) {
        logger_1.logger.error('Error cancelling subscription:', error);
        res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
    }
};
exports.cancelSubscription = cancelSubscription;
const checkPremiumAccess = async (req, res) => {
    try {
        const { feature } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const activeSubscription = await Subscription_1.Subscription.findOne({
            userId,
            status: 'active',
            expiresAt: { $gt: new Date() }
        });
        const hasAccess = !!activeSubscription;
        const userTier = hasAccess ? 'premium' : 'free';
        res.json({
            success: true,
            hasAccess,
            userTier,
            feature,
            message: hasAccess
                ? `Access granted to ${feature}`
                : `Premium subscription required for ${feature}`
        });
    }
    catch (error) {
        logger_1.logger.error("Error checking premium access:", error);
        res.status(500).json({
            success: false,
            error: "Failed to check premium access"
        });
    }
};
exports.checkPremiumAccess = checkPremiumAccess;
// Update user tier after successful payment
const updateUserTier = async (req, res) => {
    try {
        const { userId, tier, subscriptionId, planId } = req.body;
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        // Update user subscription status
        await User_1.User.findByIdAndUpdate(userObjectId, {
            $set: {
                'subscription.isActive': tier === 'premium',
                'subscription.tier': tier,
                'subscription.subscriptionId': subscriptionId,
                'subscription.planId': planId,
                'subscription.activatedAt': new Date()
            }
        });
        // If activating premium, also update/create subscription record
        if (tier === 'premium' && subscriptionId) {
            await Subscription_1.Subscription.findByIdAndUpdate(subscriptionId, {
                $set: {
                    status: 'active',
                    activatedAt: new Date()
                }
            }, { upsert: true });
        }
        logger_1.logger.info(`User tier updated: ${userId} -> ${tier}`);
        res.json({
            success: true,
            message: `User tier updated to ${tier}`,
            data: {
                userId,
                tier,
                subscriptionId,
                activatedAt: new Date()
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Error updating user tier:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update user tier"
        });
    }
};
exports.updateUserTier = updateUserTier;
