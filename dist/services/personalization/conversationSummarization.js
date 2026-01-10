"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePeriodSummary = generatePeriodSummary;
exports.getRecentSummaries = getRecentSummaries;
exports.cleanupOldSummaries = cleanupOldSummaries;
const mongoose_1 = require("mongoose");
const ConversationSummary_1 = require("../../models/ConversationSummary");
const ChatSession_1 = require("../../models/ChatSession");
const logger_1 = require("../../utils/logger");
const generative_ai_1 = require("@google/generative-ai");
const conversationOptimizer_1 = require("../../utils/conversationOptimizer");
/**
 * Conversation Summarization Service
 * Creates compact summaries of conversations for long-term context
 * Replaces full message history with distilled insights
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = GEMINI_API_KEY ? new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY) : null;
/**
 * Generate summary for a period (weekly or monthly)
 */
async function generatePeriodSummary(userId, summaryType, periodStart, periodEnd) {
    try {
        // Check if summary already exists
        const existing = await ConversationSummary_1.ConversationSummary.findOne({
            userId: new mongoose_1.Types.ObjectId(userId),
            summaryType,
            periodStart: { $gte: periodStart, $lte: periodEnd },
            periodEnd: { $gte: periodStart, $lte: periodEnd },
        }).lean();
        if (existing && existing.version > 0) {
            logger_1.logger.info(`Summary already exists for user ${userId}, period ${summaryType}`);
            return existing;
        }
        // Get all sessions in the period
        const sessions = await ChatSession_1.ChatSession.find({
            userId: new mongoose_1.Types.ObjectId(userId),
            startTime: { $gte: periodStart, $lte: periodEnd },
        })
            .sort({ startTime: 1 })
            .lean();
        if (sessions.length === 0) {
            logger_1.logger.info(`No sessions found for user ${userId} in period ${summaryType}`);
            return null;
        }
        // Collect all messages from sessions
        const allMessages = sessions.flatMap(s => s.messages || []);
        if (allMessages.length === 0) {
            return null;
        }
        // Calculate total tokens in original messages
        const totalMessageText = allMessages.map(m => m.content || "").join("\n");
        const originalTokenCount = (0, conversationOptimizer_1.estimateTokens)(totalMessageText);
        // Generate summary using AI
        const summary = await generateAISummary(allMessages, summaryType);
        if (!summary) {
            logger_1.logger.warn(`Failed to generate AI summary for user ${userId}`);
            // Fallback to basic summary
            return createBasicSummary(userId, summaryType, periodStart, periodEnd, sessions, allMessages, originalTokenCount);
        }
        // Extract patterns and insights
        const patterns = extractPatternsFromSummary(summary.summary);
        const keyTopics = extractTopics(summary.summary);
        const emotionalThemes = extractEmotionalThemes(summary.summary);
        const insights = extractInsights(summary.summary);
        const actionItems = extractActionItems(summary.summary);
        // Calculate compression metrics
        const summaryTokens = (0, conversationOptimizer_1.estimateTokens)(summary.summary);
        const compressionRatio = originalTokenCount > 0 ? originalTokenCount / summaryTokens : 0;
        // Create or update summary
        const summaryDoc = await ConversationSummary_1.ConversationSummary.findOneAndUpdate({
            userId: new mongoose_1.Types.ObjectId(userId),
            summaryType,
            periodStart,
            periodEnd,
        }, {
            userId: new mongoose_1.Types.ObjectId(userId),
            summaryType,
            periodStart,
            periodEnd,
            summary: summary.summary,
            keyTopics,
            emotionalThemes,
            insights,
            actionItems,
            messageCount: allMessages.length,
            tokenCount: originalTokenCount,
            summaryTokens,
            compressionRatio,
            extractedPatterns: patterns,
            confidence: summary.confidence || 0.7,
            completeness: summary.completeness || 0.7,
            version: (existing?.version || 0) + 1,
        }, { upsert: true, new: true });
        logger_1.logger.info(`Generated ${summaryType} summary for user ${userId}: ${compressionRatio.toFixed(2)}x compression`);
        return summaryDoc;
    }
    catch (error) {
        logger_1.logger.error(`Error generating ${summaryType} summary for user ${userId}:`, error);
        return null;
    }
}
/**
 * Generate AI-powered summary of conversations
 */
