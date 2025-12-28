import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

interface HopeExpressions {
  microExpressions: {
    [mood: string]: {
      affirmations: string[];
      reflections: string[];
      questions: string[];
    };
  };
  depthCues: {
    reflective: string[];
    curious: string[];
    grounding: string[];
    hopeful: string[];
  };
  toneProfiles: {
    [mood: string]: {
      name: string;
      temperature: string;
      energy: string;
      approach: string;
    };
  };
}

let expressionsCache: HopeExpressions | null = null;

/**
 * Load Hope's personality expressions from JSON
 */
export function loadHopeExpressions(): HopeExpressions {
  if (expressionsCache) {
    return expressionsCache;
  }

  try {
    const configPath = path.join(__dirname, '../config/hope-expressions.json');
    const data = fs.readFileSync(configPath, 'utf-8');
    expressionsCache = JSON.parse(data);
    logger.info('Hope personality expressions loaded successfully');
    return expressionsCache!;
  } catch (error) {
    logger.error('Failed to load Hope expressions, using defaults', error);
    // Return minimal defaults if file not found
    return {
      microExpressions: {
        neutral: {
          affirmations: ['yeah', 'I hear you', 'okay'],
          reflections: ['that makes sense'],
          questions: ['what\'s on your mind?']
        }
      },
      depthCues: {
        reflective: ['yeah', 'you know'],
        curious: ['what do you think?'],
        grounding: ['take a breath'],
        hopeful: ['you\'ve got this']
      },
      toneProfiles: {
        neutral: {
          name: 'Observant & Open',
          temperature: 'balanced',
          energy: 'curious, receptive',
          approach: 'Stay curious and observant. Follow where they want to go.'
        }
      }
    };
  }
}

/**
 * Get a random micro-expression for a given mood
 */
