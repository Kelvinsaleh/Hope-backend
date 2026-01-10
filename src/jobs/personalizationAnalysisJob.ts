import { Types, Document } from "mongoose";
import { Personalization, IPersonalization } from "../models/Personalization";
import { ChatSession } from "../models/ChatSession";
import { ConversationSummary } from "../models/ConversationSummary";
import { logger } from "../utils/logger";
import { analyzeUserPatterns, analyzeTimePatterns, updatePersonalizationFromPatterns } from "../services/personalization/patternAnalysis";
import { generatePeriodSummary } from "../services/personalization/conversationSummarization";

/**
 * Personalization Analysis Job
 * Runs periodically to extract patterns from user interactions
 * Updates personalization data only when patterns are consistent
 * 
 * Run frequency: Daily (or configurable via environment)
 */

const ANALYSIS_INTERVAL_DAYS = parseInt(process.env.PERSONALIZATION_ANALYSIS_INTERVAL_DAYS || "7"); // Default: weekly
const MIN_DAYS_SINCE_ANALYSIS = parseInt(process.env.MIN_DAYS_SINCE_ANALYSIS || "3"); // Minimum days between analyses

/**
 * Analyze personalization for a single user
 */
export async function analyzeUserPersonalization(userId: string): Promise<void> {
  try {
    const personalization = await Personalization.findOne({
      userId: new Types.ObjectId(userId),
    }).lean() as (Omit<IPersonalization, keyof Document> & { _id: any }) | null;

    // Check if analysis is needed
    const now = new Date();
    const lastAnalysis = personalization?.lastAnalysis ? new Date(personalization.lastAnalysis as Date) : null;
    
    if (lastAnalysis) {
      const daysSinceAnalysis = (now.getTime() - lastAnalysis.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAnalysis < MIN_DAYS_SINCE_ANALYSIS) {
        logger.debug(`Skipping analysis for user ${userId} - analyzed ${daysSinceAnalysis.toFixed(1)} days ago`);
        return;
      }
    }

    logger.info(`Analyzing personalization for user ${userId}...`);

    // Analyze patterns from recent interactions
    const patterns = await analyzeUserPatterns(userId, ANALYSIS_INTERVAL_DAYS);
    logger.debug(`Found ${patterns.length} patterns for user ${userId}`);

    // Analyze time-based patterns
    const timeAnalysis = await analyzeTimePatterns(userId, ANALYSIS_INTERVAL_DAYS);
    logger.debug(`Time patterns analyzed for user ${userId}`);

    // Update personalization only if patterns are confident
    if (patterns.length > 0 || timeAnalysis.preferredHours.length > 0) {
      await updatePersonalizationFromPatterns(userId, patterns, timeAnalysis);
      logger.info(`Updated personalization for user ${userId} with ${patterns.length} patterns`);
    } else {
      logger.debug(`No confident patterns found for user ${userId}, skipping update`);
    }

    // Generate weekly/monthly summaries if needed
    await generatePeriodicSummaries(userId);
  } catch (error) {
    logger.error(`Error analyzing personalization for user ${userId}:`, error);
    // Don't throw - individual user failures shouldn't stop the job
  }
}

/**
 * Generate weekly and monthly summaries for a user
 */
async function generatePeriodicSummaries(userId: string): Promise<void> {
  try {
    const now = new Date();
    
    // Generate weekly summary if last week's summary doesn't exist
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const existingWeekly = await ConversationSummary.findOne({
      userId: new Types.ObjectId(userId),
      summaryType: "weekly",
      periodStart: { $gte: weekStart, $lt: weekEnd },
    }).lean();

    if (!existingWeekly) {
      logger.info(`Generating weekly summary for user ${userId}...`);
      await generatePeriodSummary(userId, "weekly", weekStart, weekEnd);
    }

    // Generate monthly summary if last month's summary doesn't exist
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    monthEnd.setHours(0, 0, 0, 0);

    const existingMonthly = await ConversationSummary.findOne({
      userId: new Types.ObjectId(userId),
      summaryType: "monthly",
      periodStart: { $gte: monthStart, $lt: monthEnd },
    }).lean();

    if (!existingMonthly) {
      logger.info(`Generating monthly summary for user ${userId}...`);
      await generatePeriodSummary(userId, "monthly", monthStart, monthEnd);
    }
  } catch (error) {
    logger.error(`Error generating periodic summaries for user ${userId}:`, error);
    // Don't throw - summary generation is non-critical
  }
}

/**
 * Run personalization analysis for all active users
 */
export async function runPersonalizationAnalysisForAllUsers(): Promise<void> {
  try {
    logger.info("Starting personalization analysis job for all users...");

    // Get all users who have had recent activity (last 30 days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const activeUserIds = await ChatSession.distinct("userId", {
      startTime: { $gte: cutoffDate },
    });

    logger.info(`Found ${activeUserIds.length} active users to analyze`);

    // Process users in batches to avoid overwhelming the system
    const batchSize = 10;
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < activeUserIds.length; i += batchSize) {
      const batch = activeUserIds.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (userId) => {
          try {
            await analyzeUserPersonalization(userId.toString());
            processed++;
          } catch (error) {
            errors++;
            logger.error(`Error analyzing user ${userId}:`, error);
          }
        })
      );

      // Log progress
      if ((i + batchSize) % 50 === 0 || i + batchSize >= activeUserIds.length) {
        logger.info(`Progress: ${processed + errors}/${activeUserIds.length} users processed (${processed} success, ${errors} errors)`);
      }

      // Small delay between batches to avoid overwhelming the system
      if (i + batchSize < activeUserIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    }

    logger.info(`Personalization analysis job completed: ${processed} users analyzed successfully, ${errors} errors`);
  } catch (error) {
    logger.error("Error in personalization analysis job:", error);
    throw error;
  }
}

/**
 * Start the periodic personalization analysis job
 * Can be called from a scheduler (cron job, etc.)
 */
export function startPersonalizationAnalysisJob(): void {
  const intervalHours = parseInt(process.env.PERSONALIZATION_JOB_INTERVAL_HOURS || "24"); // Default: daily
  const intervalMs = intervalHours * 60 * 60 * 1000;

  logger.info(`Starting personalization analysis job with interval: ${intervalHours} hours`);

  // Run immediately on startup (optional)
  if (process.env.PERSONALIZATION_JOB_RUN_ON_STARTUP === "true") {
    runPersonalizationAnalysisForAllUsers().catch((error) => {
      logger.error("Error in initial personalization analysis job run:", error);
    });
  }

  // Schedule periodic runs
  setInterval(() => {
    runPersonalizationAnalysisForAllUsers().catch((error) => {
      logger.error("Error in scheduled personalization analysis job:", error);
    });
  }, intervalMs);

  logger.info(`Personalization analysis job scheduled to run every ${intervalHours} hours`);
}

