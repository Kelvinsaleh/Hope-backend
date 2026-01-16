import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Subscription } from "../models/Subscription";
import { User } from "../models/User";
import { ChatSession } from "../models/ChatSession";
import { JournalEntry } from "../models/JournalEntry";
import { MeditationSession } from "../models/Meditation";

type AccessTier = "premium" | "trial" | "free";

async function getAccessTier(userId: Types.ObjectId): Promise<AccessTier> {
  const now = new Date();

  // Prefer Subscription model if available
  const sub = await Subscription.findOne({
    userId,
    status: { $in: ["active", "trialing"] },
    expiresAt: { $gt: now },
  }).lean();

  if (sub) {
    if (sub.planId === "trial" || sub.status === "trialing" || sub.trialEndsAt) {
      return "trial";
    }
    return "premium";
  }

  // Fallback to User document
  const user = await User.findById(userId).lean();
  if (user?.trialEndsAt && now < new Date(user.trialEndsAt)) {
    return "trial";
  }
  if (user?.subscription?.isActive && user.subscription.tier === "premium") {
    return "premium";
  }

  return "free";
}

// Free tier: 150 messages per month (can use anytime until exhausted)
export async function enforceChatMonthlyLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const tier = await getAccessTier(userId);
    if (tier === "premium") return next();

    // Trial: daily cap to control high-cost usage during trial
    if (tier === "trial") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const sessions = await ChatSession.aggregate([
        { $match: { userId } },
        { $unwind: "$messages" },
        { $match: { "messages.timestamp": { $gte: startOfDay }, "messages.role": "user" } },
        { $count: "count" },
      ]);

      const DAILY_TRIAL_LIMIT = 50;
      const dailyCount = sessions?.[0]?.count || 0;

      if (dailyCount >= DAILY_TRIAL_LIMIT) {
        return res.status(429).json({
          success: false,
          error: "Daily message limit reached for trial users (50 messages/day). Upgrade to Premium for unlimited messages.",
          limits: { dailyMessages: DAILY_TRIAL_LIMIT, tier: "trial" },
          remaining: 0,
        });
      }

      // If under daily cap, allow without further monthly checks
      return next();
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Count all messages sent by the user this month across all sessions
    const sessions = await ChatSession.aggregate([
      { $match: { userId } },
      { $unwind: "$messages" },
      { $match: { "messages.timestamp": { $gte: startOfMonth }, "messages.role": "user" } },
      { $count: "count" },
    ]);
    const monthlyCount = sessions?.[0]?.count || 0;
    const FREE_MESSAGE_LIMIT_PER_MONTH = 150;
    
    if (monthlyCount >= FREE_MESSAGE_LIMIT_PER_MONTH) {
      return res.status(429).json({
        success: false,
        error: "Monthly message limit reached (150 messages/month). Upgrade to Premium for unlimited messages.",
        limits: { monthlyMessages: FREE_MESSAGE_LIMIT_PER_MONTH },
        remaining: 0,
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to enforce chat limits" });
  }
}

// Legacy name for backward compatibility
export const enforceChatDailyLimit = enforceChatMonthlyLimit;

// Journal entries are now unlimited for free tier (only AI insights and CBT records require premium)
// This middleware is kept for backward compatibility but no longer enforces limits
export async function enforceJournalWeeklyLimit(req: Request, res: Response, next: NextFunction) {
  // Journal entries are unlimited for free tier - no limit enforcement needed
  // Premium checks for AI insights and CBT records are handled in their respective routes/controllers
  return next();
}

// Free tier: 10 meditations per month (only counted if >50% listened)
// Note: This middleware checks completion, but the actual >50% check should be done
// when recording meditation progress in the meditation controller
export async function enforceMeditationMonthlyLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = new Types.ObjectId(req.user._id);
    if (await isPremiumUser(userId)) return next();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Count meditations completed this month (where user listened >50%)
    // Only count sessions where counted=true (which means >50% was listened)
    const count = await MeditationSession.countDocuments({ 
      userId, 
      completedAt: { $gte: startOfMonth },
      counted: true, // Only count meditations where >50% was listened
    });
    
    const FREE_MEDITATION_LIMIT_PER_MONTH = 10;
    if (count >= FREE_MEDITATION_LIMIT_PER_MONTH) {
      return res.status(429).json({
        success: false,
        error: "Monthly meditation limit reached (10 meditations/month). Upgrade to Premium for unlimited meditations.",
        limits: { monthlyMeditations: FREE_MEDITATION_LIMIT_PER_MONTH },
        remaining: 0,
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to enforce meditation limits" });
  }
}

// Legacy name for backward compatibility
export const enforceMeditationWeeklyLimit = enforceMeditationMonthlyLimit;


