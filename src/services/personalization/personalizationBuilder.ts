import { Types } from "mongoose";
import { Personalization, IPersonalization } from "../../models/Personalization";
import { ConversationSummary } from "../../models/ConversationSummary";
import { logger } from "../../utils/logger";
import { getRecentSummaries } from "./conversationSummarization";

/**
 * Personalization Builder Service
 * Builds personalization context and enforcement rules for AI requests
 * Ensures personalization is structured, enforceable, and reversible
 */

export interface PersonalizationContext {
  profile: {
    intent: {
      primaryGoals: string[];
      currentFocus: string[];
      priorities: { [key: string]: number };
    };
    communication: {
      style: "gentle" | "direct" | "supportive";
      verbosity: "concise" | "moderate" | "detailed";
      responseFormat: "conversational" | "structured" | "mixed";
      emojiUsage: "none" | "minimal" | "moderate" | "frequent";
      topicsToAvoid: string[];
      preferredTopics: string[];
    };
  };
  behavioralTendencies: Array<{
    pattern: string;
    confidence: number;
  }>;
  timePatterns: {
    preferredHours?: number[];
    preferredDays?: number[];
  };
  adaptationRules: Array<{
    ruleType: string;
    condition: string;
    action: string;
    priority: number;
    source: string;
  }>;
  summaries: Array<{
    period: string;
    summary: string;
    keyTopics: string[];
  }>;
  explainability: {
    activeRules: string[];
    inferredPatterns: string[];
  };
  version: number;
  dataQuality: number;
}

/**
 * Build personalization context for AI request
 */
export async function buildPersonalizationContext(
  userId: string,
  includeSummaries: boolean = true
): Promise<PersonalizationContext | null> {
  try {
    const personalization = await Personalization.findOne({
      userId: new Types.ObjectId(userId),
      personalizationEnabled: true, // Only include if enabled
    }).lean();

    if (!personalization) {
      logger.debug(`No personalization found for user ${userId}, using defaults`);
      return null;
    }

    // Apply decay logic to outdated preferences
    const decayedPersonalization = applyDecay(personalization);

    // Build context
    const context: PersonalizationContext = {
      profile: {
        intent: {
          primaryGoals: decayedPersonalization.intent?.primaryGoals || [],
          currentFocus: decayedPersonalization.intent?.currentFocus || [],
          priorities: decayedPersonalization.intent?.priorities || {},
        },
        communication: {
          // User overrides take priority
          style: decayedPersonalization.userOverrides?.communicationStyle || 
                 decayedPersonalization.communication?.style || 
                 "gentle",
          verbosity: decayedPersonalization.userOverrides?.verbosity || 
                    decayedPersonalization.communication?.verbosity || 
                    "moderate",
          responseFormat: decayedPersonalization.communication?.responseFormat || "conversational",
          emojiUsage: decayedPersonalization.communication?.emojiUsage || "minimal",
          topicsToAvoid: [
            ...(decayedPersonalization.userOverrides?.topicsToAvoid || []),
            ...(decayedPersonalization.communication?.topicsToAvoid || []),
          ],
          preferredTopics: [
            ...(decayedPersonalization.userOverrides?.preferredTopics || []),
            ...(decayedPersonalization.communication?.preferredTopics || []),
          ],
        },
      },
      behavioralTendencies: (decayedPersonalization.behavioralTendencies || [])
        .filter((t: any) => t.confidence > 0.5) // Only include confident patterns
        .slice(0, 10) // Top 10
        .map((t: any) => ({
          pattern: t.pattern,
          confidence: t.confidence,
        })),
      timePatterns: {
        preferredHours: decayedPersonalization.timePatterns?.hourOfDay || [],
        preferredDays: decayedPersonalization.timePatterns?.dayOfWeek || [],
      },
      adaptationRules: (decayedPersonalization.adaptationRules || [])
        .filter((r: any) => r.confidence > 0.4) // Filter low-confidence rules
        .sort((a: any, b: any) => b.priority - a.priority) // Sort by priority
        .slice(0, 20) // Top 20 rules
        .map((r: any) => ({
          ruleType: r.ruleType,
          condition: r.condition,
          action: r.action,
          priority: r.priority,
          source: r.source,
        })),
      summaries: [],
      explainability: {
        activeRules: decayedPersonalization.explainability?.activeRules || [],
        inferredPatterns: decayedPersonalization.explainability?.inferredPatterns || [],
      },
      version: decayedPersonalization.version || 1,
      dataQuality: decayedPersonalization.dataQuality || 0.3,
    };

    // Include recent summaries if requested
    if (includeSummaries) {
      const summaries = await getRecentSummaries(userId, 4); // Last 4 summaries
      context.summaries = summaries.map(s => ({
        period: `${s.summaryType} (${new Date(s.periodStart).toLocaleDateString()} - ${new Date(s.periodEnd).toLocaleDateString()})`,
        summary: s.summary || "",
        keyTopics: s.keyTopics || [],
      }));
    }

    return context;
  } catch (error) {
    logger.error(`Error building personalization context for user ${userId}:`, error);
    return null;
  }
}

