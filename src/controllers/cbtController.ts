import { Request, Response } from "express";
import { CBTThoughtRecord } from "../models/CBTThoughtRecord";
import { CBTActivity } from "../models/CBTActivity";
import { Mood } from "../models/Mood";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildHopePrompt } from '../utils/hopePersonality';

// Initialize Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Save a thought record
export const saveThoughtRecord = async (req: Request, res: Response) => {
  try {
    const { situation, automaticThoughts, emotions, emotionIntensity, evidenceFor, evidenceAgainst, balancedThought, cognitiveDistortions } = req.body;

    if (!situation || !automaticThoughts) {
      return res.status(400).json({
        success: false,
        message: "Situation and automatic thoughts are required",
      });
    }

    const thoughtRecord = new CBTThoughtRecord({
      userId: req.user._id,
      situation,
      automaticThoughts,
      emotions: emotions || [],
      emotionIntensity: emotionIntensity || 5,
      evidenceFor: evidenceFor || "",
      evidenceAgainst: evidenceAgainst || "",
      balancedThought: balancedThought || "",
      cognitiveDistortions: cognitiveDistortions || [],
    });

    await thoughtRecord.save();

    // Also save as CBT activity
    const activity = new CBTActivity({
      userId: req.user._id,
      type: 'thought_record',
      data: {
        thoughtRecordId: thoughtRecord._id,
        situation,
        cognitiveDistortions,
      },
    });
    await activity.save();

    res.status(201).json({
      success: true,
      data: thoughtRecord,
      message: "Thought record saved successfully",
    });
  } catch (error) {
    console.error("Error saving thought record:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save thought record",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get thought records
export const getThoughtRecords = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    const thoughtRecords = await CBTThoughtRecord.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);

    const total = await CBTThoughtRecord.countDocuments({ userId: req.user._id });

    res.json({
      success: true,
      data: thoughtRecords,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching thought records:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch thought records",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Save CBT activity
export const saveCBTActivity = async (req: Request, res: Response) => {
  try {
    const { type, data, effectiveness, moodBefore, moodAfter } = req.body;

    if (!type || !data) {
      return res.status(400).json({
        success: false,
        message: "Activity type and data are required",
      });
    }

    const activity = new CBTActivity({
      userId: req.user._id,
      type,
      data,
      effectiveness,
      moodBefore,
      moodAfter,
    });

    await activity.save();

    res.status(201).json({
      success: true,
      data: activity,
      message: "CBT activity saved successfully",
    });
  } catch (error) {
    console.error("Error saving CBT activity:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save CBT activity",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get CBT activities
export const getCBTActivities = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const type = req.query.type as string;

    const query: any = { userId: req.user._id };
    if (type) {
      query.type = type;
    }

    const activities = await CBTActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);

    const total = await CBTActivity.countDocuments(query);

    res.json({
      success: true,
      data: activities,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching CBT activities:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch CBT activities",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get CBT progress
export const getCBTProgress = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get counts
    const thoughtRecordsCompleted = await CBTThoughtRecord.countDocuments({
      userId,
      createdAt: { $gte: thirtyDaysAgo },
    });

    const activities = await CBTActivity.find({
      userId,
      createdAt: { $gte: thirtyDaysAgo },
    });

    const activitySchedulingCount = activities.filter(a => a.type === 'activity_scheduling').length;
    const relaxationCount = activities.filter(a => a.type === 'relaxation').length;
    
    const moodEntries = await Mood.countDocuments({
      userId,
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Calculate weekly streak
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentActivities = await CBTActivity.countDocuments({
      userId,
      createdAt: { $gte: weekAgo },
    });

    // Calculate goals achieved (thought records with balanced thoughts)
    const goalsAchieved = await CBTThoughtRecord.countDocuments({
      userId,
      balancedThought: { $ne: "" },
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Get latest activity
    const lastActivity = await CBTActivity.findOne({ userId })
      .sort({ createdAt: -1 })
      .select('createdAt');

    res.json({
      success: true,
      progress: {
        thoughtRecordsCompleted,
        activitiesScheduled: activitySchedulingCount,
        moodEntries,
        relaxationSessions: relaxationCount,
        goalsAchieved,
        weeklyStreak: recentActivities > 0 ? Math.min(recentActivities, 7) : 0,
        lastActivity: lastActivity?.createdAt || null,
      },
    });
  } catch (error) {
    console.error("Error fetching CBT progress:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch CBT progress",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Generate AI-powered CBT insights
export const generateAICBTInsights = async (req: Request, res: Response) => {
  try {
    const { text, type, mood, emotions, situation } = req.body;

    if (!text || !type) {
      return res.status(400).json({
        success: false,
        message: "Text and type are required",
      });
    }

    if (!genAI) {
      // Return a helpful fallback response when AI is not configured
      return res.status(200).json({
        success: true,
        data: {
          error: "AI service not configured",
          message: "AI insights require GEMINI_API_KEY to be set. Using basic analysis.",
          cognitiveDistortions: ["Unable to analyze - AI service not configured"],
          recommendations: ["Set GEMINI_API_KEY environment variable for AI-powered insights"]
        },
        isFailover: true
      });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let prompt = "";
    
    if (type === 'journal_insights') {
      // Journal entry insights - return simple array of insights
      prompt = `Respond concisely in 2-4 lines unless the user asks for step-by-step or the situation clearly requires more detail.

Analyze this journal entry and provide 3-5 brief, supportive insights as a mental health companion.

Journal: "${text}"
Mood: ${mood || 'Not specified'}/6

Respond with a JSON array of 3-5 short insights (1-2 sentences each). Focus on:
- Recognizing emotional patterns with warmth
- Offering gentle encouragement like a supportive friend
- Suggesting helpful coping strategies naturally
- Acknowledging their feelings genuinely

Format: ["insight 1", "insight 2", "insight 3"]

Only return the JSON array, nothing else.`;
    } else if (type === 'thought_analysis') {
      prompt = `Respond concisely in 2-4 lines unless the user asks for step-by-step or the situation clearly requires more detail.

You are a CBT (Cognitive Behavioral Therapy) expert. Analyze the following thought and provide insights:

Thought: "${text}"

Please provide a JSON response with:
1. cognitiveDistortions: Array of identified cognitive distortions (e.g., "All-or-nothing thinking", "Catastrophizing", "Overgeneralization", "Mental filtering", "Jumping to conclusions", "Emotional reasoning", "Should statements", "Labeling", "Personalization")
2. challengingQuestions: Array of 3-5 questions to challenge this thought
3. balancedSuggestions: Array of 2-3 alternative balanced thoughts
4. severity: "low", "moderate", or "high"

Format your response as valid JSON only.`;
    } else if (type === 'mood_analysis') {
      prompt = `Respond concisely in 2-4 lines unless the user asks for step-by-step or the situation clearly requires more detail.

Analyze this mood and situation with empathy:

Mood Level: ${mood}/10
Emotions: ${emotions?.join(', ') || 'Not specified'}
Situation: "${situation || text}"

Provide a JSON response with:
1. copingStrategies: Array of 4-6 brief, actionable coping strategies
2. urgency: "immediate", "moderate", or "routine"
3. suggestedActivities: Array of 3-5 simple activities
4. supportiveMessage: A simple, genuine message (2-3 sentences, 30-40 words max). Talk like a supportive friend, not a therapist. Be warm and conversational.

Format as valid JSON only. Keep supportiveMessage natural and real.`;
    } else if (type === 'general_insights') {
      prompt = `Respond concisely in 2-4 lines unless the user asks for step-by-step or the situation clearly requires more detail.

You are a CBT therapist. Provide general CBT insights for:

Text: "${text}"
Mood: ${mood || 'Not specified'}/10

Please provide a JSON response with:
1. cognitiveDistortions: Array of any identified cognitive distortions
2. copingStrategies: Array of helpful coping strategies
3. overallAssessment: Brief assessment paragraph
4. recommendations: Array of 3-5 recommendations

Format your response as valid JSON only.`;
    }

    prompt = buildHopePrompt(mood || 'neutral', `Type: ${type || 'N/A'}\nText/Situation: ${text}\nEmotions: ${emotions?.join(', ') || 'N/A'}` , 'CBT Insights flow. Respond concisely in 2-4 lines unless the user asks for step-by-step or the situation clearly requires more detail.');

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let aiText = response.text();

    // Clean up the response to extract JSON
    aiText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let insights;
    try {
      insights = JSON.parse(aiText);
      
      // For journal_insights, ensure we return the array in the expected format
      if (type === 'journal_insights' && Array.isArray(insights)) {
        return res.json({
          success: true,
          insights: insights,
          source: 'backend'
        });
      }
    } catch (parseError) {
      // If JSON parsing fails, create a fallback response
      console.error("Failed to parse AI response:", parseError);
      insights = {
        error: "Failed to parse AI response",
        rawResponse: aiText,
      };
    }

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    console.error("Error generating AI CBT insights:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate AI CBT insights",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get CBT insights (data-driven insights from user's history)
export const getCBTInsights = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get cognitive distortions frequency
    const thoughtRecords = await CBTThoughtRecord.find({
      userId,
      createdAt: { $gte: thirtyDaysAgo },
    });

    const distortionCounts: Record<string, number> = {};
    thoughtRecords.forEach(record => {
      record.cognitiveDistortions.forEach(distortion => {
        distortionCounts[distortion] = (distortionCounts[distortion] || 0) + 1;
      });
    });

    const commonDistortions = Object.entries(distortionCounts)
      .map(([distortion, frequency]) => ({
        distortion,
        frequency,
        trend: 'stable' as const,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    // Get effective techniques
    const activities = await CBTActivity.find({
      userId,
      effectiveness: { $exists: true, $ne: null },
      createdAt: { $gte: thirtyDaysAgo },
    });

    const techniqueStats: Record<string, { total: number; count: number }> = {};
    activities.forEach(activity => {
      if (activity.effectiveness !== undefined && activity.effectiveness !== null) {
        const type = activity.type;
        if (!techniqueStats[type]) {
          techniqueStats[type] = { total: 0, count: 0 };
        }
        techniqueStats[type].total += activity.effectiveness;
        techniqueStats[type].count += 1;
      }
    });

    const effectiveTechniques = Object.entries(techniqueStats)
      .map(([technique, stats]) => ({
        technique,
        effectiveness: stats.total / stats.count,
        usage: stats.count,
      }))
      .sort((a, b) => b.effectiveness - a.effectiveness);

    // Use AI to generate personalized recommendations
    let aiRecommendations: string[] = [];
    if (genAI && thoughtRecords.length > 0) {
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Respond concisely in 2-4 lines unless the user asks for step-by-step or the situation clearly requires more detail.

As a CBT therapist, analyze this user's pattern:

Common cognitive distortions: ${commonDistortions.map(d => d.distortion).join(', ')}
Thought records completed: ${thoughtRecords.length}
Most effective technique: ${effectiveTechniques[0]?.technique || 'None yet'}

Provide 3-5 specific, actionable recommendations for this user. Return as JSON array of strings.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let aiText = response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        aiRecommendations = JSON.parse(aiText);
      } catch (aiError) {
        console.error("AI recommendation generation failed:", aiError);
      }
    }

    // Fallback recommendations if AI fails
    const recommendations = aiRecommendations.length > 0 ? aiRecommendations : [
      thoughtRecords.length < 5 ? "Try completing more thought records to identify patterns in your thinking" : null,
      commonDistortions.length > 0 ? `Focus on challenging ${commonDistortions[0].distortion} - it's your most common distortion` : null,
      activities.length < 10 ? "Consider scheduling more CBT activities for better results" : null,
    ].filter(Boolean) as string[];

    res.json({
      success: true,
      insights: {
        commonDistortions,
        effectiveTechniques,
        moodCBTCorrelation: 0.75, // Placeholder - would need more complex calculation
        recommendations,
        generatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Error fetching CBT insights:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch CBT insights",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get CBT analytics
export const getCBTAnalytics = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const period = (req.query.period as string) || '30days';
    
    let daysAgo = 30;
    if (period === '7days') daysAgo = 7;
    if (period === '90days') daysAgo = 90;

    const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    // Get thought records over time
    const thoughtRecords = await CBTThoughtRecord.find({
      userId,
      createdAt: { $gte: startDate },
    }).select('createdAt cognitiveDistortions');

    // Get mood entries over time
    const moodEntries = await Mood.find({
      userId,
      createdAt: { $gte: startDate },
    }).select('createdAt score');

    // Get activities over time
    const activities = await CBTActivity.find({
      userId,
      createdAt: { $gte: startDate },
    }).select('createdAt type moodBefore moodAfter');

    res.json({
      success: true,
      analytics: {
        period,
        thoughtRecordsCount: thoughtRecords.length,
        moodEntriesCount: moodEntries.length,
        activitiesCount: activities.length,
        thoughtRecordsTimeline: thoughtRecords.map(tr => ({
          date: tr.createdAt,
          distortions: tr.cognitiveDistortions,
        })),
        moodTimeline: moodEntries.map(m => ({
          date: m.createdAt,
          score: m.score,
        })),
        activitiesTimeline: activities.map(a => ({
          date: a.createdAt,
          type: a.type,
          moodChange: a.moodBefore && a.moodAfter ? a.moodAfter - a.moodBefore : null,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching CBT analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch CBT analytics",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Save mood entry with CBT insights
export const saveMoodEntryWithCBT = async (req: Request, res: Response) => {
  try {
    const { score, triggers, copingStrategies, thoughts, situation, cbtInsights } = req.body;

    if (score === undefined) {
      return res.status(400).json({
        success: false,
        message: "Mood score is required",
      });
    }

    const mood = new Mood({
      userId: req.user._id,
      score,
      triggers: triggers || [],
      copingStrategies: copingStrategies || [],
      notes: thoughts || "",
    });

    await mood.save();

    // Save as CBT activity
    const activity = new CBTActivity({
      userId: req.user._id,
      type: 'mood_entry',
      data: {
        moodId: mood._id,
        situation,
        cbtInsights,
      },
      moodBefore: score,
    });
    await activity.save();

    res.status(201).json({
      success: true,
      data: mood,
      message: "Mood entry saved successfully",
    });
  } catch (error) {
    console.error("Error saving mood entry:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save mood entry",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get mood entries with CBT data
export const getMoodEntriesWithCBT = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    const period = (req.query.period as string) || '30days';

    let daysAgo = 30;
    if (period === '7days') daysAgo = 7;
    if (period === '90days') daysAgo = 90;

    const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    const moodEntries = await Mood.find({
      userId: req.user._id,
      createdAt: { $gte: startDate },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);

    const total = await Mood.countDocuments({
      userId: req.user._id,
      createdAt: { $gte: startDate },
    });

    res.json({
      success: true,
      data: moodEntries,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Error fetching mood entries:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch mood entries",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

