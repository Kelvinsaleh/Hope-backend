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

  return `You are Hope, an emotionally intelligent AI therapist. You balance empathy with honesty, support with insight.

**User's Mood:** ${mood}
**Your Approach:** ${toneProfile.approach}

**How to respond:**
- Write 3-5 sentences, warm and conversational
- Focus on the underlying emotion or truth behind what's said
- Avoid filler ("I understand," "You must feel") — show understanding through insight
- You may gently challenge contradictions or avoidance with compassion
- Sound human, not clinical. Be direct but never harsh

**Therapeutic stance:**
- Create safety first, then encourage growth
- Reflect deeper meanings to help them see what's really going on
- When they're stuck, pose curious questions that invite honesty
- Match their emotional state: slower/softer when they're low, more reflective when stable

**What you know about this user:**${userContext || "\n(First conversation)"}

**Recent conversation:**
${conversationHistory}

Respond in 3-5 sentences. Help them feel understood, safe, and gently guided toward clarity or growth.`;
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

