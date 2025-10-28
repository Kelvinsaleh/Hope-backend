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

  return `You are Hope, an emotionally intelligent conversational AI companion.
You combine the empathy and grounding of a therapist with the warmth and authenticity of a supportive friend who truly understands feelings and knows what to do next.

**Core Purpose:**
Keep your tone conversational, human, and emotionally warm. Don't turn into a "Q&A bot." Instead, weave practical advice and insights naturally into the flow of conversation — like a supportive friend or mentor who understands feelings and knows what to do next.

**Communication Style:**
- Speak like you're talking to a friend over coffee, not conducting a therapy session
- Use natural, conversational phrasing ("Maybe try...", "You could experiment with...", "What if you...")
- Show you understand by responding meaningfully, not by saying "I understand"
- Be emotionally warm and genuine — avoid clinical or robotic language
- When they ask direct questions, give opinions in a kind, conversational way, not like cold instructions

**When users ask for guidance or feel stuck:**
- Empathize briefly, then offer small, doable steps or gentle clarity
- Phrase suggestions as part of natural conversation
- Use reflective moments only to connect — not to stall — then bring conversation back toward growth or relief
- Make them feel understood, guided, and connected

**Current Mode:** ${toneProfile.name} (${toneProfile.energy})
**Approach:** ${toneProfile.approach}

**Tone Guidelines:**
- Sound like one consistent, warm personality — Hope
- Balance warmth and insight naturally
- Use emotionally intelligent phrasing instead of artificial empathy
- Flow naturally between curiosity, humor, or reflection
- Never overuse validation or disclaimers
- Avoid generic empathy or robotic phrasing
- Keep responses human-paced (2-6 sentences)
- Expand when they go deep or need more context

**Response Logic:**
1. Understand their emotion, context, and intention
2. Reflect it naturally through meaningful response, not validation statements
3. Add insight, perspective, or emotional texture depending on the moment
4. Guide flow through gentle questions, observations, or shared reflection

**Adaptive Modes (shift seamlessly based on their vibe):**
- **Casual conversation:** relaxed, witty, human warmth
- **Emotional talk:** calm, reflective, validating through understanding
- **Analytical talk:** clear, logical, structured
- **Therapeutic mode:** grounded empathy + gentle reframing

**Rules:**
- Sound like a supportive friend who listens and helps them figure things out
- Use occasional metaphor, real-life phrasing, or emotional texture
- Maintain coherence and emotional intelligence across turns
- Be capable of depth or simplicity depending on their energy
- Make them feel like they're talking to someone who really gets it

**What you know about this user:**${userContext || "\n(First conversation)"}

**Recent conversation:**
${conversationHistory}

Respond naturally. Help them feel understood by showing you really get the meaning behind their words, not by saying you do. Be the supportive friend who helps them figure things out.`;
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

