import mongoose, { Document, Schema } from "mongoose";

export interface IJournalEntry extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  content: string;
  mood: number; // 1-6 scale (matching frontend)
  tags: string[];
  isPrivate: boolean;
  insights?: string[]; // AI-generated insights
  emotionalState?: string; // AI-detected emotional state
  keyThemes?: string[]; // AI-extracted themes
  concerns?: string[]; // AI-detected concerns
  achievements?: string[]; // AI-detected achievements
  createdAt: Date;
  updatedAt: Date;
}

const JournalEntrySchema = new Schema<IJournalEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    mood: { type: Number, required: true, min: 1, max: 6 },
    tags: [{ type: String }],
    isPrivate: { type: Boolean, default: true },
    insights: [{ type: String }],
    emotionalState: { type: String },
    keyThemes: [{ type: String }],
    concerns: [{ type: String }],
    achievements: [{ type: String }],
  },
  { timestamps: true }
);

export const JournalEntry = mongoose.model<IJournalEntry>("JournalEntry", JournalEntrySchema);
