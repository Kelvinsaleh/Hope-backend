"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMemoryEnhancedMessage = void 0;
const generative_ai_1 = require("@google/generative-ai");
const ChatSession_1 = require("../models/ChatSession");
const JournalEntry_1 = require("../models/JournalEntry");
const Mood_1 = require("../models/Mood");
const Meditation_1 = require("../models/Meditation");
const User_1 = require("../models/User");
const logger_1 = require("../utils/logger");
const mongoose_1 = require("mongoose");
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
                model: "gemini-2.5-flash",
                generationConfig: {
                    maxOutputTokens: 100, // Enforce brevity (50-60 words ≈ 80-100 tokens)
                    temperature: 0.8, // More human-like variability
                },
            });
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 30000);
            const result = await model.generateContent(aiContext);
            const response = await result.response;
            const responseText = response.text();
            clearTimeout(id);
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
// Fallback response generator
function generateFallbackResponse(aiContext) {
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
    return "I'm experiencing some technical difficulties right now, but I'm here for you. Your thoughts matter. Take a few deep breaths, and I'll be back soon. If you need immediate help, please reach out to a crisis support service.";
}
const sendMemoryEnhancedMessage = async (req, res) => {
    try {
        const { message, sessionId, userId, context, suggestions, userMemory } = req.body;
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
                fallbackResponse: "I'm here for you. Take a moment to breathe, and we can continue when you're ready."
            });
        }
        // Get user data
        const user = await User_1.User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        // Get or create chat session
        let session = await ChatSession_1.ChatSession.findOne({ sessionId });
        if (!session) {
            session = new ChatSession_1.ChatSession({
                sessionId,
                userId: new mongoose_1.Types.ObjectId(userId),
                startTime: new Date(),
                status: "active",
                messages: [],
            });
        }
        // Gather user memory data
        const memoryData = await gatherUserMemory(userId);
        // Create context for AI
        const aiContext = createAIContext(message, memoryData, user, context);
        logger_1.logger.info(`AI context created, length: ${aiContext.length}`);
        // Generate AI response using queue system for better quota management
        logger_1.logger.info(`Requesting AI response through queue system...`);
        let aiMessage;
        let isFailover = false;
        try {
            aiMessage = await generateQueuedAIResponse(aiContext);
            logger_1.logger.info(`AI response generated successfully, length: ${aiMessage.length}`);
        }
        catch (error) {
            // If AI completely fails, use fallback
            logger_1.logger.error(`AI generation failed completely:`, error.message);
            aiMessage = generateFallbackResponse(aiContext);
            isFailover = true;
            logger_1.logger.info(`Using fallback response`);
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
        logger_1.logger.info(`Session saved successfully for session ${sessionId}`);
        // Generate personalized suggestions
        const personalizedSuggestions = await generatePersonalizedSuggestions(memoryData, message, aiMessage);
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
    }
    catch (error) {
        logger_1.logger.error("Error gathering user memory:", error);
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
function createAIContext(message, memoryData, user, additionalContext) {
    const basePrompt = `You are Hope, a warm, compassionate AI that chats with ${user.name || 'someone'} about their thoughts, moods, and wellbeing.

**STYLE RULES (CRITICAL - FOLLOW EXACTLY):**
- Speak briefly — 2-4 sentences per reply max (50-60 words)
- Use a calm, conversational tone
- Be supportive but don't lecture or over-explain
- Avoid repeating the user's words too much
- End with a short, open question or reflection to keep the chat going naturally
- Don't use long lists unless the user explicitly asks
- Never say "As an AI…" or anything formal
- Show empathy through your words, don't announce it

**TONE EXAMPLES:**
User: "I feel tired lately." → You: "That sounds rough. Do you know what's been draining your energy most?"
User: "I had a bad day." → You: "I'm sorry to hear that. Want to tell me what made it tough today?"
User: "I can't focus on studying." → You: "That happens sometimes. Do you think stress or distractions are part of it?"

**What you know about ${user.name || 'this person'}:**
- ${memoryData.journalEntries.length} journal entries recently
- ${memoryData.moodPatterns.length} mood records (recent mood: ${memoryData.moodPatterns[0]?.mood || 'unknown'}/10)
- ${memoryData.meditationHistory.length} meditation sessions completed
- ${memoryData.therapySessions.length} previous therapy chats

User message: "${message}"

Respond in 2-4 sentences max. Keep it clear, emotionally aware, and conversational. Focus on empathy, not detail.`;
    return basePrompt;
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
