import { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatSession } from "../models/ChatSession";
import { JournalEntry } from "../models/JournalEntry";
import { Mood } from "../models/Mood";
import { MeditationSession } from "../models/Meditation";
import { User } from "../models/User";
import { logger } from "../utils/logger";
import { Types } from "mongoose";

// Initialize Gemini API - Use environment variable or fallback
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDMHmeOCxXaoCuoebM4t4V0qYdXK4a7S78";
if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required. Please set it in your .env file.');
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Rate limiting configuration - More reasonable limits
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15; // More reasonable limit
const apiCallTracker: Map<string, { count: number; resetTime: number }> = new Map();

// Global rate limiting for API calls
const GLOBAL_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_GLOBAL_REQUESTS = 20; // More reasonable global limit
let globalRequestCount = 0;
let globalResetTime = Date.now() + GLOBAL_RATE_LIMIT_WINDOW;

// Simple request queue to manage API calls
interface QueuedRequest {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  context: string;
  timestamp: number;
}

const requestQueue: QueuedRequest[] = [];
let isProcessingQueue = false;

// Retry configuration - More persistent for real AI responses
const MAX_RETRIES = 5; // More retries
const INITIAL_RETRY_DELAY = 2000; // Start with 2 seconds
const MAX_RETRY_DELAY = 30000; // Max 30 seconds delay

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

// Rate limiting function
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  
  // Check global rate limit first
  if (now > globalResetTime) {
    globalRequestCount = 0;
    globalResetTime = now + GLOBAL_RATE_LIMIT_WINDOW;
  }
  
  if (globalRequestCount >= MAX_GLOBAL_REQUESTS) {
    logger.warn(`Global rate limit exceeded. Requests: ${globalRequestCount}/${MAX_GLOBAL_REQUESTS}`);
    return false;
  }
  
  // Check user-specific rate limit
  const userTracker = apiCallTracker.get(userId);
  
  if (!userTracker || now > userTracker.resetTime) {
    // Reset or initialize tracker
    apiCallTracker.set(userId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    globalRequestCount++;
    return true;
  }
  
  if (userTracker.count >= MAX_REQUESTS_PER_WINDOW) {
    logger.warn(`User rate limit exceeded for user ${userId}. Requests: ${userTracker.count}/${MAX_REQUESTS_PER_WINDOW}`);
    return false; // Rate limit exceeded
  }
  
  userTracker.count++;
  globalRequestCount++;
  return true;
}

// Delay function for retries
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Queue processing function
async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const request = requestQueue.shift();
    if (!request) break;

    try {
      logger.info(`Processing queued request (${requestQueue.length} remaining)`);
      const response = await generateAIResponseWithRetry(request.context);
      request.resolve(response);
      
      // Small delay between requests to avoid overwhelming the API
      await delay(1000);
    } catch (error) {
      logger.error('Error processing queued request:', error);
      request.reject(error as Error);
    }
  }

  isProcessingQueue = false;
}

// AI response generation with retry logic and fallback
async function generateAIResponseWithRetry(
  aiContext: string,
  retries: number = MAX_RETRIES
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      logger.info(`Attempting AI generation (attempt ${attempt + 1}/${retries + 1})`);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(aiContext);
      const response = await result.response;
      const responseText = response.text();
      logger.info(`AI generation successful on attempt ${attempt + 1}`);
      return responseText;
    } catch (error: any) {
      logger.warn(`AI generation attempt ${attempt + 1} failed:`, error.message);
      
      // Check if it's a rate limit or quota error (429)
      if (error.message?.includes('429') || error.message?.includes('Quota exceeded') || error.message?.includes('RATE_LIMIT_EXCEEDED')) {
        logger.warn(`Rate limit/quota exceeded: ${error.message}`);
        
        if (attempt < retries) {
          // Use exponential backoff with jitter for quota issues
          const baseDelay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
          const jitter = Math.random() * 1000; // Add random jitter
          const delayTime = baseDelay + jitter;
          
          logger.info(`Rate limit/quota hit, retrying in ${Math.round(delayTime)}ms... (attempt ${attempt + 1}/${retries + 1})`);
          await delay(delayTime);
          continue;
        } else {
          // All retries exhausted, return fallback response
          logger.error("All retries exhausted due to rate limiting/quota, using fallback response");
          return generateFallbackResponse(aiContext);
        }
      }
      
      // For other errors, retry once more then fallback
      if (attempt < retries) {
        logger.info(`Retrying in 1000ms due to error: ${error.message}`);
        await delay(1000);
        continue;
      } else {
        logger.error("AI generation failed after all retries, using fallback response");
        return generateFallbackResponse(aiContext);
      }
    }
  }
  
  // This shouldn't be reached, but just in case
  return generateFallbackResponse(aiContext);
}

