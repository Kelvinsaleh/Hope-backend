import { User } from '../models/User';
import { WeeklyReport } from '../models/WeeklyReport';
import { UserProfile } from '../models/UserProfile';
import { Types } from 'mongoose';
import { logger } from '../utils/logger';
import { generateAIWeeklyReport, generateFallbackWeeklyReport, gatherWeeklyData } from '../controllers/analyticsController';
import { backgroundQueue } from './backgroundQueue';
import { createNotification } from '../controllers/notificationController';

const genAI = Boolean(process.env.GEMINI_API_KEY);

// Generate reports for users who haven't had one in the last 7 days
export async function runWeeklyReportSchedulerOnce() {
  try {
    logger.info('Running weekly report scheduler (one-off)');
    const users = await User.find({}).lean();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const user of users) {
      // Enqueue a background job per user. The background worker will perform checks and generate/persist the report.
      backgroundQueue.push(async () => {
        try {
          const last = await WeeklyReport.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean();
          if (last && new Date(last.createdAt) > sevenDaysAgo) return; // already recent

          const endDate = new Date();
          const startDate = new Date();
          startDate.setDate(endDate.getDate() - 7);
          const weeklyData = await gatherWeeklyData(new Types.ObjectId(String(user._id)), startDate, endDate);
          if (!weeklyData.hasData) {
            logger.info(`Skipping weekly report for user ${user._id} - no data`);
            return;
          }

          // Load user profile for personalization
          let profileSummary = '';
          try {
            const profile = await UserProfile.findOne({ userId: user._id }).lean() as any;
            if (profile && !Array.isArray(profile)) {
              profileSummary = `bio: ${(profile.bio || '').toString().slice(0, 200)}; goals: ${(Array.isArray(profile.goals) ? profile.goals : []).slice(0, 5).join(', ')}; challenges: ${(Array.isArray(profile.challenges) ? profile.challenges : []).slice(0, 5).join(', ')}; communicationStyle: ${profile.communicationStyle || 'unknown'}`;
            }
          } catch (profileError: any) {
            logger.debug(`Could not load profile for weekly report: ${profileError.message}`);
          }

          let content = '';
          try {
            if (genAI) {
              content = await generateAIWeeklyReport(weeklyData, user.name || 'User', profileSummary);
            } else {
              content = generateFallbackWeeklyReport(weeklyData, user.name || 'User');
            }
          } catch (e) {
            logger.warn('AI weekly report generation failed during scheduled run, using fallback', e);
            content = generateFallbackWeeklyReport(weeklyData, user.name || 'User');
          }

          const metadata = {
            weekStart: startDate.toISOString(),
            weekEnd: endDate.toISOString(),
            generatedAt: new Date().toISOString(),
            dataPoints: {
              moodEntries: weeklyData.moodEntries?.length || 0,
              journalEntries: weeklyData.journalEntries?.length || 0,
              meditationSessions: weeklyData.meditationSessions?.length || 0,
              therapySessions: weeklyData.therapySessions?.length || 0,
              activeInterventions: weeklyData.activeInterventions?.length || 0,
            }
          };
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

          // Convert user._id to ObjectId for WeeklyReport.create
          const userIdObj = new Types.ObjectId(String(user._id));
          const savedReport = await WeeklyReport.create({ userId: userIdObj, content, metadata, expiresAt });
          logger.info(`Generated scheduled weekly report for user ${user._id}`);

          // Send notification that report is ready
          try {
            await createNotification({
              userId: userIdObj,
              actorId: userIdObj,
              type: 'billing', // Using billing type for system notifications
              metadata: {
                message: 'Your personalized weekly wellness report has been generated. Check your analytics to see insights about your patterns, progress, and what\'s working for you.',
                reportType: 'weekly',
                reportId: String(savedReport._id),
                weekStart: startDate.toISOString(),
                weekEnd: endDate.toISOString(),
              }
            });
          } catch (notifError: any) {
            logger.warn(`Failed to send notification for weekly report (user ${user._id}):`, notifError.message);
          }
        } catch (err) {
          logger.warn('Failed to generate scheduled weekly report for a user:', err);
        }
      });
    }
  } catch (error) {
    logger.error('Weekly report scheduler failed:', error);
  }
}

// Start a daily cron-like interval (runs every 24 hours)
// Calculate ms until next Saturday 00:00 local time
function msUntilNextSaturdayMidnight() {
  const now = new Date();
  const next = new Date(now);
  // get day of week (0 Sun .. 6 Sat). We want 6
  const day = now.getDay();
  const daysUntilSat = (6 - day + 7) % 7 || 7; // if today is Saturday, schedule next week
  next.setDate(now.getDate() + daysUntilSat);
  next.setHours(0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export function startWeeklyReportScheduler() {
  // Run once at startup
  runWeeklyReportSchedulerOnce().catch(e => logger.warn(e));

  // Schedule next Saturday midnight
  const scheduleNext = async () => {
    const ms = msUntilNextSaturdayMidnight();
    logger.info(`Weekly report scheduler next run in ${Math.round(ms / 1000 / 60)} minutes`);
    setTimeout(async () => {
      try {
        await runWeeklyReportSchedulerOnce();
      } catch (e) {
        logger.warn('Scheduled weekly report run failed:', e);
      }
      // Schedule again recursively
      scheduleNext();
    }, ms);
  };

  scheduleNext();
}
