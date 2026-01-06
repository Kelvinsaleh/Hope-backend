import { Request, Response, NextFunction } from "express";
import { Mood } from "../models/Mood";
import { logger } from "../utils/logger";
import { sendMoodUpdateEvent } from "../utils/inngestEvents";

// Create a new mood entry
export const createMood = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { score, mood, note, context, activities } = req.body;
    const userId = req.user?._id; // From auth middleware

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    // Accept either `mood` or `score` (frontend compatibility)
    const finalScore = typeof score === 'number' ? score : (typeof mood === 'number' ? mood : null);
    if (finalScore === null) {
      return res.status(400).json({ success: false, error: 'Mood score is required' });
    }

    // Prevent users from creating more than one mood entry within 12 hours
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const recent = await Mood.findOne({ userId, timestamp: { $gte: twelveHoursAgo } }).lean();
    if (recent) {
      return res.status(429).json({ success: false, error: 'You have already logged mood in the last 12 hours' });
    }

    const moodEntry = new Mood({
      userId,
      score: finalScore,
      note,
      context,
      activities,
      timestamp: new Date(),
    });

  await moodEntry.save();
    logger.info(`Mood entry created for user ${userId}`);

    // Send mood update event to Inngest
    await sendMoodUpdateEvent({
      userId,
      mood: finalScore,
      note,
      context,
      activities,
      timestamp: moodEntry.timestamp,
    });

    res.status(201).json({
      success: true,
      data: moodEntry,
    });
  } catch (error) {
    next(error);
  }
};

// Get mood history
export const getMoodHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const limit = parseInt(req.query.limit as string) || 90;
    const offset = parseInt(req.query.offset as string) || 0;

    const moods = await Mood.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    const total = await Mood.countDocuments({ userId });

    res.json({
      success: true,
      data: moods,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    logger.error("Error fetching mood history:", error);
    next(error);
  }
};

// Get mood statistics
export const getMoodStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const period = (req.query.period as string) || "week";
    let startDate = new Date();

    switch (period) {
      case "week":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case "year":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    const moods = await Mood.find({
      userId,
      timestamp: { $gte: startDate },
    })
      .sort({ timestamp: -1 })
      .lean();

    // Calculate statistics
    const scores = moods.map((m) => m.score);
    const average = scores.length > 0 
      ? scores.reduce((a, b) => a + b, 0) / scores.length 
      : 0;
    
    const min = scores.length > 0 ? Math.min(...scores) : 0;
    const max = scores.length > 0 ? Math.max(...scores) : 0;

    // Calculate trend (simple linear regression)
    let trend = 0;
    if (scores.length >= 2) {
      const firstHalfAvg = scores.slice(0, Math.floor(scores.length / 2))
        .reduce((a, b) => a + b, 0) / Math.floor(scores.length / 2);
      const secondHalfAvg = scores.slice(Math.floor(scores.length / 2))
        .reduce((a, b) => a + b, 0) / (scores.length - Math.floor(scores.length / 2));
      trend = secondHalfAvg - firstHalfAvg;
    }

    res.json({
      success: true,
      data: {
        period,
        average: Math.round(average * 10) / 10,
        min,
        max,
        trend: Math.round(trend * 10) / 10,
        count: moods.length,
        moods: moods.slice(0, 10), // Return last 10 for chart
      },
    });
  } catch (error) {
    logger.error("Error fetching mood stats:", error);
    next(error);
  }
};

// Get recent moods
export const getRecentMoods = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const limit = parseInt(req.query.limit as string) || 10;

    const moods = await Mood.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: moods,
    });
  } catch (error) {
    logger.error("Error fetching recent moods:", error);
    next(error);
  }
};

// Return whether the user should be prompted for a mood check (based on last entry)
export const shouldPromptMood = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const last = await Mood.findOne({ userId }).sort({ timestamp: -1 }).lean();
    const twelveHours = 12 * 60 * 60 * 1000;
    let shouldPrompt = true;
    let lastTimestamp: string | null = null;
    if (last && last.timestamp) {
      lastTimestamp = new Date(last.timestamp).toISOString();
      shouldPrompt = Date.now() - new Date(last.timestamp).getTime() >= twelveHours;
    }

    res.json({ success: true, shouldPrompt, lastTimestamp });
  } catch (error) {
    logger.error('Error in shouldPromptMood:', error);
    next(error);
  }
};