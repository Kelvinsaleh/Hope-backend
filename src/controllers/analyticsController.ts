import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Types } from "mongoose";
import { JournalEntry } from "../models/JournalEntry";
import { Mood } from "../models/Mood";
import { MeditationSession } from "../models/Meditation";
import { ChatSession } from "../models/ChatSession";
import { User } from "../models/User";
import { UserProfile } from "../models/UserProfile";
import { WeeklyReport } from "../models/WeeklyReport";
import { InterventionProgress } from "../models/InterventionProgress";
import { analyzeUserPatterns } from "../services/patternAnalysis/patternAnalyzer";
import { getUserInterventionOutcomes, formatOutcomeMessage } from "../services/interventions/outcomeMeasurement";
import { createNotification } from "./notificationController";

// Initialize Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

export const getUserAnalytics = async (req: Request, res: Response) => {
  try {
    res.json({ 
      success: true, 
      analytics: {
        totalSessions: 0,
        averageMood: 0,
        totalActivities: 0,
        weeklyProgress: []
      }
    });
  } catch (error) {
    logger.error("Error fetching user analytics:", error);
    res.status(500).json({
      error: "Failed to fetch user analytics",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getMoodAnalytics = async (req: Request, res: Response) => {
  try {
    res.json({ 
      success: true, 
      moodAnalytics: {
        currentMood: 0,
        averageMood: 0,
        moodHistory: [],
        moodTrends: []
      }
    });
  } catch (error) {
    logger.error("Error fetching mood analytics:", error);
    res.status(500).json({
      error: "Failed to fetch mood analytics",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getActivityAnalytics = async (req: Request, res: Response) => {
  try {
    res.json({ 
      success: true, 
      activityAnalytics: {
        totalActivities: 0,
        completedActivities: 0,
        activityTypes: [],
        weeklyActivity: []
      }
    });
  } catch (error) {
    logger.error("Error fetching activity analytics:", error);
    res.status(500).json({
      error: "Failed to fetch activity analytics",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getPremiumAnalytics = async (req: Request, res: Response) => {
  try {
    res.json({ 
      success: true, 
      premiumAnalytics: {
        advancedMetrics: {},
        detailedInsights: [],
        personalizedRecommendations: [],
        progressPredictions: []
      }
    });
  } catch (error) {
    logger.error("Error fetching premium analytics:", error);
    res.status(500).json({
      error: "Failed to fetch premium analytics",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Fetch saved weekly reports for the authenticated user
export const getSavedWeeklyReports = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const reports = await WeeklyReport.find({ userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, reports });
  } catch (error) {
    logger.error('Error fetching saved weekly reports:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reports' });
  }
};

// Generate AI Weekly Report
export const generateWeeklyReport = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user._id);
    const { weekStart, weekEnd } = req.body;

    // Calculate date range for the week
    const startDate = weekStart ? new Date(weekStart) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const endDate = weekEnd ? new Date(weekEnd) : new Date();

    logger.info(`Generating weekly report for user ${userId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Gather weekly data
    const weeklyData = await gatherWeeklyData(userId, startDate, endDate);

    // Load user profile to personalize the report
    let userProfile: any = null;
    try {
      userProfile = await UserProfile.findOne({ userId }).lean();
    } catch (e) {
      logger.warn('Failed to load user profile for weekly report', e);
    }

    // Generate AI report
    let aiReport: string;
    let isFailover = false;

    // FIXED: Always attempt AI generation first, regardless of data availability.
    // This ensures the AI API is used directly, with fallback only on error.
    if (genAI) {
      try {
        // Build a concise profile summary to pass to the AI model for personalization
        const profileSummary = userProfile ? `bio: ${(userProfile.bio || '').toString().slice(0,200)}; goals: ${(userProfile.goals||[]).slice(0,5).join(', ')}; challenges: ${(userProfile.challenges||[]).slice(0,5).join(', ')}; communicationStyle: ${userProfile.communicationStyle || 'unknown'}` : '';
        aiReport = await generateAIWeeklyReport(weeklyData, user.name || 'User', profileSummary);
        logger.info("AI weekly report generated successfully");
      } catch (error) {
        logger.error("AI report generation failed:", error);
        aiReport = generateFallbackWeeklyReport(weeklyData, user.name || 'User');
        isFailover = true;
      }
    } else {
      logger.warn("GEMINI_API_KEY not configured - using fallback report generation");
      aiReport = generateFallbackWeeklyReport(weeklyData, user.name || 'User');
      isFailover = true;
    }

    // Calculate report metadata
    const reportMetadata = {
      weekStart: startDate.toISOString(),
      weekEnd: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
      dataPoints: {
        moodEntries: weeklyData.moodEntries.length,
        journalEntries: weeklyData.journalEntries.length,
        meditationSessions: weeklyData.meditationSessions.length,
        therapySessions: weeklyData.therapySessions.length
      },
      isFailover
    };

    // Persist the generated report for later retrieval
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const savedReport = await WeeklyReport.create({
        userId,
        content: aiReport,
        metadata: reportMetadata,
        expiresAt
      });

      // Send notification to user that report is ready
      try {
        await createNotification({
          userId,
          actorId: userId,
          type: 'billing', // Using billing type for system notifications
          title: 'Your Weekly Report is Ready! 📊',
          body: 'Your personalized weekly wellness report has been generated. Check your analytics to see insights about your patterns, progress, and what\'s working for you.',
          metadata: {
            reportId: savedReport._id.toString(),
            weekStart: startDate.toISOString(),
            weekEnd: endDate.toISOString(),
          }
        });
      } catch (notifError: any) {
        logger.warn('Failed to send notification for weekly report:', notifError.message);
      }
    } catch (e) {
      logger.warn('Failed to persist weekly report:', e);
    }

    res.json({
      success: true,
      report: {
        content: aiReport,
        metadata: reportMetadata,
        insights: {
          averageMood: weeklyData.averageMood,
          moodTrend: weeklyData.moodTrend,
          topEmotions: weeklyData.topEmotions,
          activityStreak: weeklyData.activityStreak,
          progressHighlights: weeklyData.progressHighlights
        }
      }
    });

  } catch (error) {
    logger.error("Error generating weekly report:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate weekly report",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Admin / dev helper: trigger a weekly report generation for a specific userId (useful for testing)
export const triggerWeeklyReportForUser = async (req: Request, res: Response) => {
  try {
    const adminKey = req.query.adminKey || req.body.adminKey;
    if (!process.env.ADMIN_TRIGGER_KEY || adminKey !== process.env.ADMIN_TRIGGER_KEY) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const userIdParam = req.params.userId;
    if (!userIdParam) return res.status(400).json({ success: false, error: 'Missing userId param' });

    const userId = new Types.ObjectId(String(userIdParam));
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Use the same date range logic as generateWeeklyReport (last 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7);

    const weeklyData = await gatherWeeklyData(userId, startDate, endDate);

    // FIXED: No longer check hasData - always attempt AI generation
    let content = '';
    try {
      if (genAI) {
        const profileSummary = '';
        content = await generateAIWeeklyReport(weeklyData, user.name || 'User', profileSummary);
      } else {
        logger.warn("GEMINI_API_KEY not configured - using fallback");
        content = generateFallbackWeeklyReport(weeklyData, user.name || 'User');
      }
    } catch (e) {
      logger.error('AI generation failed in trigger:', e);
      content = generateFallbackWeeklyReport(weeklyData, user.name || 'User');
    }

    const metadata = {
      weekStart: startDate.toISOString(),
      weekEnd: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const doc = await WeeklyReport.create({ userId, content, metadata, expiresAt });
    return res.json({ success: true, reportId: doc._id, content, metadata });
  } catch (error) {
    logger.error('Error triggering weekly report for user:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
};

// Helper function to gather weekly data with enhanced insights
export async function gatherWeeklyData(userId: Types.ObjectId, startDate: Date, endDate: Date) {
  try {
    // Get mood entries for the week
    const moodEntries = await Mood.find({
      userId,
      createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: 1 });

    // Get journal entries for the week
    const journalEntries = await JournalEntry.find({
      userId,
      createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: 1 });

    // Get meditation sessions for the week
    const meditationSessions = await MeditationSession.find({
      userId,
      completedAt: { $gte: startDate, $lte: endDate }
    }).populate('meditationId').sort({ completedAt: 1 });

    // Get therapy sessions for the week
    const therapySessions = await ChatSession.find({
      userId,
      startTime: { $gte: startDate, $lte: endDate }
    }).sort({ startTime: 1 });

    // Get active interventions and their outcomes
    const activeInterventions = await InterventionProgress.find({
      userId,
      status: { $in: ['active', 'completed'] },
      startedAt: { $lte: endDate }
    }).sort({ startedAt: -1 }).lean() as any[];

    // Get intervention outcomes for completed interventions
    const interventionOutcomes = await getUserInterventionOutcomes(userId);
    const recentOutcomes = interventionOutcomes.filter(outcome => {
      const completionDate = new Date(endDate.getTime() - outcome.daysSinceCompletion! * 24 * 60 * 60 * 1000);
      return completionDate >= startDate && completionDate <= endDate;
    });

    // Analyze patterns (this will analyze all historical data, but we'll focus on week insights)
    let patternInsights: any[] = [];
    try {
      const patterns = await analyzeUserPatterns(userId);
      // Filter for patterns relevant to this week or ongoing
      patternInsights = patterns.slice(0, 5).map(p => ({
        type: p.type,
        pattern: p.pattern,
        insight: p.insight,
        confidence: p.confidence
      }));
    } catch (patternError: any) {
      logger.warn('Failed to analyze patterns for weekly report:', patternError.message);
    }

    // Calculate insights
    const averageMood = moodEntries.length > 0 
      ? moodEntries.reduce((sum, entry) => sum + (entry as any).score, 0) / moodEntries.length / 10 // Convert 0-100 to 1-10
      : 0;

    const moodTrend = calculateMoodTrend(moodEntries);
    const topEmotions = extractTopEmotions(journalEntries);
    const activityStreak = calculateActivityStreak(moodEntries, journalEntries, meditationSessions);
    const progressHighlights = extractProgressHighlights(journalEntries, moodEntries);

    // Calculate engagement metrics
    const totalEngagementMinutes = therapySessions.reduce((sum, session) => {
      const duration = session.endTime && session.startTime
        ? Math.floor((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000)
        : 0;
      return sum + duration;
    }, 0) + meditationSessions.reduce((sum, session) => sum + (session.duration || 0), 0);

    // Identify most effective interventions
    const effectiveInterventions = recentOutcomes
      .filter(outcome => outcome.moodImprovement && outcome.moodImprovement > 0.5)
      .sort((a, b) => (b.moodImprovement || 0) - (a.moodImprovement || 0))
      .slice(0, 3);

    return {
      moodEntries,
      journalEntries,
      meditationSessions,
      therapySessions,
      activeInterventions,
      interventionOutcomes: recentOutcomes,
      patternInsights,
      averageMood: Math.round(averageMood * 10) / 10,
      moodTrend,
      topEmotions,
      activityStreak,
      progressHighlights,
      totalEngagementMinutes,
      effectiveInterventions: effectiveInterventions.map(outcome => ({
        name: outcome.interventionName,
        improvement: outcome.moodImprovement,
        message: formatOutcomeMessage(outcome)
      })),
      hasData: moodEntries.length > 0 || journalEntries.length > 0 || meditationSessions.length > 0 || therapySessions.length > 0
    };
  } catch (error) {
    logger.error("Error gathering weekly data:", error);
    return {
      moodEntries: [],
      journalEntries: [],
      meditationSessions: [],
      therapySessions: [],
      activeInterventions: [],
      interventionOutcomes: [],
      patternInsights: [],
      averageMood: 0,
      moodTrend: 'stable',
      topEmotions: [],
      activityStreak: 0,
      progressHighlights: [],
      totalEngagementMinutes: 0,
      effectiveInterventions: [],
      hasData: false
    };
  }
}

// Helper function to calculate mood trend
function calculateMoodTrend(moodEntries: any[]): string {
  if (moodEntries.length < 2) return 'stable';
  
  const firstHalf = moodEntries.slice(0, Math.floor(moodEntries.length / 2));
  const secondHalf = moodEntries.slice(Math.floor(moodEntries.length / 2));
  
  const firstAvg = firstHalf.reduce((sum, entry) => sum + entry.mood, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, entry) => sum + entry.mood, 0) / secondHalf.length;
  
  const difference = secondAvg - firstAvg;
  
  if (difference > 0.5) return 'improving';
  if (difference < -0.5) return 'declining';
  return 'stable';
}

// Helper function to extract top emotions
function extractTopEmotions(journalEntries: any[]): string[] {
  const emotionCounts: { [key: string]: number } = {};
  
  journalEntries.forEach(entry => {
    if (entry.emotionalState) {
      emotionCounts[entry.emotionalState] = (emotionCounts[entry.emotionalState] || 0) + 1;
    }
  });
  
  return Object.entries(emotionCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([emotion]) => emotion);
}

// Helper function to calculate activity streak
function calculateActivityStreak(moodEntries: any[], journalEntries: any[], meditationSessions: any[]): number {
  const activityDays = new Set();
  
  moodEntries.forEach(entry => activityDays.add(entry.createdAt.toDateString()));
  journalEntries.forEach(entry => activityDays.add(entry.createdAt.toDateString()));
  meditationSessions.forEach(session => activityDays.add(session.completedAt.toDateString()));
  
  return activityDays.size;
}

// Helper function to extract progress highlights
function extractProgressHighlights(journalEntries: any[], moodEntries: any[]): string[] {
  const highlights: string[] = [];
  
  // Look for positive themes in journal entries
  journalEntries.forEach(entry => {
    const content = entry.content.toLowerCase();
    if (content.includes('grateful') || content.includes('thankful')) {
      highlights.push('Practiced gratitude');
    }
    if (content.includes('progress') || content.includes('better')) {
      highlights.push('Noticed personal growth');
    }
    if (content.includes('calm') || content.includes('peaceful')) {
      highlights.push('Found moments of peace');
    }
  });
  
  // Look for mood improvements
  if (moodEntries.length > 1) {
    const firstMood = moodEntries[0].mood;
    const lastMood = moodEntries[moodEntries.length - 1].mood;
    if (lastMood > firstMood + 1) {
      highlights.push('Mood improved throughout the week');
    }
  }
  
  return [...new Set(highlights)]; // Remove duplicates
}

// Generate AI weekly report
export async function generateAIWeeklyReport(weeklyData: any, userName: string, profileSummary: string = ''): Promise<string> {
  if (!genAI) {
    throw new Error('AI service not configured');
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  // Build pattern insights summary
  const patternSummary = weeklyData.patternInsights && weeklyData.patternInsights.length > 0
    ? `Patterns identified:\n${weeklyData.patternInsights.map((p: any) => `- ${p.pattern} (${p.type}): ${p.insight}`).join('\n')}`
    : 'No specific patterns identified this week.';

  // Build intervention summary
  const interventionSummary = weeklyData.activeInterventions && weeklyData.activeInterventions.length > 0
    ? `Active interventions: ${weeklyData.activeInterventions.map((i: any) => i.interventionName).join(', ')}`
    : 'No active interventions this week.';

  const effectiveInterventionsText = weeklyData.effectiveInterventions && weeklyData.effectiveInterventions.length > 0
    ? `Most effective interventions:\n${weeklyData.effectiveInterventions.map((i: any) => `- ${i.name}: ${i.message}`).join('\n')}`
    : '';

  const prompt = `You are the user's personal wellness guide. Generate an insightful, friendly weekly report summarizing their emotional trends, behaviors, growth, and patterns.

User: ${userName}
${profileSummary ? `Profile: ${profileSummary}\n` : ''}

Week Data:
- Average mood: ${weeklyData.averageMood}/10 (trend: ${weeklyData.moodTrend})
- Top emotions: ${weeklyData.topEmotions.join(', ') || 'Not specified'}
- Activity streak: ${weeklyData.activityStreak} days
- Engagement time: ${Math.round(weeklyData.totalEngagementMinutes)} minutes
- Journal entries: ${weeklyData.journalEntries.length}
- Meditation sessions: ${weeklyData.meditationSessions.length}
- Therapy sessions: ${weeklyData.therapySessions.length}

Progress highlights: ${weeklyData.progressHighlights.join(', ') || 'None noted'}

${patternSummary}

${interventionSummary}
${effectiveInterventionsText ? '\n' + effectiveInterventionsText + '\n' : ''}

Intervention outcomes: ${weeklyData.interventionOutcomes.length} interventions completed this week.

The report should include:
1. A warm, personalized introduction (use their name)
2. A mood overview with trend analysis and what it means
3. Key patterns identified (if any) - explain what they mean for the user
4. Activity highlights and engagement wins
5. Intervention effectiveness insights (what's working, what could help more)
6. Personalized recommendations based on patterns and outcomes (2-3 actionable items)
7. An encouraging closing note that references their progress

Keep it around 250-350 words, use a gentle and hopeful tone, and always end with a motivational message.
Focus on providing genuine insight into their patterns and what's working, not just data.
Use conversational language like a supportive friend who understands them deeply.
Reference specific patterns and outcomes to show you're paying attention to their unique journey.

Format as a clean, readable report with emojis where appropriate.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text().trim();
}

// Generate fallback weekly report
export function generateFallbackWeeklyReport(weeklyData: any, userName: string): string {
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekEnd = new Date();
  
  let report = `**Weekly Wellness Report — ${weekStart.toLocaleDateString()} to ${weekEnd.toLocaleDateString()}**\n\n`;
  
  report += `Hey ${userName} 🌿, here's a quick look at how your week unfolded.\n\n`;
  
  if (weeklyData.hasData) {
    if (weeklyData.averageMood > 0) {
      report += `Your average mood this week was ${weeklyData.averageMood}/10. `;
      if (weeklyData.moodTrend === 'improving') {
        report += `I can see your mood improved throughout the week — that's a great sign! `;
      } else if (weeklyData.moodTrend === 'declining') {
        report += `I noticed your mood dipped a bit this week. `;
      } else {
        report += `Your mood stayed pretty steady this week. `;
      }
    }
    
    if (weeklyData.progressHighlights.length > 0) {
      report += `\n\nSome highlights from your week:\n`;
      weeklyData.progressHighlights.forEach((highlight: string) => {
        report += `• ${highlight}\n`;
      });
    }
    
    if (weeklyData.activityStreak > 0) {
      report += `\nYou were active ${weeklyData.activityStreak} days this week — that's consistency! `;
    }
    
    report += `\n\nFor next week, try these small things:\n`;
    report += `• Start each morning with one positive intention\n`;
    report += `• Take a 5-minute break when you feel overwhelmed\n`;
    report += `• Reflect on your day before bed\n\n`;
  } else {
    report += `I don't have much data from this week, but that's okay! Sometimes quiet weeks are exactly what we need.\n\n`;
    report += `For next week, consider:\n`;
    report += `• Checking in with your mood once a day\n`;
    report += `• Writing down one thing you're grateful for\n`;
    report += `• Taking a moment to breathe when you feel stressed\n\n`;
  }
  
  report += `You're doing important work by paying attention to your mental health. Keep caring for yourself in small ways — they add up 💛`;
  
  return report;
}
