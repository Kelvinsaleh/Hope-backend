import mongoose, { Schema, Document } from "mongoose";

export interface IMood extends Document {
  userId: mongoose.Types.ObjectId;
  score: number;
  note?: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const moodSchema = new Schema<IMood>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    note: {
      type: String,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying of user's mood history
moodSchema.index({ userId: 1, timestamp: -1 });

// Expose a virtual 'mood' field for compatibility with other parts of the codebase
moodSchema.virtual('mood').get(function(this: any) {
  return this.score;
});

// Ensure virtuals are included when converting to JSON / objects
moodSchema.set('toJSON', { virtuals: true });
moodSchema.set('toObject', { virtuals: true });

const Mood = mongoose.model<IMood>("Mood", moodSchema);

export { Mood };
