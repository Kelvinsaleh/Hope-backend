import { logger } from '../../utils/logger';
import { Types } from 'mongoose';
import { getRecommendedInterventions as getSleepInterventions } from './sleepIntervention';
import { getRecommendedInterventions as getDepressionInterventions } from './depressionIntervention';
import { getRecommendedInterventions as getAnxietyInterventions } from './anxietyIntervention';
import { getRecommendedInterventions as getStressInterventions } from './stressIntervention';
import { getRecommendedInterventions as getBreakupInterventions } from './breakupIntervention';
import { getRecommendedInterventions as getGriefInterventions } from './griefIntervention';
import { getRecommendedInterventions as getFocusInterventions } from './focusIntervention';
import { getInterventionEffectiveness } from './interventionProgressService';

/**
 * Intervention Detector Service
 * Detects when users need specific interventions (depression, sleep, anxiety, etc.)
 * and proactively suggests structured interventions
 */

export interface DetectedNeed {
  type: 'sleep' | 'depression' | 'anxiety' | 'stress' | 'breakup' | 'grief' | 'focus' | null;
  severity: 'mild' | 'moderate' | 'severe';
  confidence: number; // 0-1
  indicators: string[];
  timeframe?: {
    daysSince?: number; // For breakup (days since breakup)
    monthsSince?: number; // For grief (months since loss)
  };
}

export interface InterventionSuggestion {
  interventionId: string;
  interventionName: string;
  description: string;
  whyNow: string; // Why this intervention is relevant now
  nextSteps: string[];
}

/**
 * Detect user needs from message content and context
 */
