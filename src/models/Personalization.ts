import mongoose, { Document, Schema, model, Types } from "mongoose";

/**
 * User Personalization Model
 * Stores long-term user preferences, behavioral patterns, and adaptation data
 * Used to maintain consistent, user-aware AI responses over time
 */

export interface IBehavioralTendency {
  pattern: string; // e.g., "prefers morning sessions", "asks follow-up questions"
  frequency: number; // 0-1, how often this pattern occurs
  confidence: number; // 0-1, how certain we are about this pattern
  firstObserved: Date;
  lastObserved: Date;
  sampleSize: number; // Number of observations supporting this pattern
}

export interface ITimePattern {
  hourOfDay?: number[]; // Preferred hours [0-23]
  dayOfWeek?: number[]; // Preferred days [0-6, Sunday=0]
  sessionDuration?: {
    average: number; // Average session duration in minutes
    typicalRange: [number, number]; // [min, max] in minutes
  };
  lastActiveTime?: Date;
  timezone?: string;
}

export interface ICommunicationPreferences {
  style: "gentle" | "direct" | "supportive"; // Explicit user preference
  inferredStyle?: "gentle" | "direct" | "supportive"; // AI-inferred from behavior
  verbosity: "concise" | "moderate" | "detailed"; // Preferred response length
  responseFormat: "conversational" | "structured" | "mixed"; // Preferred format
  emojiUsage: "none" | "minimal" | "moderate" | "frequent"; // Preferred emoji usage
  topicsToAvoid: string[]; // Explicitly avoided topics
  preferredTopics: string[]; // Topics user engages with most
}

export interface IEngagementMetrics {
  averageSessionLength: number; // Minutes
  messagesPerSession: number;
  sessionFrequency: number; // Sessions per week
  responseQuality: number; // 0-1, inferred from user behavior (continuation, feedback)
  lastEngagement: Date;
  engagementTrend: "increasing" | "stable" | "decreasing";
}

export interface IUserIntent {
  primaryGoals: string[]; // Long-term stable goals
  currentFocus: string[]; // Short-term current focus areas
  priorities: { [key: string]: number }; // Priority scores for different areas (0-1)
  lastGoalsUpdate: Date;
}

export interface IAdaptationRule {
  ruleType: "communication_style" | "verbosity" | "topic_approach" | "technique_preference";
  condition: string; // Condition that triggers this rule
  action: string; // Action to take
  priority: number; // 0-1, higher priority rules override lower ones
  source: "user_explicit" | "inferred_pattern" | "system_default";
  confidence: number; // 0-1
  createdAt: Date;
  lastApplied: Date;
  effectiveness: number; // 0-1, tracks if rule improves engagement
}

export interface IPersonalization extends Document {
  userId: Types.ObjectId;
  
  // Stable user profile data
  intent: IUserIntent;
  
  // Communication preferences (with explicit user overrides taking priority)
  communication: ICommunicationPreferences;
  
  // Behavioral patterns inferred from usage
  behavioralTendencies: IBehavioralTendency[];
  
  // Time-based interaction patterns
  timePatterns: ITimePattern;
  
  // Engagement metrics for adaptation
  engagement: IEngagementMetrics;
  
  // Adaptation rules (enforceable system instructions)
  adaptationRules: IAdaptationRule[];
  
  // User overrides (explicit preferences that override inferred ones)
  userOverrides: {
    communicationStyle?: "gentle" | "direct" | "supportive";
    verbosity?: "concise" | "moderate" | "detailed";
    topicsToAvoid?: string[];
    preferredTopics?: string[];
    other?: { [key: string]: any };
  };
  
  // Confidence and decay tracking
  lastAnalysis: Date; // Last time patterns were analyzed
  dataQuality: number; // 0-1, quality of personalization data (based on sample size, recency)
  decayRate: number; // 0-1, how quickly outdated preferences should fade (default: 0.05 per week)
  
  // Transparency and control
  personalizationEnabled: boolean; // Allow users to disable personalization
  explainability: { // Track what personalization is being applied and why
    activeRules: string[];
    inferredPatterns: string[];
    lastExplained: Date;
  };
  
  // Versioning for caching and updates
  version: number; // Increments when significant changes occur
  lastUpdated: Date;
  createdAt: Date;
}

const BehavioralTendencySchema = new Schema<IBehavioralTendency>({
  pattern: { type: String, required: true },
  frequency: { type: Number, required: true, min: 0, max: 1 },
  confidence: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
  firstObserved: { type: Date, required: true, default: Date.now },
  lastObserved: { type: Date, required: true, default: Date.now },
  sampleSize: { type: Number, required: true, default: 1 },
}, { _id: false });

