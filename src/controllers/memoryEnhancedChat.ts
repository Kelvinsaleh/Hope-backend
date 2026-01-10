import { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatSession } from "../models/ChatSession";
import { JournalEntry } from "../models/JournalEntry";
import { Mood } from "../models/Mood";
import { MeditationSession } from "../models/Meditation";
import { UserProfile } from "../models/UserProfile";
import { User } from "../models/User";
import { LongTermMemoryModel } from "../models/LongTermMemory";
import { logger } from "../utils/logger";
import { Types } from "mongoose";
import { buildHopePrompt, normalizeMood, getRandomExpression } from "../utils/hopePersonality";
import {
  truncateMessages,
  summarizeMessages,
  formatConversationWithSummary,
  extractKeyFacts,
  estimateTokens,
} from "../utils/conversationOptimizer";
import {
  buildPersonalizationContext,
  buildEnforcementRules,
  buildUserProfileSummary,
  trackEngagementSignal,
} from "../services/personalization/personalizationBuilder";
import { estimateTokens } from "../utils/conversationOptimizer";

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
    bio?: string;
    preferences: {
      communicationStyle: 'gentle' | 'direct' | 'supportive';
      topicsToAvoid: string[];
      preferredTechniques: string[];
    };
    goals: string[];
    challenges: string[];
    interests?: string[];
    experienceLevel?: 'beginner' | 'intermediate' | 'experienced';
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

// Periodic cleanup task to evict expired cache entries
// Simple in-memory cache to store pre-assembled memory blobs per user or per
// client-provided memoryVersion. This keeps builds cheap when many messages
// are exchanged in a short session.
// Hardening: TTL and size cap to prevent unbounded memory growth.
const memoryCache: Map<string, { memory: any; lastUpdated: number }> = new Map();
const MEMORY_CACHE_TTL_MS = Number(process.env.MEMORY_CACHE_TTL_MS) || 1000 * 60 * 5; // 5 minutes
const MEMORY_CACHE_MAX_ENTRIES = Number(process.env.MEMORY_CACHE_MAX_ENTRIES) || 200; // max entries in cache

// Lightweight intent classifier to drive selective memory injection
type ChatIntent = 'celebration' | 'distress' | 'casual' | 'reflection';

function detectIntent(userMessage: string, recentMessages: Array<{ role: string; content: string }>): ChatIntent {
  const text = (userMessage || '').toLowerCase();
  if (!text && recentMessages.length > 0) {
    const last = recentMessages[recentMessages.length - 1];
    if (last && last.content) return detectIntent(last.content, []);
  }
  if (text.includes('congrats') || text.includes('promotion') || text.includes('won') || text.includes('excited') || text.includes('celebrate')) {
    return 'celebration';
  }
  if (text.includes('anxious') || text.includes('anxiety') || text.includes('stressed') || text.includes('overwhelmed') || text.includes('sad') || text.includes('depressed')) {
    return 'distress';
  }
  if (text.includes('thinking about') || text.includes('reflect') || text.includes('journal') || text.includes('why') || text.includes('what does it mean')) {
    return 'reflection';
  }
  return 'casual';
}

function buildSelectiveMemorySnippet(memoryData: UserMemory, intent: ChatIntent): string {
  if (!memoryData) return '';

  const parts: string[] = [];

  // Stable profile facts (small)
  const prefs = memoryData.profile?.preferences || {};
  const goals = (memoryData.profile?.goals || []).slice(0, 3);
  const interests = (memoryData.profile?.interests || []).slice(0, 3);
  const topicsToAvoid = prefs.topicsToAvoid || [];

  if (goals.length) parts.push(`Goals: ${goals.join(', ')}`);
  if (interests.length) parts.push(`Interests: ${interests.join(', ')}`);
  if (prefs.communicationStyle) parts.push(`Prefers style: ${prefs.communicationStyle}`);

  // Mood/time patterns (very small)
  if (memoryData.moodPatterns && memoryData.moodPatterns.length > 0) {
    const recentMood = memoryData.moodPatterns[0];
    if (recentMood?.mood !== undefined) {
      parts.push(`Recent mood score: ${recentMood.mood}`);
    }
  }

  // Intent-specific cues
  if (intent === 'celebration' && goals.length) {
    parts.push(`Celebrate progress on goals: ${goals[0]}`);
  }
  if (intent === 'distress' && prefs.topicsToAvoid && prefs.topicsToAvoid.length > 0) {
    parts.push(`Avoid sensitive topics: ${prefs.topicsToAvoid.slice(0, 2).join(', ')}`);
  }

  // Hard cap to keep snippet tiny (~200-300 tokens)
  let snippet = parts.join(' | ');

  // Safety: mask topicsToAvoid text when intent is distress to avoid resurfacing sensitive areas
  if (intent === 'distress' && topicsToAvoid.length > 0) {
    const mask = '[filtered]';
    topicsToAvoid.slice(0, 2).forEach((t: string) => {
      snippet = snippet.replace(t, mask);
    });
  }

  // Final token cap
  if (estimateTokens(snippet) > 300) {
    snippet = snippet.slice(0, 1200); // extra safety trim
  }
  return snippet;
}

