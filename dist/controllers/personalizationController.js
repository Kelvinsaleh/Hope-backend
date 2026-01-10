"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversationSummaries = exports.triggerAnalysis = exports.getExplainability = exports.resetPersonalization = exports.updatePersonalization = exports.getPersonalization = void 0;
const mongoose_1 = require("mongoose");
const Personalization_1 = require("../models/Personalization");
const ConversationSummary_1 = require("../models/ConversationSummary");
const logger_1 = require("../utils/logger");
const personalizationBuilder_1 = require("../services/personalization/personalizationBuilder");
const personalizationAnalysisJob_1 = require("../jobs/personalizationAnalysisJob");
/**
 * Personalization Controller
 * Handles CRUD operations for user personalization preferences
 */
/**
 * Get personalization data for current user
 */
const getPersonalization = async (req, res) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) {
            res.status(401).json({ success: false, error: "Unauthorized" });
            return;
        }
        let personalization = await Personalization_1.Personalization.findOne({
            userId: new mongoose_1.Types.ObjectId(userId),
        }).lean();
        // If no personalization exists, create a default one
        if (!personalization) {
            const defaultPersonalization = new Personalization_1.Personalization({
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
            await defaultPersonalization.save();
            personalization = defaultPersonalization.toObject();
        }
        // Build context for response (includes summaries)
        const context = await (0, personalizationBuilder_1.buildPersonalizationContext)(userId, true);
        // Type guard: ensure personalization is not null
        if (!personalization) {
            res.status(404).json({ success: false, error: "Personalization not found" });
            return;
        }
        res.json({
            success: true,
            personalization: {
                intent: personalization.intent,
                communication: {
                    ...personalization.communication,
                    // Use user overrides if available
                    style: personalization.userOverrides?.communicationStyle || personalization.communication?.style || "gentle",
                    verbosity: personalization.userOverrides?.verbosity || personalization.communication?.verbosity || "moderate",
                    topicsToAvoid: [
                        ...(personalization.userOverrides?.topicsToAvoid || []),
                        ...(personalization.communication?.topicsToAvoid || []),
                    ],
                    preferredTopics: [
                        ...(personalization.userOverrides?.preferredTopics || []),
                        ...(personalization.communication?.preferredTopics || []),
                    ],
                },
                behavioralTendencies: personalization.behavioralTendencies || [],
                timePatterns: personalization.timePatterns || {},
                engagement: personalization.engagement || {},
                userOverrides: personalization.userOverrides || {},
                lastAnalysis: personalization.lastAnalysis,
                dataQuality: personalization.dataQuality,
                personalizationEnabled: personalization.personalizationEnabled,
                explainability: personalization.explainability || {},
                version: personalization.version,
            },
            context: context || null,
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching personalization:", error);
        res.status(500).json({ success: false, error: "Failed to fetch personalization" });
    }
};
exports.getPersonalization = getPersonalization;
/**
 * Update personalization preferences (user overrides)
 */
const updatePersonalization = async (req, res) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) {
            res.status(401).json({ success: false, error: "Unauthorized" });
            return;
        }
        const { intent, communication, userOverrides, personalizationEnabled } = req.body;
        // Find or create personalization
        let personalization = await Personalization_1.Personalization.findOne({
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!personalization) {
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
        // Update intent if provided
        if (intent) {
            if (intent.primaryGoals !== undefined) {
                personalization.intent.primaryGoals = Array.isArray(intent.primaryGoals)
                    ? intent.primaryGoals.slice(0, 10) // Limit to 10
                    : [];
            }
            if (intent.currentFocus !== undefined) {
                personalization.intent.currentFocus = Array.isArray(intent.currentFocus)
                    ? intent.currentFocus.slice(0, 5) // Limit to 5
                    : [];
            }
            if (intent.priorities !== undefined && typeof intent.priorities === "object") {
                personalization.intent.priorities = intent.priorities;
            }
            personalization.intent.lastGoalsUpdate = new Date();
        }
        // Update communication preferences if provided (user explicit overrides)
        if (communication) {
            if (communication.style && ["gentle", "direct", "supportive"].includes(communication.style)) {
                personalization.userOverrides.communicationStyle = communication.style;
            }
            if (communication.verbosity && ["concise", "moderate", "detailed"].includes(communication.verbosity)) {
                personalization.userOverrides.verbosity = communication.verbosity;
            }
            if (communication.topicsToAvoid !== undefined) {
                personalization.userOverrides.topicsToAvoid = Array.isArray(communication.topicsToAvoid)
                    ? communication.topicsToAvoid.slice(0, 10)
                    : [];
            }
            if (communication.preferredTopics !== undefined) {
                personalization.userOverrides.preferredTopics = Array.isArray(communication.preferredTopics)
                    ? communication.preferredTopics.slice(0, 10)
                    : [];
            }
        }
        // Update user overrides directly if provided
        if (userOverrides) {
            personalization.userOverrides = {
                ...personalization.userOverrides,
                ...userOverrides,
            };
        }
        // Update personalization enabled flag
        if (personalizationEnabled !== undefined) {
            personalization.personalizationEnabled = Boolean(personalizationEnabled);
        }
        await personalization.save();
        logger_1.logger.info(`Updated personalization for user ${userId}`);
        res.json({
            success: true,
            personalization: {
                intent: personalization.intent,
                communication: personalization.communication,
                userOverrides: personalization.userOverrides,
                personalizationEnabled: personalization.personalizationEnabled,
                version: personalization.version,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Error updating personalization:", error);
        res.status(500).json({ success: false, error: "Failed to update personalization" });
    }
};
exports.updatePersonalization = updatePersonalization;
/**
 * Reset personalization (remove inferred patterns, keep explicit user preferences)
 */
const resetPersonalization = async (req, res) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) {
            res.status(401).json({ success: false, error: "Unauthorized" });
            return;
        }
        const { resetType = "inferred" } = req.body; // "inferred" | "all" | "communication" | "behavioral"
        const personalization = await Personalization_1.Personalization.findOne({
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!personalization) {
            res.status(404).json({ success: false, error: "Personalization not found" });
            return;
        }
        if (resetType === "all") {
            // Reset everything except user overrides
            personalization.behavioralTendencies = [];
            personalization.adaptationRules = personalization.adaptationRules.filter((r) => r.source === "user_explicit");
            personalization.communication.inferredStyle = undefined;
            personalization.communication.preferredTopics = [];
            personalization.communication.topicsToAvoid = [];
            personalization.timePatterns = {};
            personalization.dataQuality = 0.3;
            personalization.explainability = {
                activeRules: [],
                inferredPatterns: [],
                lastExplained: new Date(),
            };
        }
        else if (resetType === "inferred") {
            // Reset only inferred patterns, keep user overrides
            personalization.behavioralTendencies = [];
            personalization.adaptationRules = personalization.adaptationRules.filter((r) => r.source === "user_explicit");
            personalization.communication.inferredStyle = undefined;
            personalization.communication.preferredTopics = personalization.communication.preferredTopics.filter((t) => personalization.userOverrides?.preferredTopics?.includes(t));
            personalization.communication.topicsToAvoid = personalization.communication.topicsToAvoid.filter((t) => personalization.userOverrides?.topicsToAvoid?.includes(t));
        }
        else if (resetType === "communication") {
            // Reset only communication preferences
            personalization.communication.inferredStyle = undefined;
            personalization.communication.verbosity = personalization.userOverrides?.verbosity || "moderate";
            personalization.userOverrides.communicationStyle = undefined;
        }
        else if (resetType === "behavioral") {
            // Reset only behavioral patterns
            personalization.behavioralTendencies = [];
            personalization.adaptationRules = personalization.adaptationRules.filter((r) => r.source === "user_explicit");
        }
        personalization.lastAnalysis = new Date();
        personalization.version = (personalization.version || 1) + 1;
        await personalization.save();
        logger_1.logger.info(`Reset personalization for user ${userId} (type: ${resetType})`);
        res.json({
            success: true,
            message: `Personalization reset (${resetType})`,
            personalization: {
                version: personalization.version,
                lastAnalysis: personalization.lastAnalysis,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Error resetting personalization:", error);
        res.status(500).json({ success: false, error: "Failed to reset personalization" });
    }
};
exports.resetPersonalization = resetPersonalization;
/**
 * Get explainability info (what personalization is being applied and why)
 */
const getExplainability = async (req, res) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) {
            res.status(401).json({ success: false, error: "Unauthorized" });
            return;
        }
        const personalization = await Personalization_1.Personalization.findOne({
            userId: new mongoose_1.Types.ObjectId(userId),
        }).lean();
        if (!personalization) {
            res.status(404).json({ success: false, error: "Personalization not found" });
            return;
        }
        // Build explainability report
        const explainability = {
            activeRules: personalization.explainability?.activeRules || [],
            inferredPatterns: personalization.explainability?.inferredPatterns || [],
            lastExplained: personalization.explainability?.lastExplained || new Date(),
            communication: {
                style: {
                    value: personalization.userOverrides?.communicationStyle || personalization.communication?.style || "gentle",
                    source: personalization.userOverrides?.communicationStyle ? "user_explicit" : "system_default",
                    inferred: personalization.communication?.inferredStyle,
                },
                verbosity: {
                    value: personalization.userOverrides?.verbosity || personalization.communication?.verbosity || "moderate",
                    source: personalization.userOverrides?.verbosity ? "user_explicit" : "system_default",
                },
            },
            behavioralTendencies: (personalization.behavioralTendencies || [])
                .filter((t) => t.confidence > 0.5)
                .slice(0, 10)
                .map((t) => ({
                pattern: t.pattern,
                confidence: t.confidence,
                frequency: t.frequency,
                sampleSize: t.sampleSize,
                lastObserved: t.lastObserved,
            })),
            dataQuality: personalization.dataQuality,
            lastAnalysis: personalization.lastAnalysis,
            version: personalization.version,
        };
        res.json({
            success: true,
            explainability,
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching explainability:", error);
        res.status(500).json({ success: false, error: "Failed to fetch explainability" });
    }
};
exports.getExplainability = getExplainability;
/**
 * Trigger manual personalization analysis (admin or user-initiated)
 */
const triggerAnalysis = async (req, res) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) {
            res.status(401).json({ success: false, error: "Unauthorized" });
            return;
        }
        // Run analysis asynchronously (don't wait for completion)
        (0, personalizationAnalysisJob_1.analyzeUserPersonalization)(userId).catch((error) => {
            logger_1.logger.error(`Error in manual analysis for user ${userId}:`, error);
        });
        res.json({
            success: true,
            message: "Personalization analysis triggered. Results will be available shortly.",
        });
    }
    catch (error) {
        logger_1.logger.error("Error triggering analysis:", error);
        res.status(500).json({ success: false, error: "Failed to trigger analysis" });
    }
};
exports.triggerAnalysis = triggerAnalysis;
/**
 * Get conversation summaries for user
 */
const getConversationSummaries = async (req, res) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) {
            res.status(401).json({ success: false, error: "Unauthorized" });
            return;
        }
        const { type, limit = 10 } = req.query;
        const query = {
            userId: new mongoose_1.Types.ObjectId(userId),
        };
        if (type && ["weekly", "monthly", "session", "topic"].includes(type)) {
            query.summaryType = type;
        }
        const summaries = await ConversationSummary_1.ConversationSummary.find(query)
            .sort({ periodEnd: -1 })
            .limit(parseInt(limit))
            .lean();
        res.json({
            success: true,
            summaries: summaries.map(s => ({
                id: s._id,
                summaryType: s.summaryType,
                periodStart: s.periodStart,
                periodEnd: s.periodEnd,
                summary: s.summary,
                keyTopics: s.keyTopics,
                emotionalThemes: s.emotionalThemes,
                insights: s.insights,
                actionItems: s.actionItems,
                compressionRatio: s.compressionRatio,
                confidence: s.confidence,
                completeness: s.completeness,
                createdAt: s.createdAt,
            })),
        });
    }
    catch (error) {
        logger_1.logger.error("Error fetching conversation summaries:", error);
        res.status(500).json({ success: false, error: "Failed to fetch summaries" });
    }
};
exports.getConversationSummaries = getConversationSummaries;
