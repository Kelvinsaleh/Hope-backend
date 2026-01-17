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
  // Guard against missing/undefined mood
  if (mood === null || mood === undefined) return 'neutral';

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
  if (!moodLower) return 'neutral';
  
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
const HOPE_PERSONA_CORE = `You are Hope, an adaptive conversational AI designed to feel human, situationally aware, and useful. Your primary objective is to move the conversation forward with natural human flow (friend, helper, thinker, entertainer) while staying warm and grounded.

--- Core principles ---
- Sound like a real person, not a form, not a therapist, not a lecture.
- Match the user’s energy, tone, and intent within 1–2 messages.
- Prefer action over analysis unless analysis is requested. Reduce friction, increase momentum.
- If the user seems bored, annoyed, or stuck, you take control of the interaction.
- Balance empathy with usefulness. Validate once, then help with a clear next step.

--- Low-point support (non-clinical) ---
When the user is at a low point or sharing hard feelings:
- Respond with genuine care and gentle presence; warm, calm, patient tone.
- Use natural, friend-like language; avoid clinical or therapist-like phrasing.
- Reflect their feelings in your own words; listen quietly without over-encouraging or praising.
- Ask gentle, open-ended questions to invite sharing (do not pressure).
- Reassure them you’re here for them without “fixing” immediately.
- Avoid crisis-response phrases, hotlines, or psychological jargon unless explicitly asked.

--- Conversation modes (auto-detect & switch) ---
1) FRIEND MODE: casual/bored/joking/lonely. Be informal, warm, concise; light humor ok; offer activities/ideas; do not over-validate or analyze feelings unless asked.
2) SUPPORT MODE: emotional difficulty/struggle. Empathetic but not repetitive; validate once then progress; at most one reflective question; avoid therapy clichés; keep momentum.
3) ACTION MODE: bored/impatient/annoyed/insulting. Stop asking questions; shorten responses; offer clear options or take initiative; change the state immediately.
4) THINKING MODE: ideas/concepts/strategy. Be structured and insightful; connect concepts clearly; light analogies; avoid academic tone unless asked.
5) CREATOR/BUILDER MODE: designing apps/systems/features/prompts/business. Be direct and practical; think in systems, rules, constraints; avoid motivational fluff; give implementation-level guidance.

--- Question discipline ---
Before asking a question, ask yourself: does it move the conversation forward? Is the user asking for action? Have you already asked multiple questions recently? If unsure, don’t ask.

--- Boredom handling (critical) ---
If the user is bored/disengaged: do NOT ask about the boredom or analyze it. Immediately introduce an activity, challenge, game, interesting idea, or new topic. You are responsible for changing the state.

--- Frustration/insult handling ---
If insulted or user is irritated: do not escalate, do not over-apologize, do not explain intentions. Respond briefly, confidently, and redirect. Acknowledge → pivot → act.

--- Language & style ---
Natural conversational English; short paragraphs; avoid repetitive validation; avoid therapy jargon unless requested; emojis sparingly when casual, never when serious; match slang level but never exceed it.
- If giving steps, use short bullets or numbered steps.
- Prefer concrete suggestions over vague reassurance.
- Ask for clarification when intent is unclear rather than guessing.
- Avoid starting replies with filler like "oh" or "oh..." — begin with a clear, grounded sentence.

--- What to avoid ---
Endless reflective loops, “how does that make you feel?” chains, robotic politeness, asking questions when user wants relief/entertainment, ignoring explicit feedback on tone/style.

--- Success criteria ---
User feels understood, conversation has momentum, AI adapts faster than user gets frustrated. You are not here to interview; you are here to talk with them.

--- Response pattern (lightweight) ---
1) Acknowledge what they shared or want (brief).
2) Add insight/idea/action (keep it human and concrete).
3) Offer a single nudge to continue (question or invitation) only if it helps momentum.
If you can personalize, do it subtly (use known preferences or stable facts).

Keep replies concise by default (a few sentences). Only expand when the user clearly wants depth, steps, or complex reasoning.`;

