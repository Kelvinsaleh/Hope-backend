import { logger } from '../../utils/logger';

/**
 * Focus & Discipline Intervention Service
 * Provides evidence-based interventions for improving focus, attention, and self-discipline
 */

export interface FocusIntervention {
  id: string;
  name: string;
  description: string;
  steps: string[];
  duration: string;
  technique: 'pomodoro' | 'habit_stack' | 'environment_design' | 'mindfulness' | 'goal_setting' | 'distraction_management';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export const FOCUS_INTERVENTIONS: FocusIntervention[] = [
  {
    id: 'pomodoro-technique',
    name: 'Pomodoro Technique',
    description: 'Work in focused 25-minute intervals with short breaks',
    steps: [
      'Choose a task to focus on',
      'Set a timer for 25 minutes (work period)',
      'Work on ONLY that task until the timer rings',
      'Take a 5-minute break (stand up, stretch, hydrate)',
      'Repeat 3-4 times, then take a longer break (15-30 minutes)',
      'If interrupted, note it and return to task (don\'t reset timer)',
      'Track completed pomodoros to see your productivity',
      'Adjust timer duration based on your focus span (15-45 min)'
    ],
    duration: '2-3 weeks to build the habit',
    technique: 'pomodoro',
    difficulty: 'beginner'
  },
  {
    id: 'two-minute-rule',
    name: 'Two-Minute Rule for Getting Started',
    description: 'Overcome procrastination by committing to just 2 minutes',
    steps: [
      'If a task takes less than 2 minutes, do it immediately',
      'For larger tasks, commit to just 2 minutes to start',
      'After 2 minutes, you can stop (but often momentum keeps you going)',
      'Use this to break the barrier of starting (starting is the hardest part)',
      'Apply to exercise, work tasks, cleaning, phone calls',
      'Track "2-minute wins" - celebrate every time you start',
      'Build on success: "I did 2 minutes yesterday, I can do 3 today"',
      'Remember: Progress, not perfection - 2 minutes is better than 0'
    ],
    duration: '1-2 weeks to establish the habit',
    technique: 'habit_stack',
    difficulty: 'beginner'
  },
  {
    id: 'focus-environment-design',
    name: 'Design Your Environment for Focus',
    description: 'Remove distractions and create a space conducive to focus',
    steps: [
      'Designate a specific space for focused work (desk, table, quiet corner)',
      'Remove visible distractions (phone, TV, clutter)',
      'Keep only what you need for the current task visible',
      'Use noise-canceling headphones or ambient noise if helpful',
      'Set up your space the night before (reduce friction in the morning)',
      'Create "focus mode" on devices (block social media, notifications)',
      'Tell others your focus hours (family, colleagues) so they respect your time',
      'Make starting easier than stopping (reduce activation energy)'
    ],
    duration: 'Ongoing (refine as needed)',
    technique: 'environment_design',
    difficulty: 'beginner'
  },
  {
    id: 'mindful-focus-practice',
    name: 'Mindfulness for Focus',
    description: 'Train your attention through mindfulness practice',
    steps: [
      'Start with 5 minutes daily - sit comfortably, close eyes',
      'Focus on your breath - notice each inhale and exhale',
      'When your mind wanders (it will), gently return to the breath',
      'Practice this daily - it trains your "attention muscle"',
      'Apply mindfulness to tasks: fully engage with one thing at a time',
      'When distracted, notice it without judgment, return to task',
      'Build up to 10-20 minutes daily for best results',
      'Notice how your focus improves over weeks of practice'
    ],
    duration: '4-8 weeks for noticeable improvement',
    technique: 'mindfulness',
    difficulty: 'beginner'
  },
  {
    id: 'habit-stacking',
    name: 'Habit Stacking for Discipline',
    description: 'Link new habits to existing ones to build consistency',
    steps: [
      'Identify an existing habit you do daily (coffee, brushing teeth, checking phone)',
      'Choose a new habit you want to build (exercise, reading, meditation)',
      'Stack: "After [existing habit], I will [new habit]"',
      'Start small: "After morning coffee, I will do 5 push-ups"',
      'Be specific: "After I brush my teeth, I will write for 10 minutes"',
      'Track your stack: Did you complete the new habit after the trigger?',
      'Add more links: Once one habit is solid, add another',
      'Example stack: Coffee → Exercise → Shower → Journal → Work'
    ],
    duration: '3-4 weeks to establish each habit in the stack',
    technique: 'habit_stack',
    difficulty: 'intermediate'
  },
  {
    id: 'time-blocking-focus',
    name: 'Time Blocking for Deep Work',
    description: 'Schedule focused work blocks in your calendar',
    steps: [
      'Identify your peak focus times (morning person? afternoon?)',
      'Block 2-4 hour chunks for deep, focused work',
      'During these blocks, only do the planned task (no email, no meetings)',
      'Protect these blocks like important appointments (say no to distractions)',
      'Schedule easier tasks (email, admin) in your lower-energy times',
      'Use color-coding: Green = deep work, Yellow = medium focus, Red = breaks',
      'Review weekly: Which blocks were most productive? Adjust schedule',
      'Start with 1-2 blocks per week, build up gradually'
    ],
    duration: '2-3 weeks to establish the routine',
    technique: 'goal_setting',
    difficulty: 'intermediate'
  },
  {
    id: 'distraction-delay-technique',
    name: 'Distraction Delay Technique',
    description: 'Handle distractions without losing focus',
    steps: [
      'When a distraction arises (thought, urge to check phone), note it',
      'Write it down briefly (don\'t act on it) - "Check email" on a notepad',
      'Return to your current task immediately',
      'Schedule time later to address the distraction (e.g., after current task)',
      'After completing your focus block, review your list - are these still urgent?',
      'Practice this 10-20 times: most distractions are not urgent',
      'Notice: Most distractions lose their urgency when delayed',
      'Build the muscle: "I can handle this later" becomes easier with practice'
    ],
    duration: '2-3 weeks to build the habit',
    technique: 'distraction_management',
    difficulty: 'intermediate'
  },
  {
    id: 'single-tasking-mastery',
    name: 'Single-Tasking Practice',
    description: 'Train yourself to do one thing at a time with full attention',
    steps: [
      'Choose one task to focus on (no multitasking)',
      'Remove all other distractions (phone in another room, close other tabs)',
      'Set an intention: "For the next [X] minutes, I\'m only doing [task]"',
      'When you notice yourself wanting to switch tasks, pause',
      'Remind yourself: "One thing at a time" and return to current task',
      'Practice daily: Start with 15 minutes, build to 60+ minutes',
      'Notice how much more you accomplish with focused attention',
      'Apply to everything: Eating (no phone), conversations (put phone away), work'
    ],
    duration: '3-4 weeks to see significant improvement',
    technique: 'mindfulness',
    difficulty: 'intermediate'
  },
  {
    id: 'implementation-intentions',
    name: 'If-Then Planning (Implementation Intentions)',
    description: 'Create specific plans for when and how to act',
    steps: [
      'Identify a goal or habit you want to achieve',
      'Create an "if-then" plan: "IF [situation], THEN [action]"',
      'Be specific: "IF it\'s 7 AM, THEN I will exercise for 20 minutes"',
      'Anticipate obstacles: "IF I feel too tired, THEN I will do 10 minutes instead"',
      'Write down your if-then plans (makes them more likely to stick)',
      'Review plans daily: Visualize yourself following through',
      'Start with 1-3 if-then plans, add more as they become automatic',
      'Example: "IF I open social media during work, THEN I will close it and do 5 deep breaths"'
    ],
    duration: '2-3 weeks to establish automatic responses',
    technique: 'goal_setting',
    difficulty: 'beginner'
  }
];

export function getFocusIntervention(id: string): FocusIntervention | null {
  return FOCUS_INTERVENTIONS.find(intervention => intervention.id === id) || null;
}

export function getRecommendedInterventions(
  primaryChallenge: 'procrastination' | 'distractions' | 'lack_of_routine' | 'overwhelm' | 'low_motivation',
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
): FocusIntervention[] {
  const recommendations: FocusIntervention[] = [];
  
  // Core: Environment design and two-minute rule
  recommendations.push(
    FOCUS_INTERVENTIONS.find(i => i.id === 'focus-environment-design')!,
    FOCUS_INTERVENTIONS.find(i => i.id === 'two-minute-rule')!
  );
  
  // Challenge-specific recommendations
  if (primaryChallenge === 'procrastination' || primaryChallenge === 'low_motivation') {
    recommendations.push(
      FOCUS_INTERVENTIONS.find(i => i.id === 'two-minute-rule')!,
      FOCUS_INTERVENTIONS.find(i => i.id === 'implementation-intentions')!
    );
  }
  
  if (primaryChallenge === 'distractions') {
    recommendations.push(
      FOCUS_INTERVENTIONS.find(i => i.id === 'distraction-delay-technique')!,
      FOCUS_INTERVENTIONS.find(i => i.id === 'single-tasking-mastery')!
    );
  }
  
  if (primaryChallenge === 'lack_of_routine' || primaryChallenge === 'overwhelm') {
    recommendations.push(
      FOCUS_INTERVENTIONS.find(i => i.id === 'pomodoro-technique')!,
      FOCUS_INTERVENTIONS.find(i => i.id === 'time-blocking-focus')!,
      FOCUS_INTERVENTIONS.find(i => i.id === 'habit-stacking')!
    );
  }
  
  // Everyone benefits from mindfulness
  recommendations.push(FOCUS_INTERVENTIONS.find(i => i.id === 'mindful-focus-practice')!);
  
  // Filter by difficulty
  return recommendations.filter(i => {
    if (experienceLevel === 'beginner') return i.difficulty === 'beginner';
    if (experienceLevel === 'intermediate') return i.difficulty !== 'advanced';
    return true;
  });
}

export function formatInterventionForAI(intervention: FocusIntervention): string {
  return `**${intervention.name}** (${intervention.duration})
${intervention.description}

Steps:
${intervention.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
}
