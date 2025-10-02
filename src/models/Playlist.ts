import mongoose, { Schema, Document } from "mongoose";

export interface IPlaylist extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  meditations: mongoose.Types.ObjectId[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  plays: number;
  tags: string[];
}

const PlaylistSchema = new Schema<IPlaylist>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    meditations: [{ type: Schema.Types.ObjectId, ref: "Meditation" }],
    isPublic: { type: Boolean, default: false },
    plays: { type: Number, default: 0 },
    tags: [{ type: String, trim: true }]
  },
  { timestamps: true }
);

PlaylistSchema.index({ userId: 1, createdAt: -1 });
PlaylistSchema.index({ isPublic: 1, plays: -1 });

export const Playlist = mongoose.model<IPlaylist>("Playlist", PlaylistSchema);