export function detectInterventionNeeds(
  message: string,
  recentMessages: Array<{ role: string; content: string }>,
  moodPatterns?: Array<{ mood: number; timestamp: Date }>
): DetectedNeed {
  const text = (message || '').toLowerCase();
  const allText = [message, ...recentMessages.map(m => m.content || '')].join(' ').toLowerCase();
  
  const needs: DetectedNeed[] = [];
  
  // Sleep problem detection
  const sleepIndicators: string[] = [];
  const sleepSignals = [
    'can\'t sleep', 'insomnia', 'trouble sleeping', 'wake up', 'waking up',
    'sleep', 'slept', 'tired', 'exhausted', 'sleepy', 'bedtime',
    'awake', 'sleeping', 'sleep schedule', 'sleep quality'
  ];
  const sleepProblems = [
    'difficulty falling asleep', 'can\'t fall asleep', 'takes hours to sleep',
    'wake up frequently', 'waking up at night', 'keep waking up',
    'wake up too early', 'early morning waking', 'can\'t stay asleep'
  ];
  
  const hasSleepMentions = sleepSignals.some(signal => allText.includes(signal));
  const hasSleepProblem = sleepProblems.some(problem => allText.includes(problem.toLowerCase()));
  
  if (hasSleepMentions || hasSleepProblem) {
    if (allText.includes('can\'t fall asleep') || allText.includes('difficulty falling asleep')) {
      sleepIndicators.push('difficulty falling asleep');
    }
    if (allText.includes('wake up') || allText.includes('waking up')) {
      sleepIndicators.push('sleep disruption');
    }
    if (allText.includes('tired') || allText.includes('exhausted')) {
      sleepIndicators.push('fatigue from poor sleep');
    }
    
    if (sleepIndicators.length > 0) {
      needs.push({
        type: 'sleep',
        severity: hasSleepProblem ? 'moderate' : 'mild',
        confidence: hasSleepProblem ? 0.8 : 0.6,
        indicators: sleepIndicators
      });
    }
  }
  
  // Depression detection
  const depressionIndicators: string[] = [];
  const depressionSignals = [
    'depressed', 'depression', 'sad', 'hopeless', 'empty', 'numb',
    'nothing matters', 'no point', 'don\'t care', 'can\'t enjoy',
    'lost interest', 'no motivation', 'exhausted', 'overwhelmed'
  ];
  const depressionSymptoms = [
    'no energy', 'can\'t get out of bed', 'don\'t want to do anything',
    'nothing helps', 'feel like giving up', 'better off without me'
  ];
  
  const hasDepressionMentions = depressionSignals.some(signal => allText.includes(signal));
  const hasSevereSymptoms = depressionSymptoms.some(symptom => allText.includes(symptom));
  
  if (hasDepressionMentions || hasSevereSymptoms) {
    if (allText.includes('hopeless') || allText.includes('no point')) {
      depressionIndicators.push('hopelessness');
    }
    if (allText.includes('lost interest') || allText.includes('can\'t enjoy')) {
      depressionIndicators.push('anhedonia (loss of pleasure)');
    }
    if (allText.includes('no energy') || allText.includes('exhausted')) {
      depressionIndicators.push('fatigue');
    }
    if (allText.includes('isolation') || allText.includes('don\'t want to see anyone')) {
      depressionIndicators.push('social withdrawal');
    }
    
    if (depressionIndicators.length > 0) {
      needs.push({
        type: 'depression',
        severity: hasSevereSymptoms ? 'severe' : (hasDepressionMentions ? 'moderate' : 'mild'),
        confidence: hasSevereSymptoms ? 0.9 : (hasDepressionMentions ? 0.7 : 0.5),
        indicators: depressionIndicators
      });
    }
  }
  
  // Anxiety detection
  const anxietyIndicators: string[] = [];
  const anxietySignals = [
    'anxious', 'anxiety', 'worried', 'nervous', 'panicked', 'panic',
    'overwhelmed', 'racing thoughts', 'can\'t stop worrying',
    'restless', 'on edge', 'stressed', 'afraid', 'scared'
  ];
  const anxietySymptoms = [
    'panic attack', 'can\'t breathe', 'heart racing', 'feeling dizzy',
    'can\'t calm down', 'worried all the time', 'afraid something bad will happen'
  ];
  
  const hasAnxietyMentions = anxietySignals.some(signal => allText.includes(signal));
  const hasAnxietySymptoms = anxietySymptoms.some(symptom => allText.includes(symptom));
  
  if (hasAnxietyMentions || hasAnxietySymptoms) {
    if (allText.includes('panic') || allText.includes('panic attack')) {
      anxietyIndicators.push('panic attacks');
    }
    if (allText.includes('worried') || allText.includes('worrying')) {
      anxietyIndicators.push('excessive worry');
    }
    if (allText.includes('racing thoughts') || allText.includes('can\'t stop thinking')) {
      anxietyIndicators.push('racing thoughts');
    }
    if (allText.includes('social') && (allText.includes('anxious') || allText.includes('nervous'))) {
      anxietyIndicators.push('social anxiety');
    }
    
    if (anxietyIndicators.length > 0 || hasAnxietyMentions) {
      needs.push({
        type: 'anxiety',
        severity: hasAnxietySymptoms ? 'severe' : (hasAnxietyMentions ? 'moderate' : 'mild'),
        confidence: hasAnxietySymptoms ? 0.85 : (hasAnxietyMentions ? 0.7 : 0.5),
        indicators: anxietyIndicators.length > 0 ? anxietyIndicators : ['anxiety symptoms']
      });
    }
  }
  
  // Stress detection
  const stressIndicators: string[] = [];
  const stressSignals = [
    'stressed', 'stress', 'overwhelmed', 'burnout', 'exhausted',
    'too much to do', 'can\'t keep up', 'pulled in different directions',
    'pressure', 'deadline', 'workload', 'demands'
  ];
  const stressSymptoms = [
    'burned out', 'completely overwhelmed', 'can\'t handle it',
    'too much stress', 'constantly stressed'
  ];
  
  const hasStressMentions = stressSignals.some(signal => allText.includes(signal));
  const hasStressSymptoms = stressSymptoms.some(symptom => allText.includes(symptom));
  
  // Distinguish stress from anxiety (stress is more about demands/pressure, anxiety is more about worry/fear)
  if (hasStressMentions && !hasAnxietyMentions) {
    if (allText.includes('work') || allText.includes('job') || allText.includes('deadline')) {
      stressIndicators.push('work stress');
    }
    if (allText.includes('time') || allText.includes('schedule') || allText.includes('busy')) {
      stressIndicators.push('time pressure');
    }
    if (allText.includes('relationships') || allText.includes('family') || allText.includes('people')) {
      stressIndicators.push('relationship stress');
    }
    
    if (stressIndicators.length > 0 || hasStressSymptoms) {
      needs.push({
        type: 'stress',
        severity: hasStressSymptoms ? 'severe' : (hasStressMentions ? 'moderate' : 'mild'),
        confidence: hasStressSymptoms ? 0.8 : (hasStressMentions ? 0.65 : 0.5),
        indicators: stressIndicators.length > 0 ? stressIndicators : ['stress symptoms']
      });
    }
  }
  
  // Breakup detection
  const breakupIndicators: string[] = [];
  const breakupSignals = [
    'breakup', 'broke up', 'ex', 'ex-boyfriend', 'ex-girlfriend', 'ex-partner',
    'relationship ended', 'we split', 'we broke up', 'dumped', 'got dumped',
    'single again', 'just broke up', 'relationship over'
  ];
  
  const hasBreakupMentions = breakupSignals.some(signal => allText.includes(signal));
  if (hasBreakupMentions) {
    if (allText.includes('recently') || allText.includes('just') || allText.includes('yesterday') || allText.includes('today') || allText.includes('week')) {
      breakupIndicators.push('recent breakup');
    } else if (allText.includes('months') || allText.includes('weeks') || allText.includes('ago')) {
      breakupIndicators.push('past breakup (ongoing grief)');
    }
    
    if (breakupIndicators.length > 0) {
      // Try to extract timeframe
      const daysMatch = allText.match(/(\d+)\s*(days|day|weeks|week)\s*ago/);
      const daysSince = daysMatch ? (daysMatch[2].includes('week') ? parseInt(daysMatch[1]) * 7 : parseInt(daysMatch[1])) : undefined;
      
      needs.push({
        type: 'breakup',
        severity: breakupIndicators.includes('recent breakup') ? 'moderate' : 'mild',
        confidence: 0.85,
        indicators: breakupIndicators,
        timeframe: daysSince ? { daysSince } : undefined
      });
    }
  }
  
  // Grief/loss detection
  const griefIndicators: string[] = [];
  const griefSignals = [
    'died', 'death', 'passed away', 'loss', 'lost', 'grief', 'grieving',
    'funeral', 'mourning', 'deceased', 'parent died', 'family member died',
    'loved one died', 'friend died', 'grandma', 'grandpa', 'father', 'mother'
  ];
  
  const hasGriefMentions = griefSignals.some(signal => allText.includes(signal));
  if (hasGriefMentions) {
    if (allText.includes('recently') || allText.includes('just') || allText.includes('yesterday') || allText.includes('today')) {
      griefIndicators.push('recent loss');
    } else if (allText.includes('months') || allText.includes('weeks')) {
      griefIndicators.push('ongoing grief');
    }
    
    if (griefIndicators.length > 0) {
      // Try to extract timeframe
      const monthsMatch = allText.match(/(\d+)\s*(months|month|weeks|week)\s*ago/);
      const monthsSince = monthsMatch ? (monthsMatch[2].includes('week') ? parseInt(monthsMatch[1]) / 4 : parseInt(monthsMatch[1])) : undefined;
      
      needs.push({
        type: 'grief',
        severity: griefIndicators.includes('recent loss') ? 'severe' : 'moderate',
        confidence: 0.9,
        indicators: griefIndicators,
        timeframe: monthsSince ? { monthsSince: Math.floor(monthsSince) } : undefined
      });
    }
  }
  
  // Focus/discipline detection
  const focusIndicators: string[] = [];
  const focusSignals = [
    'can\'t focus', 'distracted', 'procrastinate', 'procrastination', 'lazy',
    'no motivation', 'no discipline', 'can\'t concentrate', 'hard to focus',
    'struggling to stay focused', 'losing focus', 'keep getting distracted',
    'can\'t get things done', 'hard to start', 'can\'t finish'
  ];
  
  const hasFocusMentions = focusSignals.some(signal => allText.includes(signal));
  if (hasFocusMentions) {
    if (allText.includes('can\'t focus') || allText.includes('distracted')) {
      focusIndicators.push('attention issues');
    }
    if (allText.includes('procrastinate') || allText.includes('can\'t start')) {
      focusIndicators.push('procrastination');
    }
    
    if (focusIndicators.length > 0) {
      needs.push({
        type: 'focus',
        severity: 'moderate',
        confidence: 0.75,
        indicators: focusIndicators
      });
    }
  }
  
  // Use mood patterns to validate
  if (moodPatterns && moodPatterns.length > 0) {
    const recentMoods = moodPatterns.slice(0, 7).map(m => m.mood);
    const avgMood = recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length;
    
    if (avgMood < 4 && !needs.find(n => n.type === 'depression')) {
      needs.push({
        type: 'depression',
        severity: avgMood < 3 ? 'severe' : 'moderate',
        confidence: 0.7,
        indicators: [`Low mood pattern (avg: ${avgMood.toFixed(1)}/10)`]
      });
    }
  }
  
  // Return the highest confidence need, or null if none detected
  if (needs.length === 0) {
    return {
      type: null,
      severity: 'mild',
      confidence: 0,
      indicators: []
    };
  }
  
  // Return the need with highest confidence
  return needs.reduce((prev, current) => 
    (current.confidence > prev.confidence) ? current : prev
  );
}

