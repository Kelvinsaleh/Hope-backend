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

const EXERCISE_MEDITATIONS = [
  {
    title: "Box Breathing",
    description: "Anxiety and stress relief in a minute or two.",
    durationSeconds: 64,
    category: "Exercises",
    tags: ["breathing", "anxiety", "stress", "calm"],
    script:
      "Let’s do box breathing: inhale for 4… hold for 4… exhale for 4… hold for 4. Repeat 4 rounds. Feel your body relax with each breath.",
  },
  {
    title: "4-7-8 Breathing",
    description: "Wind down for sleep and deep relaxation.",
    durationSeconds: 57,
    category: "Exercises",
    tags: ["breathing", "sleep", "relaxation"],
    script:
      "We’ll do 4-7-8 breathing: inhale 4… hold 7… exhale 8. Let’s repeat 3 times. Imagine tension leaving your body with each exhale.",
  },
  {
    title: "Diaphragmatic Breathing",
    description: "Slow your breathing when panicking or overwhelmed.",
    durationSeconds: 90,
    category: "Exercises",
    tags: ["breathing", "panic", "overwhelm"],
    script:
      "Place one hand on your chest, one on your belly. Breathe in slowly through your nose, feeling your belly rise. Exhale slowly through your mouth. Let’s do this for 5 deep breaths.",
  },
  {
    title: "5-4-3-2-1 Grounding",
    description: "Come back to the present when anxious.",
    durationSeconds: 90,
    category: "Exercises",
    tags: ["grounding", "anxiety", "panic"],
    script:
      "Notice 5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste. Focus fully on each sense, bringing you back to the present.",
  },
  {
    title: "Progressive Muscle Relaxation (Short)",
    description: "Release tension and help your body relax.",
    durationSeconds: 120,
    category: "Exercises",
    tags: ["relaxation", "sleep", "tension"],
    script:
      "Tense your shoulders for 3 seconds… release. Hands… release. Legs… release. Focus on the feeling of letting go. Continue head to toe in a short sweep.",
  },
  {
    title: "Power Posture / Shake",
    description: "Quick energy and mood lift.",
    durationSeconds: 45,
    category: "Exercises",
    tags: ["energy", "mood", "motivation"],
    script:
      "Stand tall, stretch your arms wide, shake your hands and shoulders lightly. Take 3 deep breaths. Notice your energy rising.",
  },
  {
    title: "Single-Sense Focus",
    description: "Settle racing thoughts with one simple focus.",
    durationSeconds: 45,
    category: "Exercises",
    tags: ["mindfulness", "focus", "calm"],
    script:
      "Focus on a single sense for 30 seconds. For example, listen closely to all the sounds around you. Let your mind settle on this one thing.",
  },
  {
    title: "Micro Gratitude Exercise",
    description: "A quick positivity reset.",
    durationSeconds: 30,
    category: "Exercises",
    tags: ["gratitude", "mood", "positivity"],
    script:
      "Take a deep breath. Think of one thing you’re grateful for today. Hold it in your mind for 10 seconds. Let it create warmth inside.",
  },
  {
    title: "Paced Counting Anchor",
    description: "Ground yourself when you feel lost.",
    durationSeconds: 45,
    category: "Exercises",
    tags: ["grounding", "panic", "overwhelm"],
    script:
      "Count slowly down from 20 to 0 while taking steady breaths. Let your mind focus on the numbers and the breath, grounding yourself.",
  },
] as const;

let exercisesSeeded = false;

async function ensureExerciseMeditations() {
  if (exercisesSeeded) return;

  const operations = EXERCISE_MEDITATIONS.map((exercise) => ({
    updateOne: {
      filter: { title: exercise.title },
      update: {
        $set: {
          title: exercise.title,
          description: exercise.description,
          durationSeconds: exercise.durationSeconds,
          duration: Math.max(1, Math.ceil(exercise.durationSeconds / 60)),
          audioUrl: "",
          category: exercise.category,
          isPremium: false,
          tags: exercise.tags,
          script: exercise.script,
          type: "exercise",
        },
      },
      upsert: true,
    },
  }));

  if (operations.length > 0) {
    await Meditation.bulkWrite(operations);
  }

  exercisesSeeded = true;
}

