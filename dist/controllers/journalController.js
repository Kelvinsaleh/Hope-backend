"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJournalAnalytics = exports.deleteJournalEntry = exports.updateJournalEntry = exports.getJournalEntry = exports.getJournalEntries = exports.createJournalEntry = void 0;
const JournalEntry_1 = require("../models/JournalEntry");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
const generative_ai_1 = require("@google/generative-ai");
// Initialize Gemini API - optional
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
if (!GEMINI_API_KEY) {
    logger_1.logger.warn('GEMINI_API_KEY not set. Journal AI insights will use fallback generator.');
}
const genAI = GEMINI_API_KEY ? new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY) : null;
// Create a new journal entry
const createJournalEntry = async (req, res) => {
    try {
        const { title, content, mood, tags, isPrivate, insights, emotionalState, keyThemes, concerns, achievements } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        if (!title || !content || !mood) {
            return res.status(400).json({
                error: "Title, content, and mood are required"
            });
        }
        // If client didn't supply insights/emotionalState, try to generate AI insights (Gemini) and fallback to deterministic
        let computedInsights = Array.isArray(insights) && insights.length > 0 ? insights : [];
        try {
            if (computedInsights.length === 0) {
                computedInsights = genAI ? await generateAIInsights(content, mood) : generateFallbackInsights(content, mood);
            }
        }
        catch (e) {
            logger_1.logger.warn('AI insight generation failed, using fallback:', e);
            if (computedInsights.length === 0)
                computedInsights = generateFallbackInsights(content, mood);
        }
        const computedEmotionalState = emotionalState || computeEmotionalState(content, mood);
        const journalEntry = new JournalEntry_1.JournalEntry({
            userId,
            title,
            content,
            mood,
            tags: tags || [],
            isPrivate: isPrivate !== undefined ? isPrivate : true,
            insights: computedInsights,
            emotionalState: computedEmotionalState,
            keyThemes: keyThemes || extractKeyThemes(content),
            concerns: concerns || extractConcerns(content),
            achievements: achievements || extractAchievements(content),
        });
        await journalEntry.save();
        res.status(201).json({
            success: true,
            message: "Journal entry created successfully",
            entry: journalEntry,
        });
    }
    catch (error) {
        logger_1.logger.error("Error creating journal entry:", error);
        res.status(500).json({
            error: "Failed to create journal entry",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.createJournalEntry = createJournalEntry;
// Get all journal entries for a user
const getJournalEntries = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        const entries = await JournalEntry_1.JournalEntry.find({ userId })
            .sort(sortOptions)
            .skip(skip)
            .limit(Number(limit))
            .lean();
        const total = await JournalEntry_1.JournalEntry.countDocuments({ userId });
        res.json({
            success: true,
            entries,
            pagination: {
                currentPage: Number(page),
                totalPages: Math.ceil(total / Number(limit)),
                totalEntries: total,
                hasNextPage: skip + Number(limit) < total,
                hasPrevPage: Number(page) > 1,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching journal entries:", error);
        res.status(500).json({
            error: "Failed to fetch journal entries",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getJournalEntries = getJournalEntries;
// Get a specific journal entry
const getJournalEntry = async (req, res) => {
    try {
        const { entryId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const entry = await JournalEntry_1.JournalEntry.findOne({
            _id: entryId,
            userId,
        });
        if (!entry) {
            return res.status(404).json({
                error: "Journal entry not found"
            });
        }
        res.json({
            success: true,
            entry,
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching journal entry:", error);
        res.status(500).json({
            error: "Failed to fetch journal entry",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getJournalEntry = getJournalEntry;
// Update a journal entry
const updateJournalEntry = async (req, res) => {
    try {
        const { entryId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const { title, content, mood, tags, isPrivate, insights, emotionalState, keyThemes, concerns, achievements } = req.body;
        // Load existing entry first so we can detect changes and compute insights when needed
        const existing = await JournalEntry_1.JournalEntry.findOne({ _id: entryId, userId });
        if (!existing) {
            return res.status(404).json({ error: 'Journal entry not found' });
        }
        const newContent = typeof content === 'string' ? content : existing.content;
        const newMood = typeof mood === 'number' ? mood : existing.mood;
        // Determine computed insights: prefer client-supplied; otherwise generate when content/mood changed or entry had none
        let computedInsights = Array.isArray(insights) && insights.length > 0 ? insights : [];
        try {
            const needsGeneration = computedInsights.length === 0 && (newContent !== existing.content || newMood !== existing.mood || (existing.insights || []).length === 0);
            if (needsGeneration) {
                computedInsights = genAI ? await generateAIInsights(newContent, newMood) : generateFallbackInsights(newContent, newMood);
            }
        }
        catch (e) {
            logger_1.logger.warn('AI insight generation failed on update, using fallback:', e);
            if (computedInsights.length === 0)
                computedInsights = generateFallbackInsights(newContent, newMood);
        }
        const computedEmotionalState = emotionalState || computeEmotionalState(newContent, newMood);
        const computedKeyThemes = Array.isArray(keyThemes) && keyThemes.length > 0 ? keyThemes : extractKeyThemes(newContent);
        const computedConcerns = Array.isArray(concerns) && concerns.length > 0 ? concerns : extractConcerns(newContent);
        const computedAchievements = Array.isArray(achievements) && achievements.length > 0 ? achievements : extractAchievements(newContent);
        const entry = await JournalEntry_1.JournalEntry.findOneAndUpdate({ _id: entryId, userId }, {
            title: title !== undefined ? title : existing.title,
            content: newContent,
            mood: newMood,
            tags: tags || existing.tags || [],
            isPrivate: isPrivate !== undefined ? isPrivate : existing.isPrivate,
            insights: computedInsights,
            emotionalState: computedEmotionalState,
            keyThemes: computedKeyThemes,
            concerns: computedConcerns,
            achievements: computedAchievements,
        }, { new: true, runValidators: true });
        if (!entry) {
            return res.status(404).json({
                error: "Journal entry not found"
            });
        }
        res.json({
            success: true,
            message: "Journal entry updated successfully",
            entry,
        });
    }
    catch (error) {
        logger_1.logger.error("Error updating journal entry:", error);
        res.status(500).json({
            error: "Failed to update journal entry",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.updateJournalEntry = updateJournalEntry;
// Delete a journal entry
const deleteJournalEntry = async (req, res) => {
    try {
        const { entryId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const entry = await JournalEntry_1.JournalEntry.findOneAndDelete({
            _id: entryId,
            userId,
        });
        if (!entry) {
            return res.status(404).json({
                error: "Journal entry not found"
            });
        }
        res.json({
            success: true,
            message: "Journal entry deleted successfully",
        });
    }
    catch (error) {
        logger_1.logger.error("Error deleting journal entry:", error);
        res.status(500).json({
            error: "Failed to delete journal entry",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.deleteJournalEntry = deleteJournalEntry;
// Get journal analytics
const getJournalAnalytics = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const { period = '30' } = req.query; // days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - Number(period));
        // Get mood trends
        const moodTrends = await JournalEntry_1.JournalEntry.aggregate([
            {
                $match: {
                    userId,
                    createdAt: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" },
                    },
                    avgMood: { $avg: "$mood" },
                    count: { $sum: 1 },
                },
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
            },
        ]);
        // Get tag frequency
        const tagFrequency = await JournalEntry_1.JournalEntry.aggregate([
            {
                $match: {
                    userId,
                    createdAt: { $gte: startDate },
                },
            },
            { $unwind: "$tags" },
            {
                $group: {
                    _id: "$tags",
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 10 },
        ]);
        // Get writing patterns
        const writingPatterns = await JournalEntry_1.JournalEntry.aggregate([
            {
                $match: {
                    userId,
                    createdAt: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: {
                        hour: { $hour: "$createdAt" },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { "_id.hour": 1 } },
        ]);
        res.json({
            success: true,
            analytics: {
                moodTrends,
                tagFrequency,
                writingPatterns,
                period: Number(period),
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching journal analytics:", error);
        res.status(500).json({
            error: "Failed to fetch journal analytics",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getJournalAnalytics = getJournalAnalytics;
// --- Lightweight local insight generators (fallback if AI not available) ---
function generateFallbackInsights(content, mood) {
    const insights = [];
    const trimmed = (content || '').trim();
    if (trimmed.length > 200) {
        insights.push('Detailed reflection shows careful self-awareness.');
    }
    if (mood >= 5) {
        insights.push('Positive mood — seems things are going well recently.');
    }
    else if (mood <= 2) {
        insights.push('Low mood — consider supportive strategies or a short grounding exercise.');
    }
    else {
        insights.push('Neutral mood — steady day-to-day emotions.');
    }
    const lc = trimmed.toLowerCase();
    if (lc.includes('anx') || lc.includes('worry') || lc.includes('stressed') || lc.includes('panic')) {
        insights.push('Anxiety-related themes detected.');
    }
    if (lc.includes('sleep') || lc.includes('insomnia') || lc.includes('tired')) {
        insights.push('Sleep-related concerns mentioned.');
    }
    if (lc.includes('work') || lc.includes('job') || lc.includes('career')) {
        insights.push('Work or career is a recurring topic.');
    }
    // keep unique and short
    return Array.from(new Set(insights)).slice(0, 6);
}
function computeEmotionalState(content, mood) {
    if (typeof mood === 'number') {
        if (mood <= 2)
            return 'very low';
        if (mood === 3)
            return 'low';
        if (mood === 4)
            return 'neutral';
        if (mood === 5)
            return 'good';
        return 'excellent';
    }
    const lc = (content || '').toLowerCase();
    if (lc.includes('sad') || lc.includes('depress') || lc.includes('hopeless'))
        return 'low';
    if (lc.includes('happy') || lc.includes('grateful') || lc.includes('joy'))
        return 'good';
    if (lc.includes('anx') || lc.includes('worri'))
        return 'anxious';
    return 'neutral';
}
function extractKeyThemes(content) {
    const themes = [];
    const lc = (content || '').toLowerCase();
    if (lc.includes('work') || lc.includes('job') || lc.includes('career'))
        themes.push('work');
    if (lc.includes('relationship') || lc.includes('partner') || lc.includes('family'))
        themes.push('relationships');
    if (lc.includes('anx') || lc.includes('worry') || lc.includes('panic'))
        themes.push('anxiety');
    if (lc.includes('sleep') || lc.includes('insomnia'))
        themes.push('sleep');
    if (lc.includes('health') || lc.includes('exercise'))
        themes.push('health');
    return Array.from(new Set(themes)).slice(0, 6);
}
function extractConcerns(content) {
    const concerns = [];
    const lc = (content || '').toLowerCase();
    if (lc.includes('worri') || lc.includes('concern') || lc.includes('scared'))
        concerns.push('worry');
    if (lc.includes('stres') || lc.includes('overwhelm'))
        concerns.push('stress');
    if (lc.includes('lonel') || lc.includes('isolat'))
        concerns.push('loneliness');
    return Array.from(new Set(concerns)).slice(0, 6);
}
function extractAchievements(content) {
    const achievements = [];
    const lc = (content || '').toLowerCase();
    if (lc.includes('accomplish') || lc.includes('achiev') || lc.includes('completed'))
        achievements.push('accomplishment');
    if (lc.includes('grate') || lc.includes('thankful'))
        achievements.push('gratitude');
    if (lc.includes('proud') || lc.includes('success'))
        achievements.push('success');
    return Array.from(new Set(achievements)).slice(0, 6);
}
// Attempt to generate richer insights via Gemini (if configured). Falls back to generateFallbackInsights on any error.
async function generateAIInsights(content, mood) {
    const trimmed = (content || '').trim();
    if (!genAI) {
        return generateFallbackInsights(content, mood);
    }
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 20000);
        // Build a concise prompt asking for short bullet insights and themes
        const prompt = `Analyze the following journal entry and return a JSON object with keys: insights (array of short bullet strings), keyThemes (array of themes). Entry:\n\n${trimmed}\n\nMood:${mood}`;
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.6 }
        });
        const response = await result.response;
        clearTimeout(id);
        const text = response.text?.() || '';
        // Try to parse as JSON first, otherwise extract simple lines
        try {
            const parsed = JSON.parse(text.trim());
            if (Array.isArray(parsed.insights))
                return parsed.insights.slice(0, 6).map((s) => String(s));
            if (Array.isArray(parsed.keyThemes) && parsed.keyThemes.length > 0)
                return parsed.keyThemes.map(t => String(t));
        }
        catch (e) {
            // Not JSON — fall through
        }
        // Fallback: split into lines and return up to 6 short lines
        const candidates = text.split(/\n+/).map(s => s.replace(/^[-•\s]+/, '').trim()).filter(Boolean);
        if (candidates.length > 0)
            return candidates.slice(0, 6);
        return generateFallbackInsights(content, mood);
    }
    catch (error) {
        logger_1.logger.warn('generateAIInsights failed:', error instanceof Error ? error.message : error);
        return generateFallbackInsights(content, mood);
    }
}
