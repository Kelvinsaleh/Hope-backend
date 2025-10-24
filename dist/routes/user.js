"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const Subscription_1 = require("../models/Subscription");
const mongoose_1 = require("mongoose");
const UserProfile_1 = require("../models/UserProfile");
const User_1 = require("../models/User");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
router.get("/tier", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const subscription = await Subscription_1.Subscription.findOne({
            userId,
            status: "active",
            endDate: { $gt: new Date() }
        });
        const tier = subscription ? "premium" : "free";
        res.json({
            success: true,
            tier,
            subscription: subscription || null
        });
    }
    catch (error) {
        res.status(500).json({
            error: "Failed to check user tier",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
exports.default = router;
// Profile routes
router.get("/profile", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        console.log("📖 Profile GET request for user:", userId.toString());
        const existing = await UserProfile_1.UserProfile.findOne({ userId });
        if (!existing) {
            console.log("📝 No profile found, creating new one");
            await UserProfile_1.UserProfile.create({ userId });
        }
        const profile = await UserProfile_1.UserProfile.findOne({ userId }).lean();
        // DETAILED DEBUG LOGGING
        console.log("🔍 RAW PROFILE FROM MONGODB:", JSON.stringify(profile, null, 2));
        console.log("🔍 GOALS LENGTH:", profile?.goals?.length || 0);
        console.log("🔍 CHALLENGES LENGTH:", profile?.challenges?.length || 0);
        res.json({ success: true, data: profile || null });
    }
    catch (error) {
        console.error("❌ Profile GET error:", error);
        res.status(500).json({ success: false, error: "Failed to get profile" });
    }
});
router.post("/profile", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const existing = await UserProfile_1.UserProfile.findOne({ userId });
        if (existing) {
            await UserProfile_1.UserProfile.updateOne({ userId }, { $set: req.body });
            const updated = await UserProfile_1.UserProfile.findOne({ userId }).lean();
            return res.json({ success: true, data: updated });
        }
        const created = await UserProfile_1.UserProfile.create({ userId, ...req.body });
        res.json({ success: true, data: created });
    }
    catch (error) {
        res.status(500).json({ success: false, error: "Failed to create profile" });
    }
});
router.put("/profile", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        console.log("📝 Profile update request:", { userId: userId.toString(), body: req.body });
        const updateResult = await UserProfile_1.UserProfile.updateOne({ userId }, { $set: req.body }, { upsert: true });
        console.log("📊 Update result:", updateResult);
        const updated = await UserProfile_1.UserProfile.findOne({ userId }).lean();
        console.log("✅ Updated profile from DB:", updated);
        res.json({ success: true, data: updated });
    }
    catch (error) {
        console.error("❌ Profile update error:", error);
        res.status(500).json({ success: false, error: "Failed to update profile" });
    }
});
// Basic user update (name/email)
router.put("/", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { name, email } = req.body || {};
        const update = {};
        if (typeof name === 'string' && name.trim())
            update.name = name.trim();
        if (typeof email === 'string' && email.trim())
            update.email = email.trim();
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ success: false, error: "No changes provided" });
        }
        const user = await User_1.User.findByIdAndUpdate(userId, { $set: update }, { new: true }).lean();
        res.json({ success: true, data: user });
    }
    catch (error) {
        res.status(500).json({ success: false, error: "Failed to update user" });
    }
});
