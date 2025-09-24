"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJournalAnalytics = exports.deleteJournalEntry = exports.updateJournalEntry = exports.getJournalEntry = exports.getJournalEntries = exports.createJournalEntry = void 0;
const JournalEntry_1 = require("../models/JournalEntry");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
// Create a new journal entry
const createJournalEntry = async (req, res) => {
    try {
        const { title, content, mood, tags, isPrivate } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        if (!title || !content || !mood) {
            return res.status(400).json({
                error: "Title, content, and mood are required"
            });
        }
        const journalEntry = new JournalEntry_1.JournalEntry({
            userId,
            title,
            content,
            mood,
            tags: tags || [],
            isPrivate: isPrivate !== undefined ? isPrivate : true,
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
        const { title, content, mood, tags, isPrivate } = req.body;
        const entry = await JournalEntry_1.JournalEntry.findOneAndUpdate({ _id: entryId, userId }, {
            title,
            content,
            mood,
            tags: tags || [],
            isPrivate: isPrivate !== undefined ? isPrivate : true,
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
