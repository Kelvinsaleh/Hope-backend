import { Request, Response } from 'express';
import { Types, Document } from 'mongoose';
import { Notification, NotificationPreferences, BatchNotification } from '../models/Notification';
import { CommunityPost } from '../models/Community';
import { User, IUser } from '../models/User';
import { logger } from '../utils/logger';

/**
 * Create a notification for a user
 * This is typically called when an action triggers a notification (like, comment, etc.)
 */
export async function createNotification(params: {
  userId: Types.ObjectId; // Recipient
  type: 'like' | 'comment' | 'reply' | 'mention' | 'billing';
  actorId: Types.ObjectId; // User who triggered it (or system)
  relatedPostId?: Types.ObjectId;
  relatedCommentId?: Types.ObjectId;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const { userId, type, actorId, relatedPostId, relatedCommentId, metadata } = params;

    // Don't notify yourself for social events; allow for billing/system updates
    if (userId.equals(actorId) && params.type !== 'billing') {
      return;
    }

    // Check user's notification preferences
    const preferences = await NotificationPreferences.findOne({ userId });
    if (!preferences) {
      // Create default preferences if none exist
      await NotificationPreferences.create({
        userId,
        enableLikes: true,
        enableComments: true,
        enableReplies: true,
        enableMentions: true,
        enableBilling: true,
        batchNotifications: false, // default to real-time unless user opts into summaries
        batchTime: '18:00',
      });
      // Continue with notification creation (defaults are enabled)
    } else {
      // Check if this notification type is enabled
      if (type === 'like' && !preferences.enableLikes) return;
      if (type === 'comment' && !preferences.enableComments) return;
      if (type === 'reply' && !preferences.enableReplies) return;
      if (type === 'mention' && !preferences.enableMentions) return;
      if (type === 'billing' && preferences.enableBilling === false) return;

      // If user opted into summaries, only add to batch (no real-time) except billing.
      if (preferences.batchNotifications && type !== 'billing') {
        await addToBatchNotification(userId, type, actorId, relatedPostId);
        return;
      }
    }

    // Get actor info
    const actor = await User.findById(actorId).lean() as (Omit<IUser, keyof Document> & { _id: any }) | null;
    // For billing/system messages, allow missing actor (use “System”)
    const actorName = actor?.name || 'System';

    // Generate title and body based on type
    let title = '';
    let body = '';

    switch (type) {
      case 'like':
        title = 'New Like';
        body = `${actorName} liked your post`;
        break;
      case 'comment':
        title = 'New Comment';
        body = `${actorName} commented on your post`;
        break;
      case 'reply':
        title = 'New Reply';
        body = `${actorName} replied to your comment`;
        break;
      case 'mention':
        title = 'You Were Mentioned';
        body = `${actorName} mentioned you in a post`;
        break;
      case 'billing':
        title = 'Subscription Update';
        body = (metadata && metadata.message) || 'Your subscription status changed.';
        break;
    }

    // Create notification
    await Notification.create({
      userId,
      type,
      title,
      body,
      relatedPostId,
      relatedCommentId,
      actorId,
      isRead: false,
      metadata,
    });

    logger.info(`Notification created: ${type} for user ${userId} by ${actorId}`);
  } catch (error) {
    logger.error('Error creating notification:', error);
    // Don't throw - notifications shouldn't break the main flow
  }
}

/**
 * Add to batch notification (for daily summaries)
 */
async function addToBatchNotification(
  userId: Types.ObjectId,
  type: 'like' | 'comment' | 'reply' | 'mention',
  actorId: Types.ObjectId,
  relatedPostId?: Types.ObjectId
): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const batchType = type === 'like' ? 'likes' : 
                      type === 'comment' ? 'comments' :
                      type === 'reply' ? 'replies' : 'mentions';

    // Find or create batch notification for today
    let batch = await BatchNotification.findOne({
      userId,
      type: batchType,
      date: today,
      ...(relatedPostId ? { relatedPostId } : {}),
    }).populate('actorIds', 'username name');

    if (!batch) {
      // Get actor info
      const actor = await User.findById(actorId).lean() as (Omit<IUser, keyof Document> & { _id: any }) | null;
      if (!actor) return;

      const actorName = actor.name || 'Someone';

      let title = '';
      let body = '';

      switch (batchType) {
        case 'likes':
          title = 'Daily Likes Summary';
          body = `${actorName} liked your post`;
          break;
        case 'comments':
          title = 'Daily Comments Summary';
          body = `${actorName} commented on your post`;
          break;
        case 'replies':
          title = 'Daily Replies Summary';
          body = `${actorName} replied to your comment`;
          break;
        case 'mentions':
          title = 'Daily Mentions Summary';
          body = `${actorName} mentioned you`;
          break;
      }

      batch = await BatchNotification.create({
        userId,
        type: batchType,
        title,
        body,
        count: 1,
        actorIds: [actorId],
        relatedPostId,
        date: today,
        isRead: false,
      });
    } else {
      // Update existing batch
      const hasActor = batch.actorIds.some(id => id.equals(actorId));
      if (!hasActor) {
        batch.actorIds.push(actorId);
      }
      batch.count += 1;

      // Update body with latest interaction
      const actor = await User.findById(actorId).lean() as (Omit<IUser, keyof Document> & { _id: any }) | null;
      if (actor) {
        const actorName = actor.name || 'Someone';
        if (batch.count === 2) {
          batch.body = `${batch.actorIds.length} people interacted with your post`;
        } else {
          batch.body = `${batch.count} people interacted with your post`;
        }
      }

      await batch.save();
    }
  } catch (error) {
    logger.error('Error adding to batch notification:', error);
  }
}