/**
 * Apply decay logic to outdated preferences
 * Reduces confidence and eventually removes old patterns
 */
function applyDecay(personalization: any): any {
  const now = Date.now();
  const lastAnalysis = personalization.lastAnalysis ? new Date(personalization.lastAnalysis).getTime() : now;
  const weeksSinceAnalysis = (now - lastAnalysis) / (1000 * 60 * 60 * 24 * 7);
  const decayRate = personalization.decayRate || 0.05; // 5% per week default

  // Calculate decay factor (confidence reduces over time)
  const decayFactor = Math.max(0, 1 - (weeksSinceAnalysis * decayRate));

  // Apply decay to behavioral tendencies
  if (personalization.behavioralTendencies && Array.isArray(personalization.behavioralTendencies)) {
    personalization.behavioralTendencies = personalization.behavioralTendencies
      .map((tendency: any) => {
        const lastObserved = tendency.lastObserved ? new Date(tendency.lastObserved).getTime() : now;
        const weeksSinceObserved = (now - lastObserved) / (1000 * 60 * 60 * 24 * 7);
        const tendencyDecay = Math.max(0, 1 - (weeksSinceObserved * decayRate));
        
        return {
          ...tendency,
          confidence: tendency.confidence * tendencyDecay,
          frequency: tendency.frequency * tendencyDecay,
        };
      })
      .filter((tendency: any) => tendency.confidence > 0.2) // Remove very low-confidence patterns
      .sort((a: any, b: any) => b.confidence - a.confidence);
  }

  // Apply decay to adaptation rules
  if (personalization.adaptationRules && Array.isArray(personalization.adaptationRules)) {
    personalization.adaptationRules = personalization.adaptationRules
      .map((rule: any) => {
        const lastApplied = rule.lastApplied ? new Date(rule.lastApplied).getTime() : now;
        const weeksSinceApplied = (now - lastApplied) / (1000 * 60 * 60 * 24 * 7);
        const ruleDecay = Math.max(0, 1 - (weeksSinceApplied * decayRate));
        
        return {
          ...rule,
          confidence: rule.confidence * ruleDecay,
          effectiveness: rule.effectiveness * ruleDecay,
        };
      })
      .filter((rule: any) => rule.confidence > 0.3) // Remove low-confidence rules
      .sort((a: any, b: any) => b.priority - a.priority);
  }

  // Update data quality based on recency
  personalization.dataQuality = personalization.dataQuality * decayFactor;

  return personalization;
}

/**
 * Build enforcement rules as system instructions
 * These are mandatory rules that the AI must follow
 */
