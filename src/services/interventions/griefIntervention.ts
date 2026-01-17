import { logger } from '../../utils/logger';

/**
 * Grief Intervention Service
 * Provides evidence-based interventions for coping with loss of loved ones
 */

export interface GriefIntervention {
  id: string;
  name: string;
  description: string;
  steps: string[];
  duration: string;
  technique: 'emotional_processing' | 'meaning_making' | 'rituals' | 'social_support' | 'self_compassion' | 'continuing_bonds';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  timeframe: 'immediate' | 'short_term' | 'long_term';
}

export const GRIEF_INTERVENTIONS: GriefIntervention[] = [
  {
    id: 'grief-immediate-support',
    name: 'Immediate Support After Loss',
    description: 'Essential steps to take care of yourself in the immediate aftermath of loss',
    steps: [
      'Allow yourself to feel whatever you\'re feeling - there\'s no "right" way to grieve',
      'Reach out to trusted family or friends (don\'t isolate)',
      'Accept help with practical tasks (meals, childcare, errands)',
      'Maintain basic self-care: eat, sleep, shower (even when it feels impossible)',
      'Don\'t make major decisions for the first few weeks/months if possible',
      'Be patient with yourself - grief is exhausting, both emotionally and physically',
      'Know that shock, numbness, denial are normal protective responses',
      'There\'s no timeline for grief - honor your own process'
    ],
    duration: 'First 1-3 months',
    technique: 'emotional_processing',
    difficulty: 'beginner',
    timeframe: 'immediate'
  },
  {
    id: 'grief-letter-writing',
    name: 'Letter Writing to the Deceased',
    description: 'Continue your bond through written communication',
    steps: [
      'Write a letter to your loved one (no rules - say whatever you need to say)',
      'Share what you miss about them',
      'Tell them about what\'s happening in your life',
      'Express things you didn\'t get to say (thank you, I\'m sorry, I love you)',
      'Write about your grief - how you\'re feeling, what\'s hard',
      'Write regularly (weekly, monthly, or whenever you need to)',
      'Keep the letters, or create a ritual to release them (burn, bury, send in a balloon)',
      'Read old letters to see how your grief has changed over time'
    ],
    duration: 'Ongoing (as needed)',
    technique: 'continuing_bonds',
    difficulty: 'beginner',
    timeframe: 'short_term'
  },
  {
    id: 'grief-memory-preservation',
    name: 'Preserving Memories and Legacy',
    description: 'Honor your loved one by keeping their memory alive',
    steps: [
      'Create a memory box or album with photos, mementos, letters',
      'Write down favorite memories, stories, things they said',
      'Cook their favorite foods, listen to their favorite music, visit places they loved',
      'Share stories about them with others who knew them',
      'Create a tradition or ritual to remember them (anniversary, birthday, holiday)',
      'Plant something in their memory, or donate to a cause they cared about',
      'Keep something of theirs that comforts you (a piece of clothing, jewelry, book)',
      'Know that keeping their memory alive is healthy - not "stuck in the past"'
    ],
    duration: 'Ongoing',
    technique: 'continuing_bonds',
    difficulty: 'beginner',
    timeframe: 'short_term'
  },
  {
    id: 'grief-gratitude-amidst-pain',
    name: 'Finding Gratitude Amidst Grief',
    description: 'Acknowledge gratitude without minimizing your loss',
    steps: [
      'Recognize: You can be grateful AND deeply sad at the same time',
      'Practice gratitude for having had the person in your life',
      'Be grateful for specific memories, lessons, or love they gave you',
      'Express gratitude for the support you\'re receiving from others',
      'Notice small moments of beauty or comfort (even in your pain)',
      'Write 1-2 things you\'re grateful for daily (even if small)',
      'Remember: Gratitude doesn\'t mean you should "move on" or stop grieving',
      'Allow gratitude and grief to coexist - both are valid'
    ],
    duration: 'Ongoing (daily or weekly)',
    technique: 'meaning_making',
    difficulty: 'intermediate',
    timeframe: 'short_term'
  },
  {
    id: 'grief-rituals-and-ceremonies',
    name: 'Creating Personal Rituals',
    description: 'Develop meaningful rituals to honor your loss and process grief',
    steps: [
      'Create a daily ritual (lighting a candle, saying their name, moment of silence)',
      'Mark special dates (birthdays, anniversaries) with meaningful activities',
      'Visit their grave or a special place (or create a memorial at home)',
      'Donate time or money to a cause they cared about in their memory',
      'Start a tradition that keeps their spirit alive (family gathering, annual activity)',
      'Create art, music, or writing that honors them',
      'Join others in remembrance (support groups, memorial events)',
      'Adjust rituals as your grief evolves - what feels right may change'
    ],
    duration: 'Ongoing',
    technique: 'rituals',
    difficulty: 'beginner',
    timeframe: 'short_term'
  },
  {
    id: 'grief-support-groups',
    name: 'Connecting with Others Who Understand',
    description: 'Find community with others experiencing loss',
    steps: [
      'Join a grief support group (in-person or online)',
      'Share your story - talking about your loss helps process it',
      'Listen to others\' stories - you\'re not alone in your pain',
      'Attend regularly (commitment helps build trust and support)',
      'Don\'t compare grief - everyone\'s experience is unique',
      'Consider specialized groups (loss of parent, spouse, child, suicide loss, etc.)',
      'Connect with people outside groups too (friends who also experienced loss)',
      'Remember: You don\'t have to "fix" anyone - just being present helps'
    ],
    duration: '3-12 months (or ongoing)',
    technique: 'social_support',
    difficulty: 'beginner',
    timeframe: 'short_term'
  },
  {
    id: 'grief-meaning-reconstruction',
    name: 'Finding Meaning After Loss',
    description: 'Reconstruct meaning and purpose in life after loss',
    steps: [
      'Reflect: What did their life teach you? What values did they embody?',
      'Consider: How can you live in a way that honors their memory?',
      'Identify: What still matters to you? What gives your life purpose?',
      'Explore: What would they want for you? What would make them proud?',
      'Practice: Living according to values they taught you or you shared',
      'Accept: Finding meaning doesn\'t mean you\'re "over" the loss',
      'Be patient: Meaning reconstruction happens gradually, over months/years',
      'Know: You can have a meaningful life AND still miss them deeply'
    ],
    duration: '6-24 months (gradual process)',
    technique: 'meaning_making',
    difficulty: 'advanced',
    timeframe: 'long_term'
  },
  {
    id: 'grief-self-compassion',
    name: 'Self-Compassion During Grief',
    description: 'Be kind and gentle with yourself as you navigate loss',
    steps: [
      'Acknowledge: "This is incredibly painful, and my feelings are valid"',
      'Recognize: "Many people experience loss - I\'m not alone in this pain"',
      'Be gentle: "What would I say to a close friend going through this?"',
      'Allow all emotions: sadness, anger, guilt, relief - all are normal',
      'Don\'t judge your grief: "Should be over it" - there\'s no timeline',
      'Practice self-care: Rest, nourishment, movement (even if minimal)',
      'Forgive yourself: For things you did or didn\'t say, for not being perfect',
      'Remember: Grieving is hard work - be proud you\'re doing it'
    ],
    duration: 'Ongoing (especially first year)',
    technique: 'self_compassion',
    difficulty: 'beginner',
    timeframe: 'immediate'
  }
];

