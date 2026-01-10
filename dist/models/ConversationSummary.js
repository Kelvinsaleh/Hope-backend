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
exports.ConversationSummary = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ConversationSummarySchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
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
exports.ConversationSummary = mongoose_1.default.models.ConversationSummary ||
    (0, mongoose_1.model)("ConversationSummary", ConversationSummarySchema);
