"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveImageMetadata = exports.uploadVideo = exports.uploadImage = exports.sharePost = exports.deleteComment = exports.deletePost = exports.getFeed = exports.getCommunityStats = exports.getRecentActivity = exports.getDailyPrompts = exports.joinChallenge = exports.getActiveChallenges = exports.createComment = exports.getPostComments = exports.reactToPost = exports.createPost = exports.getSpacePosts = exports.getCommunitySpaces = void 0;
const mongoose_1 = require("mongoose");
const blob_1 = require("@vercel/blob");
const communityModeration_1 = require("../middleware/communityModeration");
const logger_1 = require("../utils/logger");
const Community_1 = require("../models/Community");
const User_1 = require("../models/User");
const Subscription_1 = require("../models/Subscription");
// Check if user has premium access (including active trial)
async function isPremiumUser(userId) {
    const subscription = await Subscription_1.Subscription.findOne({
        userId,
        status: 'active',
        expiresAt: { $gt: new Date() }
    });
    if (subscription)
        return true;
    // Check for active trial
    const user = await User_1.User.findById(userId).lean();
    if (user?.trialEndsAt) {
        const now = new Date();
        if (now < new Date(user.trialEndsAt)) {
            return true; // User has active trial
        }
    }
    return false;
}
// Get all community spaces with member counts and activity
const getCommunitySpaces = async (req, res) => {
    try {
        const spaces = await Community_1.CommunitySpace.find({ isActive: true }).sort({ name: 1 });
        // Get member counts and latest posts for each space
        const spacesWithStats = await Promise.all(spaces.map(async (space) => {
            // Get unique members in this space
            const uniqueMembers = await Community_1.CommunityPost.distinct('userId', { spaceId: space._id });
            // Get latest post for preview
            const latestPost = await Community_1.CommunityPost.findOne({ spaceId: space._id })
                .populate('userId', 'username')
                .sort({ createdAt: -1 });
            // Get total posts in this space
            const postCount = await Community_1.CommunityPost.countDocuments({ spaceId: space._id });
            // Extract username safely
            const username = latestPost && !latestPost.isAnonymous && latestPost.userId
                ? latestPost.userId.username || 'Anonymous'
                : 'Anonymous';
            return {
                ...space.toObject(),
                memberCount: uniqueMembers.length,
                postCount,
                latestPost: latestPost ? {
                    _id: latestPost._id,
                    content: latestPost.content.substring(0, 100) + (latestPost.content.length > 100 ? '...' : ''),
                    username,
                    createdAt: latestPost.createdAt
                } : null
            };
        }));
        res.json({
            success: true,
            spaces: spacesWithStats
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
        const posts = await Community_1.CommunityPost.find({
            spaceId,
            isDeleted: false
        })
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
        let { spaceId, content, mood, isAnonymous, images, videos } = req.body;
        // Validate spaceId
        if (!spaceId || spaceId.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'spaceId is required'
            });
        }
        // Convert spaceId to ObjectId
        try {
            spaceId = new mongoose_1.Types.ObjectId(spaceId);
        }
        catch (error) {
            return res.status(400).json({
                success: false,
                error: 'Invalid spaceId format'
            });
        }
        // Check premium access for posting
        const hasPremium = await isPremiumUser(userId);
        if (!hasPremium) {
            return res.status(403).json({
                success: false,
                error: 'Premium subscription required to create posts',
                upgradeRequired: true
            });
        }
        // Validate content length: max 2000 words
        const wordCount = (content || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean).length;
        if (wordCount === 0) {
            return res.status(400).json({
                success: false,
                error: 'Post content cannot be empty'
            });
        }
        if (wordCount > 2000) {
            return res.status(400).json({
                success: false,
                error: 'Post exceeds the 2000-word limit'
            });
        }
        // Enforce max 6 images
        if (Array.isArray(images) && images.length > 6) {
            images = images.slice(0, 6);
        }
        // Enforce max 1 video (60 seconds validated on frontend)
        if (Array.isArray(videos) && videos.length > 1) {
            return res.status(400).json({
                success: false,
                error: 'Only one video (up to 60 seconds) is allowed per post'
            });
        }
        // Ensure videos is an array or undefined
        if (videos && !Array.isArray(videos)) {
            videos = [videos];
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
            images: images || [],
            videos: videos && videos.length > 0 ? videos : undefined,
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
        const post = await Community_1.CommunityPost.findById(postId).populate('userId');
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
            // Create notification for post owner (if not self-reaction)
            const postOwnerId = post.userId;
            if (postOwnerId && !postOwnerId._id.equals(userId)) {
                const { createNotification } = await Promise.resolve().then(() => __importStar(require('./notificationController')));
                await createNotification({
                    userId: postOwnerId._id,
                    type: 'like',
                    actorId: userId,
                    relatedPostId: post._id,
                });
            }
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
// Get comments for a post
const getPostComments = async (req, res) => {
    try {
        const { postId } = req.params;
        // Convert postId to ObjectId
        const postObjectId = new mongoose_1.Types.ObjectId(postId);
        // Get top-level comments (no parentCommentId) and their replies
        const topLevelComments = await Community_1.CommunityComment.find({
            postId: postObjectId,
            parentCommentId: { $exists: false },
            isDeleted: false
        })
            .populate('userId', 'username')
            .sort({ createdAt: 1 });
        // Get replies for each top-level comment
        const commentsWithReplies = await Promise.all(topLevelComments.map(async (comment) => {
            const replies = await Community_1.CommunityComment.find({
                parentCommentId: comment._id,
                isDeleted: false
            })
                .populate('userId', 'username')
                .sort({ createdAt: 1 });
            return {
                ...comment.toObject(),
                replies
            };
        }));
        res.json({
            success: true,
            comments: commentsWithReplies
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching comments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch comments'
        });
    }
};
exports.getPostComments = getPostComments;
// Create a comment
const createComment = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { postId, content, isAnonymous, parentCommentId, images } = req.body;
        // Convert postId to ObjectId
        const postObjectId = new mongoose_1.Types.ObjectId(postId);
        // Comments are free for all authenticated users
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
            postId: postObjectId,
            userId,
            content,
            isAnonymous: isAnonymous || false,
            parentCommentId: parentCommentId ? new mongoose_1.Types.ObjectId(parentCommentId) : undefined,
            images: images || [],
            isModerated: !moderation.isSafe
        });
        await comment.save();
        // Get post to find owner for notifications
        const post = await Community_1.CommunityPost.findById(postObjectId).populate('userId');
        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }
        // Add comment to post
        await Community_1.CommunityPost.findByIdAndUpdate(postObjectId, {
            $push: { comments: comment._id }
        });
        await comment.populate('userId', 'username');
        // Create notification for post owner (if not self-comment)
        const postOwnerId = post.userId;
        if (postOwnerId && !postOwnerId._id.equals(userId)) {
            const { createNotification } = await Promise.resolve().then(() => __importStar(require('./notificationController')));
            await createNotification({
                userId: postOwnerId._id,
                type: parentCommentId ? 'reply' : 'comment',
                actorId: userId,
                relatedPostId: post._id,
                relatedCommentId: parentCommentId ? new mongoose_1.Types.ObjectId(parentCommentId) : comment._id,
            });
            // If replying to a comment, notify the comment owner too
            if (parentCommentId) {
                const parentComment = await Community_1.CommunityComment.findById(parentCommentId).populate('userId');
                if (parentComment) {
                    const parentCommentOwnerId = parentComment.userId;
                    if (parentCommentOwnerId && !parentCommentOwnerId._id.equals(userId) && !parentCommentOwnerId._id.equals(postOwnerId._id)) {
                        await createNotification({
                            userId: parentCommentOwnerId._id,
                            type: 'reply',
                            actorId: userId,
                            relatedPostId: post._id,
                            relatedCommentId: parentComment._id,
                        });
                    }
                }
            }
        }
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
        const alreadyJoined = challenge.participants.some(id => id.toString() === userId.toString());
        if (!alreadyJoined) {
            challenge.participants.push(userId);
            // Initialize progress tracking for this user
            challenge.participantProgress.push({
                userId,
                completedDays: 0,
                totalDays: challenge.duration,
                joinedAt: new Date()
            });
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
// Dynamic reflection prompts library
const REFLECTION_PROMPTS = {
    morning: [
        "What's one thing you're looking forward to today?",
        "What's one intention you want to set for this day?",
        "What small act of kindness can you do for yourself today?",
        "What thought would you like to let go of this morning?",
        "What's bringing you peace right now?"
    ],
    afternoon: [
        "What moment from today has already brought you joy?",
        "What's one thing you're grateful for right now?",
        "How are you taking care of yourself today?",
        "What challenge are you facing, and how are you growing from it?",
        "What would make your heart feel lighter today?"
    ],
    evening: [
        "What's one thing that went well for you today?",
        "What are you grateful for as this day ends?",
        "What did you learn about yourself today?",
        "How did you show up for yourself today?",
        "What brings you calm as you wind down?"
    ],
    weekend: [
        "How are you spending this time to restore yourself?",
        "What activities bring you genuine happiness?",
        "What relationships in your life need attention right now?",
        "What boundary do you need to set for your wellbeing?",
        "How can you practice self-compassion today?"
    ]
};
// Get dynamic prompts based on time and context
const getDailyPrompts = async (req, res) => {
    try {
        const now = new Date();
        const hour = now.getHours();
        const dayOfWeek = now.getDay();
        // Determine time of day context
        let timeContext;
        if (hour < 12) {
            timeContext = 'morning';
        }
        else if (hour < 17) {
            timeContext = 'afternoon';
        }
        else if (hour < 22) {
            timeContext = 'evening';
        }
        else {
            timeContext = 'evening';
        }
        // Use weekend prompts on weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            timeContext = 'weekend';
        }
        // Get prompts for this time context
        const dynamicPrompts = REFLECTION_PROMPTS[timeContext];
        // Also get saved prompts from database
        const dbPrompts = await Community_1.CommunityPrompt.find({
            isActive: true
        })
            .populate('spaceId', 'name')
            .limit(3);
        // Create hybrid response with both dynamic and database prompts
        const combinedPrompts = dbPrompts.map(prompt => prompt.toObject());
        // Add a couple of dynamic prompts
        const additionalPrompts = dynamicPrompts.slice(0, 2).map((title, index) => ({
            title,
            content: `Reflect on this prompt and share your thoughts with the community.`,
            isActive: true,
            isDynamic: true,
            _id: `dynamic-${index}`,
            createdAt: new Date(),
            updatedAt: new Date()
        }));
        const allPrompts = [...combinedPrompts, ...additionalPrompts];
        res.json({
            success: true,
            prompts: allPrompts,
            timeContext,
            suggestedResponse: "Share your reflections in your journal or with the community!"
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
// Get recent activity feed
const getRecentActivity = async (req, res) => {
    try {
        // Get recent posts
        const recentPosts = await Community_1.CommunityPost.find()
            .populate('userId', 'username')
            .populate('spaceId', 'name icon')
            .sort({ createdAt: -1 })
            .limit(5)
            .select('content userId spaceId createdAt mood isAnonymous');
        // Get recent comments
        const recentComments = await Community_1.CommunityComment.find()
            .populate('userId', 'username')
            .populate('postId')
            .sort({ createdAt: -1 })
            .limit(5)
            .select('content userId createdAt isAnonymous');
        // Get recent challenge joins
        const recentChallenges = await Community_1.CommunityChallenge.find()
            .populate('spaceId', 'name')
            .sort({ updatedAt: -1 })
            .limit(3)
            .select('title spaceId participants');
        const activity = {
            posts: recentPosts,
            comments: recentComments,
            challenges: recentChallenges,
            timestamp: new Date()
        };
        res.json({
            success: true,
            activity
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching activity:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch activity'
        });
    }
};
exports.getRecentActivity = getRecentActivity;
// Get community stats
const getCommunityStats = async (req, res) => {
    try {
        const totalPosts = await Community_1.CommunityPost.countDocuments({ isDeleted: false });
        const totalComments = await Community_1.CommunityComment.countDocuments({ isDeleted: false });
        const activeUserIds = await Community_1.CommunityPost.distinct('userId', { isDeleted: false });
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
// Lightweight global feed (fast): latest posts with minimal fields and counts
const getFeed = async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 20), 50);
        const posts = await Community_1.CommunityPost.aggregate([
            { $match: { isDeleted: false } },
            { $sort: { createdAt: -1 } },
            { $limit: limit },
            // project minimal fields plus counts
            {
                $project: {
                    userId: 1,
                    spaceId: 1,
                    content: 1,
                    mood: 1,
                    isAnonymous: 1,
                    images: 1,
                    aiReflection: 1,
                    createdAt: 1,
                    reactions: 1,
                    commentCount: { $size: { $ifNull: ["$comments", []] } },
                }
            },
            // user lookup (minimal)
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    userId: {
                        _id: '$user._id',
                        username: '$user.username'
                    },
                    spaceId: 1,
                    content: 1,
                    mood: 1,
                    isAnonymous: 1,
                    images: 1,
                    aiReflection: 1,
                    createdAt: 1,
                    reactions: 1,
                    commentCount: 1,
                }
            },
        ]);
        return res.json({ success: true, posts });
    }
    catch (error) {
        logger_1.logger.error('Error fetching feed:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch feed' });
    }
};
exports.getFeed = getFeed;
// Delete a post (soft delete)
const deletePost = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { postId } = req.params;
        const post = await Community_1.CommunityPost.findById(postId);
        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }
        // Check if user owns the post
        if (!post.userId.equals(userId)) {
            return res.status(403).json({
                success: false,
                error: 'You can only delete your own posts'
            });
        }
        // Soft delete the post
        post.isDeleted = true;
        post.deletedAt = new Date();
        await post.save();
        res.json({
            success: true,
            message: 'Post deleted successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error deleting post:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete post'
        });
    }
};
exports.deletePost = deletePost;
// Delete a comment (soft delete)
const deleteComment = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { commentId } = req.params;
        const comment = await Community_1.CommunityComment.findById(commentId);
        if (!comment) {
            return res.status(404).json({
                success: false,
                error: 'Comment not found'
            });
        }
        // Check if user owns the comment
        if (!comment.userId.equals(userId)) {
            return res.status(403).json({
                success: false,
                error: 'You can only delete your own comments'
            });
        }
        // Soft delete the comment
        comment.isDeleted = true;
        comment.deletedAt = new Date();
        await comment.save();
        res.json({
            success: true,
            message: 'Comment deleted successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error deleting comment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete comment'
        });
    }
};
exports.deleteComment = deleteComment;
// Share a post (increments share counter)
const sharePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const post = await Community_1.CommunityPost.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }
        post.shareCount = (post.shareCount || 0) + 1;
        await post.save();
        return res.json({ success: true, shareCount: post.shareCount });
    }
    catch (error) {
        logger_1.logger.error('Error sharing post:', error);
        return res.status(500).json({ success: false, error: 'Failed to share post' });
    }
};
exports.sharePost = sharePost;
// Upload image to Vercel Blob
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }
        // Validate file type
        if (!req.file.mimetype.startsWith('image/')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid file type. Only images are allowed.'
            });
        }
        // Validate file size (max 10MB for images)
        if (req.file.size > 10 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                error: 'Image size exceeds 10MB limit'
            });
        }
        // Upload to Vercel Blob
        const pathname = `community/images/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
        const blob = await (0, blob_1.put)(pathname, req.file.buffer, {
            access: 'public',
            contentType: req.file.mimetype,
            token: process.env.BLOB_READ_WRITE_TOKEN
        });
        res.json({
            success: true,
            url: blob.url,
            imageUrl: blob.url, // Alias for compatibility
            message: 'Image uploaded successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error uploading image:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload image'
        });
    }
};
exports.uploadImage = uploadImage;
// Upload video to Vercel Blob (max 60 seconds, validated on frontend)
const uploadVideo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }
        // Validate file type
        if (!req.file.mimetype.startsWith('video/')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid file type. Only videos are allowed.'
            });
        }
        // Validate file size (max 50MB for videos)
        if (req.file.size > 50 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                error: 'Video size exceeds 50MB limit'
            });
        }
        // Note: Duration validation (60 seconds) is done on the frontend
        // Backend just uploads the file
        // Upload to Vercel Blob
        const pathname = `community/videos/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
        const blob = await (0, blob_1.put)(pathname, req.file.buffer, {
            access: 'public',
            contentType: req.file.mimetype,
            token: process.env.BLOB_READ_WRITE_TOKEN
        });
        res.json({
            success: true,
            url: blob.url,
            videoUrl: blob.url, // Alias for compatibility
            message: 'Video uploaded successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error uploading video:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload video'
        });
    }
};
exports.uploadVideo = uploadVideo;
// Save image metadata (legacy endpoint)
const saveImageMetadata = async (req, res) => {
    try {
        const { url, filename, contentType, size, postId, commentId, uploadedAt } = req.body;
        // For now, we'll just log the metadata
        // In a production system, you might want to store this in a separate collection
        logger_1.logger.info('Image uploaded:', {
            url,
            filename,
            contentType,
            size,
            postId,
            commentId,
            uploadedAt
        });
        res.json({
            success: true,
            message: 'Image metadata saved'
        });
    }
    catch (error) {
        logger_1.logger.error('Error saving image metadata:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save image metadata'
        });
    }
};
exports.saveImageMetadata = saveImageMetadata;
