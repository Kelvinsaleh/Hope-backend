import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId; // Recipient
  type: 'like' | 'comment' | 'reply' | 'mention' | 'billing';
  title: string;
  body: string;
  relatedPostId?: mongoose.Types.ObjectId;
  relatedCommentId?: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId; // User who triggered the notification
  isRead: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationPreferences extends Document {
  userId: mongoose.Types.ObjectId;
  enableLikes: boolean;
  enableComments: boolean;
  enableReplies: boolean;
  enableMentions: boolean;
  enableBilling: boolean;
  batchNotifications: boolean;
  batchTime: string; // Time of day to send daily summary (e.g., "18:00")
  createdAt: Date;
  updatedAt: Date;
}

export interface IBatchNotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'likes' | 'comments' | 'replies' | 'mentions';
  title: string;
  body: string;
  count: number;
  actorIds: mongoose.Types.ObjectId[]; // Multiple users who interacted
  relatedPostId?: mongoose.Types.ObjectId;
  date: Date; // Date of the batch
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { 
    type: String, 
    enum: ['like', 'comment', 'reply', 'mention', 'billing'], 
    required: true,
    index: true
  },
  title: { type: String, required: true },
  body: { type: String, required: true },
  relatedPostId: { type: Schema.Types.ObjectId, ref: 'CommunityPost', index: true },
  relatedCommentId: { type: Schema.Types.ObjectId, ref: 'CommunityComment' },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  isRead: { type: Boolean, default: false, index: true },
  metadata: { type: Map, of: Schema.Types.Mixed },
}, {
  timestamps: true
});

const NotificationPreferencesSchema = new Schema<INotificationPreferences>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  enableLikes: { type: Boolean, default: true },
  enableComments: { type: Boolean, default: true },
  enableReplies: { type: Boolean, default: true },
  enableMentions: { type: Boolean, default: true },
  batchNotifications: { type: Boolean, default: false },
  enableBilling: { type: Boolean, default: true },
  batchTime: { type: String, default: '18:00' }, // Default 6 PM
}, {
  timestamps: true
});

const BatchNotificationSchema = new Schema<IBatchNotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { 
    type: String, 
    enum: ['likes', 'comments', 'replies', 'mentions'], 
    required: true,
    index: true
  },
  title: { type: String, required: true },
  body: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  actorIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  relatedPostId: { type: Schema.Types.ObjectId, ref: 'CommunityPost', index: true },
  date: { type: Date, required: true, index: true }, // Date of the batch (day only)
  isRead: { type: Boolean, default: false, index: true },
}, {
  timestamps: true
});

// Indexes for performance
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
BatchNotificationSchema.index({ userId: 1, date: -1, isRead: 1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
export const NotificationPreferences = mongoose.model<INotificationPreferences>('NotificationPreferences', NotificationPreferencesSchema);
export const BatchNotification = mongoose.model<IBatchNotification>('BatchNotification', BatchNotificationSchema);

