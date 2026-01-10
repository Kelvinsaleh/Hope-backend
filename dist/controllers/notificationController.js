"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteNotification = exports.updatePreferences = exports.getPreferences = exports.getUnreadCount = exports.markAllAsRead = exports.markAsRead = exports.getBatchNotifications = exports.getNotifications = void 0;
exports.createNotification = createNotification;
const mongoose_1 = require("mongoose");
const Notification_1 = require("../models/Notification");
const User_1 = require("../models/User");
const logger_1 = require("../utils/logger");
/**
 * Create a notification for a user
 * This is typically called when an action triggers a notification (like, comment, etc.)
 */
async function createNotification(params) {
    try {
        const { userId, type, actorId, relatedPostId, relatedCommentId, metadata } = params;
        // Don't notify yourself
        if (userId.equals(actorId)) {
            return;
        }
        // Check user's notification preferences
        const preferences = await Notification_1.NotificationPreferences.findOne({ userId });
        if (!preferences) {
            // Create default preferences if none exist
            await Notification_1.NotificationPreferences.create({
                userId,
                enableLikes: true,
                enableComments: true,
                enableReplies: true,
                enableMentions: true,
                batchNotifications: true,
                batchTime: '18:00',
            });
            // Continue with notification creation (defaults are enabled)
        }
        else {
            // Check if this notification type is enabled
            if (type === 'like' && !preferences.enableLikes)
                return;
            if (type === 'comment' && !preferences.enableComments)
                return;
            if (type === 'reply' && !preferences.enableReplies)
                return;
            if (type === 'mention' && !preferences.enableMentions)
                return;
            // If batch notifications are enabled, don't create individual notification
            // Instead, it will be handled by the batch notification system
            if (preferences.batchNotifications) {
                await addToBatchNotification(userId, type, actorId, relatedPostId);
                return;
            }
        }
        // Get actor info
        const actor = await User_1.User.findById(actorId).lean();
        if (!actor)
            return;
        const actorName = actor.name || 'Someone';
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
        }
        // Create notification
        await Notification_1.Notification.create({
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
        logger_1.logger.info(`Notification created: ${type} for user ${userId} by ${actorId}`);
    }
    catch (error) {
        logger_1.logger.error('Error creating notification:', error);
        // Don't throw - notifications shouldn't break the main flow
    }
}
/**
 * Add to batch notification (for daily summaries)
 */
async function addToBatchNotification(userId, type, actorId, relatedPostId) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const batchType = type === 'like' ? 'likes' :
            type === 'comment' ? 'comments' :
                type === 'reply' ? 'replies' : 'mentions';
        // Find or create batch notification for today
        let batch = await Notification_1.BatchNotification.findOne({
            userId,
            type: batchType,
            date: today,
            ...(relatedPostId ? { relatedPostId } : {}),
        }).populate('actorIds', 'username name');
        if (!batch) {
            // Get actor info
            const actor = await User_1.User.findById(actorId).lean();
            if (!actor)
                return;
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
            batch = await Notification_1.BatchNotification.create({
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
        }
        else {
            // Update existing batch
            const hasActor = batch.actorIds.some(id => id.equals(actorId));
            if (!hasActor) {
                batch.actorIds.push(actorId);
            }
            batch.count += 1;
            // Update body with latest interaction
            const actor = await User_1.User.findById(actorId).lean();
            if (actor) {
                const actorName = actor.name || 'Someone';
                if (batch.count === 2) {
                    batch.body = `${batch.actorIds.length} people interacted with your post`;
                }
                else {
                    batch.body = `${batch.count} people interacted with your post`;
                }
            }
            await batch.save();
        }
    }
    catch (error) {
        logger_1.logger.error('Error adding to batch notification:', error);
    }
}
/**
 * Get all notifications for the current user
 */
const getNotifications = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { unreadOnly, type, limit = 50 } = req.query;
        const query = { userId };
        if (unreadOnly === 'true') {
            query.isRead = false;
        }
        if (type && typeof type === 'string') {
            query.type = type;
        }
        const notifications = await Notification_1.Notification.find(query)
            .populate('actorId', 'name')
            .populate('relatedPostId', 'content')
            .sort({ createdAt: -1 })
            .limit(Number(limit));
        res.json({
            success: true,
            notifications,
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch notifications',
        });
    }
};
exports.getNotifications = getNotifications;
/**
 * Get batch notifications (daily summaries)
 */
