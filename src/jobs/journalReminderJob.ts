import { Types } from "mongoose";
import { JournalEntry } from "../models/JournalEntry";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { logger } from "../utils/logger";
import { createNotification } from "../controllers/notificationController";

const JOURNAL_REMINDER_DAYS = 3; // Remind users who haven't journaled in 3 days

/**
 * Check for users who haven't journaled in 3+ days and send reminder notifications
 * This should be run daily (e.g., via Inngest cron or scheduled job)
 */
export async function checkAndSendJournalReminders(): Promise<void> {
  try {
    logger.info("Starting journal reminder check...");
    
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - JOURNAL_REMINDER_DAYS);
    threeDaysAgo.setHours(0, 0, 0, 0); // Start of day 3 days ago

    // Get all active users
    const activeUsers = await User.find({}).lean().limit(1000); // Limit to avoid memory issues
    
    let remindersSent = 0;
    let remindersSkipped = 0;

    for (const user of activeUsers) {
      try {
        const userId = new Types.ObjectId(user._id?.toString() || user._id);
        
        // Check user's last journal entry
        const lastJournalEntry = await JournalEntry.findOne({ userId })
          .sort({ createdAt: -1 })
          .select('createdAt')
          .lean();

        // If user has never journaled, skip (they may not be ready yet)
        if (!lastJournalEntry) {
          continue;
        }

        const lastJournalDate = new Date(lastJournalEntry.createdAt);
        lastJournalDate.setHours(0, 0, 0, 0);

        // Check if last journal was 3+ days ago
        if (lastJournalDate <= threeDaysAgo) {
          // Check if we've already sent a reminder today (avoid spam)
          const todayStart = new Date(now);
          todayStart.setHours(0, 0, 0, 0);
          
          const existingReminder = await Notification.findOne({
            userId,
            type: 'journal_reminder' as any, // We'll need to add this type
            createdAt: { $gte: todayStart },
          }).lean();

          if (!existingReminder) {
            // Calculate days since last journal
            const daysSinceLastJournal = Math.floor(
              (now.getTime() - lastJournalDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            // Send notification
            await createNotification({
              userId,
              actorId: userId, // System notification
              type: 'billing', // Using billing type for system notifications (handled specially in notificationController)
              metadata: {
                message: `It's been ${daysSinceLastJournal} days since your last journal entry. How has your day been? Take a moment to reflect.`,
                reminderType: 'journal',
                daysSince: daysSinceLastJournal,
              },
            });

            remindersSent++;
            logger.debug(`Sent journal reminder to user ${userId} (${daysSinceLastJournal} days since last journal)`);
          } else {
            remindersSkipped++;
          }
        }
      } catch (userError: any) {
        logger.warn(`Error processing journal reminder for user ${user._id}:`, userError.message);
        // Continue with next user
      }
    }

    logger.info(`Journal reminder check completed: ${remindersSent} reminders sent, ${remindersSkipped} skipped (already sent today)`);
  } catch (error: any) {
    logger.error('Error in journal reminder check:', error);
    throw error;
  }
}

/**
 * Schedule this job to run daily (e.g., via Inngest cron or setInterval)
 */
export function startJournalReminderJob(): void {
  const intervalHours = 24; // Run daily
  const intervalMs = intervalHours * 60 * 60 * 1000;

  // Run immediately on start (for testing), then schedule
  checkAndSendJournalReminders().catch((err) => {
    logger.error('Initial journal reminder check failed:', err);
  });

  // Schedule daily checks
  setInterval(() => {
    checkAndSendJournalReminders().catch((err) => {
      logger.error('Scheduled journal reminder check failed:', err);
    });
  }, intervalMs);

  logger.info(`Journal reminder job scheduled to run every ${intervalHours} hours (daily)`);
}
