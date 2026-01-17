import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Intervention Progress Model
 * Tracks user progress on interventions for personalization and time awareness
 */

export interface IInterventionProgress extends Document {
  userId: Types.ObjectId;
  interventionId: string;
  interventionType: 'sleep' | 'depression' | 'anxiety' | 'stress' | 'breakup' | 'grief' | 'focus';
  interventionName: string;
  status: 'active' | 'completed' | 'paused' | 'abandoned';
  startedAt: Date;
  lastActiveAt: Date;
  completedAt?: Date;
  pausedAt?: Date;
  progress: {
    currentStep: number; // Which step they're on (1-indexed)
    totalSteps: number;
    completedSteps: number[];
    notes?: string; // User notes/reflections
    effectivenessRating?: number; // 1-10 user rating
  };
  personalization: {
    attempts: number; // How many times user started this intervention
    completions: number; // How many times completed
    averageEffectiveness: number; // Average rating across attempts
    preferredTimeOfDay?: string; // When user typically engages
    preferredFrequency?: string; // How often user engages
    adaptations?: Array<{ // How intervention was personalized
      date: Date;
      change: string;
      reason: string;
    }>;
  };
  timeAwareness: {
    daysSinceStart: number; // Calculated from startedAt
    expectedDuration?: string; // e.g., "2-4 weeks"
    milestones?: Array<{
      milestone: string; // e.g., "Week 1 complete"
      date: Date;
      reached: boolean;
    }>;
    nextCheckIn?: Date; // When to check in on progress
    lastCheckIn?: Date;
  };
  metadata?: {
    originalContext?: string; // Why intervention was suggested
    relatedChatMessageId?: string;
    sessionId?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const InterventionProgressSchema = new Schema<IInterventionProgress>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    interventionId: {
      type: String,
      required: true,
      index: true,
    },
    interventionType: {
      type: String,
      enum: ['sleep', 'depression', 'anxiety', 'stress', 'breakup', 'grief', 'focus'],
      required: true,
      index: true,
    },
    interventionName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'paused', 'abandoned'],
      default: 'active',
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    lastActiveAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    pausedAt: {
      type: Date,
    },
    progress: {
      currentStep: { type: Number, default: 1 },
      totalSteps: { type: Number, required: true },
      completedSteps: { type: [Number], default: [] },
      notes: { type: String },
      effectivenessRating: { type: Number, min: 1, max: 10 },
    },
    personalization: {
      attempts: { type: Number, default: 1 },
      completions: { type: Number, default: 0 },
      averageEffectiveness: { type: Number, min: 0, max: 10 },
      preferredTimeOfDay: { type: String },
      preferredFrequency: { type: String },
      adaptations: [{
        date: { type: Date, default: Date.now },
        change: { type: String },
        reason: { type: String },
      }],
    },
    timeAwareness: {
      daysSinceStart: { type: Number, default: 0 },
      expectedDuration: { type: String },
      milestones: [{
        milestone: { type: String },
        date: { type: Date },
        reached: { type: Boolean, default: false },
      }],
      nextCheckIn: { type: Date },
      lastCheckIn: { type: Date },
    },
    metadata: {
      originalContext: { type: String },
      relatedChatMessageId: { type: String },
      sessionId: { type: String },
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient querying
InterventionProgressSchema.index({ userId: 1, status: 1 });
InterventionProgressSchema.index({ userId: 1, interventionType: 1 });
InterventionProgressSchema.index({ userId: 1, lastActiveAt: -1 });
InterventionProgressSchema.index({ 'timeAwareness.nextCheckIn': 1 }); // For scheduled check-ins

// Middleware to update daysSinceStart before saving
InterventionProgressSchema.pre('save', function(next) {
  if (this.isModified('lastActiveAt') || this.isNew) {
    const now = new Date();
    const daysSinceStart = Math.floor((now.getTime() - this.startedAt.getTime()) / (1000 * 60 * 60 * 24));
    this.timeAwareness.daysSinceStart = daysSinceStart;
    this.lastActiveAt = now;
  }
  next();
});

export const InterventionProgress = mongoose.models.InterventionProgress || 
  mongoose.model<IInterventionProgress>('InterventionProgress', InterventionProgressSchema);
