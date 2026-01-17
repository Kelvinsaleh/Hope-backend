import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { put } from '@vercel/blob';
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

// Check if user has premium access (including active trial)
async function isPremiumUser(userId: Types.ObjectId): Promise<boolean> {
  const subscription = await Subscription.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });
  if (subscription) return true;

  // Check for active trial
  const user = await User.findById(userId).lean();
  if (user?.trialEndsAt) {
    const now = new Date();
    if (now < new Date(user.trialEndsAt)) {
      return true; // User has active trial
    }
  }

  return false;
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
        .populate('userId', 'name')
        .sort({ createdAt: -1 });
      
      // Get total posts in this space
      const postCount = await CommunityPost.countDocuments({ spaceId: space._id });
      
      // Extract name safely
      const username = latestPost && !latestPost.isAnonymous && latestPost.userId
        ? (latestPost.userId as any).name || 'Anonymous'
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
      .populate('userId', 'name')
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
    let { spaceId, content, mood, isAnonymous, images, videos } = req.body;
    
    // SpaceId is now optional - convert to ObjectId if provided
    let spaceObjectId: Types.ObjectId | undefined;
    if (spaceId && spaceId.trim() !== '') {
      try {
        spaceObjectId = new Types.ObjectId(spaceId);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid spaceId format'
        });
      }
    }
    
    // Post creation is free for all users
    // AI reflection generation is premium-only (checked later)
    const hasPremium = await isPremiumUser(userId);
    
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
      spaceId: spaceObjectId, // Now optional - can be undefined
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
      const aiReflection = await CommunityModeration.generateAIReflection(content, mood);
      post.aiReflection = aiReflection;
      await post.save();
    }
    
    await post.populate('userId', 'name');

    // Notify mentioned users in post content (supports multiple @mentions anywhere in text)
    const mentionRegex = /@([A-Za-z0-9_]+)/g;
    const mentionedUsernames = new Set<string>();
    let mentionMatch;
    while ((mentionMatch = mentionRegex.exec(content)) !== null) {
      mentionedUsernames.add(mentionMatch[1]);
    }

    if (mentionedUsernames.size > 0) {
      const { createNotification } = await import('./notificationController');
      for (const username of mentionedUsernames) {
        try {
          const mentionedUser = await User.findOne({
            name: { $regex: new RegExp(`^${username}$`, 'i') },
          }).lean() as any;

          if (mentionedUser && !mentionedUser._id.equals(userId)) {
            await createNotification({
              userId: mentionedUser._id,
              type: 'mention',
              actorId: userId,
              relatedPostId: post._id as Types.ObjectId,
            });
          }
        } catch (err) {
          logger.warn(`Failed to notify mention for @${username}`, err);
        }
      }
    }
    
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

// Get a single post by ID
export const getPost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    
    const post = await CommunityPost.findOne({ 
      _id: postId,
      isDeleted: false 
    })
      .populate('userId', 'name')
      .populate('spaceId', 'name icon color');
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    res.json({
      success: true,
      post
    });
  } catch (error) {
    logger.error('Error fetching post:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch post'
    });
  }
};

