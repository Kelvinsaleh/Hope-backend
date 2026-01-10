"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeUserPatterns = analyzeUserPatterns;
exports.analyzeTimePatterns = analyzeTimePatterns;
exports.updatePersonalizationFromPatterns = updatePersonalizationFromPatterns;
const mongoose_1 = require("mongoose");
const Personalization_1 = require("../../models/Personalization");
const ChatSession_1 = require("../../models/ChatSession");
const JournalEntry_1 = require("../../models/JournalEntry");
const Mood_1 = require("../../models/Mood");
const logger_1 = require("../../utils/logger");
/**
 * Analyze recent interactions to extract patterns
 */
async function analyzeUserPatterns(userId, daysToAnalyze = 30) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToAnalyze);
        // Get recent chat sessions
        const recentSessions = await ChatSession_1.ChatSession.find({
            userId: new mongoose_1.Types.ObjectId(userId),
            startTime: { $gte: cutoffDate },
        })
            .sort({ startTime: -1 })
            .limit(50)
            .lean();
        // Get recent journal entries
        const recentJournals = await JournalEntry_1.JournalEntry.find({
            userId: new mongoose_1.Types.ObjectId(userId),
            createdAt: { $gte: cutoffDate },
        })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();
        // Get recent mood data
        const recentMoods = await Mood_1.Mood.find({
            userId: new mongoose_1.Types.ObjectId(userId),
            createdAt: { $gte: cutoffDate },
        })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        const patterns = [];
        // Analyze communication style from messages
        const communicationPattern = analyzeCommunicationStyle(recentSessions);
        if (communicationPattern) {
            patterns.push(communicationPattern);
        }
        // Analyze verbosity preferences
        const verbosityPattern = analyzeVerbosity(recentSessions);
        if (verbosityPattern) {
            patterns.push(verbosityPattern);
        }
        // Analyze topic preferences
        const topicPattern = analyzeTopicPreferences(recentSessions, recentJournals);
        if (topicPattern) {
            patterns.push(topicPattern);
        }
        // Analyze engagement patterns
        const engagementPattern = analyzeEngagement(recentSessions);
        if (engagementPattern) {
            patterns.push(engagementPattern);
        }
        return patterns.filter(p => p.confidence > 0.5 && p.sampleSize >= 3); // Only return confident patterns
    }
    catch (error) {
        logger_1.logger.error("Error analyzing user patterns:", error);
        return [];
    }
}
/**
 * Analyze communication style from messages
 */
function analyzeCommunicationStyle(sessions) {
    const allMessages = sessions.flatMap(s => s.messages || []);
    if (allMessages.length < 5)
        return null;
    const userMessages = allMessages.filter(m => m.role === "user");
    const evidence = [];
    // Analyze message characteristics
    let questionCount = 0;
    let statementCount = 0;
    let shortMessages = 0; // < 50 chars
    let longMessages = 0; // > 200 chars
    let formalTone = 0;
    let casualTone = 0;
    for (const msg of userMessages) {
        const content = (msg.content || "").toLowerCase();
        const length = content.length;
        if (content.includes("?") || content.includes("what") || content.includes("how")) {
            questionCount++;
        }
        else {
            statementCount++;
        }
        if (length < 50)
            shortMessages++;
        if (length > 200)
            longMessages++;
        if (content.includes("please") || content.includes("thank") || content.includes("would you")) {
            formalTone++;
        }
        else if (content.includes("hey") || content.includes("yeah") || content.includes("ok")) {
            casualTone++;
        }
    }
    const total = userMessages.length;
    let inferredStyle = null;
    if (questionCount / total > 0.6 && formalTone / total > 0.3) {
        inferredStyle = "gentle";
        evidence.push("High question frequency with formal tone");
    }
    else if (shortMessages / total > 0.5 && statementCount / total > 0.6) {
        inferredStyle = "direct";
        evidence.push("Prefers short, direct statements");
    }
    else if (longMessages / total > 0.4 && casualTone / total > 0.3) {
        inferredStyle = "supportive";
        evidence.push("Detailed messages with casual, friendly tone");
    }
    if (!inferredStyle || evidence.length === 0)
        return null;
    const confidence = Math.min(0.9, 0.5 + (total / 50) * 0.4 // Higher confidence with more data
    );
    return {
        type: "communication_style",
        evidence,
        confidence,
        frequency: total > 0 ? (questionCount + statementCount) / total : 0,
        sampleSize: total,
    };
}
/**
 * Analyze verbosity preferences
 */
