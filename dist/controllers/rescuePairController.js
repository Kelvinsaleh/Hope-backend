"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveMatches = exports.acceptMatchEnhanced = exports.findMatchesEnhanced = exports.getRescuePairDetails = exports.updateRescuePairStatus = exports.getUserRescuePairs = exports.rejectRescuePair = exports.acceptRescuePair = exports.createRescuePair = exports.findMatches = void 0;
const UserProfile_1 = require("../models/UserProfile");
const RescuePair_1 = require("../models/RescuePair");
const User_1 = require("../models/User");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
// Calculate compatibility score between two users
const calculateCompatibility = (profile1, profile2) => {
    let score = 0;
    let factors = 0;
    // Age compatibility (20% weight)
    const age1 = typeof profile1.age === 'number' ? profile1.age : 0;
    const age2 = typeof profile2.age === 'number' ? profile2.age : 0;
    const ageDiff = Math.abs(age1 - age2);
    const ageScore = Math.max(0, 100 - (ageDiff * 2));
    score += ageScore * 0.2;
    factors += 0.2;
    // Shared challenges (30% weight)
    const challenges1 = Array.isArray(profile1.challenges) ? profile1.challenges : [];
    const challenges2 = Array.isArray(profile2.challenges) ? profile2.challenges : [];
    const sharedChallenges = challenges1.filter((c) => challenges2.includes(c));
    const challengeScore = (sharedChallenges.length / Math.max(challenges1.length || 1, challenges2.length || 1)) * 100;
    score += challengeScore * 0.3;
    factors += 0.3;
    // Shared goals (25% weight)
    const goals1 = Array.isArray(profile1.goals) ? profile1.goals : [];
    const goals2 = Array.isArray(profile2.goals) ? profile2.goals : [];
    const sharedGoals = goals1.filter((g) => goals2.includes(g));
    const goalScore = (sharedGoals.length / Math.max(goals1.length || 1, goals2.length || 1)) * 100;
    score += goalScore * 0.25;
    factors += 0.25;
    // Communication style compatibility (15% weight)
    const communicationScore = profile1.communicationStyle === profile2.communicationStyle ? 100 : 50;
    score += communicationScore * 0.15;
    factors += 0.15;
    // Experience level compatibility (10% weight)
    const experienceLevels = ["beginner", "intermediate", "experienced"];
    const level1Index = experienceLevels.indexOf(profile1.experienceLevel || "beginner");
    const level2Index = experienceLevels.indexOf(profile2.experienceLevel || "beginner");
    const levelDiff = Math.abs(level1Index - level2Index);
    const experienceScore = Math.max(0, 100 - (levelDiff * 50));
    score += experienceScore * 0.1;
    factors += 0.1;
    return factors > 0 ? Math.round(score / factors) : 0;
};
// Find potential rescue pair matches
const findMatches = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
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
        // Find potential new matches
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
            const matchProfile = match;
            const compatibility = calculateCompatibility(userProfile, matchProfile);
            return {
                ...match.toObject(),
                compatibilityScore: compatibility,
                sharedChallenges: (userProfile.challenges || []).filter((c) => (matchProfile.challenges || []).includes(c)),
                complementaryGoals: (userProfile.goals || []).filter((g) => (matchProfile.goals || []).includes(g)),
                isVerified: matchProfile.isVerified || false,
                allowEmergencySupport: matchProfile.safetySettings?.allowEmergencySupport || false
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
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
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
            user2Id: new mongoose_1.Types.ObjectId(targetUserId),
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
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
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
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
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
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
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
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
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
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
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
// Find potential rescue pair matches with AI scoring
const findMatchesEnhanced = async (req, res) => {
    try {
        const { preferences, maxResults = 10 } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        // Get current user profile
        const userProfile = await UserProfile_1.UserProfile.findOne({ userId })
            .populate('userId', 'name email createdAt')
            .lean();
        if (!userProfile) {
            return res.status(404).json({
                success: false,
                error: "User profile not found. Please complete your profile first."
            });
        }
        // Get blocked users to exclude
        const user = await User_1.User.findById(userId).select('blockedUsers').lean();
        const blockedUserIds = user?.blockedUsers || [];
        // Get existing matches to exclude
        const existingMatches = await RescuePair_1.RescuePair.find({
            $or: [{ user1Id: userId }, { user2Id: userId }],
            status: { $in: ["active", "pending", "accepted"] }
        }).select('user1Id user2Id').lean();
        const existingMatchIds = existingMatches.flatMap(match => [match.user1Id.toString(), match.user2Id.toString()]).filter(id => id !== userId.toString());
        // Find potential matches with enhanced criteria
        const potentialMatches = await UserProfile_1.UserProfile.find({
            userId: {
                $ne: userId,
                $nin: [...blockedUserIds, ...existingMatchIds.map(id => new mongoose_1.Types.ObjectId(id))]
            },
            isVerified: true,
            status: { $in: ["online", "away"] },
            ...(preferences?.ageRange && {
                age: {
                    $gte: preferences.ageRange[0] || 18,
                    $lte: preferences.ageRange[1] || 100
                }
            }),
            ...(preferences?.experienceLevel && {
                experienceLevel: preferences.experienceLevel
            }),
            ...(preferences?.communicationStyle && {
                communicationStyle: preferences.communicationStyle
            })
        })
            .populate('userId', 'name email lastActive createdAt')
            .limit(maxResults * 2) // Get more to filter by compatibility
            .lean();
        // Calculate enhanced compatibility scores
        const matchesWithScores = potentialMatches.map(match => {
            const matchProfile = match; // Type assertion for populated fields
            const compatibility = calculateCompatibility(userProfile, matchProfile);
            const sharedChallenges = userProfile.challenges.filter((c) => matchProfile.challenges.includes(c));
            const complementaryGoals = userProfile.goals.filter((g) => matchProfile.goals.includes(g));
            return {
                id: matchProfile.userId._id,
                name: matchProfile.userId.name,
                age: matchProfile.age,
                challenges: matchProfile.challenges,
                goals: matchProfile.goals,
                experienceLevel: matchProfile.experienceLevel,
                communicationStyle: matchProfile.communicationStyle,
                compatibility,
                sharedChallenges,
                complementaryGoals,
                lastActive: matchProfile.userId.lastActive || matchProfile.userId.createdAt,
                profileImage: matchProfile.profileImage,
                bio: matchProfile.bio || `Someone who shares ${sharedChallenges.length} similar challenges and understands your journey.`,
                safetyScore: matchProfile.safetyScore || 95,
                timezone: matchProfile.timezone,
                isVerified: matchProfile.isVerified
            };
        })
            .filter(match => match.compatibility >= 60) // Minimum 60% compatibility
            .sort((a, b) => b.compatibility - a.compatibility)
            .slice(0, maxResults);
        logger_1.logger.info(`Found ${matchesWithScores.length} compatible matches for user ${userId}`);
        res.json({
            success: true,
            data: matchesWithScores,
            currentUser: {
                id: userProfile.userId._id,
                name: userProfile.userId.name,
                challenges: userProfile.challenges,
                goals: userProfile.goals,
                experienceLevel: userProfile.experienceLevel,
                communicationStyle: userProfile.communicationStyle,
                age: userProfile.age
            },
            message: `Found ${matchesWithScores.length} compatible matches`
        });
    }
    catch (error) {
        logger_1.logger.error("Error finding enhanced matches:", error);
        res.status(500).json({
            success: false,
            error: "Failed to find matches. Please try again."
        });
    }
};
exports.findMatchesEnhanced = findMatchesEnhanced;
// Accept a match and create chat session
const acceptMatchEnhanced = async (req, res) => {
    try {
        const { matchId, acceptedAt } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const targetUserId = new mongoose_1.Types.ObjectId(matchId);
        // Check if users are already matched
        const existingMatch = await RescuePair_1.RescuePair.findOne({
            $or: [
                { user1Id: userId, user2Id: targetUserId },
                { user1Id: targetUserId, user2Id: userId }
            ]
        });
        if (existingMatch) {
            return res.status(400).json({
                success: false,
                error: "You are already matched with this user"
            });
        }
        // Create new rescue pair
        const rescuePair = new RescuePair_1.RescuePair({
            user1Id: userId,
            user2Id: targetUserId,
            status: "accepted",
            acceptedAt: acceptedAt || new Date(),
            createdAt: new Date(),
            matchingScore: req.body.compatibility || 0,
            sharedChallenges: req.body.sharedChallenges || [],
            complementaryGoals: req.body.complementaryGoals || []
        });
        await rescuePair.save();
        // Populate user details
        await rescuePair.populate([
            { path: 'user1Id', select: 'name email' },
            { path: 'user2Id', select: 'name email' }
        ]);
        logger_1.logger.info(`Match accepted: ${userId} <-> ${targetUserId}`);
        res.json({
            success: true,
            data: rescuePair,
            message: "Match accepted successfully!"
        });
    }
    catch (error) {
        logger_1.logger.error("Error accepting match:", error);
        res.status(500).json({
            success: false,
            error: "Failed to accept match"
        });
    }
};
exports.acceptMatchEnhanced = acceptMatchEnhanced;
// Get active matches for a user
const getActiveMatches = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const activeMatches = await RescuePair_1.RescuePair.find({
            $or: [{ user1Id: userId }, { user2Id: userId }],
            status: "accepted"
        })
            .populate('user1Id', 'name email lastActive')
            .populate('user2Id', 'name email lastActive')
            .sort({ acceptedAt: -1 })
            .lean();
        const formattedMatches = activeMatches.map(match => {
            const matchData = match; // Type assertion for populated fields
            const isUser1 = matchData.user1Id._id.toString() === userId.toString();
            const partner = isUser1 ? matchData.user2Id : matchData.user1Id;
            return {
                id: matchData._id,
                matchId: matchData._id,
                partnerId: partner._id,
                partnerName: partner.name,
                status: matchData.status,
                acceptedAt: matchData.acceptedAt,
                lastActive: partner.lastActive,
                sharedChallenges: matchData.sharedChallenges || [],
                complementaryGoals: matchData.complementaryGoals || []
            };
        });
        res.json({
            success: true,
            data: formattedMatches
        });
    }
    catch (error) {
        logger_1.logger.error("Error getting active matches:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get active matches"
        });
    }
};
exports.getActiveMatches = getActiveMatches;
