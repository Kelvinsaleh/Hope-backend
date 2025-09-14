import mongoose, { Document, Schema } from "mongoose";

export interface IRescuePair extends Document {
  user1Id: mongoose.Types.ObjectId;
  user2Id: mongoose.Types.ObjectId;
  status: "pending" | "active" | "paused" | "ended";
  compatibilityScore: number; // 0-100
  sharedChallenges: string[];
  complementaryGoals: string[];
  communicationStyle: "gentle" | "direct" | "supportive";
  experienceLevel: "beginner" | "intermediate" | "experienced";
  trustLevel: number; // 0-100
  emergencySupport: boolean;
  nextCheckIn: Date;
  totalCheckIns: number;
  streak: number;
  matchDate: Date;
  safetyScore: number; // 1-10
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RescuePairSchema = new Schema<IRescuePair>(
  {
    user1Id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    user2Id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { 
      type: String, 
      enum: ["pending", "active", "paused", "ended"], 
      default: "pending" 
    },
    compatibilityScore: { type: Number, min: 0, max: 100, default: 0 },
    sharedChallenges: [{ type: String }],
    complementaryGoals: [{ type: String }],
    communicationStyle: { 
      type: String, 
      enum: ["gentle", "direct", "supportive"], 
      required: true 
    },
    experienceLevel: { 
      type: String, 
      enum: ["beginner", "intermediate", "experienced"], 
      required: true 
    },
    trustLevel: { type: Number, min: 0, max: 100, default: 0 },
    emergencySupport: { type: Boolean, default: false },
    nextCheckIn: { type: Date },
    totalCheckIns: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    matchDate: { type: Date, default: Date.now },
    safetyScore: { type: Number, min: 1, max: 10, default: 5 },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const RescuePair = mongoose.model<IRescuePair>("RescuePair", RescuePairSchema);
