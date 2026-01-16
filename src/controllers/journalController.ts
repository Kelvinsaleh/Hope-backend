import { Request, Response } from "express";
import { JournalEntry } from "../models/JournalEntry";
import { Types } from "mongoose";
import { logger } from "../utils/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { LongTermMemoryModel } from "../models/LongTermMemory";

// Initialize Gemini API - optional
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
if (!GEMINI_API_KEY) {
  logger.warn('GEMINI_API_KEY not set. Journal AI insights will use fallback generator.');
}
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Create a new journal entry
export const createJournalEntry = async (req: Request, res: Response) => {
  try {
    const { 
      title, 
      content, 
      mood, 
      tags, 
      isPrivate, 
      insights, 
      emotionalState, 
      keyThemes, 
      concerns, 
      achievements,
      // CBT Template fields
      cbtTemplate,
      situation,
      automaticThoughts,
      emotions,
      emotionIntensity,
      evidenceFor,
      evidenceAgainst,
      balancedThought,
      cognitiveDistortions,
      cbtInsights,
    } = req.body;
    const userId = new Types.ObjectId(req.user.id);

    // For CBT thought records, title and content are optional
    // They should have situation, automaticThoughts, and other CBT fields
    // CBT thought records are premium only
    if (cbtTemplate === 'thought_record') {
      // Check if user has premium access (including trial)
      const { Subscription } = await import("../models/Subscription");
      const { User } = await import("../models/User");
      
      const userIdObj = new Types.ObjectId(req.user.id);
      const activeSub = await Subscription.findOne({
        userId: userIdObj,
        status: 'active',
        expiresAt: { $gt: new Date() }
      });
      
      let hasPremium = !!activeSub;
      if (!hasPremium) {
        const user = await User.findById(userIdObj).lean();
        if (user?.trialEndsAt && new Date() < new Date(user.trialEndsAt)) {
          hasPremium = true;
        }
      }
      
      if (!hasPremium) {
        return res.status(403).json({
          success: false,
          error: "CBT thought records are a premium feature. Upgrade to Premium to access this feature."
        });
      }
      
      if (!mood) {
        return res.status(400).json({
          error: "Mood is required for thought records"
        });
      }
      // Use automaticThoughts as content if content is empty
      const entryContent = content || automaticThoughts || situation || '';
      const entryTitle = title || `Thought Record - ${new Date().toLocaleDateString()}`;
      
      // Create journal entry with CBT fields
      const journalEntry = new JournalEntry({
        userId,
        title: entryTitle,
        content: entryContent,
        mood,
        tags: tags || [],
        isPrivate: isPrivate !== undefined ? isPrivate : true,
        insights: cbtInsights || insights || [],
        emotionalState: emotionalState || (emotions?.length ? emotions.join(', ') : undefined),
        keyThemes: keyThemes || [],
        concerns: concerns || [],
        achievements: achievements || [],
      });
      
      // Store CBT-specific fields in a flexible way (as JSON in content or separate fields if schema supports)
      // For now, we'll include CBT data in the entry
      await journalEntry.save();
      
      // Also save as CBT Thought Record if CBT models are available
      try {
        const { CBTThoughtRecord } = await import("../models/CBTThoughtRecord");
        const thoughtRecord = new CBTThoughtRecord({
          userId,
          situation: situation || '',
          automaticThoughts: automaticThoughts || '',
          emotions: emotions || [],
          emotionIntensity: emotionIntensity || 0,
          evidenceFor: evidenceFor || '',
          evidenceAgainst: evidenceAgainst || '',
          balancedThought: balancedThought || '',
          cognitiveDistortions: cognitiveDistortions || [],
          mood,
        });
        await thoughtRecord.save();
      } catch (cbtError) {
        logger.warn('Failed to save CBT thought record separately:', cbtError);
        // Continue even if CBT model save fails
      }
      
      return res.status(201).json({
        success: true,
        message: "Thought record created successfully",
        entry: journalEntry,
      });
    }

    // For regular journal entries, title and content are required
    if (!title || !content || !mood) {
      return res.status(400).json({
        error: "Title, content, and mood are required"
      });
    }

    // If client didn't supply insights/emotionalState, try to generate AI insights (Gemini) and fallback to deterministic
    let computedInsights: string[] = Array.isArray(insights) && insights.length > 0 ? insights : [];
    try {
      if (computedInsights.length === 0) {
        computedInsights = genAI ? await generateAIInsights(content, mood) : generateFallbackInsights(content, mood);
      }
    } catch (e) {
      logger.warn('AI insight generation failed, using fallback:', e);
      if (computedInsights.length === 0) computedInsights = generateFallbackInsights(content, mood);
    }

    const computedEmotionalState: string = emotionalState || computeEmotionalState(content, mood);

    const journalEntry = new JournalEntry({
      userId,
      title,
      content,
      mood,
      tags: tags || [],
      isPrivate: isPrivate !== undefined ? isPrivate : true,
      insights: computedInsights,
      emotionalState: computedEmotionalState,
      keyThemes: keyThemes || extractKeyThemes(content),
      concerns: concerns || extractConcerns(content),
      achievements: achievements || extractAchievements(content),
    });

    await journalEntry.save();

    // Extract key facts from journal entry for long-term memory (async, don't block response)
    // This helps the AI remember important details mentioned in journal entries
    const { extractKeyFacts, generateUserSummary } = require('../utils/conversationOptimizer');
    
    // Convert journal entry to message format for extraction
    const journalMessages = [{
      role: 'user',
      content: `${journalEntry.title || ''}\n\n${journalEntry.content}`,
      timestamp: journalEntry.createdAt || new Date(),
    }];

    extractKeyFacts(journalMessages, 5)
      .then((keyFacts: Array<{
        type: 'emotional_theme' | 'coping_pattern' | 'goal' | 'trigger' | 'insight' | 'preference';
        content: string;
        importance: number;
        tags: string[];
        context?: string;
      }>) => {
        if (keyFacts.length > 0) {
          logger.info(`Extracted ${keyFacts.length} key facts from journal entry`);
          // Store key facts asynchronously
          const journalEntryId = (journalEntry._id as Types.ObjectId)?.toString() || '';
          if (journalEntryId) {
            return storeKeyFactsFromJournal(userId.toString(), keyFacts, journalEntryId);
          }
        }
      })
      .catch((error: any) => {
        logger.warn('Failed to extract/store key facts from journal entry:', error.message);
      });

    // Also update user summary if enough journal entries exist
    updateUserSummaryFromJournals(userId.toString())
      .catch((error: any) => {
        logger.warn('Failed to update user summary from journals:', error.message);
      });

    res.status(201).json({
      success: true,
      message: "Journal entry created successfully",
      entry: journalEntry,
    });
  } catch (error) {
    logger.error("Error creating journal entry:", error);
    res.status(500).json({
      error: "Failed to create journal entry",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get all journal entries for a user
/**
 * Store key facts extracted from journal entries into persistent memory
 */
async function storeKeyFactsFromJournal(
  userId: string,
  facts: Array<{
    type: 'emotional_theme' | 'coping_pattern' | 'goal' | 'trigger' | 'insight' | 'preference';
    content: string;
    importance: number;
    tags: string[];
    context?: string;
  }>,
  journalEntryId: string
): Promise<void> {
  if (!facts || facts.length === 0) return;

  try {
    const userIdObj = new Types.ObjectId(userId);
    
    // Store facts that don't already exist (avoid duplicates)
    for (const fact of facts) {
      // Check if similar fact already exists
      const existing = await LongTermMemoryModel.findOne({
        userId: userIdObj,
        content: { $regex: new RegExp(fact.content.substring(0, 50), 'i') },
      });

      if (!existing) {
        // Store new fact with journal context
        await LongTermMemoryModel.create({
          userId: userIdObj,
          type: fact.type,
          content: fact.content,
          importance: fact.importance,
          tags: [...fact.tags, 'journal', 'user-stated'],
          context: `From journal entry: ${journalEntryId}`,
          timestamp: new Date(),
        });
        logger.debug(`Stored key fact from journal: ${fact.type} - ${fact.content.substring(0, 50)}...`);
      } else {
        // Update importance if new fact is more important
        if (fact.importance > existing.importance) {
          existing.importance = fact.importance;
          existing.timestamp = new Date();
          await existing.save();
          logger.debug(`Updated importance for existing fact from journal: ${fact.content.substring(0, 50)}...`);
        }
      }
    }
  } catch (error: any) {
    logger.error('Error storing key facts from journal:', error);
    // Don't throw - this is non-critical
  }
}

/**
 * Update user summary based on journal entries
 * Generates or updates summary after accumulating enough journal entries
 */
async function updateUserSummaryFromJournals(userId: string): Promise<void> {
  try {
    const userIdObj = new Types.ObjectId(userId);
    
    // Get recent journal entries (last 10)
    const recentJournals = await JournalEntry.find({ userId: userIdObj })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Only generate/update summary if we have at least 5 journal entries
    if (recentJournals.length < 5) {
      return;
    }

    // Get existing user summary
    const existingSummary = await LongTermMemoryModel.findOne({
      userId: userIdObj,
      type: 'user_summary',
    }).lean();

    // Convert journal entries to message format for summary generation
    const journalMessages = recentJournals
      .reverse() // Oldest first for chronological context
      .map((entry: any) => ({
        role: 'user' as const,
        content: `${entry.title || ''}\n\n${entry.content || ''}`,
        timestamp: entry.createdAt || new Date(),
      }));

    const { generateUserSummary } = require('../utils/conversationOptimizer');
    const summary = await generateUserSummary(
      journalMessages,
      existingSummary?.content
    );

    if (summary) {
      if (existingSummary) {
        // Update existing summary
        await LongTermMemoryModel.findByIdAndUpdate(
          existingSummary._id,
          {
            content: summary.content,
            importance: summary.importance,
            tags: summary.tags,
            context: `Generated from ${recentJournals.length} journal entries`,
            timestamp: new Date(),
          },
          { new: true }
        );
        logger.info('Updated user summary from journal entries');
      } else {
        // Create new summary
        await LongTermMemoryModel.create({
          userId: userIdObj,
          type: 'user_summary',
          content: summary.content,
          importance: summary.importance,
          tags: summary.tags,
          context: `Generated from ${recentJournals.length} journal entries`,
          timestamp: new Date(),
        });
        logger.info('Created new user summary from journal entries');
      }
    }
  } catch (error: any) {
    logger.warn('Error updating user summary from journals:', error.message);
    // Don't throw - this is non-critical
  }
}

export const getJournalEntries = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user.id);
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const sortOptions: any = {};
    sortOptions[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const entries = await JournalEntry.find({ userId })
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await JournalEntry.countDocuments({ userId });

    res.json({
      success: true,
      entries,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
        totalEntries: total,
        hasNextPage: skip + Number(limit) < total,
        hasPrevPage: Number(page) > 1,
      },
    });
  } catch (error) {
    logger.error("Error fetching journal entries:", error);
    res.status(500).json({
      error: "Failed to fetch journal entries",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get a specific journal entry
export const getJournalEntry = async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const entry = await JournalEntry.findOne({
      _id: entryId,
      userId,
    });

    if (!entry) {
      return res.status(404).json({
        error: "Journal entry not found"
      });
    }

    res.json({
      success: true,
      entry,
    });
  } catch (error) {
    logger.error("Error fetching journal entry:", error);
    res.status(500).json({
      error: "Failed to fetch journal entry",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update a journal entry
export const updateJournalEntry = async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;
    const userId = new Types.ObjectId(req.user.id);
    const { title, content, mood, tags, isPrivate, insights, emotionalState, keyThemes, concerns, achievements } = req.body;
    // Load existing entry first so we can detect changes and compute insights when needed
    const existing = await JournalEntry.findOne({ _id: entryId, userId });
    if (!existing) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    const newContent = typeof content === 'string' ? content : existing.content;
    const newMood = typeof mood === 'number' ? mood : (existing as any).mood;

    // Determine computed insights: prefer client-supplied; otherwise generate when content/mood changed or entry had none
    let computedInsights: string[] = Array.isArray(insights) && insights.length > 0 ? insights : [];
    try {
      const needsGeneration = computedInsights.length === 0 && (newContent !== existing.content || newMood !== (existing as any).mood || ((existing as any).insights || []).length === 0);
      if (needsGeneration) {
        computedInsights = genAI ? await generateAIInsights(newContent, newMood) : generateFallbackInsights(newContent, newMood);
      }
    } catch (e) {
      logger.warn('AI insight generation failed on update, using fallback:', e);
      if (computedInsights.length === 0) computedInsights = generateFallbackInsights(newContent, newMood);
    }

    const computedEmotionalState: string = emotionalState || computeEmotionalState(newContent, newMood);
    const computedKeyThemes: string[] = Array.isArray(keyThemes) && keyThemes.length > 0 ? keyThemes : extractKeyThemes(newContent);
    const computedConcerns: string[] = Array.isArray(concerns) && concerns.length > 0 ? concerns : extractConcerns(newContent);
    const computedAchievements: string[] = Array.isArray(achievements) && achievements.length > 0 ? achievements : extractAchievements(newContent);

    const entry = await JournalEntry.findOneAndUpdate(
      { _id: entryId, userId },
      {
        title: title !== undefined ? title : existing.title,
        content: newContent,
        mood: newMood,
        tags: tags || existing.tags || [],
        isPrivate: isPrivate !== undefined ? isPrivate : existing.isPrivate,
        insights: computedInsights,
        emotionalState: computedEmotionalState,
        keyThemes: computedKeyThemes,
        concerns: computedConcerns,
        achievements: computedAchievements,
      },
      { new: true, runValidators: true }
    );

    if (!entry) {
      return res.status(404).json({
        error: "Journal entry not found"
      });
    }

    res.json({
      success: true,
      message: "Journal entry updated successfully",
      entry,
    });
  } catch (error) {
    logger.error("Error updating journal entry:", error);
    res.status(500).json({
      error: "Failed to update journal entry",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Delete a journal entry
export const deleteJournalEntry = async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;
    const userId = new Types.ObjectId(req.user.id);

    const entry = await JournalEntry.findOneAndDelete({
      _id: entryId,
      userId,
    });

    if (!entry) {
      return res.status(404).json({
        error: "Journal entry not found"
      });
    }

    res.json({
      success: true,
      message: "Journal entry deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting journal entry:", error);
    res.status(500).json({
      error: "Failed to delete journal entry",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get journal analytics
export const getJournalAnalytics = async (req: Request, res: Response) => {
  try {
    const userId = new Types.ObjectId(req.user.id);
    const { period = '30' } = req.query; // days

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(period));

    // Get mood trends
    const moodTrends = await JournalEntry.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          avgMood: { $avg: "$mood" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // Get tag frequency
    const tagFrequency = await JournalEntry.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: startDate },
        },
      },
      { $unwind: "$tags" },
      {
        $group: {
          _id: "$tags",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Get writing patterns
    const writingPatterns = await JournalEntry.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            hour: { $hour: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.hour": 1 } },
    ]);

    res.json({
      success: true,
      analytics: {
        moodTrends,
        tagFrequency,
        writingPatterns,
        period: Number(period),
      },
    });
  } catch (error) {
    logger.error("Error fetching journal analytics:", error);
    res.status(500).json({
      error: "Failed to fetch journal analytics",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// --- Lightweight local insight generators (fallback if AI not available) ---
function generateFallbackInsights(content: string, mood: number): string[] {
  const insights: string[] = [];
  const trimmed = (content || '').trim();

  if (trimmed.length > 200) {
    insights.push('Detailed reflection shows careful self-awareness.');
  }
  if (mood >= 5) {
    insights.push('Positive mood — seems things are going well recently.');
  } else if (mood <= 2) {
    insights.push('Low mood — consider supportive strategies or a short grounding exercise.');
  } else {
    insights.push('Neutral mood — steady day-to-day emotions.');
  }

  const lc = trimmed.toLowerCase();
  if (lc.includes('anx') || lc.includes('worry') || lc.includes('stressed') || lc.includes('panic')) {
    insights.push('Anxiety-related themes detected.');
  }
  if (lc.includes('sleep') || lc.includes('insomnia') || lc.includes('tired')) {
    insights.push('Sleep-related concerns mentioned.');
  }
  if (lc.includes('work') || lc.includes('job') || lc.includes('career')) {
    insights.push('Work or career is a recurring topic.');
  }

  // keep unique and short
  return Array.from(new Set(insights)).slice(0, 6);
}

function computeEmotionalState(content: string, mood: number): string {
  if (typeof mood === 'number') {
    if (mood <= 2) return 'very low';
    if (mood === 3) return 'low';
    if (mood === 4) return 'neutral';
    if (mood === 5) return 'good';
    return 'excellent';
  }

  const lc = (content || '').toLowerCase();
  if (lc.includes('sad') || lc.includes('depress') || lc.includes('hopeless')) return 'low';
  if (lc.includes('happy') || lc.includes('grateful') || lc.includes('joy')) return 'good';
  if (lc.includes('anx') || lc.includes('worri')) return 'anxious';
  return 'neutral';
}

function extractKeyThemes(content: string): string[] {
  const themes: string[] = [];
  const lc = (content || '').toLowerCase();
  if (lc.includes('work') || lc.includes('job') || lc.includes('career')) themes.push('work');
  if (lc.includes('relationship') || lc.includes('partner') || lc.includes('family')) themes.push('relationships');
  if (lc.includes('anx') || lc.includes('worry') || lc.includes('panic')) themes.push('anxiety');
  if (lc.includes('sleep') || lc.includes('insomnia')) themes.push('sleep');
  if (lc.includes('health') || lc.includes('exercise')) themes.push('health');
  return Array.from(new Set(themes)).slice(0, 6);
}

function extractConcerns(content: string): string[] {
  const concerns: string[] = [];
  const lc = (content || '').toLowerCase();
  if (lc.includes('worri') || lc.includes('concern') || lc.includes('scared')) concerns.push('worry');
  if (lc.includes('stres') || lc.includes('overwhelm')) concerns.push('stress');
  if (lc.includes('lonel') || lc.includes('isolat')) concerns.push('loneliness');
  return Array.from(new Set(concerns)).slice(0, 6);
}

function extractAchievements(content: string): string[] {
  const achievements: string[] = [];
  const lc = (content || '').toLowerCase();
  if (lc.includes('accomplish') || lc.includes('achiev') || lc.includes('completed')) achievements.push('accomplishment');
  if (lc.includes('grate') || lc.includes('thankful')) achievements.push('gratitude');
  if (lc.includes('proud') || lc.includes('success')) achievements.push('success');
  return Array.from(new Set(achievements)).slice(0, 6);
}

// Attempt to generate richer insights via Gemini (if configured). Falls back to generateFallbackInsights on any error.
async function generateAIInsights(content: string, mood: number): Promise<string[]> {
  const trimmed = (content || '').trim();
  if (!genAI) {
    return generateFallbackInsights(content, mood);
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 20000);

    // Build a concise prompt asking for short bullet insights and themes
    const prompt = `Analyze the following journal entry and return a JSON object with keys: insights (array of short bullet strings), keyThemes (array of themes). Entry:\n\n${trimmed}\n\nMood:${mood}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6 }
    });

    const response = await result.response;
    clearTimeout(id);
    const text = response.text?.() || '';

    // Try to parse as JSON first, otherwise extract simple lines
    try {
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed.insights)) return parsed.insights.slice(0, 6).map((s: any) => String(s));
      if (Array.isArray(parsed.keyThemes) && parsed.keyThemes.length > 0) return (parsed.keyThemes as any[]).map(t => String(t));
    } catch (e) {
      // Not JSON — fall through
    }

    // Fallback: split into lines and return up to 6 short lines
    const candidates = text.split(/\n+/).map(s => s.replace(/^[-•\s]+/, '').trim()).filter(Boolean);
    if (candidates.length > 0) return candidates.slice(0, 6);

    return generateFallbackInsights(content, mood);
  } catch (error) {
    logger.warn('generateAIInsights failed:', error instanceof Error ? error.message : error);
    return generateFallbackInsights(content, mood);
  }
}
