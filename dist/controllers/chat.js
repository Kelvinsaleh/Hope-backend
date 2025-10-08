"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllChatSessions = exports.getChatHistory = exports.getChatSession = exports.getSessionHistory = exports.sendMessage = exports.createChatSession = void 0;
const ChatSession_1 = require("../models/ChatSession");
const generative_ai_1 = require("@google/generative-ai");
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
const client_1 = require("../inngest/client");
const User_1 = require("../models/User");
const mongoose_1 = require("mongoose");
// Initialize Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDMHmeOCxXaoCuoebM4t4V0qYdXK4a7S78";
const genAI = new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY);
// Create a new chat session
const createChatSession = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user || !req.user._id) {
            return res
                .status(401)
                .json({ message: "Unauthorized - User not authenticated" });
        }
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const user = await User_1.User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Generate a unique sessionId
        const sessionId = (0, uuid_1.v4)();
        const session = new ChatSession_1.ChatSession({
            sessionId,
            userId,
            startTime: new Date(),
            status: "active",
            messages: [],
        });
        await session.save();
        res.status(201).json({
            message: "Chat session created successfully",
            sessionId: session.sessionId,
        });
    }
    catch (error) {
        logger_1.logger.error("Error creating chat session:", error);
        res.status(500).json({
            message: "Error creating chat session",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.createChatSession = createChatSession;
// Send a message in the chat session
const sendMessage = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { message } = req.body;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        logger_1.logger.info("Processing message:", { sessionId, message });
        // Find session by sessionId
        const session = await ChatSession_1.ChatSession.findOne({ sessionId });
        if (!session) {
            logger_1.logger.warn("Session not found:", { sessionId });
            return res.status(404).json({ message: "Session not found" });
        }
        if (session.userId.toString() !== userId.toString()) {
            logger_1.logger.warn("Unauthorized access attempt:", { sessionId, userId });
            return res.status(403).json({ message: "Unauthorized" });
        }
        // Create Inngest event for message processing
        const event = {
            name: "therapy/session.message",
            data: {
                message,
                history: session.messages,
                memory: {
                    userProfile: {
                        emotionalState: [],
                        riskLevel: 0,
                        preferences: {},
                    },
                    sessionContext: {
                        conversationThemes: [],
                        currentTechnique: null,
                    },
                },
                goals: [],
                systemPrompt: `You are an AI therapist assistant. Your role is to:
        1. Provide empathetic and supportive responses
        2. Use evidence-based therapeutic techniques
        3. Maintain professional boundaries
        4. Monitor for risk factors
        5. Guide users toward their therapeutic goals`,
            },
        };
        logger_1.logger.info("Sending message to Inngest:", { event });
        // Send event to Inngest for logging and analytics
        await client_1.inngest.send(event);
        // Process the message directly using Gemini - Use gemini-1.5-flash for better performance
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        // Simple response without complex analysis to avoid rate limits
        const responsePrompt = `You are Hope, a supportive AI therapist. Respond to this message with empathy and helpful guidance:

Message: ${message}

Provide a brief, supportive response that:
1. Shows understanding and empathy
2. Offers practical advice
3. Maintains professional boundaries
4. Encourages further conversation

Keep your response conversational and warm, but professional.`;
        logger_1.logger.info("Generating AI response...");
        let response;
        try {
            const responseResult = await model.generateContent(responsePrompt);
            response = responseResult.response.text().trim();
            logger_1.logger.info("Generated response successfully, length:", response.length);
        }
        catch (aiError) {
            logger_1.logger.error("AI generation failed:", aiError.message);
            // Handle quota/rate limit errors
            if (aiError.message?.includes('429') || aiError.message?.includes('Quota exceeded') || aiError.message?.includes('RATE_LIMIT_EXCEEDED')) {
                logger_1.logger.warn("API quota exceeded, using fallback response");
                response = "I'm experiencing high demand right now, but I'm here to support you. Your message is important to me. Please try again in a moment, or consider reaching out to a mental health professional for immediate support. Take care of yourself.";
                return res.json({
                    response,
                    message: response,
                    analysis: {
                        emotionalState: "neutral",
                        themes: [],
                        riskLevel: 0,
                        recommendedApproach: "supportive",
                        progressIndicators: [],
                    },
                    metadata: {
                        progress: {
                            emotionalState: "neutral",
                            riskLevel: 0,
                        },
                    },
                    isFallback: true
                });
            }
            // For other errors, throw to be caught by outer try-catch
            throw aiError;
        }
        // Add message to session history
        session.messages.push({
            role: "user",
            content: message,
            timestamp: new Date(),
        });
        session.messages.push({
            role: "assistant",
            content: response,
            timestamp: new Date(),
            metadata: {
                analysis: {
                    emotionalState: "neutral",
                    themes: [],
                    riskLevel: 0,
                    recommendedApproach: "supportive",
                    progressIndicators: [],
                },
                progress: {
                    emotionalState: "neutral",
                    riskLevel: 0,
                },
            },
        });
        // Save the updated session
        await session.save();
        logger_1.logger.info("Session updated successfully:", { sessionId });
        // Return the response
        res.json({
            response,
            message: response,
            analysis: {
                emotionalState: "neutral",
                themes: [],
                riskLevel: 0,
                recommendedApproach: "supportive",
                progressIndicators: [],
            },
            metadata: {
                progress: {
                    emotionalState: "neutral",
                    riskLevel: 0,
                },
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Error in sendMessage:", error);
        res.status(500).json({
            message: "Error processing message",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
};
exports.sendMessage = sendMessage;
// Get chat session history
const getSessionHistory = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        const session = (await ChatSession_1.ChatSession.findById(sessionId).exec());
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        if (session.userId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Unauthorized" });
        }
        res.json({
            messages: session.messages,
            startTime: session.startTime,
            status: session.status,
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching session history:", error);
        res.status(500).json({ message: "Error fetching session history" });
    }
};
exports.getSessionHistory = getSessionHistory;
const getChatSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        logger_1.logger.info(`Getting chat session: ${sessionId}`);
        const chatSession = await ChatSession_1.ChatSession.findOne({ sessionId });
        if (!chatSession) {
            logger_1.logger.warn(`Chat session not found: ${sessionId}`);
            return res.status(404).json({ error: "Chat session not found" });
        }
        logger_1.logger.info(`Found chat session: ${sessionId}`);
        res.json(chatSession);
    }
    catch (error) {
        logger_1.logger.error("Failed to get chat session:", error);
        res.status(500).json({ error: "Failed to get chat session" });
    }
};
exports.getChatSession = getChatSession;
const getChatHistory = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        // Find session by sessionId instead of _id
        const session = await ChatSession_1.ChatSession.findOne({ sessionId });
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        if (session.userId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Unauthorized" });
        }
        res.json(session.messages);
    }
    catch (error) {
        logger_1.logger.error("Error fetching chat history:", error);
        res.status(500).json({ message: "Error fetching chat history" });
    }
};
exports.getChatHistory = getChatHistory;
const getAllChatSessions = async (req, res) => {
    try {
        const userId = new mongoose_1.Types.ObjectId(req.user._id);
        logger_1.logger.info(`Fetching all chat sessions for user ${userId}`);
        // Get all chat sessions for the user, sorted by most recent
        const sessions = await ChatSession_1.ChatSession.find({ userId })
            .sort({ startTime: -1 })
            .lean();
        logger_1.logger.info(`Found ${sessions.length} chat sessions for user`);
        // Format the sessions for the frontend
        const formattedSessions = sessions.map(session => ({
            sessionId: session.sessionId,
            messages: session.messages || [],
            createdAt: session.startTime,
            updatedAt: session.startTime, // Use startTime as updatedAt for now
            status: session.status || 'active'
        }));
        res.json(formattedSessions);
    }
    catch (error) {
        logger_1.logger.error("Error fetching all chat sessions:", error);
        res.status(500).json({ message: "Error fetching chat sessions" });
    }
};
exports.getAllChatSessions = getAllChatSessions;
