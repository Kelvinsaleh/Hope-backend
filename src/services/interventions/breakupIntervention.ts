import { logger } from '../../utils/logger';

/**
 * Breakup Intervention Service
 * Provides evidence-based interventions for coping with relationship breakups
 */

export interface BreakupIntervention {
  id: string;
  name: string;
  description: string;
  steps: string[];
  duration: string;
  technique: 'emotional_processing' | 'social_support' | 'self_compassion' | 'activity_scheduling' | 'cognitive_reframing' | 'boundary_setting';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  timeframe: 'immediate' | 'short_term' | 'long_term'; // When to use based on time since breakup
}

export const BREAKUP_INTERVENTIONS: BreakupIntervention[] = [
  {
    id: 'breakup-immediate-self-care',
    name: 'Immediate Self-Care After Breakup',
    description: 'Essential steps to take care of yourself in the immediate aftermath',
    steps: [
      'Allow yourself to feel your emotions - crying, anger, sadness are all valid',
      'Reach out to trusted friends or family (don\'t isolate)',
      'Maintain basic self-care: eat, sleep, shower (even when you don\'t feel like it)',
      'Remove or limit reminders (photos, messages) temporarily if they\'re too painful',
      'Set boundaries with your ex (no contact or limited contact if needed)',
      'Avoid major decisions for the first few weeks (moving, job changes)',
      'Practice gentle self-compassion: "This is hard, and I\'m doing my best"',
      'Take it one day (or hour) at a time - healing isn\'t linear'
    ],
    duration: 'First 2-4 weeks',
    technique: 'emotional_processing',
    difficulty: 'beginner',
    timeframe: 'immediate'
  },
  {
    id: 'breakup-grief-journaling',
    name: 'Grief Journaling for Breakup',
    description: 'Process emotions through structured writing',
    steps: [
      'Write about what you\'re feeling (no judgment, just observation)',
      'Acknowledge what you lost (the relationship, shared dreams, routine)',
      'Write about what you learned from the relationship',
      'Express gratitude for positive aspects (even if it ended)',
      'Write letters you won\'t send (to your ex, to yourself, to the relationship)',
      'Track your progress: How are you feeling compared to week 1?',
      'Write about hopes for your future self',
      'Review old entries to see your healing journey'
    ],
    duration: '4-8 weeks (daily or 3x/week)',
    technique: 'emotional_processing',
    difficulty: 'beginner',
    timeframe: 'short_term'
  },
  {
    id: 'breakup-no-contact-rule',
    name: 'No-Contact or Limited Contact Strategy',
    description: 'Create healthy boundaries to allow healing',
    steps: [
      'Decide on no contact (NC) or limited contact (LC) based on your situation',
      'If NC: Block/unfollow on social media, delete number (or save under "DO NOT CALL")',
      'If LC: Set clear rules (e.g., only for logistics, not emotional conversations)',
      'Tell mutual friends your boundaries (they don\'t need to choose sides)',
      'Remove reminders: Delete photos, put away gifts, change routines',
      'Prepare for contact urges: Write down why you chose NC/LC',
      'If you break NC/LC, don\'t beat yourself up - recommit to your boundary',
      'Re-evaluate after 30-60 days: Is contact helpful or harmful?'
    ],
    duration: '30-90 days minimum',
    technique: 'boundary_setting',
    difficulty: 'intermediate',
    timeframe: 'immediate'
  },
  {
    id: 'breakup-identity-rebuilding',
    name: 'Rebuilding Your Identity Post-Breakup',
    description: 'Rediscover who you are outside the relationship',
    steps: [
      'List activities/hobbies you stopped doing during the relationship',
      'List things you wanted to do but couldn\'t (travel, career, personal growth)',
      'Reconnect with friends you may have neglected',
      'Try one new activity per week (cooking class, hiking group, volunteer work)',
      'Reflect on your values - what matters to YOU (not "we")?',
      'Set personal goals (fitness, career, creative projects)',
      'Spend time alone doing things you enjoy (reconnect with yourself)',
      'Track progress: Who are you becoming? What do you like about yourself now?'
    ],
    duration: '3-6 months (ongoing)',
    technique: 'activity_scheduling',
    difficulty: 'intermediate',
    timeframe: 'long_term'
  },
  {
    id: 'breakup-cognitive-reframing',
    name: 'Reframing Thoughts About the Breakup',
    description: 'Challenge unhelpful thoughts and find balanced perspectives',
    steps: [
      'Identify painful thoughts: "I\'ll never find love again" or "It was all my fault"',
      'Challenge the thought: "Is this completely true? What evidence supports it?"',
      'Look for exceptions: "When have I overcome challenges before?"',
      'Reframe: "This relationship ended, but that doesn\'t mean I\'m unlovable"',
      'Acknowledge what you learned: "This taught me what I want/don\'t want"',
      'Focus on growth: "This pain is teaching me resilience"',
      'Use realistic optimism: "This is hard, AND I can heal and grow from it"',
      'Practice daily - reframing gets easier with time'
    ],
    duration: '4-8 weeks',
    technique: 'cognitive_reframing',
    difficulty: 'intermediate',
    timeframe: 'short_term'
  },
  {
    id: 'breakup-social-reconnection',
    name: 'Reconnecting with Social Support',
    description: 'Rebuild your social network and support system',
    steps: [
      'Reach out to friends you may have lost touch with',
      'Join social activities (meetups, hobby groups, volunteer work)',
      'Schedule regular social time (coffee, walks, activities) - force yourself if needed',
      'Don\'t rush into dating - take time to heal first',
      'Connect with others who\'ve been through breakups (support groups, online communities)',
      'Focus on quality connections over quantity',
      'Practice being alone and being with others (both are important)',
      'Be patient - rebuilding connections takes time'
    ],
    duration: '2-4 months (ongoing)',
    technique: 'social_support',
    difficulty: 'beginner',
    timeframe: 'short_term'
  },
  {
    id: 'breakup-self-compassion',
    name: 'Self-Compassion Through Breakup',
    description: 'Practice kindness toward yourself during this difficult time',
    steps: [
      'Acknowledge your pain: "This is really hard, and my feelings are valid"',
      'Recognize common humanity: "Many people go through breakups - I\'m not alone"',
      'Be kind to yourself: "What would I say to a friend going through this?"',
      'Challenge self-blame: "Relationships are complex - it\'s rarely one person\'s fault"',
      'Practice self-forgiveness: "I did my best with what I knew at the time"',
      'Use compassionate self-talk: "I\'m hurting, and that\'s okay. I will heal."',
      'Treat yourself with care (healthy food, rest, activities you enjoy)',
      'Remember: Healing takes time - there\'s no "right" timeline'
    ],
    duration: 'Ongoing (especially first 3 months)',
    technique: 'self_compassion',
    difficulty: 'beginner',
    timeframe: 'immediate'
  }
];

