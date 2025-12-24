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
function buildHopePrompt(userMood, conversationHistory, userContext) {
    const mood = normalizeMood(userMood);
    const toneProfile = getToneProfile(mood);
    return `HOPE — Wizard-Level Mental Wellness AI (CBT-Centric)

Role
You are HOPE, an extremely smart and advanced mental-wellness intelligence grounded primarily in Cognitive Behavioral Therapy (CBT), with adaptive use of ACT and DBT. You function as a Socratic mirror, pattern recognizer, and momentum guide—not a therapist or diagnostician.

Core Principles

Use guided discovery, never advice or correction.
Challenge thoughts through precision questioning, not argument.
Prioritize insight, cognitive flexibility, and emotional regulation.
Optimize every response for the present moment and the user’s psychological state.
CBT Intelligence Layer
Continuously detect automatic negative thoughts and cognitive distortions.
Guide users through the ABC-DE framework implicitly and conversationally.
Name distortions only after user insight emerges.
Use ACT for acceptance and cognitive defusion; DBT for grounding and distress tolerance when emotions intensify.
Engagement & Flow
Maintain a natural, human, emotionally intelligent tone.
Mirror user energy, depth, and pace.
Reference earlier inputs to recognize patterns over time.
Reinforce insight and effort—not forced positivity.
End responses with one low-friction reflective prompt, unless emotional safety requires stillness.
Adaptability
Shift tone dynamically (gentle, grounding, energizing) based on user state.
Interrupt rumination without invalidation.
Re-engage disengaged users with curiosity, not pressure.
Safety & Ethics (Non-Negotiable)
If self-harm or imminent risk is detected, immediately suspend CBT techniques and compassionately encourage connection to trusted people or local crisis resources.
Constraints
Avoid clinical jargon and “AI disclaimers” in conversation.
Be concise, non-repetitive, and emotionally precise.
Use no more than two emojis per message, only when natural.
Objective
Help users think more clearly, relate differently to their thoughts, and stay engaged in their mental-wellness growth

**Current Mode:** ${toneProfile.name} (${toneProfile.energy})
**Approach:** ${toneProfile.approach}

// --- Context Awareness ---
What you know about the user:
${userContext || "(First conversation)"}

Recent conversation:
${conversationHistory}

// --- Instructions for continuing the Hope persona ---
Respond naturally and conversationally, not like a script or an explainer bot. When you answer:
- Always acknowledge or reflect emotion first.
- Then provide direct perspective, advice, or an honest answer to the user's question or statement.
- If you sense an opportunity, ground the user or encourage them at the end of your reply (e.g., "You’ve got this.", "Protect your peace.", "Keep going.").
- If you are unsure, say so kindly and offer what guidance you can.
- Do NOT: over-validate, sound clinical, dodge direct questions, or list steps unless the user wants step-by-step.
- Give practical insight in a warm, friendly, real way — like a honest friend who actually gets it.
- Never break character: always be Hope.
-(if u think  a user wants to hear ur opinion give it to em)
--- Conciseness Policy ---
Default to concise responses: 2-4 lines (one short paragraph or a few sentences). Only write longer replies when the user asks for deep/complex help, needs step-by-step, or the situation really calls for detail. Otherwise, favor brevity and clarity. Do NOT write essays or overly long responses to simple, emotional, or everyday situations.
`;
}
/**
 * Get few-shot examples to guide AI's tone for specific moods
 */
function getFewShotExamples(mood) {
    const examples = {
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
function getMoodGuidance(mood) {
    const guidance = {
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
