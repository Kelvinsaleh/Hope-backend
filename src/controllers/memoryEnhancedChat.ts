import { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatSession } from "../models/ChatSession";
import { JournalEntry } from "../models/JournalEntry";
import { Mood } from "../models/Mood";
import { MeditationSession } from "../models/Meditation";
import { User } from "../models/User";
import { logger } from "../utils/logger";
import { Types } from "mongoose";
import { buildHopePrompt, normalizeMood, getRandomExpression } from "../utils/hopePersonality";

// Initialize Gemini API - Use environment variable or warn
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
if (!GEMINI_API_KEY) {
  logger.warn('GEMINI_API_KEY not set. AI features will use fallback responses. Set this environment variable for production.');
}
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

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
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 800;
const MAX_RETRY_DELAY = 30000;

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
  // Check if AI is configured
  if (!genAI) {
    logger.error("GEMINI_API_KEY not configured - cannot generate AI response");
    throw new Error('AI service not configured');
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      logger.info(`Attempting AI generation (attempt ${attempt + 1}/${retries + 1})`);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash"
      });
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 30000);
      
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: aiContext }] }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.95,
        },
      });
      const response = await result.response;
      const responseText = response.text()?.trim() || '';
      clearTimeout(id);
      
      // Validate response is not empty
      if (responseText.length === 0) {
        throw new Error('AI returned empty response');
      }
      
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
          // All retries exhausted, return fallback
          logger.error("All retries exhausted due to rate limiting/quota - using fallback");
          return generateFallbackResponse(aiContext);
        }
      }
      
      // For other errors, retry once more then use fallback
      if (attempt < retries) {
        logger.info(`Retrying in 1000ms due to error: ${error.message}`);
        await delay(1000);
        continue;
      } else {
        logger.error("AI generation failed after all retries - using fallback");
        return generateFallbackResponse(aiContext);
      }
    }
  }
  
  // This shouldn't be reached, but if it does, use fallback
  logger.warn("Unexpected state in AI generation - using fallback");
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
    return "I'm having technical trouble right now, but your feelings matter. If you need support urgently, reach out to someone you trust or a crisis helpline. I'll be back soon.";
  }
  
  if (userMessage.includes('anxious') || userMessage.includes('anxiety')) {
    return "I'm having technical issues, but anxiety is real and it passes. Try slow breaths or grounding yourself with what you can see and touch around you. Take it moment by moment.";
  }
  
  if (userMessage.includes('sad') || userMessage.includes('depressed') || userMessage.includes('down')) {
    return "I'm having some technical trouble connecting right now. Whatever you're feeling is real and valid. Do something small that feels safe — reach out to someone, take a walk, or just rest. You don't have to push through alone.";
  }
  
  if (userMessage.includes('stress') || userMessage.includes('overwhelmed')) {
    return "I'm experiencing technical difficulties, but it sounds like there's a lot on you right now. Try breaking one thing into smaller pieces, or just pause and breathe. It's okay to step back.";
  }
  
  // Default fallback response
  return "I'm having technical trouble right now, but what you're going through matters. Take some breaths, and I'll be back soon. If you need immediate help, reach out to a crisis service.";
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
        fallbackResponse: "Take a moment to breathe. I'll be ready when you are."
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
    let aiMessage: string;
    let isFailover = false;
    
    try {
      aiMessage = await generateQueuedAIResponse(aiContext);
      logger.info(`AI response generated successfully, length: ${aiMessage.length}`);
    } catch (error: any) {
      // If AI completely fails, use fallback
      logger.error(`AI generation failed completely:`, error.message);
      aiMessage = generateFallbackResponse(aiContext);
      isFailover = true;
      logger.info(`Using fallback response`);
    }
    
    // Final validation: ensure response is never empty
    if (!aiMessage || aiMessage.trim().length === 0) {
      aiMessage = "I'm here with you. What's on your mind?";
      isFailover = true;
      logger.warn(`Using final fallback due to empty AI response`);
    }

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
      isFailover: isFailover, // Let frontend know if this was a fallback
      memoryContext: {
        hasJournalEntries: memoryData.journalEntries.length > 0,
        hasMeditationHistory: memoryData.meditationHistory.length > 0,
        hasMoodData: memoryData.moodPatterns.length > 0,
        lastUpdated: memoryData.lastUpdated,
      },
    });

  } catch (error) {
    logger.error("Error in memory-enhanced chat:", error);
    
    // Return a fallback response instead of just an error
    const fallbackMessage = generateFallbackResponse("User needs support");
    res.status(200).json({ 
      success: true,
      response: fallbackMessage,
      isFailover: true,
      error: 'AI temporarily unavailable - using fallback response'
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
  // Determine current mood from most recent mood data
  const currentMood = memoryData.moodPatterns.length > 0 
    ? normalizeMood(memoryData.moodPatterns[0].mood) 
    : 'neutral';

  // Build user context string
  let userContext = `\n**What you know about ${user.name || 'this person'}:**\n`;
  userContext += `- ${memoryData.journalEntries.length} journal entries recently\n`;
  userContext += `- ${memoryData.moodPatterns.length} mood records (recent mood: ${memoryData.moodPatterns[0]?.mood || 'unknown'}/10)\n`;
  userContext += `- ${memoryData.meditationHistory.length} meditation sessions completed\n`;
  userContext += `- ${memoryData.therapySessions.length} previous therapy chats\n`;

  // Add recent journal insights if available
  if (memoryData.journalEntries.length > 0) {
    userContext += `\n**Recent journal themes:** ${memoryData.insights.slice(0, 3).join(', ') || 'general reflection'}\n`;
  }

  // Build conversation history from memory
  const conversationHistory = memoryData.therapySessions
    .slice(-3)
    .map(session => `Previous session: [${session.date}]`)
    .join('\n');

  // Use the mood-adaptive Hope prompt builder
  return buildHopePrompt(currentMood, conversationHistory + `\n\nUser: ${message}`, userContext);
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
