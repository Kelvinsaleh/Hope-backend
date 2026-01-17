import { Types } from 'mongoose';
import { LongTermMemoryModel } from '../../models/LongTermMemory';
import { JournalEntry } from '../../models/JournalEntry';
import { Mood } from '../../models/Mood';
import { InterventionProgress } from '../../models/InterventionProgress';
import { Session } from '../../models/Session';
import { logger } from '../../utils/logger';

/**
 * Pattern Analysis Service
 * Analyzes user behavior patterns to help AI understand and empathize with users
 */

export interface UserPattern {
  type: 'emotional' | 'behavioral' | 'temporal' | 'trigger' | 'coping' | 'communication';
  pattern: string; // Human-readable description
  confidence: number; // 0-1
  evidence: string[]; // Examples that support this pattern
  insight?: string; // What this pattern might mean
  frequency?: string; // How often this pattern occurs
}

export interface PatternContext {
  emotionalPatterns: UserPattern[];
  behavioralPatterns: UserPattern[];
  temporalPatterns: UserPattern[];
  triggerPatterns: UserPattern[];
  copingPatterns: UserPattern[];
  communicationPatterns: UserPattern[];
  topPatterns: UserPattern[]; // Top 3-5 most relevant patterns
}

/**
 * Analyze user patterns from various data sources
 */
export async function analyzeUserPatterns(userId: Types.ObjectId): Promise<PatternContext> {
  try {
    const patterns: PatternContext = {
      emotionalPatterns: [],
      behavioralPatterns: [],
      temporalPatterns: [],
      triggerPatterns: [],
      copingPatterns: [],
      communicationPatterns: [],
      topPatterns: [],
    };

    // Analyze mood patterns (last 30 days)
    const moodPatterns = await analyzeMoodPatterns(userId);
    patterns.emotionalPatterns.push(...moodPatterns);

    // Analyze journal patterns
    const journalPatterns = await analyzeJournalPatterns(userId);
    patterns.behavioralPatterns.push(...journalPatterns.emotional);
    patterns.temporalPatterns.push(...journalPatterns.temporal);
    patterns.triggerPatterns.push(...journalPatterns.triggers);

    // Analyze intervention patterns
    const interventionPatterns = await analyzeInterventionPatterns(userId);
    patterns.behavioralPatterns.push(...interventionPatterns);
    patterns.copingPatterns.push(...interventionPatterns.filter(p => p.type === 'coping'));

    // Analyze chat/communication patterns
    const chatPatterns = await analyzeChatPatterns(userId);
    patterns.communicationPatterns.push(...chatPatterns);

    // Analyze memory patterns (long-term memory)
    const memoryPatterns = await analyzeMemoryPatterns(userId);
    patterns.emotionalPatterns.push(...memoryPatterns.emotional);
    patterns.triggerPatterns.push(...memoryPatterns.triggers);
    patterns.copingPatterns.push(...memoryPatterns.coping);

    // Select top patterns (highest confidence, most relevant)
    const allPatterns = [
      ...patterns.emotionalPatterns,
      ...patterns.behavioralPatterns,
      ...patterns.temporalPatterns,
      ...patterns.triggerPatterns,
      ...patterns.copingPatterns,
      ...patterns.communicationPatterns,
    ];

    patterns.topPatterns = allPatterns
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    return patterns;
  } catch (error: any) {
    logger.error(`Failed to analyze user patterns for ${userId}:`, error);
    return {
      emotionalPatterns: [],
      behavioralPatterns: [],
      temporalPatterns: [],
      triggerPatterns: [],
      copingPatterns: [],
      communicationPatterns: [],
      topPatterns: [],
    };
  }
}

/**
 * Analyze mood patterns
 */
