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
exports.UserProfile = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const UserProfileSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    bio: { type: String, required: true, maxlength: 500 },
    age: { type: Number, required: true, min: 18, max: 100 },
    challenges: [{ type: String }],
    goals: [{ type: String }],
    communicationStyle: { type: String, enum: ["gentle", "direct", "supportive"], required: true },
    experienceLevel: { type: String, enum: ["beginner", "intermediate", "experienced"], required: true },
    interests: [{ type: String }],
    availability: {
        timezone: { type: String, required: true },
        preferredTimes: [{ type: String }],
        daysAvailable: [{ type: String }]
    },
    matchingPreferences: {
        ageRange: {
            min: { type: Number, default: 18 },
            max: { type: Number, default: 100 }
        },
        challenges: [{ type: String }],
        goals: [{ type: String }],
        communicationStyle: [{ type: String }],
        experienceLevel: [{ type: String }]
    },
    safetySettings: {
        allowEmergencySupport: { type: Boolean, default: false },
        requireVerification: { type: Boolean, default: true },
        maxDistance: { type: Number, default: 0 }
    },
    isVerified: { type: Boolean, default: false },
    verificationDate: { type: Date },
    lastActive: { type: Date, default: Date.now },
    status: { type: String, enum: ["online", "away", "offline", "busy"], default: "offline" }
}, { timestamps: true });
exports.UserProfile = mongoose_1.default.models.UserProfile || mongoose_1.default.model("UserProfile", UserProfileSchema);
