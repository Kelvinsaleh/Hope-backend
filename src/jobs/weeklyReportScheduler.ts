import { User } from '../models/User';
import { WeeklyReport } from '../models/WeeklyReport';
import { Types } from 'mongoose';
import { logger } from '../utils/logger';
import { generateAIWeeklyReport, generateFallbackWeeklyReport, gatherWeeklyData } from '../controllers/analyticsController';
import { backgroundQueue } from './backgroundQueue';

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

          let content = '';
          try {
            if (genAI) {
              content = await generateAIWeeklyReport(weeklyData, user.name || 'User', '');
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
            generatedAt: new Date().toISOString()
          };

          await WeeklyReport.create({ userId: user._id, content, metadata });
          logger.info(`Generated scheduled weekly report for user ${user._id}`);
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
