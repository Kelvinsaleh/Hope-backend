import { Request, Response } from "express";
import { ChatSession } from "../models/ChatSession";
import { Types } from "mongoose";
import { logger } from "../utils/logger";

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

    // Add message to session
    const newMessage = {
      role,
      content: message,
      timestamp: new Date(),
      metadata: {}
    };

    session.messages.push(newMessage);
    await session.save();

    logger.info(`Message added to session: ${sessionId}`);

    res.json({
      success: true,
      message: "Message sent",
      response: "Message saved to session"
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

    const sessions = await ChatSession.find({ 
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
