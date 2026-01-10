"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const notificationController_1 = require("../controllers/notificationController");
const router = express_1.default.Router();
// All notification routes require authentication
router.use(auth_1.authenticateToken);
// Get notifications
router.get('/', notificationController_1.getNotifications);
// Get batch notifications (daily summaries)
router.get('/batch', notificationController_1.getBatchNotifications);
// Get unread count
router.get('/unread-count', notificationController_1.getUnreadCount);
// Get preferences
router.get('/preferences', notificationController_1.getPreferences);
// Update preferences
router.put('/preferences', notificationController_1.updatePreferences);
// Mark notification as read
router.patch('/:notificationId/read', notificationController_1.markAsRead);
// Mark all as read
router.patch('/read-all', notificationController_1.markAllAsRead);
// Delete notification
router.delete('/:notificationId', notificationController_1.deleteNotification);
exports.default = router;
