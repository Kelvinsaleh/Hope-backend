import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { Subscription } from "../models/Subscription";
import { User } from "../models/User";
import { ChatSession } from "../models/ChatSession";
import { JournalEntry } from "../models/JournalEntry";
import { MeditationSession } from "../models/Meditation";

async function isPremiumUser(userId: Types.ObjectId): Promise<boolean> {
  // Prefer Subscription model if available
  const sub = await Subscription.findOne({
    userId,
    status: "active",
    expiresAt: { $gt: new Date() },
  }).lean();
  if (sub) return true;

  // Fallback to User.subscription field
  const user = await User.findById(userId).lean();
  if (user?.subscription?.isActive && user.subscription.tier === "premium") return true;

  // Check if user has an active trial
  if (user?.trialEndsAt) {
    const now = new Date();
    if (now < new Date(user.trialEndsAt)) {
      return true; // User has an active trial
    }
  }

  return false;
}

// Free tier: 150 messages per month (can use anytime until exhausted)
export async function enforceChatMonthlyLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = new Types.ObjectId(req.user._id);
    if (await isPremiumUser(userId)) return next();

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


