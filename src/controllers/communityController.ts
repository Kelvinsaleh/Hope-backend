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
    
    const posts = await CommunityPost.find({ 
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
    let { spaceId, content, mood, isAnonymous, images } = req.body;
    
    // Validate spaceId
    if (!spaceId || spaceId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'spaceId is required'
      });
    }
    
    // Convert spaceId to ObjectId
    try {
      spaceId = new Types.ObjectId(spaceId);
    } catch (error) {
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
      images: images || [],
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

// Get comments for a post
export const getPostComments = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    
    // Convert postId to ObjectId
    const postObjectId = new Types.ObjectId(postId);
    
    // Get top-level comments (no parentCommentId) and their replies
    const topLevelComments = await CommunityComment.find({ 
      postId: postObjectId, 
      parentCommentId: { $exists: false },
      isDeleted: false 
    })
      .populate('userId', 'username')
      .sort({ createdAt: 1 });
    
    // Get replies for each top-level comment
    const commentsWithReplies = await Promise.all(
      topLevelComments.map(async (comment) => {
        const replies = await CommunityComment.find({
          parentCommentId: comment._id,
          isDeleted: false
        })
          .populate('userId', 'username')
          .sort({ createdAt: 1 });
        
        return {
          ...comment.toObject(),
          replies
        };
      })
    );
    
    res.json({
      success: true,
      comments: commentsWithReplies
    });
  } catch (error) {
    logger.error('Error fetching comments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch comments'
    });
  }
};

// Create a comment
export const createComment = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { postId, content, isAnonymous, parentCommentId, images } = req.body;
    
    // Convert postId to ObjectId
    const postObjectId = new Types.ObjectId(postId);
    
    // Comments are free for all authenticated users
    
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
      postId: postObjectId,
      userId,
      content,
      isAnonymous: isAnonymous || false,
      parentCommentId: parentCommentId ? new Types.ObjectId(parentCommentId) : undefined,
      images: images || [],
      isModerated: !moderation.isSafe
    });
    
    await comment.save();
    
    // Add comment to post
    await CommunityPost.findByIdAndUpdate(postObjectId, {
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
  } catch (error) {
    logger.error('Error joining challenge:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join challenge'
    });
  }
};

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
export const getDailyPrompts = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    
    // Determine time of day context
    let timeContext: 'morning' | 'afternoon' | 'evening' | 'weekend';
    if (hour < 12) {
      timeContext = 'morning';
    } else if (hour < 17) {
      timeContext = 'afternoon';
    } else if (hour < 22) {
      timeContext = 'evening';
    } else {
      timeContext = 'evening';
    }
    
    // Use weekend prompts on weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      timeContext = 'weekend';
    }
    
    // Get prompts for this time context
    const dynamicPrompts = REFLECTION_PROMPTS[timeContext];
    
    // Also get saved prompts from database
    const dbPrompts = await CommunityPrompt.find({ 
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
  } catch (error) {
    logger.error('Error fetching prompts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch prompts'
    });
  }
};

// Get recent activity feed
export const getRecentActivity = async (req: Request, res: Response) => {
  try {
    // Get recent posts
    const recentPosts = await CommunityPost.find()
      .populate('userId', 'username')
      .populate('spaceId', 'name icon')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('content userId spaceId createdAt mood isAnonymous');
    
    // Get recent comments
    const recentComments = await CommunityComment.find()
      .populate('userId', 'username')
      .populate('postId')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('content userId createdAt isAnonymous');
    
    // Get recent challenge joins
    const recentChallenges = await CommunityChallenge.find()
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
  } catch (error) {
    logger.error('Error fetching activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity'
    });
  }
};

// Get community stats
export const getCommunityStats = async (req: Request, res: Response) => {
  try {
    const totalPosts = await CommunityPost.countDocuments({ isDeleted: false });
    const totalComments = await CommunityComment.countDocuments({ isDeleted: false });
    const activeUserIds = await CommunityPost.distinct('userId', { isDeleted: false });
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

// Lightweight global feed (fast): latest posts with minimal fields and counts
export const getFeed = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number((req.query.limit as string) || 20), 50);

    const posts = await CommunityPost.aggregate([
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
  } catch (error) {
    logger.error('Error fetching feed:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch feed' });
  }
};

// Delete a post (soft delete)
export const deletePost = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { postId } = req.params;
    
    const post = await CommunityPost.findById(postId);
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
  } catch (error) {
    logger.error('Error deleting post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete post'
    });
  }
};

// Delete a comment (soft delete)
export const deleteComment = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { commentId } = req.params;
    
    const comment = await CommunityComment.findById(commentId);
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
  } catch (error) {
    logger.error('Error deleting comment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete comment'
    });
  }
};

// Share a post (increments share counter)
export const sharePost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const post = await CommunityPost.findById(postId);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    post.shareCount = (post.shareCount || 0) + 1;
    await post.save();
    return res.json({ success: true, shareCount: post.shareCount });
  } catch (error) {
    logger.error('Error sharing post:', error);
    return res.status(500).json({ success: false, error: 'Failed to share post' });
  }
};

// Save image metadata
export const saveImageMetadata = async (req: Request, res: Response) => {
  try {
    const { url, filename, contentType, size, postId, commentId, uploadedAt } = req.body;
    
    // For now, we'll just log the metadata
    // In a production system, you might want to store this in a separate collection
    logger.info('Image uploaded:', {
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
  } catch (error) {
    logger.error('Error saving image metadata:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save image metadata'
    });
  }
};