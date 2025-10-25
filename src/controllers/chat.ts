import { Request, Response } from "express";
import { ChatSession, IChatMessage } from "../models/ChatSession";
import { Types } from "mongoose";
import { logger } from "../utils/logger";
import { buildHopePrompt, normalizeMood } from "../utils/hopePersonality";
import { 
  getRelevantLongTermMemories, 
  getShortTermMemory, 
  buildSystemMemory,
  extractAndStoreInsights 
} from "../utils/memoryLayers";

export const createChatSession = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newSession = new ChatSession({
      sessionId,
      userId,
      startTime: new Date(),
      status: "active",
      messages: []
    });

    await newSession.save();

    logger.info(`Chat session created: ${sessionId} for user: ${userId}`);

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
  } catch (error) {
    logger.error("Create chat session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create chat session",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getChatSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    const session = await ChatSession.findOne({ 
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
  } catch (error) {
    logger.error("Get chat session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get chat session",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { message, role = "user" } = req.body;
    const userId = new Types.ObjectId(req.user._id);

    const session = await ChatSession.findOne({ 
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
    const userMessage: IChatMessage = {
      role: "user" as const,
      content: message,
      timestamp: new Date(),
      metadata: {}
    };

    session.messages.push(userMessage);

    // Generate AI response using Gemini with enhanced memory
    let aiResponse = "I'm here to support you. What's on your mind today?";
    
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      
      if (!process.env.GEMINI_API_KEY) {
        logger.error("GEMINI_API_KEY environment variable is not set!");
        throw new Error("GEMINI_API_KEY not configured");
      }
      
      logger.info("Initializing Gemini AI with key:", process.env.GEMINI_API_KEY.substring(0, 10) + "...");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      logger.info("Gemini model initialized successfully");
      logger.info("🧠 Using 3-Layer Memory System for fast + deep responses");
        
        // ===== 3-LAYER MEMORY SYSTEM =====
        
        // LAYER 1: Get current mood
        let currentUserMood = "neutral";
        try {
          const { Mood } = await import('../models/Mood');
          const latestMood = await Mood.findOne({ userId })
            .sort({ timestamp: -1 })
            .select('score');
          if (latestMood) {
            currentUserMood = normalizeMood(latestMood.score || 5);
          }
        } catch (err) {
          logger.warn("Could not fetch mood:", err);
        }
        
        // LAYER 1: Long-Term Memory (only top 3 most relevant memories)
        logger.info("📚 Fetching relevant long-term memories...");
        const longTermMemories = await getRelevantLongTermMemories(
          userId.toString(),
          message,
          currentUserMood,
          3  // Only 3 most relevant items
        );
        
        // LAYER 2: Short-Term Memory (last 10 turns + summary)
        logger.info("💬 Fetching short-term conversation context...");
        const shortTermMemory = await getShortTermMemory(sessionId, 10);
        
        // LAYER 3: System Memory (lightweight, changes per request)
        logger.info("⚙️ Building system memory for current mood...");
        const recentThemes = longTermMemories.map(m => m.type);
        const systemMemory = buildSystemMemory(currentUserMood, recentThemes);
        
        // Update session with current state
        session.currentMood = currentUserMood;
        session.activeTone = systemMemory.toneMode;
        
        // ===== BUILD COMPACT CONTEXT =====
        
        // Build compact user context (max ~200 tokens)
        let userContext = `\n**Current State:** ${systemMemory.emotionalContext}\n`;
        userContext += `**Approach:** ${systemMemory.activeApproach}\n`;
        
        if (shortTermMemory.summary) {
          userContext += `\n**Previous context:** ${shortTermMemory.summary}\n`;
        }
        
        if (longTermMemories.length > 0) {
          userContext += `\n**What Hope remembers about you:**\n`;
          longTermMemories.forEach(mem => {
            userContext += `- ${mem.content.substring(0, 100)}${mem.content.length > 100 ? '...' : ''}\n`;
          });
        }
        
        // Build conversation history (only recent turns)
        const conversationHistory = shortTermMemory.messages
          .map(msg => `${msg.role}: ${msg.content}`)
          .join('\n');
        
        logger.info(`📊 Context size: ${longTermMemories.length} long-term memories, ${shortTermMemory.messages.length} recent messages`);
        
        // Build the mood-adaptive Hope prompt with emotional intelligence
        const enhancedPrompt = buildHopePrompt(currentUserMood, conversationHistory + `\n\nUser: ${message}`, userContext);

        logger.info("Sending request to Gemini AI...");
        // Note: Gemini API doesn't support generationConfig in getGenerativeModel for older models
        // Use gemini-2.5-flash which supports it, or apply config per-request
        const result = await model.generateContent(enhancedPrompt);
        const response = await result.response;
        aiResponse = response.text();
        
        logger.info(`AI response generated for session ${sessionId} with enhanced memory context`);
    } catch (aiError: any) {
      logger.error("AI response generation failed:", {
        error: aiError.message || aiError,
        stack: aiError.stack,
        name: aiError.name
      });
      // Keep using fallback response
    }

    // Add AI response to session
    const assistantMessage: IChatMessage = {
      role: "assistant" as const,
      content: aiResponse,
      timestamp: new Date(),
      metadata: {}
    };

    session.messages.push(assistantMessage);
    await session.save();

    logger.info(`Message and AI response added to session: ${sessionId}`);

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
  } catch (error) {
    logger.error("Send message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    const session = await ChatSession.findOne({ 
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
  } catch (error) {
    logger.error("Get chat history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get chat history",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllChatSessions = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);

    // Fetch all sessions
    const allSessions = await ChatSession.find({ 
      userId 
    }).sort({ startTime: -1 });

    // Filter out empty sessions (sessions with no messages)
    const sessionsWithMessages = allSessions.filter(session => 
      session.messages && session.messages.length > 0
    );

    logger.info(`Found ${sessionsWithMessages.length} non-empty sessions (out of ${allSessions.length} total) for user: ${userId}`);

    // Clean up old empty sessions (older than 1 hour) in the background
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    ChatSession.deleteMany({
      userId,
      messages: { $size: 0 },
      createdAt: { $lt: oneHourAgo }
    }).catch(err => logger.warn("Failed to cleanup empty sessions:", err));

    res.json({
      success: true,
      sessions: sessionsWithMessages.map(session => ({
        id: session.sessionId,
        userId: session.userId.toString(),
        status: session.status,
        startTime: session.startTime,
        messageCount: session.messages.length,
        lastMessage: session.messages.length > 0 ? session.messages[session.messages.length - 1] : null
      }))
    });
  } catch (error) {
    logger.error("Get all chat sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get chat sessions",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Complete a chat session
export const completeChatSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = new Types.ObjectId(req.user._id);

    const session = await ChatSession.findOneAndUpdate(
      { sessionId, userId },
      { 
        status: "completed",
        endTime: new Date()
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found"
      });
    }

    logger.info(`Chat session completed: ${sessionId} for user: ${userId}`);

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
  } catch (error) {
    logger.error("Complete chat session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete chat session",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
