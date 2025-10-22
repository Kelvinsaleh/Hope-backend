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
exports.User = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const UserSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isEmailVerified: { type: Boolean, default: false },
    verificationCode: { type: String },
    verificationCodeExpiry: { type: Date },
    lastActive: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ['online', 'away', 'offline', 'suspended'],
        default: 'offline'
    },
    subscription: {
        isActive: { type: Boolean, default: false },
        tier: { type: String, enum: ['free', 'premium'], default: 'free' },
        subscriptionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Subscription' },
        planId: { type: String },
        activatedAt: { type: Date },
        expiresAt: { type: Date }
    },
    blockedUsers: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
    suspendedAt: { type: Date },
    suspensionReason: { type: String },
    suspensionDuration: { type: String }
}, { timestamps: true });
// Index for performance
UserSchema.index({ email: 1 });
UserSchema.index({ 'subscription.isActive': 1 });
UserSchema.index({ status: 1 });
exports.User = mongoose_1.default.model("User", UserSchema);
