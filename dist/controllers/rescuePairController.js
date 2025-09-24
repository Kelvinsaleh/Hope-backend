"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRescuePairDetails = exports.updateRescuePairStatus = exports.getUserRescuePairs = exports.rejectRescuePair = exports.acceptRescuePair = exports.createRescuePair = exports.findMatches = void 0;
const UserProfile_1 = require("../models/UserProfile");
const RescuePair_1 = require("../models/RescuePair");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
// Calculate compatibility score between two users
const calculateCompatibility = (profile1, profile2) => {
    let score = 0;
    let factors = 0;
    // Age compatibility (20% weight)
    const ageDiff = Math.abs(profile1.age - profile2.age);
    const ageScore = Math.max(0, 100 - (ageDiff * 2));
    score += ageScore * 0.2;
    factors += 0.2;
    // Shared challenges (30% weight)
    const sharedChallenges = profile1.challenges.filter((c) => profile2.challenges.includes(c));
    const challengeScore = (sharedChallenges.length / Math.max(profile1.challenges.length, profile2.challenges.length)) * 100;
    score += challengeScore * 0.3;
    factors += 0.3;
    // Shared goals (25% weight)
    const sharedGoals = profile1.goals.filter((g) => profile2.goals.includes(g));
    const goalScore = (sharedGoals.length / Math.max(profile1.goals.length, profile2.goals.length)) * 100;
    score += goalScore * 0.25;
    factors += 0.25;
    // Communication style compatibility (15% weight)
    const communicationScore = profile1.communicationStyle === profile2.communicationStyle ? 100 : 50;
    score += communicationScore * 0.15;
    factors += 0.15;
    // Experience level compatibility (10% weight)
    const experienceLevels = ["beginner", "intermediate", "experienced"];
    const level1Index = experienceLevels.indexOf(profile1.experienceLevel);
    const level2Index = experienceLevels.indexOf(profile2.experienceLevel);
    const levelDiff = Math.abs(level1Index - level2Index);
    const experienceScore = Math.max(0, 100 - (levelDiff * 50));
    score += experienceScore * 0.1;
    factors += 0.1;
    return factors > 0 ? Math.round(score / factors) : 0;
};
// Find potential rescue pair matches
const findMatches = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        // Get current user profile
        const userProfile = await UserProfile_1.UserProfile.findOne({ userId }).lean();
        if (!userProfile) {
            return res.status(404).json({
                success: false,
                error: "User profile not found. Please complete your profile first."
            });
        }
        // Get existing matches
        const existingMatches = await RescuePair_1.RescuePair.find({
            $or: [
                { user1Id: userId },
                { user2Id: userId }
            ],
            status: { $in: ["active", "pending"] }
        })
            .populate("user1Id", "name email")
            .populate("user2Id", "name email")
            .lean();
        // Find potential new matches - remove .lean() to avoid type issues
        const potentialMatches = await UserProfile_1.UserProfile.find({
            userId: { $ne: userId },
            isVerified: true,
            status: { $in: ["online", "away"] },
            age: {
                $gte: userProfile.matchingPreferences?.ageRange?.min || 18,
                $lte: userProfile.matchingPreferences?.ageRange?.max || 100
            }
        })
            .populate("userId", "name email")
            .limit(20);
        // Calculate compatibility scores and sort
        const matchesWithScores = potentialMatches.map(match => {
            const compatibility = calculateCompatibility(userProfile, match);
            return {
                ...match.toObject(),
                compatibilityScore: compatibility,
                sharedChallenges: userProfile.challenges.filter((c) => match.challenges.includes(c)),
                complementaryGoals: userProfile.goals.filter((g) => match.goals.includes(g)),
                isVerified: match.isVerified,
                allowEmergencySupport: match.safetySettings?.allowEmergencySupport || false
            };
        })
            .filter(match => match.compatibilityScore >= 60)
            .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
            .slice(0, 10);
        res.json({
            success: true,
            data: {
                matches: matchesWithScores,
                existingMatches: existingMatches.length,
                totalPotential: potentialMatches.length
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Error finding matches:", error);
        res.status(500).json({
            success: false,
            error: "Failed to find matches"
        });
    }
};
exports.findMatches = findMatches;
// Create a new rescue pair
const createRescuePair = async (req, res) => {
    try {
        const { targetUserId } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                error: "Target user ID is required"
            });
        }
        // Check if pair already exists
        const existingPair = await RescuePair_1.RescuePair.findOne({
            $or: [
                { user1Id: userId, user2Id: targetUserId },
                { user1Id: targetUserId, user2Id: userId }
            ]
        });
        if (existingPair) {
            return res.status(400).json({
                success: false,
                error: "Rescue pair already exists"
            });
        }
        // Create new rescue pair
        const rescuePair = new RescuePair_1.RescuePair({
            user1Id: userId,
            user2Id: targetUserId,
            status: "pending",
            createdAt: new Date()
        });
        await rescuePair.save();
        // Populate the response
        await rescuePair.populate([
            { path: "user1Id", select: "name email" },
            { path: "user2Id", select: "name email" }
        ]);
        res.status(201).json({
            success: true,
            data: rescuePair
        });
    }
    catch (error) {
        logger_1.logger.error("Error creating rescue pair:", error);
        res.status(500).json({
            success: false,
            error: "Failed to create rescue pair"
        });
    }
};
exports.createRescuePair = createRescuePair;
// Accept a rescue pair request
const acceptRescuePair = async (req, res) => {
    try {
        const { pairId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const rescuePair = await RescuePair_1.RescuePair.findOne({
            _id: pairId,
            user2Id: userId,
            status: "pending"
        });
        if (!rescuePair) {
            return res.status(404).json({
                success: false,
                error: "Rescue pair request not found"
            });
        }
        rescuePair.status = "active";
        rescuePair.acceptedAt = new Date();
        await rescuePair.save();
        await rescuePair.populate([
            { path: "user1Id", select: "name email" },
            { path: "user2Id", select: "name email" }
        ]);
        res.json({
            success: true,
            data: rescuePair
        });
    }
    catch (error) {
        logger_1.logger.error("Error accepting rescue pair:", error);
        res.status(500).json({
            success: false,
            error: "Failed to accept rescue pair"
        });
    }
};
exports.acceptRescuePair = acceptRescuePair;
// Reject a rescue pair request
const rejectRescuePair = async (req, res) => {
    try {
        const { pairId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const rescuePair = await RescuePair_1.RescuePair.findOne({
            _id: pairId,
            user2Id: userId,
            status: "pending"
        });
        if (!rescuePair) {
            return res.status(404).json({
                success: false,
                error: "Rescue pair request not found"
            });
        }
        rescuePair.status = "rejected";
        await rescuePair.save();
        res.json({
            success: true,
            data: { message: "Rescue pair request rejected" }
        });
    }
    catch (error) {
        logger_1.logger.error("Error rejecting rescue pair:", error);
        res.status(500).json({
            success: false,
            error: "Failed to reject rescue pair"
        });
    }
};
exports.rejectRescuePair = rejectRescuePair;
// Get user's rescue pairs
const getUserRescuePairs = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const rescuePairs = await RescuePair_1.RescuePair.find({
            $or: [
                { user1Id: userId },
                { user2Id: userId }
            ]
        })
            .populate("user1Id", "name email")
            .populate("user2Id", "name email")
            .sort({ createdAt: -1 })
            .lean();
        res.json({
            success: true,
            data: rescuePairs
        });
    }
    catch (error) {
        logger_1.logger.error("Error getting rescue pairs:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get rescue pairs"
        });
    }
};
exports.getUserRescuePairs = getUserRescuePairs;
// Update rescue pair status
const updateRescuePairStatus = async (req, res) => {
    try {
        const { pairId } = req.params;
        const { status } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const validStatuses = ["active", "paused", "ended"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: "Invalid status"
            });
        }
        const rescuePair = await RescuePair_1.RescuePair.findOne({
            _id: pairId,
            $or: [
                { user1Id: userId },
                { user2Id: userId }
            ]
        });
        if (!rescuePair) {
            return res.status(404).json({
                success: false,
                error: "Rescue pair not found"
            });
        }
        rescuePair.status = status;
        if (status === "ended") {
            rescuePair.endedAt = new Date();
        }
        await rescuePair.save();
        await rescuePair.populate([
            { path: "user1Id", select: "name email" },
            { path: "user2Id", select: "name email" }
        ]);
        res.json({
            success: true,
            data: rescuePair
        });
    }
    catch (error) {
        logger_1.logger.error("Error updating rescue pair status:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update rescue pair status"
        });
    }
};
exports.updateRescuePairStatus = updateRescuePairStatus;
// Get rescue pair details
const getRescuePairDetails = async (req, res) => {
    try {
        const { pairId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user.id);
        const rescuePair = await RescuePair_1.RescuePair.findOne({
            _id: pairId,
            $or: [
                { user1Id: userId },
                { user2Id: userId }
            ]
        })
            .populate("user1Id", "name email")
            .populate("user2Id", "name email")
            .lean();
        if (!rescuePair) {
            return res.status(404).json({
                success: false,
                error: "Rescue pair not found"
            });
        }
        res.json({
            success: true,
            data: rescuePair
        });
    }
    catch (error) {
        logger_1.logger.error("Error getting rescue pair details:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get rescue pair details"
        });
    }
};
exports.getRescuePairDetails = getRescuePairDetails;