/**
 * Generate intervention suggestions based on detected needs
 * PERSONALIZED: Uses effectiveness ratings to prioritize interventions that work best for the user
 */
export async function generateInterventionSuggestions(
  detectedNeed: DetectedNeed,
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
  userId?: Types.ObjectId // Optional: for personalization based on effectiveness
): Promise<InterventionSuggestion[]> {
  const suggestions: InterventionSuggestion[] = [];
  
  // Get user's intervention effectiveness history for personalization (if userId provided)
  let effectivenessMap = new Map<string, number>(); // interventionId -> average effectiveness
  if (userId) {
    try {
      const effectivenessHistory = await getInterventionEffectiveness(userId, detectedNeed.type);
      effectivenessHistory.forEach(item => {
        if (item.averageEffectiveness > 0) {
          effectivenessMap.set(item.interventionId, item.averageEffectiveness);
        }
      });
    } catch (error: any) {
      logger.warn(`Failed to get effectiveness history for personalization:`, error.message);
      // Continue without personalization if it fails
    }
  }

  if (detectedNeed.type === 'sleep' && detectedNeed.confidence > 0.5) {
    const sleepInterventions = getSleepInterventions(
      'difficulty_falling_asleep', // Default, could be refined based on indicators
      detectedNeed.severity,
      experienceLevel
    );
    
    // Sort by effectiveness (if available) - prioritize interventions that worked well before
    const sortedInterventions = sleepInterventions.sort((a, b) => {
      const aEffectiveness = effectivenessMap.get(a.id) || 0;
      const bEffectiveness = effectivenessMap.get(b.id) || 0;
      return bEffectiveness - aEffectiveness; // Higher effectiveness first
    });
    
    sortedInterventions.slice(0, 2).forEach(intervention => {
      const effectiveness = effectivenessMap.get(intervention.id);
      const whyNow = effectiveness && effectiveness >= 7
        ? `You've rated "${intervention.name}" ${effectiveness.toFixed(1)}/10 before - it worked well for you!`
        : `You mentioned sleep difficulties. ${intervention.name} has been shown to help improve sleep quality.`;
      
      suggestions.push({
        interventionId: intervention.id,
        interventionName: intervention.name,
        description: intervention.description,
        whyNow,
        nextSteps: intervention.steps.slice(0, 3) // First 3 steps as preview
      });
    });
  }
  
  if (detectedNeed.type === 'depression' && detectedNeed.confidence > 0.5) {
    const primarySymptom = detectedNeed.indicators.includes('social withdrawal') ? 'isolation' :
                          detectedNeed.indicators.includes('hopelessness') ? 'self_criticism' :
                          'low_mood';
    
    const depressionInterventions = getDepressionInterventions(
      detectedNeed.severity,
      primarySymptom,
      experienceLevel
    );
    
    // Sort by effectiveness
    const sortedInterventions = depressionInterventions.sort((a, b) => {
      const aEffectiveness = effectivenessMap.get(a.id) || 0;
      const bEffectiveness = effectivenessMap.get(b.id) || 0;
      return bEffectiveness - aEffectiveness;
    });
    
    sortedInterventions.slice(0, 2).forEach(intervention => {
      const effectiveness = effectivenessMap.get(intervention.id);
      const whyNow = effectiveness && effectiveness >= 7
        ? `You've rated "${intervention.name}" ${effectiveness.toFixed(1)}/10 before - it worked well for you!`
        : `I noticed signs that might benefit from structured support. ${intervention.name} is an evidence-based approach that helps many people.`;
      
      suggestions.push({
        interventionId: intervention.id,
        interventionName: intervention.name,
        description: intervention.description,
        whyNow,
        nextSteps: intervention.steps.slice(0, 3)
      });
    });
  }
  
  if (detectedNeed.type === 'anxiety' && detectedNeed.confidence > 0.5) {
    const anxietyType = detectedNeed.indicators.includes('panic attacks') ? 'panic' :
                       detectedNeed.indicators.includes('social anxiety') ? 'social' :
                       detectedNeed.indicators.includes('excessive worry') ? 'worries' :
                       'general';
    
    const anxietyInterventions = getAnxietyInterventions(
      anxietyType as 'general' | 'social' | 'panic' | 'specific_phobia' | 'worries',
      detectedNeed.severity,
      experienceLevel
    );
    
    // Sort by effectiveness
    const sortedInterventions = anxietyInterventions.sort((a, b) => {
      const aEffectiveness = effectivenessMap.get(a.id) || 0;
      const bEffectiveness = effectivenessMap.get(b.id) || 0;
      return bEffectiveness - aEffectiveness;
    });
    
    sortedInterventions.slice(0, 2).forEach(intervention => {
      const effectiveness = effectivenessMap.get(intervention.id);
      const whyNow = effectiveness && effectiveness >= 7
        ? `You've rated "${intervention.name}" ${effectiveness.toFixed(1)}/10 before - it worked well for you!`
        : `You mentioned feeling anxious or worried. ${intervention.name} has been shown to help reduce anxiety effectively.`;
      
      suggestions.push({
        interventionId: intervention.id,
        interventionName: intervention.name,
        description: intervention.description,
        whyNow,
        nextSteps: intervention.steps.slice(0, 3)
      });
    });
  }
  
  if (detectedNeed.type === 'stress' && detectedNeed.confidence > 0.5) {
    const stressSource = detectedNeed.indicators.includes('work stress') ? 'work' :
                        detectedNeed.indicators.includes('time pressure') ? 'time_pressure' :
                        detectedNeed.indicators.includes('relationship stress') ? 'relationships' :
                        'general';
    
    const stressInterventions = getStressInterventions(
      stressSource as 'work' | 'relationships' | 'time_pressure' | 'life_changes' | 'general',
      detectedNeed.severity,
      experienceLevel
    );
    
    // Sort by effectiveness
    const sortedInterventions = stressInterventions.sort((a, b) => {
      const aEffectiveness = effectivenessMap.get(a.id) || 0;
      const bEffectiveness = effectivenessMap.get(b.id) || 0;
      return bEffectiveness - aEffectiveness;
    });
    
    sortedInterventions.slice(0, 2).forEach(intervention => {
      const effectiveness = effectivenessMap.get(intervention.id);
      const whyNow = effectiveness && effectiveness >= 7
        ? `You've rated "${intervention.name}" ${effectiveness.toFixed(1)}/10 before - it worked well for you!`
        : `You mentioned feeling stressed or overwhelmed. ${intervention.name} can help you manage stress more effectively.`;
      
      suggestions.push({
        interventionId: intervention.id,
        interventionName: intervention.name,
        description: intervention.description,
        whyNow,
        nextSteps: intervention.steps.slice(0, 3)
      });
    });
  }
  
  if (detectedNeed.type === 'breakup' && detectedNeed.confidence > 0.5) {
    const daysSince = detectedNeed.timeframe?.daysSince || 0;
    const primaryChallenge = detectedNeed.indicators.includes('contact urges') ? 'contact_urges' :
                            detectedNeed.indicators.includes('loneliness') ? 'loneliness' :
                            detectedNeed.indicators.includes('identity') ? 'identity_loss' :
                            'emotional_pain';
    
    const breakupInterventions = getBreakupInterventions(
      daysSince,
      primaryChallenge,
      experienceLevel
    );
    
    // Sort by effectiveness
    const sortedInterventions = breakupInterventions.sort((a, b) => {
      const aEffectiveness = effectivenessMap.get(a.id) || 0;
      const bEffectiveness = effectivenessMap.get(b.id) || 0;
      return bEffectiveness - aEffectiveness;
    });
    
    sortedInterventions.slice(0, 2).forEach(intervention => {
      const effectiveness = effectivenessMap.get(intervention.id);
      const whyNow = effectiveness && effectiveness >= 7
        ? `You've rated "${intervention.name}" ${effectiveness.toFixed(1)}/10 before - it worked well for you!`
        : `You mentioned going through a breakup. ${intervention.name} has been shown to help people heal from relationship loss.`;
      
      suggestions.push({
        interventionId: intervention.id,
        interventionName: intervention.name,
        description: intervention.description,
        whyNow,
        nextSteps: intervention.steps.slice(0, 3)
      });
    });
  }
  
  if (detectedNeed.type === 'grief' && detectedNeed.confidence > 0.5) {
    const monthsSince = detectedNeed.timeframe?.monthsSince || 0;
    const primaryChallenge = detectedNeed.indicators.includes('overwhelmed') ? 'emotional_overwhelm' :
                            detectedNeed.indicators.includes('loneliness') ? 'loneliness' :
                            detectedNeed.indicators.includes('meaning') ? 'meaning_loss' :
                            'emotional_overwhelm';
    
    const griefInterventions = getGriefInterventions(
      monthsSince,
      primaryChallenge,
      experienceLevel
    );
    
    // Sort by effectiveness
    const sortedInterventions = griefInterventions.sort((a, b) => {
      const aEffectiveness = effectivenessMap.get(a.id) || 0;
      const bEffectiveness = effectivenessMap.get(b.id) || 0;
      return bEffectiveness - aEffectiveness;
    });
    
    sortedInterventions.slice(0, 2).forEach(intervention => {
      const effectiveness = effectivenessMap.get(intervention.id);
      const whyNow = effectiveness && effectiveness >= 7
        ? `You've rated "${intervention.name}" ${effectiveness.toFixed(1)}/10 before - it worked well for you!`
        : `You mentioned experiencing loss. ${intervention.name} can help you navigate grief and honor your loved one's memory.`;
      
      suggestions.push({
        interventionId: intervention.id,
        interventionName: intervention.name,
        description: intervention.description,
        whyNow,
        nextSteps: intervention.steps.slice(0, 3)
      });
    });
  }
  
  if (detectedNeed.type === 'focus' && detectedNeed.confidence > 0.5) {
    const primaryChallenge = detectedNeed.indicators.includes('procrastination') ? 'procrastination' :
                            detectedNeed.indicators.includes('distractions') ? 'distractions' :
                            detectedNeed.indicators.includes('no routine') ? 'lack_of_routine' :
                            'procrastination';
    
    const focusInterventions = getFocusInterventions(
      primaryChallenge,
      experienceLevel
    );
    
    // Sort by effectiveness
    const sortedInterventions = focusInterventions.sort((a, b) => {
      const aEffectiveness = effectivenessMap.get(a.id) || 0;
      const bEffectiveness = effectivenessMap.get(b.id) || 0;
      return bEffectiveness - aEffectiveness;
    });
    
    sortedInterventions.slice(0, 2).forEach(intervention => {
      const effectiveness = effectivenessMap.get(intervention.id);
      const whyNow = effectiveness && effectiveness >= 7
        ? `You've rated "${intervention.name}" ${effectiveness.toFixed(1)}/10 before - it worked well for you!`
        : `You mentioned struggling with focus or discipline. ${intervention.name} can help you build better focus habits.`;
      
      suggestions.push({
        interventionId: intervention.id,
        interventionName: intervention.name,
        description: intervention.description,
        whyNow,
        nextSteps: intervention.steps.slice(0, 3)
      });
    });
  }
  
  return suggestions;
}
