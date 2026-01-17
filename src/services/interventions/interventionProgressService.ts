import { Types } from 'mongoose';
import { InterventionProgress, IInterventionProgress } from '../../models/InterventionProgress';
import { logger } from '../../utils/logger';

/**
 * Intervention Progress Service
 * Manages user progress on interventions for personalization and time awareness
 */

export interface InterventionContext {
  interventionId: string;
  interventionType: 'sleep' | 'depression' | 'anxiety' | 'stress' | 'breakup' | 'grief' | 'focus';
  interventionName: string;
  daysSinceStart: number;
  daysSinceLastActive: number;
  hoursSinceLastActive: number;
  currentStep: number;
  totalSteps: number;
  status: 'active' | 'completed' | 'paused' | 'abandoned';
  effectivenessRating?: number;
  lastActiveAt?: Date;
  startedAt: Date;
  expectedDuration?: string;
}

/**
 * Start tracking an intervention for a user
 */
export async function startIntervention(
  userId: Types.ObjectId,
  interventionId: string,
  interventionType: 'sleep' | 'depression' | 'anxiety' | 'stress' | 'breakup' | 'grief' | 'focus',
  interventionName: string,
  totalSteps: number,
  expectedDuration?: string,
  metadata?: {
    originalContext?: string;
    relatedChatMessageId?: string;
    sessionId?: string;
  }
): Promise<IInterventionProgress> {
  try {
    // Check if user already has an active or completed instance of this intervention
    const existing = await InterventionProgress.findOne({
      userId,
      interventionId,
      status: { $in: ['active', 'completed'] },
    });

    if (existing) {
      // Update personalization attempts
      existing.personalization.attempts += 1;
      await existing.save();
      return existing;
    }

    // Create new intervention progress
    const progress = new InterventionProgress({
      userId,
      interventionId,
      interventionType,
      interventionName,
      status: 'active',
      startedAt: new Date(),
      lastActiveAt: new Date(),
      progress: {
        currentStep: 1,
        totalSteps,
        completedSteps: [],
      },
      personalization: {
        attempts: 1,
        completions: 0,
        averageEffectiveness: 0,
      },
      timeAwareness: {
        daysSinceStart: 0,
        expectedDuration,
        milestones: [],
      },
      metadata,
    });

    await progress.save();
    logger.info(`Started intervention tracking for user ${userId}: ${interventionName} (${interventionId})`);
    return progress;
  } catch (error: any) {
    logger.error(`Failed to start intervention tracking:`, error);
    throw error;
  }
}

/**
 * Update intervention progress (mark step as complete, update current step)
 */
export async function updateInterventionProgress(
  userId: Types.ObjectId,
  interventionId: string,
  stepNumber: number,
  notes?: string
): Promise<IInterventionProgress | null> {
  try {
    const progress = await InterventionProgress.findOne({
      userId,
      interventionId,
      status: 'active',
    });

    if (!progress) {
      logger.warn(`No active intervention found for user ${userId}, intervention ${interventionId}`);
      return null;
    }

    // Mark step as complete if not already completed
    if (!progress.progress.completedSteps.includes(stepNumber)) {
      progress.progress.completedSteps.push(stepNumber);
    }

    // Update current step if moving forward
    if (stepNumber >= progress.progress.currentStep) {
      progress.progress.currentStep = stepNumber + 1;
    }

    // Update notes if provided
    if (notes) {
      progress.progress.notes = notes;
    }

    // Update last active time (which triggers daysSinceStart calculation)
    progress.lastActiveAt = new Date();
    await progress.save();

    logger.debug(`Updated intervention progress for user ${userId}, step ${stepNumber}`);
    return progress;
  } catch (error: any) {
    logger.error(`Failed to update intervention progress:`, error);
    throw error;
  }
}

/**
 * Complete an intervention
 */
