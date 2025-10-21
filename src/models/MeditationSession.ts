import mongoose, { Document, Schema } from "mongoose";

export interface IMeditationSession extends Document {
  userId: mongoose.Types.ObjectId;
  meditationId: mongoose.Types.ObjectId;
  duration: number; // in seconds
  completedAt: Date;
  feedback?: {
    rating?: number; // 1-5
    comment?: string;
  };
  context?: {
    mood?: string;
    environment?: string;
    notes?: string;
  };
}

const MeditationSessionSchema = new Schema<IMeditationSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    meditationId: {
      type: Schema.Types.ObjectId,
      ref: "Meditation",
      required: true,
      index: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 0,
    },
    completedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: String,
    },
    context: {
      mood: String,
      environment: String,
      notes: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user's meditation history
MeditationSessionSchema.index({ userId: 1, completedAt: -1 });

export const MeditationSession = mongoose.model<IMeditationSession>(
  "MeditationSession",
  MeditationSessionSchema
);

