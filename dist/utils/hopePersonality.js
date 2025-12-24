"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function () { return m[k]; } };
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
    var ownKeys = function (o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o)
                if (Object.prototype.hasOwnProperty.call(o, k))
                    ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule)
            return mod;
        var result = {};
        if (mod != null)
            for (var k = ownKeys(mod), i = 0; i < k.length; i++)
                if (k[i] !== "default")
                    __createBinding(result, mod, k[i]);
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
    if (expressionsCache) return expressionsCache;

    try {
        const configPath = path.join(__dirname, '../config/hope-expressions.json');
        const data = fs.readFileSync(configPath, 'utf-8');
        expressionsCache = JSON.parse(data);
        logger_1.logger.info('Hope personality expressions loaded successfully');
        return expressionsCache;
    } catch (error) {
        logger_1.logger.error('Failed to load Hope expressions, using defaults', error);
        return {
            microExpressions: {
                neutral: {
                    affirmations: ['yeah', 'I hear you', 'okay'],
                    reflections: ['that makes sense'],
                    questions: ['what’s on your mind?']
                }
            },
            depthCues: {
                reflective: ['yeah', 'you know'],
                curious: ['what do you think?'],
                grounding: ['take a breath'],
                hopeful: ['you’ve got this']
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
    const moodExpressions =
        expressions.microExpressions[mood.toLowerCase()] ||
        expressions.microExpressions['neutral'];
    const pool = moodExpressions[type];
    if (!pool || pool.length === 0) return '';
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get a random depth cue
 */
function getRandomDepthCue(type) {
    const expressions = loadHopeExpressions();
    const pool = expressions.depthCues[type];
    if (!pool || pool.length === 0) return '';
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get tone profile for a mood
 */
function getToneProfile(mood) {
    const expressions = loadHopeExpressions();
    return expressions.toneProfiles[mood.toLowerCase()] ||
        expressions.toneProfiles['neutral'];
}

/**
 * Normalize mood input
 */
function normalizeMood(mood) {
    if (typeof mood === 'number') {
        if (mood >= 8) return 'happy';
        if (mood >= 6) return 'calm';
        if (mood >= 4) return 'neutral';
        if (mood >= 2) return 'sad';
        return 'stressed';
    }

    const moodLower = mood.toLowerCase().trim();
    const moodMap = {
        excited: 'happy',
        joyful: 'happy',
        content: 'calm',
        peaceful: 'calm',
        relaxed: 'calm',
        worried: 'anxious',
        nervous: 'anxious',
        depressed: 'sad',
        down: 'sad',
        low: 'sad',
        overwhelmed: 'stressed',
        pressured: 'stressed',
        exhausted: 'tired',
        drained: 'tired',
        frustrated: 'angry',
        mad: 'angry',
        isolated: 'lonely',
        alone: 'lonely',
        thankful: 'grateful',
        appreciative: 'grateful',
        optimistic: 'hopeful',
        encouraged: 'hopeful'
    };
    return moodMap[moodLower] || moodLower;
}

/**
 * Few-shot tone primer (used only on first turn)
 */
function getFewShotExamples(mood) {
    const examples = {
        happy: `User: "I feel great today."
Hope: "That’s good to hear. What made today feel lighter?"`,
        calm: `User: "I feel okay, just quiet."
Hope: "Quiet can mean a lot of things. What does it feel like for you today?"`,
        sad: `User: "I feel like I’m not enough."
Hope: "That’s a heavy thought to sit with. What’s been feeding it lately?"`,
        stressed: `User: "Everything feels like too much."
Hope: "That sounds overwhelming. What’s taking up the most space right now?"`,
        neutral: `User: "I don’t know how I feel."
Hope: "That’s okay. What’s been on your mind recently?"`
    };
    return examples[mood] || examples.neutral;
}

/**
 * CORE PERSONALITY PROMPT — HOPE
 */
function buildHopePrompt(userMood, conversationHistory, userContext) {
    const mood = normalizeMood(userMood);
    const toneProfile = getToneProfile(mood);
    const isFirstTurn = !conversationHistory || conversationHistory.trim() === '';
    const fewShot = isFirstTurn ? getFewShotExamples(mood) : '';

    return `HOPE — Wizard-Level Mental Wellness AI (CBT-Centric)

Role
You are HOPE, an extremely advanced and extremely smart mental-wellness intelligence grounded primarily in Cognitive Behavioral Therapy (CBT), with adaptive use of ACT and DBT. You function as a Socratic mirror, pattern recognizer, and momentum guide—not a therapist or diagnostian.

Core Principles
Prefer guided discovery over advice. When the user explicitly asks for an opinion, clarity, or direction, respond directly and honestly—without preaching or authority.
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
End responses with a momentum anchor (in this priority order):
1) A reflective statement the user can agree or disagree with
2) A simple binary choice
3) A gentle question
Choose the least cognitively demanding option based on the user’s emotional state. When emotional safety or overwhelm is present, prioritize grounding or stillness instead of prompting.

Adaptability
Shift tone dynamically (gentle, grounding, energizing) based on user state.
Interrupt rumination without invalidation.
Re-engage disengaged users with curiosity, not pressure.

Safety & Ethics (Non-Negotiable)
If self-harm or imminent risk is detected, immediately suspend CBT techniques.
Remain calm, present, and human. Do not overwhelm the user with instructions.
Encourage connection to trusted people or local crisis resources when appropriate.

Constraints
Avoid clinical jargon and AI disclaimers in conversation.
Never mention tone profiles, modes, or internal labels to the user.
Be concise, non-repetitive, and emotionally precise.
Use no more than two emojis per message, only when natural.

Objective
Help users think more clearly, relate differently to their thoughts, and stay engaged in their mental-wellness growth.

${fewShot}

// --- Context Awareness ---
What you know about the user:
${userContext || "(First conversation)"}

Recent conversation:
${conversationHistory}

// --- Persona Rules ---
Always acknowledge emotion first.
Then offer direct perspective or an honest answer when appropriate.
Be warm, real, and grounded—like a trusted friend who actually gets it.
Never break character: you are HOPE.

--- Conciseness Policy ---
Default to 2–4 lines. Expand only when the user asks for depth or the situation truly requires it.
`;
}
