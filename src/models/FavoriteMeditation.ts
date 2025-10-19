import mongoose, { Document, Schema } from "mongoose";

export interface IFavoriteMeditation extends Document {
  userId: mongoose.Types.ObjectId;
  meditationId: mongoose.Types.ObjectId;
  favoritedAt: Date;
}

const FavoriteMeditationSchema = new Schema<IFavoriteMeditation>(
  {
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      index: true
    },
    meditationId: { 
      type: Schema.Types.ObjectId, 
      ref: "Meditation", 
      required: true,
      index: true
    },
    favoritedAt: { 
      type: Date, 
      default: Date.now 
    },
  },
  { timestamps: true }
);

// Create compound index to ensure unique user-meditation pairs
FavoriteMeditationSchema.index({ userId: 1, meditationId: 1 }, { unique: true });

export const FavoriteMeditation = mongoose.models.FavoriteMeditation || 
  mongoose.model<IFavoriteMeditation>("FavoriteMeditation", FavoriteMeditationSchema);