// Minimal empty memory placeholder to avoid blocking when cache is cold
function getEmptyMemory(): UserMemory {
  return {
    profile: {
      name: "User",
      bio: '',
      goals: [],
      challenges: [],
      interests: [],
      preferences: {
        communicationStyle: 'gentle',
        topicsToAvoid: [],
        preferredTechniques: [],
      },
      experienceLevel: 'beginner',
    },
    journalEntries: [],
    meditationHistory: [],
    moodPatterns: [],
    therapySessions: [],
    insights: [],
    lastUpdated: new Date(),
  };
}

// Fast, non-blocking memory retrieval:
// - return cached memory immediately if present
// - otherwise return empty memory and kick off an async warm-up
function getMemoryFast(userId: string, cacheKey: string): UserMemory {
  const cached = getCachedMemory(cacheKey);
  if (cached) {
    return cached;
  }

  // Warm the cache asynchronously without blocking the request
  (async () => {
    try {
      const mem = await gatherUserMemory(userId);
      setCachedMemory(cacheKey, mem);
      logger.debug(`Warm-filled memory cache for user ${userId} (key=${cacheKey})`);
    } catch (err) {
      logger.warn('Async memory warm failed', { userId, error: err });
    }
  })();

  return getEmptyMemory();
}

// Periodic cleanup task to evict expired cache entries
setInterval(() => {
  try {
    const now = Date.now();
    for (const [key, entry] of memoryCache.entries()) {
      if (now - entry.lastUpdated > MEMORY_CACHE_TTL_MS) {
        memoryCache.delete(key);
        logger.debug(`Periodic eviction of memory cache key=${key}`);
      }
    }
  } catch (e) {
    logger.error('Error during memory cache cleanup', e);
  }
}, Math.max(60000, MEMORY_CACHE_TTL_MS / 5));

function getCachedMemory(key: string) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.lastUpdated > MEMORY_CACHE_TTL_MS) {
    memoryCache.delete(key);
    logger.debug(`Evicted expired memory cache key=${key}`);
    return null;
  }
  logger.debug(`Memory cache hit key=${key}`);
  return entry.memory;
}

function setCachedMemory(key: string, memory: any) {
  // Evict oldest entries if we exceed the cap
  if (memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES) {
    // evict least recently updated entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of memoryCache.entries()) {
      if (v.lastUpdated < oldestTime) {
        oldestTime = v.lastUpdated;
        oldestKey = k;
      }
    }
    if (oldestKey) {
      memoryCache.delete(oldestKey);
      logger.info(`Evicted memory cache key=${oldestKey} due to size cap`);
    }
  }

  memoryCache.set(key, { memory, lastUpdated: Date.now() });
  logger.debug(`Memory cache set key=${key}`);
}

// Expose helper to invalidate a user's memory cache entries. This should be
// called after profile updates so that subsequent memory-enhanced requests
// rebuild memory using the latest persisted profile.
export function invalidateMemoryCacheForUser(userId: string) {
  try {
    const prefix = `${userId}:`;
    for (const k of Array.from(memoryCache.keys())) {
      if (k.startsWith(prefix)) {
        memoryCache.delete(k);
        logger.info(`Invalidated memory cache for key=${k}`);
      }
    }
  } catch (e) {
    logger.warn('Failed to invalidate memory cache for user', { userId, error: e });
  }
}