// React to a post
export const reactToPost = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { postId } = req.params;
    const { reactionType } = req.body; // 'heart', 'support', 'growth'
    
    const post = await CommunityPost.findById(postId).populate('userId', 'name');
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Check if user has already reacted with this reaction type
    const reactionArray = post.reactions[reactionType as keyof typeof post.reactions];
    const hasReactedSameType = reactionArray.some((id: Types.ObjectId) => id.equals(userId));
    
    // Remove user from ALL reaction types first (single engagement rule)
    const allReactionTypes: Array<'heart' | 'support' | 'growth'> = ['heart', 'support', 'growth'];
    let hadPreviousReaction = false;
    
    for (const type of allReactionTypes) {
      const typeArray = post.reactions[type];
      const hadReaction = typeArray.some((id: Types.ObjectId) => id.equals(userId));
      if (hadReaction) {
        hadPreviousReaction = true;
      }
      post.reactions[type] = typeArray.filter((id: Types.ObjectId) => !id.equals(userId));
    }
    
    // If user wasn't already reacted with the selected type, add them
    // If they were, we've already removed it above (toggle off)
    let shouldCreateNotification = false;
    if (!hasReactedSameType) {
      post.reactions[reactionType as keyof typeof post.reactions].push(userId);
      shouldCreateNotification = true;
    }
    
    await post.save();
    
    // Create notification for post owner (if not self-reaction and adding reaction)
    if (shouldCreateNotification) {
      const postOwnerId = post.userId as any;
      if (postOwnerId && !postOwnerId._id.equals(userId)) {
        const { createNotification } = await import('./notificationController');
        await createNotification({
          userId: postOwnerId._id,
          type: 'like',
          actorId: userId,
          relatedPostId: post._id as Types.ObjectId,
        });
      }
    }
    
    res.json({
      success: true,
      reactions: post.reactions,
      message: hasReactedSameType ? 'Reaction removed' : 'Reaction added'
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
      .populate('userId', 'name')
      .sort({ createdAt: 1 });
    
    // Get replies for each top-level comment
    const commentsWithReplies = await Promise.all(
      topLevelComments.map(async (comment) => {
        const replies = await CommunityComment.find({
          parentCommentId: comment._id,
          isDeleted: false
        })
          .populate('userId', 'name')
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
    const { postId, content, isAnonymous, parentCommentId } = req.body;
    let { images } = req.body;
    
    // Validate postId
    let postObjectId: Types.ObjectId;
    try {
      postObjectId = new Types.ObjectId(postId);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid postId format'
      });
    }
    
    // Basic content validation
    const trimmed = (content || '').trim();
    if (!trimmed) {
      return res.status(400).json({
        success: false,
        error: 'Comment cannot be empty'
      });
    }
    if (trimmed.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Comment exceeds the 2000 character limit'
      });
    }
    
    // Images safety: ensure array and max 3
    if (images && !Array.isArray(images)) {
      images = [images];
    }
    if (Array.isArray(images) && images.length > 3) {
      images = images.slice(0, 3);
    }
    
    // Comments are free for all authenticated users
    
    // Moderate content
    const moderation = await CommunityModeration.moderateContent(trimmed);
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
      content: trimmed,
      isAnonymous: isAnonymous || false,
      parentCommentId: parentCommentId ? new Types.ObjectId(parentCommentId) : undefined,
      images: images || [],
      isModerated: !moderation.isSafe
    });
    
    await comment.save();
    
    // Get post to find owner for notifications
    const post = await CommunityPost.findById(postObjectId).populate('userId', 'name');
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }
    
    // Add comment to post
    await CommunityPost.findByIdAndUpdate(postObjectId, {
      $push: { comments: comment._id }
    });
    
    await comment.populate('userId', 'name');
    
    const { createNotification } = await import('./notificationController');
    
    // Create notification for post owner (if not self-comment)
    const postOwnerId = post.userId as any;
    let parentCommentOwnerId: any = null;
    
    // If replying to a comment, get parent comment and notify the comment owner
    if (parentCommentId) {
      const parentComment = await CommunityComment.findById(parentCommentId).populate('userId', 'name');
      if (parentComment) {
        parentCommentOwnerId = parentComment.userId as any;
        if (parentCommentOwnerId && !parentCommentOwnerId._id.equals(userId)) {
          // Notify parent comment owner about the reply
          await createNotification({
            userId: parentCommentOwnerId._id,
            type: 'reply',
            actorId: userId,
            relatedPostId: post._id as Types.ObjectId,
            relatedCommentId: parentComment._id as Types.ObjectId,
          });
        }
      }
    }
    
    // Notify post owner only if it's not a reply (replies already notify parent comment owner above)
    if (postOwnerId && !postOwnerId._id.equals(userId) && !parentCommentId) {
      await createNotification({
        userId: postOwnerId._id,
        type: 'comment',
        actorId: userId,
        relatedPostId: post._id as Types.ObjectId,
        relatedCommentId: comment._id as Types.ObjectId,
      });
    }
    
    // Parse @mentions anywhere in content and create mention notifications (case-insensitive)
    const mentionRegex = /@([A-Za-z0-9_]+)/g;
    const mentionedUsernames = new Set<string>();
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentionedUsernames.add(match[1]);
    }

    if (mentionedUsernames.size > 0) {
      for (const username of mentionedUsernames) {
        try {
          const mentionedUser = await User.findOne({
            name: { $regex: new RegExp(`^${username}$`, 'i') },
          }).lean() as any;

          if (mentionedUser && !mentionedUser._id.equals(userId)) {
            // Avoid duplicate if reply already notified this user
            if (!parentCommentOwnerId || !mentionedUser._id.equals(parentCommentOwnerId._id)) {
              await createNotification({
                userId: mentionedUser._id,
                type: 'mention',
                actorId: userId,
                relatedPostId: post._id as Types.ObjectId,
                relatedCommentId: comment._id as Types.ObjectId,
              });
            }
          }
        } catch (err) {
          logger.warn(`Failed to notify mention for @${username}`, err);
        }
      }
    }
    
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
      .populate('userId', 'name')
      .populate('spaceId', 'name icon')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('content userId spaceId createdAt mood isAnonymous');
    
    // Get recent comments
    const recentComments = await CommunityComment.find()
      .populate('userId', 'name')
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
    const skip = Math.max(Number((req.query.skip as string) || 0), 0);

    const posts = await CommunityPost.aggregate([
      { $match: { isDeleted: false } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
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
            name: '$user.name'
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

// Upload image to Vercel Blob
export const uploadImage = async (req: Request, res: Response) => {
  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      logger.error('BLOB_READ_WRITE_TOKEN is not set for image uploads');
      return res.status(500).json({
        success: false,
        error: 'Storage is not configured for uploads'
      });
    }

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
    const blob = await put(
      pathname,
      req.file.buffer,
      {
        access: 'public',
        contentType: req.file.mimetype,
        token: blobToken
      }
    );

    res.json({
      success: true,
      url: blob.url,
      imageUrl: blob.url, // Alias for compatibility
      message: 'Image uploaded successfully'
    });
  } catch (error) {
    logger.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload image'
    });
  }
};

// Upload video to Vercel Blob (max 60 seconds, validated on frontend)
export const uploadVideo = async (req: Request, res: Response) => {
  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) {
      logger.error('BLOB_READ_WRITE_TOKEN is not set for video uploads');
      return res.status(500).json({
        success: false,
        error: 'Storage is not configured for uploads'
      });
    }

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
    const blob = await put(
      pathname,
      req.file.buffer,
      {
        access: 'public',
        contentType: req.file.mimetype,
        token: blobToken
      }
    );

    res.json({
      success: true,
      url: blob.url,
      videoUrl: blob.url, // Alias for compatibility
      message: 'Video uploaded successfully'
    });
  } catch (error) {
    logger.error('Error uploading video:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload video'
    });
  }
};

// Save image metadata (legacy endpoint)
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