import { logger } from '../../utils/logger';

/**
 * Depression Intervention Service
 * Provides evidence-based interventions for depression (Behavioral Activation, CBT, etc.)
 */

export interface DepressionIntervention {
  id: string;
  name: string;
  description: string;
  steps: string[];
  duration: string;
  technique: 'behavioral_activation' | 'activity_scheduling' | 'cognitive_reframing' | 'social_engagement' | 'self_compassion';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export const DEPRESSION_INTERVENTIONS: DepressionIntervention[] = [
  {
    id: 'behavioral-activation-start',
    name: 'Behavioral Activation - Getting Started',
    description: 'Counteract depression by gradually increasing meaningful activities',
    steps: [
      'Track your mood and activities for 3-5 days (note what activities improve your mood)',
      'Identify 1-2 activities you used to enjoy but stopped doing (even small ones)',
      'Schedule ONE of these activities for the next 2-3 days (start small: 10-15 minutes)',
      'Plan the activity: What? When? Where? Who with (optional)?',
      'Commit to doing it even if you don\'t feel like it (depression often lies)',
      'After completing it, rate your mood before vs. after (1-10 scale)',
      'Build on success: If it helped even slightly, schedule it again',
      'Gradually add more activities over 2-4 weeks (aim for 2-3 meaningful activities per week)'
    ],
    duration: '4-8 weeks',
    technique: 'behavioral_activation',
    difficulty: 'beginner'
  },
  {
    id: 'activity-scheduling',
    name: 'Activity Scheduling & Mood Mapping',
    description: 'Structure your day with activities that have mood-boosting potential',
    steps: [
      'Create a weekly schedule with hour-by-hour slots',
      'Categorize activities: Mastery (accomplishments), Pleasure (enjoyment), Social (connection)',
      'Aim for balance: Include at least 1 mastery, 1 pleasure, and 1 social activity per day',
      'Start small: 10-30 minute activities are fine (better than doing nothing)',
      'Schedule activities for specific times (don\'t leave it vague like "sometime today")',
      'After each activity, rate your mood (1-10) and energy level (1-10)',
      'Identify patterns: Which activity types boost your mood most?',
      'Adjust your schedule weekly based on what works'
    ],
    duration: '4-6 weeks',
    technique: 'activity_scheduling',
    difficulty: 'intermediate'
  },
  {
    id: 'opposite-action',
    name: 'Opposite Action Strategy',
    description: 'Do the opposite of what depression tells you to do',
    steps: [
      'Notice when depression urges withdrawal/isolation: "I don\'t want to see anyone"',
      'Identify the opposite action: Instead of isolating, reach out to one person',
      'Notice when depression urges inactivity: "I just want to stay in bed"',
      'Identify the opposite action: Instead of staying in bed, get up and do one small thing',
      'Start with "just 5 minutes": Commit to doing the opposite action for just 5 minutes',
      'Often, momentum builds and you continue past 5 minutes',
      'Track results: Did opposite action improve or worsen your mood?',
      'Use this data to motivate future opposite actions'
    ],
    duration: '2-3 weeks',
    technique: 'behavioral_activation',
    difficulty: 'beginner'
  },
  {
    id: 'social-reconnection',
    name: 'Gradual Social Reconnection',
    description: 'Rebuild social connections that depression may have disrupted',
    steps: [
      'Make a list of 3-5 people you feel comfortable with (friends, family, colleagues)',
      'Start with low-pressure contact: Send a text, comment on social media, or make a brief call',
      'If that goes well, schedule a brief in-person meetup (30-60 minutes)',
      'Choose low-stress activities: Coffee, walk, lunch, shared hobby',
      'Don\'t feel pressured to share everything—just being around people helps',
      'If socializing feels too hard, start with online communities or support groups',
      'Set realistic expectations: Some interactions will feel awkward at first (that\'s normal)',
      'Focus on quality over quantity: One meaningful connection is better than many superficial ones'
    ],
    duration: '3-6 weeks',
    technique: 'social_engagement',
    difficulty: 'intermediate'
  },
  {
    id: 'self-compassion-practice',
    name: 'Self-Compassion for Depression',
    description: 'Replace self-criticism with self-kindness and understanding',
    steps: [
      'Notice when you\'re being self-critical: "I\'m so lazy/unlovable/pathetic"',
      'Ask: "Would I say this to a friend going through the same thing?" (Usually the answer is no)',
      'Reframe: "I\'m struggling with depression, which is real and treatable. This is not my fault."',
      'Practice self-kindness: "It\'s okay that I\'m struggling. I\'m doing my best right now."',
      'Acknowledge common humanity: "Many people struggle with depression. I\'m not alone in this."',
      'Be mindful: "I\'m having a depressive thought, but it doesn\'t define me."',
      'Use compassionate self-talk regularly, especially during difficult moments',
      'Write down compassionate statements and read them when you\'re struggling'
    ],
    duration: 'Ongoing',
    technique: 'self_compassion',
    difficulty: 'intermediate'
  },
  {
    id: 'small-wins-tracking',
    name: 'Small Wins & Accomplishment Tracking',
    description: 'Focus on small accomplishments to counteract depression\'s tendency to minimize achievements',
    steps: [
      'Each day, write down 2-3 things you accomplished (even tiny ones count)',
      'Examples: Got out of bed, showered, made breakfast, sent an email, went for a walk, called someone',
      'At the end of the week, review your list and acknowledge the progress',
      'Notice patterns: "I actually did more than I thought"',
      'Celebrate small wins with self-acknowledgment (not just big achievements)',
      'Share wins with Hope AI or a trusted person (externalizing helps)',
      'When depression says "you did nothing," refer to your written list as evidence',
      'Build on small wins: "If I can do X, maybe I can also do Y"'
    ],
    duration: 'Ongoing',
    technique: 'behavioral_activation',
    difficulty: 'beginner'
  }
];

export function getDepressionIntervention(id: string): DepressionIntervention | null {
  return DEPRESSION_INTERVENTIONS.find(intervention => intervention.id === id) || null;
}

export function getRecommendedInterventions(
  depressionSeverity: 'mild' | 'moderate' | 'severe',
  primarySymptom: 'low_mood' | 'loss_interest' | 'fatigue' | 'isolation' | 'self_criticism',
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): DepressionIntervention[] {
  const recommendations: DepressionIntervention[] = [];
  
  // Core intervention for all: Behavioral Activation
  recommendations.push(DEPRESSION_INTERVENTIONS.find(i => i.id === 'behavioral-activation-start')!);
  
  // Symptom-specific recommendations
  if (primarySymptom === 'loss_interest' || primarySymptom === 'low_mood') {
    recommendations.push(
      DEPRESSION_INTERVENTIONS.find(i => i.id === 'activity-scheduling')!,
      DEPRESSION_INTERVENTIONS.find(i => i.id === 'small-wins-tracking')!
    );
  }
  
  if (primarySymptom === 'isolation') {
    recommendations.push(DEPRESSION_INTERVENTIONS.find(i => i.id === 'social-reconnection')!);
  }
  
  if (primarySymptom === 'self_criticism') {
    recommendations.push(DEPRESSION_INTERVENTIONS.find(i => i.id === 'self-compassion-practice')!);
  }
  
  if (primarySymptom === 'fatigue' || depressionSeverity === 'moderate') {
    recommendations.push(DEPRESSION_INTERVENTIONS.find(i => i.id === 'opposite-action')!);
  }
  
  // Filter by difficulty
  return recommendations.filter(i => {
    if (experienceLevel === 'beginner') return i.difficulty === 'beginner';
    if (experienceLevel === 'intermediate') return i.difficulty !== 'advanced';
    return true;
  });
}

export function formatInterventionForAI(intervention: DepressionIntervention): string {
  return `**${intervention.name}** (${intervention.duration})
${intervention.description}

Steps:
${intervention.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
}
