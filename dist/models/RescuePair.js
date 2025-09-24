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
exports.RescuePair = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const RescuePairSchema = new mongoose_1.Schema({
    user1Id: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    user2Id: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
        type: String,
        enum: ["pending", "active", "paused", "ended", "rejected"],
        default: "pending"
    },
    compatibilityScore: { type: Number, min: 0, max: 100, default: 0 },
    sharedChallenges: [{ type: String }],
    complementaryGoals: [{ type: String }],
    communicationStyle: {
        type: String,
        enum: ["gentle", "direct", "supportive"],
        required: true
    },
    experienceLevel: {
        type: String,
        enum: ["beginner", "intermediate", "experienced"],
        required: true
    },
    trustLevel: { type: Number, min: 0, max: 100, default: 0 },
    emergencySupport: { type: Boolean, default: false },
    nextCheckIn: { type: Date },
    totalCheckIns: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    matchDate: { type: Date, default: Date.now },
    safetyScore: { type: Number, min: 1, max: 10, default: 5 },
    isVerified: { type: Boolean, default: false },
    acceptedAt: { type: Date },
    endedAt: { type: Date },
}, { timestamps: true });
exports.RescuePair = mongoose_1.default.model("RescuePair", RescuePairSchema);
