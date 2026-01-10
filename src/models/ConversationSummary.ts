import mongoose, { Document, Schema, model, Types } from "mongoose";

/**
 * Conversation Summary Model
 * Stores compact summaries of conversations instead of full message history
 * Enables long-term context without storing entire chat logs
 */

export interface IConversationSummary extends Document {
  userId: Types.ObjectId;
  sessionId?: string; // Optional: link to specific session if needed
  summaryType: "weekly" | "monthly" | "session" | "topic"; // Type of summary
  periodStart: Date; // Start of the period this summary covers
  periodEnd: Date; // End of the period this summary covers
  
  // Compact summary data
  summary: string; // AI-generated summary of conversations
  keyTopics: string[]; // Main topics discussed
  emotionalThemes: string[]; // Emotional patterns identified
  insights: string[]; // Key insights extracted
  actionItems: string[]; // Actions or goals mentioned
  
  // Metadata for context size optimization
  messageCount: number; // Number of messages summarized
  tokenCount: number; // Estimated tokens in original messages
  summaryTokens: number; // Tokens in the summary (should be much smaller)
  compressionRatio: number; // tokenCount / summaryTokens (higher is better)
  
  // Pattern extraction
  extractedPatterns: {
    communicationStyle?: string;
    preferredTopics?: string[];
    avoidancePatterns?: string[];
    engagementLevel?: "high" | "medium" | "low";
  };
  
  // Quality metrics
  confidence: number; // 0-1, confidence in summary quality
  completeness: number; // 0-1, how complete the summary is
  
  // Versioning
  version: number; // Version of the summary (increments if regenerated)
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSummarySchema = new Schema<IConversationSummary>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  sessionId: { type: String, index: true },
  summaryType: { 
    type: String, 
    enum: ["weekly", "monthly", "session", "topic"], 
    required: true,
    index: true,
  },
  periodStart: { type: Date, required: true, index: true },
  periodEnd: { type: Date, required: true, index: true },
  
  summary: { type: String, required: true },
  keyTopics: { type: [String], default: [] },
  emotionalThemes: { type: [String], default: [] },
  insights: { type: [String], default: [] },
  actionItems: { type: [String], default: [] },
  
  messageCount: { type: Number, default: 0 },
  tokenCount: { type: Number, default: 0 },
  summaryTokens: { type: Number, default: 0 },
  compressionRatio: { type: Number, default: 0 },
  
  extractedPatterns: {
    communicationStyle: String,
    preferredTopics: { type: [String], default: [] },
    avoidancePatterns: { type: [String], default: [] },
    engagementLevel: { type: String, enum: ["high", "medium", "low"] },
  },
  
  confidence: { type: Number, default: 0.7, min: 0, max: 1 },
  completeness: { type: Number, default: 0.7, min: 0, max: 1 },
  
  version: { type: Number, default: 1 },
}, { timestamps: true });

// Compound indexes for efficient querying
ConversationSummarySchema.index({ userId: 1, summaryType: 1, periodEnd: -1 });
ConversationSummarySchema.index({ userId: 1, periodStart: 1, periodEnd: 1 });
ConversationSummarySchema.index({ createdAt: -1 }); // For cleanup jobs

// TTL index to automatically delete old summaries (optional, uncomment if needed)
// ConversationSummarySchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 }); // 1 year

export const ConversationSummary = mongoose.models.ConversationSummary || 
  model<IConversationSummary>("ConversationSummary", ConversationSummarySchema);

