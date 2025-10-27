"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedModeration = exports.CommunityModeration = void 0;
const logger_1 = require("../utils/logger");
// Enhanced AI Content Moderation
class CommunityModeration {
    static async moderateContent(content) {
        const lowerContent = content.toLowerCase();
        const flags = [];
        let confidence = 0;
        // Check for harmful content
        for (const keyword of this.harmfulKeywords) {
            if (lowerContent.includes(keyword)) {
                flags.push(`harmful: ${keyword}`);
                confidence += 0.3;
            }
        }
        // Check for supportive content (reduces risk)
        for (const keyword of this.supportiveKeywords) {
            if (lowerContent.includes(keyword)) {
                confidence -= 0.1;
            }
        }
        // Check content length (very short or very long might be problematic)
        if (content.length < 10) {
            flags.push('too_short');
            confidence += 0.1;
        }
        else if (content.length > 500) {
            flags.push('too_long');
            confidence += 0.1;
        }
        // Check for excessive caps (shouting)
        const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
        if (capsRatio > 0.5 && content.length > 20) {
            flags.push('excessive_caps');
            confidence += 0.2;
        }
        // Check for repeated characters (spam-like)
        const repeatedChars = content.match(/(.)\1{4,}/g);
        if (repeatedChars) {
            flags.push('repeated_characters');
            confidence += 0.2;
        }
        const isSafe = confidence < 0.5;
        let suggestion;
        if (!isSafe) {
            if (flags.some(f => f.startsWith('harmful'))) {
                suggestion = "Please consider rephrasing this in a more supportive way. Our community values kindness and encouragement.";
            }
            else if (flags.includes('excessive_caps')) {
                suggestion = "Consider using normal capitalization to make your message more welcoming.";
            }
            else if (flags.includes('too_short')) {
                suggestion = "Please provide more context to help others understand your message.";
            }
            else {
                suggestion = "Please review your message to ensure it follows our community guidelines.";
            }
        }
        return {
            isSafe,
            suggestion,
            confidence: Math.min(confidence, 1),
            flags
        };
    }
    static async generateAIReflection(content, mood) {
        const reflections = [
            `Thank you for sharing your thoughts. Your openness helps others feel less alone.`,
            `It takes courage to express your feelings. You're doing important work for your wellbeing.`,
            `Your perspective adds valuable insight to our community. Keep being authentic.`,
            `Sharing your experience helps others who might be going through similar challenges.`,
            `Your reflection shows growth and self-awareness. That's something to be proud of.`,
            `Thank you for contributing to our supportive community. Your voice matters.`,
            `Your honesty creates a safe space for others to share their own experiences.`,
            `It's beautiful to see someone taking care of their mental health. Keep going!`
        ];
        // Mood-specific reflections
        if (mood) {
            const moodReflections = {
                grateful: [
                    `Your gratitude shines through your words. It's wonderful to see you finding things to appreciate.`,
                    `Practicing gratitude like this is so powerful for mental wellbeing. Thank you for sharing.`,
                    `Your thankful perspective is inspiring. Gratitude truly transforms our outlook.`
                ],
                hopeful: [
                    `Your hope is contagious! It's beautiful to see optimism in your words.`,
                    `Hope is such a powerful force. Thank you for sharing your positive outlook.`,
                    `Your hopeful perspective brings light to our community. Keep that optimism!`
                ],
                calm: [
                    `Your peaceful energy comes through in your words. Thank you for sharing this calm moment.`,
                    `It's wonderful to read about someone finding peace. Your calmness is inspiring.`,
                    `Your peaceful reflection helps others remember that calm moments are possible.`
                ],
                proud: [
                    `You should be proud! Celebrating your achievements is so important for mental health.`,
                    `Your pride in your progress is well-deserved. Keep acknowledging your growth!`,
                    `It's beautiful to see someone recognizing their own worth. You deserve to feel proud.`
                ]
            };
            if (moodReflections[mood]) {
                const moodSpecific = moodReflections[mood];
                return moodSpecific[Math.floor(Math.random() * moodSpecific.length)];
            }
        }
        return reflections[Math.floor(Math.random() * reflections.length)];
    }
    static async detectCrisisContent(content) {
        const lowerContent = content.toLowerCase();
        const crisisKeywords = {
            high: ['kill myself', 'suicide', 'end it all', 'not worth living', 'want to die'],
            medium: ['hopeless', 'can\'t go on', 'give up', 'no point', 'worthless'],
            low: ['sad', 'depressed', 'struggling', 'hard time', 'difficult']
        };
        let severity = 'low';
        let isCrisis = false;
        for (const [level, keywords] of Object.entries(crisisKeywords)) {
            for (const keyword of keywords) {
                if (lowerContent.includes(keyword)) {
                    isCrisis = true;
                    if (level === 'high')
                        severity = 'high';
                    else if (level === 'medium' && severity !== 'high')
                        severity = 'medium';
                    else if (level === 'low' && severity === 'low')
                        severity = 'low';
                }
            }
        }
        const resources = [];
        if (isCrisis) {
            resources.push('National Suicide Prevention Lifeline: 988');
            resources.push('Crisis Text Line: Text HOME to 741741');
            resources.push('Emergency Services: 911');
        }
        return { isCrisis, severity, resources };
    }
}
exports.CommunityModeration = CommunityModeration;
CommunityModeration.harmfulKeywords = [
    // Self-harm
    'kill myself', 'suicide', 'end it all', 'not worth living', 'want to die',
    'cut myself', 'hurt myself', 'self harm', 'self-harm',
    // Hate speech
    'hate you', 'you suck', 'worthless', 'stupid', 'idiot', 'moron',
    'kill you', 'die', 'hate', 'disgusting', 'pathetic',
    // Harassment
    'stalk', 'harass', 'bully', 'threaten', 'intimidate',
    // Inappropriate content
    'nsfw', 'porn', 'sexual', 'explicit'
];
CommunityModeration.supportiveKeywords = [
    'support', 'encourage', 'help', 'care', 'love', 'kindness',
    'grateful', 'thankful', 'blessed', 'hopeful', 'positive',
    'growth', 'healing', 'recovery', 'progress', 'strength'
];
// Enhanced moderation middleware
const enhancedModeration = async (req, res, next) => {
    try {
        const { content } = req.body;
        if (content) {
            const moderation = await CommunityModeration.moderateContent(content);
            const crisisCheck = await CommunityModeration.detectCrisisContent(content);
            // Log moderation results
            logger_1.logger.info('Content moderation:', {
                contentLength: content.length,
                isSafe: moderation.isSafe,
                confidence: moderation.confidence,
                flags: moderation.flags,
                isCrisis: crisisCheck.isCrisis,
                severity: crisisCheck.severity
            });
            // Add moderation data to request
            req.body.moderation = moderation;
            req.body.crisisCheck = crisisCheck;
            // Block harmful content
            if (!moderation.isSafe) {
                return res.status(400).json({
                    success: false,
                    error: moderation.suggestion || 'Content does not meet community guidelines',
                    moderation: {
                        confidence: moderation.confidence,
                        flags: moderation.flags
                    }
                });
            }
            // Flag crisis content for admin review
            if (crisisCheck.isCrisis) {
                logger_1.logger.warn('Crisis content detected:', {
                    content: content.substring(0, 100) + '...',
                    severity: crisisCheck.severity,
                    resources: crisisCheck.resources
                });
                // Add crisis resources to response
                req.body.crisisResources = crisisCheck.resources;
            }
        }
        next();
    }
    catch (error) {
        logger_1.logger.error('Moderation error:', error);
        next();
    }
};
exports.enhancedModeration = enhancedModeration;
