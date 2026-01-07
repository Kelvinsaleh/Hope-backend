import mongoose, { Document, Schema, model, Types } from "mongoose";

export interface IUserProfile extends Document {
  userId: Types.ObjectId;
  bio?: string;
  age?: number;
  challenges: string[];
  goals: string[];
  communicationStyle?: "gentle" | "direct" | "supportive";
  experienceLevel?: "beginner" | "intermediate" | "experienced";
  interests: string[];
  availability?: {
    timezone?: string;
    preferredTimes?: string[];
    daysAvailable?: string[];
  };
  matchingPreferences?: {
    ageRange?: { min?: number; max?: number };
    challenges?: string[];
    goals?: string[];
    communicationStyle?: string[];
    experienceLevel?: string[];
  };
  safetySettings?: {
    allowEmergencySupport?: boolean;
    requireVerification?: boolean;
    maxDistance?: number;
  };
  isVerified?: boolean;
  verificationDate?: Date;
  lastActive?: Date;
  status?: "online" | "away" | "offline" | "busy";
  createdAt?: Date;
  updatedAt?: Date;
}

const UserProfileSchema = new Schema<IUserProfile>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  bio: { type: String, maxlength: 500, default: "" },
  age: { type: Number, min: 18, max: 100 },
  challenges: { type: [String], default: [] },
  goals: { type: [String], default: [] },
  communicationStyle: { type: String, enum: ["gentle", "direct", "supportive"], default: "gentle" },
  experienceLevel: { type: String, enum: ["beginner", "intermediate", "experienced"], default: "beginner" },
  interests: { type: [String], default: [] },
  availability: {
    timezone: { type: String },
    preferredTimes: { type: [String], default: [] },
    daysAvailable: { type: [String], default: [] }
  },
  matchingPreferences: {
    ageRange: {
      min: { type: Number, default: 18 },
      max: { type: Number, default: 100 }
    },
    challenges: { type: [String], default: [] },
    goals: { type: [String], default: [] },
    communicationStyle: { type: [String], default: [] },
    experienceLevel: { type: [String], default: [] }
  },
  safetySettings: {
    allowEmergencySupport: { type: Boolean, default: false },
    requireVerification: { type: Boolean, default: true },
    maxDistance: { type: Number, default: 0 }
  },
  isVerified: { type: Boolean, default: false },
  verificationDate: { type: Date },
  lastActive: { type: Date, default: Date.now },
  status: { type: String, enum: ["online", "away", "offline", "busy"], default: "offline" }
}, { timestamps: true });

// Unique index on userId is already enforced via `unique: true` in the schema definition above.

export const UserProfile = mongoose.models.UserProfile || model<IUserProfile>("UserProfile", UserProfileSchema);
