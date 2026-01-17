import { Types } from 'mongoose';
import { InterventionProgress } from '../../models/InterventionProgress';
import { LongTermMemoryModel } from '../../models/LongTermMemory';
import { ChatSession } from '../../models/ChatSession';
import { logger } from '../../utils/logger';

/**
 * Intervention Gating Service
 * Determines if intervention suggestions are appropriate based on context
 * Prevents over-suggesting and ensures suggestions are contextually relevant
 */

export interface GatingCriteria {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | 'bedtime';
  mentionSeriousness: 'casual' | 'serious' | 'explicit';
  recentSuggestions: boolean; // Has intervention been suggested recently?
  userEngagement: 'low' | 'medium' | 'high'; // How engaged is user with app?
}

export interface GatingResult {
  shouldSuggest: boolean;
  reason: string;
  passedCriteria: number;
  totalCriteria: number;
  context: {
    timeOfDay?: string;
    mentionSeriousness?: string;
    recentSuggestions?: string;
    userEngagement?: string;
  };
}

/**
 * Check if time of day is appropriate for intervention type
 * All intervention types have gating logic applied
 */
function isTimeAppropriate(
  interventionType: 'sleep' | 'depression' | 'anxiety' | 'stress' | 'breakup' | 'grief' | 'focus',
  currentHour: number
): { isAppropriate: boolean; timeOfDay: string } {
  const hour = currentHour;
  
  // Define appropriate times for each intervention type (all types have rules)
  const timeRules: Record<string, { min?: number; max?: number; name: string; bonusHours?: number[] }> = {
    sleep: { min: 18, name: 'evening/night', bonusHours: [20, 21, 22, 23, 0, 1] }, // After 6 PM, bonus at bedtime (8 PM - 1 AM)
    depression: { name: 'any time' }, // No time restriction (but still checked)
    anxiety: { name: 'any time' }, // Can happen anytime (but still checked)
    stress: { name: 'any time' }, // Can happen anytime (but still checked)
    breakup: { name: 'any time' }, // Can happen anytime (but still checked)
    grief: { name: 'any time' }, // Can happen anytime (but still checked)
    focus: { min: 6, max: 22, name: 'daytime' }, // 6 AM - 10 PM (work hours)
  };

  const rule = timeRules[interventionType];
  if (!rule) {
    return { isAppropriate: true, timeOfDay: 'any time' };
  }

  // Sleep: should be evening/night (after 6 PM or before 2 AM), bonus at bedtime
  if (interventionType === 'sleep') {
    const isEvening = hour >= 18 || hour < 2;
    const isBedtime = rule.bonusHours?.includes(hour) ?? false;
    return {
      isAppropriate: isEvening, // Always pass if evening/night
      timeOfDay: isBedtime ? 'bedtime (ideal)' : isEvening ? 'evening/night (appropriate)' : 'daytime (not ideal for sleep)',
    };
  }

  // Focus: should be daytime (6 AM - 10 PM) when people are typically working/studying
  if (interventionType === 'focus') {
    const isDaytime = hour >= 6 && hour < 22;
    return {
      isAppropriate: isDaytime,
      timeOfDay: isDaytime ? 'daytime (appropriate for focus)' : 'night (not ideal for focus)',
    };
  }

  // For other types (depression, anxiety, stress, breakup, grief):
  // No time restriction, but we still check it as part of the 3 criteria
  // They always pass time check, but need to pass at least 2 of 3 criteria total
  return { isAppropriate: true, timeOfDay: 'any time (no restriction)' };
}

/**
 * Determine seriousness of mention (casual vs serious)
 */
