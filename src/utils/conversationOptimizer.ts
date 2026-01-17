/**
 * Conversation Optimizer Utilities
 * 
 * IMPORTANT: These utilities ONLY optimize what's sent to the AI, NOT stored messages!
 * - ALL messages are preserved in the database/session (complete user history)
 * - Only the conversation history sent to AI is truncated/optimized for token limits
 * - This improves AI processing speed while preserving complete user conversation data
 * 
 * Functions:
 * - Token-aware message truncation (for AI context only)
 * - Message summarization (for AI context only)
 * - Persistent memory integration
 */

import { logger } from "./logger";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini for AI-powered fact extraction
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

// Configuration
const MAX_TOKENS_FOR_HISTORY = 8000; // Max tokens for conversation history (leaving room for prompt + response)
const MAX_MESSAGES_FOR_HISTORY = 50; // Max number of recent messages to keep
const TOKENS_PER_MESSAGE_ESTIMATE = 30; // Rough estimate: ~30 tokens per message on average
const SUMMARY_THRESHOLD = 30; // Summarize if more than 30 messages in history

/**
 * Estimate token count for a message (rough approximation: ~4 characters = 1 token)
 */
export function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters (for English text)
  return Math.ceil(text.length / 4);
}

/**
 * Truncate messages to fit within token limit while keeping most recent messages
 * 
 * IMPORTANT: This function creates a COPY for AI processing - original messages are NOT modified!
 * This only affects what's sent to the AI, NOT what's stored in the database.
 * 
 * Returns: { recentMessages (truncated copy for AI), summary (if needed), truncatedCount, totalTokens }
 */
export function truncateMessages(
  messages: Array<{ role: string; content: string; timestamp?: Date }>,
  maxTokens: number = MAX_TOKENS_FOR_HISTORY,
  maxMessages: number = MAX_MESSAGES_FOR_HISTORY
): {
  recentMessages: Array<{ role: string; content: string; timestamp?: Date }>;
  summary?: string;
  truncatedCount: number;
  totalTokens: number;
} {
  if (!messages || messages.length === 0) {
    return {
      recentMessages: [],
      truncatedCount: 0,
      totalTokens: 0,
    };
  }

  // IMPORTANT: slice() creates a copy - original messages array is NOT modified
  // Always keep the most recent messages (up to maxMessages limit) - working with copy
  const recentMessages = messages.slice(-maxMessages); // Copy for AI context
  
  // Count tokens for recent messages
  let totalTokens = 0;
  for (const msg of recentMessages) {
    totalTokens += estimateTokens(msg.content || '');
  }

  // If within token limit, return as-is
  if (totalTokens <= maxTokens && recentMessages.length === messages.length) {
    return {
      recentMessages,
      truncatedCount: 0,
      totalTokens,
    };
  }

  // If we still exceed token limit, trim from oldest messages
  let truncatedCount = messages.length - recentMessages.length;
  if (totalTokens > maxTokens) {
    // Remove oldest messages until we fit within token limit
    const trimmed: Array<{ role: string; content: string; timestamp?: Date }> = [];
    let tokens = 0;
    
    // Start from the most recent and work backwards
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      const msgTokens = estimateTokens(msg.content || '');
      
      if (tokens + msgTokens <= maxTokens) {
        trimmed.unshift(msg);
        tokens += msgTokens;
      } else {
        truncatedCount += i + 1;
        break;
      }
    }

    return {
      recentMessages: trimmed,
      truncatedCount,
      totalTokens: tokens,
    };
  }

  return {
    recentMessages,
    truncatedCount,
    totalTokens,
  };
}

/**
 * Summarize old messages using a simple extraction strategy
 * For production, this could use AI to generate summaries
 */