async function analyzeMoodPatterns(userId: Types.ObjectId): Promise<UserPattern[]> {
  const patterns: UserPattern[] = [];
  
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const moods = await MoodEntry.find({
      userId,
      createdAt: { $gte: thirtyDaysAgo },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (moods.length < 5) {
      return patterns; // Not enough data
    }

    // Mood.score is 0-100, convert to 1-10 scale for consistency
    const moodValues = moods.map(m => (m.score || 50) / 10);
    const avgMood = moodValues.reduce((a, b) => a + b, 0) / moodValues.length;
    const moodRange = Math.max(...moodValues) - Math.min(...moodValues);

    // Pattern: Consistently low mood
    if (avgMood < 4 && moods.length >= 10) {
      patterns.push({
        type: 'emotional',
        pattern: 'Tends to experience low mood (average: ' + avgMood.toFixed(1) + '/10)',
        confidence: 0.8,
        evidence: [`${moods.length} mood entries over the past month with average of ${avgMood.toFixed(1)}`],
        insight: 'May be experiencing ongoing emotional difficulties',
        frequency: 'Consistent pattern',
      });
    }

    // Pattern: High mood variability
    if (moodRange > 5 && moods.length >= 10) {
      patterns.push({
        type: 'emotional',
        pattern: 'Mood fluctuates significantly (range: ' + moodRange + ' points)',
        confidence: 0.75,
        evidence: [`Mood swings between ${Math.min(...moodValues)} and ${Math.max(...moodValues)}`],
        insight: 'May benefit from stability-focused interventions or mood regulation techniques',
        frequency: 'Frequent fluctuations',
      });
    }

    // Pattern: Morning vs evening mood
    const morningMoods = moods.filter(m => {
      const hour = new Date(m.createdAt || m.timestamp).getHours();
      return hour >= 6 && hour < 12;
    }).map(m => (m.score || 50) / 10);
    const eveningMoods = moods.filter(m => {
      const hour = new Date(m.createdAt || m.timestamp).getHours();
      return hour >= 18 || hour < 6;
    }).map(m => (m.score || 50) / 10);

    if (morningMoods.length >= 3 && eveningMoods.length >= 3) {
      const morningAvg = morningMoods.reduce((a, b) => a + b, 0) / morningMoods.length;
      const eveningAvg = eveningMoods.reduce((a, b) => a + b, 0) / eveningMoods.length;
      const diff = Math.abs(morningAvg - eveningAvg);

      if (diff > 2) {
        const betterTime = morningAvg > eveningAvg ? 'mornings' : 'evenings';
        patterns.push({
          type: 'temporal',
          pattern: `Mood tends to be better in ${betterTime}`,
          confidence: 0.7,
          evidence: [
            `Morning mood: ${morningAvg.toFixed(1)}/10`,
            `Evening mood: ${eveningAvg.toFixed(1)}/10`,
          ],
          insight: `May want to schedule important activities during ${betterTime}`,
          frequency: 'Consistent pattern',
        });
      }
    }

    // Pattern: Day of week patterns
    const dayMoods = new Map<string, number[]>();
    moods.forEach(m => {
      const day = new Date(m.createdAt || m.timestamp).toLocaleDateString('en-US', { weekday: 'long' });
      if (!dayMoods.has(day)) dayMoods.set(day, []);
      dayMoods.get(day)!.push((m.score || 50) / 10);
    });

    for (const [day, values] of dayMoods.entries()) {
      if (values.length >= 3) {
        const dayAvg = values.reduce((a, b) => a + b, 0) / values.length;
        if (dayAvg < 4 && Math.abs(dayAvg - avgMood) > 1.5) {
          patterns.push({
            type: 'temporal',
            pattern: `Mood tends to be lower on ${day}s`,
            confidence: 0.65,
            evidence: [`Average mood on ${day}s: ${dayAvg.toFixed(1)}/10`],
            insight: `May want to plan self-care or support activities for ${day}s`,
            frequency: `Weekly pattern (${day})`,
          });
        }
      }
    }
  } catch (error: any) {
    logger.warn(`Failed to analyze mood patterns:`, error.message);
  }

  return patterns;
}

/**
 * Analyze journal entry patterns
 */
async function analyzeJournalPatterns(userId: Types.ObjectId): Promise<{
  emotional: UserPattern[];
  temporal: UserPattern[];
  triggers: UserPattern[];
}> {
  const emotional: UserPattern[] = [];
  const temporal: UserPattern[] = [];
  const triggers: UserPattern[] = [];

  try {
    const journals = await JournalEntry.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    if (journals.length < 5) {
      return { emotional, temporal, triggers };
    }

    // Analyze emotional themes
    const emotionalKeywords = {
      anxiety: ['anxious', 'worried', 'nervous', 'panic', 'stress'],
      sadness: ['sad', 'depressed', 'down', 'hopeless', 'empty'],
      anger: ['angry', 'frustrated', 'irritated', 'mad', 'annoyed'],
      fear: ['afraid', 'scared', 'fear', 'worried', 'nervous'],
    };

    const themeCounts = new Map<string, number>();
    journals.forEach(journal => {
      const content = (journal.content || '').toLowerCase();
      for (const [theme, keywords] of Object.entries(emotionalKeywords)) {
        if (keywords.some(kw => content.includes(kw))) {
          themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
        }
      }
    });

    for (const [theme, count] of themeCounts.entries()) {
      const percentage = (count / journals.length) * 100;
      if (percentage > 40) {
        emotional.push({
          type: 'emotional',
          pattern: `Frequently writes about ${theme} (${Math.round(percentage)}% of entries)`,
          confidence: 0.75,
          evidence: [`${count} out of ${journals.length} journal entries mention ${theme}`],
          insight: `May benefit from interventions specifically addressing ${theme}`,
          frequency: 'Recurring theme',
        });
      }
    }

    // Analyze temporal patterns (when they journal)
    const hourCounts = new Map<number, number>();
    journals.forEach(journal => {
      const hour = new Date(journal.createdAt).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    const mostCommonHour = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];

    if (mostCommonHour && mostCommonHour[1] >= 3) {
      const hourLabel = mostCommonHour[0] >= 18 ? 'evening' : 
                        mostCommonHour[0] >= 12 ? 'afternoon' : 'morning';
      temporal.push({
        type: 'temporal',
        pattern: `Tends to journal most often in the ${hourLabel}`,
        confidence: 0.7,
        evidence: [`Most journal entries at ${mostCommonHour[0]}:00 (${mostCommonHour[1]} entries)`],
        insight: `May find it easier to engage in reflection during ${hourLabel}`,
        frequency: 'Consistent pattern',
      });
    }

    // Analyze triggers (common themes that appear with low mood)
    // This would require more sophisticated analysis, but basic version:
    const lowMoodJournals = journals.filter(j => {
      const content = (j.content || '').toLowerCase();
      return ['sad', 'depressed', 'down', 'hopeless', 'empty', 'anxious', 'worried'].some(kw => 
        content.includes(kw)
      );
    });

    if (lowMoodJournals.length >= 3) {
      // Look for common words/patterns in low mood journals
      const allWords = lowMoodJournals
        .map(j => (j.content || '').toLowerCase().split(/\s+/))
        .flat()
        .filter(w => w.length > 4); // Words longer than 4 chars
      
      const wordFreq = new Map<string, number>();
      allWords.forEach(word => {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      });

      // Find words that appear frequently (potential triggers)
      for (const [word, count] of wordFreq.entries()) {
        if (count >= 3 && word.length > 4) {
          triggers.push({
            type: 'trigger',
            pattern: `"${word}" appears frequently in low-mood journal entries`,
            confidence: 0.6,
            evidence: [`Appears ${count} times in ${lowMoodJournals.length} low-mood entries`],
            insight: `This may be a trigger or stressor worth exploring`,
            frequency: 'Recurring pattern',
          });
          if (triggers.length >= 3) break; // Limit to top 3
        }
      }
    }
  } catch (error: any) {
    logger.warn(`Failed to analyze journal patterns:`, error.message);
  }

  return { emotional, temporal, triggers };
}

/**
 * Analyze intervention usage patterns
 */
async function analyzeInterventionPatterns(userId: Types.ObjectId): Promise<UserPattern[]> {
  const patterns: UserPattern[] = [];

  try {
    const interventions = await InterventionProgress.find({ userId })
      .sort({ lastActiveAt: -1 })
      .lean();

    if (interventions.length < 2) {
      return patterns;
    }

    // Pattern: Preference for certain intervention types
    const typeCounts = new Map<string, number>();
    interventions.forEach(int => {
      typeCounts.set(int.interventionType, (typeCounts.get(int.interventionType) || 0) + 1);
    });

    const mostCommonType = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])[0];

    if (mostCommonType && mostCommonType[1] >= 2) {
      patterns.push({
        type: 'coping',
        pattern: `Tends to prefer ${mostCommonType[0]}-focused interventions`,
        confidence: 0.7,
        evidence: [`${mostCommonType[1]} out of ${interventions.length} interventions are ${mostCommonType[0]}-focused`],
        insight: `May find ${mostCommonType[0]} interventions most helpful`,
        frequency: 'Consistent preference',
      });
    }

    // Pattern: Completion rates
    const completed = interventions.filter(i => i.status === 'completed').length;
    const completionRate = (completed / interventions.length) * 100;

    if (completionRate < 30 && interventions.length >= 3) {
      patterns.push({
        type: 'behavioral',
        pattern: 'Struggles to complete interventions (low completion rate)',
        confidence: 0.65,
        evidence: [`Only ${Math.round(completionRate)}% completion rate (${completed}/${interventions.length})`],
        insight: 'May benefit from shorter interventions or more support/accountability',
        frequency: 'Recurring pattern',
      });
    } else if (completionRate > 70 && interventions.length >= 3) {
      patterns.push({
        type: 'behavioral',
        pattern: 'High completion rate on interventions',
        confidence: 0.7,
        evidence: [`${Math.round(completionRate)}% completion rate (${completed}/${interventions.length})`],
        insight: 'Shows commitment and follows through well - may benefit from more challenging interventions',
        frequency: 'Consistent pattern',
      });
    }

    // Pattern: Most effective interventions
    const effectiveInterventions = interventions
      .filter(i => i.progress.effectivenessRating && i.progress.effectivenessRating >= 7)
      .sort((a, b) => (b.progress.effectivenessRating || 0) - (a.progress.effectivenessRating || 0))
      .slice(0, 3);

    if (effectiveInterventions.length >= 2) {
      patterns.push({
        type: 'coping',
        pattern: `Responds well to interventions with average rating of ${(effectiveInterventions.reduce((sum, i) => sum + (i.progress.effectivenessRating || 0), 0) / effectiveInterventions.length).toFixed(1)}/10`,
        confidence: 0.8,
        evidence: effectiveInterventions.map(i => `${i.interventionName}: ${i.progress.effectivenessRating}/10`),
        insight: 'These types of interventions work well - consider suggesting similar ones',
        frequency: 'Consistent effectiveness',
      });
    }
  } catch (error: any) {
    logger.warn(`Failed to analyze intervention patterns:`, error.message);
  }

  return patterns;
}

