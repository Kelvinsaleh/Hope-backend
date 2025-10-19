"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const MONGODB_URI = process.env.MONGODB_URI ||
    "mongodb+srv://knsalee:SyB11T1OcCTa0BGz@hope-ai.yzbppbz.mongodb.net/?retryWrites=true&w=majority&appName=HOPE-AI";
const connectDB = async () => {
    try {
        await mongoose_1.default.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
            socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        });
        console.info("Connected to MongoDB Atlas");
    }
    catch (error) {
        console.error("MongoDB connection error:", error);
        console.warn("Continuing without database connection for testing...");
        // Don't exit process for now, allow server to start
    }
};
exports.connectDB = connectDB;
