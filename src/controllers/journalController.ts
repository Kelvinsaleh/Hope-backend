import { Request, Response } from "express";
import { JournalEntry } from "../models/JournalEntry";
import { Types } from "mongoose";
import { logger } from "../utils/logger";

// Create a new journal entry
export const createJournalEntry = async (req: Request, res: Response) => {
  try {
    const { title, content, mood, tags, isPrivate, insights, emotionalState, keyThemes, concerns, achievements } = req.body;
    const userId = new Types.ObjectId(req.user.id);

    if (!title || !content || !mood) {
      return res.status(400).json({
        error: "Title, content, and mood are required"
      });
    }

    const journalEntry = new JournalEntry({
      userId,
      title,
      content,
      mood,
      tags: tags || [],
      isPrivate: isPrivate !== undefined ? isPrivate : true,
      insights: insights || [],
      emotionalState: emotionalState || "",
      keyThemes: keyThemes || [],
      concerns: concerns || [],
      achievements: achievements || [],
    });

    await journalEntry.save();

    res.status(201).json({
      success: true,
      message: "Journal entry created successfully",
      entry: journalEntry,
    });
  } catch (error) {
    logger.error("Error creating journal entry:", error);
    res.status(500).json({
      error: "Failed to create journal entry",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get all journal entries for a user
export const getJournalEntries = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user.id);
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const entries = await JournalEntry.find({ userId })
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await JournalEntry.countDocuments({ userId });

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
  } catch (error) {
    logger.error("Error fetching journal entries:", error);
    res.status(500).json({
      error: "Failed to fetch journal entries",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get a specific journal entry
export const getJournalEntry = async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const entry = await JournalEntry.findOne({
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
  } catch (error) {
    logger.error("Error fetching journal entry:", error);
    res.status(500).json({
      error: "Failed to fetch journal entry",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update a journal entry
export const updateJournalEntry = async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;
    const userId = new Types.ObjectId(req.user.id);
    const { title, content, mood, tags, isPrivate, insights, emotionalState, keyThemes, concerns, achievements } = req.body;

    const entry = await JournalEntry.findOneAndUpdate(
      { _id: entryId, userId },
      {
        title,
        content,
        mood,
        tags: tags || [],
        isPrivate: isPrivate !== undefined ? isPrivate : true,
        insights: insights || [],
        emotionalState: emotionalState || "",
        keyThemes: keyThemes || [],
        concerns: concerns || [],
        achievements: achievements || [],
      },
      { new: true, runValidators: true }
    );

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
  } catch (error) {
    logger.error("Error updating journal entry:", error);
    res.status(500).json({
      error: "Failed to update journal entry",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Delete a journal entry
export const deleteJournalEntry = async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const entry = await JournalEntry.findOneAndDelete({
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
  } catch (error) {
    logger.error("Error deleting journal entry:", error);
    res.status(500).json({
      error: "Failed to delete journal entry",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get journal analytics
export const getJournalAnalytics = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user.id);
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(period));

    // Get mood trends
    const moodTrends = await JournalEntry.aggregate([
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
    const tagFrequency = await JournalEntry.aggregate([
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
    const writingPatterns = await JournalEntry.aggregate([
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
  } catch (error) {
    logger.error("Error fetching journal analytics:", error);
    res.status(500).json({
      error: "Failed to fetch journal analytics",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