function analyzeVerbosity(sessions) {
    const allMessages = sessions.flatMap(s => s.messages || []);
    if (allMessages.length < 5)
        return null;
    const aiMessages = allMessages.filter(m => m.role === "assistant");
    const evidence = [];
    let conciseResponses = 0; // < 150 tokens
    let moderateResponses = 0; // 150-400 tokens
    let detailedResponses = 0; // > 400 tokens
    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    for (const msg of aiMessages) {
        const content = msg.content || "";
        const estimatedTokens = content.length / 4;
        if (estimatedTokens < 150) {
            conciseResponses++;
        }
        else if (estimatedTokens <= 400) {
            moderateResponses++;
        }
        else {
            detailedResponses++;
        }
    }
    const total = aiMessages.length;
    if (total === 0)
        return null;
    const conciseRatio = conciseResponses / total;
    const moderateRatio = moderateResponses / total;
    const detailedRatio = detailedResponses / total;
    let inferredVerbosity = null;
    if (conciseRatio > 0.6) {
        inferredVerbosity = "concise";
        evidence.push("User often receives concise responses");
    }
    else if (detailedRatio > 0.4) {
        inferredVerbosity = "detailed";
        evidence.push("User prefers detailed explanations");
    }
    else {
        inferredVerbosity = "moderate";
        evidence.push("User balanced between concise and detailed");
    }
    const confidence = Math.min(0.85, 0.5 + (total / 30) * 0.35);
    return {
        type: "verbosity",
        evidence,
        confidence,
        frequency: Math.max(conciseRatio, moderateRatio, detailedRatio),
        sampleSize: total,
    };
}
/**
 * Analyze topic preferences
 */
function analyzeTopicPreferences(sessions, journals) {
    const allMessages = sessions.flatMap(s => s.messages || []).filter(m => m.role === "user");
    const allContent = [
        ...allMessages.map(m => m.content || ""),
        ...journals.map(j => `${j.title || ""} ${j.content || ""}`),
    ];
    if (allContent.length < 3)
        return null;
    // Simple keyword-based topic detection
    const topicKeywords = {
        anxiety: ["anxious", "worry", "nervous", "stress", "panic"],
        depression: ["sad", "down", "depressed", "hopeless", "empty"],
        relationships: ["friend", "family", "partner", "relationship", "love"],
        work: ["work", "job", "career", "boss", "colleague"],
        health: ["health", "sleep", "exercise", "physical", "body"],
        goals: ["goal", "achieve", "plan", "future", "target"],
        mindfulness: ["mindful", "meditation", "breath", "present", "aware"],
    };
    const topicCounts = {};
    const evidence = [];
    for (const content of allContent) {
        const lowerContent = content.toLowerCase();
        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            const matches = keywords.filter(k => lowerContent.includes(k)).length;
            if (matches > 0) {
                topicCounts[topic] = (topicCounts[topic] || 0) + matches;
            }
        }
    }
    const preferredTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([topic]) => topic);
    if (preferredTopics.length === 0)
        return null;
    evidence.push(`Most discussed topics: ${preferredTopics.join(", ")}`);
    const totalMentions = Object.values(topicCounts).reduce((a, b) => a + b, 0);
    const confidence = Math.min(0.8, 0.5 + (totalMentions / 20) * 0.3);
    return {
        type: "topic_preference",
        evidence,
        confidence,
        frequency: preferredTopics.length > 0 ? topicCounts[preferredTopics[0]] / totalMentions : 0,
        sampleSize: allContent.length,
    };
}
/**
 * Analyze engagement patterns
 */
