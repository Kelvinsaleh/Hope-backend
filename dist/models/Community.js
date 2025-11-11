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
exports.CommunityPrompt = exports.CommunityChallenge = exports.CommunityComment = exports.CommunityPost = exports.CommunitySpace = void 0;
const mongoose_1 = __importStar(require("mongoose"));
// Community Space Schema
const CommunitySpaceSchema = new mongoose_1.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    color: { type: String, required: true },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});
// Community Post Schema
const CommunityPostSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    spaceId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunitySpace', required: true },
    content: { type: String, required: true, maxlength: 2000 },
    mood: { type: String },
    isAnonymous: { type: Boolean, default: false },
    images: [{ type: String }], // Array of image URLs
    reactions: {
        heart: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
        support: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
        growth: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }]
    },
    comments: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunityComment' }],
    aiReflection: { type: String },
    isModerated: { type: Boolean, default: false },
    shareCount: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date }
}, {
    timestamps: true
});
// Community Comment Schema
const CommunityCommentSchema = new mongoose_1.Schema({
    postId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 300 },
    isAnonymous: { type: Boolean, default: false },
    parentCommentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunityComment' }, // For nested replies
    images: [{ type: String }], // Array of image URLs
    reactions: {
        heart: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
        support: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }]
    },
    isModerated: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date }
}, {
    timestamps: true
});
// Community Challenge Schema
const CommunityChallengeSchema = new mongoose_1.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    spaceId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunitySpace', required: true },
    duration: { type: Number, required: true },
    participants: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
    participantProgress: [{
            userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
            completedDays: { type: Number, default: 0 },
            totalDays: { type: Number },
            joinedAt: { type: Date, default: Date.now }
        }],
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }
}, {
    timestamps: true
});
// Community Prompt Schema
const CommunityPromptSchema = new mongoose_1.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    spaceId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunitySpace', required: true },
    isActive: { type: Boolean, default: true },
    responses: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'CommunityPost' }]
}, {
    timestamps: true
});
// Indexes for performance
CommunityPostSchema.index({ spaceId: 1, createdAt: -1 });
CommunityPostSchema.index({ userId: 1, createdAt: -1 });
CommunityPostSchema.index({ isDeleted: 1 });
CommunityCommentSchema.index({ postId: 1, createdAt: 1 });
CommunityCommentSchema.index({ parentCommentId: 1, createdAt: 1 });
CommunityCommentSchema.index({ isDeleted: 1 });
exports.CommunitySpace = mongoose_1.default.model('CommunitySpace', CommunitySpaceSchema);
exports.CommunityPost = mongoose_1.default.model('CommunityPost', CommunityPostSchema);
exports.CommunityComment = mongoose_1.default.model('CommunityComment', CommunityCommentSchema);
exports.CommunityChallenge = mongoose_1.default.model('CommunityChallenge', CommunityChallengeSchema);
exports.CommunityPrompt = mongoose_1.default.model('CommunityPrompt', CommunityPromptSchema);