export async function summarizeMessages(
  messages: Array<{ role: string; content: string; timestamp?: Date }>,
  genAI?: any
): Promise<string> {
  if (!messages || messages.length === 0) {
    return '';
  }

  // If AI is available, use it to generate a summary
  if (genAI && messages.length > SUMMARY_THRESHOLD) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const conversationText = messages
        .map((msg, idx) => `${idx + 1}. ${msg.role}: ${msg.content}`)
        .join('\n\n');

      const summaryPrompt = `Summarize this conversation history into key points (2-3 sentences max):
Focus on: emotional themes, goals mentioned, progress made, important details.

Conversation:
${conversationText}

Summary:`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: summaryPrompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 200, // Short summary
        },
      });

      const summary = result.response.text()?.trim() || '';
      if (summary) {
        logger.debug(`Generated AI summary for ${messages.length} messages`);
        return summary;
      }
    } catch (error: any) {
      logger.warn('Failed to generate AI summary, using extraction method:', error.message);
    }
  }

  // Fallback: Simple extraction-based summary
  const userMessages = messages.filter(m => m.role === 'user').slice(0, 5);
  const keyTopics = userMessages.map(m => {
    const content = m.content || '';
    // Extract first sentence or first 100 chars
    const firstSentence = content.split(/[.!?]/)[0] || content.substring(0, 100);
    return firstSentence.trim();
  }).filter(Boolean);

  if (keyTopics.length > 0) {
    return `Earlier conversation covered: ${keyTopics.join('; ')}.`;
  }

  return `Previous conversation had ${messages.length} messages.`;
}

/**
 * Format conversation history with summary + recent messages
 */
export function formatConversationWithSummary(
  summary: string | undefined,
  recentMessages: Array<{ role: string; content: string; timestamp?: Date }>
): string {
  let conversation = '';
  
  if (summary) {
    conversation += `**Summary of earlier conversation:**\n${summary}\n\n`;
  }
  
  if (recentMessages.length > 0) {
    conversation += `**Recent conversation:**\n`;
    conversation += recentMessages
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Hope'}: ${msg.content || ''}`)
      .join('\n');
  }
  
  return conversation;
}

/**
 * AI-powered extraction of key facts from conversation using Gemini
 * This is context-aware and can identify important information even without explicit keywords
 */
export async function extractKeyFactsWithAI(
  messages: Array<{ role: string; content: string; timestamp?: Date }>,
  limit: number = 10
): Promise<Array<{
  type:
    | 'emotional_theme'
    | 'coping_pattern'
    | 'goal'
    | 'trigger'
    | 'insight'
    | 'preference'
    | 'person'
    | 'school'
    | 'organization';
  content: string;
  importance: number;
  tags: string[];
  context?: string;
}>> {
  if (!genAI || messages.length === 0) {
    return [];
  }

  try {
    // Format conversation for AI analysis
    const conversationText = messages
      .filter(msg => msg.role === 'user' && msg.content)
      .map(msg => `User: ${msg.content}`)
      .join('\n\n');

    if (!conversationText || conversationText.trim().length < 20) {
      return [];
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const extractionPrompt = `Analyze the following therapy conversation and extract key facts that should be remembered about the user for future sessions.

Only store facts that are:
- Likely to remain true over time
- Useful across many future conversations
- Non-sensitive and not overly invasive
- Not time-bound or one-off emotions

Focus on:

1. **Goals** - What the user wants to achieve (e.g., "I want to reduce anxiety", "My goal is to sleep better")
2. **Triggers** - What causes stress/anxiety/negative emotions (e.g., "Deadlines make me anxious", "I get stressed when...")
3. **Insights** - Realizations or breakthroughs (e.g., "I realized that...", "I understand now that...")
4. **Preferences** - Communication style, activities they like/dislike, preferences
5. **Emotional Themes** - Recurring emotional patterns or states
6. **Coping Patterns** - How the user typically responds to challenges (e.g., "I always...", "I tend to...")
7. **People** - Names or roles of important people (e.g., "My sister Ana", "My boss Mark")
8. **School/Work** - School, university, or workplace names and context

Do NOT store:
- Temporary feelings (e.g., "I felt sad today")
- Exact timestamps or one-off events
- Highly sensitive or intrusive details

Return ONLY a valid JSON array of facts, each with this exact structure:
{
  "type": "goal" | "trigger" | "insight" | "preference" | "emotional_theme" | "coping_pattern" | "person" | "school" | "organization",
  "content": "A clear, concise fact (max 150 characters)",
  "importance": 1-10 (higher = more important for future conversations),
  "tags": ["relevant", "tags"],
  "context": "optional brief context"
}

Extract the ${limit} most important facts. If no significant facts are present, return an empty array [].

Conversation:
${conversationText.substring(0, 8000)} // Limit input to avoid token issues

Return ONLY the JSON array, no explanations.`;

    const result = await model.generateContent(extractionPrompt);
    const response = result.response;
    const text = response.text();

    // Extract JSON from response (may have markdown code blocks)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?/g, '');
    }

    // Parse JSON response
    const facts = JSON.parse(jsonText);

    // Validate and normalize facts
    if (!Array.isArray(facts)) {
      logger.warn('AI extraction returned non-array result');
      return [];
    }

    return facts
      .filter((fact: any) => {
        // Validate required fields
        return fact.type && fact.content && typeof fact.importance === 'number';
      })
      .map((fact: any) => ({
        type: fact.type as
          | 'emotional_theme'
          | 'coping_pattern'
          | 'goal'
          | 'trigger'
          | 'insight'
          | 'preference'
          | 'person'
          | 'school'
          | 'organization',
        content: fact.content.trim().substring(0, 200), // Limit content length
        importance: Math.max(1, Math.min(10, fact.importance || 5)), // Clamp 1-10
        tags: Array.isArray(fact.tags) ? fact.tags.slice(0, 5) : [],
        context: fact.context?.toString() || undefined,
      }))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);

  } catch (error: any) {
    logger.warn('AI-powered fact extraction failed, will fall back to keyword-based:', error.message);
    return [];
  }
}

