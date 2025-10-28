import { Request, Response } from 'express';
import { logger } from '../utils/logger';

// Enhanced AI Content Moderation
export class CommunityModeration {
  private static harmfulKeywords = [
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

  private static supportiveKeywords = [
    'support', 'encourage', 'help', 'care', 'love', 'kindness',
    'grateful', 'thankful', 'blessed', 'hopeful', 'positive',
    'growth', 'healing', 'recovery', 'progress', 'strength'
  ];

  static async moderateContent(content: string): Promise<{
    isSafe: boolean;
    suggestion?: string;
    confidence: number;
    flags: string[];
  }> {
    const lowerContent = content.toLowerCase();
    const flags: string[] = [];
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
    } else if (content.length > 500) {
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
    
    let suggestion: string | undefined;
    if (!isSafe) {
      if (flags.some(f => f.startsWith('harmful'))) {
        suggestion = "Please consider rephrasing this in a more supportive way. Our community values kindness and encouragement.";
      } else if (flags.includes('excessive_caps')) {
        suggestion = "Consider using normal capitalization to make your message more welcoming.";
      } else if (flags.includes('too_short')) {
        suggestion = "Please provide more context to help others understand your message.";
      } else {
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

  static async generateAIReflection(content: string, mood?: string): Promise<string> {
    const reflections = [
      `Thanks for sharing this with us. It's really brave to open up like this.`,
      `I can hear how much this means to you. Your honesty helps others feel less alone.`,
      `What you've shared here shows real strength. Keep being authentic with yourself.`,
      `Your perspective is so valuable. It helps others who might be going through something similar.`,
      `I love seeing someone taking care of their mental health like this. You're doing great.`,
      `Your voice matters here. Thanks for contributing to our supportive community.`,
      `It's beautiful to see someone reflecting on their experiences. Keep going!`,
      `Your openness creates a safe space for others. That's really meaningful.`
    ];

    // Mood-specific reflections with conversational tone
    if (mood) {
      const moodReflections: { [key: string]: string[] } = {
        grateful: [
          `Your gratitude really shines through here. It's wonderful to see you finding things to appreciate.`,
          `Practicing gratitude like this is so powerful. Thanks for sharing this beautiful perspective.`,
          `I love how you're focusing on what's good. Gratitude really does transform how we see things.`
        ],
        hopeful: [
          `Your hope is contagious! It's beautiful to see this optimism in your words.`,
          `Hope is such a powerful thing. Thanks for sharing your positive outlook with us.`,
          `Your hopeful perspective brings such light to our community. Keep that optimism flowing!`
        ],
        calm: [
          `I can feel the peaceful energy in your words. Thanks for sharing this calm moment.`,
          `It's wonderful to read about someone finding peace. Your calmness is really inspiring.`,
          `Your peaceful reflection helps others remember that calm moments are totally possible.`
        ],
        proud: [
          `You should absolutely be proud! Celebrating your wins is so important for mental health.`,
          `Your pride in your progress is totally deserved. Keep acknowledging how far you've come!`,
          `It's beautiful to see someone recognizing their own worth. You deserve to feel proud.`
        ],
        anxious: [
          `I can hear the worry in your words, and that's okay. You're not alone in feeling this way.`,
          `Anxiety can be so overwhelming. Thanks for sharing what's on your mind.`,
          `It takes courage to talk about anxiety. You're doing something really important for yourself.`
        ],
        sad: [
          `I can feel the heaviness in what you've shared. Your feelings are completely valid.`,
          `It's okay to not be okay sometimes. Thanks for trusting us with your feelings.`,
          `Your sadness is real, and it's okay to feel it. You're not alone in this.`
        ]
      };

      if (moodReflections[mood]) {
        const moodSpecific = moodReflections[mood];
        return moodSpecific[Math.floor(Math.random() * moodSpecific.length)];
      }
    }

    return reflections[Math.floor(Math.random() * reflections.length)];
  }

  static async detectCrisisContent(content: string): Promise<{
    isCrisis: boolean;
    severity: 'low' | 'medium' | 'high';
    resources: string[];
  }> {
    const lowerContent = content.toLowerCase();
    const crisisKeywords = {
      high: ['kill myself', 'suicide', 'end it all', 'not worth living', 'want to die'],
      medium: ['hopeless', 'can\'t go on', 'give up', 'no point', 'worthless'],
      low: ['sad', 'depressed', 'struggling', 'hard time', 'difficult']
    };

    let severity: 'low' | 'medium' | 'high' = 'low';
    let isCrisis = false;

    for (const [level, keywords] of Object.entries(crisisKeywords)) {
      for (const keyword of keywords) {
        if (lowerContent.includes(keyword)) {
          isCrisis = true;
          if (level === 'high') severity = 'high';
          else if (level === 'medium' && severity !== 'high') severity = 'medium';
          else if (level === 'low' && severity === 'low') severity = 'low';
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

// Enhanced moderation middleware
export const enhancedModeration = async (req: Request, res: Response, next: any) => {
  try {
    const { content } = req.body;
    
    if (content) {
      const moderation = await CommunityModeration.moderateContent(content);
      const crisisCheck = await CommunityModeration.detectCrisisContent(content);
      
      // Log moderation results
      logger.info('Content moderation:', {
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
        logger.warn('Crisis content detected:', {
          content: content.substring(0, 100) + '...',
          severity: crisisCheck.severity,
          resources: crisisCheck.resources
        });
        
        // Add crisis resources to response
        req.body.crisisResources = crisisCheck.resources;
      }
    }

    next();
  } catch (error) {
    logger.error('Moderation error:', error);
    next();
  }
};
