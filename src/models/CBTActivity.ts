import mongoose, { Document, Schema } from "mongoose";

export interface ICBTActivity extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'thought_record' | 'mood_entry' | 'ai_cbt_session' | 'cbt_insight' | 'relaxation' | 'activity_scheduling';
  data: any;
  effectiveness?: number;
  moodBefore?: number;
  moodAfter?: number;
  createdAt: Date;
  updatedAt: Date;
}

const CBTActivitySchema = new Schema<ICBTActivity>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['thought_record', 'mood_entry', 'ai_cbt_session', 'cbt_insight', 'relaxation', 'activity_scheduling'],
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    effectiveness: {
      type: Number,
      min: 0,
      max: 10,
    },
    moodBefore: {
      type: Number,
      min: 0,
      max: 10,
    },
    moodAfter: {
      type: Number,
      min: 0,
      max: 10,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
CBTActivitySchema.index({ userId: 1, type: 1, createdAt: -1 });
CBTActivitySchema.index({ userId: 1, createdAt: -1 });

export const CBTActivity = mongoose.model<ICBTActivity>("CBTActivity", CBTActivitySchema);

