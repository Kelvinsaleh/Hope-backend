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
exports.deleteChatSession = exports.completeChatSession = exports.getAllChatSessions = exports.getChatHistory = exports.sendMessage = exports.getChatSession = exports.createChatSession = void 0;
const ChatSession_1 = require("../models/ChatSession");
const mongoose_1 = require("mongoose");
const logger_1 = require("../utils/logger");
const hopePersonality_1 = require("../utils/hopePersonality");
const chatTitleGenerator_1 = require("../utils/chatTitleGenerator");
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
                title: session.title,
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
        let aiResponse = "Tell me what's happening. I'm listening.";
        try {
            const { GoogleGenerativeAI } = await Promise.resolve().then(() => __importStar(require('@google/generative-ai')));
            if (!process.env.GEMINI_API_KEY) {
                logger_1.logger.error("GEMINI_API_KEY environment variable is not set!");
                throw new Error("GEMINI_API_KEY not configured");
            }
            logger_1.logger.info("Initializing Gemini AI with key:", process.env.GEMINI_API_KEY.substring(0, 10) + "...");
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash"
            });
            logger_1.logger.info("Gemini model initialized successfully");
            // Get conversation history (last 12 messages for better context)
            const conversationHistory = session.messages
                .slice(-12)
                .map(msg => `${msg.role}: ${msg.content}`)
                .join('\n');
            // Fetch user's context for better memory and therapeutic insight
            let userContext = "";
            let currentUserMood = "neutral";
            try {
                // Get current mood from most recent mood entry
                const { Mood } = await Promise.resolve().then(() => __importStar(require('../models/Mood')));
                const latestMood = await Mood.findOne({ userId })
                    .sort({ timestamp: -1 })
                    .select('score timestamp');
                if (latestMood) {
                    currentUserMood = (0, hopePersonality_1.normalizeMood)(latestMood.score || 5);
                    userContext += `\n**Current Mood:** ${currentUserMood} (${latestMood.score}/10)\n`;
                }
                // Get mood patterns (last 7 days) to understand emotional trajectory
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const recentMoods = await Mood.find({
                    userId,
                    timestamp: { $gte: weekAgo }
                })
                    .sort({ timestamp: -1 })
                    .limit(10)
                    .select('score timestamp');
                if (recentMoods.length > 1) {
                    const avgMood = recentMoods.reduce((sum, m) => sum + (m.score || 5), 0) / recentMoods.length;
                    const moodTrend = recentMoods[0].score > avgMood ? 'improving' : recentMoods[0].score < avgMood ? 'declining' : 'stable';
                    userContext += `**Mood Pattern:** ${moodTrend} (avg ${avgMood.toFixed(1)}/10 past week)\n`;
                }
                // Get recent journal entries for emotional themes
                const { JournalEntry } = await Promise.resolve().then(() => __importStar(require('../models/JournalEntry')));
                const recentJournals = await JournalEntry.find({ userId })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .select('content mood tags createdAt');
                if (recentJournals.length > 0) {
                    // Extract recurring themes from tags
                    const allTags = recentJournals.flatMap(j => j.tags || []);
                    const tagCounts = {};
                    allTags.forEach(tag => {
                        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                    });
                    const topThemes = Object.entries(tagCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([tag]) => tag);
                    if (topThemes.length > 0) {
                        userContext += `**Recurring Themes:** ${topThemes.join(', ')}\n`;
                    }
                    // Add brief journal context
                    userContext += `**Recent Journal Entries:** ${recentJournals.length} entries in recent days\n`;
                }
                // Get previous chat sessions summary for continuity
                const previousSessions = await ChatSession_1.ChatSession.find({
                    userId,
                    sessionId: { $ne: sessionId },
                    messages: { $exists: true, $ne: [] }
                })
                    .sort({ startTime: -1 })
                    .limit(2)
                    .select('messages startTime');
                if (previousSessions.length > 0) {
                    userContext += `**Session History:** ${previousSessions.length} recent sessions\n`;
                    // Extract key topics from previous sessions
                    const topics = new Set();
                    previousSessions.forEach(sess => {
                        sess.messages.filter(m => m.role === 'user').slice(-3).forEach(msg => {
                            const content = msg.content.toLowerCase();
                            if (content.includes('work') || content.includes('job'))
                                topics.add('work stress');
                            if (content.includes('relationship') || content.includes('partner'))
                                topics.add('relationships');
                            if (content.includes('family'))
                                topics.add('family');
                            if (content.includes('anxious') || content.includes('anxiety'))
                                topics.add('anxiety');
                            if (content.includes('sleep'))
                                topics.add('sleep issues');
                            if (content.includes('goal') || content.includes('want to'))
                                topics.add('personal goals');
                        });
                    });
                    if (topics.size > 0) {
                        userContext += `**Past Discussion Topics:** ${Array.from(topics).slice(0, 3).join(', ')}\n`;
                    }
                }
            }
            catch (contextError) {
                logger_1.logger.warn("Could not fetch user context:", contextError);
            }
            // Build the mood-adaptive Hope prompt with emotional intelligence
            const enhancedPrompt = (0, hopePersonality_1.buildHopePrompt)(currentUserMood, conversationHistory + `\n\nUser: ${message}`, userContext);
            logger_1.logger.info("Sending request to Gemini AI...");
            logger_1.logger.info(`Prompt length: ${enhancedPrompt.length} characters`);
            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: enhancedPrompt }] }],
                generationConfig: {
                    temperature: 0.8,
                    topP: 0.95,
                },
            });
            const response = await result.response;
            const generatedText = response.text()?.trim();
            logger_1.logger.info(`Raw AI response length: ${generatedText?.length || 0}`);
            // Validate response is not empty
            if (generatedText && generatedText.length > 0) {
                aiResponse = generatedText;
                logger_1.logger.info(`AI response generated for session ${sessionId} with enhanced memory context`);
            }
            else {
                logger_1.logger.warn("AI returned empty response, using fallback");
                logger_1.logger.warn(`Response object: ${JSON.stringify(response)}`);
            }
        }
        catch (aiError) {
            logger_1.logger.error("AI response generation failed:", {
                error: aiError.message || aiError,
                stack: aiError.stack,
                name: aiError.name
            });
            // Keep using fallback response
        }
        // Final validation: ensure response is never empty
        if (!aiResponse || aiResponse.trim().length === 0) {
            aiResponse = "I'm here with you. What's on your mind?";
            logger_1.logger.warn(`Using fallback response for session ${sessionId} due to empty AI response`);
        }
        // Add AI response to session
        const assistantMessage = {
            role: "assistant",
            content: aiResponse,
            timestamp: new Date(),
            metadata: {}
        };
        session.messages.push(assistantMessage);
        // Generate title after a few messages if not already set
        if ((0, chatTitleGenerator_1.shouldGenerateTitle)(session.messages.length, session.title)) {
            try {
                logger_1.logger.info(`Generating title for session ${sessionId} with ${session.messages.length} messages`);
                const title = await (0, chatTitleGenerator_1.generateChatTitle)(session.messages.map(m => ({
                    role: m.role,
                    content: m.content
                })));
                session.title = title;
                logger_1.logger.info(`Generated title: "${title}" for session ${sessionId}`);
            }
            catch (titleError) {
                logger_1.logger.warn(`Failed to generate title for session ${sessionId}:`, titleError);
                // Continue without title - not critical
            }
        }
        await session.save();
        logger_1.logger.info(`Message and AI response added to session: ${sessionId}`);
        res.json({
            success: true,
            message: "Message sent",
            response: aiResponse,
            title: session.title, // Include generated title
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
        // Fetch all sessions
        const allSessions = await ChatSession_1.ChatSession.find({
            userId
        }).sort({ startTime: -1 });
        // Filter out empty sessions (sessions with no messages)
        const sessionsWithMessages = allSessions.filter(session => session.messages && session.messages.length > 0);
        logger_1.logger.info(`Found ${sessionsWithMessages.length} non-empty sessions (out of ${allSessions.length} total) for user: ${userId}`);
        // Clean up old empty sessions (older than 1 hour) in the background
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        ChatSession_1.ChatSession.deleteMany({
            userId,
            messages: { $size: 0 },
            createdAt: { $lt: oneHourAgo }
        }).catch(err => logger_1.logger.warn("Failed to cleanup empty sessions:", err));
        // Generate titles for sessions without them (background task)
        const sessionsNeedingTitles = sessionsWithMessages.filter(session => !session.title && session.messages.length >= 3);
        if (sessionsNeedingTitles.length > 0) {
            // Generate titles in background (don't await - don't block response)
            Promise.all(sessionsNeedingTitles.slice(0, 5).map(async (session) => {
                try {
                    const title = await (0, chatTitleGenerator_1.generateChatTitle)(session.messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })));
                    await ChatSession_1.ChatSession.updateOne({ _id: session._id }, { $set: { title } });
                    logger_1.logger.info(`Generated title for existing session ${session.sessionId}: "${title}"`);
                }
                catch (error) {
                    logger_1.logger.warn(`Failed to generate title for session ${session.sessionId}:`, error);
                }
            })).catch(err => logger_1.logger.error("Background title generation failed:", err));
        }
        res.json({
            success: true,
            sessions: sessionsWithMessages.map(session => ({
                id: session.sessionId,
                userId: session.userId.toString(),
                title: session.title || null,
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
// Delete a chat session
const deleteChatSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const session = await ChatSession_1.ChatSession.findOneAndDelete({
            sessionId,
            userId
        });
        if (!session) {
            return res.status(404).json({
                success: false,
                message: "Chat session not found"
            });
        }
        logger_1.logger.info(`Chat session deleted: ${sessionId} for user: ${userId}`);
        res.json({
            success: true,
            message: "Chat session deleted successfully"
        });
    }
    catch (error) {
        logger_1.logger.error("Delete chat session error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete chat session",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.deleteChatSession = deleteChatSession;
