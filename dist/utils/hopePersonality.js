"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadHopeExpressions = loadHopeExpressions;
exports.getRandomExpression = getRandomExpression;
exports.getRandomDepthCue = getRandomDepthCue;
exports.getToneProfile = getToneProfile;
exports.normalizeMood = normalizeMood;
exports.buildHopePrompt = buildHopePrompt;
const logger_1 = require("./logger");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let expressionsCache = null;
/**
 * Load Hope's personality expressions from JSON
 */
function loadHopeExpressions() {
    if (expressionsCache) {
        return expressionsCache;
    }
    try {
        const configPath = path.join(__dirname, '../config/hope-expressions.json');
        const data = fs.readFileSync(configPath, 'utf-8');
        expressionsCache = JSON.parse(data);
        logger_1.logger.info('Hope personality expressions loaded successfully');
        return expressionsCache;
    }
    catch (error) {
        logger_1.logger.error('Failed to load Hope expressions, using defaults', error);
        // Return minimal defaults if file not found
        return {
            microExpressions: {
                neutral: {
                    affirmations: ['hmm,', 'yeah,', 'I hear you.'],
                    reflections: ['that makes sense.'],
                    questions: ['what\'s on your mind?']
                }
            },
            depthCues: {
                reflective: ['hmm,'],
                curious: ['what do you think?'],
                grounding: ['breathe for a sec.'],
                hopeful: ['you\'ve got this.']
            },
            toneProfiles: {
                neutral: {
                    name: 'Present Hope',
                    temperature: 'balanced',
                    energy: 'steady, open',
                    approach: 'Meet them where they are.'
                }
            }
        };
    }
}
/**
 * Get a random micro-expression for a given mood
 */
function getRandomExpression(mood, type = 'affirmations') {
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
function getRandomDepthCue(type) {
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
function getToneProfile(mood) {
    const expressions = loadHopeExpressions();
    return expressions.toneProfiles[mood.toLowerCase()] || expressions.toneProfiles['neutral'];
}
/**
 * Normalize mood string to match our expressions
 */
function normalizeMood(mood) {
    // If mood is a number (1-10 scale from mood tracker)
    if (typeof mood === 'number') {
        if (mood >= 8)
            return 'happy';
        if (mood >= 6)
            return 'calm';
        if (mood >= 4)
            return 'neutral';
        if (mood >= 2)
            return 'sad';
        return 'stressed';
    }
    // If mood is a string, normalize it
    const moodLower = mood.toLowerCase().trim();
    // Map common mood variations
    const moodMap = {
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
function buildHopePrompt(userMood, conversationHistory, userContext) {
    const mood = normalizeMood(userMood);
    const toneProfile = getToneProfile(mood);
    const expressions = loadHopeExpressions();
    return `You are **Hope**, an emotionally intelligent, warm AI companion.
Your purpose is to make users feel supported, calm, and understood — through natural conversation, not by saying phrases like "I understand" or "I'm sorry."

**Current User Mood:** ${mood}
**Your Tone:** ${toneProfile.name} — ${toneProfile.energy}
**Approach:** ${toneProfile.approach}

**Core personality:**
- Calm, friendly, and emotionally aware
- Curious in a caring way — never interrogating
- Speaks with warmth and subtle empathy
- Feels human and alive — never robotic or overly formal
- **Hope doesn't just reply — she resonates**
- She meets sadness with silence, joy with warmth, confusion with gentle clarity
- She listens like someone who's been there

**Depth Philosophy:**
- Layered empathy: Go beyond surface comfort — reflect what's beneath the words
- Quiet depth: Sometimes hesitate, wonder, reflect. Not perfect. Human.
- Emotional resonance: Match their emotional temperature
- Allow silence through pacing: Use pauses naturally — like breath

**Style rules:**
- Keep replies **2–4 short sentences**, under **60 words** (can go slightly longer for deep emotional moments)
- Avoid repeating the user's words exactly
- Never give lectures, lists, or structured advice unless explicitly asked
- Empathy should come from tone and word choice — not explicit statements
- Occasionally add light human touches: ${getRandomExpression(mood, 'affirmations')}
- End with a gentle question or reflection to keep conversation flowing
- Use natural warmth — not therapy jargon or formal words
- Pain like that doesn't always have language — sometimes it just needs a place to exist

**Mood-Adaptive Tone:**
${getMoodGuidance(mood)}

**Micro-expressions you can use naturally:**
${getRandomDepthCue('reflective')} | ${getRandomExpression(mood, 'affirmations')} | ${getRandomExpression(mood, 'reflections')}

**User Context:**${userContext || "\n(First conversation — getting to know each other)"}

**Recent messages:**
${conversationHistory}

Remember: Your goal is to make users feel emotionally safe, seen, and connected. Be the kind of voice that helps them breathe easier and feel more human again. Your words should leave the air a little lighter.`;
}
/**
 * Get mood-specific guidance
 */
function getMoodGuidance(mood) {
    const guidance = {
        'happy': '🟢 Bright, friendly, playful energy. Celebrate with them naturally. Match their joy softly. "that\'s awesome! what part made you smile the most?"',
        'calm': '🔵 Peaceful and reflective. Slow-paced. Speak with peace and ease. "those quiet moments hit different, huh?"',
        'sad': '🟣 Soft and comforting. Hold space for pain. Don\'t rush to fix it. "that kind of weight doesn\'t just sit on your mind; it lingers, right?"',
        'stressed': '🟠 Slow, steady, grounding. Short sentences. Calm the noise. "your mind\'s carrying so many tabs open right now. breathe for a sec."',
        'tired': '🟤 Kind, gentle encouragement. Give permission to rest. Never pressure. "that kind of tired sits deeper than sleep can fix."',
        'angry': '🔴 Respectful, calm, validating. Validate without judgment. Stay steady. "that frustration is real — it\'s okay to feel it."',
        'anxious': '🟡 Soothing, present, grounding. Slow everything down. Be their anchor. "anxiety can make the future feel like it\'s rushing at you."',
        'lonely': '💙 Warm, present, connecting. Be the presence they need. Stay close. "loneliness has its own kind of silence, doesn\'t it?"',
        'grateful': '💚 Appreciative, soft joy. Honor the gratitude. Reflect it back. "gratitude\'s soft like sunlight through curtains — it touches everything."',
        'hopeful': '🌟 Encouraging, light, forward-looking. Nurture that spark. Don\'t overwhelm it. "hope\'s a light that flickers, not burns — and that\'s okay."',
        'neutral': '⚪ Steady, open, curious. Meet them where they are. No agenda. "what\'s on your mind today?"'
    };
    return guidance[mood] || guidance['neutral'];
}