/**
 * Analyze chat/communication patterns
 */
async function analyzeChatPatterns(userId: Types.ObjectId): Promise<UserPattern[]> {
  const patterns: UserPattern[] = [];

  try {
    const sessions = await ChatSession.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    if (sessions.length < 5) {
      return patterns;
    }

    // Pattern: Message length
    const messageLengths = sessions
      .flatMap(s => s.messages || [])
      .filter(m => m.role === 'user')
      .map(m => (m.content || '').length);

    if (messageLengths.length >= 10) {
      const avgLength = messageLengths.reduce((a, b) => a + b, 0) / messageLengths.length;
      
      if (avgLength < 50) {
        patterns.push({
          type: 'communication',
          pattern: 'Tends to send brief messages',
          confidence: 0.7,
          evidence: [`Average message length: ${Math.round(avgLength)} characters`],
          insight: 'May prefer concise responses or might be struggling to express themselves',
          frequency: 'Consistent pattern',
        });
      } else if (avgLength > 300) {
        patterns.push({
          type: 'communication',
          pattern: 'Tends to send detailed, longer messages',
          confidence: 0.7,
          evidence: [`Average message length: ${Math.round(avgLength)} characters`],
          insight: 'Values thorough communication and detail - may benefit from detailed responses',
          frequency: 'Consistent pattern',
        });
      }
    }

    // Pattern: Communication frequency
    const recentSessions = sessions.filter(s => {
      const daysAgo = (Date.now() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 14;
    });

    if (recentSessions.length >= 10) {
      patterns.push({
        type: 'behavioral',
        pattern: 'Very engaged with chat (frequent sessions)',
        confidence: 0.75,
        evidence: [`${recentSessions.length} sessions in the past 2 weeks`],
        insight: 'Highly engaged - chat is an important support tool',
        frequency: 'High engagement',
      });
    }
  } catch (error: any) {
    logger.warn(`Failed to analyze chat patterns:`, error.message);
  }

  return patterns;
}

/**
 * Analyze long-term memory patterns
 */
async function analyzeMemoryPatterns(userId: Types.ObjectId): Promise<{
  emotional: UserPattern[];
  triggers: UserPattern[];
  coping: UserPattern[];
}> {
  const emotional: UserPattern[] = [];
  const triggers: UserPattern[] = [];
  const coping: UserPattern[] = [];

  try {
    const memories = await LongTermMemoryModel.find({ userId })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    if (memories.length < 5) {
      return { emotional, triggers, coping };
    }

    // Analyze by type
    const emotionalMemories = memories.filter(m => m.type === 'emotional_theme');
    const triggerMemories = memories.filter(m => m.type === 'trigger');
    const copingMemories = memories.filter(m => m.type === 'coping_pattern');

    if (emotionalMemories.length >= 3) {
      const themes = emotionalMemories.map(m => m.content).join(' ').toLowerCase();
      emotional.push({
        type: 'emotional',
        pattern: 'Has recurring emotional themes in long-term memory',
        confidence: 0.7,
        evidence: [`${emotionalMemories.length} emotional themes stored`],
        insight: 'These themes are important to the user - acknowledge them',
        frequency: 'Recurring themes',
      });
    }

    if (triggerMemories.length >= 2) {
      triggers.push({
        type: 'trigger',
        pattern: `Has ${triggerMemories.length} identified triggers stored`,
        confidence: 0.75,
        evidence: triggerMemories.slice(0, 3).map(m => m.content),
        insight: 'These triggers are known to the user - help them navigate them',
        frequency: 'Identified patterns',
      });
    }

    if (copingMemories.length >= 2) {
      coping.push({
        type: 'coping',
        pattern: `Uses specific coping strategies (${copingMemories.length} identified)`,
        confidence: 0.7,
        evidence: copingMemories.slice(0, 3).map(m => m.content),
        insight: 'These coping strategies work for the user - reference them when helpful',
        frequency: 'Effective strategies',
      });
    }
  } catch (error: any) {
    logger.warn(`Failed to analyze memory patterns:`, error.message);
  }

  return { emotional, triggers, coping };
}

/**
 * Format patterns for AI context (empathetic, understanding tone)
 */
export function formatPatternsForAI(patternContext: PatternContext): string {
  if (patternContext.topPatterns.length === 0) {
    return '';
  }

  const patternTexts = patternContext.topPatterns.map(pattern => {
    return `- ${pattern.pattern}${pattern.insight ? ` (${pattern.insight})` : ''}`;
  });

  return `

--- USER PATTERNS (Understanding & Empathy) ---
To help the user feel understood, acknowledge these patterns when relevant:

${patternTexts.join('\n')}

When using these patterns:
1. Be empathetic: "I've noticed you tend to..." (not clinical or judgmental)
2. Validate their experience: "That makes sense given..." or "I can see why..."
3. Reference patterns naturally: "Like you mentioned before..." or "Similar to when..."
4. Use patterns to personalize: "Since you find [X] helpful, you might also benefit from..."
5. Don't overuse - only mention when relevant to the conversation
6. Make them feel heard: "It sounds like..." or "I understand that..."

Remember: The goal is to make the user feel truly understood, not to analyze or diagnose them.
`;
}