function analyzeEngagement(sessions) {
    if (sessions.length < 3)
        return null;
    const sessionLengths = sessions.map(s => {
        const messages = s.messages || [];
        return messages.length;
    });
    const avgMessages = sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length;
    const avgDuration = sessions.reduce((sum, s) => {
        const duration = s.endTime && s.startTime
            ? (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 1000 / 60 // minutes
            : 0;
        return sum + duration;
    }, 0) / sessions.length;
    const evidence = [];
    let engagementLevel = "medium";
    if (avgMessages > 10 && avgDuration > 15) {
        engagementLevel = "high";
        evidence.push("Long sessions with many messages indicate high engagement");
    }
    else if (avgMessages < 3 || avgDuration < 5) {
        engagementLevel = "low";
        evidence.push("Short sessions with few messages indicate lower engagement");
    }
    else {
        evidence.push("Moderate engagement with balanced session length");
    }
    const confidence = Math.min(0.75, 0.5 + (sessions.length / 20) * 0.25);
    return {
        type: "engagement",
        evidence,
        confidence,
        frequency: engagementLevel === "high" ? 0.8 : engagementLevel === "medium" ? 0.5 : 0.2,
        sampleSize: sessions.length,
    };
}
/**
 * Analyze time-based patterns
 */
async function analyzeTimePatterns(userId, daysToAnalyze = 30) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToAnalyze);
        const sessions = await ChatSession_1.ChatSession.find({
            userId: new mongoose_1.Types.ObjectId(userId),
            startTime: { $gte: cutoffDate },
        })
            .select("startTime endTime")
            .lean();
        const hourCounts = {};
        const dayCounts = {};
        const durations = [];
        for (const session of sessions) {
            const startTime = new Date(session.startTime);
            const hour = startTime.getHours();
            const day = startTime.getDay(); // 0 = Sunday
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            dayCounts[day] = (dayCounts[day] || 0) + 1;
            if (session.endTime) {
                const duration = (new Date(session.endTime).getTime() - startTime.getTime()) / 1000 / 60; // minutes
                if (duration > 0 && duration < 180) { // Reasonable range
                    durations.push(duration);
                }
            }
        }
        // Get most common hours (appear in at least 20% of sessions)
        const preferredHours = Object.entries(hourCounts)
            .filter(([_, count]) => count / sessions.length >= 0.2)
            .map(([hour]) => parseInt(hour))
            .sort((a, b) => hourCounts[b] - hourCounts[a]);
        // Get most common days (appear in at least 25% of sessions)
        const preferredDays = Object.entries(dayCounts)
            .filter(([_, count]) => count / sessions.length >= 0.25)
            .map(([day]) => parseInt(day))
            .sort((a, b) => dayCounts[b] - dayCounts[a]);
        const averageDuration = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;
        const sortedDurations = durations.sort((a, b) => a - b);
        const typicalRange = durations.length > 0
            ? [
                sortedDurations[Math.floor(sortedDurations.length * 0.25)], // 25th percentile
                sortedDurations[Math.floor(sortedDurations.length * 0.75)], // 75th percentile
            ]
            : [0, 0];
        return {
            preferredHours: preferredHours.slice(0, 6), // Top 6 hours
            preferredDays: preferredDays.slice(0, 4), // Top 4 days
            averageSessionDuration: averageDuration,
            typicalRange,
        };
    }
    catch (error) {
        logger_1.logger.error("Error analyzing time patterns:", error);
        return {
            preferredHours: [],
            preferredDays: [],
            averageSessionDuration: 0,
            typicalRange: [0, 0],
        };
    }
}
/**
 * Update personalization with analyzed patterns
 * Only updates when patterns are consistent and confident
 */
