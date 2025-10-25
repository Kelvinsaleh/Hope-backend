/**
 * Hope's 3-Layer Memory System
 * 
 * 1. Long-Term Memory: Database storage with semantic search (top 3-5 relevant memories)
 * 2. Short-Term Memory: Last 5-10 conversation turns + summaries
 * 3. System Memory: Core personality + current tone mode
 */

import { logger } from './logger';
import { normalizeMood } from './hopePersonality';

export interface LongTermMemory {
  userId: string;
  type: 'emotional_theme' | 'coping_pattern' | 'goal' | 'trigger' | 'insight' | 'preference';
  content: string;
  importance: number; // 1-10, higher = more relevant
  timestamp: Date;
  tags: string[];
  context?: string;
}

export interface ShortTermMemory {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  summary?: string;
  currentMood: string;
  activeTone: string;
  keyVariables: Record<string, any>;
}

export interface SystemMemory {
  toneMode: string;
  emotionalContext: string;
  activeApproach: string;
}

/**
 * Extract relevant long-term memories (max 3-5 items)
 * Uses importance scoring and recency to pick what matters NOW
 */
export async function getRelevantLongTermMemories(
  userId: string,
  currentMessage: string,
  currentMood: string,
  limit: number = 3
): Promise<LongTermMemory[]> {
  try {
    // In production, use vector search (Pinecone, Supabase, etc.)
    // For now, use MongoDB with text search and scoring
    
    const { LongTermMemoryModel } = await import('../models/LongTermMemory');
    
    // Find memories matching current mood or message themes
    const messageLower = currentMessage.toLowerCase();
    const keywords = extractKeywords(messageLower);
    
    const memories = await LongTermMemoryModel.find({
      userId,
      $or: [
        { tags: { $in: keywords } },
        { content: { $regex: keywords.join('|'), $options: 'i' } }
      ]
    })
    .sort({ importance: -1, timestamp: -1 })
    .limit(limit * 2); // Get extra to filter
    
    // Score by relevance + recency
    const scored = memories.map(mem => {
      const recencyScore = getRecencyScore(mem.timestamp);
      const relevanceScore = getRelevanceScore(mem, keywords, currentMood);
      return {
        memory: mem,
        score: (mem.importance * 0.4) + (relevanceScore * 0.4) + (recencyScore * 0.2)
      };
    });
    
    // Return top N most relevant
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.memory);
    
  } catch (error) {
    logger.error('Error fetching long-term memories:', error);
    return [];
  }
}

/**
 * Get short-term memory (last few turns + summary)
 */
export async function getShortTermMemory(
  sessionId: string,
  maxTurns: number = 10
): Promise<ShortTermMemory> {
  try {
    const { ChatSession } = await import('../models/ChatSession');
    
    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      return {
        messages: [],
        currentMood: 'neutral',
        activeTone: 'balanced',
        keyVariables: {}
      };
    }
    
    // Get last N turns
    const recentMessages = session.messages.slice(-maxTurns);
    
    // If we have more than maxTurns, create a summary of older messages
    let summary: string | undefined;
    if (session.messages.length > maxTurns) {
      const olderMessages = session.messages.slice(0, -maxTurns);
      summary = await compressConversationHistory(olderMessages);
    }
    
    return {
      messages: recentMessages,
      summary,
      currentMood: session.currentMood || 'neutral',
      activeTone: session.activeTone || 'balanced',
      keyVariables: {
        sessionStartTime: session.startTime,
        messageCount: session.messages.length
      }
    };
    
  } catch (error) {
    logger.error('Error fetching short-term memory:', error);
    return {
      messages: [],
      currentMood: 'neutral',
      activeTone: 'balanced',
      keyVariables: {}
    };
  }
}

/**
 * Build system memory (lightweight, changes per request)
 */
export function buildSystemMemory(
  mood: string,
  recentThemes: string[]
): SystemMemory {
  const normalizedMood = normalizeMood(mood);
  
  // Map mood to tone mode
  const toneModes: Record<string, string> = {
    'happy': 'bright-celebratory',
    'calm': 'peaceful-reflective',
    'sad': 'gentle-comforting',
    'stressed': 'grounding-steady',
    'tired': 'encouraging-soft',
    'angry': 'balanced-validating',
    'anxious': 'calming-present',
    'lonely': 'warm-connecting',
    'hopeful': 'uplifting-forward',
    'grateful': 'appreciative-warm',
    'neutral': 'balanced-open'
  };
  
  return {
    toneMode: toneModes[normalizedMood] || 'balanced-open',
    emotionalContext: `User is feeling ${normalizedMood}`,
    activeApproach: getApproachForMood(normalizedMood)
  };
}

/**
 * Compress old conversation history into brief summary
 * Keeps token count low while preserving key info
 */
