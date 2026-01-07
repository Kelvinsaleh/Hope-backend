import mongoose, { Document, Schema } from 'mongoose';

export interface IWeeklyReport extends Document {
  userId: mongoose.Types.ObjectId;
  content: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

const WeeklyReportSchema = new Schema<IWeeklyReport>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    // TTL: expire the report automatically after a short retention period
  expiresAt: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  },
  { timestamps: true }
);

// Ensure MongoDB removes expired reports automatically using a TTL index
WeeklyReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const WeeklyReport = mongoose.model<IWeeklyReport>('WeeklyReport', WeeklyReportSchema);