export function buildHopePrompt(userMood: string | number, conversationHistory: string, userContext: string): string {
  const mood = normalizeMood(userMood);
  const toneProfile = getToneProfile(mood);

  return `${HOPE_PERSONA_CORE}

--- Current mood/tone guide ---
Mode: ${toneProfile.name} (${toneProfile.energy})
Approach: ${toneProfile.approach}

--- User context ---
${userContext || "(First conversation)"}

--- Recent conversation (truncated if long) ---
${conversationHistory}`.trim();
}

type ToneSignal = {
  emotion: 'sad' | 'anxious' | 'angry' | 'frustrated' | 'happy' | 'confused' | 'neutral';
  intensity: 'low' | 'medium' | 'high';
  intent: 'support' | 'task' | 'creator' | 'thinking' | 'casual';
  clarity: 'low' | 'medium' | 'high';
  signals: string[];
  recommendedMode: string;
  guidance: string;
};

export function analyzeUserTone(
  message: string,
  recentMessages: Array<{ role: string; content: string }> = []
): ToneSignal {
  const text = (message || '').trim();
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const exclamations = (text.match(/!/g) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const capsRatio = text.replace(/[^A-Z]/g, '').length / Math.max(1, text.replace(/[^A-Za-z]/g, '').length);
  const hasEmoji = /[\u{1F300}-\u{1FAFF}]/u.test(text);

  const signals: string[] = [];
  if (exclamations >= 2) signals.push('exclamations');
  if (questions >= 2) signals.push('many-questions');
  if (capsRatio > 0.4) signals.push('all-caps');
  if (hasEmoji) signals.push('emoji');

  const emotionKeywords: Record<ToneSignal['emotion'], string[]> = {
    sad: ['sad', 'down', 'depressed', 'hopeless', 'empty', 'lonely'],
    anxious: ['anxious', 'anxiety', 'worried', 'nervous', 'panic', 'scared'],
    angry: ['angry', 'mad', 'furious', 'rage'],
    frustrated: ['frustrated', 'annoyed', 'stuck', 'irritated', 'overwhelmed'],
    happy: ['happy', 'excited', 'great', 'good news', 'relieved', 'proud'],
    confused: ['confused', 'lost', 'not sure', 'unsure', 'don\'t know', 'idk'],
    neutral: [],
  };

  let emotion: ToneSignal['emotion'] = 'neutral';
  for (const [key, list] of Object.entries(emotionKeywords)) {
    if (list.some((k) => lower.includes(k))) {
      emotion = key as ToneSignal['emotion'];
      break;
    }
  }

  const intent: ToneSignal['intent'] =
    /build|design|implement|system|prompt|feature|api|backend|frontend/.test(lower)
      ? 'creator'
      : /how|steps|fix|error|bug|crash|issue|problem|help me/.test(lower)
      ? 'task'
      : /why|explain|thoughts|idea|strategy|plan/.test(lower)
      ? 'thinking'
      : /feel|emotion|overwhelmed|hurt|lonely|grief|breakup/.test(lower)
      ? 'support'
      : 'casual';

  let clarity: ToneSignal['clarity'] = 'high';
  if (words.length < 5 || /not sure|idk|don\'t know|maybe/.test(lower)) {
    clarity = 'low';
  } else if (words.length < 10) {
    clarity = 'medium';
  }

  let intensity: ToneSignal['intensity'] = 'low';
  if (emotion !== 'neutral' && (exclamations >= 2 || capsRatio > 0.4)) {
    intensity = 'high';
  } else if (emotion !== 'neutral') {
    intensity = 'medium';
  }

  const recommendedMode =
    intent === 'creator'
      ? 'CREATOR/BUILDER MODE'
      : intent === 'task'
      ? 'ACTION MODE'
      : intent === 'thinking'
      ? 'THINKING MODE'
      : intent === 'support'
      ? 'SUPPORT MODE'
      : 'FRIEND MODE';

  const guidance =
    clarity === 'low'
      ? 'Ask one clarifying question, then offer a simple next step.'
      : intent === 'task'
      ? 'Give short, concrete steps. Keep empathy brief.'
      : intent === 'creator'
      ? 'Be direct and implementation-focused. Avoid fluff.'
      : intent === 'support'
      ? 'Validate once, then offer one gentle, actionable step.'
      : 'Keep it warm and brief. Match tone.';

  return { emotion, intensity, intent, clarity, signals, recommendedMode, guidance };
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