export async function completeIntervention(
  userId: Types.ObjectId,
  interventionId: string,
  effectivenessRating?: number
): Promise<IInterventionProgress | null> {
  try {
    const progress = await InterventionProgress.findOne({
      userId,
      interventionId,
      status: 'active',
    });

    if (!progress) {
      logger.warn(`No active intervention found for user ${userId}, intervention ${interventionId}`);
      return null;
    }

    // Mark as completed
    progress.status = 'completed';
    progress.completedAt = new Date();
    progress.lastActiveAt = new Date();

    // Update effectiveness rating if provided
    if (effectivenessRating !== undefined) {
      progress.progress.effectivenessRating = effectivenessRating;
      
      // Update average effectiveness
      const completions = progress.personalization.completions || 0;
      const currentAvg = progress.personalization.averageEffectiveness || 0;
      const newAvg = ((currentAvg * completions) + effectivenessRating) / (completions + 1);
      progress.personalization.averageEffectiveness = newAvg;
      progress.personalization.completions = (completions || 0) + 1;
    }

    await progress.save();
    logger.info(`Completed intervention for user ${userId}: ${progress.interventionName}`);

    // Effectiveness prompt will be handled by daily reminder job (checks for completed interventions 1+ days ago)
    // No need to schedule here - the job will catch it automatically

    return progress;
  } catch (error: any) {
    logger.error(`Failed to complete intervention:`, error);
    throw error;
  }
}

/**
 * Get active interventions for a user with time awareness
 * Includes last interaction time for better temporal context
 */
