import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { CommunityModeration } from '../middleware/communityModeration';
import { logger } from '../utils/logger';
import { 
  CommunitySpace, 
  CommunityPost, 
  CommunityComment, 
  CommunityChallenge, 
  CommunityPrompt 
} from '../models/Community';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';

// Check if user has premium access
async function isPremiumUser(userId: Types.ObjectId): Promise<boolean> {
  const subscription = await Subscription.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
  return !!subscription;
}

// Get all community spaces with member counts and activity
export const getCommunitySpaces = async (req: Request, res: Response) => {
  try {
    const spaces = await CommunitySpace.find({ isActive: true }).sort({ name: 1 });
    
    // Get member counts and latest posts for each space
    const spacesWithStats = await Promise.all(spaces.map(async (space) => {
      // Get unique members in this space
      const uniqueMembers = await CommunityPost.distinct('userId', { spaceId: space._id });
      
      // Get latest post for preview
      const latestPost = await CommunityPost.findOne({ spaceId: space._id })
        .populate('userId', 'username')
        .sort({ createdAt: -1 });
      
      // Get total posts in this space
      const postCount = await CommunityPost.countDocuments({ spaceId: space._id });
      
      // Extract username safely
      const username = latestPost && !latestPost.isAnonymous && latestPost.userId
        ? (latestPost.userId as any).username || 'Anonymous'
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
  } catch (error) {
    logger.error('Error fetching community spaces:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch community spaces'
    });
  }
};

// Get posts for a specific space
export const getSpacePosts = async (req: Request, res: Response) => {
  try {
    const { spaceId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (Number(page) - 1) * Number(limit);
    
    const posts = await CommunityPost.find({ spaceId })
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
  } catch (error) {
    logger.error('Error fetching space posts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch posts'
    });
  }
};

// Create a new post
export const createPost = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
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
    const moderation = await CommunityModeration.moderateContent(content);
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
    
    const post = new CommunityPost({
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
      const aiReflection = await CommunityModeration.generateAIReflection(content, mood);
      post.aiReflection = aiReflection;
      await post.save();
    }
    
    await post.populate('userId', 'username');
    
    res.status(201).json({
      success: true,
      post,
      message: 'Post created successfully'
    });
  } catch (error) {
    logger.error('Error creating post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create post'
    });
  }
};

// React to a post
export const reactToPost = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { postId } = req.params;
    const { reactionType } = req.body; // 'heart', 'support', 'growth'
    
    const post = await CommunityPost.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Toggle reaction
    const reactionArray = post.reactions[reactionType as keyof typeof post.reactions];
    const hasReacted = reactionArray.includes(userId);
    
    if (hasReacted) {
      // Remove reaction
      post.reactions[reactionType as keyof typeof post.reactions] = 
        reactionArray.filter(id => !id.equals(userId));
    } else {
      // Add reaction
      post.reactions[reactionType as keyof typeof post.reactions].push(userId);
    }
    
    await post.save();
    
    res.json({
      success: true,
      reactions: post.reactions,
      message: hasReacted ? 'Reaction removed' : 'Reaction added'
    });
  } catch (error) {
    logger.error('Error reacting to post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to react to post'
    });
  }
};

// Create a comment
export const createComment = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
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
    const moderation = await CommunityModeration.moderateContent(content);
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
    
    const comment = new CommunityComment({
      postId,
      userId,
      content,
      isAnonymous: isAnonymous || false,
      isModerated: !moderation.isSafe
    });
    
    await comment.save();
    
    // Add comment to post
    await CommunityPost.findByIdAndUpdate(postId, {
      $push: { comments: comment._id }
    });
    
    await comment.populate('userId', 'username');
    
    res.status(201).json({
      success: true,
      comment,
      message: 'Comment created successfully'
    });
  } catch (error) {
    logger.error('Error creating comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create comment'
    });
  }
};

// Get active challenges
export const getActiveChallenges = async (req: Request, res: Response) => {
  try {
    const challenges = await CommunityChallenge.find({ 
      isActive: true,
      endDate: { $gt: new Date() }
    })
    .populate('spaceId', 'name')
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      challenges
    });
  } catch (error) {
    logger.error('Error fetching challenges:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch challenges'
    });
  }
};

// Join a challenge
export const joinChallenge = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
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
    
    const challenge = await CommunityChallenge.findById(challengeId);
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
  } catch (error) {
    logger.error('Error joining challenge:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join challenge'
    });
  }
};

// Get daily prompts
export const getDailyPrompts = async (req: Request, res: Response) => {
  try {
    const prompts = await CommunityPrompt.find({ 
      isActive: true 
    })
    .populate('spaceId', 'name')
    .sort({ createdAt: -1 })
    .limit(5);
    
    res.json({
      success: true,
      prompts
    });
  } catch (error) {
    logger.error('Error fetching prompts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prompts'
    });
  }
};

// Get community stats
export const getCommunityStats = async (req: Request, res: Response) => {
  try {
    const totalPosts = await CommunityPost.countDocuments();
    const totalComments = await CommunityComment.countDocuments();
    const activeUserIds = await CommunityPost.distinct('userId');
    const activeUsers = activeUserIds.length;
    
    res.json({
      success: true,
      stats: {
        totalPosts,
        totalComments,
        activeUsers,
        totalSpaces: await CommunitySpace.countDocuments({ isActive: true })
      }
    });
  } catch (error) {
    logger.error('Error fetching community stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch community stats'
    });
  }
};