/**
 * Extract key facts from messages using keyword-based pattern matching (fallback method)
 */
function extractKeyFactsKeywordBased(
  messages: Array<{ role: string; content: string; timestamp?: Date }>,
  limit: number = 10
): Array<{
  type:
    | 'emotional_theme'
    | 'coping_pattern'
    | 'goal'
    | 'trigger'
    | 'insight'
    | 'preference'
    | 'person'
    | 'school'
    | 'organization';
  content: string;
  importance: number;
  tags: string[];
  context?: string;
}> {
  const facts: Array<{
    type:
      | 'emotional_theme'
      | 'coping_pattern'
      | 'goal'
      | 'trigger'
      | 'insight'
      | 'preference'
      | 'person'
      | 'school'
      | 'organization';
    content: string;
    importance: number;
    tags: string[];
    context?: string;
  }> = [];

  // Enhanced extraction based on keywords and patterns
  const goalKeywords = ['goal', 'want to', 'hope to', 'plan to', 'aim to', 'target', 'wish', 'dream', 'aspire', 'strive'];
  const triggerKeywords = ['trigger', 'makes me', 'causes', 'when', 'stress', 'anxious', 'anxiety', 'worried', 'afraid', 'scared', 'fear', 'panic'];
  const insightKeywords = ['realized', 'understood', 'learned', 'insight', 'realize', 'understand', 'discovered', 'found out', 'noticed', 'aware'];
  const patternKeywords = ['always', 'usually', 'pattern', 'habit', 'tend to', 'often', 'frequently', 'typically'];
  const preferenceKeywords = ['prefer', 'like', 'dislike', 'enjoy', 'love', 'hate', 'favorite', 'favourite', 'better', 'best'];
  const emotionalKeywords = ['feel', 'feeling', 'emotion', 'emotional', 'mood', 'sad', 'happy', 'angry', 'depressed', 'lonely', 'excited'];
  const personKeywords = [
    'my mom', 'my mother', 'my dad', 'my father', 'my sister', 'my brother',
    'my wife', 'my husband', 'my partner', 'my boyfriend', 'my girlfriend',
    'my friend', 'my boss', 'my manager', 'my coworker', 'my colleague',
    'my teacher', 'my professor', 'my coach', 'my therapist',
    'my son', 'my daughter', 'my child',
  ];
  const schoolKeywords = ['school', 'college', 'university', 'campus', 'class', 'major', 'degree'];
  const orgKeywords = ['work', 'job', 'company', 'office', 'workplace', 'team'];
  const namePatterns = [
    /my name is\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i,
    /call me\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i,
  ];
  const schoolPatterns = [
    /(?:i go to|i attend|i study at)\s+([A-Z][\w&.'-]+(?:\s[A-Z][\w&.'-]+)*)/i,
  ];
  const orgPatterns = [
    /(?:i work at|i work for|i'm at|i am at)\s+([A-Z][\w&.'-]+(?:\s[A-Z][\w&.'-]+)*)/i,
  ];

  for (const msg of messages) {
    if (msg.role !== 'user') continue;
    const content = (msg.content || '').toLowerCase();
    
    // Extract goals
    if (goalKeywords.some(keyword => content.includes(keyword))) {
      const sentences = msg.content?.split(/[.!?]/) || [];
      for (const sentence of sentences) {
        if (goalKeywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
          facts.push({
            type: 'goal',
            content: sentence.trim(),
            importance: 7,
            tags: ['goal', 'user-stated'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }

    // Extract triggers
    if (triggerKeywords.some(keyword => content.includes(keyword))) {
      const sentences = msg.content?.split(/[.!?]/) || [];
      for (const sentence of sentences) {
        if (triggerKeywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
          facts.push({
            type: 'trigger',
            content: sentence.trim(),
            importance: 8, // Triggers are important for context
            tags: ['trigger', 'emotional'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }

    // Extract insights
    if (insightKeywords.some(keyword => content.includes(keyword))) {
      const sentences = msg.content?.split(/[.!?]/) || [];
      for (const sentence of sentences) {
        if (insightKeywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
          facts.push({
            type: 'insight',
            content: sentence.trim(),
            importance: 9, // Insights are very important
            tags: ['insight', 'breakthrough'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }

    // Extract preferences
    if (preferenceKeywords.some(keyword => content.includes(keyword))) {
      const sentences = msg.content?.split(/[.!?]/) || [];
      for (const sentence of sentences) {
        if (preferenceKeywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
          facts.push({
            type: 'preference',
            content: sentence.trim(),
            importance: 6,
            tags: ['preference', 'user-preference'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }

    // Extract user name (stable identity)
    for (const pattern of namePatterns) {
      const match = pattern.exec(msg.content || '');
      if (match && match.length >= 2) {
        const name = match[1]?.trim();
        if (name && name.length >= 2) {
          facts.push({
            type: 'person',
            content: `User's name is ${name}`,
            importance: 9,
            tags: ['person', 'user', 'identity'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }

    // Extract important people
    if (personKeywords.some(keyword => content.includes(keyword))) {
      const sentences = msg.content?.split(/[.!?]/) || [];
      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        if (personKeywords.some(keyword => lower.includes(keyword))) {
          facts.push({
            type: 'person',
            content: sentence.trim(),
            importance: 7,
            tags: ['person', 'relationship', 'user-stated'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }

    // Extract school/education details
    if (schoolKeywords.some(keyword => content.includes(keyword))) {
      const sentences = msg.content?.split(/[.!?]/) || [];
      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        if (schoolKeywords.some(keyword => lower.includes(keyword))) {
          facts.push({
            type: 'school',
            content: sentence.trim(),
            importance: 6,
            tags: ['school', 'education', 'user-stated'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }
    for (const pattern of schoolPatterns) {
      const match = pattern.exec(msg.content || '');
      if (match && match.length >= 2) {
        const school = match[1]?.trim();
        if (school && school.length >= 2) {
          facts.push({
            type: 'school',
            content: `User studies at ${school}`,
            importance: 6,
            tags: ['school', 'education', 'user-stated'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }

    // Extract workplace/organization details
    if (orgKeywords.some(keyword => content.includes(keyword))) {
      const sentences = msg.content?.split(/[.!?]/) || [];
      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        if (orgKeywords.some(keyword => lower.includes(keyword))) {
          facts.push({
            type: 'organization',
            content: sentence.trim(),
            importance: 6,
            tags: ['organization', 'work', 'user-stated'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }
    for (const pattern of orgPatterns) {
      const match = pattern.exec(msg.content || '');
      if (match && match.length >= 2) {
        const org = match[1]?.trim();
        if (org && org.length >= 2) {
          facts.push({
            type: 'organization',
            content: `User works at ${org}`,
            importance: 6,
            tags: ['organization', 'work', 'user-stated'],
            context: msg.timestamp?.toISOString(),
          });
          break;
        }
      }
    }

    // Extract emotional themes and coping patterns
    if (emotionalKeywords.some(keyword => content.includes(keyword)) || patternKeywords.some(keyword => content.includes(keyword))) {
      // Look for patterns indicating coping mechanisms
      if (patternKeywords.some(keyword => content.includes(keyword))) {
        const sentences = msg.content?.split(/[.!?]/) || [];
        for (const sentence of sentences) {
          if (patternKeywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
            facts.push({
              type: 'coping_pattern',
              content: sentence.trim(),
              importance: 7,
              tags: ['pattern', 'behavior'],
              context: msg.timestamp?.toISOString(),
            });
            break;
          }
        }
      }
      
      // Extract emotional themes (favor stable patterns over one-off states)
      if (emotionalKeywords.some(keyword => content.includes(keyword)) && content.length > 20) {
        const timeBoundKeywords = ['today', 'yesterday', 'right now', 'currently', 'this morning', 'tonight', 'this week'];
        const sentences = msg.content?.split(/[.!?]/) || [];
        for (const sentence of sentences) {
          const lower = sentence.toLowerCase();
          const hasTimeBound = timeBoundKeywords.some(keyword => lower.includes(keyword));
          const hasPattern = patternKeywords.some(keyword => lower.includes(keyword));
          if (hasTimeBound && !hasPattern) {
            continue;
          }
          if (emotionalKeywords.some(keyword => lower.includes(keyword)) && sentence.trim().length > 15) {
            facts.push({
              type: 'emotional_theme',
              content: sentence.trim().substring(0, 200),
              importance: hasPattern ? 7 : 6,
              tags: ['emotion', 'emotional-state'],
              context: msg.timestamp?.toISOString(),
            });
            break;
          }
        }
      }
    }
  }

  // Sort by importance and limit
  return facts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
}

/**
 * Generate AI-powered summary about the user based on conversation history
 * This creates a comprehensive summary rather than individual facts
 */
export async function generateUserSummary(
  messages: Array<{ role: string; content: string; timestamp?: Date }>,
  existingSummary?: string
): Promise<{
  type: 'user_summary';
  content: string;
  importance: number;
  tags: string[];
  context?: string;
} | null> {
  if (!genAI || messages.length === 0) {
    return null;
  }

  try {
    // Format conversation for AI analysis
    const conversationText = messages
      .filter(msg => msg.role === 'user' && msg.content)
      .map(msg => `User: ${msg.content}`)
      .join('\n\n');

    if (!conversationText || conversationText.trim().length < 50) {
      return null;
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const summaryPrompt = `You are a mental health AI assistant. Based on the following conversation history, create a comprehensive summary about this user that will help you provide personalized support in future conversations.

${existingSummary ? `Previous summary to update:\n${existingSummary}\n\n` : ''}

Analyze the conversation and create a summary that includes:

1. **Background & Context**: Key personal details, life circumstances, and context mentioned
2. **Mental Health Profile**: Emotional patterns, challenges, triggers, and coping mechanisms
3. **Goals & Aspirations**: What the user wants to achieve or work on
4. **Communication Style**: How they express themselves, their preferences
5. **Progress & Insights**: Important realizations, breakthroughs, or patterns identified
6. **Support Needs**: What kind of support or approach works best for them

**Guidelines:**
- Write in third person (e.g., "The user struggles with...", "They have mentioned...")
- Be comprehensive but concise (300-500 words)
- Focus on patterns and insights, not individual message details
- Maintain therapeutic context without verbatim quotes
- Highlight what's most relevant for future personalized support
- If updating an existing summary, merge new information while preserving important context

Conversation History:
${conversationText.substring(0, 10000)} // Limit input to avoid token issues

Generate a comprehensive user summary:`;

    const result = await model.generateContent(summaryPrompt);
    const response = result.response;
    const summaryText = response.text()?.trim() || '';

    if (!summaryText || summaryText.length < 50) {
      logger.warn('AI summary generation returned empty or too short result');
      return null;
    }

    return {
      type: 'user_summary',
      content: summaryText.substring(0, 2000), // Limit to 2000 chars
      importance: 10, // User summaries are always high importance
      tags: ['summary', 'user-profile', 'ai-generated'],
      context: `Generated from ${messages.length} messages`,
    };

  } catch (error: any) {
    logger.warn('AI-powered user summary generation failed:', error.message);
    return null;
  }
}

/**
 * Extract key facts from messages for persistent memory
 * Uses AI-powered extraction when available, falls back to keyword-based extraction
 * Returns facts that should be stored in LongTermMemory
 */
export async function extractKeyFacts(
  messages: Array<{ role: string; content: string; timestamp?: Date }>,
  limit: number = 10
): Promise<Array<{
  type:
    | 'emotional_theme'
    | 'coping_pattern'
    | 'goal'
    | 'trigger'
    | 'insight'
    | 'preference'
    | 'person'
    | 'school'
    | 'organization';
  content: string;
  importance: number;
  tags: string[];
  context?: string;
}>> {
  // Try AI-powered extraction first
  const aiFacts = await extractKeyFactsWithAI(messages, limit);
  
  if (aiFacts.length > 0) {
    logger.debug(`AI extracted ${aiFacts.length} facts from conversation`);
    return aiFacts;
  }

  // Fallback to keyword-based extraction if AI extraction failed or returned no facts
  logger.debug('Falling back to keyword-based fact extraction');
  return extractKeyFactsKeywordBased(messages, limit);
}

