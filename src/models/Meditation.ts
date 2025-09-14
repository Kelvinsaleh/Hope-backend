import mongoose, { Document, Schema } from "mongoose";

export interface IMeditation extends Document {
  title: string;
  description: string;
  duration: number; // in minutes
  audioUrl?: string;
  category: string;
  isPremium: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IMeditationSession extends Document {
  userId: mongoose.Types.ObjectId;
  meditationId: mongoose.Types.ObjectId;
  completedAt: Date;
  duration: number; // actual duration in minutes
  rating?: number; // 1-5 stars
  notes?: string;
}

const MeditationSchema = new Schema<IMeditation>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    audioUrl: { type: String },
    category: { type: String, required: true },
    isPremium: { type: Boolean, default: false },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

const MeditationSessionSchema = new Schema<IMeditationSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    meditationId: { type: Schema.Types.ObjectId, ref: "Meditation", required: true },
    completedAt: { type: Date, default: Date.now },
    duration: { type: Number, required: true },
    rating: { type: Number, min: 1, max: 5 },
    notes: { type: String },
  },
  { timestamps: true }
);

export const Meditation = mongoose.model<IMeditation>("Meditation", MeditationSchema);
export const MeditationSession = mongoose.model<IMeditationSession>("MeditationSession", MeditationSessionSchema);
