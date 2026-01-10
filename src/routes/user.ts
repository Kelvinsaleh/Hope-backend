import express from "express";
import { authenticateToken } from "../middleware/auth";
import { Subscription } from "../models/Subscription";
import { Types } from "mongoose";
import { UserProfile } from "../models/UserProfile";
import { User } from "../models/User";
import { JournalEntry } from "../models/JournalEntry";
import { Mood } from "../models/Mood";
import { ChatSession } from "../models/ChatSession";
import { MeditationSession } from "../models/Meditation";
import { CBTThoughtRecord } from "../models/CBTThoughtRecord";
import { CBTActivity } from "../models/CBTActivity";
import { CommunityPost } from "../models/Community";
import { FavoriteMeditation } from "../models/FavoriteMeditation";
import { WeeklyReport } from "../models/WeeklyReport";
import { Session } from "../models/Session";
import { LongTermMemoryModel } from "../models/LongTermMemory";

// Validation defaults - can be overridden via env
const MAX_GOALS = Number(process.env.MAX_GOALS) || 10;
const MAX_CHALLENGES = Number(process.env.MAX_CHALLENGES) || 10;
const MAX_PROFILE_STR_LEN = Number(process.env.MAX_PROFILE_STR_LEN) || 200;
const MAX_BIO_LEN = Number(process.env.MAX_BIO_LEN) || 500;

const router = express.Router();

router.use(authenticateToken);

router.get("/tier", async (req, res) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    
    const subscription = await Subscription.findOne({
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
  } catch (error) {
    res.status(500).json({
      error: "Failed to check user tier",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Profile routes
router.get("/profile", async (req, res) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    console.log("📖 Profile GET request for user:", userId.toString());
    
    const existing = await UserProfile.findOne({ userId });
    if (!existing) {
      console.log("📝 No profile found, creating new one");
      await UserProfile.create({ userId });
    }
    
    const profile = await UserProfile.findOne({ userId }).lean();
    
    // DETAILED DEBUG LOGGING
    console.log("🔍 RAW PROFILE FROM MONGODB:", JSON.stringify(profile, null, 2));
    console.log("🔍 GOALS LENGTH:", (profile as any)?.goals?.length || 0);
    console.log("🔍 CHALLENGES LENGTH:", (profile as any)?.challenges?.length || 0);
    
    res.json({ success: true, data: profile || null });
  } catch (error) {
    console.error("❌ Profile GET error:", error);
    res.status(500).json({ success: false, error: "Failed to get profile" });
  }
});

router.post("/profile", async (req, res) => {
  try {
    // Validate incoming profile body to avoid storing malformed data
    const errors: Record<string, string> = {};
    const body = req.body || {};

    if (body.goals !== undefined) {
      if (!Array.isArray(body.goals)) errors.goals = 'goals must be an array of strings';
      else if (body.goals.length > MAX_GOALS) errors.goals = `max ${MAX_GOALS} goals allowed`;
      else if ((body.goals as any[]).some(g => String(g || '').trim().length > MAX_PROFILE_STR_LEN)) errors.goals = `each goal must be <= ${MAX_PROFILE_STR_LEN} chars`;
    }

    if (body.challenges !== undefined) {
      if (!Array.isArray(body.challenges)) errors.challenges = 'challenges must be an array of strings';
      else if (body.challenges.length > MAX_CHALLENGES) errors.challenges = `max ${MAX_CHALLENGES} challenges allowed`;
      else if ((body.challenges as any[]).some(c => String(c || '').trim().length > MAX_PROFILE_STR_LEN)) errors.challenges = `each challenge must be <= ${MAX_PROFILE_STR_LEN} chars`;
    }

    if (body.bio !== undefined) {
      if (typeof body.bio !== 'string') errors.bio = 'bio must be a string';
      else if (body.bio.trim().length > MAX_BIO_LEN) errors.bio = `bio must be <= ${MAX_BIO_LEN} characters`;
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ success: false, error: 'Invalid profile data', details: errors });
    }
    const userId = new Types.ObjectId(req.user._id);

    // Whitelist profile fields to avoid storing unexpected data
    const allowedFields = [
      'bio', 'age', 'challenges', 'goals', 'communicationStyle',
      'experienceLevel', 'interests', 'availability', 'matchingPreferences',
      'safetySettings', 'privacyPreferences', 'isVerified', 'verificationDate', 'lastActive', 'status'
    ];
    const sanitized: any = {};
    for (const k of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, k)) sanitized[k] = body[k];
    }

    const existing = await UserProfile.findOne({ userId });
    if (existing) {
      await UserProfile.updateOne({ userId }, { $set: sanitized });
      const updated = await UserProfile.findOne({ userId }).lean();
      // Invalidate memory cache so subsequent chat requests rebuild memory
      try { const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat'); invalidateMemoryCacheForUser(String(userId)); } catch (e) { console.warn('Failed to call invalidateMemoryCacheForUser', e); }
      return res.json({ success: true, data: updated });
    }
    const created = await UserProfile.create({ userId, ...sanitized });
    try { const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat'); invalidateMemoryCacheForUser(String(userId)); } catch (e) { console.warn('Failed to call invalidateMemoryCacheForUser', e); }
    res.json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to create profile" });
  }
});

router.put("/profile", async (req, res) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    console.log("📝 Profile update request:", { userId: userId.toString(), body: req.body });
    // Sanitize and validate updates similar to POST
    const body = req.body || {};
    const errors: Record<string,string> = {};

    if (body.goals !== undefined) {
      if (!Array.isArray(body.goals)) errors.goals = 'goals must be an array of strings';
      else if (body.goals.length > MAX_GOALS) errors.goals = `max ${MAX_GOALS} goals allowed`;
    }
    if (body.challenges !== undefined) {
      if (!Array.isArray(body.challenges)) errors.challenges = 'challenges must be an array of strings';
      else if (body.challenges.length > MAX_CHALLENGES) errors.challenges = `max ${MAX_CHALLENGES} challenges allowed`;
    }
    if (body.bio !== undefined) {
      if (typeof body.bio !== 'string') errors.bio = 'bio must be a string';
      else if (body.bio.trim().length > MAX_BIO_LEN) errors.bio = `bio must be <= ${MAX_BIO_LEN} characters`;
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
    const sanitized: any = {};
    for (const k of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, k)) sanitized[k] = body[k];
    }

    const updateResult = await UserProfile.updateOne(
      { userId }, 
      { $set: sanitized }, 
      { upsert: true }
    );
    console.log("📊 Update result:", updateResult);
    
  const updated = await UserProfile.findOne({ userId }).lean();
  console.log("✅ Updated profile from DB:", updated);
  try { const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat'); invalidateMemoryCacheForUser(String(userId)); } catch (e) { console.warn('Failed to call invalidateMemoryCacheForUser', e); }
  res.json({ success: true, data: updated });
  } catch (error) {
    console.error("❌ Profile update error:", error);
    res.status(500).json({ success: false, error: "Failed to update profile" });
  }
});

