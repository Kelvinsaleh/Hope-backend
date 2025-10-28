import { Request, Response } from "express";
import { logger } from "../utils/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Types } from "mongoose";
import { JournalEntry } from "../models/JournalEntry";
import { Mood } from "../models/Mood";
import { MeditationSession } from "../models/Meditation";
import { ChatSession } from "../models/ChatSession";
import { User } from "../models/User";

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

    // Generate AI report
    let aiReport: string;
    let isFailover = false;

    if (genAI && weeklyData.hasData) {
      try {
        aiReport = await generateAIWeeklyReport(weeklyData, user.name || 'User');
        logger.info("AI weekly report generated successfully");
      } catch (error) {
        logger.error("AI report generation failed:", error);
        aiReport = generateFallbackWeeklyReport(weeklyData, user.name || 'User');
        isFailover = true;
      }
    } else {
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

// Helper function to gather weekly data
async function gatherWeeklyData(userId: Types.ObjectId, startDate: Date, endDate: Date) {
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

    // Calculate insights
    const averageMood = moodEntries.length > 0 
      ? moodEntries.reduce((sum, entry) => sum + (entry as any).mood, 0) / moodEntries.length 
      : 0;

    const moodTrend = calculateMoodTrend(moodEntries);
    const topEmotions = extractTopEmotions(journalEntries);
    const activityStreak = calculateActivityStreak(moodEntries, journalEntries, meditationSessions);
    const progressHighlights = extractProgressHighlights(journalEntries, moodEntries);

    return {
      moodEntries,
      journalEntries,
      meditationSessions,
      therapySessions,
      averageMood: Math.round(averageMood * 10) / 10,
      moodTrend,
      topEmotions,
      activityStreak,
      progressHighlights,
      hasData: moodEntries.length > 0 || journalEntries.length > 0 || meditationSessions.length > 0
    };
  } catch (error) {
    logger.error("Error gathering weekly data:", error);
    return {
      moodEntries: [],
      journalEntries: [],
      meditationSessions: [],
      therapySessions: [],
      averageMood: 0,
      moodTrend: 'stable',
      topEmotions: [],
      activityStreak: 0,
      progressHighlights: [],
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
async function generateAIWeeklyReport(weeklyData: any, userName: string): Promise<string> {
  if (!genAI) {
    throw new Error('AI service not configured');
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `You are the user's personal wellness guide. Generate a short, friendly weekly report summarizing their emotional trends, behaviors, and growth.

User: ${userName}
Week Data:
- Average mood: ${weeklyData.averageMood}/10
- Mood trend: ${weeklyData.moodTrend}
- Top emotions: ${weeklyData.topEmotions.join(', ') || 'Not specified'}
- Activity streak: ${weeklyData.activityStreak} days
- Progress highlights: ${weeklyData.progressHighlights.join(', ') || 'None noted'}
- Journal entries: ${weeklyData.journalEntries.length}
- Meditation sessions: ${weeklyData.meditationSessions.length}
- Therapy sessions: ${weeklyData.therapySessions.length}

The report should include:
1. A warm, personalized introduction (use their name)
2. A mood overview (average mood, trends, notable patterns)
3. Key highlights or positive behaviors
4. Emotional challenges or repeating struggles (if any)
5. Practical suggestions for the coming week (2-3 actionable items)
6. An encouraging closing note

Keep it around 150-250 words, use a gentle and hopeful tone, and always end with a motivational message.
Focus on helpful insight, not judgment. If user data is limited, speak broadly but stay uplifting.
Use conversational language like a supportive friend, not clinical language.

Format as a clean, readable report with emojis where appropriate.`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text().trim();
}

// Generate fallback weekly report
function generateFallbackWeeklyReport(weeklyData: any, userName: string): string {
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
