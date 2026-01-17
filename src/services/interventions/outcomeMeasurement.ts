import { Types } from 'mongoose';
import { InterventionProgress } from '../../models/InterventionProgress';
import { Mood } from '../../models/Mood';
import { logger } from '../../utils/logger';

/**
 * Outcome Measurement Service
 * Tracks mood and other outcomes before/after interventions
 */

export interface OutcomeMeasurement {
  interventionId: string;
  interventionName: string;
  interventionType: string;
  moodBefore: number | null; // Average mood before intervention
  moodAfter: number | null; // Average mood after intervention
  moodImprovement: number | null; // After - Before
  moodImprovementPercentage: number | null; // ((After - Before) / Before) * 100
  daysSinceStart: number;
  daysSinceCompletion: number | null;
}

/**
 * Get mood baseline before intervention started
 */
async function getMoodBefore(
  userId: Types.ObjectId,
  startedAt: Date,
  daysToLookBack: number = 7
): Promise<number | null> {
  try {
    const beforeDate = new Date(startedAt);
    beforeDate.setDate(beforeDate.getDate() - daysToLookBack);

    const moods = await Mood.find({
      userId,
      timestamp: { $gte: beforeDate, $lt: startedAt },
    })
      .sort({ timestamp: -1 })
      .lean();

    if (moods.length === 0) {
      return null;
    }

    // Convert score (0-100) to 1-10 scale for consistency
    const moodValues = moods.map(m => (m.score || 50) / 10);
    const avgMood = moodValues.reduce((a, b) => a + b, 0) / moodValues.length;
    return avgMood;
  } catch (error: any) {
    logger.warn(`Failed to get mood before:`, error.message);
    return null;
  }
}

/**
 * Get mood after intervention (since start, or after completion)
 */
async function getMoodAfter(
  userId: Types.ObjectId,
  startedAt: Date,
  completedAt?: Date | null,
  daysToLookForward: number = 7
): Promise<number | null> {
  try {
    const afterStartDate = startedAt;
    const afterEndDate = completedAt 
      ? new Date(completedAt.getTime() + daysToLookForward * 24 * 60 * 60 * 1000)
      : new Date(); // If not completed, use now

    const moods = await Mood.find({
      userId,
      timestamp: { $gte: afterStartDate, $lte: afterEndDate },
    })
      .sort({ timestamp: -1 })
      .lean();

    if (moods.length === 0) {
      return null;
    }

    // Convert score (0-100) to 1-10 scale
    const moodValues = moods.map(m => (m.score || 50) / 10);
    const avgMood = moodValues.reduce((a, b) => a + b, 0) / moodValues.length;
    return avgMood;
  } catch (error: any) {
    logger.warn(`Failed to get mood after:`, error.message);
    return null;
  }
}

/**
 * Measure intervention outcomes (mood before/after)
 */
export async function measureInterventionOutcome(
  userId: Types.ObjectId,
  interventionId: string
): Promise<OutcomeMeasurement | null> {
  try {
    const progress = await InterventionProgress.findOne({
      userId,
      interventionId,
    })
      .sort({ startedAt: -1 })
      .lean() as any;

    if (!progress || Array.isArray(progress)) {
      return null;
    }

    const startedAt = new Date(progress.startedAt);
    const completedAt = progress.completedAt ? new Date(progress.completedAt) : null;

    // Get mood before (7 days before start)
    const moodBefore = await getMoodBefore(userId, startedAt, 7);

    // Get mood after (since start, or 7 days after completion)
    const moodAfter = await getMoodAfter(userId, startedAt, completedAt, 7);

    // Calculate improvement
    let moodImprovement: number | null = null;
    let moodImprovementPercentage: number | null = null;

    if (moodBefore !== null && moodAfter !== null) {
      moodImprovement = moodAfter - moodBefore;
      if (moodBefore > 0) {
        moodImprovementPercentage = (moodImprovement / moodBefore) * 100;
      }
    }

    const now = new Date();
    const daysSinceStart = Math.floor((now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceCompletion = completedAt 
      ? Math.floor((now.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      interventionId: progress.interventionId as string,
      interventionName: progress.interventionName as string,
      interventionType: progress.interventionType as string,
      moodBefore,
      moodAfter,
      moodImprovement,
      moodImprovementPercentage,
      daysSinceStart,
      daysSinceCompletion,
    };
  } catch (error: any) {
    logger.error(`Failed to measure intervention outcome:`, error);
    return null;
  }
}

/**
 * Get all intervention outcomes for a user
 */
export async function getUserInterventionOutcomes(
  userId: Types.ObjectId,
  interventionType?: string
): Promise<OutcomeMeasurement[]> {
  try {
    const query: any = { userId };
    if (interventionType) {
      query.interventionType = interventionType;
    }

    const interventions = await InterventionProgress.find(query)
      .sort({ startedAt: -1 })
      .lean();

    const outcomes: OutcomeMeasurement[] = [];

    for (const intervention of interventions) {
      const outcome = await measureInterventionOutcome(userId, intervention.interventionId);
      if (outcome) {
        outcomes.push(outcome);
      }
    }

    return outcomes;
  } catch (error: any) {
    logger.error(`Failed to get user intervention outcomes:`, error);
    return [];
  }
}

/**
 * Format outcome message for user (friendly, encouraging)
 */
export function formatOutcomeMessage(outcome: OutcomeMeasurement): string {
  if (outcome.moodBefore === null || outcome.moodAfter === null) {
    return `You've been working on "${outcome.interventionName}" for ${outcome.daysSinceStart} days. Keep it up!`;
  }

  if (outcome.moodImprovement === null) {
    return `Your mood before "${outcome.interventionName}" was ${outcome.moodBefore.toFixed(1)}/10.`;
  }

  const improvement = outcome.moodImprovement;
  const improvementPercent = outcome.moodImprovementPercentage || 0;

  if (improvement > 0.5) {
    // Significant improvement
    return `Great progress! Your mood improved from ${outcome.moodBefore.toFixed(1)}/10 to ${outcome.moodAfter.toFixed(1)}/10 (+${improvement.toFixed(1)}, ${improvementPercent.toFixed(0)}% improvement) after completing "${outcome.interventionName}". This intervention is working well for you!`;
  } else if (improvement > 0) {
    // Small improvement
    return `Good news! Your mood improved from ${outcome.moodBefore.toFixed(1)}/10 to ${outcome.moodAfter.toFixed(1)}/10 after "${outcome.interventionName}". Keep practicing!`;
  } else if (improvement > -0.5) {
    // Stable
    return `Your mood has been stable (${outcome.moodBefore.toFixed(1)}/10 → ${outcome.moodAfter.toFixed(1)}/10) while working on "${outcome.interventionName}". Sometimes stability is progress - keep going!`;
  } else {
    // Declined (be gentle)
    return `You've been working on "${outcome.interventionName}" for ${outcome.daysSinceStart} days. Sometimes it takes time to see results. Would you like to try a different approach or get additional support?`;
  }
}