// Basic user update (name/email)
router.put("/", async (req, res) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { name, email } = req.body || {};
    const update: Record<string, any> = {};
    if (typeof name === 'string' && name.trim()) update.name = name.trim();
    if (typeof email === 'string' && email.trim()) update.email = email.trim();
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, error: "No changes provided" });
    }
  const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true }).lean();
  try { const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat'); invalidateMemoryCacheForUser(String(userId)); } catch (e) { console.warn('Failed to call invalidateMemoryCacheForUser', e); }
  res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update user" });
  }
});

// Export all user data (GDPR right to data portability)
router.get("/data/export", async (req, res) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    
    // Fetch all user data from backend
    const [user, profile, journalEntries, moods, chatSessions, meditationSessions, thoughtRecords, cbtActivities, communityPosts, favoriteMeditations, weeklyReports] = await Promise.all([
      User.findById(userId).select('-password').lean(),
      UserProfile.findOne({ userId }).lean(),
      JournalEntry.find({ userId }).lean(),
      Mood.find({ userId }).lean(),
      ChatSession.find({ userId }).lean(),
      MeditationSession.find({ userId }).lean(),
      CBTThoughtRecord.find({ userId }).lean(),
      CBTActivity.find({ userId }).lean(),
      CommunityPost.find({ userId }).lean(),
      FavoriteMeditation.find({ userId }).lean(),
      WeeklyReport.find({ userId }).lean(),
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
      chatSessions: (chatSessions || []).map((session: any) => ({
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
      communityPosts: (communityPosts || []).map((post: any) => ({
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
  } catch (error) {
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
    const userId = new Types.ObjectId(req.user._id);
    const { analyticsEnabled, crashReportingEnabled, dataCollectionEnabled } = req.body || {};
    
    const privacyPreferences: any = {};
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
    const existing = await UserProfile.findOne({ userId });
    if (existing) {
      // Update existing privacy preferences
      const currentPreferences = existing.privacyPreferences || {};
      await UserProfile.updateOne(
        { userId },
        { $set: { privacyPreferences: { ...currentPreferences, ...privacyPreferences } } }
      );
    } else {
      // Create profile with privacy preferences
      await UserProfile.create({
        userId,
        privacyPreferences: {
          analyticsEnabled: analyticsEnabled ?? true,
          crashReportingEnabled: crashReportingEnabled ?? true,
          dataCollectionEnabled: dataCollectionEnabled ?? true,
        },
      });
    }
    
    const updated = await UserProfile.findOne({ userId }).lean();
    
    res.json({
      success: true,
      data: {
        privacyPreferences: (updated as any)?.privacyPreferences || {
          analyticsEnabled: analyticsEnabled ?? true,
          crashReportingEnabled: crashReportingEnabled ?? true,
          dataCollectionEnabled: dataCollectionEnabled ?? true,
        },
      },
    });
  } catch (error) {
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
    const userId = new Types.ObjectId(req.user._id);
    
    // Delete all user data from all collections
    const deleteResults = await Promise.all([
      JournalEntry.deleteMany({ userId }),
      Mood.deleteMany({ userId }),
      ChatSession.deleteMany({ userId }),
      MeditationSession.deleteMany({ userId }),
      CBTThoughtRecord.deleteMany({ userId }),
      CBTActivity.deleteMany({ userId }),
      CommunityPost.deleteMany({ userId }),
      FavoriteMeditation.deleteMany({ userId }),
      WeeklyReport.deleteMany({ userId }),
      UserProfile.deleteOne({ userId }),
      Session.deleteMany({ userId }),
      LongTermMemoryModel.deleteMany({ userId }),
    ]);
    
    // Invalidate memory cache
    try {
      const { invalidateMemoryCacheForUser } = require('../controllers/memoryEnhancedChat');
      invalidateMemoryCacheForUser(String(userId));
    } catch (e) {
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
  } catch (error) {
    console.error("Error deleting user data:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete user data",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
