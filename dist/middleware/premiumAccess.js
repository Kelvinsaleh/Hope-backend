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
            const { Types } = require('mongoose');
            const userId = new Types.ObjectId(req.user._id);
            const activeSub = await Subscription.findOne({ userId, status: 'active', expiresAt: { $gt: new Date() } });
            if (!activeSub) {
                return res.status(403).json({ success: false, error: `Premium subscription required for ${feature}` });
            }
            // Attach subscription to request for downstream handlers
            req.subscription = activeSub;
            next();
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
