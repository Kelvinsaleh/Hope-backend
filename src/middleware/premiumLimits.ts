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
    endDate: { $gt: new Date() },
  }).lean();
  if (sub) return true;

  // Fallback to User.subscription field
  const user = await User.findById(userId).lean();
  if (user?.subscription?.isActive && user.subscription.tier === "premium") return true;

  return false;
}

export async function enforceChatDailyLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = new Types.ObjectId(req.user._id);
    if (await isPremiumUser(userId)) return next();

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Count all messages sent by the user today across all sessions
    const sessions = await ChatSession.aggregate([
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
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to enforce chat limits" });
  }
}

export async function enforceJournalWeeklyLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = new Types.ObjectId(req.user._id);
    if (await isPremiumUser(userId)) return next();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const count = await JournalEntry.countDocuments({ userId, createdAt: { $gte: sevenDaysAgo } });
    if (count >= 3) {
      return res.status(429).json({
        success: false,
        error: "Weekly journal limit reached for free plan. Upgrade to Premium for more entries.",
        limits: { weeklyJournals: 3 },
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to enforce journal limits" });
  }
}

export async function enforceMeditationWeeklyLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = new Types.ObjectId(req.user._id);
    if (await isPremiumUser(userId)) return next();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const count = await MeditationSession.countDocuments({ userId, completedAt: { $gte: sevenDaysAgo } });
    if (count >= 10) {
      return res.status(429).json({
        success: false,
        error: "Weekly meditation limit reached for free plan. Upgrade to Premium for unlimited listening.",
        limits: { weeklyMeditations: 10 },
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to enforce meditation limits" });
  }
}


