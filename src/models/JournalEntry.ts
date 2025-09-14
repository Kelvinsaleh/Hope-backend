import mongoose, { Document, Schema } from "mongoose";

export interface IJournalEntry extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  content: string;
  mood: number; // 1-10 scale
  tags: string[];
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const JournalEntrySchema = new Schema<IJournalEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    mood: { type: Number, required: true, min: 1, max: 10 },
    tags: [{ type: String }],
    isPrivate: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const JournalEntry = mongoose.model<IJournalEntry>("JournalEntry", JournalEntrySchema);