async function updatePersonalizationFromPatterns(userId, patterns, timeAnalysis) {
    try {
        let personalization = await Personalization_1.Personalization.findOne({ userId: new mongoose_1.Types.ObjectId(userId) });
        if (!personalization) {
            // Create new personalization entry
            personalization = new Personalization_1.Personalization({
                userId: new mongoose_1.Types.ObjectId(userId),
                intent: {
                    primaryGoals: [],
                    currentFocus: [],
                    priorities: {},
                    lastGoalsUpdate: new Date(),
                },
                communication: {
                    style: "gentle",
                    verbosity: "moderate",
                    responseFormat: "conversational",
                    emojiUsage: "minimal",
                    topicsToAvoid: [],
                    preferredTopics: [],
                },
                behavioralTendencies: [],
                timePatterns: {},
                engagement: {
                    averageSessionLength: 0,
                    messagesPerSession: 0,
                    sessionFrequency: 0,
                    responseQuality: 0.5,
                    lastEngagement: new Date(),
                    engagementTrend: "stable",
                },
                adaptationRules: [],
                userOverrides: {},
                lastAnalysis: new Date(),
                dataQuality: 0.3,
                decayRate: 0.05,
                personalizationEnabled: true,
                explainability: {
                    activeRules: [],
                    inferredPatterns: [],
                    lastExplained: new Date(),
                },
                version: 1,
            });
        }
        // Update time patterns
        personalization.timePatterns = {
            hourOfDay: timeAnalysis.preferredHours,
            dayOfWeek: timeAnalysis.preferredDays,
            sessionDuration: {
                average: timeAnalysis.averageSessionDuration,
                typicalRange: timeAnalysis.typicalRange,
            },
            lastActiveTime: new Date(),
        };
        // Update communication style if pattern is confident
        const commPattern = patterns.find(p => p.type === "communication_style");
        if (commPattern && commPattern.confidence > 0.6 && !personalization.userOverrides?.communicationStyle) {
            // Only update inferred style if user hasn't explicitly overridden
            personalization.communication.inferredStyle = commPattern.evidence[0]?.includes("gentle")
                ? "gentle"
                : commPattern.evidence[0]?.includes("direct")
                    ? "direct"
                    : "supportive";
        }
        // Update verbosity if pattern is confident
        const verbosityPattern = patterns.find(p => p.type === "verbosity");
        if (verbosityPattern && verbosityPattern.confidence > 0.6 && !personalization.userOverrides?.verbosity) {
            personalization.communication.verbosity = verbosityPattern.evidence[0]?.includes("concise")
                ? "concise"
                : verbosityPattern.evidence[0]?.includes("detailed")
                    ? "detailed"
                    : "moderate";
        }
        // Update topic preferences
        const topicPattern = patterns.find(p => p.type === "topic_preference");
        if (topicPattern && topicPattern.confidence > 0.5) {
            const topics = topicPattern.evidence[0]?.split(":")[1]?.split(", ") || [];
            personalization.communication.preferredTopics = [
                ...new Set([...personalization.communication.preferredTopics, ...topics]),
            ].slice(0, 10); // Limit to top 10
        }
        // Update engagement metrics
        const engagementPattern = patterns.find(p => p.type === "engagement");
        if (engagementPattern) {
            personalization.engagement.engagementTrend = engagementPattern.frequency > 0.7
                ? "increasing"
                : engagementPattern.frequency < 0.3
                    ? "decreasing"
                    : "stable";
        }
        // Update behavioral tendencies
        for (const pattern of patterns) {
            const existing = personalization.behavioralTendencies.find((t) => t.pattern === pattern.evidence.join("; "));
            if (existing) {
                // Update existing tendency
                existing.frequency = (existing.frequency + pattern.frequency) / 2;
                existing.confidence = Math.max(existing.confidence, pattern.confidence);
                existing.lastObserved = new Date();
                existing.sampleSize += pattern.sampleSize;
            }
            else if (pattern.confidence > 0.6) {
                // Add new confident pattern
                personalization.behavioralTendencies.push({
                    pattern: pattern.evidence.join("; "),
                    frequency: pattern.frequency,
                    confidence: pattern.confidence,
                    firstObserved: new Date(),
                    lastObserved: new Date(),
                    sampleSize: pattern.sampleSize,
                });
            }
        }
        // Limit behavioral tendencies to most confident ones
        personalization.behavioralTendencies.sort((a, b) => b.confidence - a.confidence);
        personalization.behavioralTendencies = personalization.behavioralTendencies.slice(0, 20);
        // Update data quality based on sample sizes
        const totalSamples = patterns.reduce((sum, p) => sum + p.sampleSize, 0);
        personalization.dataQuality = Math.min(1.0, 0.3 + (totalSamples / 100) * 0.7);
        // Update analysis timestamp
        personalization.lastAnalysis = new Date();
        await personalization.save();
        logger_1.logger.info(`Updated personalization for user ${userId} with ${patterns.length} patterns`);
    }
    catch (error) {
        logger_1.logger.error("Error updating personalization from patterns:", error);
        throw error;
    }
}
