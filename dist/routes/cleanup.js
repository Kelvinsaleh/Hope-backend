"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const mongoose_1 = require("mongoose");
const UserProfile_1 = require("../models/UserProfile");
const router = express_1.default.Router();
router.use(auth_1.authenticateToken);
// Cleanup corrupted profile
router.post("/fix-profile", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        console.log("🔧 Fixing corrupted profile for user:", userId.toString());
        // Get the current profile
        const currentProfile = await UserProfile_1.UserProfile.findOne({ userId }).lean();
        if (!currentProfile) {
            return res.json({
                success: true,
                message: "No profile found, nothing to fix"
            });
        }
        console.log("📊 Current profile:", currentProfile);
        // Extract only the valid fields
        const cleanProfile = {
            bio: currentProfile.bio || "",
            challenges: currentProfile.challenges || [],
            goals: currentProfile.goals || [],
            communicationStyle: currentProfile.communicationStyle || "gentle",
            experienceLevel: currentProfile.experienceLevel || "beginner",
            interests: currentProfile.interests || [],
            availability: currentProfile.availability || {
                timezone: undefined,
                preferredTimes: [],
                daysAvailable: []
            },
            matchingPreferences: currentProfile.matchingPreferences || {
                ageRange: { min: 18, max: 100 },
                challenges: [],
                goals: [],
                communicationStyle: [],
                experienceLevel: []
            },
            safetySettings: currentProfile.safetySettings || {
                allowEmergencySupport: false,
                requireVerification: true,
                maxDistance: 0
            },
            isVerified: currentProfile.isVerified || false,
            lastActive: currentProfile.lastActive || new Date(),
            status: currentProfile.status || "offline"
        };
        console.log("✅ Clean profile:", cleanProfile);
        // Replace the entire document with clean data
        await UserProfile_1.UserProfile.updateOne({ userId }, { $set: cleanProfile }, { upsert: true });
        // Verify the fix
        const fixed = await UserProfile_1.UserProfile.findOne({ userId }).lean();
        console.log("🎉 Fixed profile:", fixed);
        res.json({
            success: true,
            message: "Profile cleaned successfully",
            before: currentProfile,
            after: fixed
        });
    }
    catch (error) {
        console.error("❌ Error fixing profile:", error);
        res.status(500).json({
            success: false,
            error: "Failed to fix profile",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
});
exports.default = router;
