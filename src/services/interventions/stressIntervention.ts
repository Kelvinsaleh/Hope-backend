import { logger } from '../../utils/logger';

/**
 * Stress Management Intervention Service
 * Provides evidence-based interventions for stress management
 */

export interface StressIntervention {
  id: string;
  name: string;
  description: string;
  steps: string[];
  duration: string;
  technique: 'time_management' | 'problem_solving' | 'relaxation' | 'mindfulness' | 'boundary_setting' | 'cognitive_reframing';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export const STRESS_INTERVENTIONS: StressIntervention[] = [
  {
    id: 'stress-identification',
    name: 'Stress Identification & Awareness',
    description: 'Recognize early signs of stress to intervene before it escalates',
    steps: [
      'List your physical stress signs (headache, tense shoulders, stomach issues, fatigue)',
      'List your emotional stress signs (irritability, overwhelm, anxiety, sadness)',
      'List your behavioral stress signs (procrastination, poor sleep, overeating, withdrawing)',
      'Notice these signs throughout the day - check in with yourself 3x daily',
      'When you notice early signs, rate your stress (1-10)',
      'Identify what triggered the stress (specific situation, thought, demand)',
      'Take one small action to address it (breathing, break, boundary)',
      'Track patterns - what situations consistently trigger stress?'
    ],
    duration: '1-2 weeks to build awareness',
    technique: 'cognitive_reframing',
    difficulty: 'beginner'
  },
  {
    id: 'time-blocking',
    name: 'Time Blocking & Priority Management',
    description: 'Structure your time to reduce overwhelm and increase control',
    steps: [
      'List all your tasks/responsibilities for the week',
      'Categorize: Must do (urgent), Should do (important), Nice to do (optional)',
      'Block specific time slots in your calendar for "must do" tasks',
      'Include buffer time between tasks (15-30 min) for unexpected things',
      'Schedule breaks and self-care as non-negotiable time blocks',
      'Learn to say "not this week" to low-priority tasks',
      'Review at end of week: What worked? What needs adjustment?',
      'Adjust your system based on what actually helps reduce stress'
    ],
    duration: '2-3 weeks to establish the habit',
    technique: 'time_management',
    difficulty: 'intermediate'
  },
  {
    id: 'problem-solving-stress',
    name: 'Structured Problem-Solving for Stress',
    description: 'Systematically address problems that cause stress',
    steps: [
      'Define the problem clearly (be specific, not vague)',
      'List all possible solutions (brainstorm without judging yet)',
      'For each solution, list pros and cons',
      'Choose the best solution (or combination) based on pros/cons',
      'Break the solution into small, actionable steps',
      'Take the first step (even if it\'s tiny)',
      'Evaluate: Did it help? What needs adjustment?',
      'If it didn\'t work, try the next solution on your list'
    ],
    duration: 'Use as needed for specific problems',
    technique: 'problem_solving',
    difficulty: 'intermediate'
  },
  {
    id: 'boundary-setting',
    name: 'Setting Healthy Boundaries',
    description: 'Protect your time and energy by setting clear limits',
    steps: [
      'Identify situations where you feel drained or resentful (boundary violations)',
      'Define what you need (more time, less requests, respect for your limits)',
      'Practice saying "no" to low-priority requests (start small)',
      'Use clear communication: "I can\'t take that on right now, but I can [alternative]"',
      'Set work-life boundaries (e.g., no work emails after 6 PM)',
      'Set social boundaries (e.g., "I need time to recharge, can we reschedule?")',
      'Be consistent - boundaries only work if you enforce them',
      'Remember: Setting boundaries is self-care, not selfishness'
    ],
    duration: 'Ongoing (practice and refine)',
    technique: 'boundary_setting',
    difficulty: 'intermediate'
  },
  {
    id: 'stress-breathing',
    name: 'Diaphragmatic Breathing for Stress',
    description: 'Deep breathing technique to activate the relaxation response',
    steps: [
      'Sit or lie comfortably, place one hand on chest, one on stomach',
      'Breathe in slowly through your nose (4 counts), let stomach expand (hand rises)',
      'Hold for 2-3 counts',
      'Exhale slowly through your mouth (6 counts), let stomach fall (hand lowers)',
      'Chest hand should stay relatively still - breathing comes from diaphragm',
      'Repeat 6-10 times',
      'Practice 2-3 times daily (morning, afternoon, evening)',
      'Use during stressful moments to activate relaxation response'
    ],
    duration: '5-10 minutes daily (use as needed)',
    technique: 'relaxation',
    difficulty: 'beginner'
  },
  {
    id: 'mindfulness-stress',
    name: 'Mindfulness for Daily Stress',
    description: 'Stay present and reduce stress through mindful awareness',
    steps: [
      'Choose one daily activity to do mindfully (eating, showering, walking)',
      'Focus fully on that activity - notice sights, sounds, sensations',
      'When your mind wanders to worries, gently return to the present moment',
      'Practice "mindful minutes" - 2-3 times daily, pause and notice your breath',
      'During stressful moments, take 3 mindful breaths before reacting',
      'Use the "STOP" technique: Stop, Take a breath, Observe (what\'s happening?), Proceed mindfully',
      'Notice stress without judgment: "I feel stressed right now. That\'s okay."',
      'Regular practice (10 min daily) builds resilience to stress'
    ],
    duration: '10 minutes daily (ongoing)',
    technique: 'mindfulness',
    difficulty: 'beginner'
  },
  {
    id: 'reframe-stress',
    name: 'Cognitive Reframing for Stress',
    description: 'Change how you think about stressors to reduce their impact',
    steps: [
      'Identify a stressful thought (e.g., "I can\'t handle all this")',
      'Challenge the thought: "Is this completely true? What evidence supports it?"',
      'Look for exceptions: "When have I handled similar situations before?"',
      'Reframe from threat to challenge: "This is difficult, but manageable"',
      'Reframe from permanent to temporary: "This is tough right now, not forever"',
      'Focus on what you can control vs. what you can\'t',
      'Use realistic optimism: "This is hard, AND I have resources to cope"',
      'Practice daily - reframing becomes easier with repetition'
    ],
    duration: '2-3 weeks to build the habit',
    technique: 'cognitive_reframing',
    difficulty: 'intermediate'
  },
  {
    id: 'stress-recovery-routine',
    name: 'Daily Stress Recovery Routine',
    description: 'Build resilience through regular stress-recovery practices',
    steps: [
      'Morning routine (5-10 min): Breathing, gratitude, set intention for the day',
      'Midday break (5 min): Step away, stretch, mindful breathing',
      'Evening wind-down (15-30 min): Disconnect from work, light activity, relaxation',
      'Weekly recovery: One longer activity that recharges you (nature, hobby, social connection)',
      'Track what activities actually help you recover (vs. what drains you)',
      'Make recovery non-negotiable (schedule it like important meetings)',
      'Adjust routines based on what works for your lifestyle',
      'Consistency matters more than perfection - small daily practices build resilience'
    ],
    duration: 'Ongoing (build the habit over 3-4 weeks)',
    technique: 'relaxation',
    difficulty: 'beginner'
  }
];

export function getStressIntervention(id: string): StressIntervention | null {
  return STRESS_INTERVENTIONS.find(intervention => intervention.id === id) || null;
}

export function getRecommendedInterventions(
  stressSource: 'work' | 'relationships' | 'time_pressure' | 'life_changes' | 'general',
  severity: 'mild' | 'moderate' | 'severe',
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): StressIntervention[] {
  const recommendations: StressIntervention[] = [];
  
  // Core: stress awareness and breathing
  recommendations.push(
    STRESS_INTERVENTIONS.find(i => i.id === 'stress-identification')!,
    STRESS_INTERVENTIONS.find(i => i.id === 'stress-breathing')!
  );
  
  // Source-specific recommendations
  if (stressSource === 'work' || stressSource === 'time_pressure') {
    recommendations.push(STRESS_INTERVENTIONS.find(i => i.id === 'time-blocking')!);
  }
  
  if (stressSource === 'relationships' || stressSource === 'general') {
    recommendations.push(STRESS_INTERVENTIONS.find(i => i.id === 'boundary-setting')!);
  }
  
  // Add problem-solving and reframing for moderate/severe stress
  if (severity === 'moderate' || severity === 'severe') {
    recommendations.push(
      STRESS_INTERVENTIONS.find(i => i.id === 'problem-solving-stress')!,
      STRESS_INTERVENTIONS.find(i => i.id === 'reframe-stress')!
    );
  }
  
  // Everyone benefits from mindfulness and recovery routines
  recommendations.push(
    STRESS_INTERVENTIONS.find(i => i.id === 'mindfulness-stress')!,
    STRESS_INTERVENTIONS.find(i => i.id === 'stress-recovery-routine')!
  );
  
  // Filter by difficulty
  return recommendations.filter(i => {
    if (experienceLevel === 'beginner') return i.difficulty === 'beginner';
    if (experienceLevel === 'intermediate') return i.difficulty !== 'advanced';
    return true;
  });
}

export function formatInterventionForAI(intervention: StressIntervention): string {
  return `**${intervention.name}** (${intervention.duration})
${intervention.description}

Steps:
${intervention.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
}