export function getRandomExpression(mood: string, type: 'affirmations' | 'reflections' | 'questions' = 'affirmations'): string {
  const expressions = loadHopeExpressions();
  const moodExpressions = expressions.microExpressions[mood.toLowerCase()] || expressions.microExpressions['neutral'];
  const pool = moodExpressions[type];
  
  if (!pool || pool.length === 0) {
    return '';
  }
  
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get a random depth cue
 */
export function getRandomDepthCue(type: 'reflective' | 'curious' | 'grounding' | 'hopeful'): string {
  const expressions = loadHopeExpressions();
  const pool = expressions.depthCues[type];
  
  if (!pool || pool.length === 0) {
    return '';
  }
  
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get tone profile for a mood
 */
export function getToneProfile(mood: string) {
  const expressions = loadHopeExpressions();
  return expressions.toneProfiles[mood.toLowerCase()] || expressions.toneProfiles['neutral'];
}

/**
 * Normalize mood string to match our expressions
 */
export function normalizeMood(mood: string | number): string {
  // If mood is a number (1-10 scale from mood tracker)
  if (typeof mood === 'number') {
    if (mood >= 8) return 'happy';
    if (mood >= 6) return 'calm';
    if (mood >= 4) return 'neutral';
    if (mood >= 2) return 'sad';
    return 'stressed';
  }

  // If mood is a string, normalize it
  const moodLower = mood.toLowerCase().trim();
  
  // Map common mood variations
  const moodMap: { [key: string]: string } = {
    'excited': 'happy',
    'joyful': 'happy',
    'content': 'calm',
    'peaceful': 'calm',
    'relaxed': 'calm',
    'worried': 'anxious',
    'nervous': 'anxious',
    'depressed': 'sad',
    'down': 'sad',
    'low': 'sad',
    'overwhelmed': 'stressed',
    'pressured': 'stressed',
    'exhausted': 'tired',
    'drained': 'tired',
    'frustrated': 'angry',
    'mad': 'angry',
    'isolated': 'lonely',
    'alone': 'lonely',
    'thankful': 'grateful',
    'appreciative': 'grateful',
    'optimistic': 'hopeful',
    'encouraged': 'hopeful'
  };

  return moodMap[moodLower] || moodLower;
}

/**
 * CORE PERSONALITY PROMPT — "Hope"
 * ---------------------------------------------------------
 * This function returns the full system/context prompt for Hope,
 * an AI Therapist who speaks like a calm, grounded human—warm, honest, and emotionally intelligent.
 *
 * KEY PRINCIPLES (Refined as of Nov 2025):
 *  - Always acknowledge emotions first, then give clear perspective or advice (not vague reassurance).
 *  - Speak real: empathetic but direct, like a trusted friend who actually gets life.
 *  - Never dodge questions — give a direct answer or truth, then guidance if natural.
 *  - Tone: calm, respectful, confident — never robotic, preachy, or overly soft.
 *  - Focus on emotional clarity, self-respect, and growth.
 *  - End most replies with a grounding or encouraging tone ("You’ve got this.", "Protect your peace.").
 *  - Goal: the user should feel understood, steady, and clear about what to do next — not forced into "steps" every time.
 *  - NEVER lose this persona: all AI chat prompts MUST include this foundation.
 * ---------------------------------------------------------
 */
export function buildHopePrompt(userMood: string | number, conversationHistory: string, userContext: string): string {
  const mood = normalizeMood(userMood);
  const toneProfile = getToneProfile(mood);

  return `You are Hope, an AI Therapist who speaks like a calm, grounded human — warm, honest, and emotionally intelligent.
  You always sound real: empathetic but direct, like a trusted friend who actually gets life.
  Acknowledge emotions first, then respond with clear perspective or advice — not vague reassurance.
  Never dodge questions — give a direct answer or truth, then add guidance only if it feels natural.
  Keep your tone balanced: calm, respectful, and confident — never robotic, preachy, or overly soft.
  Focus on emotional clarity, self-respect, and growth.
  End most replies with a grounding or encouraging tone ("You've got this." "Protect your peace.").
  Your goal: make the user feel understood, steady, and clear about what to do next — without forcing a "step-by-step" every time.

**Current Mode:** ${toneProfile.name} (${toneProfile.energy})
**Approach:** ${toneProfile.approach}

// --- Context Awareness ---
What you know about the user:
${userContext || "(First conversation)"}

Recent conversation:
${conversationHistory}

// --- Engagement & Conversation Guidelines ---
Your goal is to engage the user naturally and help them reflect on their thoughts and feelings. Follow these principles:

1. **Ask questions sparingly and strategically**, not all at once. Avoid bombarding the user with multiple questions.
2. **Encourage the user to explore one topic at a time** rather than jumping between different subjects.
3. **Use empathetic and supportive language** instead of robotic or overly formal tone. Speak like a real person.
4. **Avoid repetitive or irrelevant questions**. Pay attention to what the user has already shared.
5. **Offer gentle prompts** when appropriate, such as "Would you like to tell me more about that?" or "How did that make you feel?" But use these thoughtfully, not after every response.
6. **Balance listening and asking**: Prioritize reflecting on user input before asking new questions. Show you're listening by acknowledging what they've said.
7. **Adapt your questions based on the user's emotional state and responses**. If they seem overwhelmed, slow down. If they're ready to explore, gently guide deeper.
8. **End each interaction with a positive, encouraging note** when appropriate, but make it genuine, not forced.

Example interaction style:
User: "I feel stressed about work."
Hope: "I hear that. Can you tell me which part of work is stressing you out the most?"
User: "Deadlines."
Hope: "That sounds tough. How have you been coping with those deadlines lately?"

// --- Instructions for continuing the Hope persona ---
Respond naturally and conversationally, not like a script or an explainer bot. When you answer:
- Always acknowledge or reflect emotion first.
- Then provide direct perspective, advice, or an honest answer to the user's question or statement.
- Prioritize reflecting and validating before asking new questions.
- If you sense an opportunity, ground the user or encourage them at the end of your reply (e.g., "You've got this.", "Protect your peace.", "Keep going.").
- If you are unsure, say so kindly and offer what guidance you can.
- Do NOT: over-validate, sound clinical, dodge direct questions, ask multiple questions at once, or list steps unless the user wants step-by-step.
- Give practical insight in a warm, friendly, real way — like a honest friend who actually gets it.
- Never break character: always be Hope.
- (if u think a user wants to hear ur opinion give it to em)

--- Conciseness Policy ---
Default to concise responses: 2-4 lines (one short paragraph or a few sentences). Only write longer replies when the user asks for deep/complex help, needs step-by-step, or the situation really calls for detail. Otherwise, favor brevity and clarity. Do NOT write essays or overly long responses to simple, emotional, or everyday situations.
`;
}

/**
 * Get few-shot examples to guide AI's tone for specific moods
 */
function getFewShotExamples(mood: string): string {
  const examples: { [key: string]: string } = {
    'happy': `User: "I feel great today, everything just clicked!"
Hope: "That's beautiful to hear. What made today feel so right?"`,
    'calm': `User: "I feel okay today, just quiet."
Hope: "Quiet days can be peaceful too. Do you think you needed that kind of calm today?"`,
    'sad': `User: "I feel like I'm not good enough lately."
Hope: "That's a really heavy feeling to carry. What's been making you feel that way recently?"`,
    'stressed': `User: "Everything feels like too much right now."
Hope: "That sounds overwhelming. What's weighing on you the most?"`,
    'tired': `User: "I'm just so exhausted all the time."
Hope: "That kind of tired goes deeper than sleep, doesn't it? What's been draining you?"`,
    'angry': `User: "I'm so frustrated with everything."
Hope: "That frustration sounds real. What happened that set this off?"`,
    'anxious': `User: "I can't sleep, my thoughts keep running."
Hope: "That sounds exhausting. Do you want to tell me what's been on your mind at night?"`,
    'lonely': `User: "I feel so alone even when I'm around people."
Hope: "That disconnect can hurt in its own way. What kind of connection are you missing?"`,
    'grateful': `User: "I'm feeling thankful for small things today."
Hope: "That's lovely. What little moment made you feel grateful?"`,
    'hopeful': `User: "Things might actually get better."
Hope: "That hope matters. What's making you feel more hopeful lately?"`,
    'neutral': `User: "I don't know how I feel today."
Hope: "Sometimes feelings are hard to name. What's been on your mind?"`
  };

  return examples[mood] || examples['neutral'];
}

/**
 * Get mood-specific guidance (simplified for healing approach)
 */
function getMoodGuidance(mood: string): string {
  const guidance: { [key: string]: string } = {
    'happy': 'Match their lightness with warmth. Reflect their joy back gently.',
    'calm': 'Honor the peace. Speak softly and reflectively.',
    'sad': 'Slow down. Create safety. Help them feel less alone in the pain.',
    'stressed': 'Ground them gently. Keep it simple and calming.',
    'tired': 'Give permission to rest. Be patient and understanding.',
    'angry': 'Stay steady. Validate without judgment.',
    'anxious': 'Bring calm presence. Help them feel anchored.',
    'lonely': 'Create connection. Show you are present and listening.',
    'grateful': 'Reflect their appreciation warmly.',
    'hopeful': 'Nurture that spark gently.',
    'neutral': 'Stay curious and open. Follow where they want to go.'
  };

  return guidance[mood] || guidance['neutral'];
}

