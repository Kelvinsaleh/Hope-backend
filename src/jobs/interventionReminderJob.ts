import { Types } from 'mongoose';
import { InterventionProgress } from '../models/InterventionProgress';
import { Notification } from '../models/Notification';
import { createNotification } from '../controllers/notificationController';
import { promptForEffectivenessRating } from '../services/interventions/effectivenessPrompts';
import { logger } from '../utils/logger';

/**
 * Intervention Reminder Job
 * Sends reminders to users to continue active interventions
 */

const REMINDER_INTERVALS = {
  // Remind after 2 days of inactivity
  inactiveDays: 2,
  // Remind weekly for long-term interventions
  weeklyCheckIn: 7,
};

/**
 * Check and send intervention reminders
 * Also checks for completed interventions that need effectiveness prompts
 */
export async function checkAndSendInterventionReminders(): Promise<void> {
  try {
    logger.info('Starting intervention reminder check...');
    
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - REMINDER_INTERVALS.inactiveDays);
    
    // PART 1: Send reminders for inactive active interventions
    const activeInterventions = await InterventionProgress.find({
      status: 'active',
      lastActiveAt: { $lt: twoDaysAgo },
    })
      .sort({ lastActiveAt: 1 })
      .limit(100)
      .lean();

    let remindersSent = 0;
    let remindersSkipped = 0;

    for (const intervention of activeInterventions) {
      try {
        const userId = new Types.ObjectId(intervention.userId);
        const daysSinceLastActive = Math.floor(
          (now.getTime() - new Date(intervention.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Check if we already sent a reminder today
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        const existingReminder = await Notification.findOne({
          userId,
          type: 'billing' as any, // System notification
          'metadata.interventionId': intervention.interventionId,
          'metadata.promptType': 'reminder',
          createdAt: { $gte: todayStart },
        }).lean();

        if (existingReminder) {
          remindersSkipped++;
          continue;
        }

        // Calculate progress percentage
        const progressPercent = intervention.progress.totalSteps > 0
          ? Math.round((intervention.progress.currentStep / intervention.progress.totalSteps) * 100)
          : 0;

        // Create reminder message based on progress
        let reminderMessage = '';
        if (progressPercent === 0) {
          reminderMessage = `You started "${intervention.interventionName}" ${daysSinceLastActive} days ago. Ready to begin step 1?`;
        } else if (progressPercent < 50) {
          reminderMessage = `You're on step ${intervention.progress.currentStep} of ${intervention.progress.totalSteps} for "${intervention.interventionName}". Ready to continue?`;
        } else {
          reminderMessage = `You're ${progressPercent}% through "${intervention.interventionName}"! Keep going - you're doing great!`;
        }

        // Send reminder
        await createNotification({
          userId,
          actorId: userId, // System notification
          type: 'billing', // System notification type
          metadata: {
            message: reminderMessage,
            promptType: 'reminder',
            interventionId: intervention.interventionId,
            interventionName: intervention.interventionName,
            daysSinceLastActive,
            currentStep: intervention.progress.currentStep,
            totalSteps: intervention.progress.totalSteps,
            progressPercent,
          },
        });

        remindersSent++;
        logger.debug(`Intervention reminder sent to user ${userId}: ${intervention.interventionName} (${daysSinceLastActive} days inactive)`);
      } catch (userError: any) {
        logger.warn(`Error processing intervention reminder for user ${intervention.userId}:`, userError.message);
      }
    }

    // PART 2: Send effectiveness prompts for completed interventions (not yet rated, completed 1+ days ago)
    const oneDayAgo = new Date(now);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const completedInterventions = await InterventionProgress.find({
      status: 'completed',
      completedAt: { $gte: sevenDaysAgo, $lt: oneDayAgo }, // Completed 1-7 days ago
      'progress.effectivenessRating': { $exists: false }, // Not yet rated
    })
      .sort({ completedAt: -1 })
      .limit(100)
      .lean();

    let effectivenessPromptsSent = 0;
    for (const intervention of completedInterventions) {
      try {
        const userId = new Types.ObjectId(intervention.userId);
        const sent = await promptForEffectivenessRating(
          userId,
          intervention.interventionId,
          intervention.interventionName
        );
        if (sent) {
          effectivenessPromptsSent++;
        }
      } catch (error: any) {
        logger.warn(`Error sending effectiveness prompt for intervention ${intervention.interventionId}:`, error.message);
      }
    }

    logger.info(`Intervention reminder check completed: ${remindersSent} reminders sent, ${remindersSkipped} skipped (already sent today), ${effectivenessPromptsSent} effectiveness prompts sent`);
  } catch (error: any) {
    logger.error('Error in intervention reminder check:', error);
    throw error;
  }
}

/**
 * Start intervention reminder job (runs daily)
 */
export function startInterventionReminderJob(): void {
  const intervalHours = 24;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  // Run initial check
  checkAndSendInterventionReminders().catch((err) => {
    logger.error('Initial intervention reminder check failed:', err);
  });

  // Schedule daily checks
  setInterval(() => {
    checkAndSendInterventionReminders().catch((err) => {
      logger.error('Scheduled intervention reminder check failed:', err);
    });
  }, intervalMs);

  logger.info(`Intervention reminder job scheduled to run every ${intervalHours} hours (daily)`);
}
