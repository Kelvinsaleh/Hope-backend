"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMemoryEnhancedMessage = void 0;
exports.invalidateMemoryCacheForUser = invalidateMemoryCacheForUser;
const generative_ai_1 = require("@google/generative-ai");
const ChatSession_1 = require("../models/ChatSession");
const JournalEntry_1 = require("../models/JournalEntry");
const Mood_1 = require("../models/Mood");
const Meditation_1 = require("../models/Meditation");
const UserProfile_1 = require("../models/UserProfile");
const User_1 = require("../models/User");
const LongTermMemory_1 = require("../models/LongTermMemory");
const logger_1 = require("../utils/logger");
const mongoose_1 = require("mongoose");
const hopePersonality_1 = require("../utils/hopePersonality");
const conversationOptimizer_1 = require("../utils/conversationOptimizer");
const personalizationBuilder_1 = require("../services/personalization/personalizationBuilder");
// Initialize Gemini API - Use environment variable or warn
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
if (!GEMINI_API_KEY) {
    logger_1.logger.warn('GEMINI_API_KEY not set. AI features will use fallback responses. Set this environment variable for production.');
}
const genAI = GEMINI_API_KEY ? new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY) : null;
// Rate limiting configuration - More reasonable limits
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15; // More reasonable limit
const apiCallTracker = new Map();
// Global rate limiting for API calls
const GLOBAL_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_GLOBAL_REQUESTS = 20; // More reasonable global limit
let globalRequestCount = 0;
let globalResetTime = Date.now() + GLOBAL_RATE_LIMIT_WINDOW;
const requestQueue = [];
let isProcessingQueue = false;
// Retry configuration - More persistent for real AI responses
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 800;
const MAX_RETRY_DELAY = 30000;
// Rate limiting function
function checkRateLimit(userId) {
    const now = Date.now();
    // Check global rate limit first
    if (now > globalResetTime) {
        globalRequestCount = 0;
        globalResetTime = now + GLOBAL_RATE_LIMIT_WINDOW;
    }
    if (globalRequestCount >= MAX_GLOBAL_REQUESTS) {
        logger_1.logger.warn(`Global rate limit exceeded. Requests: ${globalRequestCount}/${MAX_GLOBAL_REQUESTS}`);
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
        logger_1.logger.warn(`User rate limit exceeded for user ${userId}. Requests: ${userTracker.count}/${MAX_REQUESTS_PER_WINDOW}`);
        return false; // Rate limit exceeded
    }
    userTracker.count++;
    globalRequestCount++;
    return true;
}
// Delay function for retries
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Queue processing function
async function processQueue() {
    if (isProcessingQueue || requestQueue.length === 0) {
        return;
    }
    isProcessingQueue = true;
    while (requestQueue.length > 0) {
        const request = requestQueue.shift();
        if (!request)
            break;
        try {
            logger_1.logger.info(`Processing queued request (${requestQueue.length} remaining)`);
            const response = await generateAIResponseWithRetry(request.context);
            request.resolve(response);
            // Small delay between requests to avoid overwhelming the API
            await delay(1000);
        }
        catch (error) {
            logger_1.logger.error('Error processing queued request:', error);
            request.reject(error);
        }
    }
    isProcessingQueue = false;
}
// AI response generation with retry logic and fallback
async function generateAIResponseWithRetry(aiContext, retries = MAX_RETRIES) {
    // Check if AI is configured
    if (!genAI) {
        logger_1.logger.error("GEMINI_API_KEY not configured - cannot generate AI response");
        throw new Error('AI service not configured');
    }
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            logger_1.logger.info(`Attempting AI generation (attempt ${attempt + 1}/${retries + 1})`);
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
            logger_1.logger.info(`AI generation successful on attempt ${attempt + 1}`);
            return responseText;
        }
        catch (error) {
            logger_1.logger.warn(`AI generation attempt ${attempt + 1} failed:`, error.message);
            // Check if it's a rate limit or quota error (429)
            if (error.message?.includes('429') || error.message?.includes('Quota exceeded') || error.message?.includes('RATE_LIMIT_EXCEEDED')) {
                logger_1.logger.warn(`Rate limit/quota exceeded: ${error.message}`);
                if (attempt < retries) {
                    // Use exponential backoff with jitter for quota issues
                    const baseDelay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, attempt), MAX_RETRY_DELAY);
                    const jitter = Math.random() * 1000; // Add random jitter
                    const delayTime = baseDelay + jitter;
                    logger_1.logger.info(`Rate limit/quota hit, retrying in ${Math.round(delayTime)}ms... (attempt ${attempt + 1}/${retries + 1})`);
                    await delay(delayTime);
                    continue;
                }
                else {
                    // All retries exhausted, return fallback
                    logger_1.logger.error("All retries exhausted due to rate limiting/quota - using fallback");
                    return generateFallbackResponse(aiContext);
                }
            }
            // For other errors, retry once more then use fallback
            if (attempt < retries) {
                logger_1.logger.info(`Retrying in 1000ms due to error: ${error.message}`);
                await delay(1000);
                continue;
            }
            else {
                logger_1.logger.error("AI generation failed after all retries - using fallback");
                return generateFallbackResponse(aiContext);
            }
        }
    }
    // This shouldn't be reached, but if it does, use fallback
    logger_1.logger.warn("Unexpected state in AI generation - using fallback");
    return generateFallbackResponse(aiContext);
}
// Queued AI response function with timeout
async function generateQueuedAIResponse(aiContext) {
    return new Promise((resolve, reject) => {
        const queuedRequest = {
            resolve,
            reject,
            context: aiContext,
            timestamp: Date.now()
        };
        requestQueue.push(queuedRequest);
        logger_1.logger.info(`Request queued (queue length: ${requestQueue.length})`);
        // Set a timeout for the request (5 minutes)
        const timeout = setTimeout(() => {
            logger_1.logger.warn('AI response request timed out after 5 minutes');
            reject(new Error('AI response request timed out'));
        }, 5 * 60 * 1000);
        // Start processing the queue
        processQueue().catch(error => {
            clearTimeout(timeout);
            logger_1.logger.error('Queue processing error:', error);
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
const memoryCache = new Map();
const MEMORY_CACHE_TTL_MS = Number(process.env.MEMORY_CACHE_TTL_MS) || 1000 * 60 * 5; // 5 minutes
const MEMORY_CACHE_MAX_ENTRIES = Number(process.env.MEMORY_CACHE_MAX_ENTRIES) || 200; // max entries in cache
// Periodic cleanup task to evict expired cache entries
setInterval(() => {
    try {
        const now = Date.now();
        for (const [key, entry] of memoryCache.entries()) {
            if (now - entry.lastUpdated > MEMORY_CACHE_TTL_MS) {
                memoryCache.delete(key);
                logger_1.logger.debug(`Periodic eviction of memory cache key=${key}`);
            }
        }
    }
    catch (e) {
        logger_1.logger.error('Error during memory cache cleanup', e);
    }
}, Math.max(60000, MEMORY_CACHE_TTL_MS / 5));
function getCachedMemory(key) {
    const entry = memoryCache.get(key);
    if (!entry)
        return null;
    if (Date.now() - entry.lastUpdated > MEMORY_CACHE_TTL_MS) {
        memoryCache.delete(key);
        logger_1.logger.debug(`Evicted expired memory cache key=${key}`);
        return null;
    }
    return entry.memory;
}
function setCachedMemory(key, memory) {
    // Evict oldest entries if we exceed the cap
    if (memoryCache.size >= MEMORY_CACHE_MAX_ENTRIES) {
        // evict least recently updated entry
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [k, v] of memoryCache.entries()) {
            if (v.lastUpdated < oldestTime) {
                oldestTime = v.lastUpdated;
                oldestKey = k;
            }
        }
        if (oldestKey) {
            memoryCache.delete(oldestKey);
            logger_1.logger.info(`Evicted memory cache key=${oldestKey} due to size cap`);
        }
    }
    memoryCache.set(key, { memory, lastUpdated: Date.now() });
}
// Expose helper to invalidate a user's memory cache entries. This should be
// called after profile updates so that subsequent memory-enhanced requests
// rebuild memory using the latest persisted profile.
function invalidateMemoryCacheForUser(userId) {
    try {
        const prefix = `${userId}:`;
        for (const k of Array.from(memoryCache.keys())) {
            if (k.startsWith(prefix)) {
                memoryCache.delete(k);
                logger_1.logger.info(`Invalidated memory cache for key=${k}`);
            }
        }
    }
    catch (e) {
        logger_1.logger.warn('Failed to invalidate memory cache for user', { userId, error: e });
    }
}
// Fallback response generator
function generateFallbackResponse(aiContext) {
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
async function streamAIResponse(req, res, prompt, sessionId, userId, userMessage, session) {
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
            session.save().catch((error) => {
                logger_1.logger.error('Error saving streamed message:', error);
            });
            logger_1.logger.info(`Streamed AI response successfully, length: ${fullResponse.length}`);
            res.end();
        }
        catch (streamError) {
            logger_1.logger.error('Streaming error:', streamError);
            const fallback = generateFallbackResponse(prompt);
            res.write(`data: ${JSON.stringify({ type: 'complete', content: fallback, isFailover: true })}\n\n`);
            res.end();
        }
    }
    catch (error) {
        logger_1.logger.error('Error in streamAIResponse:', error);
        const fallback = generateFallbackResponse(prompt);
        res.write(`data: ${JSON.stringify({ type: 'complete', content: fallback, isFailover: true })}\n\n`);
        res.end();
    }
}
const sendMemoryEnhancedMessage = async (req, res) => {
    try {
        const { message, sessionId, userId, context, suggestions, userMemory, memoryVersion } = req.body;
        logger_1.logger.info(`Processing memory-enhanced message from user ${userId}`);
        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }
        // Check rate limiting
        if (!checkRateLimit(userId)) {
            logger_1.logger.warn(`Rate limit exceeded for user ${userId}`);
            return res.status(429).json({
                error: "Rate limit exceeded. Please wait before sending another message.",
                retryAfter: 60,
                fallbackResponse: "Take a moment to breathe. I'll be ready when you are."
            });
        }
        // Get user data
        const user = await User_1.User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        // Get or create chat session
        // Load with all messages for full conversation history (don't use .lean() so we can save later)
        let session = await ChatSession_1.ChatSession.findOne({ sessionId });
        if (!session) {
            // Create new session if it doesn't exist
            session = new ChatSession_1.ChatSession({
                sessionId,
                userId: new mongoose_1.Types.ObjectId(userId),
                startTime: new Date(),
                status: "active",
                messages: [],
            });
            await session.save();
        }
        // Use memoryVersion or a compact request to avoid rebuilding full memory every call.
        // Prefer a cached memory entry keyed by memoryVersion if provided; otherwise
        // fall back to userId-based caching for short-lived reuse.
        let memoryData = null;
        const cacheKey = memoryVersion ? `${userId}:${memoryVersion}` : `${userId}:latest`;
        if (memoryVersion && memoryCache.has(cacheKey)) {
            // Reuse cached memory blob for this memoryVersion
            memoryData = memoryCache.get(cacheKey).memory;
            logger_1.logger.debug(`Using cached memory for user ${userId} (version ${memoryVersion})`);
        }
        else if (!memoryVersion && memoryCache.has(cacheKey)) {
            memoryData = memoryCache.get(cacheKey).memory;
            logger_1.logger.debug(`Using latest cached memory for user ${userId}`);
        }
        // If we don't have cached memory, build it and cache under the computed key
        if (!memoryData) {
            memoryData = await gatherUserMemory(userId);
            memoryCache.set(cacheKey, { memory: memoryData, lastUpdated: Date.now() });
            logger_1.logger.debug(`Built and cached memory for user ${userId} (key=${cacheKey})`);
        }
        // Merge client-supplied small profile/deltas if provided. This allows the
        // frontend to send quick edits without needing to persist immediately.
        const suppliedProfile = (userMemory && userMemory.profile) || req.body?.userProfile;
        const validationErrors = {};
        if (suppliedProfile && typeof suppliedProfile === 'object') {
            try {
                // Validation rules
                const MAX_GOALS = Number(process.env.MAX_GOALS) || 10;
                const MAX_CHALLENGES = Number(process.env.MAX_CHALLENGES) || 10;
                const MAX_STR_LEN = Number(process.env.MAX_PROFILE_STR_LEN) || 200;
                const MAX_BIO_LEN = Number(process.env.MAX_BIO_LEN) || 500;
                const sanitized = {};
                // Validate goals
                if (suppliedProfile.goals !== undefined) {
                    if (!Array.isArray(suppliedProfile.goals)) {
                        validationErrors['goals'] = 'goals must be an array of strings';
                    }
                    else {
                        const items = suppliedProfile.goals.map((g) => String(g || '').trim()).filter(Boolean);
                        if (items.length > MAX_GOALS)
                            validationErrors['goals'] = `max ${MAX_GOALS} goals allowed`;
                        const long = items.find((s) => s.length > MAX_STR_LEN);
                        if (long)
                            validationErrors['goals'] = `each goal must be <= ${MAX_STR_LEN} characters`;
                        if (!validationErrors['goals'])
                            sanitized.goals = items.slice(0, MAX_GOALS);
                    }
                }
                // Validate challenges
                if (suppliedProfile.challenges !== undefined) {
                    if (!Array.isArray(suppliedProfile.challenges)) {
                        validationErrors['challenges'] = 'challenges must be an array of strings';
                    }
                    else {
                        const items = suppliedProfile.challenges.map((c) => String(c || '').trim()).filter(Boolean);
                        if (items.length > MAX_CHALLENGES)
                            validationErrors['challenges'] = `max ${MAX_CHALLENGES} challenges allowed`;
                        const long = items.find((s) => s.length > MAX_STR_LEN);
                        if (long)
                            validationErrors['challenges'] = `each challenge must be <= ${MAX_STR_LEN} characters`;
                        if (!validationErrors['challenges'])
                            sanitized.challenges = items.slice(0, MAX_CHALLENGES);
                    }
                }
                // Validate communicationStyle
                if (suppliedProfile.communicationStyle !== undefined) {
                    const v = String(suppliedProfile.communicationStyle || '').trim();
                    if (!['gentle', 'direct', 'supportive'].includes(v)) {
                        validationErrors['communicationStyle'] = 'must be one of: gentle, direct, supportive';
                    }
                    else {
                        sanitized.communicationStyle = v;
                    }
                }
                // Validate experienceLevel
                if (suppliedProfile.experienceLevel !== undefined) {
                    const v = String(suppliedProfile.experienceLevel || '').trim();
                    if (!['beginner', 'intermediate', 'experienced'].includes(v)) {
                        validationErrors['experienceLevel'] = 'must be one of: beginner, intermediate, experienced';
                    }
                    else {
                        sanitized.experienceLevel = v;
                    }
                }
                // Validate bio
                if (suppliedProfile.bio !== undefined) {
                    const b = String(suppliedProfile.bio || '').trim();
                    if (b.length > MAX_BIO_LEN)
                        validationErrors['bio'] = `bio must be <= ${MAX_BIO_LEN} characters`;
                    else
                        sanitized.bio = b;
                }
                // If any validation errors present, return 400 with details
                if (Object.keys(validationErrors).length > 0) {
                    logger_1.logger.warn('Validation errors in supplied profile', validationErrors);
                    return res.status(400).json({ error: 'Invalid profile data', details: validationErrors });
                }
                // Merge sanitized values into memoryData.profile
                memoryData.profile = {
                    ...memoryData.profile,
                    ...sanitized,
                };
            }
            catch (e) {
                logger_1.logger.warn('Failed to merge supplied userProfile into memoryData.profile', e);
            }
        }
        // Incremental fetching: if client provided recentJournalIds, fetch only those entries
        const recentJournalIds = (userMemory && Array.isArray(userMemory.recentJournalIds))
            ? userMemory.recentJournalIds.map(String)
            : (Array.isArray(req.body?.recentJournalIds) ? req.body.recentJournalIds.map(String) : []);
        if (recentJournalIds.length > 0) {
            try {
                const ids = recentJournalIds.map(id => mongoose_1.Types.ObjectId.isValid(id) ? new mongoose_1.Types.ObjectId(id) : null).filter(Boolean);
                if (ids.length > 0) {
                    const entries = await JournalEntry_1.JournalEntry.find({ _id: { $in: ids }, userId }).lean();
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
            }
            catch (e) {
                logger_1.logger.warn('Failed to fetch incremental journal entries', e);
            }
        }
        // Determine current mood from most recent mood data
        const currentMood = memoryData.moodPatterns.length > 0
            ? (0, hopePersonality_1.normalizeMood)(memoryData.moodPatterns[0].mood)
            : 'neutral';
        // ============================================================================
        // PERSONALIZATION INTEGRATION
        // ============================================================================
        // Fetch personalization context (includes user preferences, behavioral patterns, summaries)
        const personalizationContext = await (0, personalizationBuilder_1.buildPersonalizationContext)(userId, true);
        // Build enforcement rules (mandatory system instructions)
        const enforcementRules = (0, personalizationBuilder_1.buildEnforcementRules)(personalizationContext);
        // Build user profile summary (context for AI)
        const profileSummary = (0, personalizationBuilder_1.buildUserProfileSummary)(personalizationContext);
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
        let allCurrentSessionMessages = [];
        if (context && context.recentUserMessages && Array.isArray(context.recentUserMessages) && context.recentUserMessages.length > 0) {
            // Frontend sent full conversation - create a copy for AI processing (original untouched)
            allCurrentSessionMessages = context.recentUserMessages.map((msg) => ({
                role: msg.role || 'user',
                content: msg.content || '',
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            }));
            logger_1.logger.debug(`✅ Using frontend conversation context (${allCurrentSessionMessages.length} messages) - ALL will be saved to DB`);
        }
        else if (session && session.messages && session.messages.length > 0) {
            // Fallback: Use messages from database session (create copy for AI processing)
            allCurrentSessionMessages = session.messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp || new Date(),
            }));
            logger_1.logger.debug(`✅ Using database session messages (${allCurrentSessionMessages.length} messages) - ALL will be preserved`);
        }
        // IMPORTANT: Truncation ONLY for AI prompt - all messages still saved to DB below
        // Create an optimized copy for AI context (token-limited, summarized if needed)
        const { recentMessages, summary, truncatedCount, totalTokens } = (0, conversationOptimizer_1.truncateMessages)(allCurrentSessionMessages, // Copy of all messages (original untouched)
        4000, // Max tokens for AI context (leaving room for prompt + response)
        40 // Keep last 40 messages in AI context
        );
        // If messages were truncated for AI, generate a summary of old messages
        let oldMessagesSummary;
        if (truncatedCount > 0 && recentMessages.length < allCurrentSessionMessages.length) {
            const oldMessages = allCurrentSessionMessages.slice(0, allCurrentSessionMessages.length - recentMessages.length);
            logger_1.logger.info(`Truncated ${truncatedCount} messages for AI context only (all ${allCurrentSessionMessages.length} messages will still be saved to DB)`);
            try {
                oldMessagesSummary = await (0, conversationOptimizer_1.summarizeMessages)(oldMessages, genAI);
                logger_1.logger.debug(`Generated summary for ${oldMessages.length} old messages (for AI context only)`);
            }
            catch (summaryError) {
                logger_1.logger.warn('Failed to generate summary:', summaryError.message);
                oldMessagesSummary = `Earlier conversation had ${oldMessages.length} messages before the current context.`;
            }
        }
        // Extract key facts from ALL messages for persistent memory (async, don't block)
        // This uses the full message history, not the truncated version
        if (allCurrentSessionMessages.length > 10) {
            const keyFacts = (0, conversationOptimizer_1.extractKeyFacts)(allCurrentSessionMessages, 10); // Use ALL messages for fact extraction
            if (keyFacts.length > 0) {
                // Store key facts asynchronously (don't wait for completion)
                storeKeyFacts(userId, keyFacts).catch((error) => {
                    logger_1.logger.warn('Failed to store key facts:', error.message);
                });
            }
        }
        // Format current conversation for AI prompt (truncated/summarized version)
        const currentConversationFormatted = (0, conversationOptimizer_1.formatConversationWithSummary)(oldMessagesSummary, recentMessages);
        if (currentConversationFormatted) {
            conversationHistory += `**Current conversation:**\n${currentConversationFormatted}\n\n`;
            logger_1.logger.info(`AI context optimized: ${recentMessages.length} recent messages${oldMessagesSummary ? ' + summary' : ''} (${totalTokens} tokens) - but all ${allCurrentSessionMessages.length} messages saved to DB`);
        }
        // PRIORITY 2: Persistent memory - key facts from LongTermMemory
        try {
            const persistentMemories = await LongTermMemory_1.LongTermMemoryModel.find({
                userId: new mongoose_1.Types.ObjectId(userId),
            })
                .sort({ importance: -1, timestamp: -1 })
                .limit(15) // Top 15 most important facts
                .lean();
            if (persistentMemories.length > 0) {
                conversationHistory += `**Important context (from previous conversations):**\n`;
                const groupedMemories = {};
                persistentMemories.forEach((memory) => {
                    if (!groupedMemories[memory.type]) {
                        groupedMemories[memory.type] = [];
                    }
                    groupedMemories[memory.type].push(`- ${memory.content}`);
                });
                Object.entries(groupedMemories).forEach(([type, items]) => {
                    conversationHistory += `${type.replace('_', ' ').toUpperCase()}: ${items.join(' ')}\n`;
                });
                conversationHistory += '\n';
                logger_1.logger.debug(`Included ${persistentMemories.length} persistent memories`);
            }
        }
        catch (memoryError) {
            logger_1.logger.warn('Failed to fetch persistent memories:', memoryError.message);
        }
        // PRIORITY 3: Previous sessions - truncated for efficiency
        // Limit to last 2 previous sessions, and last 15 messages per session (reduced for performance)
        if (memoryData.therapySessions && memoryData.therapySessions.length > 0) {
            const previousSessions = memoryData.therapySessions
                .filter((s) => {
                const sId = s.sessionId || s._id?.toString();
                return sId && sId !== sessionId;
            })
                .slice(0, 2); // Last 2 previous sessions (reduced from 3 for performance)
            if (previousSessions.length > 0) {
                const previousSessionIds = previousSessions
                    .map((s) => s.sessionId || s._id?.toString())
                    .filter(Boolean);
                try {
                    const previousSessionsWithMessages = await ChatSession_1.ChatSession.find({
                        sessionId: { $in: previousSessionIds },
                        userId: new mongoose_1.Types.ObjectId(userId)
                    })
                        .select('sessionId startTime messages')
                        .lean()
                        .limit(2);
                    if (previousSessionsWithMessages.length > 0) {
                        conversationHistory += `**Previous conversations (recent context):**\n`;
                        previousSessionsWithMessages.forEach((prevSession) => {
                            if (prevSession.messages && prevSession.messages.length > 0) {
                                // Apply truncation to previous sessions too
                                const prevMessages = prevSession.messages.map((m) => ({
                                    role: m.role,
                                    content: m.content,
                                    timestamp: m.timestamp,
                                }));
                                const { recentMessages: prevRecent } = (0, conversationOptimizer_1.truncateMessages)(prevMessages, 1000, 15); // 15 messages max per previous session
                                const sessionMessages = prevRecent
                                    .map((msg) => `${msg.role === 'user' ? 'User' : 'Hope'}: ${msg.content}`)
                                    .join('\n');
                                const sessionDate = prevSession.startTime
                                    ? new Date(prevSession.startTime).toLocaleDateString()
                                    : 'Previous session';
                                conversationHistory += `\n[${sessionDate}]:\n${sessionMessages}\n`;
                            }
                        });
                        logger_1.logger.debug(`Included ${previousSessionsWithMessages.length} previous sessions (truncated)`);
                    }
                }
                catch (prevSessionError) {
                    logger_1.logger.warn('Failed to fetch previous session messages:', prevSessionError.message);
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
        const hopePrompt = (0, hopePersonality_1.buildHopePrompt)(currentMood, fullHistory, `${combinedContext}${defaultVerbosity}`);
        const promptTokens = (0, conversationOptimizer_1.estimateTokens)(hopePrompt);
        logger_1.logger.info(`AI context optimized: ${promptTokens} tokens (~${Math.ceil(promptTokens / 4)} chars) - includes summary + recent messages + persistent memory + personalization`);
        // Generate AI response using queue system for better quota management
        // Support streaming if requested (query param ?stream=true or Accept: text/event-stream header)
        const shouldStream = req.query?.stream === 'true' || req.headers.accept?.includes('text/event-stream');
        if (shouldStream) {
            // Stream response for better perceived latency
            return streamAIResponse(req, res, hopePrompt, sessionId, userId, message, session);
        }
        logger_1.logger.info(`Requesting AI response through queue system...`);
        let aiMessage;
        let isFailover = false;
        try {
            aiMessage = await generateQueuedAIResponse(hopePrompt);
            logger_1.logger.info(`AI response generated successfully, length: ${aiMessage.length}`);
        }
        catch (error) {
            // If AI completely fails, use fallback
            logger_1.logger.error(`AI generation failed completely:`, error.message);
            aiMessage = generateFallbackResponse(hopePrompt);
            isFailover = true;
            logger_1.logger.info(`Using fallback response`);
        }
        // Final validation: ensure response is never empty
        if (!aiMessage || aiMessage.trim().length === 0) {
            aiMessage = "I'm here with you. What's on your mind?";
            isFailover = true;
            logger_1.logger.warn(`Using final fallback due to empty AI response`);
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
        logger_1.logger.info(`Session saved successfully - all ${session.messages.length} messages preserved in database (truncation only applied to AI context)`);
        // Generate personalized suggestions
        const personalizedSuggestions = await generatePersonalizedSuggestions(memoryData, message, aiMessage);
        // Track engagement signal asynchronously (don't block response)
        const sessionDuration = session.endTime && session.startTime
            ? (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000 / 60
            : 0;
        (0, personalizationBuilder_1.trackEngagementSignal)(userId, {
            sessionLength: sessionDuration || 5, // Estimate if unknown
            messagesCount: session.messages.length,
            responseReceived: true,
        }).catch((error) => {
            logger_1.logger.warn('Failed to track engagement signal:', error.message);
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
    }
    catch (error) {
        logger_1.logger.error("Error in memory-enhanced chat:", error);
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
exports.sendMemoryEnhancedMessage = sendMemoryEnhancedMessage;
/**
 * Store key facts extracted from conversation into persistent memory
 * This enables the AI to "remember" important details across sessions
 */
async function storeKeyFacts(userId, facts) {
    if (!facts || facts.length === 0)
        return;
    try {
        const userIdObj = new mongoose_1.Types.ObjectId(userId);
        // Store facts that don't already exist (avoid duplicates)
        for (const fact of facts) {
            // Check if similar fact already exists (simple content match for now)
            const existing = await LongTermMemory_1.LongTermMemoryModel.findOne({
                userId: userIdObj,
                content: { $regex: new RegExp(fact.content.substring(0, 50), 'i') },
            });
            if (!existing) {
                // Store new fact
                await LongTermMemory_1.LongTermMemoryModel.create({
                    userId: userIdObj,
                    type: fact.type,
                    content: fact.content,
                    importance: fact.importance,
                    tags: fact.tags,
                    context: fact.context,
                    timestamp: new Date(),
                });
                logger_1.logger.debug(`Stored key fact: ${fact.type} - ${fact.content.substring(0, 50)}...`);
            }
            else {
                // Update importance if new fact is more important
                if (fact.importance > existing.importance) {
                    existing.importance = fact.importance;
                    existing.timestamp = new Date();
                    await existing.save();
                    logger_1.logger.debug(`Updated importance for existing fact: ${fact.content.substring(0, 50)}...`);
                }
            }
        }
        // Cleanup: Remove old/low-importance memories to keep database size manageable
        // Keep only top 100 most important memories per user
        const userMemories = await LongTermMemory_1.LongTermMemoryModel.find({ userId: userIdObj })
            .sort({ importance: -1, timestamp: -1 })
            .lean();
        if (userMemories.length > 100) {
            const idsToDelete = userMemories.slice(100).map(m => m._id);
            await LongTermMemory_1.LongTermMemoryModel.deleteMany({ _id: { $in: idsToDelete } });
            logger_1.logger.debug(`Cleaned up ${idsToDelete.length} old memories for user ${userId}`);
        }
    }
    catch (error) {
        logger_1.logger.error('Error storing key facts:', error);
        // Don't throw - this is non-critical
    }
}
async function gatherUserMemory(userId) {
    try {
        // Get recent journal entries
        const journalEntries = await JournalEntry_1.JournalEntry.find({ userId })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        // Get recent mood data
        const moodPatterns = await Mood_1.Mood.find({ userId })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();
        // Get meditation history
        const meditationHistory = await Meditation_1.MeditationSession.find({ userId })
            .populate('meditationId')
            .sort({ completedAt: -1 })
            .limit(10)
            .lean();
        // Get therapy sessions
        const therapySessions = await ChatSession_1.ChatSession.find({ userId })
            .sort({ startTime: -1 })
            .limit(5)
            .lean();
        // Fetch actual user profile from database
        let userProfile = null;
        try {
            userProfile = await UserProfile_1.UserProfile.findOne({ userId: new mongoose_1.Types.ObjectId(userId) }).lean();
        }
        catch (profileError) {
            logger_1.logger.warn("Failed to fetch user profile for memory:", profileError);
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
    }
    catch (error) {
        logger_1.logger.error("Error gathering user memory:", error);
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
async function generatePersonalizedSuggestions(memoryData, userMessage, aiResponse) {
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