const getBatchNotifications = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { startDate, endDate } = req.query;
        const query = { userId };
        if (startDate) {
            query.date = { ...query.date, $gte: new Date(startDate) };
        }
        if (endDate) {
            query.date = { ...query.date, ...query.date, $lte: new Date(endDate) };
        }
        const batches = await Notification_1.BatchNotification.find(query)
            .populate('actorIds', 'name')
            .populate('relatedPostId', 'content')
            .sort({ date: -1 })
            .limit(30);
        res.json({
            success: true,
            batches,
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching batch notifications:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch batch notifications',
        });
    }
};
exports.getBatchNotifications = getBatchNotifications;
/**
 * Mark notification as read
 */
const markAsRead = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { notificationId } = req.params;
        const notification = await Notification_1.Notification.findOne({
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
    }
    catch (error) {
        logger_1.logger.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark notification as read',
        });
    }
};
exports.markAsRead = markAsRead;
/**
 * Mark all notifications as read
 */
const markAllAsRead = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        await Notification_1.Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
        await Notification_1.BatchNotification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
        res.json({
            success: true,
            message: 'All notifications marked as read',
        });
    }
    catch (error) {
        logger_1.logger.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark all notifications as read',
        });
    }
};
exports.markAllAsRead = markAllAsRead;
/**
 * Get unread notification count
 */
const getUnreadCount = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        // Check preferences to see if user wants individual or batch notifications
        const preferences = await Notification_1.NotificationPreferences.findOne({ userId });
        const useBatch = preferences?.batchNotifications ?? true;
        let count = 0;
        if (useBatch) {
            count = await Notification_1.BatchNotification.countDocuments({
                userId,
                isRead: false,
            });
        }
        else {
            count = await Notification_1.Notification.countDocuments({
                userId,
                isRead: false,
            });
        }
        res.json({
            success: true,
            count,
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching unread count:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch unread count',
            count: 0,
        });
    }
};
exports.getUnreadCount = getUnreadCount;
/**
 * Get notification preferences
 */
const getPreferences = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        let preferences = await Notification_1.NotificationPreferences.findOne({ userId });
        if (!preferences) {
            // Create default preferences
            preferences = await Notification_1.NotificationPreferences.create({
                userId,
                enableLikes: true,
                enableComments: true,
                enableReplies: true,
                enableMentions: true,
                batchNotifications: true,
                batchTime: '18:00',
            });
        }
        res.json({
            success: true,
            preferences,
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching notification preferences:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch preferences',
        });
    }
};
exports.getPreferences = getPreferences;
/**
 * Update notification preferences
 */
const updatePreferences = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { enableLikes, enableComments, enableReplies, enableMentions, batchNotifications, batchTime, } = req.body;
        let preferences = await Notification_1.NotificationPreferences.findOne({ userId });
        if (!preferences) {
            preferences = await Notification_1.NotificationPreferences.create({
                userId,
                enableLikes: enableLikes ?? true,
                enableComments: enableComments ?? true,
                enableReplies: enableReplies ?? true,
                enableMentions: enableMentions ?? true,
                batchNotifications: batchNotifications ?? true,
                batchTime: batchTime ?? '18:00',
            });
        }
        else {
            if (enableLikes !== undefined)
                preferences.enableLikes = enableLikes;
            if (enableComments !== undefined)
                preferences.enableComments = enableComments;
            if (enableReplies !== undefined)
                preferences.enableReplies = enableReplies;
            if (enableMentions !== undefined)
                preferences.enableMentions = enableMentions;
            if (batchNotifications !== undefined)
                preferences.batchNotifications = batchNotifications;
            if (batchTime !== undefined)
                preferences.batchTime = batchTime;
            await preferences.save();
        }
        res.json({
            success: true,
            preferences,
        });
    }
    catch (error) {
        logger_1.logger.error('Error updating notification preferences:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update preferences',
        });
    }
};
exports.updatePreferences = updatePreferences;
/**
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const { notificationId } = req.params;
        const notification = await Notification_1.Notification.findOne({
            _id: notificationId,
            userId,
        });
        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found',
            });
        }
        await Notification_1.Notification.deleteOne({ _id: notificationId });
        res.json({
            success: true,
            message: 'Notification deleted',
        });
    }
    catch (error) {
        logger_1.logger.error('Error deleting notification:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete notification',
        });
    }
};
exports.deleteNotification = deleteNotification;