async function compressConversationHistory(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  // Extract key themes without using AI (fast)
  const themes = new Set<string>();
  const emotions = new Set<string>();
  
  messages.forEach(msg => {
    if (msg.role === 'user') {
      const content = msg.content.toLowerCase();
      
      // Detect themes
      if (content.includes('work') || content.includes('job')) themes.add('work stress');
      if (content.includes('family') || content.includes('parent')) themes.add('family');
      if (content.includes('anxious') || content.includes('worried')) emotions.add('anxiety');
      if (content.includes('sad') || content.includes('down')) emotions.add('sadness');
      if (content.includes('happy') || content.includes('good')) emotions.add('positive');
      if (content.includes('tired') || content.includes('exhausted')) emotions.add('fatigue');
    }
  });
  
  const themeStr = themes.size > 0 ? Array.from(themes).join(', ') : 'general reflection';
  const emotionStr = emotions.size > 0 ? Array.from(emotions).join(', ') : 'mixed feelings';
  
  return `Earlier session: Discussed ${themeStr}. Emotional state included ${emotionStr}.`;
}

/**
 * Store a new long-term memory
 */
export async function storeLongTermMemory(memory: LongTermMemory): Promise<void> {
  try {
    const { LongTermMemoryModel } = await import('../models/LongTermMemory');
    await LongTermMemoryModel.create(memory);
    logger.info(`Stored long-term memory for user ${memory.userId}: ${memory.type}`);
  } catch (error) {
    logger.error('Error storing long-term memory:', error);
  }
}

/**
 * Extract key emotional insights after a conversation
 * Store them as long-term memories
 */
export async function extractAndStoreInsights(
  userId: string,
  sessionMessages: Array<{ role: string; content: string }>,
  sessionMood: string
): Promise<void> {
  try {
    const insights: LongTermMemory[] = [];
    
    // Analyze conversation for patterns
    const userMessages = sessionMessages.filter(m => m.role === 'user');
    const fullContent = userMessages.map(m => m.content).join(' ').toLowerCase();
    
    // Detect coping patterns
    if (fullContent.includes('helped') || fullContent.includes('better when')) {
      const copingHint = userMessages.find(m => 
        m.content.toLowerCase().includes('helped') || 
        m.content.toLowerCase().includes('better')
      );
      if (copingHint) {
        insights.push({
          userId,
          type: 'coping_pattern',
          content: `User finds comfort in: ${copingHint.content.substring(0, 100)}`,
          importance: 8,
          timestamp: new Date(),
          tags: ['coping', 'helpful', normalizeMood(sessionMood)]
        });
      }
    }
    
    // Detect triggers
    if (fullContent.includes('makes me') || fullContent.includes('when i')) {
      insights.push({
        userId,
        type: 'trigger',
        content: `Potential trigger pattern detected in recent conversation`,
        importance: 7,
        timestamp: new Date(),
        tags: ['trigger', 'awareness', normalizeMood(sessionMood)]
      });
    }
    
    // Detect goals
    if (fullContent.includes('want to') || fullContent.includes('hope to') || fullContent.includes('goal')) {
      const goalMessage = userMessages.find(m => 
        m.content.toLowerCase().includes('want to') || 
        m.content.toLowerCase().includes('goal')
      );
      if (goalMessage) {
        insights.push({
          userId,
          type: 'goal',
          content: `User goal: ${goalMessage.content.substring(0, 150)}`,
          importance: 9,
          timestamp: new Date(),
          tags: ['goal', 'motivation', 'growth']
        });
      }
    }
    
    // Store all insights
    for (const insight of insights) {
      await storeLongTermMemory(insight);
    }
    
    if (insights.length > 0) {
      logger.info(`Extracted ${insights.length} insights from session for user ${userId}`);
    }
    
  } catch (error) {
    logger.error('Error extracting session insights:', error);
  }
}

// Helper functions
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'i', 'you', 'me']);
  return text
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/gi, '').toLowerCase())
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 10);
}

function getRecencyScore(timestamp: Date): number {
  const daysAgo = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo < 1) return 1.0;
  if (daysAgo < 7) return 0.8;
  if (daysAgo < 30) return 0.5;
  return 0.2;
}

function getRelevanceScore(
  memory: LongTermMemory,
  keywords: string[],
  currentMood: string
): number {
  let score = 0;
  
  // Tag matching
  const matchingTags = memory.tags.filter(tag => 
    keywords.some(kw => tag.includes(kw))
  );
  score += matchingTags.length * 0.3;
  
  // Mood matching
  if (memory.tags.includes(normalizeMood(currentMood))) {
    score += 0.4;
  }
  
  // Content matching
  const contentLower = memory.content.toLowerCase();
  const keywordMatches = keywords.filter(kw => contentLower.includes(kw));
  score += keywordMatches.length * 0.2;
  
  return Math.min(score, 1.0);
}

function getApproachForMood(mood: string): string {
  const approaches: Record<string, string> = {
    'happy': 'Celebrate and explore what's working',
    'calm': 'Support peaceful reflection',
    'sad': 'Hold space, don't rush to fix',
    'stressed': 'Ground and simplify',
    'tired': 'Give permission to rest',
    'angry': 'Validate without judgment',
    'anxious': 'Slow down and anchor',
    'lonely': 'Be present, create connection',
    'hopeful': 'Nurture the spark',
    'grateful': 'Reflect the appreciation',
    'neutral': 'Stay curious and open'
  };
  
  return approaches[mood] || 'Meet them where they are';
}

