"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPremiumAccess = exports.updateSubscription = exports.createSubscription = exports.getSubscriptionStatus = void 0;
const getSubscriptionStatus = async (req, res) => {
    res.json({ success: true, isPremium: false, userTier: "free" });
};
exports.getSubscriptionStatus = getSubscriptionStatus;
const createSubscription = async (req, res) => {
    res.json({ success: true, message: "Subscription created" });
};
exports.createSubscription = createSubscription;
const updateSubscription = async (req, res) => {
    res.json({ success: true, message: "Subscription updated" });
};
exports.updateSubscription = updateSubscription;
const checkPremiumAccess = async (req, res) => {
    res.json({ success: true, hasAccess: false, userTier: "free" });
};
exports.checkPremiumAccess = checkPremiumAccess;