function assessMentionSeriousness(
  message: string,
  recentMessages: Array<{ role: string; content: string }>,
  interventionType: string
): { seriousness: 'casual' | 'serious' | 'explicit'; confidence: number } {
  const text = message.toLowerCase();
  const allText = [message, ...recentMessages.map(m => m.content || '')].join(' ').toLowerCase();

  // Explicit mentions (high seriousness)
  const explicitSignals: Record<string, string[]> = {
    sleep: ['can\'t sleep', 'insomnia', 'trouble sleeping', 'can\'t fall asleep', 'wake up', 'sleeping'],
    depression: ['depressed', 'depression', 'hopeless', 'can\'t get out of bed', 'nothing matters'],
    anxiety: ['anxious', 'anxiety', 'panic', 'panic attack', 'can\'t calm down', 'worried'],
    stress: ['stressed', 'overwhelmed', 'burnout', 'can\'t handle', 'too much'],
    breakup: ['broke up', 'breakup', 'ex', 'relationship ended', 'we split'],
    grief: ['died', 'death', 'passed away', 'lost', 'grief', 'funeral'],
    focus: ['can\'t focus', 'distracted', 'procrastinate', 'can\'t concentrate'],
  };

  const explicit = explicitSignals[interventionType] || [];
  const hasExplicit = explicit.some(signal => text.includes(signal) || allText.includes(signal));

  if (hasExplicit) {
    return { seriousness: 'explicit', confidence: 0.9 };
  }

  // Serious mentions (moderate seriousness)
  const seriousSignals: Record<string, string[]> = {
    sleep: ['sleep', 'tired', 'exhausted', 'bedtime', 'sleepy'],
    depression: ['sad', 'down', 'low', 'empty', 'numb'],
    anxiety: ['nervous', 'worried', 'scared', 'on edge'],
    stress: ['pressure', 'deadline', 'workload', 'busy'],
    breakup: ['relationship', 'dating', 'single'],
    grief: ['loss', 'mourning', 'miss'],
    focus: ['hard to focus', 'losing focus', 'distraction'],
  };

  const serious = seriousSignals[interventionType] || [];
  const seriousCount = serious.filter(signal => text.includes(signal) || allText.includes(signal)).length;

  if (seriousCount >= 2 || (seriousCount === 1 && message.length > 50)) {
    return { seriousness: 'serious', confidence: 0.7 };
  }

  // Casual mentions (low seriousness)
  return { seriousness: 'casual', confidence: 0.4 };
}

/**
 * Check if intervention was recently suggested (within last 7 days)
 */
