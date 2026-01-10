"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePremium = void 0;
const requirePremium = (feature) => {
    return async (req, res, next) => {
        try {
            // Ensure user is authenticated
            if (!req.user || !req.user._id) {
                return res.status(401).json({ success: false, error: 'Authentication required for premium features' });
            }
            // Lazy import to avoid circular dependencies
            const { Subscription } = require('../models/Subscription');
            const { User } = require('../models/User');
            const { Types } = require('mongoose');
            const userId = new Types.ObjectId(req.user._id);
            // Check for active subscription
            const activeSub = await Subscription.findOne({ userId, status: 'active', expiresAt: { $gt: new Date() } });
            if (activeSub) {
                req.subscription = activeSub;
                return next();
            }
            // Check for active trial
            const user = await User.findById(userId).lean();
            if (user?.trialEndsAt) {
                const now = new Date();
                if (now < new Date(user.trialEndsAt)) {
                    // User has active trial, allow access
                    return next();
                }
            }
            // No active subscription or trial
            return res.status(403).json({ success: false, error: `Premium subscription or active trial required for ${feature}` });
        }
        catch (error) {
            res.status(500).json({
                error: "Failed to check premium access",
                details: error instanceof Error ? error.message : "Unknown error",
            });
        }
    };
};
exports.requirePremium = requirePremium;
