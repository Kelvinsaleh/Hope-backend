import { logger } from '../../utils/logger';

/**
 * Sleep Intervention Service
 * Provides evidence-based CBT-I (Cognitive Behavioral Therapy for Insomnia) interventions
 */

export interface SleepIntervention {
  id: string;
  name: string;
  description: string;
  steps: string[];
  duration: string; // e.g., "2 weeks", "30 minutes"
  technique: 'stimulus_control' | 'sleep_restriction' | 'sleep_hygiene' | 'cognitive_restructuring' | 'relaxation';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export const SLEEP_INTERVENTIONS: SleepIntervention[] = [
  {
    id: 'sleep-hygiene-basics',
    name: 'Sleep Hygiene Fundamentals',
    description: 'Essential habits to improve sleep quality naturally',
    steps: [
      'Keep a consistent sleep schedule (same bedtime/wake time, even weekends)',
      'Create a relaxing bedtime routine (30-60 min before bed)',
      'Keep bedroom cool (65-68°F/18-20°C), dark, and quiet',
      'Avoid screens (phones, TV, tablets) 30-60 minutes before bed',
      'Avoid caffeine after 2 PM and large meals 3 hours before bed',
      'Get regular sunlight exposure (especially in the morning)',
      'Only use your bed for sleep and intimacy (not work, eating, or watching TV)',
      'If you can\'t sleep after 20 minutes, get up and do something calming until sleepy'
    ],
    duration: '2-4 weeks',
    technique: 'sleep_hygiene',
    difficulty: 'beginner'
  },
  {
    id: 'stimulus-control',
    name: 'Stimulus Control Therapy',
    description: 'Reassociate your bed with sleep by conditioning your body',
    steps: [
      'Only go to bed when you feel sleepy (not just tired)',
      'If you can\'t fall asleep within 20 minutes, get out of bed',
      'Go to another room and do something calming (read, meditate, listen to music)',
      'Return to bed only when you feel sleepy again',
      'Repeat if necessary (even multiple times per night)',
      'Set your alarm for the same time every morning (regardless of sleep)',
      'Avoid napping during the day (or limit to 20 minutes before 3 PM)',
      'Continue for at least 2 weeks to see results'
    ],
    duration: '2-6 weeks',
    technique: 'stimulus_control',
    difficulty: 'intermediate'
  },
  {
    id: 'sleep-restriction',
    name: 'Sleep Restriction Therapy',
    description: 'Temporarily reduce time in bed to consolidate sleep, then gradually expand',
    steps: [
      'Calculate your average sleep time (total time asleep, not time in bed) over the past week',
      'Set your initial time in bed to match your average sleep time (minimum 5 hours)',
      'Set a fixed wake time (choose based on your schedule)',
      'Calculate bedtime: Wake time - Sleep time = Bedtime',
      'Stick to these times strictly (no naps, no early bedtimes)',
      'After 1 week, if sleep efficiency >85%, increase time in bed by 15-30 minutes',
      'Continue weekly adjustments until you feel rested',
      'Track your sleep efficiency: (Time Asleep / Time in Bed) × 100'
    ],
    duration: '4-8 weeks',
    technique: 'sleep_restriction',
    difficulty: 'advanced'
  },
  {
    id: 'worry-time',
    name: 'Worry Time / Cognitive Shifting',
    description: 'Designate a specific time for worries so they don\'t interfere with sleep',
    steps: [
      'Choose a "worry time" earlier in the day (not near bedtime)',
      'During worry time (15-30 min), write down all your concerns',
      'If worries come up at bedtime, remind yourself: "I\'ll address this during worry time tomorrow"',
      'Keep a notepad by bed to quickly jot down urgent thoughts',
      'Practice shifting focus to something calming (breathing, body scan, visualization)',
      'Use the cognitive reframe: "Worrying now won\'t solve anything—sleep will help me think clearer tomorrow"'
    ],
    duration: '2-3 weeks',
    technique: 'cognitive_restructuring',
    difficulty: 'intermediate'
  },
  {
    id: 'progressive-relaxation',
    name: 'Progressive Muscle Relaxation for Sleep',
    description: 'Physical relaxation technique to prepare body for sleep',
    steps: [
      'Lie in bed, close your eyes, take 3 slow deep breaths',
      'Tense your feet muscles for 5 seconds, then release (feel the relaxation)',
      'Move up your body: calves, thighs, glutes, stomach, hands, arms, shoulders, neck, face',
      'Tense each muscle group for 5 seconds, release, and notice the relaxation',
      'Take your time (15-20 minutes total)',
      'If your mind wanders, gently return to the next muscle group',
      'End with deep breathing and a visualization of calmness',
      'Allow yourself to drift off naturally'
    ],
    duration: '15-30 minutes daily',
    technique: 'relaxation',
    difficulty: 'beginner'
  },
  {
    id: 'bedtime-routine',
    name: 'Personalized Bedtime Routine Builder',
    description: 'Create a consistent pre-sleep routine that signals your body to wind down',
    steps: [
      'Choose 3-4 calming activities to do 30-60 minutes before bed',
      'Suggestions: Light reading, gentle stretching, warm bath (drop body temp after), meditation, journaling, calming music',
      'Do them in the same order every night (consistency is key)',
      'Avoid stimulating activities: work, intense exercise, exciting TV, arguments',
      'Dim lights 1 hour before bed (helps melatonin production)',
      'Practice the routine for at least 2 weeks to form the habit',
      'Adjust activities based on what actually helps you relax'
    ],
    duration: 'Ongoing',
    technique: 'sleep_hygiene',
    difficulty: 'beginner'
  }
];

export function getSleepIntervention(id: string): SleepIntervention | null {
  return SLEEP_INTERVENTIONS.find(intervention => intervention.id === id) || null;
}

export function getRecommendedInterventions(
  sleepProblem: 'difficulty_falling_asleep' | 'waking_frequently' | 'early_waking' | 'poor_sleep_quality',
  severity: 'mild' | 'moderate' | 'severe',
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): SleepIntervention[] {
  const recommendations: SleepIntervention[] = [];
  
  // Always start with sleep hygiene basics
  recommendations.push(SLEEP_INTERVENTIONS.find(i => i.id === 'sleep-hygiene-basics')!);
  
  // Add technique-specific interventions
  if (sleepProblem === 'difficulty_falling_asleep') {
    recommendations.push(
      SLEEP_INTERVENTIONS.find(i => i.id === 'stimulus-control')!,
      SLEEP_INTERVENTIONS.find(i => i.id === 'progressive-relaxation')!,
      SLEEP_INTERVENTIONS.find(i => i.id === 'worry-time')!
    );
  }
  
  if (sleepProblem === 'waking_frequently' || sleepProblem === 'early_waking') {
    if (experienceLevel !== 'beginner') {
      recommendations.push(SLEEP_INTERVENTIONS.find(i => i.id === 'sleep-restriction')!);
    }
    recommendations.push(SLEEP_INTERVENTIONS.find(i => i.id === 'worry-time')!);
  }
  
  // Everyone benefits from a bedtime routine
  recommendations.push(SLEEP_INTERVENTIONS.find(i => i.id === 'bedtime-routine')!);
  
  // Filter by difficulty level
  return recommendations.filter(i => {
    if (experienceLevel === 'beginner') return i.difficulty === 'beginner';
    if (experienceLevel === 'intermediate') return i.difficulty !== 'advanced';
    return true; // advanced users can access all
  });
}

export function formatInterventionForAI(intervention: SleepIntervention): string {
  return `**${intervention.name}** (${intervention.duration})
${intervention.description}

Steps:
${intervention.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
}