// Get all meditations with search
export const getMeditations = async (req: Request, res: Response) => {
  try {
    console.log("🎵 Meditation fetch request:", req.query);
    
    const { search, category, isPremium, limit = 20, page = 1, type } = req.query;

    await ensureExerciseMeditations();
    
    const filter: any = {};

    // Default to visual exercises only (hide guided meditations)
    if (type) {
      filter.type = type;
    } else {
      filter.$or = [
        { type: "exercise" },
        { type: { $exists: false }, category: "Exercises" }
      ];
    }
    
    // Add search functionality
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search as string, "i")] } }
      ];
    }
    
    if (category) filter.category = category;
    // If client requests premium-only content, ensure they are premium
    if (isPremium !== undefined) {
      const wantPremium = isPremium === 'true';
      if (wantPremium) {
        // Require authenticated user for premium content
        if (!req.user || !req.user._id) {
          return res.status(401).json({ success: false, error: 'Authentication required to access premium content' });
        }
        // Check active subscription
        const { Subscription } = require('../models/Subscription');
        const userId = new Types.ObjectId(req.user._id);
        const activeSub = await Subscription.findOne({ userId, status: 'active', expiresAt: { $gt: new Date() } });
        if (!activeSub) {
          return res.status(403).json({ success: false, error: 'Premium subscription required to access this content' });
        }
        filter.isPremium = true;
      } else {
        filter.isPremium = false;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);
    
    console.log("🔍 Querying MongoDB with filter:", filter);
    
    const meditations = await Meditation.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    console.log("✅ Found meditations:", meditations.length);

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
    console.error("❌ MEDITATION FETCH ERROR:", error);
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
    const {
      title,
      description,
      duration,
      durationSeconds,
      audioUrl,
      category,
      isPremium,
      tags,
      script,
      type,
    } = req.body;

    if (!title || !description || !duration || !category) {
      return res.status(400).json({
        error: "Title, description, duration, and category are required"
      });
    }

    const meditation = new Meditation({
      title,
      description,
      duration,
      durationSeconds,
      audioUrl,
      category,
      isPremium: isPremium || false,
      tags: tags || [],
      script,
      type,
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
    
    const { title, description, duration, category, isPremium, tags } = req.body;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      logger.error("BLOB_READ_WRITE_TOKEN is not set");
      return res.status(500).json({
        success: false,
        error: "Upload service is not configured. Please set BLOB_READ_WRITE_TOKEN."
      });
    }
    
    // Upload to Vercel Blob (modern API)
    const pathname = `meditations/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
    const blob = await put(
      pathname,
      req.file.buffer,
      {
        access: 'public',
        contentType: req.file.mimetype,
        token: process.env.BLOB_READ_WRITE_TOKEN
      }
    );
    
    // Generate automatic headers and subtitles using AI
    const headers = await generateHeaders(title, description, blob.url);
    const subtitles = await generateSubtitles(blob.url, duration);
    
    let parsedTags: string[] = [];
    if (Array.isArray(tags)) {
      parsedTags = tags.map((tag) => String(tag).trim()).filter(Boolean);
    } else if (typeof tags === 'string' && tags.trim().length > 0) {
      try {
        const asJson = JSON.parse(tags);
        if (Array.isArray(asJson)) {
          parsedTags = asJson.map((tag) => String(tag).trim()).filter(Boolean);
        } else {
          parsedTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
        }
      } catch {
        parsedTags = tags.split(',').map((tag) => tag.trim()).filter(Boolean);
      }
    }

    const meditation = new Meditation({
      title: title || "Untitled",
      description: description || "",
      duration: Number(duration) || 0,
      audioUrl: blob.url,
      category: category || "general",
      isPremium: String(isPremium) === 'true',
      tags: parsedTags,
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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

    // Start session - don't mark as completed yet, it will be completed when user finishes
    const session = new MeditationSession({
      userId,
      meditationId: new Types.ObjectId(meditationId),
      duration: meditation.duration,
      listenedDuration: 0,
      listenPercentage: 0,
      counted: false, // Will be set to true when completed if >50% listened
      // Don't set completedAt yet - it will be set when user completes the meditation
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
    const { listenedDuration, rating, notes } = req.body; // listenedDuration in seconds
    const userId = new Types.ObjectId(req.user._id);

    // Find the session and meditation to get total duration
    const session = await MeditationSession.findOne({ _id: sessionId, userId }).populate('meditationId');
    if (!session) {
      return res.status(404).json({
        error: "Meditation session not found"
      });
    }

    const meditation = await Meditation.findById(session.meditationId);
    if (!meditation) {
      return res.status(404).json({
        error: "Meditation not found"
      });
    }

    // Calculate listen percentage and if it counts (>50% listened)
    const totalDurationSeconds = meditation.duration * 60; // Convert minutes to seconds
    const listenedDurationSeconds = listenedDuration || 0;
    const listenPercentage = totalDurationSeconds > 0 
      ? Math.round((listenedDurationSeconds / totalDurationSeconds) * 100) 
      : 0;
    const counted = listenPercentage >= 50; // Only count if >50% listened

    // Update the session with listened duration, percentage, and counted flag
    const updatedSession = await MeditationSession.findOneAndUpdate(
      { _id: sessionId, userId },
      {
        listenedDuration: listenedDurationSeconds,
        listenPercentage,
        counted,
        rating,
        notes,
        completedAt: new Date(),
      },
      { new: true }
    );

    res.json({
      success: true,
      message: "Meditation session completed",
      session: updatedSession,
      counted, // Indicate if this session counts towards free tier limit
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
