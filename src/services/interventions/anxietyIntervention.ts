import { logger } from '../../utils/logger';

/**
 * Anxiety Intervention Service
 * Provides evidence-based interventions for anxiety (CBT, exposure, relaxation)
 */

export interface AnxietyIntervention {
  id: string;
  name: string;
  description: string;
  steps: string[];
  duration: string;
  technique: 'cognitive_restructuring' | 'exposure' | 'relaxation' | 'mindfulness' | 'grounding' | 'breathing';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export const ANXIETY_INTERVENTIONS: AnxietyIntervention[] = [
  {
    id: 'grounding-techniques',
    name: '5-4-3-2-1 Grounding Technique',
    description: 'Quick sensory grounding to reduce anxiety in the moment',
    steps: [
      'Take a deep breath and pause',
      'Identify 5 things you can SEE around you',
      'Identify 4 things you can TOUCH (feel the texture, temperature)',
      'Identify 3 things you can HEAR',
      'Identify 2 things you can SMELL',
      'Identify 1 thing you can TASTE (or focus on the taste in your mouth)',
      'Take another deep breath and notice how you feel now',
      'Repeat if anxiety is still high'
    ],
    duration: '2-5 minutes (use as needed)',
    technique: 'grounding',
    difficulty: 'beginner'
  },
  {
    id: 'box-breathing',
    name: 'Box Breathing / 4-4-4-4 Breathing',
    description: 'Simple breathing technique to calm the nervous system',
    steps: [
      'Sit or lie comfortably, close your eyes',
      'Breathe in through your nose for 4 counts',
      'Hold your breath for 4 counts',
      'Exhale through your mouth for 4 counts',
      'Hold your breath (lungs empty) for 4 counts',
      'Repeat this cycle 4-6 times',
      'If 4 counts is too long, start with 3 counts and work up',
      'Notice how your body feels calmer after'
    ],
    duration: '2-3 minutes (use as needed)',
    technique: 'breathing',
    difficulty: 'beginner'
  },
  {
    id: 'cognitive-restructuring-anxiety',
    name: 'Anxiety Thought Challenging',
    description: 'Challenge anxious thoughts with evidence and balanced thinking',
    steps: [
      'Identify the anxious thought (e.g., "Something terrible will happen")',
      'Rate your anxiety level (1-10)',
      'Ask: "What\'s the evidence FOR this thought?" (list facts, not fears)',
      'Ask: "What\'s the evidence AGAINST this thought?" (list facts, past experiences)',
      'Ask: "What would I tell a friend having this thought?"',
      'Create a balanced thought: "While [possibility], [more likely reality]..."',
      'Re-rate your anxiety (1-10) after the balanced thought',
      'Practice this regularly to build the skill'
    ],
    duration: '5-10 minutes (use when anxious thoughts arise)',
    technique: 'cognitive_restructuring',
    difficulty: 'intermediate'
  },
  {
    id: 'progressive-muscle-relaxation',
    name: 'Progressive Muscle Relaxation (Anxiety)',
    description: 'Physical relaxation technique to reduce anxiety and tension',
    steps: [
      'Find a quiet place, sit or lie comfortably',
      'Take 3 slow deep breaths',
      'Tense your feet muscles for 5 seconds, then release (feel the relaxation)',
      'Move up: calves, thighs, glutes, stomach, hands, arms, shoulders, neck, face',
      'Tense each muscle group for 5 seconds, release completely, and notice the contrast',
      'Take your time (10-15 minutes total)',
      'End with deep breathing and visualize tension leaving your body',
      'Practice daily for best results'
    ],
    duration: '10-15 minutes daily',
    technique: 'relaxation',
    difficulty: 'beginner'
  },
  {
    id: 'gradual-exposure',
    name: 'Gradual Exposure / Fear Ladder',
    description: 'Systematically face fears to reduce anxiety over time',
    steps: [
      'Identify your fear/anxiety trigger (specific situation or activity)',
      'Create a "fear ladder" - list 5-10 steps from least to most anxiety-provoking',
      'Start at the bottom step (causes 2-3/10 anxiety)',
      'Practice that step until it feels manageable (anxiety drops to 1-2/10)',
      'Only move to the next step when the current one feels comfortable',
      'Take your time - there\'s no rush',
      'Track your progress: rate anxiety before/after each step',
      'Celebrate small wins - each step is progress'
    ],
    duration: '4-12 weeks (depends on fear complexity)',
    technique: 'exposure',
    difficulty: 'advanced'
  },
  {
    id: 'worry-time-scheduled',
    name: 'Scheduled Worry Time',
    description: 'Contain worries to a specific time so they don\'t consume your day',
    steps: [
      'Choose a "worry time" - same time every day (not near bedtime), 15-30 minutes',
      'During the day, when worries arise, write them down briefly (don\'t engage)',
      'Tell yourself: "I\'ll worry about this during worry time"',
      'At worry time, sit down and fully engage with your worries',
      'Write them out, think through them, problem-solve if possible',
      'When time is up, stop worrying - you\'ve addressed it for today',
      'If worries come back outside worry time, remind yourself: "Not now, worry time is at [time]"',
      'Practice consistently - it trains your brain to contain worries'
    ],
    duration: '2-3 weeks to establish the habit',
    technique: 'cognitive_restructuring',
    difficulty: 'intermediate'
  },
  {
    id: 'mindfulness-for-anxiety',
    name: 'Mindfulness Meditation for Anxiety',
    description: 'Observe anxious thoughts without being consumed by them',
    steps: [
      'Find a quiet place, sit comfortably, close your eyes',
      'Focus on your breath - notice each inhale and exhale',
      'When anxious thoughts arise (they will), acknowledge them: "I\'m having an anxious thought"',
      'Don\'t fight the thought or get caught up in it - just notice it',
      'Gently return your focus to your breath',
      'If anxiety is strong, acknowledge it: "I feel anxious right now. That\'s okay."',
      'Continue observing - thoughts are temporary, they pass',
      'End with 3 deep breaths and gently open your eyes'
    ],
    duration: '10-20 minutes daily',
    technique: 'mindfulness',
    difficulty: 'intermediate'
  },
  {
    id: 'anxiety-action-plan',
    name: 'Anxiety Action Plan / Coping Toolkit',
    description: 'Create a personalized plan for managing anxiety in different situations',
    steps: [
      'List your common anxiety triggers (situations, thoughts, physical sensations)',
      'Identify 3-5 coping strategies that work for you (breathing, grounding, exercise, calling someone, etc.)',
      'Create "if-then" plans: "If I feel anxious at work, then I will [do breathing exercise]"',
      'Write your plan down or save it on your phone',
      'Practice your coping strategies when anxiety is low (so they\'re easier to use when high)',
      'Review and update your plan weekly based on what works',
      'Include both immediate techniques (breathing) and longer-term strategies (exposure)',
      'Share your plan with a trusted person if helpful'
    ],
    duration: 'Ongoing (update as needed)',
    technique: 'cognitive_restructuring',
    difficulty: 'beginner'
  }
];

export function getAnxietyIntervention(id: string): AnxietyIntervention | null {
  return ANXIETY_INTERVENTIONS.find(intervention => intervention.id === id) || null;
}

export function getRecommendedInterventions(
  anxietyType: 'general' | 'social' | 'panic' | 'specific_phobia' | 'worries',
  severity: 'mild' | 'moderate' | 'severe',
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): AnxietyIntervention[] {
  const recommendations: AnxietyIntervention[] = [];
  
  // Everyone benefits from grounding and breathing basics
  recommendations.push(
    ANXIETY_INTERVENTIONS.find(i => i.id === 'grounding-techniques')!,
    ANXIETY_INTERVENTIONS.find(i => i.id === 'box-breathing')!
  );
  
  // Type-specific recommendations
  if (anxietyType === 'panic' || severity === 'severe') {
    recommendations.push(ANXIETY_INTERVENTIONS.find(i => i.id === 'progressive-muscle-relaxation')!);
  }
  
  if (anxietyType === 'worries' || anxietyType === 'general') {
    recommendations.push(ANXIETY_INTERVENTIONS.find(i => i.id === 'worry-time-scheduled')!);
  }
  
  if (anxietyType === 'social' || anxietyType === 'specific_phobia') {
    if (experienceLevel !== 'beginner') {
      recommendations.push(ANXIETY_INTERVENTIONS.find(i => i.id === 'gradual-exposure')!);
    }
  }
  
  // Add cognitive and mindfulness for moderate/severe
  if (severity === 'moderate' || severity === 'severe') {
    recommendations.push(
      ANXIETY_INTERVENTIONS.find(i => i.id === 'cognitive-restructuring-anxiety')!,
      ANXIETY_INTERVENTIONS.find(i => i.id === 'mindfulness-for-anxiety')!
    );
  }
  
  // Everyone should have an action plan
  recommendations.push(ANXIETY_INTERVENTIONS.find(i => i.id === 'anxiety-action-plan')!);
  
  // Filter by difficulty
  return recommendations.filter(i => {
    if (experienceLevel === 'beginner') return i.difficulty === 'beginner';
    if (experienceLevel === 'intermediate') return i.difficulty !== 'advanced';
    return true;
  });
}

export function formatInterventionForAI(intervention: AnxietyIntervention): string {
  return `**${intervention.name}** (${intervention.duration})
${intervention.description}

Steps:
${intervention.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
}
