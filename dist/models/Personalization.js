"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Personalization = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const BehavioralTendencySchema = new mongoose_1.Schema({
    pattern: { type: String, required: true },
    frequency: { type: Number, required: true, min: 0, max: 1 },
    confidence: { type: Number, required: true, min: 0, max: 1, default: 0.5 },
    firstObserved: { type: Date, required: true, default: Date.now },
    lastObserved: { type: Date, required: true, default: Date.now },
    sampleSize: { type: Number, required: true, default: 1 },
}, { _id: false });
const TimePatternSchema = new mongoose_1.Schema({
    hourOfDay: { type: [Number], default: [] },
    dayOfWeek: { type: [Number], default: [] },
    sessionDuration: {
        average: { type: Number, default: 0 },
        typicalRange: { type: [Number], default: [0, 0] },
    },
    lastActiveTime: { type: Date },
    timezone: { type: String },
}, { _id: false });
const CommunicationPreferencesSchema = new mongoose_1.Schema({
    style: { type: String, enum: ["gentle", "direct", "supportive"], default: "gentle" },
    inferredStyle: { type: String, enum: ["gentle", "direct", "supportive"] },
    verbosity: { type: String, enum: ["concise", "moderate", "detailed"], default: "moderate" },
    responseFormat: { type: String, enum: ["conversational", "structured", "mixed"], default: "conversational" },
    emojiUsage: { type: String, enum: ["none", "minimal", "moderate", "frequent"], default: "minimal" },
    topicsToAvoid: { type: [String], default: [] },
    preferredTopics: { type: [String], default: [] },
}, { _id: false });
const EngagementMetricsSchema = new mongoose_1.Schema({
    averageSessionLength: { type: Number, default: 0 },
    messagesPerSession: { type: Number, default: 0 },
    sessionFrequency: { type: Number, default: 0 },
    responseQuality: { type: Number, default: 0.5, min: 0, max: 1 },
    lastEngagement: { type: Date, default: Date.now },
    engagementTrend: { type: String, enum: ["increasing", "stable", "decreasing"], default: "stable" },
}, { _id: false });
const UserIntentSchema = new mongoose_1.Schema({
    primaryGoals: { type: [String], default: [] },
    currentFocus: { type: [String], default: [] },
    priorities: { type: Map, of: Number, default: {} },
    lastGoalsUpdate: { type: Date, default: Date.now },
}, { _id: false });
const AdaptationRuleSchema = new mongoose_1.Schema({
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
const PersonalizationSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    intent: { type: UserIntentSchema, required: true, default: () => ({}) },
    communication: { type: CommunicationPreferencesSchema, required: true, default: () => ({}) },
    behavioralTendencies: { type: [BehavioralTendencySchema], default: [] },
    timePatterns: { type: TimePatternSchema, default: () => ({}) },
    engagement: { type: EngagementMetricsSchema, required: true, default: () => ({}) },
    adaptationRules: { type: [AdaptationRuleSchema], default: [] },
    userOverrides: {
        type: Map,
        of: mongoose_1.Schema.Types.Mixed,
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
PersonalizationSchema.pre("save", function (next) {
    if (this.isModified("communication") ||
        this.isModified("behavioralTendencies") ||
        this.isModified("adaptationRules") ||
        this.isModified("intent")) {
        this.version = (this.version || 1) + 1;
    }
    this.lastUpdated = new Date();
    next();
});
exports.Personalization = mongoose_1.default.models.Personalization ||
    (0, mongoose_1.model)("Personalization", PersonalizationSchema);