/**
 * Get all notifications for the current user
 */
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { unreadOnly, type, limit = 50 } = req.query;

    const query: any = { userId };
    
    if (unreadOnly === 'true') {
      query.isRead = false;
    }
    
    if (type && typeof type === 'string') {
      query.type = type;
    }

    const notifications = await Notification.find(query)
      .populate('actorId', 'name')
      .populate('relatedPostId', 'content')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({
      success: true,
      notifications,
    });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications',
    });
  }
};

/**
 * Get batch notifications (daily summaries)
 */
export const getBatchNotifications = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { startDate, endDate } = req.query;

    const query: any = { userId };

    if (startDate) {
      query.date = { ...query.date, $gte: new Date(startDate as string) };
    }
    if (endDate) {
      query.date = { ...query.date, ...query.date, $lte: new Date(endDate as string) };
    }

    const batches = await BatchNotification.find(query)
      .populate('actorIds', 'name')
      .populate('relatedPostId', 'content')
      .sort({ date: -1 })
      .limit(30);

    res.json({
      success: true,
      batches,
    });
  } catch (error) {
    logger.error('Error fetching batch notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch notifications',
    });
  }
};

/**
 * Mark notification as read
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { notificationId } = req.params;

    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    notification.isRead = true;
    await notification.save();

    res.json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read',
    });
  }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);

    await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );

    await BatchNotification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read',
    });
  }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);

    // Check preferences to see if user wants individual or batch notifications
    const preferences = await NotificationPreferences.findOne({ userId });
    const useBatch = preferences?.batchNotifications ?? true;

    let count = 0;

    if (useBatch) {
      count = await BatchNotification.countDocuments({
        userId,
        isRead: false,
      });
    } else {
      count = await Notification.countDocuments({
        userId,
        isRead: false,
      });
    }

    res.json({
      success: true,
      count,
    });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count',
      count: 0,
    });
  }
};

/**
 * Get notification preferences
 */
export const getPreferences = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);

    let preferences = await NotificationPreferences.findOne({ userId });

    if (!preferences) {
      // Create default preferences
      preferences = await NotificationPreferences.create({
        userId,
        enableLikes: true,
        enableComments: true,
        enableReplies: true,
        enableMentions: true,
        batchNotifications: false,
        batchTime: '18:00',
      });
    }

    res.json({
      success: true,
      preferences,
    });
  } catch (error) {
    logger.error('Error fetching notification preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch preferences',
    });
  }
};

/**
 * Update notification preferences
 */
export const updatePreferences = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const {
      enableLikes,
      enableComments,
      enableReplies,
      enableMentions,
      batchNotifications,
      batchTime,
    } = req.body;

    let preferences = await NotificationPreferences.findOne({ userId });

    if (!preferences) {
      preferences = await NotificationPreferences.create({
        userId,
        enableLikes: enableLikes ?? true,
        enableComments: enableComments ?? true,
        enableReplies: enableReplies ?? true,
        enableMentions: enableMentions ?? true,
        batchNotifications: batchNotifications ?? true,
        batchTime: batchTime ?? '18:00',
      });
    } else {
      if (enableLikes !== undefined) preferences.enableLikes = enableLikes;
      if (enableComments !== undefined) preferences.enableComments = enableComments;
      if (enableReplies !== undefined) preferences.enableReplies = enableReplies;
      if (enableMentions !== undefined) preferences.enableMentions = enableMentions;
      if (batchNotifications !== undefined) preferences.batchNotifications = batchNotifications;
      if (batchTime !== undefined) preferences.batchTime = batchTime;

      await preferences.save();
    }

    res.json({
      success: true,
      preferences,
    });
  } catch (error) {
    logger.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences',
    });
  }
};

/**
 * Delete a notification
 */
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { notificationId } = req.params;

    const notification = await Notification.findOne({
      _id: notificationId,
      userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found',
      });
    }

    await Notification.deleteOne({ _id: notificationId });

    res.json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    logger.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification',
    });
  }
};

