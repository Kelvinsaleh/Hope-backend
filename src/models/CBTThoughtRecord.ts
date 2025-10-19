import mongoose, { Document, Schema } from "mongoose";

export interface ICBTThoughtRecord extends Document {
  userId: mongoose.Types.ObjectId;
  situation: string;
  automaticThoughts: string;
  emotions: string[];
  emotionIntensity: number;
  evidenceFor: string;
  evidenceAgainst: string;
  balancedThought: string;
  cognitiveDistortions: string[];
  createdAt: Date;
  updatedAt: Date;
}

const CBTThoughtRecordSchema = new Schema<ICBTThoughtRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    situation: {
      type: String,
      required: true,
    },
    automaticThoughts: {
      type: String,
      required: true,
    },
    emotions: {
      type: [String],
      default: [],
    },
    emotionIntensity: {
      type: Number,
      min: 0,
      max: 10,
      default: 5,
    },
    evidenceFor: {
      type: String,
      default: "",
    },
    evidenceAgainst: {
      type: String,
      default: "",
    },
    balancedThought: {
      type: String,
      default: "",
    },
    cognitiveDistortions: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
CBTThoughtRecordSchema.index({ userId: 1, createdAt: -1 });

export const CBTThoughtRecord = mongoose.model<ICBTThoughtRecord>(
  "CBTThoughtRecord",
  CBTThoughtRecordSchema
);

