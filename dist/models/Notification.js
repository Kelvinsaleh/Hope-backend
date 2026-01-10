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
exports.BatchNotification = exports.NotificationPreferences = exports.Notification = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const NotificationSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
        type: String,
        enum: ['like', 'comment', 'reply', 'mention'],
        required: true,
        index: true
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    relatedPostId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunityPost', index: true },
    relatedCommentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunityComment' },
    actorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    isRead: { type: Boolean, default: false, index: true },
    metadata: { type: Map, of: mongoose_1.Schema.Types.Mixed },
}, {
    timestamps: true
});
const NotificationPreferencesSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    enableLikes: { type: Boolean, default: true },
    enableComments: { type: Boolean, default: true },
    enableReplies: { type: Boolean, default: true },
    enableMentions: { type: Boolean, default: true },
    batchNotifications: { type: Boolean, default: true },
    batchTime: { type: String, default: '18:00' }, // Default 6 PM
}, {
    timestamps: true
});
const BatchNotificationSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
        type: String,
        enum: ['likes', 'comments', 'replies', 'mentions'],
        required: true,
        index: true
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    actorIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
    relatedPostId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunityPost', index: true },
    date: { type: Date, required: true, index: true }, // Date of the batch (day only)
    isRead: { type: Boolean, default: false, index: true },
}, {
    timestamps: true
});
// Indexes for performance
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
BatchNotificationSchema.index({ userId: 1, date: -1, isRead: 1 });
exports.Notification = mongoose_1.default.model('Notification', NotificationSchema);
exports.NotificationPreferences = mongoose_1.default.model('NotificationPreferences', NotificationPreferencesSchema);
exports.BatchNotification = mongoose_1.default.model('BatchNotification', BatchNotificationSchema);