const TimePatternSchema = new Schema<ITimePattern>({
  hourOfDay: { type: [Number], default: [] },
  dayOfWeek: { type: [Number], default: [] },
  sessionDuration: {
    average: { type: Number, default: 0 },
    typicalRange: { type: [Number], default: [0, 0] },
  },
  lastActiveTime: { type: Date },
  timezone: { type: String },
}, { _id: false });

const CommunicationPreferencesSchema = new Schema<ICommunicationPreferences>({
  style: { type: String, enum: ["gentle", "direct", "supportive"], default: "gentle" },
  inferredStyle: { type: String, enum: ["gentle", "direct", "supportive"] },
  verbosity: { type: String, enum: ["concise", "moderate", "detailed"], default: "moderate" },
  responseFormat: { type: String, enum: ["conversational", "structured", "mixed"], default: "conversational" },
  emojiUsage: { type: String, enum: ["none", "minimal", "moderate", "frequent"], default: "minimal" },
  topicsToAvoid: { type: [String], default: [] },
  preferredTopics: { type: [String], default: [] },
}, { _id: false });

const EngagementMetricsSchema = new Schema<IEngagementMetrics>({
  averageSessionLength: { type: Number, default: 0 },
  messagesPerSession: { type: Number, default: 0 },
  sessionFrequency: { type: Number, default: 0 },
  responseQuality: { type: Number, default: 0.5, min: 0, max: 1 },
  lastEngagement: { type: Date, default: Date.now },
  engagementTrend: { type: String, enum: ["increasing", "stable", "decreasing"], default: "stable" },
}, { _id: false });

const UserIntentSchema = new Schema<IUserIntent>({
  primaryGoals: { type: [String], default: [] },
  currentFocus: { type: [String], default: [] },
  priorities: { type: Map, of: Number, default: {} },
  lastGoalsUpdate: { type: Date, default: Date.now },
}, { _id: false });

const AdaptationRuleSchema = new Schema<IAdaptationRule>({
  ruleType: { type: String, enum: ["communication_style", "verbosity", "topic_approach", "technique_preference"], required: true },
  condition: { type: String, required: true },
  action: { type: String, required: true },
  priority: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
  source: { type: String, enum: ["user_explicit", "inferred_pattern", "system_default"], required: true },
  confidence: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
  createdAt: { type: Date, required: true, default: Date.now },
  lastApplied: { type: Date, default: Date.now },
  effectiveness: { type: Number, default: 0.5, min: 0, max: 1 },
}, { _id: false });

const PersonalizationSchema = new Schema<IPersonalization>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  
  intent: { type: UserIntentSchema, required: true, default: () => ({}) },
  communication: { type: CommunicationPreferencesSchema, required: true, default: () => ({}) },
  behavioralTendencies: { type: [BehavioralTendencySchema], default: [] },
  timePatterns: { type: TimePatternSchema, default: () => ({}) },
  engagement: { type: EngagementMetricsSchema, required: true, default: () => ({}) },
  adaptationRules: { type: [AdaptationRuleSchema], default: [] },
  
  userOverrides: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {},
  },
  
  lastAnalysis: { type: Date, default: Date.now },
  dataQuality: { type: Number, default: 0.3, min: 0, max: 1 }, // Start low, increases with more data
  decayRate: { type: Number, default: 0.05, min: 0, max: 1 }, // 5% per week
  
  personalizationEnabled: { type: Boolean, default: true },
  explainability: {
    activeRules: { type: [String], default: [] },
    inferredPatterns: { type: [String], default: [] },
    lastExplained: { type: Date, default: Date.now },
  },
  
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

// Index for efficient querying
PersonalizationSchema.index({ userId: 1 });
PersonalizationSchema.index({ lastAnalysis: 1 });
PersonalizationSchema.index({ version: 1 });

// Pre-save hook to increment version on significant changes
PersonalizationSchema.pre("save", function(next) {
  if (this.isModified("communication") || 
      this.isModified("behavioralTendencies") || 
      this.isModified("adaptationRules") ||
      this.isModified("intent")) {
    this.version = (this.version || 1) + 1;
  }
  this.lastUpdated = new Date();
  next();
});

export const Personalization = mongoose.models.Personalization || 
  model<IPersonalization>("Personalization", PersonalizationSchema);

