"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFavoriteStatus = exports.getFavoriteMeditations = exports.removeFromFavorites = exports.addToFavorites = exports.deleteMeditation = exports.updateMeditation = exports.getMeditationAnalytics = exports.getMeditationHistory = exports.completeMeditationSession = exports.startMeditationSession = exports.uploadMeditation = exports.createMeditation = exports.getMeditation = exports.getMeditationSessions = exports.getMeditations = void 0;
const Meditation_1 = require("../models/Meditation");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
const blob_1 = require("@vercel/blob");
const generative_ai_1 = require("@google/generative-ai");
// Initialize Gemini API
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyCCRSas8dVBP3ye4ZY5RBPsYqw7m_2jro8");
// Get all meditations with search
const getMeditations = async (req, res) => {
    try {
        const { search, category, isPremium, limit = 20, page = 1 } = req.query;
        const filter = {};
        // Add search functionality
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { tags: { $in: [new RegExp(search, "i")] } }
            ];
        }
        if (category)
            filter.category = category;
        if (isPremium !== undefined)
            filter.isPremium = isPremium === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const meditations = await Meditation_1.Meditation.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean();
        const total = await Meditation_1.Meditation.countDocuments(filter);
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
    }
    catch (error) {
        logger_1.logger.error("Error fetching meditations:", error);
        res.status(500).json({
            error: "Failed to fetch meditations",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getMeditations = getMeditations;
// Get meditation sessions (fix the route conflict)
const getMeditationSessions = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const sessions = await Meditation_1.MeditationSession.find({ userId })
            .populate('meditationId')
            .sort({ completedAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean();
        const total = await Meditation_1.MeditationSession.countDocuments({ userId });
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
    }
    catch (error) {
        logger_1.logger.error("Error fetching meditation sessions:", error);
        res.status(500).json({
            error: "Failed to fetch meditation sessions",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getMeditationSessions = getMeditationSessions;
// Get a specific meditation
const getMeditation = async (req, res) => {
    try {
        const { meditationId } = req.params;
        // Validate ObjectId format
        if (!mongoose_1.Types.ObjectId.isValid(meditationId)) {
            return res.status(400).json({
                error: "Invalid meditation ID format"
            });
        }
        const meditation = await Meditation_1.Meditation.findById(meditationId);
        if (!meditation) {
            return res.status(404).json({
                error: "Meditation not found"
            });
        }
        res.json({
            success: true,
            meditation,
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching meditation:", error);
        res.status(500).json({
            error: "Failed to fetch meditation",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getMeditation = getMeditation;
// Create a new meditation
const createMeditation = async (req, res) => {
    try {
        const { title, description, duration, audioUrl, category, isPremium, tags } = req.body;
        if (!title || !description || !duration || !category) {
            return res.status(400).json({
                error: "Title, description, duration, and category are required"
            });
        }
        const meditation = new Meditation_1.Meditation({
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
    }
    catch (error) {
        logger_1.logger.error("Error creating meditation:", error);
        res.status(500).json({
            error: "Failed to create meditation",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.createMeditation = createMeditation;
// Upload meditation file with automatic processing
const uploadMeditation = async (req, res) => {
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
        const blob = await (0, blob_1.put)(req.file.filename, req.file.buffer, {
            access: 'public',
            contentType: req.file.mimetype,
            token: process.env.BLOB_READ_WRITE_TOKEN
        });
        // Generate automatic headers and subtitles using AI
        const headers = await generateHeaders(title, description, blob.url);
        const subtitles = await generateSubtitles(blob.url, duration);
        const meditation = new Meditation_1.Meditation({
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
    }
    catch (error) {
        console.error("Meditation upload error:", error);
        res.status(500).json({
            success: false,
            error: "Failed to upload meditation"
        });
    }
};
exports.uploadMeditation = uploadMeditation;
// Generate automatic headers using AI
const generateHeaders = async (title, description, audioUrl) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const prompt = `Generate 5-7 section headers for a meditation titled "${title}" with description "${description}". 
    Return as JSON array: ["Header 1", "Header 2", ...]`;
        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();
        return JSON.parse(response);
    }
    catch (error) {
        console.error("Error generating headers:", error);
        return ["Introduction", "Breathing", "Body Scan", "Visualization", "Conclusion"];
    }
};
// Generate automatic subtitles using AI
const generateSubtitles = async (audioUrl, duration) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const prompt = `Generate subtitles for a ${duration}-minute meditation. 
    Return as JSON array of objects: [{"time": "00:00", "text": "Welcome to this meditation"}, ...]`;
        const result = await model.generateContent(prompt);
        const response = result.response.text().trim();
        return JSON.parse(response);
    }
    catch (error) {
        console.error("Error generating subtitles:", error);
        return [
            { "time": "00:00", "text": "Welcome to this meditation" },
            { "time": "01:00", "text": "Find a comfortable position" },
            { "time": "02:00", "text": "Close your eyes and breathe naturally" }
        ];
    }
};
// Start a meditation session
const startMeditationSession = async (req, res) => {
    try {
        const { meditationId } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        if (!meditationId) {
            return res.status(400).json({
                error: "Meditation ID is required"
            });
        }
        // Check if meditation exists
        const meditation = await Meditation_1.Meditation.findById(meditationId);
        if (!meditation) {
            return res.status(404).json({
                error: "Meditation not found"
            });
        }
        const session = new Meditation_1.MeditationSession({
            userId,
            meditationId: new mongoose_1.Types.ObjectId(meditationId),
            completedAt: new Date(),
            duration: meditation.duration,
        });
        await session.save();
        res.status(201).json({
            success: true,
            message: "Meditation session started",
            session,
        });
    }
    catch (error) {
        logger_1.logger.error("Error starting meditation session:", error);
        res.status(500).json({
            error: "Failed to start meditation session",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.startMeditationSession = startMeditationSession;
// Complete a meditation session
const completeMeditationSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { actualDuration, rating, notes } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const session = await Meditation_1.MeditationSession.findOneAndUpdate({ _id: sessionId, userId }, {
            actualDuration: actualDuration || 0,
            rating,
            notes,
            completedAt: new Date(),
        }, { new: true });
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
    }
    catch (error) {
        logger_1.logger.error("Error completing meditation session:", error);
        res.status(500).json({
            error: "Failed to complete meditation session",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.completeMeditationSession = completeMeditationSession;
// Get user's meditation history
const getMeditationHistory = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const sessions = await Meditation_1.MeditationSession.find({ userId })
            .populate('meditationId')
            .sort({ completedAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean();
        const total = await Meditation_1.MeditationSession.countDocuments({ userId });
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
    }
    catch (error) {
        logger_1.logger.error("Error fetching meditation history:", error);
        res.status(500).json({
            error: "Failed to fetch meditation history",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getMeditationHistory = getMeditationHistory;
// Get meditation analytics
const getMeditationAnalytics = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { period = '30' } = req.query; // days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - Number(period));
        // Get meditation frequency
        const frequency = await Meditation_1.MeditationSession.aggregate([
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
        const categoryStats = await Meditation_1.MeditationSession.aggregate([
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
        const durationStats = await Meditation_1.MeditationSession.aggregate([
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
    }
    catch (error) {
        logger_1.logger.error("Error fetching meditation analytics:", error);
        res.status(500).json({
            error: "Failed to fetch meditation analytics",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getMeditationAnalytics = getMeditationAnalytics;
// Update meditation (admin only)
const updateMeditation = async (req, res) => {
    try {
        const { meditationId } = req.params;
        const updates = req.body;
        if (!mongoose_1.Types.ObjectId.isValid(meditationId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid meditation ID"
            });
        }
        const meditation = await Meditation_1.Meditation.findByIdAndUpdate(meditationId, { ...updates, updatedAt: new Date() }, { new: true, runValidators: true });
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
    }
    catch (error) {
        logger_1.logger.error("Error updating meditation:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update meditation",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};
exports.updateMeditation = updateMeditation;
// Delete meditation (admin only)
const deleteMeditation = async (req, res) => {
    try {
        const { meditationId } = req.params;
        if (!mongoose_1.Types.ObjectId.isValid(meditationId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid meditation ID"
            });
        }
        const meditation = await Meditation_1.Meditation.findByIdAndDelete(meditationId);
        if (!meditation) {
            return res.status(404).json({
                success: false,
                error: "Meditation not found"
            });
        }
        // Also delete related meditation sessions
        await Meditation_1.MeditationSession.deleteMany({ meditationId: new mongoose_1.Types.ObjectId(meditationId) });
        res.json({
            success: true,
            message: "Meditation and related sessions deleted successfully"
        });
    }
    catch (error) {
        logger_1.logger.error("Error deleting meditation:", error);
        res.status(500).json({
            success: false,
            error: "Failed to delete meditation",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

// Add meditation to favorites
const addToFavorites = async (req, res) => {
    try {
        const { meditationId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        if (!mongoose_1.Types.ObjectId.isValid(meditationId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid meditation ID"
            });
        }
        // Check if already favorited
        const existingFavorite = await Meditation_1.FavoriteMeditation.findOne({
            userId,
            meditationId: new mongoose_1.Types.ObjectId(meditationId)
        });
        if (existingFavorite) {
            return res.status(400).json({
                success: false,
                error: "Meditation already in favorites"
            });
        }
        // Add to favorites
        const favorite = new Meditation_1.FavoriteMeditation({
            userId,
            meditationId: new mongoose_1.Types.ObjectId(meditationId)
        });
        await favorite.save();
        res.json({
            success: true,
            message: "Meditation added to favorites",
            favorite
        });
    }
    catch (error) {
        logger_1.logger.error("Error adding to favorites:", error);
        res.status(500).json({
            success: false,
            error: "Failed to add to favorites",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

// Remove meditation from favorites
const removeFromFavorites = async (req, res) => {
    try {
        const { meditationId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        if (!mongoose_1.Types.ObjectId.isValid(meditationId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid meditation ID"
            });
        }
        const result = await Meditation_1.FavoriteMeditation.findOneAndDelete({
            userId,
            meditationId: new mongoose_1.Types.ObjectId(meditationId)
        });
        if (!result) {
            return res.status(404).json({
                success: false,
                error: "Meditation not found in favorites"
            });
        }
        res.json({
            success: true,
            message: "Meditation removed from favorites"
        });
    }
    catch (error) {
        logger_1.logger.error("Error removing from favorites:", error);
        res.status(500).json({
            success: false,
            error: "Failed to remove from favorites",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

// Get user's favorite meditations
const getFavoriteMeditations = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const favorites = await Meditation_1.FavoriteMeditation.find({ userId })
            .populate('meditationId')
            .sort({ favoritedAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean();
        const total = await Meditation_1.FavoriteMeditation.countDocuments({ userId });
        res.json({
            success: true,
            favorites,
            pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(total / Number(limit)),
                totalFavorites: total,
                hasNextPage: skip + Number(limit) < total,
                hasPrevPage: Number(page) > 1
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Error getting favorite meditations:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get favorite meditations",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

// Check if meditation is favorited by user
const checkFavoriteStatus = async (req, res) => {
    try {
        const { meditationId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        if (!mongoose_1.Types.ObjectId.isValid(meditationId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid meditation ID"
            });
        }
        const favorite = await Meditation_1.FavoriteMeditation.findOne({
            userId,
            meditationId: new mongoose_1.Types.ObjectId(meditationId)
        });
        res.json({
            success: true,
            isFavorited: !!favorite,
            favorite
        });
    }
    catch (error) {
        logger_1.logger.error("Error checking favorite status:", error);
        res.status(500).json({
            success: false,
            error: "Failed to check favorite status",
            details: error instanceof Error ? error.message : "Unknown error"
        });
    }
};

exports.deleteMeditation = deleteMeditation;
exports.addToFavorites = addToFavorites;
exports.removeFromFavorites = removeFromFavorites;
exports.getFavoriteMeditations = getFavoriteMeditations;
exports.checkFavoriteStatus = checkFavoriteStatus;