export function getBreakupIntervention(id: string): BreakupIntervention | null {
  return BREAKUP_INTERVENTIONS.find(intervention => intervention.id === id) || null;
}

export function getRecommendedInterventions(
  daysSinceBreakup: number, // 0-30 = immediate, 31-90 = short_term, 90+ = long_term
  primaryChallenge: 'emotional_pain' | 'loneliness' | 'identity_loss' | 'contact_urges' | 'self_blame',
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): BreakupIntervention[] {
  const recommendations: BreakupIntervention[] = [];
  
  // Determine timeframe
  const timeframe = daysSinceBreakup <= 30 ? 'immediate' : 
                   daysSinceBreakup <= 90 ? 'short_term' : 'long_term';
  
  // Always start with immediate self-care and self-compassion in early stages
  if (timeframe === 'immediate') {
    recommendations.push(
      BREAKUP_INTERVENTIONS.find(i => i.id === 'breakup-immediate-self-care')!,
      BREAKUP_INTERVENTIONS.find(i => i.id === 'breakup-self-compassion')!
    );
  }
  
  // Challenge-specific recommendations
  if (primaryChallenge === 'contact_urges' || timeframe === 'immediate') {
    recommendations.push(BREAKUP_INTERVENTIONS.find(i => i.id === 'breakup-no-contact-rule')!);
  }
  
  if (primaryChallenge === 'emotional_pain' || (timeframe === 'short_term' || timeframe === 'long_term')) {
    recommendations.push(
      BREAKUP_INTERVENTIONS.find(i => i.id === 'breakup-grief-journaling')!,
      BREAKUP_INTERVENTIONS.find(i => i.id === 'breakup-cognitive-reframing')!
    );
  }
  
  if (primaryChallenge === 'loneliness') {
    recommendations.push(BREAKUP_INTERVENTIONS.find(i => i.id === 'breakup-social-reconnection')!);
  }
  
  if (primaryChallenge === 'identity_loss' || timeframe === 'long_term') {
    recommendations.push(BREAKUP_INTERVENTIONS.find(i => i.id === 'breakup-identity-rebuilding')!);
  }
  
  if (primaryChallenge === 'self_blame') {
    recommendations.push(
      BREAKUP_INTERVENTIONS.find(i => i.id === 'breakup-self-compassion')!,
      BREAKUP_INTERVENTIONS.find(i => i.id === 'breakup-cognitive-reframing')!
    );
  }
  
  // Filter by difficulty and timeframe
  return recommendations.filter(i => {
    if (experienceLevel === 'beginner' && i.difficulty !== 'beginner') return false;
    if (experienceLevel === 'intermediate' && i.difficulty === 'advanced') return false;
    if (timeframe === 'immediate' && i.timeframe !== 'immediate') return false;
    if (timeframe === 'short_term' && i.timeframe === 'long_term') return false;
    return true;
  });
}

export function formatInterventionForAI(intervention: BreakupIntervention): string {
  return `**${intervention.name}** (${intervention.duration})
${intervention.description}

Steps:
${intervention.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
}