export function buildEnforcementRules(context: PersonalizationContext | null): string {
  if (!context) {
    return ""; // No personalization, use defaults
  }

  let rules = "\n**=== MANDATORY PERSONALIZATION RULES (ENFORCE STRICTLY) ===**\n\n";

  // Communication style enforcement
  const style = context.profile.communication.style;
  rules += `**Communication Style:** You MUST communicate in a ${style} style. `;
  if (style === "gentle") {
    rules += "Use soft, empathetic language. Be patient and understanding. Ask gentle questions.\n";
  } else if (style === "direct") {
    rules += "Be straightforward and concise. Get to the point. Use clear, direct statements.\n";
  } else if (style === "supportive") {
    rules += "Be encouraging and warm. Validate feelings. Provide emotional support.\n";
  }

  // Verbosity enforcement
  const verbosity = context.profile.communication.verbosity;
  rules += `**Response Length:** You MUST keep responses ${verbosity}. `;
  if (verbosity === "concise") {
    rules += "Limit to 2-3 sentences unless user explicitly asks for more detail.\n";
  } else if (verbosity === "detailed") {
    rules += "Provide comprehensive explanations with examples when helpful.\n";
  } else {
    rules += "Provide balanced, moderate-length responses (4-6 sentences typically).\n";
  }

  // Response format
  const format = context.profile.communication.responseFormat;
  if (format === "structured") {
    rules += "**Format:** Structure responses with clear sections or bullet points when appropriate.\n";
  } else if (format === "conversational") {
    rules += "**Format:** Keep responses natural and conversational, avoiding rigid structures.\n";
  }

  // Emoji usage
  const emojiUsage = context.profile.communication.emojiUsage;
  if (emojiUsage === "none") {
    rules += "**Emojis:** Do NOT use emojis or emoticons in responses.\n";
  } else if (emojiUsage === "minimal") {
    rules += "**Emojis:** Use emojis very sparingly, only when they add meaningful emphasis.\n";
  } else if (emojiUsage === "frequent") {
    rules += "**Emojis:** Feel free to use emojis to add warmth and expressiveness.\n";
  }

  // Topic preferences
  if (context.profile.communication.topicsToAvoid.length > 0) {
    rules += `**Topics to Avoid:** Do NOT bring up or focus on: ${context.profile.communication.topicsToAvoid.join(", ")}\n`;
  }
  if (context.profile.communication.preferredTopics.length > 0) {
    rules += `**Preferred Topics:** When relevant, focus on: ${context.profile.communication.preferredTopics.join(", ")}\n`;
  }

  // User intent
  if (context.profile.intent.primaryGoals.length > 0) {
    rules += `**Long-term Goals:** Keep these goals in mind: ${context.profile.intent.primaryGoals.join(", ")}\n`;
  }
  if (context.profile.intent.currentFocus.length > 0) {
    rules += `**Current Focus:** Current priorities: ${context.profile.intent.currentFocus.join(", ")}\n`;
  }

  // Behavioral tendencies (patterns observed)
  if (context.behavioralTendencies.length > 0) {
    rules += `**Observed Patterns:** User typically: ${context.behavioralTendencies.slice(0, 3).map(t => t.pattern).join(", ")}\n`;
  }

  // Adaptation rules (high-priority rules)
  const highPriorityRules = context.adaptationRules.filter(r => r.priority > 0.7);
  if (highPriorityRules.length > 0) {
    rules += "\n**High-Priority Adaptation Rules:**\n";
    highPriorityRules.slice(0, 5).forEach((rule, idx) => {
      rules += `${idx + 1}. IF ${rule.condition} THEN ${rule.action}\n`;
    });
  }

  rules += "\n**=== END PERSONALIZATION RULES ===**\n\n";

  // Add context about data quality
  if (context.dataQuality < 0.5) {
    rules += "**Note:** Personalization data quality is moderate - prefer general approaches until more patterns emerge.\n\n";
  }

  return rules;
}

/**
 * Build user profile summary for context injection
 */