async function generateAISummary(messages, summaryType) {
    if (!genAI) {
        logger_1.logger.warn("Gemini API not configured, using basic summary");
        return null;
    }
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        // Format messages for summarization (only include user and assistant messages)
        const conversationText = messages
            .filter(m => m.role === "user" || m.role === "assistant")
            .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content || ""}`)
            .join("\n\n")
            .slice(0, 50000); // Limit input size
        const prompt = `You are a therapist's assistant analyzing a ${summaryType} summary of therapy conversations.

Analyze the following conversation history and create a concise, structured summary. Focus on:

1. **Key Topics**: Main themes discussed (mental health topics, life events, challenges, goals)
2. **Emotional Patterns**: Recurring emotional states or themes (anxiety, depression, hope, progress, etc.)
3. **Key Insights**: Important realizations, breakthroughs, or patterns identified
4. **Action Items**: Goals set, techniques recommended, homework assigned, or commitments made
5. **Communication Style**: How the user communicates (direct, gentle, detailed, brief, etc.)
6. **Progress Indicators**: Notable improvements, setbacks, or changes in user's state

**Important Guidelines:**
- Keep the summary under 800 words
- Focus on patterns and insights, not individual message details
- Avoid storing sensitive personal information beyond general themes
- Maintain therapeutic context without verbatim quotes
- Highlight what's most relevant for future sessions

Conversation History:
${conversationText}

