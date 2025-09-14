import { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatSession } from "../models/ChatSession";
import { JournalEntry } from "../models/JournalEntry";
import { Mood } from "../models/Mood";
import { MeditationSession } from "../models/Meditation";
import { User } from "../models/User";
import { logger } from "../utils/logger";
import { Types } from "mongoose";

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || "AIzaSyDMHmeOCxXaoCuoebM4t4V0qYdXK4a7S78"
);

interface UserMemory {
  profile: {
    name: string;
    preferences: {
      communicationStyle: 'gentle' | 'direct' | 'supportive';
      topicsToAvoid: string[];
      preferredTechniques: string[];
    };
    goals: string[];
    challenges: string[];
  };
  journalEntries: any[];
  meditationHistory: any[];
  moodPatterns: any[];
  therapySessions: any[];
  insights: any[];
  lastUpdated: Date;
}

export const sendMemoryEnhancedMessage = async (req: Request, res: Response) => {
  try {
    const { message, sessionId, userId, context, suggestions, userMemory } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get or create chat session
    let session = await ChatSession.findOne({ sessionId });
    if (!session) {
      session = new ChatSession({
        sessionId,
        userId: new Types.ObjectId(userId),
        startTime: new Date(),
        status: "active",
        messages: [],
      });
    }

    // Gather user memory data
    const memoryData = await gatherUserMemory(userId);

    // Create context for AI
    const aiContext = createAIContext(message, memoryData, user, context);

    // Generate AI response
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(aiContext);
    const response = await result.response;
    const aiMessage = response.text();

    // Save messages to session
    session.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    session.messages.push({
      role: "assistant",
      content: aiMessage,
      timestamp: new Date(),
    });

    await session.save();

    // Generate personalized suggestions
    const personalizedSuggestions = await generatePersonalizedSuggestions(
      memoryData,
      message,
      aiMessage
    );

    res.json({
      success: true,
      response: aiMessage,
      sessionId: session.sessionId,
      suggestions: personalizedSuggestions,
      memoryContext: {
        hasJournalEntries: memoryData.journalEntries.length > 0,
        hasMeditationHistory: memoryData.meditationHistory.length > 0,
        hasMoodData: memoryData.moodPatterns.length > 0,
        lastUpdated: memoryData.lastUpdated,
      },
    });

  } catch (error) {
    logger.error("Error in memory-enhanced chat:", error);
    res.status(500).json({
      error: "Failed to process memory-enhanced message",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

async function gatherUserMemory(userId: string): Promise<UserMemory> {
  try {
    // Get recent journal entries
    const journalEntries = await JournalEntry.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Get recent mood data
    const moodPatterns = await Mood.find({ userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // Get meditation history
    const meditationHistory = await MeditationSession.find({ userId })
      .populate('meditationId')
      .sort({ completedAt: -1 })
      .limit(10)
      .lean();

    // Get therapy sessions
    const therapySessions = await ChatSession.find({ userId })
      .sort({ startTime: -1 })
      .limit(5)
      .lean();

    return {
      profile: {
        name: "User", // Will be populated from user data
        preferences: {
          communicationStyle: 'gentle',
          topicsToAvoid: [],
          preferredTechniques: [],
        },
        goals: [],
        challenges: [],
      },
      journalEntries,
      meditationHistory,
      moodPatterns,
      therapySessions,
      insights: [],
      lastUpdated: new Date(),
    };
  } catch (error) {
    logger.error("Error gathering user memory:", error);
    return {
      profile: {
        name: "User",
        preferences: {
          communicationStyle: 'gentle',
          topicsToAvoid: [],
          preferredTechniques: [],
        },
        goals: [],
        challenges: [],
      },
      journalEntries: [],
      meditationHistory: [],
      moodPatterns: [],
      therapySessions: [],
      insights: [],
      lastUpdated: new Date(),
    };
  }
}

function createAIContext(
  message: string,
  memoryData: UserMemory,
  user: any,
  additionalContext?: any
): string {
  const basePrompt = `You are Hope, an AI therapist designed to provide compassionate, professional mental health support. You are having a conversation with ${user.name || 'a user'}.

Your role:
- Provide empathetic, non-judgmental support
- Use evidence-based therapeutic techniques
- Maintain professional boundaries
- Encourage healthy coping strategies
- Be available 24/7 for crisis support

Current conversation context:
User message: "${message}"

User's recent activity and patterns:
- Journal entries: ${memoryData.journalEntries.length} recent entries
- Mood patterns: ${memoryData.moodPatterns.length} recent mood records
- Meditation sessions: ${memoryData.meditationHistory.length} completed sessions
- Therapy sessions: ${memoryData.therapySessions.length} previous sessions

Please respond as Hope, maintaining a warm, professional, and supportive tone. Focus on the user's current message while being aware of their recent patterns and activities.`;

  return basePrompt;
}

async function generatePersonalizedSuggestions(
  memoryData: UserMemory,
  userMessage: string,
  aiResponse: string
): Promise<string[]> {
  const suggestions = [];

  // Mood-based suggestions
  if (memoryData.moodPatterns.length > 0) {
    const recentMood = memoryData.moodPatterns[0];
    if (recentMood.mood < 5) {
      suggestions.push("Try a 5-minute breathing exercise");
      suggestions.push("Write about what you're grateful for today");
    }
  }

  // Journal-based suggestions
  if (memoryData.journalEntries.length === 0) {
    suggestions.push("Consider starting a daily journal to track your thoughts");
  }

  // Meditation-based suggestions
  if (memoryData.meditationHistory.length < 3) {
    suggestions.push("Try a guided meditation session");
  }

  // General suggestions
  suggestions.push("Take a moment to practice deep breathing");
  suggestions.push("Consider reaching out to a trusted friend or family member");

  return suggestions.slice(0, 3); // Return top 3 suggestions
}
