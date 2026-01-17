import mongoose, { Schema, Document } from 'mongoose';

export interface ILongTermMemory extends Document {
  userId: mongoose.Types.ObjectId;
  type:
    | 'emotional_theme'
    | 'coping_pattern'
    | 'goal'
    | 'trigger'
    | 'insight'
    | 'preference'
    | 'person'
    | 'school'
    | 'organization'
    | 'user_summary';
  content: string;
  importance: number; // 1-10
  timestamp: Date;
  tags: string[];
  context?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LongTermMemorySchema = new Schema<ILongTermMemory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'emotional_theme',
        'coping_pattern',
        'goal',
        'trigger',
        'insight',
        'preference',
        'person',
        'school',
        'organization',
        'user_summary',
      ],
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    importance: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
      default: 5,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    context: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient querying
LongTermMemorySchema.index({ userId: 1, importance: -1, timestamp: -1 });
LongTermMemorySchema.index({ userId: 1, tags: 1 });

// Text index for content search
LongTermMemorySchema.index({ content: 'text', tags: 'text' });

export const LongTermMemoryModel = mongoose.model<ILongTermMemory>('LongTermMemory', LongTermMemorySchema);

