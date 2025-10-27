"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommunityStats = exports.getDailyPrompts = exports.joinChallenge = exports.getActiveChallenges = exports.createComment = exports.reactToPost = exports.createPost = exports.getSpacePosts = exports.getCommunitySpaces = void 0;
const mongoose_1 = require("mongoose");
const communityModeration_1 = require("../middleware/communityModeration");
const logger_1 = require("../utils/logger");
const Community_1 = require("../models/Community");
const Subscription_1 = require("../models/Subscription");
// Check if user has premium access
async function isPremiumUser(userId) {
    const subscription = await Subscription_1.Subscription.findOne({
        userId,
        status: 'active',
        expiresAt: { $gt: new Date() }
    });
    return !!subscription;
}
// Get all community spaces
const getCommunitySpaces = async (req, res) => {
    try {
        const spaces = await Community_1.CommunitySpace.find({ isActive: true }).sort({ name: 1 });
        res.json({
            success: true,
            spaces
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching community spaces:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch community spaces'
        });
    }
};
exports.getCommunitySpaces = getCommunitySpaces;
// Get posts for a specific space
const getSpacePosts = async (req, res) => {
    try {
        const { spaceId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const posts = await Community_1.CommunityPost.find({ spaceId })
            .populate('userId', 'username')
            .populate('comments')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));
        res.json({
            success: true,
            posts,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                hasMore: posts.length === Number(limit)
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching space posts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch posts'
        });
    }
};
exports.getSpacePosts = getSpacePosts;
// Create a new post
const createPost = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { spaceId, content, mood, isAnonymous } = req.body;
        // Check premium access for posting
        const hasPremium = await isPremiumUser(userId);
        if (!hasPremium) {
            return res.status(403).json({
                success: false,
                error: 'Premium subscription required to create posts',
                upgradeRequired: true
            });
        }
        // Moderate content
        const moderation = await communityModeration_1.CommunityModeration.moderateContent(content);
        if (!moderation.isSafe) {
            return res.status(400).json({
                success: false,
                error: moderation.suggestion,
                moderation: {
                    confidence: moderation.confidence,
                    flags: moderation.flags
                }
            });
        }
        const post = new Community_1.CommunityPost({
            userId,
            spaceId,
            content,
            mood,
            isAnonymous: isAnonymous || false,
            isModerated: !moderation.isSafe
        });
        await post.save();
        // Generate AI reflection for premium users
        if (hasPremium) {
            const aiReflection = await communityModeration_1.CommunityModeration.generateAIReflection(content, mood);
            post.aiReflection = aiReflection;
            await post.save();
        }
        await post.populate('userId', 'username');
        res.status(201).json({
            success: true,
            post,
            message: 'Post created successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error creating post:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create post'
        });
    }
};
exports.createPost = createPost;
// React to a post
const reactToPost = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { postId } = req.params;
        const { reactionType } = req.body; // 'heart', 'support', 'growth'
        const post = await Community_1.CommunityPost.findById(postId);
        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }
        // Toggle reaction
        const reactionArray = post.reactions[reactionType];
        const hasReacted = reactionArray.includes(userId);
        if (hasReacted) {
            // Remove reaction
            post.reactions[reactionType] =
                reactionArray.filter(id => !id.equals(userId));
        }
        else {
            // Add reaction
            post.reactions[reactionType].push(userId);
        }
        await post.save();
        res.json({
            success: true,
            reactions: post.reactions,
            message: hasReacted ? 'Reaction removed' : 'Reaction added'
        });
    }
    catch (error) {
        logger_1.logger.error('Error reacting to post:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to react to post'
        });
    }
};
exports.reactToPost = reactToPost;
// Create a comment
const createComment = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { postId, content, isAnonymous } = req.body;
        // Check premium access for commenting
        const hasPremium = await isPremiumUser(userId);
        if (!hasPremium) {
            return res.status(403).json({
                success: false,
                error: 'Premium subscription required to comment',
                upgradeRequired: true
            });
        }
        // Moderate content
        const moderation = await communityModeration_1.CommunityModeration.moderateContent(content);
        if (!moderation.isSafe) {
            return res.status(400).json({
                success: false,
                error: moderation.suggestion,
                moderation: {
                    confidence: moderation.confidence,
                    flags: moderation.flags
                }
            });
        }
        const comment = new Community_1.CommunityComment({
            postId,
            userId,
            content,
            isAnonymous: isAnonymous || false,
            isModerated: !moderation.isSafe
        });
        await comment.save();
        // Add comment to post
        await Community_1.CommunityPost.findByIdAndUpdate(postId, {
            $push: { comments: comment._id }
        });
        await comment.populate('userId', 'username');
        res.status(201).json({
            success: true,
            comment,
            message: 'Comment created successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error creating comment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create comment'
        });
    }
};
exports.createComment = createComment;
// Get active challenges
const getActiveChallenges = async (req, res) => {
    try {
        const challenges = await Community_1.CommunityChallenge.find({
            isActive: true,
            endDate: { $gt: new Date() }
        })
            .populate('spaceId', 'name')
            .sort({ createdAt: -1 });
        res.json({
            success: true,
            challenges
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching challenges:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch challenges'
        });
    }
};
exports.getActiveChallenges = getActiveChallenges;
// Join a challenge
const joinChallenge = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { challengeId } = req.params;
        // Check premium access
        const hasPremium = await isPremiumUser(userId);
        if (!hasPremium) {
            return res.status(403).json({
                success: false,
                error: 'Premium subscription required to join challenges',
                upgradeRequired: true
            });
        }
        const challenge = await Community_1.CommunityChallenge.findById(challengeId);
        if (!challenge) {
            return res.status(404).json({
                success: false,
                error: 'Challenge not found'
            });
        }
        if (!challenge.participants.includes(userId)) {
            challenge.participants.push(userId);
            await challenge.save();
        }
        res.json({
            success: true,
            message: 'Successfully joined challenge',
            participants: challenge.participants.length
        });
    }
    catch (error) {
        logger_1.logger.error('Error joining challenge:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to join challenge'
        });
    }
};
exports.joinChallenge = joinChallenge;
// Get daily prompts
const getDailyPrompts = async (req, res) => {
    try {
        const prompts = await Community_1.CommunityPrompt.find({
            isActive: true
        })
            .populate('spaceId', 'name')
            .sort({ createdAt: -1 })
            .limit(5);
        res.json({
            success: true,
            prompts
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching prompts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch prompts'
        });
    }
};
exports.getDailyPrompts = getDailyPrompts;
// Get community stats
const getCommunityStats = async (req, res) => {
    try {
        const totalPosts = await Community_1.CommunityPost.countDocuments();
        const totalComments = await Community_1.CommunityComment.countDocuments();
        const activeUserIds = await Community_1.CommunityPost.distinct('userId');
        const activeUsers = activeUserIds.length;
        res.json({
            success: true,
            stats: {
                totalPosts,
                totalComments,
                activeUsers,
                totalSpaces: await Community_1.CommunitySpace.countDocuments({ isActive: true })
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching community stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch community stats'
        });
    }
};
exports.getCommunityStats = getCommunityStats;
