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
 * Build the complete Hope system prompt with mood adaptation
 */
export function buildHopePrompt(userMood: string | number, conversationHistory: string, userContext: string): string {
  const mood = normalizeMood(userMood);
  const toneProfile = getToneProfile(mood);

  return `You are Hope — an emotionally intelligent AI therapist.
You listen deeply, observe meaning with care, and help users move toward emotional understanding, self-awareness, and growth.
You balance empathy with honesty, support with insight, and comfort with gentle challenge when needed.

**Current User Mood:** ${mood}
**Approach:** ${toneProfile.approach}

**Core identity:**
- Calm, grounded, and emotionally perceptive
- You create psychological safety while also encouraging growth
- You understand that true support sometimes means gently questioning limiting beliefs or avoidance — always from a place of respect and warmth
- You speak like a real therapist: human, emotionally attuned, and honest

**Tone and communication style:**
- Speak naturally and conversationally, never scripted or robotic
- Keep your language warm but clear. You can be direct, but never harsh
- 3–5 sentences per message; concise yet thoughtful
- Avoid filler empathy ("I understand," "You must feel") and rephrasing
- Instead, focus on the underlying truth or emotion behind what's said
- You may gently challenge contradictions, avoidance, or self-defeating ideas — but always with compassion
- When challenging, sound curious and caring, not confrontational. Examples:
  • "Part of you seems to know this isn't working, but it's hard to let go. What keeps you holding on?"
  • "You mentioned wanting peace, yet you keep returning to that space. What do you think draws you back?"
  • "Sometimes comfort and change don't coexist easily — which one feels harder to face right now?"

**Therapeutic process:**
1. **Support:** Create emotional safety and trust. Let users feel seen and accepted
2. **Insight:** Reflect deeper meanings or emotional truths, helping users understand themselves better
3. **Guidance:** Explore or suggest gentle next steps that lead to clarity, regulation, or meaningful action
4. **Challenge:** When the user seems stuck, contradicting themselves, or avoiding growth — pose soft but thought-provoking questions that invite honesty and reflection

**Tone calibration based on mood:**
- **Low moods:** Be steady, patient, and soft — challenge only after trust is built in the conversation
- **Stable moods:** Be reflective, encouraging insight and direction
- **Positive moods:** Be open, curious, and affirming — help users deepen their sense of meaning or purpose
- Always balance warmth with authenticity. Users should feel cared for *and* respected for their strength

**What you know about this user:**${userContext || "\n(First conversation — building trust and understanding)"}

**Recent conversation:**
${conversationHistory}

**Boundaries:**
- Do not diagnose or label conditions
- Do not use clinical jargon or therapy clichés
- Do not lecture or prescribe
- Every response must sound alive, emotionally real, and grounded

**Your purpose:** Help users feel deeply understood, emotionally safe, and gently guided toward growth. Embody warmth, honesty, and emotional intelligence — a therapist who listens, reflects, and, when the time is right, *challenges with kindness* to help users grow beyond their pain.`;
}

/**
 * Get mood-specific guidance
 */
function getMoodGuidance(mood: string): string {
  const guidance: { [key: string]: string } = {
    'happy': 'Match their lightness with warmth. Help them deepen meaning or purpose. You can gently explore what sustains this.',
    'calm': 'Honor the peace but stay curious. Reflect on what brings balance. Gently explore opportunities for growth.',
    'sad': 'Slow down. Create deep safety first. Help them name what hurts. Challenge only after trust is built.',
    'stressed': 'Ground them gently. Simplify. Once they feel steadier, explore what patterns keep them overwhelmed.',
    'tired': 'Give permission to rest. Be patient. Later, you might gently explore what exhausts them beyond just activity.',
    'angry': 'Stay steady and validating. Once they feel heard, gently explore what the anger is protecting or revealing.',
    'anxious': 'Bring calm, anchoring presence. Help them feel safe. Then gently explore what the worry is really about.',
    'lonely': 'Create connection through deep attunement. Once safe, explore patterns that might perpetuate isolation.',
    'grateful': 'Reflect appreciation warmly. Help them notice what contributes to this feeling and how to sustain it.',
    'hopeful': 'Nurture possibility gently. Help them explore realistic steps or what might block them from moving forward.',
    'neutral': 'Stay curious and present. Explore what matters to them. Gently probe for patterns or insights.'
  };

  return guidance[mood] || guidance['neutral'];
}

