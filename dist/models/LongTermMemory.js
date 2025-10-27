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
exports.LongTermMemoryModel = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const LongTermMemorySchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ['emotional_theme', 'coping_pattern', 'goal', 'trigger', 'insight', 'preference'],
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
}, {
    timestamps: true,
});
// Compound index for efficient querying
LongTermMemorySchema.index({ userId: 1, importance: -1, timestamp: -1 });
LongTermMemorySchema.index({ userId: 1, tags: 1 });
// Text index for content search
LongTermMemorySchema.index({ content: 'text', tags: 'text' });
exports.LongTermMemoryModel = mongoose_1.default.model('LongTermMemory', LongTermMemorySchema);
