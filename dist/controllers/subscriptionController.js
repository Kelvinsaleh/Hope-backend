"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserTier = exports.checkPremiumAccess = exports.updateSubscription = exports.createSubscription = exports.getSubscriptionStatus = void 0;
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
