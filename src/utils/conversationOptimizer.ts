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
 * Extract key facts from messages for persistent memory
 * Returns facts that should be stored in LongTermMemory
 */
export function extractKeyFacts(
  messages: Array<{ role: string; content: string; timestamp?: Date }>,
  limit: number = 10
): Array<{
  type: 'emotional_theme' | 'coping_pattern' | 'goal' | 'trigger' | 'insight' | 'preference';
  content: string;
  importance: number;
  tags: string[];
  context?: string;
}> {
  const facts: Array<{
    type: 'emotional_theme' | 'coping_pattern' | 'goal' | 'trigger' | 'insight' | 'preference';
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
      
      // Extract emotional themes
      if (emotionalKeywords.some(keyword => content.includes(keyword)) && content.length > 20) {
        // Extract emotional context
        facts.push({
          type: 'emotional_theme',
          content: msg.content.trim().substring(0, 200), // First 200 chars
          importance: 7,
          tags: ['emotion', 'emotional-state'],
          context: msg.timestamp?.toISOString(),
        });
      }
    }
  }

  // Sort by importance and limit
  return facts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
}