export function getGriefIntervention(id: string): GriefIntervention | null {
  return GRIEF_INTERVENTIONS.find(intervention => intervention.id === id) || null;
}

export function getRecommendedInterventions(
  monthsSinceLoss: number, // 0-3 = immediate, 3-12 = short_term, 12+ = long_term
  primaryChallenge: 'emotional_overwhelm' | 'loneliness' | 'meaning_loss' | 'guilt' | 'numbness',
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): GriefIntervention[] {
  const recommendations: GriefIntervention[] = [];
  
  // Determine timeframe
  const timeframe = monthsSinceLoss <= 3 ? 'immediate' : 
                   monthsSinceLoss <= 12 ? 'short_term' : 'long_term';
  
  // Always start with immediate support and self-compassion
  if (timeframe === 'immediate') {
    recommendations.push(
      GRIEF_INTERVENTIONS.find(i => i.id === 'grief-immediate-support')!,
      GRIEF_INTERVENTIONS.find(i => i.id === 'grief-self-compassion')!
    );
  }
  
  // Challenge-specific recommendations
  if (primaryChallenge === 'loneliness') {
    recommendations.push(GRIEF_INTERVENTIONS.find(i => i.id === 'grief-support-groups')!);
  }
  
  if (primaryChallenge === 'emotional_overwhelm' || (timeframe === 'short_term' || timeframe === 'long_term')) {
    recommendations.push(
      GRIEF_INTERVENTIONS.find(i => i.id === 'grief-letter-writing')!,
      GRIEF_INTERVENTIONS.find(i => i.id === 'grief-rituals-and-ceremonies')!
    );
  }
  
  if (timeframe === 'short_term' || timeframe === 'long_term') {
    recommendations.push(GRIEF_INTERVENTIONS.find(i => i.id === 'grief-memory-preservation')!);
  }
  
  if (primaryChallenge === 'meaning_loss' || timeframe === 'long_term') {
    recommendations.push(
      GRIEF_INTERVENTIONS.find(i => i.id === 'grief-gratitude-amidst-pain')!,
      GRIEF_INTERVENTIONS.find(i => i.id === 'grief-meaning-reconstruction')!
    );
  }
  
  // Filter by difficulty and timeframe
  return recommendations.filter(i => {
    if (experienceLevel === 'beginner' && i.difficulty !== 'beginner') return false;
    if (experienceLevel === 'intermediate' && i.difficulty === 'advanced') return false;
    if (timeframe === 'immediate' && i.timeframe !== 'immediate') return false;
    return true;
  });
}

export function formatInterventionForAI(intervention: GriefIntervention): string {
  return `**${intervention.name}** (${intervention.duration})
${intervention.description}

Steps:
${intervention.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
}
