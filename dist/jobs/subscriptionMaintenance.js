"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSubscriptionMaintenance = runSubscriptionMaintenance;
exports.startSubscriptionMaintenanceJob = startSubscriptionMaintenanceJob;
const mongoose_1 = require("mongoose");
const Subscription_1 = require("../models/Subscription");
const User_1 = require("../models/User");
const logger_1 = require("../utils/logger");
const TRIAL_DAYS = Number(process.env.PREMIUM_TRIAL_DAYS || 7);
const PLAN_DURATION = {
    monthly: 30,
    annually: 365,
    trial: TRIAL_DAYS
};
function computeExpiryDate(planId, from = new Date()) {
    const days = PLAN_DURATION[planId] || PLAN_DURATION.monthly;
    const expiry = new Date(from);
    expiry.setDate(expiry.getDate() + days);
    return expiry;
}
async function processTrialTransitions(now) {
    const trials = await Subscription_1.Subscription.find({
        status: "trialing",
        trialEndsAt: { $lte: now }
    }).limit(200);
    for (const trial of trials) {
        const userId = new mongoose_1.Types.ObjectId(trial.userId);
        // If user cancelled during trial, expire it
        if (trial.autoRenew === false || trial.status === "cancelled" || trial.cancelledAt) {
            trial.status = "expired";
            trial.autoRenew = false;
            trial.expiresAt = trial.trialEndsAt || now;
            await trial.save();
            await User_1.User.findByIdAndUpdate(userId, {
                $set: {
                    "subscription.isActive": false,
                    "subscription.tier": "free",
                    "subscription.expiresAt": trial.expiresAt || now
                },
                $unset: { trialEndsAt: "", trialStartedAt: "" }
            });
            continue;
        }
        // Auto-activate paid subscription after trial if not cancelled
        const paidExpiry = computeExpiryDate(trial.planId || "monthly", now);
        trial.status = "active";
        trial.activatedAt = now;
        trial.startDate = trial.startDate || trial.trialStartsAt || now;
        trial.expiresAt = paidExpiry;
        await trial.save();
        await User_1.User.findByIdAndUpdate(userId, {
            $set: {
                "subscription.isActive": true,
                "subscription.tier": "premium",
                "subscription.subscriptionId": trial._id,
                "subscription.planId": trial.planId,
                "subscription.activatedAt": now,
                "subscription.expiresAt": paidExpiry,
                trialUsed: true
            },
            $unset: { trialEndsAt: "", trialStartedAt: "" }
        });
    }
}
async function expireLapsedSubscriptions(now) {
    const expiredSubs = await Subscription_1.Subscription.find({
        status: "active",
        expiresAt: { $lte: now }
    }).limit(200);
    for (const sub of expiredSubs) {
        const userId = new mongoose_1.Types.ObjectId(sub.userId);
        sub.status = "expired";
        sub.autoRenew = false;
        await sub.save();
        await User_1.User.findByIdAndUpdate(userId, {
            $set: {
                "subscription.isActive": false,
                "subscription.tier": "free",
                "subscription.expiresAt": sub.expiresAt || now
            },
            $unset: { trialEndsAt: "", trialStartedAt: "" }
        });
    }
}
async function runSubscriptionMaintenance() {
    const now = new Date();
    try {
        await processTrialTransitions(now);
        await expireLapsedSubscriptions(now);
    }
    catch (error) {
        logger_1.logger.warn("Subscription maintenance job failed", error);
    }
}
function startSubscriptionMaintenanceJob() {
    const intervalMinutes = Number(process.env.SUBSCRIPTION_CRON_MINUTES || 30);
    // Run once on boot, then on interval
    runSubscriptionMaintenance().catch((err) => logger_1.logger.warn("Initial subscription maintenance run failed", err));
    return setInterval(() => {
        runSubscriptionMaintenance().catch((err) => logger_1.logger.warn("Recurring subscription maintenance failed", err));
    }, intervalMinutes * 60 * 1000);
}
