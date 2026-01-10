import { Request, Response } from "express";
import { Types, Document } from "mongoose";
import { Personalization, IPersonalization, IAdaptationRule, IBehavioralTendency } from "../models/Personalization";
import { ConversationSummary, IConversationSummary } from "../models/ConversationSummary";
import { logger } from "../utils/logger";
import { buildPersonalizationContext } from "../services/personalization/personalizationBuilder";
import { analyzeUserPatterns, analyzeTimePatterns, updatePersonalizationFromPatterns } from "../services/personalization/patternAnalysis";
import { analyzeUserPersonalization } from "../jobs/personalizationAnalysisJob";

/**
 * Personalization Controller
 * Handles CRUD operations for user personalization preferences
 */

/**
 * Get personalization data for current user
 */
export const getPersonalization = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    let personalization = await Personalization.findOne({
      userId: new Types.ObjectId(userId),
    }).lean() as (Omit<IPersonalization, keyof Document> & { _id: any }) | null;

    // If no personalization exists, create a default one
    if (!personalization) {
      const defaultPersonalization = new Personalization({
        userId: new Types.ObjectId(userId),
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
      personalization = defaultPersonalization.toObject() as Omit<IPersonalization, keyof Document> & { _id: any };
    }

    // Build context for response (includes summaries)
    const context = await buildPersonalizationContext(userId, true);

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
          style: (personalization.userOverrides as any)?.communicationStyle || personalization.communication?.style || "gentle",
          verbosity: (personalization.userOverrides as any)?.verbosity || personalization.communication?.verbosity || "moderate",
          topicsToAvoid: [
            ...((personalization.userOverrides as any)?.topicsToAvoid || []),
            ...(personalization.communication?.topicsToAvoid || []),
          ],
          preferredTopics: [
            ...((personalization.userOverrides as any)?.preferredTopics || []),
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
  } catch (error) {
    logger.error("Error fetching personalization:", error);
    res.status(500).json({ success: false, error: "Failed to fetch personalization" });
  }
};

/**
 * Update personalization preferences (user overrides)
 */
export const updatePersonalization = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const { intent, communication, userOverrides, personalizationEnabled } = req.body;

    // Find or create personalization
    let personalization = await Personalization.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!personalization) {
      personalization = new Personalization({
        userId: new Types.ObjectId(userId),
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
    logger.info(`Updated personalization for user ${userId}`);

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
  } catch (error) {
    logger.error("Error updating personalization:", error);
    res.status(500).json({ success: false, error: "Failed to update personalization" });
  }
};

/**
 * Reset personalization (remove inferred patterns, keep explicit user preferences)
 */
export const resetPersonalization = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const { resetType = "inferred" } = req.body; // "inferred" | "all" | "communication" | "behavioral"

    const personalization = await Personalization.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!personalization) {
      res.status(404).json({ success: false, error: "Personalization not found" });
      return;
    }

    if (resetType === "all") {
      // Reset everything except user overrides
      personalization.behavioralTendencies = [];
      personalization.adaptationRules = personalization.adaptationRules.filter(
        (r: IAdaptationRule) => r.source === "user_explicit"
      );
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
    } else if (resetType === "inferred") {
      // Reset only inferred patterns, keep user overrides
      personalization.behavioralTendencies = [];
      personalization.adaptationRules = personalization.adaptationRules.filter(
        (r: IAdaptationRule) => r.source === "user_explicit"
      );
      personalization.communication.inferredStyle = undefined;
      personalization.communication.preferredTopics = personalization.communication.preferredTopics.filter(
        (t: string) => (personalization.userOverrides as any)?.preferredTopics?.includes(t)
      );
      personalization.communication.topicsToAvoid = personalization.communication.topicsToAvoid.filter(
        (t: string) => (personalization.userOverrides as any)?.topicsToAvoid?.includes(t)
      );
    } else if (resetType === "communication") {
      // Reset only communication preferences
      personalization.communication.inferredStyle = undefined;
      personalization.communication.verbosity = (personalization.userOverrides as any)?.verbosity || "moderate";
      (personalization.userOverrides as any).communicationStyle = undefined;
    } else if (resetType === "behavioral") {
      // Reset only behavioral patterns
      personalization.behavioralTendencies = [];
      personalization.adaptationRules = personalization.adaptationRules.filter(
        (r: IAdaptationRule) => r.source === "user_explicit"
      );
    }

    personalization.lastAnalysis = new Date();
    personalization.version = (personalization.version || 1) + 1;
    await personalization.save();

    logger.info(`Reset personalization for user ${userId} (type: ${resetType})`);

    res.json({
      success: true,
      message: `Personalization reset (${resetType})`,
      personalization: {
        version: personalization.version,
        lastAnalysis: personalization.lastAnalysis,
      },
    });
  } catch (error) {
    logger.error("Error resetting personalization:", error);
    res.status(500).json({ success: false, error: "Failed to reset personalization" });
  }
};

/**
 * Get explainability info (what personalization is being applied and why)
 */
export const getExplainability = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const personalization = await Personalization.findOne({
      userId: new Types.ObjectId(userId),
    }).lean() as (Omit<IPersonalization, keyof Document> & { _id: any }) | null;

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
          value: (personalization.userOverrides as any)?.communicationStyle || personalization.communication?.style || "gentle",
          source: (personalization.userOverrides as any)?.communicationStyle ? "user_explicit" : "system_default",
          inferred: personalization.communication?.inferredStyle,
        },
        verbosity: {
          value: (personalization.userOverrides as any)?.verbosity || personalization.communication?.verbosity || "moderate",
          source: (personalization.userOverrides as any)?.verbosity ? "user_explicit" : "system_default",
        },
      },
      behavioralTendencies: (personalization.behavioralTendencies || [])
        .filter((t: any) => t.confidence > 0.5)
        .slice(0, 10)
        .map((t: any) => ({
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
  } catch (error) {
    logger.error("Error fetching explainability:", error);
    res.status(500).json({ success: false, error: "Failed to fetch explainability" });
  }
};

/**
 * Trigger manual personalization analysis (admin or user-initiated)
 */
export const triggerAnalysis = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    // Run analysis asynchronously (don't wait for completion)
    analyzeUserPersonalization(userId).catch((error) => {
      logger.error(`Error in manual analysis for user ${userId}:`, error);
    });

    res.json({
      success: true,
      message: "Personalization analysis triggered. Results will be available shortly.",
    });
  } catch (error) {
    logger.error("Error triggering analysis:", error);
    res.status(500).json({ success: false, error: "Failed to trigger analysis" });
  }
};

/**
 * Get conversation summaries for user
 */
export const getConversationSummaries = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id?.toString();
    if (!userId) {
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }

    const { type, limit = 10 } = req.query;

    const query: any = {
      userId: new Types.ObjectId(userId),
    };

    if (type && ["weekly", "monthly", "session", "topic"].includes(type as string)) {
      query.summaryType = type;
    }

    const summaries = await ConversationSummary.find(query)
      .sort({ periodEnd: -1 })
      .limit(parseInt(limit as string))
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
  } catch (error) {
    logger.error("Error fetching conversation summaries:", error);
    res.status(500).json({ success: false, error: "Failed to fetch summaries" });
  }
};

