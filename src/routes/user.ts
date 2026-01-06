import express from "express";
import { authenticateToken } from "../middleware/auth";
import { Subscription } from "../models/Subscription";
import { Types } from "mongoose";
import { UserProfile } from "../models/UserProfile";
// Validation defaults - can be overridden via env
const MAX_GOALS = Number(process.env.MAX_GOALS) || 10;
const MAX_CHALLENGES = Number(process.env.MAX_CHALLENGES) || 10;
const MAX_PROFILE_STR_LEN = Number(process.env.MAX_PROFILE_STR_LEN) || 200;
const MAX_BIO_LEN = Number(process.env.MAX_BIO_LEN) || 500;
import { User } from "../models/User";

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

export default router;

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
    const existing = await UserProfile.findOne({ userId });
    if (existing) {
      await UserProfile.updateOne({ userId }, { $set: req.body });
      const updated = await UserProfile.findOne({ userId }).lean();
      return res.json({ success: true, data: updated });
    }
    const created = await UserProfile.create({ userId, ...req.body });
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

    const updateResult = await UserProfile.updateOne(
      { userId }, 
      { $set: req.body }, 
      { upsert: true }
    );
    console.log("📊 Update result:", updateResult);
    
    const updated = await UserProfile.findOne({ userId }).lean();
    console.log("✅ Updated profile from DB:", updated);
    
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
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update user" });
  }
});