export function buildUserProfileSummary(context: PersonalizationContext | null): string {
  if (!context) {
    return "";
  }

  let summary = "\n**=== USER PROFILE SUMMARY (for context) ===**\n\n";

  // Intent summary
  if (context.profile.intent.primaryGoals.length > 0 || context.profile.intent.currentFocus.length > 0) {
    summary += "**User Intent & Goals:**\n";
    if (context.profile.intent.primaryGoals.length > 0) {
      summary += `- Long-term goals: ${context.profile.intent.primaryGoals.join(", ")}\n`;
    }
    if (context.profile.intent.currentFocus.length > 0) {
      summary += `- Current focus: ${context.profile.intent.currentFocus.join(", ")}\n`;
    }
    summary += "\n";
  }

  // Communication preferences
  summary += "**Communication Preferences:**\n";
  summary += `- Style: ${context.profile.communication.style}\n`;
  summary += `- Verbosity: ${context.profile.communication.verbosity}\n`;
  summary += `- Format: ${context.profile.communication.responseFormat}\n`;
  summary += `- Emoji usage: ${context.profile.communication.emojiUsage}\n`;
  if (context.profile.communication.preferredTopics.length > 0) {
    summary += `- Preferred topics: ${context.profile.communication.preferredTopics.slice(0, 5).join(", ")}\n`;
  }
  summary += "\n";

  // Behavioral patterns (only high-confidence)
  const confidentPatterns = context.behavioralTendencies.filter(t => t.confidence > 0.7);
  if (confidentPatterns.length > 0) {
    summary += "**Observed Behavioral Patterns (High Confidence):**\n";
    confidentPatterns.slice(0, 5).forEach((tendency, idx) => {
      summary += `${idx + 1}. ${tendency.pattern} (confidence: ${(tendency.confidence * 100).toFixed(0)}%)\n`;
    });
    summary += "\n";
  }

  // Recent summaries
  if (context.summaries.length > 0) {
    summary += "**Recent Conversation Summaries:**\n";
    context.summaries.slice(0, 2).forEach((s, idx) => {
      summary += `${idx + 1}. ${s.period}: ${s.summary.substring(0, 150)}${s.summary.length > 150 ? "..." : ""}\n`;
      if (s.keyTopics.length > 0) {
        summary += `   Topics: ${s.keyTopics.slice(0, 3).join(", ")}\n`;
      }
    });
    summary += "\n";
  }

  summary += "**=== END PROFILE SUMMARY ===**\n\n";

  return summary;
}

/**
 * Track engagement signal (call after AI response)
 */
export async function trackEngagementSignal(
  userId: string,
  signal: {
    sessionLength: number; // Minutes
    messagesCount: number;
    responseReceived: boolean;
    userFeedback?: "positive" | "negative" | "neutral";
  }
): Promise<void> {
  try {
    const personalization = await Personalization.findOne({
      userId: new Types.ObjectId(userId),
    });

    if (!personalization) {
      return; // No personalization to update
    }

    // Update engagement metrics
    const currentAvgLength = personalization.engagement.averageSessionLength || 0;
    const currentAvgMessages = personalization.engagement.messagesPerSession || 0;
    const sessionCount = personalization.engagement.sessionFrequency || 0;

    // Exponential moving average for engagement metrics
    const alpha = 0.3; // Smoothing factor
    personalization.engagement.averageSessionLength = 
      alpha * signal.sessionLength + (1 - alpha) * currentAvgLength;
    personalization.engagement.messagesPerSession = 
      alpha * signal.messagesCount + (1 - alpha) * currentAvgMessages;
    personalization.engagement.lastEngagement = new Date();

    // Calculate engagement trend
    const avgMessages = personalization.engagement.messagesPerSession;
    const previousAvg = currentAvgMessages;
    if (avgMessages > previousAvg * 1.1) {
      personalization.engagement.engagementTrend = "increasing";
    } else if (avgMessages < previousAvg * 0.9) {
      personalization.engagement.engagementTrend = "decreasing";
    } else {
      personalization.engagement.engagementTrend = "stable";
    }

    // Update response quality based on feedback
    if (signal.userFeedback) {
      const qualityScore = signal.userFeedback === "positive" ? 0.8 : 
                          signal.userFeedback === "negative" ? 0.2 : 0.5;
      personalization.engagement.responseQuality = 
        alpha * qualityScore + (1 - alpha) * (personalization.engagement.responseQuality || 0.5);
    }

    // Increment session frequency (weekly calculation can be done in a separate job)
    personalization.engagement.sessionFrequency = sessionCount + 1;

    await personalization.save();
    logger.debug(`Updated engagement metrics for user ${userId}`);
  } catch (error) {
    logger.error(`Error tracking engagement signal for user ${userId}:`, error);
    // Don't throw - engagement tracking is non-critical
  }
}