// Fallback response generator
function generateFallbackResponse(aiContext: string): string {
  // Extract user message from context for more personalized fallback
  const messageMatch = aiContext.match(/User message: "([^"]+)"/);
  const userMessage = messageMatch ? messageMatch[1].toLowerCase() : '';
  
  // Generate contextual fallback responses with conversational tone
  if (userMessage.includes('help') || userMessage.includes('support')) {
    return "I'm having some technical trouble right now, but your feelings matter. If you need support urgently, reach out to someone you trust or a crisis helpline. I'll be back soon.";
  }
  
  if (userMessage.includes('anxious') || userMessage.includes('anxiety')) {
    return "I'm having technical issues, but anxiety is real and it does pass. Maybe try some slow breaths or grounding yourself with what you can see and touch around you. Take it moment by moment.";
  }
  
  if (userMessage.includes('sad') || userMessage.includes('depressed') || userMessage.includes('down')) {
    return "I'm having some technical trouble connecting right now. Whatever you're feeling is real and valid. Maybe do something small that feels safe — reach out to someone, take a walk, or just rest. You don't have to push through alone.";
  }
  
  if (userMessage.includes('stress') || userMessage.includes('overwhelmed')) {
    return "I'm experiencing technical difficulties, but it sounds like there's a lot on you right now. Maybe try breaking one thing into smaller pieces, or just pause and breathe. It's okay to step back.";
  }
  
  // Default fallback response
  return "I'm having technical trouble right now, but what you're going through matters. Take some breaths, and I'll be back soon. If you need immediate help, reach out to a crisis service.";
}

/**
 * Stream AI response using Server-Sent Events (SSE) for reduced perceived latency
 * Note: This can be enabled by adding ?stream=true query param
 */
async function streamAIResponse(
  req: Request,
  res: Response,
  prompt: string,
  sessionId: string,
  userId: string,
  userMessage: string,
  session: any
): Promise<void> {
  try {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    if (!genAI) {
      const fallback = generateFallbackResponse(prompt);
      res.write(`data: ${JSON.stringify({ type: 'complete', content: fallback, isFailover: true })}\n\n`);
      res.end();
      return;
    }

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      
      // Generate content with streaming enabled
      const result = await model.generateContentStream({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.95,
        },
      });

      let fullResponse = '';
      
      // Stream chunks as they arrive
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullResponse += chunkText;
          // Send chunk to client
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunkText })}\n\n`);
        }
      }

      // Send completion signal
      res.write(`data: ${JSON.stringify({ type: 'complete', content: fullResponse.trim() })}\n\n`);
      
      // Save to session asynchronously (don't block response)
      session.messages.push({
        role: "user",
        content: userMessage,
        timestamp: new Date(),
      });
      session.messages.push({
        role: "assistant",
        content: fullResponse.trim(),
        timestamp: new Date(),
      });
      session.status = "active";
      session.save().catch((error: any) => {
        logger.error('Error saving streamed message:', error);
      });

      logger.info(`Streamed AI response successfully, length: ${fullResponse.length}`);
      res.end();
    } catch (streamError: any) {
      logger.error('Streaming error:', streamError);
      const fallback = generateFallbackResponse(prompt);
      res.write(`data: ${JSON.stringify({ type: 'complete', content: fallback, isFailover: true })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    logger.error('Error in streamAIResponse:', error);
    const fallback = generateFallbackResponse(prompt);
    res.write(`data: ${JSON.stringify({ type: 'complete', content: fallback, isFailover: true })}\n\n`);
    res.end();
  }
}

