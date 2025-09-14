import { Request, Response } from "express";
import { RescuePair } from "../models/RescuePair";
import { User } from "../models/User";
import { Types } from "mongoose";
import { logger } from "../utils/logger";

// Find potential rescue pair matches
export const findMatches = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user.id);
    const { challenges, goals, communicationStyle, experienceLevel } = req.body;

    // Get user profile
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find potential matches based on compatibility
    const matches = await RescuePair.find({
      $or: [
        { user1Id: userId },
        { user2Id: userId }
      ],
      status: { $in: ["active", "pending"] }
    })
    .populate("user1Id", "name email")
    .populate("user2Id", "name email")
    .lean();

    // For new matches, find compatible users
    const potentialMatches = await User.find({
      _id: { $ne: userId },
      // Add more matching criteria here based on your requirements
    })
    .limit(10)
    .lean();

    res.json({
      success: true,
      currentMatches: matches,
      potentialMatches: potentialMatches.map(match => ({
        id: match._id,
        name: match.name,
        email: match.email,
        compatibilityScore: Math.floor(Math.random() * 40) + 60, // Mock score
        sharedChallenges: challenges || [],
        complementaryGoals: goals || [],
      })),
    });
  } catch (error) {
    logger.error("Error finding matches:", error);
    res.status(500).json({
      error: "Failed to find matches",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Create a new rescue pair
export const createRescuePair = async (req: Request, res: Response) => {
  try {
    const { partnerId, challenges, goals, communicationStyle, experienceLevel } = req.body;
    const userId = new Types.ObjectId(req.user.id);

    if (!partnerId) {
      return res.status(400).json({ error: "Partner ID is required" });
    }

    // Check if pair already exists
    const existingPair = await RescuePair.findOne({
      $or: [
        { user1Id: userId, user2Id: partnerId },
        { user1Id: partnerId, user2Id: userId }
      ]
    });

    if (existingPair) {
      return res.status(409).json({ error: "Rescue pair already exists" });
    }

    const rescuePair = new RescuePair({
      user1Id: userId,
      user2Id: new Types.ObjectId(partnerId),
      sharedChallenges: challenges || [],
      complementaryGoals: goals || [],
      communicationStyle: communicationStyle || "gentle",
      experienceLevel: experienceLevel || "beginner",
      compatibilityScore: Math.floor(Math.random() * 40) + 60, // Mock score
      nextCheckIn: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    });

    await rescuePair.save();

    res.status(201).json({
      success: true,
      message: "Rescue pair created successfully",
      pair: rescuePair,
    });
  } catch (error) {
    logger.error("Error creating rescue pair:", error);
    res.status(500).json({
      error: "Failed to create rescue pair",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get user's rescue pairs
export const getRescuePairs = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user.id);
    const { status } = req.query;

    const filter: any = {
      $or: [
        { user1Id: userId },
        { user2Id: userId }
      ]
    };

    if (status) {
      filter.status = status;
    }

    const pairs = await RescuePair.find(filter)
      .populate("user1Id", "name email")
      .populate("user2Id", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      pairs,
    });
  } catch (error) {
    logger.error("Error fetching rescue pairs:", error);
    res.status(500).json({
      error: "Failed to fetch rescue pairs",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update rescue pair status
export const updateRescuePair = async (req: Request, res: Response) => {
  try {
    const { pairId } = req.params;
    const { status, trustLevel, notes } = req.body;
    const userId = new Types.ObjectId(req.user.id);

    const pair = await RescuePair.findOneAndUpdate(
      {
        _id: pairId,
        $or: [
          { user1Id: userId },
          { user2Id: userId }
        ]
      },
      {
        status,
        trustLevel,
        notes,
      },
      { new: true }
    );

    if (!pair) {
      return res.status(404).json({ error: "Rescue pair not found" });
    }

    res.json({
      success: true,
      message: "Rescue pair updated successfully",
      pair,
    });
  } catch (error) {
    logger.error("Error updating rescue pair:", error);
    res.status(500).json({
      error: "Failed to update rescue pair",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Delete rescue pair
export const deleteRescuePair = async (req: Request, res: Response) => {
  try {
    const { pairId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const pair = await RescuePair.findOneAndDelete({
      _id: pairId,
      $or: [
        { user1Id: userId },
        { user2Id: userId }
      ]
    });

    if (!pair) {
      return res.status(404).json({ error: "Rescue pair not found" });
    }

    res.json({
      success: true,
      message: "Rescue pair deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting rescue pair:", error);
    res.status(500).json({
      error: "Failed to delete rescue pair",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
