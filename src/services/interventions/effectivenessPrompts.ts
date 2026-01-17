import { Types } from 'mongoose';
import { InterventionProgress } from '../../models/InterventionProgress';
import { Notification } from '../../models/Notification';
import { createNotification } from '../../controllers/notificationController';
import { logger } from '../../utils/logger';

/**
 * Effectiveness Prompts Service
 * Automatically prompts users to rate intervention effectiveness
 */

/**
 * Check if user should be prompted for effectiveness rating
 */
export async function shouldPromptForEffectiveness(
  userId: Types.ObjectId,
  interventionId: string
): Promise<{ shouldPrompt: boolean; reason?: string }> {
  try {
    const progress = await InterventionProgress.findOne({
      userId,
      interventionId,
      status: 'completed',
    })
      .sort({ completedAt: -1 })
      .lean() as any;

    if (!progress || Array.isArray(progress)) {
      return { shouldPrompt: false, reason: 'Intervention not completed' };
    }

    // If already rated, don't prompt again (unless we want to prompt for long-term effectiveness)
    if (progress.progress?.effectivenessRating && progress.progress.effectivenessRating > 0) {
      return { shouldPrompt: false, reason: 'Already rated' };
    }

    // Prompt if completed within last 7 days and not rated
    const completedAt = progress.completedAt;
    if (completedAt) {
      const daysSinceCompletion = Math.floor(
        (Date.now() - new Date(completedAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceCompletion <= 7) {
        return { 
          shouldPrompt: true, 
          reason: `Completed ${daysSinceCompletion} day(s) ago, not yet rated` 
        };
      }
    }

    return { shouldPrompt: false, reason: 'Completed more than 7 days ago' };
  } catch (error: any) {
    logger.error(`Failed to check effectiveness prompt eligibility:`, error);
    return { shouldPrompt: false, reason: 'Error checking eligibility' };
  }
}

/**
 * Send effectiveness rating prompt notification
 * Automatically triggered by reminder job for completed interventions
 */
export async function promptForEffectivenessRating(
  userId: Types.ObjectId,
  interventionId: string,
  interventionName: string
): Promise<boolean> {
  try {
    // Check if we should prompt
    const { shouldPrompt } = await shouldPromptForEffectiveness(userId, interventionId);
    if (!shouldPrompt) {
      logger.debug(`Skipping effectiveness prompt for user ${userId}, intervention ${interventionId}: Not eligible`);
      return false;
    }

    // Check if we already sent a prompt today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingPrompt = await Notification.findOne({
      userId,
      type: 'billing', // Using billing type for system notifications
      'metadata.interventionId': interventionId,
      'metadata.promptType': 'effectiveness',
      createdAt: { $gte: today },
    }).lean();

    if (existingPrompt) {
      logger.debug(`Effectiveness prompt already sent today for user ${userId}, intervention ${interventionId}`);
      return false;
    }

    // Get outcome measurement to include in prompt if available
    const { measureInterventionOutcome } = require('./outcomeMeasurement');
    const outcome = await measureInterventionOutcome(userId, interventionId);
    
    let message = `How effective was "${interventionName}" for you? Rate it 1-10 to help us personalize your future interventions.`;
    
    // If outcome data available, add it to make prompt more compelling
    if (outcome && outcome.moodBefore !== null && outcome.moodAfter !== null && outcome.moodImprovement && outcome.moodImprovement > 0) {
      message = `Great progress! Your mood improved from ${outcome.moodBefore.toFixed(1)}/10 to ${outcome.moodAfter.toFixed(1)}/10 after "${interventionName}". How effective was it for you? Rate it 1-10.`;
    }

    // Create notification prompt
    await createNotification({
      userId,
      actorId: userId, // System notification
      type: 'billing', // Using billing type for system notifications
      metadata: {
        message,
        promptType: 'effectiveness',
        interventionId,
        interventionName,
        daysSinceCompletion: 1, // Will be calculated
        ...(outcome ? {
          moodBefore: outcome.moodBefore,
          moodAfter: outcome.moodAfter,
          moodImprovement: outcome.moodImprovement,
        } : {}),
      },
    });

    logger.info(`Effectiveness prompt sent to user ${userId} for intervention: ${interventionName}${outcome && outcome.moodImprovement ? ` (mood improved ${outcome.moodImprovement.toFixed(1)} points)` : ''}`);
    return true;
  } catch (error: any) {
    logger.error(`Failed to send effectiveness prompt:`, error);
    return false;
  }
}

/**
 * Process effectiveness rating from user
 */
export async function processEffectivenessRating(
  userId: Types.ObjectId,
  interventionId: string,
  rating: number // 1-10
): Promise<{ success: boolean; message?: string }> {
  try {
    if (rating < 1 || rating > 10) {
      return { success: false, message: 'Rating must be between 1 and 10' };
    }

    const progress = await InterventionProgress.findOne({
      userId,
      interventionId,
      status: 'completed',
    })
      .sort({ completedAt: -1 });

    if (!progress) {
      return { success: false, message: 'Intervention not found or not completed' };
    }

    // Update effectiveness rating
    progress.progress.effectivenessRating = rating;

    // Update average effectiveness
    const completions = progress.personalization.completions || 0;
    const currentAvg = progress.personalization.averageEffectiveness || 0;
    const newAvg = completions > 0 
      ? ((currentAvg * completions) + rating) / (completions + 1)
      : rating;
    progress.personalization.averageEffectiveness = newAvg;
    progress.personalization.completions = (completions || 0) + 1;

    await progress.save();

    logger.info(`Effectiveness rating recorded: ${rating}/10 for user ${userId}, intervention ${progress.interventionName}`);

    return { 
      success: true, 
      message: `Thank you for your feedback! Your rating helps us personalize future interventions.` 
    };
  } catch (error: any) {
    logger.error(`Failed to process effectiveness rating:`, error);
    return { success: false, message: 'Failed to save rating' };
  }
}