// Queued AI response function with timeout
async function generateQueuedAIResponse(aiContext: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const queuedRequest: QueuedRequest = {
      resolve,
      reject,
      context: aiContext,
      timestamp: Date.now()
    };

    requestQueue.push(queuedRequest);
    logger.info(`Request queued (queue length: ${requestQueue.length})`);
    
    // Set a timeout for the request (5 minutes)
    const timeout = setTimeout(() => {
      logger.warn('AI response request timed out after 5 minutes');
      reject(new Error('AI response request timed out'));
    }, 5 * 60 * 1000);
    
    // Start processing the queue
    processQueue().catch(error => {
      clearTimeout(timeout);
      logger.error('Queue processing error:', error);
      reject(error);
    }).then(() => {
      clearTimeout(timeout);
    });
  });
}

// Fallback response generator
function generateFallbackResponse(aiContext: string): string {
  // Extract user message from context for more personalized fallback
  const messageMatch = aiContext.match(/User message: "([^"]+)"/);
  const userMessage = messageMatch ? messageMatch[1].toLowerCase() : '';
  
  // Generate contextual fallback responses
  if (userMessage.includes('help') || userMessage.includes('support')) {
    return "I understand you're looking for support right now. While I'm experiencing some technical difficulties, I want you to know that what you're feeling is valid. Consider reaching out to a trusted friend, family member, or mental health professional. If you're in crisis, please contact a crisis helpline in your area.";
  }
  
  if (userMessage.includes('anxious') || userMessage.includes('anxiety')) {
    return "I hear that you're feeling anxious. While I'm having some technical issues right now, here are some immediate techniques that can help: Try taking slow, deep breaths (4 counts in, 4 counts out), practice grounding by naming 5 things you can see, 4 you can hear, 3 you can touch, 2 you can smell, and 1 you can taste. Remember, anxiety is temporary and you will get through this.";
  }
  
  if (userMessage.includes('sad') || userMessage.includes('depressed') || userMessage.includes('down')) {
    return "I can sense you're going through a difficult time. Although I'm experiencing some technical challenges, I want to remind you that your feelings are valid and you're not alone. Consider doing something small that usually brings you comfort, reaching out to someone you trust, or engaging in gentle movement like a short walk. Your mental health matters.";
  }
  
  if (userMessage.includes('stress') || userMessage.includes('overwhelmed')) {
    return "It sounds like you're feeling overwhelmed right now. While I'm having some technical difficulties, here are some immediate strategies: Try breaking down what's stressing you into smaller, manageable pieces. Practice the 4-7-8 breathing technique (breathe in for 4, hold for 7, out for 8). Remember that it's okay to take breaks and ask for help when you need it.";
  }
  
  // Default fallback response
  return "I'm experiencing some technical difficulties right now due to high demand, but I want you to know that I'm here to support you. Your thoughts and feelings are important. While I work through these issues, please remember that you're not alone. Consider taking a few deep breaths, reaching out to a trusted friend, or trying a mindfulness exercise. If you're in immediate distress, please contact a mental health professional or crisis support service. I'll be back to full functionality soon.";
}

export const sendMemoryEnhancedMessage = async (req: Request, res: Response) => {
  try {
    const { message, sessionId, userId, context, suggestions, userMemory } = req.body;

    logger.info(`Processing memory-enhanced message from user ${userId}`);

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Check rate limiting
    if (!checkRateLimit(userId)) {
      logger.warn(`Rate limit exceeded for user ${userId}`);
      return res.status(429).json({
        error: "Rate limit exceeded. Please wait before sending another message.",
        retryAfter: 60,
        fallbackResponse: "I understand you'd like to continue our conversation. To ensure quality responses, please wait a moment before sending your next message. In the meantime, take a deep breath and know that I'm here to support you."
      });
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
    logger.info(`AI context created, length: ${aiContext.length}`);

    // Generate AI response using queue system for better quota management
    logger.info(`Requesting AI response through queue system...`);
    const aiMessage = await generateQueuedAIResponse(aiContext);
    logger.info(`AI response generated successfully, length: ${aiMessage.length}`);

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
    logger.info(`Session saved successfully for session ${sessionId}`);

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
    
    // Only use fallback for actual errors, not for successful API responses
    const fallbackMessage = "I'm experiencing some technical difficulties right now, but I want you to know that I'm here to support you. Your thoughts and feelings are important. Please try again in a moment, and if the issue persists, consider reaching out to a mental health professional for immediate support.";
    
    res.status(200).json({
      success: true,
      response: fallbackMessage,
      sessionId: req.body.sessionId,
      suggestions: [
        "Take a few deep breaths",
        "Try a brief mindfulness exercise",
        "Reach out to a trusted friend or family member"
      ],
      memoryContext: {
        hasJournalEntries: false,
        hasMeditationHistory: false,
        hasMoodData: false,
        lastUpdated: new Date(),
      },
      isFailover: true
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
