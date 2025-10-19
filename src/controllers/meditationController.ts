import { Request, Response } from "express";
import { Meditation, MeditationSession } from "../models/Meditation";
import { FavoriteMeditation } from "../models/FavoriteMeditation";
import { Types } from "mongoose";
import { logger } from "../utils/logger";
import { put } from '@vercel/blob';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || "AIzaSyCCRSas8dVBP3ye4ZY5RBPsYqw7m_2jro8"
);

// Get all meditations with search
export const getMeditations = async (req: Request, res: Response) => {
  try {
    const { search, category, isPremium, limit = 20, page = 1 } = req.query;
    
    const filter: any = {};
    
    // Add search functionality
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search as string, "i")] } }
      ];
    }
    
    if (category) filter.category = category;
    if (isPremium !== undefined) filter.isPremium = isPremium === 'true';

    const skip = (Number(page) - 1) * Number(limit);
    
    const meditations = await Meditation.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await Meditation.countDocuments(filter);

    res.json({
      success: true,
      meditations,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalMeditations: total,
        hasNextPage: skip + Number(limit) < total,
        hasPrevPage: Number(page) > 1,
      },
    });
  } catch (error) {
    logger.error("Error fetching meditations:", error);
    res.status(500).json({
      error: "Failed to fetch meditations",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get meditation sessions (fix the route conflict)
export const getMeditationSessions = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { page = 1, limit = 10 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const sessions = await MeditationSession.find({ userId })
      .populate('meditationId')
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await MeditationSession.countDocuments({ userId });

    res.json({
      success: true,
      sessions,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalSessions: total,
        hasNextPage: skip + Number(limit) < total,
        hasPrevPage: Number(page) > 1,
      },
    });
  } catch (error) {
    logger.error("Error fetching meditation sessions:", error);
    res.status(500).json({
      error: "Failed to fetch meditation sessions",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get a specific meditation
export const getMeditation = async (req: Request, res: Response) => {
  try {
    const { meditationId } = req.params;
    
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(meditationId)) {
      return res.status(400).json({
        error: "Invalid meditation ID format"
      });
    }
    
    const meditation = await Meditation.findById(meditationId);
    
    if (!meditation) {
      return res.status(404).json({
        error: "Meditation not found"
      });
    }

    res.json({
      success: true,
      meditation,
    });
  } catch (error) {
    logger.error("Error fetching meditation:", error);
    res.status(500).json({
      error: "Failed to fetch meditation",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Create a new meditation
export const createMeditation = async (req: Request, res: Response) => {
  try {
    const { title, description, duration, audioUrl, category, isPremium, tags } = req.body;

    if (!title || !description || !duration || !category) {
      return res.status(400).json({
        error: "Title, description, duration, and category are required"
      });
    }

    const meditation = new Meditation({
      title,
      description,
      duration,
      audioUrl,
      category,
      isPremium: isPremium || false,
      tags: tags || [],
    });

    await meditation.save();

    res.status(201).json({
      success: true,
      message: "Meditation created successfully",
      meditation,
    });
  } catch (error) {
    logger.error("Error creating meditation:", error);
    res.status(500).json({
      error: "Failed to create meditation",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Upload meditation file with automatic processing
export const uploadMeditation = async (req: Request, res: Response) => {
  try {
    console.log("Upload meditation request received");
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: "No file uploaded" 
      });
    }
    
    const { title, description, duration, category } = req.body;
    
    // Upload to Vercel Blob
    const blob = await put(req.file.filename, req.file.buffer, {
      access: 'public',
      contentType: req.file.mimetype,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    
    // Generate automatic headers and subtitles using AI
    const headers = await generateHeaders(title, description, blob.url);
    const subtitles = await generateSubtitles(blob.url, duration);
    
    const meditation = new Meditation({
      title: title || "Untitled",
      description: description || "",
      duration: duration || 0,
      audioUrl: blob.url,
      category: category || "general",
      isPremium: false,
      tags: [],
      headers: headers,
      subtitles: subtitles,
      uploadedAt: new Date()
    });
    
    await meditation.save();
    
    res.json({ 
      success: true, 
      message: "Meditation uploaded successfully with automatic processing",
      meditation: meditation 
    });
    
  } catch (error) {
    console.error("Meditation upload error:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to upload meditation" 
    });
  }
};

// Generate automatic headers using AI
const generateHeaders = async (title: string, description: string, audioUrl: string) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `Generate 5-7 section headers for a meditation titled "${title}" with description "${description}". 
    Return as JSON array: ["Header 1", "Header 2", ...]`;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    return JSON.parse(response);
  } catch (error) {
    console.error("Error generating headers:", error);
    return ["Introduction", "Breathing", "Body Scan", "Visualization", "Conclusion"];
  }
};

// Generate automatic subtitles using AI
const generateSubtitles = async (audioUrl: string, duration: number) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = `Generate subtitles for a ${duration}-minute meditation. 
    Return as JSON array of objects: [{"time": "00:00", "text": "Welcome to this meditation"}, ...]`;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    return JSON.parse(response);
  } catch (error) {
    console.error("Error generating subtitles:", error);
    return [
      {"time": "00:00", "text": "Welcome to this meditation"},
      {"time": "01:00", "text": "Find a comfortable position"},
      {"time": "02:00", "text": "Close your eyes and breathe naturally"}
    ];
  }
};

// Start a meditation session
export const startMeditationSession = async (req: Request, res: Response) => {
  try {
    const { meditationId } = req.body;
    const userId = new Types.ObjectId(req.user._id);

    if (!meditationId) {
      return res.status(400).json({
        error: "Meditation ID is required"
      });
    }

    // Check if meditation exists
    const meditation = await Meditation.findById(meditationId);
    if (!meditation) {
      return res.status(404).json({
        error: "Meditation not found"
      });
    }

    const session = new MeditationSession({
      userId,
      meditationId: new Types.ObjectId(meditationId),
      completedAt: new Date(),
      duration: meditation.duration,
    });

    await session.save();

    res.status(201).json({
      success: true,
      message: "Meditation session started",
      session,
    });
  } catch (error) {
    logger.error("Error starting meditation session:", error);
    res.status(500).json({
      error: "Failed to start meditation session",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Complete a meditation session
export const completeMeditationSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { actualDuration, rating, notes } = req.body;
    const userId = new Types.ObjectId(req.user._id);

    const session = await MeditationSession.findOneAndUpdate(
      { _id: sessionId, userId },
      {
        actualDuration: actualDuration || 0,
        rating,
        notes,
        completedAt: new Date(),
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({
        error: "Meditation session not found"
      });
    }

    res.json({
      success: true,
      message: "Meditation session completed",
      session,
    });
  } catch (error) {
    logger.error("Error completing meditation session:", error);
    res.status(500).json({
      error: "Failed to complete meditation session",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get user's meditation history
export const getMeditationHistory = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { page = 1, limit = 10 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const sessions = await MeditationSession.find({ userId })
      .populate('meditationId')
      .sort({ completedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await MeditationSession.countDocuments({ userId });

    res.json({
      success: true,
      sessions,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalSessions: total,
        hasNextPage: skip + Number(limit) < total,
        hasPrevPage: Number(page) > 1,
      },
    });
  } catch (error) {
    logger.error("Error fetching meditation history:", error);
    res.status(500).json({
      error: "Failed to fetch meditation history",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get meditation analytics
export const getMeditationAnalytics = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(period));

    // Get meditation frequency
    const frequency = await MeditationSession.aggregate([
      {
        $match: {
          userId,
          completedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$completedAt" },
            month: { $month: "$completedAt" },
            day: { $dayOfMonth: "$completedAt" },
          },
          count: { $sum: 1 },
          totalDuration: { $sum: "$actualDuration" },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // Get category preferences
    const categoryStats = await MeditationSession.aggregate([
      {
        $match: {
          userId,
          completedAt: { $gte: startDate },
        },
      },
      {
        $lookup: {
          from: "meditations",
          localField: "meditationId",
          foreignField: "_id",
          as: "meditation",
        },
      },
      { $unwind: "$meditation" },
      {
        $group: {
          _id: "$meditation.category",
          count: { $sum: 1 },
          avgRating: { $avg: "$rating" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Get average session duration
    const durationStats = await MeditationSession.aggregate([
      {
        $match: {
          userId,
          completedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: "$actualDuration" },
          totalSessions: { $sum: 1 },
          totalDuration: { $sum: "$actualDuration" },
        },
      },
    ]);

    res.json({
      success: true,
      analytics: {
        frequency,
        categoryStats,
        durationStats: durationStats[0] || { avgDuration: 0, totalSessions: 0, totalDuration: 0 },
        period: Number(period),
      },
    });
  } catch (error) {
    logger.error("Error fetching meditation analytics:", error);
    res.status(500).json({
      error: "Failed to fetch meditation analytics",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update meditation (admin only)
export const updateMeditation = async (req: Request, res: Response) => {
  try {
    const { meditationId } = req.params;
    const updates = req.body;

    if (!Types.ObjectId.isValid(meditationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid meditation ID"
      });
    }

    const meditation = await Meditation.findByIdAndUpdate(
      meditationId,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!meditation) {
      return res.status(404).json({
        success: false,
        error: "Meditation not found"
      });
    }

    res.json({
      success: true,
      meditation,
      message: "Meditation updated successfully"
    });
  } catch (error) {
    logger.error("Error updating meditation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update meditation",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Delete meditation (admin only)
export const deleteMeditation = async (req: Request, res: Response) => {
  try {
    const { meditationId } = req.params;

    if (!Types.ObjectId.isValid(meditationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid meditation ID"
      });
    }

    const meditation = await Meditation.findByIdAndDelete(meditationId);

    if (!meditation) {
      return res.status(404).json({
        success: false,
        error: "Meditation not found"
      });
    }

    // Also delete related meditation sessions
    await MeditationSession.deleteMany({ meditationId: new Types.ObjectId(meditationId) });

    res.json({
      success: true,
      message: "Meditation and related sessions deleted successfully"
    });
  } catch (error) {
    logger.error("Error deleting meditation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete meditation",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Add meditation to favorites
export const addToFavorites = async (req: Request, res: Response) => {
  try {
    const { meditationId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    if (!Types.ObjectId.isValid(meditationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid meditation ID"
      });
    }

    // Check if meditation exists
    const meditation = await Meditation.findById(meditationId);
    if (!meditation) {
      return res.status(404).json({
        success: false,
        error: "Meditation not found"
      });
    }

    // Check if already favorited
    const existingFavorite = await FavoriteMeditation.findOne({
      userId,
      meditationId: new Types.ObjectId(meditationId)
    });

    if (existingFavorite) {
      return res.status(400).json({
        success: false,
        error: "Meditation is already in favorites"
      });
    }

    // Add to favorites
    const favorite = new FavoriteMeditation({
      userId,
      meditationId: new Types.ObjectId(meditationId)
    });

    await favorite.save();

    res.status(201).json({
      success: true,
      message: "Meditation added to favorites",
      favorite
    });
  } catch (error) {
    logger.error("Error adding meditation to favorites:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add meditation to favorites",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Remove meditation from favorites
export const removeFromFavorites = async (req: Request, res: Response) => {
  try {
    const { meditationId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    if (!Types.ObjectId.isValid(meditationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid meditation ID"
      });
    }

    const favorite = await FavoriteMeditation.findOneAndDelete({
      userId,
      meditationId: new Types.ObjectId(meditationId)
    });

    if (!favorite) {
      return res.status(404).json({
        success: false,
        error: "Meditation not found in favorites"
      });
    }

    res.json({
      success: true,
      message: "Meditation removed from favorites"
    });
  } catch (error) {
    logger.error("Error removing meditation from favorites:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove meditation from favorites",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Get user's favorite meditations
export const getFavoriteMeditations = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const favorites = await FavoriteMeditation.find({ userId })
      .populate('meditationId')
      .sort({ favoritedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await FavoriteMeditation.countDocuments({ userId });

    // Filter out any favorites where meditation was deleted
    const validFavorites = favorites.filter(fav => fav.meditationId);

    res.json({
      success: true,
      favorites: validFavorites,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalFavorites: total,
        hasNextPage: skip + Number(limit) < total,
        hasPrevPage: Number(page) > 1,
      },
    });
  } catch (error) {
    logger.error("Error fetching favorite meditations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch favorite meditations",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

// Check if meditation is favorited by user
export const checkFavoriteStatus = async (req: Request, res: Response) => {
  try {
    const { meditationId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    if (!Types.ObjectId.isValid(meditationId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid meditation ID"
      });
    }

    const favorite = await FavoriteMeditation.findOne({
      userId,
      meditationId: new Types.ObjectId(meditationId)
    });

    res.json({
      success: true,
      isFavorited: !!favorite,
      favoritedAt: favorite?.favoritedAt || null
    });
  } catch (error) {
    logger.error("Error checking favorite status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check favorite status",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
