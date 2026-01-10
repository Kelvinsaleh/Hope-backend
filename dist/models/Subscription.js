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
exports.Subscription = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const SubscriptionSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    planId: {
        type: String,
        required: true,
        enum: ['monthly', 'annually']
    },
    planName: { type: String, required: true },
    amount: { type: Number, required: true }, // Amount in base currency (USD)
    currency: { type: String, default: 'USD', enum: ['USD', 'KES'] },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'active', 'cancelled', 'expired'],
        default: 'pending',
        index: true
    },
    startDate: { type: Date },
    expiresAt: { type: Date, index: true },
    activatedAt: { type: Date },
    paystackReference: { type: String, index: true },
    paystackAccessCode: { type: String },
    paystackTransactionId: { type: String },
    paystackSubscriptionCode: { type: String, index: true },
    paystackData: { type: mongoose_1.Schema.Types.Mixed }
}, { timestamps: true });
// Index for efficient querying
SubscriptionSchema.index({ userId: 1, status: 1, expiresAt: 1 });
exports.Subscription = mongoose_1.default.models.Subscription || mongoose_1.default.model("Subscription", SubscriptionSchema);
