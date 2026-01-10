import express from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getNotifications,
  getBatchNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getPreferences,
  updatePreferences,
  deleteNotification,
} from '../controllers/notificationController';

const router = express.Router();

// All notification routes require authentication
router.use(authenticateToken);

// Get notifications
router.get('/', getNotifications);

// Get batch notifications (daily summaries)
router.get('/batch', getBatchNotifications);

// Get unread count
router.get('/unread-count', getUnreadCount);

// Get preferences
router.get('/preferences', getPreferences);

// Update preferences
router.put('/preferences', updatePreferences);

// Mark notification as read
router.patch('/:notificationId/read', markAsRead);

// Mark all as read
router.patch('/read-all', markAllAsRead);

// Delete notification
router.delete('/:notificationId', deleteNotification);

export default router;

