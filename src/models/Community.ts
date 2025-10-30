import mongoose, { Document, Schema } from 'mongoose';

export interface ICommunitySpace extends Document {
  name: string;
  description: string;
  icon: string;
  color: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICommunityPost extends Document {
  userId: mongoose.Types.ObjectId;
  spaceId: mongoose.Types.ObjectId;
  content: string;
  mood?: string;
  isAnonymous: boolean;
  images?: string[]; // Array of image URLs from Vercel Blob
  reactions: {
    heart: mongoose.Types.ObjectId[];
    support: mongoose.Types.ObjectId[];
    growth: mongoose.Types.ObjectId[];
  };
  comments: mongoose.Types.ObjectId[];
  aiReflection?: string;
  isModerated: boolean;
  shareCount?: number;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICommunityComment extends Document {
  postId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  content: string;
  isAnonymous: boolean;
  parentCommentId?: mongoose.Types.ObjectId; // For nested replies
  images?: string[]; // Array of image URLs from Vercel Blob
  reactions: {
    heart: mongoose.Types.ObjectId[];
    support: mongoose.Types.ObjectId[];
  };
  isModerated: boolean;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChallengeProgress {
  userId: mongoose.Types.ObjectId;
  completedDays: number;
  totalDays: number;
  joinedAt: Date;
}

export interface ICommunityChallenge extends Document {
  title: string;
  description: string;
  spaceId: mongoose.Types.ObjectId;
  duration: number; // days
  participants: mongoose.Types.ObjectId[];
  participantProgress: IChallengeProgress[];
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICommunityPrompt extends Document {
  title: string;
  content: string;
  spaceId: mongoose.Types.ObjectId;
  isActive: boolean;
  responses: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

// Community Space Schema
const CommunitySpaceSchema = new Schema<ICommunitySpace>({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  icon: { type: String, required: true },
  color: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Community Post Schema
const CommunityPostSchema = new Schema<ICommunityPost>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  spaceId: { type: Schema.Types.ObjectId, ref: 'CommunitySpace', required: true },
  content: { type: String, required: true, maxlength: 500 },
  mood: { type: String },
  isAnonymous: { type: Boolean, default: false },
  images: [{ type: String }], // Array of image URLs
  reactions: {
    heart: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    support: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    growth: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  },
  comments: [{ type: Schema.Types.ObjectId, ref: 'CommunityComment' }],
  aiReflection: { type: String },
  isModerated: { type: Boolean, default: false },
  shareCount: { type: Number, default: 0 },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, {
  timestamps: true
});

// Community Comment Schema
const CommunityCommentSchema = new Schema<ICommunityComment>({
  postId: { type: Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, maxlength: 300 },
  isAnonymous: { type: Boolean, default: false },
  parentCommentId: { type: Schema.Types.ObjectId, ref: 'CommunityComment' }, // For nested replies
  images: [{ type: String }], // Array of image URLs
  reactions: {
    heart: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    support: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  },
  isModerated: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }
}, {
  timestamps: true
});

// Community Challenge Schema
const CommunityChallengeSchema = new Schema<ICommunityChallenge>({
  title: { type: String, required: true },
  description: { type: String, required: true },
  spaceId: { type: Schema.Types.ObjectId, ref: 'CommunitySpace', required: true },
  duration: { type: Number, required: true },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  participantProgress: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    completedDays: { type: Number, default: 0 },
    totalDays: { type: Number },
    joinedAt: { type: Date, default: Date.now }
  }],
  isActive: { type: Boolean, default: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true }
}, {
  timestamps: true
});

// Community Prompt Schema
const CommunityPromptSchema = new Schema<ICommunityPrompt>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  spaceId: { type: Schema.Types.ObjectId, ref: 'CommunitySpace', required: true },
  isActive: { type: Boolean, default: true },
  responses: [{ type: Schema.Types.ObjectId, ref: 'CommunityPost' }]
}, {
  timestamps: true
});

// Indexes for performance
CommunityPostSchema.index({ spaceId: 1, createdAt: -1 });
CommunityPostSchema.index({ userId: 1, createdAt: -1 });
CommunityPostSchema.index({ isDeleted: 1 });
CommunityCommentSchema.index({ postId: 1, createdAt: 1 });
CommunityCommentSchema.index({ parentCommentId: 1, createdAt: 1 });
CommunityCommentSchema.index({ isDeleted: 1 });

export const CommunitySpace = mongoose.model<ICommunitySpace>('CommunitySpace', CommunitySpaceSchema);
export const CommunityPost = mongoose.model<ICommunityPost>('CommunityPost', CommunityPostSchema);
export const CommunityComment = mongoose.model<ICommunityComment>('CommunityComment', CommunityCommentSchema);
export const CommunityChallenge = mongoose.model<ICommunityChallenge>('CommunityChallenge', CommunityChallengeSchema);
export const CommunityPrompt = mongoose.model<ICommunityPrompt>('CommunityPrompt', CommunityPromptSchema);