async function checkRecentSuggestions(
  userId: Types.ObjectId,
  interventionType: string
): Promise<{ recent: boolean; lastSuggested?: Date; daysAgo?: number }> {
  try {
    // Check intervention progress - if user started an intervention recently, don't suggest again
    const recentProgress = await InterventionProgress.findOne({
      userId,
      interventionType,
      status: { $in: ['active', 'completed'] },
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    })
      .sort({ createdAt: -1 })
      .lean();

    if (recentProgress) {
      const daysAgo = Math.floor(
        (Date.now() - new Date(recentProgress.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return { recent: true, lastSuggested: recentProgress.createdAt, daysAgo };
    }

    // Check memory for recent intervention mentions
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentMemory = await LongTermMemoryModel.findOne({
      userId,
      type: 'insight',
      content: { $regex: new RegExp(interventionType, 'i') },
      timestamp: { $gte: sevenDaysAgo },
    })
      .sort({ timestamp: -1 })
      .lean();

    if (recentMemory) {
      const daysAgo = Math.floor(
        (Date.now() - new Date(recentMemory.timestamp).getTime()) / (1000 * 60 * 60 * 24)
      );
      return { recent: true, lastSuggested: recentMemory.timestamp, daysAgo };
    }

    return { recent: false };
  } catch (error: any) {
    logger.warn(`Failed to check recent suggestions:`, error.message);
    return { recent: false };
  }
}

/**
 * Assess user engagement level
 */
async function assessUserEngagement(userId: Types.ObjectId): Promise<{
  engagement: 'low' | 'medium' | 'high';
  score: number;
}> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Count recent chat sessions
    const recentSessions = await ChatSession.countDocuments({
      userId,
      createdAt: { $gte: sevenDaysAgo },
    });

    // Count active interventions
    const activeInterventions = await InterventionProgress.countDocuments({
      userId,
      status: 'active',
    });

    // Calculate engagement score
    let score = 0;
    if (recentSessions >= 7) score += 3; // Very active
    else if (recentSessions >= 3) score += 2; // Moderately active
    else if (recentSessions >= 1) score += 1; // Some activity

    if (activeInterventions >= 2) score += 2; // Multiple active interventions
    else if (activeInterventions === 1) score += 1; // One active intervention

    // High: 4-5, Medium: 2-3, Low: 0-1
    if (score >= 4) {
      return { engagement: 'high', score };
    } else if (score >= 2) {
      return { engagement: 'medium', score };
    } else {
      return { engagement: 'low', score };
    }
  } catch (error: any) {
    logger.warn(`Failed to assess user engagement:`, error.message);
    return { engagement: 'medium', score: 2 }; // Default to medium
  }
}

/**
 * Main gating function - determines if intervention should be suggested
 * Requires at least 2 out of 3 criteria to pass (time, seriousness, recent suggestions)
 */
export async function shouldSuggestIntervention(
  userId: Types.ObjectId,
  interventionType: 'sleep' | 'depression' | 'anxiety' | 'stress' | 'breakup' | 'grief' | 'focus',
  message: string,
  recentMessages: Array<{ role: string; content: string }>
): Promise<GatingResult> {
  try {
    const currentHour = new Date().getHours();
    const currentTime = new Date();

    // Criteria 1: Time of day appropriateness
    const timeCheck = isTimeAppropriate(interventionType, currentHour);
    const timePasses = timeCheck.isAppropriate;

    // Criteria 2: Mention seriousness
    const seriousnessCheck = assessMentionSeriousness(message, recentMessages, interventionType);
    const seriousnessPasses = seriousnessCheck.seriousness !== 'casual'; // Serious or explicit = pass

    // Criteria 3: Recent suggestions
    const recentCheck = await checkRecentSuggestions(userId, interventionType);
    const recentPasses = !recentCheck.recent; // No recent suggestions = pass

    // User engagement (for context, but not a hard gate)
    const engagementCheck = await assessUserEngagement(userId);

    // Count passed criteria
    const passedCriteria = [timePasses, seriousnessPasses, recentPasses].filter(Boolean).length;
    const totalCriteria = 3;
    const minimumRequired = 2; // At least 2 must pass

    const shouldSuggest = passedCriteria >= minimumRequired;

    // Build reason message
    const reasons: string[] = [];
    if (!timePasses) reasons.push(`Not ideal time (${timeCheck.timeOfDay})`);
    if (!seriousnessPasses) reasons.push(`Casual mention (not serious)`);
    if (!recentPasses) reasons.push(`Recently suggested (${recentCheck.daysAgo} days ago)`);

    const reason = shouldSuggest
      ? `Gating passed: ${passedCriteria}/${totalCriteria} criteria met`
      : `Gating failed: ${reasons.join(', ')}. Need ${minimumRequired} criteria to pass.`;

    return {
      shouldSuggest,
      reason,
      passedCriteria,
      totalCriteria,
      context: {
        timeOfDay: timeCheck.timeOfDay,
        mentionSeriousness: seriousnessCheck.seriousness,
        recentSuggestions: recentCheck.recent
          ? `Yes (${recentCheck.daysAgo} days ago)`
          : 'No',
        userEngagement: engagementCheck.engagement,
      },
    };
  } catch (error: any) {
    logger.error(`Failed to evaluate intervention gating:`, error);
    // On error, default to allowing suggestion (fail open)
    return {
      shouldSuggest: true,
      reason: 'Gating check failed - defaulting to allow',
      passedCriteria: 2,
      totalCriteria: 3,
      context: {},
    };
  }
}

