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
exports.completeChatSession = exports.getAllChatSessions = exports.getChatHistory = exports.sendMessage = exports.getChatSession = exports.createChatSession = void 0;
const ChatSession_1 = require("../models/ChatSession");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
const createChatSession = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newSession = new ChatSession_1.ChatSession({
            sessionId,
            userId,
            startTime: new Date(),
            status: "active",
            messages: []
        });
        await newSession.save();
        logger_1.logger.info(`Chat session created: ${sessionId} for user: ${userId}`);
        res.status(201).json({
            success: true,
            message: "Chat session created",
            sessionId,
            session: {
                id: sessionId,
                userId: userId.toString(),
                status: "active",
                startTime: newSession.startTime,
                messages: []
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Create chat session error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create chat session",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.createChatSession = createChatSession;
const getChatSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const session = await ChatSession_1.ChatSession.findOne({
            sessionId,
            userId
        });
        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Chat session not found"
            });
        }
        res.json({
            success: true,
            session: {
                id: session.sessionId,
                userId: session.userId.toString(),
                status: session.status,
                startTime: session.startTime,
                messages: session.messages
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Get chat session error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get chat session",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getChatSession = getChatSession;
const sendMessage = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { message, role = "user" } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const session = await ChatSession_1.ChatSession.findOne({
            sessionId,
            userId
        });
        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Chat session not found"
            });
        }
        // Add user message to session
        const userMessage = {
            role: "user",
            content: message,
            timestamp: new Date(),
            metadata: {}
        };
        session.messages.push(userMessage);
        // Generate AI response using Gemini with enhanced memory
        let aiResponse = "I'm here to support you. Could you tell me more about what's on your mind?";
        try {
            const { GoogleGenerativeAI } = await Promise.resolve().then(() => __importStar(require('@google/generative-ai')));
            if (!process.env.GEMINI_API_KEY) {
                logger_1.logger.error("GEMINI_API_KEY environment variable is not set!");
                throw new Error("GEMINI_API_KEY not configured");
            }
            logger_1.logger.info("Initializing Gemini AI with key:", process.env.GEMINI_API_KEY.substring(0, 10) + "...");
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            logger_1.logger.info("Gemini model initialized successfully");
            // Get ALL conversation history for full context (not just last 10)
            const conversationHistory = session.messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
            // Fetch user's long-term context for better memory
            let userContext = "";
            try {
                // Get recent journal entries
                const { JournalEntry } = await Promise.resolve().then(() => __importStar(require('../models/JournalEntry')));
                const recentJournals = await JournalEntry.find({ userId })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .select('content mood tags createdAt');
                if (recentJournals.length > 0) {
                    userContext += "\n\n**Recent Journal Entries:**\n";
                    recentJournals.forEach(journal => {
                        userContext += `- [${new Date(journal.createdAt).toLocaleDateString()}] Mood: ${journal.mood}, Topics: ${journal.tags?.join(', ') || 'none'}\n`;
                    });
                }
                // Get recent mood patterns
                const { Mood } = await Promise.resolve().then(() => __importStar(require('../models/Mood')));
                const recentMoods = await Mood.find({ userId })
                    .sort({ timestamp: -1 })
                    .limit(7)
                    .select('score timestamp');
                if (recentMoods.length > 0) {
                    const avgMood = recentMoods.reduce((sum, m) => sum + (m.score || 50), 0) / recentMoods.length;
                    userContext += `\n**Recent Mood Pattern:** Average mood ${avgMood.toFixed(1)}/100 over past week\n`;
                }
                // Get summary of previous sessions
                const previousSessions = await ChatSession_1.ChatSession.find({
                    userId,
                    sessionId: { $ne: sessionId },
                    status: 'completed'
                })
                    .sort({ startTime: -1 })
                    .limit(3)
                    .select('messages startTime');
                if (previousSessions.length > 0) {
                    userContext += "\n**Key Topics from Recent Sessions:**\n";
                    previousSessions.forEach((prevSession, idx) => {
                        const topics = new Set();
                        prevSession.messages.slice(-5).forEach(msg => {
                            if (msg.role === 'user') {
                                const content = msg.content.toLowerCase();
                                if (content.includes('anxiety') || content.includes('worried'))
                                    topics.add('anxiety');
                                if (content.includes('depress') || content.includes('sad'))
                                    topics.add('mood');
                                if (content.includes('work') || content.includes('job'))
                                    topics.add('work stress');
                                if (content.includes('relationship') || content.includes('family'))
                                    topics.add('relationships');
                                if (content.includes('sleep'))
                                    topics.add('sleep');
                            }
                        });
                        if (topics.size > 0) {
                            userContext += `- Session ${idx + 1}: ${Array.from(topics).join(', ')}\n`;
                        }
                    });
                }
            }
            catch (contextError) {
                logger_1.logger.warn("Could not fetch user context:", contextError);
            }
            const enhancedPrompt = `You are a supportive, empathetic AI therapist with memory of the user's journey. Your role is to:
1. Remember previous conversations and reference them naturally
2. Show continuity by recalling what the user has shared before
3. Track their progress and emotional patterns over time
4. Provide personalized, contextual support based on their history
5. Use therapeutic techniques like active listening, validation, and cognitive reframing

**User Context:**${userContext || "\n(First session - building initial rapport)"}

**Current Conversation:**
${conversationHistory}

User: ${message}

Please provide a warm, supportive response that:
- References relevant past discussions if applicable
- Shows you remember their ongoing concerns
- Offers specific, actionable support
- Validates their feelings
- Helps them progress toward their goals

Keep your response conversational (2-4 paragraphs), empathetic, and focused on the user's current message while maintaining therapeutic continuity.`;
            logger_1.logger.info("Sending request to Gemini AI...");
            const result = await model.generateContent(enhancedPrompt);
            const response = await result.response;
            aiResponse = response.text();
            logger_1.logger.info(`AI response generated for session ${sessionId} with enhanced memory context`);
        }
        catch (aiError) {
            logger_1.logger.error("AI response generation failed:", {
                error: aiError.message || aiError,
                stack: aiError.stack,
                name: aiError.name
            });
            // Keep using fallback response
        }
        // Add AI response to session
        const assistantMessage = {
            role: "assistant",
            content: aiResponse,
            timestamp: new Date(),
            metadata: {}
        };
        session.messages.push(assistantMessage);
        await session.save();
        logger_1.logger.info(`Message and AI response added to session: ${sessionId}`);
        res.json({
            success: true,
            message: "Message sent",
            response: aiResponse,
            analysis: {
                emotionalState: "neutral",
                riskLevel: 0,
                themes: [],
                recommendedApproach: "supportive",
                progressIndicators: []
            },
            metadata: {
                technique: "supportive",
                goal: "Provide support",
                progress: {
                    emotionalState: "neutral",
                    riskLevel: 0
                }
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Send message error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send message",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.sendMessage = sendMessage;
const getChatHistory = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const session = await ChatSession_1.ChatSession.findOne({
            sessionId,
            userId
        });
        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Chat session not found"
            });
        }
        res.json({
            success: true,
            history: session.messages
        });
    }
    catch (error) {
        logger_1.logger.error("Get chat history error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get chat history",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getChatHistory = getChatHistory;
const getAllChatSessions = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const sessions = await ChatSession_1.ChatSession.find({
            userId
        }).sort({ startTime: -1 });
        res.json({
            success: true,
            sessions: sessions.map(session => ({
                id: session.sessionId,
                userId: session.userId.toString(),
                status: session.status,
                startTime: session.startTime,
                messageCount: session.messages.length,
                lastMessage: session.messages.length > 0 ? session.messages[session.messages.length - 1] : null
            }))
        });
    }
    catch (error) {
        logger_1.logger.error("Get all chat sessions error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get chat sessions",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.getAllChatSessions = getAllChatSessions;
// Complete a chat session
const completeChatSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const session = await ChatSession_1.ChatSession.findOneAndUpdate({ sessionId, userId }, {
            status: "completed",
            endTime: new Date()
        }, { new: true });
        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Chat session not found"
            });
        }
        logger_1.logger.info(`Chat session completed: ${sessionId} for user: ${userId}`);
        res.json({
            success: true,
            message: "Chat session completed",
            session: {
                id: session.sessionId,
                status: session.status,
                startTime: session.startTime,
                endTime: session.endTime,
                messageCount: session.messages.length
            }
        });
    }
    catch (error) {
        logger_1.logger.error("Complete chat session error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to complete chat session",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.completeChatSession = completeChatSession;