export const sendMemoryEnhancedMessage = async (req: Request, res: Response) => {
  try {
    const { message, sessionId, context, suggestions, userMemory, memoryVersion } = req.body;

    // Extract userId from JWT token (req.user is set by authenticateToken middleware)
    // Fallback to request body only if req.user is not available (shouldn't happen with auth middleware)
    const userId = req.user?._id?.toString() || req.body?.userId;
    
    if (!userId || userId.trim() === '') {
      logger.error('No userId found in request - authentication may have failed');
      return res.status(401).json({ 
        error: "User authentication required",
        message: "Please log in to send messages"
      });
    }

    // Validate userId is a valid ObjectId format
    if (!Types.ObjectId.isValid(userId)) {
      logger.error(`Invalid userId format: ${userId}`);
      return res.status(400).json({ 
        error: "Invalid user ID format",
        message: "Please log in again"
      });
    }

    const userIdObj = new Types.ObjectId(userId);
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

    // Get user data - use req.user if available (already loaded by auth middleware), otherwise fetch
    const user = req.user || await User.findById(userIdObj);
    if (!user) {
      logger.error(`User not found: ${userId}`);
      return res.status(404).json({ error: "User not found" });
    }

    // Get or create chat session
    // Load with all messages for full conversation history (don't use .lean() so we can save later)
    let session = await ChatSession.findOne({ sessionId });
    if (!session) {
      // Create new session if it doesn't exist
      session = new ChatSession({
        sessionId,
        userId: userIdObj, // Use validated ObjectId
        startTime: new Date(),
        status: "active",
        messages: [],
      });
      await session.save();
    }

    // Use memoryVersion or a compact request to avoid rebuilding full memory every call.
    // Prefer a cached memory entry keyed by memoryVersion if provided; otherwise
    // fall back to userId-based caching for short-lived reuse.
    const cacheKey = memoryVersion ? `${userId}:${memoryVersion}` : `${userId}:latest`;
    const memoryData: UserMemory = getMemoryFast(userId, cacheKey);

    // Merge client-supplied small profile/deltas if provided. This allows the
    // frontend to send quick edits without needing to persist immediately.
    const suppliedProfile = (userMemory && userMemory.profile) || req.body?.userProfile;
    const validationErrors: Record<string, string> = {};
    if (suppliedProfile && typeof suppliedProfile === 'object') {
      try {
        // Validation rules
        const MAX_GOALS = Number(process.env.MAX_GOALS) || 10;
        const MAX_CHALLENGES = Number(process.env.MAX_CHALLENGES) || 10;
        const MAX_STR_LEN = Number(process.env.MAX_PROFILE_STR_LEN) || 200;
        const MAX_BIO_LEN = Number(process.env.MAX_BIO_LEN) || 500;

        const sanitized: any = {};

        // Validate goals
        if (suppliedProfile.goals !== undefined) {
          if (!Array.isArray(suppliedProfile.goals)) {
            validationErrors['goals'] = 'goals must be an array of strings';
          } else {
            const items = suppliedProfile.goals.map((g: any) => String(g || '').trim()).filter(Boolean);
            if (items.length > MAX_GOALS) validationErrors['goals'] = `max ${MAX_GOALS} goals allowed`;
            const long = items.find((s: string) => s.length > MAX_STR_LEN);
            if (long) validationErrors['goals'] = `each goal must be <= ${MAX_STR_LEN} characters`;
            if (!validationErrors['goals']) sanitized.goals = items.slice(0, MAX_GOALS);
          }
        }

        // Validate challenges
        if (suppliedProfile.challenges !== undefined) {
          if (!Array.isArray(suppliedProfile.challenges)) {
            validationErrors['challenges'] = 'challenges must be an array of strings';
          } else {
            const items = suppliedProfile.challenges.map((c: any) => String(c || '').trim()).filter(Boolean);
            if (items.length > MAX_CHALLENGES) validationErrors['challenges'] = `max ${MAX_CHALLENGES} challenges allowed`;
            const long = items.find((s: string) => s.length > MAX_STR_LEN);
            if (long) validationErrors['challenges'] = `each challenge must be <= ${MAX_STR_LEN} characters`;
            if (!validationErrors['challenges']) sanitized.challenges = items.slice(0, MAX_CHALLENGES);
          }
        }

        // Validate communicationStyle
        if (suppliedProfile.communicationStyle !== undefined) {
          const v = String(suppliedProfile.communicationStyle || '').trim();
          if (!['gentle', 'direct', 'supportive'].includes(v)) {
            validationErrors['communicationStyle'] = 'must be one of: gentle, direct, supportive';
          } else {
            sanitized.communicationStyle = v;
          }
        }

        // Validate experienceLevel
        if (suppliedProfile.experienceLevel !== undefined) {
          const v = String(suppliedProfile.experienceLevel || '').trim();
          if (!['beginner', 'intermediate', 'experienced'].includes(v)) {
            validationErrors['experienceLevel'] = 'must be one of: beginner, intermediate, experienced';
          } else {
            sanitized.experienceLevel = v;
          }
        }

        // Validate bio
        if (suppliedProfile.bio !== undefined) {
          const b = String(suppliedProfile.bio || '').trim();
          if (b.length > MAX_BIO_LEN) validationErrors['bio'] = `bio must be <= ${MAX_BIO_LEN} characters`;
          else sanitized.bio = b;
        }

        // If any validation errors present, return 400 with details
        if (Object.keys(validationErrors).length > 0) {
          logger.warn('Validation errors in supplied profile', validationErrors);
          return res.status(400).json({ error: 'Invalid profile data', details: validationErrors });
        }

        // Merge sanitized values into memoryData.profile
        memoryData.profile = {
          ...memoryData.profile,
          ...sanitized,
        };
      } catch (e) {
        logger.warn('Failed to merge supplied userProfile into memoryData.profile', e);
      }
    }

    // Incremental fetching: if client provided recentJournalIds, fetch only those entries
    const recentJournalIds: string[] = (userMemory && Array.isArray(userMemory.recentJournalIds))
      ? userMemory.recentJournalIds.map(String)
      : (Array.isArray(req.body?.recentJournalIds) ? req.body.recentJournalIds.map(String) : []);

    if (recentJournalIds.length > 0) {
      try {
        const ids = recentJournalIds.map(id => Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null).filter(Boolean);
        if (ids.length > 0) {
          const entries = await JournalEntry.find({ _id: { $in: ids }, userId: userIdObj }).lean();
          // Replace memoryData.journalEntries/recentJournals with fetched entries (serialized)
          memoryData.journalEntries = entries;
          memoryData.recentJournals = entries.map(e => ({
            id: e._id,
            title: e.title,
            excerpt: (e.content || '').substring(0, 200),
            mood: e.mood,
            createdAt: e.createdAt,
          }));
        }
      } catch (e) {
        logger.warn('Failed to fetch incremental journal entries', e);
      }
    }

    // Determine current mood from most recent mood data
    const currentMood = memoryData.moodPatterns.length > 0 
      ? normalizeMood(memoryData.moodPatterns[0].mood) 
      : 'neutral';

    // ============================================================================
    // PERSONALIZATION INTEGRATION
    // ============================================================================
    // Fetch personalization context (includes user preferences, behavioral patterns, summaries)
    // userId is validated above and is a valid ObjectId string at this point
    const personalizationContext = await buildPersonalizationContext(userId, true);
    
    // Build enforcement rules (mandatory system instructions)
    const enforcementRules = buildEnforcementRules(personalizationContext);
    
    // Build user profile summary (context for AI)
    const profileSummary = buildUserProfileSummary(personalizationContext);
    
    // Build user context string with comprehensive profile information
    let userContext = `\n**What you know about ${user.name || 'this person'}:**\n`;
    
    // Profile information (goals, challenges, preferences)
    const profile = memoryData.profile;
    if (profile) {
      // Communication style and experience level
      if (profile.preferences?.communicationStyle) {
        userContext += `- Communication style: ${profile.preferences.communicationStyle}\n`;
      }
      if (profile.experienceLevel) {
        userContext += `- Experience level with therapy/mental health: ${profile.experienceLevel}\n`;
      }
      
      // Bio if available
      if (profile.bio && profile.bio.trim()) {
        const bioPreview = profile.bio.length > 200 
          ? profile.bio.substring(0, 200) + '...' 
          : profile.bio;
        userContext += `- About them: ${bioPreview}\n`;
      }
      
      // Goals
      if (profile.goals && profile.goals.length > 0) {
        userContext += `- Goals: ${profile.goals.slice(0, 5).join(', ')}${profile.goals.length > 5 ? '...' : ''}\n`;
      }
      
      // Challenges
      if (profile.challenges && profile.challenges.length > 0) {
        userContext += `- Current challenges: ${profile.challenges.slice(0, 5).join(', ')}${profile.challenges.length > 5 ? '...' : ''}\n`;
      }
      
      // Interests
      if (profile.interests && profile.interests.length > 0) {
        userContext += `- Interests: ${profile.interests.slice(0, 5).join(', ')}${profile.interests.length > 5 ? '...' : ''}\n`;
      }
      
      userContext += '\n';
    }
    
    // Activity history
    userContext += `**Activity History:**\n`;
    userContext += `- ${memoryData.journalEntries.length} journal entries recently\n`;
    userContext += `- ${memoryData.moodPatterns.length} mood records (recent mood: ${memoryData.moodPatterns[0]?.mood || 'unknown'}/10)\n`;
    userContext += `- ${memoryData.meditationHistory.length} meditation sessions completed\n`;
    userContext += `- ${memoryData.therapySessions.length} previous therapy chats\n`;

    // Add recent journal insights if available
    if (memoryData.journalEntries.length > 0) {
      userContext += `\n**Recent journal themes:** ${memoryData.insights.slice(0, 3).join(', ') || 'general reflection'}\n`;
    }

    // ============================================================================
    // OPTIMIZED CONVERSATION HISTORY FOR AI PROMPT (ONLY)
    // ============================================================================
    // IMPORTANT: This truncation ONLY affects what's sent to the AI, NOT the stored messages!
    // - ALL messages are saved to the database/session (no truncation of user data)
    // - Only the conversation history sent to AI is truncated/optimized for token limits
    // - This improves AI processing speed while preserving complete user conversation history
    // ============================================================================
    let conversationHistory = '';
    
    // PRIORITY 1: Current session - prepare message copy for AI context (NOT database)
    // Get ALL messages from frontend context or database (these remain untouched)
    let allCurrentSessionMessages: Array<{ role: string; content: string; timestamp?: Date }> = [];
    
    if (context && context.recentUserMessages && Array.isArray(context.recentUserMessages) && context.recentUserMessages.length > 0) {
      // Frontend sent full conversation - create a copy for AI processing (original untouched)
      allCurrentSessionMessages = context.recentUserMessages.map((msg: any) => ({
        role: msg.role || 'user',
        content: msg.content || '',
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      }));
      logger.debug(`✅ Using frontend conversation context (${allCurrentSessionMessages.length} messages) - ALL will be saved to DB`);
    } else if (session && session.messages && session.messages.length > 0) {
      // Fallback: Use messages from database session (create copy for AI processing)
      allCurrentSessionMessages = session.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp || new Date(),
      }));
      logger.debug(`✅ Using database session messages (${allCurrentSessionMessages.length} messages) - ALL will be preserved`);
    }

    // IMPORTANT: Truncation ONLY for AI prompt - all messages still saved to DB below
    // Create an optimized copy for AI context (token-limited, summarized if needed)
    const { recentMessages, summary, truncatedCount, totalTokens } = truncateMessages(
      allCurrentSessionMessages, // Copy of all messages (original untouched)
      4000, // Max tokens for AI context (leaving room for prompt + response)
      40   // Keep last 40 messages in AI context
    );

    // If messages were truncated for AI, generate a summary of old messages
    let oldMessagesSummary: string | undefined;
    if (truncatedCount > 0 && recentMessages.length < allCurrentSessionMessages.length) {
      const oldMessages = allCurrentSessionMessages.slice(0, allCurrentSessionMessages.length - recentMessages.length);
      logger.info(`Truncated ${truncatedCount} messages for AI context only (all ${allCurrentSessionMessages.length} messages will still be saved to DB)`);
      
      try {
        oldMessagesSummary = await summarizeMessages(oldMessages, genAI);
        logger.debug(`Generated summary for ${oldMessages.length} old messages (for AI context only)`);
      } catch (summaryError: any) {
        logger.warn('Failed to generate summary:', summaryError.message);
        oldMessagesSummary = `Earlier conversation had ${oldMessages.length} messages before the current context.`;
      }
    }

    // Extract key facts from ALL messages for persistent memory (async, don't block)
    // This uses the full message history, not the truncated version
    if (allCurrentSessionMessages.length > 10) {
      const keyFacts = extractKeyFacts(allCurrentSessionMessages, 10); // Use ALL messages for fact extraction
      if (keyFacts.length > 0) {
        // Store key facts asynchronously (don't wait for completion)
        storeKeyFacts(userId, keyFacts).catch((error: any) => {
          logger.warn('Failed to store key facts:', error.message);
        });
      }
    }

    // Format current conversation for AI prompt (truncated/summarized version)
    const currentConversationFormatted = formatConversationWithSummary(oldMessagesSummary, recentMessages);
    if (currentConversationFormatted) {
      conversationHistory += `**Current conversation:**\n${currentConversationFormatted}\n\n`;
      logger.info(`AI context optimized: ${recentMessages.length} recent messages${oldMessagesSummary ? ' + summary' : ''} (${totalTokens} tokens) - but all ${allCurrentSessionMessages.length} messages saved to DB`);
    }

    // PRIORITY 2: Selective long-term memory injection (cached, tiny, intent-driven)
    const intent = detectIntent(message, recentMessages);
    const selectiveMemory = buildSelectiveMemorySnippet(memoryData, intent);
    if (selectiveMemory) {
      conversationHistory += `**Relevant context:** ${selectiveMemory}\n\n`;
      logger.debug(`Included selective memory for intent=${intent}`);
    }

    // PRIORITY 3: Previous sessions - truncated for efficiency
    // Limit to last 2 previous sessions, and last 15 messages per session (reduced for performance)
    if (memoryData.therapySessions && memoryData.therapySessions.length > 0) {
      const previousSessions = memoryData.therapySessions
        .filter((s: any) => {
          const sId = s.sessionId || s._id?.toString();
          return sId && sId !== sessionId;
        })
        .slice(0, 2); // Last 2 previous sessions (reduced from 3 for performance)

      if (previousSessions.length > 0) {
        const previousSessionIds = previousSessions
          .map((s: any) => s.sessionId || s._id?.toString())
          .filter(Boolean);
        
        try {
          const previousSessionsWithMessages = await ChatSession.find({
            sessionId: { $in: previousSessionIds },
            userId: userIdObj // Use validated ObjectId
          })
            .select('sessionId startTime messages')
            .lean()
            .limit(2);

          if (previousSessionsWithMessages.length > 0) {
            conversationHistory += `**Previous conversations (recent context):**\n`;
            previousSessionsWithMessages.forEach((prevSession: any) => {
              if (prevSession.messages && prevSession.messages.length > 0) {
                // Apply truncation to previous sessions too
                const prevMessages = prevSession.messages.map((m: any) => ({
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp,
                }));
                const { recentMessages: prevRecent } = truncateMessages(prevMessages, 1000, 15); // 15 messages max per previous session
                
                const sessionMessages = prevRecent
                  .map((msg: any) => `${msg.role === 'user' ? 'User' : 'Hope'}: ${msg.content}`)
      .join('\n');
                const sessionDate = prevSession.startTime 
                  ? new Date(prevSession.startTime).toLocaleDateString()
                  : 'Previous session';
                conversationHistory += `\n[${sessionDate}]:\n${sessionMessages}\n`;
              }
            });
            logger.debug(`Included ${previousSessionsWithMessages.length} previous sessions (truncated)`);
          }
        } catch (prevSessionError: any) {
          logger.warn('Failed to fetch previous session messages:', prevSessionError.message);
        }
      }
    }

    // Use the mood-adaptive Hope prompt builder with optimized conversation history
    // Optimizations applied:
    // - Intelligent truncation (keeps recent messages, summarizes old ones)
    // - Persistent memory integration (key facts from database)
    // - Efficient previous session loading (truncated to 15 messages each)
    // - Personalization rules and profile context
    // This ensures maximum chat awareness while keeping performance optimal
    
    // Build final prompt with personalization
    const fullHistory = conversationHistory + `\n\nUser: ${message}`;
    
    // Combine all context: user profile, personalization rules, and conversation history
    const combinedContext = `${userContext}${profileSummary}${enforcementRules}`;
    
    // Default verbosity instruction (can be overridden by personalization rules)
    const defaultVerbosity = personalizationContext?.profile.communication.verbosity === "concise"
      ? "Respond concisely in 2-3 lines unless the user explicitly asks for more detail."
      : personalizationContext?.profile.communication.verbosity === "detailed"
      ? "Provide comprehensive responses with examples when helpful (4-8 sentences typically)."
      : "Respond concisely in 2-4 lines unless the user asks for step-by-step or the situation clearly requires more detail.";
    
    const hopePrompt = buildHopePrompt(
      currentMood, 
      fullHistory, 
      `${combinedContext}${defaultVerbosity}`
    );
    const promptTokens = estimateTokens(hopePrompt);
    logger.info(`AI context optimized: ${promptTokens} tokens (~${Math.ceil(promptTokens / 4)} chars) - includes summary + recent messages + persistent memory + personalization`);

    // Generate AI response using queue system for better quota management
    // Support streaming if requested (query param ?stream=true or Accept: text/event-stream header)
    const shouldStream = req.query?.stream === 'true' || req.headers.accept?.includes('text/event-stream');
    
    if (shouldStream) {
      // Stream response for better perceived latency
      // userId is validated and valid at this point
      return streamAIResponse(req, res, hopePrompt, sessionId, userId, message, session);
    }
    
    logger.info(`Requesting AI response through queue system...`);
    let aiMessage: string;
    let isFailover = false;
    
    try {
      aiMessage = await generateQueuedAIResponse(hopePrompt);
      logger.info(`AI response generated successfully, length: ${aiMessage.length}`);
    } catch (error: any) {
      // If AI completely fails, use fallback
      logger.error(`AI generation failed completely:`, error.message);
      aiMessage = generateFallbackResponse(hopePrompt);
      isFailover = true;
      logger.info(`Using fallback response`);
    }
    
    // Final validation: ensure response is never empty
    if (!aiMessage || aiMessage.trim().length === 0) {
      aiMessage = "I'm here with you. What's on your mind?";
      isFailover = true;
      logger.warn(`Using final fallback due to empty AI response`);
    }

    // Save ALL messages to session/database (no truncation - complete conversation history)
    // IMPORTANT: These messages are saved in full, regardless of what was sent to AI
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
    logger.info(`Session saved successfully - all ${session.messages.length} messages preserved in database (truncation only applied to AI context)`);

    // Generate personalized suggestions
    const personalizedSuggestions = await generatePersonalizedSuggestions(
      memoryData,
      message,
      aiMessage
    );

    // Track engagement signal asynchronously (don't block response)
    const sessionDuration = session.endTime && session.startTime
      ? (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000 / 60
      : 0;
    trackEngagementSignal(userId, {
      sessionLength: sessionDuration || 5, // Estimate if unknown
      messagesCount: session.messages.length,
      responseReceived: true,
    }).catch((error: any) => {
      logger.warn('Failed to track engagement signal:', error.message);
    });

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
      personalizationVersion: personalizationContext?.version || 1, // Include version for caching
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

/**
 * Store key facts extracted from conversation into persistent memory
 * This enables the AI to "remember" important details across sessions
 */
async function storeKeyFacts(
  userId: string,
  facts: Array<{
    type: 'emotional_theme' | 'coping_pattern' | 'goal' | 'trigger' | 'insight' | 'preference';
    content: string;
    importance: number;
    tags: string[];
    context?: string;
  }>
): Promise<void> {
  if (!facts || facts.length === 0) return;

  try {
    const userIdObj = new Types.ObjectId(userId);
    
    // Store facts that don't already exist (avoid duplicates)
    for (const fact of facts) {
      // Check if similar fact already exists (simple content match for now)
      const existing = await LongTermMemoryModel.findOne({
        userId: userIdObj,
        content: { $regex: new RegExp(fact.content.substring(0, 50), 'i') },
      });

      if (!existing) {
        // Store new fact
        await LongTermMemoryModel.create({
          userId: userIdObj,
          type: fact.type,
          content: fact.content,
          importance: fact.importance,
          tags: fact.tags,
          context: fact.context,
          timestamp: new Date(),
        });
        logger.debug(`Stored key fact: ${fact.type} - ${fact.content.substring(0, 50)}...`);
      } else {
        // Update importance if new fact is more important
        if (fact.importance > existing.importance) {
          existing.importance = fact.importance;
          existing.timestamp = new Date();
          await existing.save();
          logger.debug(`Updated importance for existing fact: ${fact.content.substring(0, 50)}...`);
        }
      }
    }

    // Cleanup: Remove old/low-importance memories to keep database size manageable
    // Keep only top 100 most important memories per user
    const userMemories = await LongTermMemoryModel.find({ userId: userIdObj })
      .sort({ importance: -1, timestamp: -1 })
      .lean();
    
    if (userMemories.length > 100) {
      const idsToDelete = userMemories.slice(100).map(m => m._id);
      await LongTermMemoryModel.deleteMany({ _id: { $in: idsToDelete } });
      logger.debug(`Cleaned up ${idsToDelete.length} old memories for user ${userId}`);
    }
  } catch (error: any) {
    logger.error('Error storing key facts:', error);
    // Don't throw - this is non-critical
  }
}

async function gatherUserMemory(userId: string): Promise<UserMemory> {
  try {
    // Validate and convert userId to ObjectId
    if (!userId || userId.trim() === '' || !Types.ObjectId.isValid(userId)) {
      logger.error(`Invalid userId provided to gatherUserMemory: ${userId}`);
      throw new Error(`Invalid userId: ${userId}`);
    }
    
    const userIdObj = new Types.ObjectId(userId);
    
    // Get recent journal entries
    const journalEntries = await JournalEntry.find({ userId: userIdObj })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Get recent mood data
    const moodPatterns = await Mood.find({ userId: userIdObj })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // Get meditation history
    const meditationHistory = await MeditationSession.find({ userId: userIdObj })
      .populate('meditationId')
      .sort({ completedAt: -1 })
      .limit(10)
      .lean();

    // Get therapy sessions
    const therapySessions = await ChatSession.find({ userId: userIdObj })
      .sort({ startTime: -1 })
      .limit(5)
      .lean();

    // Fetch actual user profile from database
    let userProfile: any = null;
    try {
      userProfile = await UserProfile.findOne({ userId: userIdObj }).lean();
    } catch (profileError) {
      logger.warn("Failed to fetch user profile for memory:", profileError);
    }

    // Build profile object from database data or use defaults
    const profileData = {
      name: "User", // Will be populated from user data if available
      bio: userProfile?.bio || '',
      goals: userProfile?.goals || [],
      challenges: userProfile?.challenges || [],
      interests: userProfile?.interests || [],
        preferences: {
        communicationStyle: userProfile?.communicationStyle || 'gentle',
        topicsToAvoid: [], // Can be populated if stored in profile
        preferredTechniques: [], // Can be populated if stored in profile
      },
      experienceLevel: userProfile?.experienceLevel || 'beginner',
    };

    return {
      profile: profileData,
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
        bio: '',
        goals: [],
        challenges: [],
        interests: [],
        preferences: {
          communicationStyle: 'gentle',
          topicsToAvoid: [],
          preferredTechniques: [],
        },
        experienceLevel: 'beginner',
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
