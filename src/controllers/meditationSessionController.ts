import { Request, Response, NextFunction } from "express";
import { MeditationSession } from "../models/MeditationSession";
import { Meditation } from "../models/Meditation";
import { logger } from "../utils/logger";
import mongoose from "mongoose";

// Create a new meditation session
export const createMeditationSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { meditationId, duration, feedback, context } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!meditationId || !duration) {
      return res.status(400).json({
        message: "Meditation ID and duration are required",
      });
    }

    // Verify meditation exists
    const meditation = await Meditation.findById(meditationId);
    if (!meditation) {
      return res.status(404).json({
        message: "Meditation not found",
      });
    }

    const session = new MeditationSession({
      userId,
      meditationId,
      duration,
      feedback,
      context,
      completedAt: new Date(),
    });

    await session.save();
    logger.info(`Meditation session created for user ${userId}`);

    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error) {
    logger.error("Error creating meditation session:", error);
    next(error);
  }
};

// Get meditation sessions for user
export const getMeditationSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const meditationId = req.query.meditationId as string;

    const query: any = { userId };
    if (meditationId) {
      query.meditationId = meditationId;
    }

    const sessions = await MeditationSession.find(query)
      .populate("meditationId", "title duration category")
      .sort({ completedAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    const total = await MeditationSession.countDocuments(query);

    res.json({
      success: true,
      data: sessions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    logger.error("Error fetching meditation sessions:", error);
    next(error);
  }
};

// Get specific meditation session
export const getMeditationSessionById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;
    const { sessionId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const session = await MeditationSession.findOne({
      _id: sessionId,
      userId,
    }).populate("meditationId");

    if (!session) {
      return res.status(404).json({
        message: "Meditation session not found",
      });
    }

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    logger.error("Error fetching meditation session:", error);
    next(error);
  }
};

// Get meditation statistics
export const getMeditationStats = async (
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

    const sessions = await MeditationSession.find({
      userId,
      completedAt: { $gte: startDate },
    }).lean();

    // Calculate statistics
    const totalSessions = sessions.length;
    const totalDuration = sessions.reduce((sum, s) => sum + s.duration, 0);
    const averageDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;

    // Get ratings
    const ratingsData = sessions
      .filter((s) => s.feedback?.rating)
      .map((s) => s.feedback!.rating!);
    
    const averageRating = ratingsData.length > 0
      ? ratingsData.reduce((a, b) => a + b, 0) / ratingsData.length
      : 0;

    // Get most used meditation
    const meditationCounts = sessions.reduce((acc: any, session) => {
      const id = session.meditationId.toString();
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {});

    const mostUsedMeditationId = Object.entries(meditationCounts)
      .sort(([, a]: any, [, b]: any) => b - a)[0]?.[0];

    let mostUsedMeditation = null;
    if (mostUsedMeditationId) {
      mostUsedMeditation = await Meditation.findById(mostUsedMeditationId)
        .select("title category")
        .lean();
    }

    res.json({
      success: true,
      data: {
        period,
        totalSessions,
        totalDuration: Math.round(totalDuration),
        averageDuration: Math.round(averageDuration),
        averageRating: Math.round(averageRating * 10) / 10,
        mostUsedMeditation,
        recentSessions: sessions.slice(0, 5),
      },
    });
  } catch (error) {
    logger.error("Error fetching meditation stats:", error);
    next(error);
  }
};

