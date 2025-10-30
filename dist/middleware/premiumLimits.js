"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceChatDailyLimit = enforceChatDailyLimit;
exports.enforceJournalWeeklyLimit = enforceJournalWeeklyLimit;
exports.enforceMeditationWeeklyLimit = enforceMeditationWeeklyLimit;
const mongoose_1 = require("mongoose");
const Subscription_1 = require("../models/Subscription");
const User_1 = require("../models/User");
const ChatSession_1 = require("../models/ChatSession");
const JournalEntry_1 = require("../models/JournalEntry");
const Meditation_1 = require("../models/Meditation");
async function isPremiumUser(userId) {
    // Prefer Subscription model if available
    const sub = await Subscription_1.Subscription.findOne({
        userId,
        status: "active",
        endDate: { $gt: new Date() },
    }).lean();
    if (sub)
        return true;
    // Fallback to User.subscription field
    const user = await User_1.User.findById(userId).lean();
    if (user?.subscription?.isActive && user.subscription.tier === "premium")
        return true;
    return false;
}
async function enforceChatDailyLimit(req, res, next) {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        if (await isPremiumUser(userId))
            return next();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        // Count all messages sent by the user today across all sessions
        const sessions = await ChatSession_1.ChatSession.aggregate([
            { $match: { userId } },
            { $unwind: "$messages" },
            { $match: { "messages.timestamp": { $gte: startOfDay }, "messages.role": "user" } },
            { $count: "count" },
        ]);
        const todayCount = sessions?.[0]?.count || 0;
        if (todayCount >= 30) {
            return res.status(429).json({
                success: false,
                error: "Daily chat limit reached for free plan. Upgrade to Premium for unlimited chats.",
                limits: { dailyChats: 30 },
            });
        }
        next();
    }
    catch (error) {
        return res.status(500).json({ success: false, error: "Failed to enforce chat limits" });
    }
}
async function enforceJournalWeeklyLimit(req, res, next) {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        if (await isPremiumUser(userId))
            return next();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const count = await JournalEntry_1.JournalEntry.countDocuments({ userId, createdAt: { $gte: sevenDaysAgo } });
        if (count >= 3) {
            return res.status(429).json({
                success: false,
                error: "Weekly journal limit reached for free plan. Upgrade to Premium for more entries.",
                limits: { weeklyJournals: 3 },
            });
        }
        next();
    }
    catch (error) {
        return res.status(500).json({ success: false, error: "Failed to enforce journal limits" });
    }
}
async function enforceMeditationWeeklyLimit(req, res, next) {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        if (await isPremiumUser(userId))
            return next();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const count = await Meditation_1.MeditationSession.countDocuments({ userId, completedAt: { $gte: sevenDaysAgo } });
        if (count >= 10) {
            return res.status(429).json({
                success: false,
                error: "Weekly meditation limit reached for free plan. Upgrade to Premium for unlimited listening.",
                limits: { weeklyMeditations: 10 },
            });
        }
        next();
    }
    catch (error) {
        return res.status(500).json({ success: false, error: "Failed to enforce meditation limits" });
    }
}
