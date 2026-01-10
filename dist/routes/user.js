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
const JournalEntry_1 = require("../models/JournalEntry");
const Mood_1 = require("../models/Mood");
const ChatSession_1 = require("../models/ChatSession");
const Meditation_1 = require("../models/Meditation");
const CBTThoughtRecord_1 = require("../models/CBTThoughtRecord");
const CBTActivity_1 = require("../models/CBTActivity");
const Community_1 = require("../models/Community");
const FavoriteMeditation_1 = require("../models/FavoriteMeditation");
const WeeklyReport_1 = require("../models/WeeklyReport");
const Session_1 = require("../models/Session");
const LongTermMemory_1 = require("../models/LongTermMemory");
// Validation defaults - can be overridden via env
const MAX_GOALS = Number(process.env.MAX_GOALS) || 10;
const MAX_CHALLENGES = Number(process.env.MAX_CHALLENGES) || 10;
const MAX_PROFILE_STR_LEN = Number(process.env.MAX_PROFILE_STR_LEN) || 200;
const MAX_BIO_LEN = Number(process.env.MAX_BIO_LEN) || 500;
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
        // Validate incoming profile body to avoid storing malformed data
        const errors = {};
        const body = req.body || {};
        if (body.goals !== undefined) {
            if (!Array.isArray(body.goals))
                errors.goals = 'goals must be an array of strings';
            else if (body.goals.length > MAX_GOALS)
                errors.goals = `max ${MAX_GOALS} goals allowed`;
            else if (body.goals.some(g => String(g || '').trim().length > MAX_PROFILE_STR_LEN))
                errors.goals = `each goal must be <= ${MAX_PROFILE_STR_LEN} chars`;
        }
        if (body.challenges !== undefined) {
            if (!Array.isArray(body.challenges))
                errors.challenges = 'challenges must be an array of strings';
            else if (body.challenges.length > MAX_CHALLENGES)
                errors.challenges = `max ${MAX_CHALLENGES} challenges allowed`;
            else if (body.challenges.some(c => String(c || '').trim().length > MAX_PROFILE_STR_LEN))
                errors.challenges = `each challenge must be <= ${MAX_PROFILE_STR_LEN} chars`;
        }
        if (body.bio !== undefined) {
            if (typeof body.bio !== 'string')
                errors.bio = 'bio must be a string';
            else if (body.bio.trim().length > MAX_BIO_LEN)
                errors.bio = `bio must be <= ${MAX_BIO_LEN} characters`;
        }
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ success: false, error: 'Invalid profile data', details: errors });
        }
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        // Whitelist profile fields to avoid storing unexpected data
        const allowedFields = [
            'bio', 'age', 'challenges', 'goals', 'communicationStyle',
            'experienceLevel', 'interests', 'availability', 'matchingPreferences',
            'safetySettings', 'privacyPreferences', 'isVerified', 'verificationDate', 'lastActive', 'status'
        ];
        const sanitized = {};
        for (const k of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(body, k))
                sanitized[k] = body[k];
        }
        const existing = await UserProfile_1.UserProfile.findOne({ userId });
        if (existing) {
            await UserProfile_1.UserProfile.updateOne({ userId }, { $set: sanitized });
            const updated = await UserProfile_1.UserProfile.findOne({ userId }).lean();
            // Invalidate memory cache so subsequent chat requests rebuild memory
            try {
                const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat');
                invalidateMemoryCacheForUser(String(userId));
            }
            catch (e) {
                console.warn('Failed to call invalidateMemoryCacheForUser', e);
            }
            return res.json({ success: true, data: updated });
        }
        const created = await UserProfile_1.UserProfile.create({ userId, ...sanitized });
        try {
            const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat');
            invalidateMemoryCacheForUser(String(userId));
        }
        catch (e) {
            console.warn('Failed to call invalidateMemoryCacheForUser', e);
        }
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
        // Sanitize and validate updates similar to POST
        const body = req.body || {};
        const errors = {};
        if (body.goals !== undefined) {
            if (!Array.isArray(body.goals))
                errors.goals = 'goals must be an array of strings';
            else if (body.goals.length > MAX_GOALS)
                errors.goals = `max ${MAX_GOALS} goals allowed`;
        }
        if (body.challenges !== undefined) {
            if (!Array.isArray(body.challenges))
                errors.challenges = 'challenges must be an array of strings';
            else if (body.challenges.length > MAX_CHALLENGES)
                errors.challenges = `max ${MAX_CHALLENGES} challenges allowed`;
        }
        if (body.bio !== undefined) {
            if (typeof body.bio !== 'string')
                errors.bio = 'bio must be a string';
            else if (body.bio.trim().length > MAX_BIO_LEN)
                errors.bio = `bio must be <= ${MAX_BIO_LEN} characters`;
        }
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ success: false, error: 'Invalid profile data', details: errors });
        }
        // Build sanitized update object
        const allowedFields = [
            'bio', 'age', 'challenges', 'goals', 'communicationStyle',
            'experienceLevel', 'interests', 'availability', 'matchingPreferences',
            'safetySettings', 'privacyPreferences', 'isVerified', 'verificationDate', 'lastActive', 'status'
        ];
        const sanitized = {};
        for (const k of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(body, k))
                sanitized[k] = body[k];
        }
        const updateResult = await UserProfile_1.UserProfile.updateOne({ userId }, { $set: sanitized }, { upsert: true });
        console.log("📊 Update result:", updateResult);
        const updated = await UserProfile_1.UserProfile.findOne({ userId }).lean();
        console.log("✅ Updated profile from DB:", updated);
        try {
            const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat');
            invalidateMemoryCacheForUser(String(userId));
        }
        catch (e) {
            console.warn('Failed to call invalidateMemoryCacheForUser', e);
        }
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
        try {
            const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat');
            invalidateMemoryCacheForUser(String(userId));
        }
        catch (e) {
            console.warn('Failed to call invalidateMemoryCacheForUser', e);
        }
        res.json({ success: true, data: user });
    }
    catch (error) {
        res.status(500).json({ success: false, error: "Failed to update user" });
    }
});
// Export all user data (GDPR right to data portability)
router.get("/data/export", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        // Fetch all user data from backend
        const [user, profile, journalEntries, moods, chatSessions, meditationSessions, thoughtRecords, cbtActivities, communityPosts, favoriteMeditations, weeklyReports] = await Promise.all([
            User_1.User.findById(userId).select('-password').lean(),
            UserProfile_1.UserProfile.findOne({ userId }).lean(),
            JournalEntry_1.JournalEntry.find({ userId }).lean(),
            Mood_1.Mood.find({ userId }).lean(),
            ChatSession_1.ChatSession.find({ userId }).lean(),
            Meditation_1.MeditationSession.find({ userId }).lean(),
            CBTThoughtRecord_1.CBTThoughtRecord.find({ userId }).lean(),
            CBTActivity_1.CBTActivity.find({ userId }).lean(),
            Community_1.CommunityPost.find({ userId }).lean(),
            FavoriteMeditation_1.FavoriteMeditation.find({ userId }).lean(),
            WeeklyReport_1.WeeklyReport.find({ userId }).lean(),
        ]);
        // Compile export data
        const exportData = {
            exportDate: new Date().toISOString(),
            user: {
                id: user?._id,
                name: user?.name,
                email: user?.email,
                createdAt: user?.createdAt,
                lastActive: user?.lastActive,
                subscription: user?.subscription,
            },
            profile: profile || {},
            journalEntries: journalEntries || [],
            moods: moods || [],
            chatSessions: (chatSessions || []).map((session) => ({
                sessionId: session.sessionId,
                title: session.title,
                messageCount: session.messages?.length || 0,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                // Optionally include messages (remove for privacy/brevity if needed)
                messages: session.messages || [],
            })),
            meditationSessions: meditationSessions || [],
            thoughtRecords: thoughtRecords || [],
            cbtActivities: cbtActivities || [],
            communityPosts: (communityPosts || []).map((post) => ({
                id: post._id,
                content: post.content,
                mood: post.mood,
                createdAt: post.createdAt,
                isAnonymous: post.isAnonymous,
            })),
            favoriteMeditations: favoriteMeditations || [],
            weeklyReports: weeklyReports || [],
            metadata: {
                totalJournalEntries: journalEntries?.length || 0,
                totalMoods: moods?.length || 0,
                totalChatSessions: chatSessions?.length || 0,
                totalMeditationSessions: meditationSessions?.length || 0,
                totalThoughtRecords: thoughtRecords?.length || 0,
                totalCBTActivities: cbtActivities?.length || 0,
                totalCommunityPosts: communityPosts?.length || 0,
                totalFavoriteMeditations: favoriteMeditations?.length || 0,
                totalWeeklyReports: weeklyReports?.length || 0,
            },
        };
        res.json({
            success: true,
            data: exportData,
        });
    }
    catch (error) {
        console.error("Error exporting user data:", error);
        res.status(500).json({
            success: false,
            error: "Failed to export user data",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
// Update privacy preferences
router.put("/privacy-preferences", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { analyticsEnabled, crashReportingEnabled, dataCollectionEnabled } = req.body || {};
        const privacyPreferences = {};
        if (typeof analyticsEnabled === 'boolean') {
            privacyPreferences.analyticsEnabled = analyticsEnabled;
        }
        if (typeof crashReportingEnabled === 'boolean') {
            privacyPreferences.crashReportingEnabled = crashReportingEnabled;
        }
        if (typeof dataCollectionEnabled === 'boolean') {
            privacyPreferences.dataCollectionEnabled = dataCollectionEnabled;
        }
        if (Object.keys(privacyPreferences).length === 0) {
            return res.status(400).json({ success: false, error: "No privacy preferences provided" });
        }
        // Get existing profile or create one
        const existing = await UserProfile_1.UserProfile.findOne({ userId });
        if (existing) {
            // Update existing privacy preferences
            const currentPreferences = existing.privacyPreferences || {};
            await UserProfile_1.UserProfile.updateOne({ userId }, { $set: { privacyPreferences: { ...currentPreferences, ...privacyPreferences } } });
        }
        else {
            // Create profile with privacy preferences
            await UserProfile_1.UserProfile.create({
                userId,
                privacyPreferences: {
                    analyticsEnabled: analyticsEnabled ?? true,
                    crashReportingEnabled: crashReportingEnabled ?? true,
                    dataCollectionEnabled: dataCollectionEnabled ?? true,
                },
            });
        }
        const updated = await UserProfile_1.UserProfile.findOne({ userId }).lean();
        res.json({
            success: true,
            data: {
                privacyPreferences: updated?.privacyPreferences || {
                    analyticsEnabled: analyticsEnabled ?? true,
                    crashReportingEnabled: crashReportingEnabled ?? true,
                    dataCollectionEnabled: dataCollectionEnabled ?? true,
                },
            },
        });
    }
    catch (error) {
        console.error("Error updating privacy preferences:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update privacy preferences",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
// Delete all user data (GDPR right to be forgotten)
router.delete("/data", async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        // Delete all user data from all collections
        const deleteResults = await Promise.all([
            JournalEntry_1.JournalEntry.deleteMany({ userId }),
            Mood_1.Mood.deleteMany({ userId }),
            ChatSession_1.ChatSession.deleteMany({ userId }),
            Meditation_1.MeditationSession.deleteMany({ userId }),
            CBTThoughtRecord_1.CBTThoughtRecord.deleteMany({ userId }),
            CBTActivity_1.CBTActivity.deleteMany({ userId }),
            Community_1.CommunityPost.deleteMany({ userId }),
            FavoriteMeditation_1.FavoriteMeditation.deleteMany({ userId }),
            WeeklyReport_1.WeeklyReport.deleteMany({ userId }),
            UserProfile_1.UserProfile.deleteOne({ userId }),
            Session_1.Session.deleteMany({ userId }),
            LongTermMemory_1.LongTermMemoryModel.deleteMany({ userId }),
        ]);
        // Invalidate memory cache
        try {
            const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat');
            invalidateMemoryCacheForUser(String(userId));
        }
        catch (e) {
            console.warn('Failed to call invalidateMemoryCacheForUser', e);
        }
        // Note: We do NOT delete the User account itself, only their data
        // This allows them to login again if needed, but with a fresh account
        console.log(`User data deleted for user ${userId}`);
        res.json({
            success: true,
            message: "All user data deleted successfully",
            deleted: {
                journalEntries: deleteResults[0].deletedCount,
                moods: deleteResults[1].deletedCount,
                chatSessions: deleteResults[2].deletedCount,
                meditationSessions: deleteResults[3].deletedCount,
                thoughtRecords: deleteResults[4].deletedCount,
                cbtActivities: deleteResults[5].deletedCount,
                communityPosts: deleteResults[6].deletedCount,
                favoriteMeditations: deleteResults[7].deletedCount,
                weeklyReports: deleteResults[8].deletedCount,
                profile: deleteResults[9].deletedCount,
                sessions: deleteResults[10].deletedCount,
                memories: deleteResults[11].deletedCount,
            },
        });
    }
    catch (error) {
        console.error("Error deleting user data:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete user data",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
exports.default = router;