Generate a comprehensive but concise summary following the structure above:`;
        const result = await model.generateContent(prompt);
        const response = result.response;
        const summary = response.text();
        // Extract confidence and completeness from response if possible
        // For now, use defaults
        return {
            summary,
            confidence: 0.8,
            completeness: 0.75,
        };
    }
    catch (error) {
        logger_1.logger.error("Error generating AI summary:", error);
        return null;
    }
}
/**
 * Create basic summary when AI is unavailable
 */
function createBasicSummary(userId, summaryType, periodStart, periodEnd, sessions, messages, tokenCount) {
    try {
        // Basic pattern extraction
        const userMessages = messages.filter(m => m.role === "user");
        const aiMessages = messages.filter(m => m.role === "assistant");
        const topics = extractTopicsBasic(userMessages);
        const summary = `This ${summaryType} summary covers ${sessions.length} therapy sessions with ${userMessages.length} user messages and ${aiMessages.length} AI responses. Main topics discussed include: ${topics.join(", ")}.`;
        const summaryTokens = (0, conversationOptimizer_1.estimateTokens)(summary);
        const compressionRatio = tokenCount > 0 ? tokenCount / summaryTokens : 0;
        const summaryDoc = new ConversationSummary_1.ConversationSummary({
            userId: new mongoose_1.Types.ObjectId(userId),
            summaryType,
            periodStart,
            periodEnd,
            summary,
            keyTopics: topics,
            emotionalThemes: [],
            insights: [],
            actionItems: [],
            messageCount: messages.length,
            tokenCount,
            summaryTokens,
            compressionRatio,
            extractedPatterns: {},
            confidence: 0.5,
            completeness: 0.5,
            version: 1,
        });
        return summaryDoc;
    }
    catch (error) {
        logger_1.logger.error("Error creating basic summary:", error);
        return null;
    }
}
/**
 * Extract topics from summary text (basic keyword-based)
 */
function extractTopics(summary) {
    const topicKeywords = {
        anxiety: ["anxious", "worry", "nervous", "stress", "panic", "anxiety"],
        depression: ["sad", "depressed", "hopeless", "empty", "down", "depression"],
        relationships: ["friend", "family", "partner", "relationship", "love", "social"],
        work: ["work", "job", "career", "boss", "colleague", "professional"],
        health: ["health", "sleep", "exercise", "physical", "body", "wellness"],
        goals: ["goal", "achieve", "plan", "future", "target", "objective"],
        mindfulness: ["mindful", "meditation", "breath", "present", "aware", "mindfulness"],
        coping: ["coping", "strategy", "technique", "skill", "tool"],
        trauma: ["trauma", "past", "memory", "experience", "event"],
        selfesteem: ["self-esteem", "confidence", "worth", "value", "self-worth"],
    };
    const lowerSummary = summary.toLowerCase();
    const foundTopics = {};
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
        const matches = keywords.filter(k => lowerSummary.includes(k)).length;
        if (matches > 0) {
            foundTopics[topic] = matches;
        }
    }
    return Object.entries(foundTopics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic]) => topic);
}
/**
 * Extract topics from messages (basic keyword-based)
 */
function extractTopicsBasic(messages) {
    const allText = messages.map(m => (m.content || "").toLowerCase()).join(" ");
    return extractTopics(allText);
}
/**
 * Extract emotional themes from summary
 */
function extractEmotionalThemes(summary) {
    const emotionKeywords = {
        positive: ["happy", "joy", "hope", "grateful", "proud", "excited", "content", "peaceful"],
        negative: ["sad", "anxious", "angry", "frustrated", "overwhelmed", "lonely", "guilty"],
        neutral: ["calm", "focused", "reflective", "contemplative"],
        mixed: ["conflicted", "uncertain", "ambivalent"],
    };
    const lowerSummary = summary.toLowerCase();
    const foundEmotions = [];
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        if (keywords.some(k => lowerSummary.includes(k))) {
            foundEmotions.push(emotion);
        }
    }
    return foundEmotions;
}
/**
 * Extract insights from summary (look for phrases indicating insights)
 */
function extractInsights(summary) {
    const insightPatterns = [
        /realized that (.+?)(?:\.|$)/gi,
        /understood that (.+?)(?:\.|$)/gi,
        /learned that (.+?)(?:\.|$)/gi,
        /discovered (.+?)(?:\.|$)/gi,
        /insight: (.+?)(?:\.|$)/gi,
        /key insight: (.+?)(?:\.|$)/gi,
    ];
    const insights = [];
    for (const pattern of insightPatterns) {
        const matches = summary.matchAll(pattern);
        for (const match of matches) {
            if (match[1] && match[1].length < 200) {
                insights.push(match[1].trim());
            }
        }
    }
    return insights.slice(0, 5); // Limit to top 5
}
/**
 * Extract action items from summary
 */
function extractActionItems(summary) {
    const actionPatterns = [
        /goal[s]?: (.+?)(?:\.|$)/gi,
        /action[s]?: (.+?)(?:\.|$)/gi,
        /homework: (.+?)(?:\.|$)/gi,
        /commitment[s]?: (.+?)(?:\.|$)/gi,
        /plan[s]?: (.+?)(?:\.|$)/gi,
        /will (.+?)(?:\.|$)/gi,
    ];
    const actions = [];
    for (const pattern of actionPatterns) {
        const matches = summary.matchAll(pattern);
        for (const match of matches) {
            if (match[1] && match[1].length < 200) {
                actions.push(match[1].trim());
            }
        }
    }
    return actions.slice(0, 5); // Limit to top 5
}
/**
 * Extract patterns from summary for personalization
 */
function extractPatternsFromSummary(summary) {
    const lowerSummary = summary.toLowerCase();
    let communicationStyle;
    if (lowerSummary.includes("direct") || lowerSummary.includes("brief") || lowerSummary.includes("concise")) {
        communicationStyle = "direct";
    }
    else if (lowerSummary.includes("gentle") || lowerSummary.includes("soft") || lowerSummary.includes("careful")) {
        communicationStyle = "gentle";
    }
    else if (lowerSummary.includes("supportive") || lowerSummary.includes("encouraging") || lowerSummary.includes("warm")) {
        communicationStyle = "supportive";
    }
    const preferredTopics = extractTopics(summary);
    let engagementLevel;
    if (lowerSummary.includes("high engagement") || lowerSummary.includes("very active") || lowerSummary.includes("frequent")) {
        engagementLevel = "high";
    }
    else if (lowerSummary.includes("low engagement") || lowerSummary.includes("rare") || lowerSummary.includes("infrequent")) {
        engagementLevel = "low";
    }
    else {
        engagementLevel = "medium";
    }
    return {
        communicationStyle,
        preferredTopics,
        avoidancePatterns: [],
        engagementLevel,
    };
}
/**
 * Get recent summaries for a user (for context injection)
 */
async function getRecentSummaries(userId, limit = 4) {
    try {
        const summaries = await ConversationSummary_1.ConversationSummary.find({
            userId: new mongoose_1.Types.ObjectId(userId),
        })
            .sort({ periodEnd: -1 })
            .limit(limit)
            .lean();
        return summaries;
    }
    catch (error) {
        logger_1.logger.error(`Error fetching recent summaries for user ${userId}:`, error);
        return [];
    }
}
/**
 * Clean up old summaries (optional, for maintenance)
 */
async function cleanupOldSummaries(daysToKeep = 365) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        const result = await ConversationSummary_1.ConversationSummary.deleteMany({
            createdAt: { $lt: cutoffDate },
            summaryType: { $in: ["weekly", "monthly"] }, // Only clean up periodic summaries, keep session summaries
        });
        logger_1.logger.info(`Cleaned up ${result.deletedCount} old summaries`);
        return result.deletedCount || 0;
    }
    catch (error) {
        logger_1.logger.error("Error cleaning up old summaries:", error);
        return 0;
    }
}