export async function getActiveInterventions(
  userId: Types.ObjectId
): Promise<InterventionContext[]> {
  try {
    const progressDocs = await InterventionProgress.find({
      userId,
      status: 'active',
    })
      .sort({ lastActiveAt: -1 })
      .lean();

    const now = new Date();

    return progressDocs.map(doc => {
      // Calculate days since last interaction
      const lastActiveAt = doc.lastActiveAt ? new Date(doc.lastActiveAt) : doc.startedAt;
      const daysSinceLastActive = Math.floor(
        (now.getTime() - lastActiveAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const hoursSinceLastActive = Math.floor(
        (now.getTime() - lastActiveAt.getTime()) / (1000 * 60 * 60)
      );

      return {
        interventionId: doc.interventionId,
        interventionType: doc.interventionType,
        interventionName: doc.interventionName,
        daysSinceStart: doc.timeAwareness.daysSinceStart || 0,
        daysSinceLastActive,
        hoursSinceLastActive,
        currentStep: doc.progress.currentStep || 1,
        totalSteps: doc.progress.totalSteps || 0,
        status: doc.status,
        effectivenessRating: doc.progress.effectivenessRating,
        lastActiveAt: doc.lastActiveAt,
        startedAt: doc.startedAt,
        expectedDuration: doc.timeAwareness.expectedDuration,
      };
    });
  } catch (error: any) {
    logger.error(`Failed to get active interventions:`, error);
    return [];
  }
}

/**
 * Get intervention effectiveness history for personalization
 */
export async function getInterventionEffectiveness(
  userId: Types.ObjectId,
  interventionType?: 'sleep' | 'depression' | 'anxiety' | 'stress' | 'breakup' | 'grief' | 'focus'
): Promise<Array<{
  interventionId: string;
  interventionName: string;
  attempts: number;
  completions: number;
  averageEffectiveness: number;
}>> {
  try {
    const query: any = { userId };
    if (interventionType) {
      query.interventionType = interventionType;
    }

    const progressDocs = await InterventionProgress.find(query)
      .sort({ 'personalization.averageEffectiveness': -1 })
      .lean();

    // Group by interventionId and aggregate stats
    const statsMap = new Map<string, {
      interventionId: string;
      interventionName: string;
      attempts: number;
      completions: number;
      totalEffectiveness: number;
      ratingCount: number;
    }>();

    for (const doc of progressDocs) {
      const existing = statsMap.get(doc.interventionId);
      if (existing) {
        existing.attempts += doc.personalization.attempts || 1;
        existing.completions += doc.personalization.completions || 0;
        if (doc.progress.effectivenessRating) {
          existing.totalEffectiveness += doc.progress.effectivenessRating;
          existing.ratingCount += 1;
        }
      } else {
        statsMap.set(doc.interventionId, {
          interventionId: doc.interventionId,
          interventionName: doc.interventionName,
          attempts: doc.personalization.attempts || 1,
          completions: doc.personalization.completions || 0,
          totalEffectiveness: doc.progress.effectivenessRating || 0,
          ratingCount: doc.progress.effectivenessRating ? 1 : 0,
        });
      }
    }

    return Array.from(statsMap.values()).map(stat => ({
      interventionId: stat.interventionId,
      interventionName: stat.interventionName,
      attempts: stat.attempts,
      completions: stat.completions,
      averageEffectiveness: stat.ratingCount > 0 
        ? stat.totalEffectiveness / stat.ratingCount 
        : 0,
    }));
  } catch (error: any) {
    logger.error(`Failed to get intervention effectiveness:`, error);
    return [];
  }
}

/**
 * Format intervention context for AI (time awareness)
 * Includes current time context and intervention timelines
 * Uses UTC for accuracy, but can display in user's timezone if provided
 */
export function formatInterventionContextForAI(
  activeInterventions: InterventionContext[],
  userTimezone?: string // Optional user timezone (e.g., "America/New_York", "Europe/London")
): string {
  const now = new Date(); // UTC-based Date object
  
  // Use UTC for accuracy, or user's timezone if provided
  // For timezone formatting, we'll use Intl.DateTimeFormat
  let dateFormatter: Intl.DateTimeFormat;
  let timeFormatter: Intl.DateTimeFormat;
  
  if (userTimezone) {
    try {
      // Try to use user's timezone
      dateFormatter = new Intl.DateTimeFormat('en-US', { 
        timeZone: userTimezone,
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      timeFormatter = new Intl.DateTimeFormat('en-US', { 
        timeZone: userTimezone,
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } catch (e) {
      // Fallback to UTC if timezone is invalid
      userTimezone = undefined;
    }
  }
  
  // Fallback to UTC if no timezone or invalid timezone
  if (!userTimezone) {
    dateFormatter = new Intl.DateTimeFormat('en-US', { 
      timeZone: 'UTC',
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    timeFormatter = new Intl.DateTimeFormat('en-US', { 
      timeZone: 'UTC',
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  }
  
  const currentDate = dateFormatter!.format(now);
  const currentTime = timeFormatter!.format(now);
  
  // Get hour in user's timezone (or UTC) for time-of-day classification
  // Use Intl.DateTimeFormat to get hour accurately in the specified timezone
  let hour: number;
  try {
    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone || 'UTC',
      hour: 'numeric',
      hour12: false
    });
    const hourParts = hourFormatter.formatToParts(now);
    const hourPart = hourParts.find(part => part.type === 'hour');
    hour = hourPart ? parseInt(hourPart.value, 10) : now.getUTCHours();
  } catch (e) {
    // Fallback to UTC if timezone parsing fails
    hour = now.getUTCHours();
  }
  
  const timeOfDay = hour < 6 ? 'night (late)' : 
                    hour < 12 ? 'morning' : 
                    hour < 17 ? 'afternoon' : 
                    hour < 21 ? 'evening' : 
                    'night (bedtime)';

  const timezoneNote = userTimezone ? ` (User's timezone: ${userTimezone})` : ' (UTC)';
  
  let timeContext = `
--- CURRENT TIME CONTEXT (Accurate) ---
Today is ${currentDate}${timezoneNote}
Current time: ${currentTime} (${timeOfDay})

This temporal context helps you:
- Reference the day of week when relevant (e.g., "Monday mornings can be tough")
- Consider time of day for appropriate responses (e.g., bedtime routines, morning energy)
- Use natural time references ("this week", "today", "tonight") accurately
- Adjust tone based on time (e.g., more energetic in morning, calmer at night)

IMPORTANT: All times and dates are accurate. Use them precisely in your responses.
`;

  if (activeInterventions.length === 0) {
    return timeContext;
  }

  const contexts = activeInterventions.map(int => {
    const dayText = int.daysSinceStart === 1 ? 'day' : 'days';
    const progress = int.totalSteps > 0 
      ? ` (step ${int.currentStep} of ${int.totalSteps} - ${Math.round((int.currentStep / int.totalSteps) * 100)}% complete)`
      : '';
    
    // Calculate weeks if applicable
    const weeks = Math.floor(int.daysSinceStart / 7);
    const remainingDays = int.daysSinceStart % 7;
    let timeAgo = '';
    if (weeks > 0) {
      const weekText = weeks === 1 ? 'week' : 'weeks';
      timeAgo = remainingDays > 0 
        ? `${weeks} ${weekText} and ${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} ago`
        : `${weeks} ${weekText} ago`;
    } else {
      timeAgo = `${int.daysSinceStart} ${dayText} ago`;
    }
    
    // Last interaction time
    let lastInteraction = '';
    if (int.daysSinceLastActive === 0) {
      if (int.hoursSinceLastActive < 1) {
        lastInteraction = ' (last active: just now)';
      } else if (int.hoursSinceLastActive < 24) {
        lastInteraction = ` (last active: ${int.hoursSinceLastActive} hour${int.hoursSinceLastActive === 1 ? '' : 's'} ago)`;
      }
    } else if (int.daysSinceLastActive === 1) {
      lastInteraction = ' (last active: yesterday)';
    } else if (int.daysSinceLastActive < 7) {
      lastInteraction = ` (last active: ${int.daysSinceLastActive} days ago)`;
    } else {
      const weeksSince = Math.floor(int.daysSinceLastActive / 7);
      lastInteraction = ` (last active: ${weeksSince} week${weeksSince === 1 ? '' : 's'} ago)`;
    }
    
    // Determine intervention phase
    let phase = '';
    if (int.daysSinceStart < 3) {
      phase = ' (just started - early phase)';
    } else if (int.daysSinceStart < 14) {
      phase = ' (first 2 weeks - building habits)';
    } else if (int.daysSinceStart < 30) {
      phase = ' (approaching 1 month - establishing routines)';
    } else {
      const months = Math.floor(int.daysSinceStart / 30);
      phase = ` (${months} month${months === 1 ? '' : 's'} in - long-term practice)`;
    }
    
    // Expected duration context
    let durationContext = '';
    if (int.expectedDuration) {
      durationContext = ` [Expected duration: ${int.expectedDuration}]`;
    }
    
    return `- ${int.interventionName}: Started ${timeAgo}${progress}${lastInteraction}${phase}${durationContext}`;
  });

  return `${timeContext}
--- ACTIVE INTERVENTIONS (Time Awareness) ---
The user is currently working on these interventions:
${contexts.join('\n')}

When appropriate, you can:
- Acknowledge their progress with time awareness: "I see you've been working on [intervention] for [X] days - you're [X days/weeks] into this. How's it going?"
- Provide encouragement based on duration and phase: "You're [X] days in - that's the [early/building/establishing] phase where [typical experience]"
- Adjust expectations based on timeline: "Most people start seeing results after [Y] days/weeks, so you're [ahead/on track/just beginning]"
- Reference their progress naturally: "Since you started [intervention] [X days/weeks] ago, what's changed?"
- Use time-aware language: "How has [intervention] been feeling [this week/today/recently]?"

IMPORTANT: Be time-aware in your responses:
- If it's Monday morning, acknowledge the week ahead
- If it's late night, be mindful of sleep/preparation
- If it's been several weeks on an intervention, check for progress/plateaus
- Reference the actual day/time when it's natural and helpful

Use this context naturally - don't force it into every response.
`;
}
