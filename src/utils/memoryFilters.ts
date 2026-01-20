import { logger } from './logger';

/**
 * Multi-layer Memory Filter System
 * 
 * Filters information before storing in persistent memory, similar to ChatGPT's approach.
 * This implements a "multi-layer sieve" system where information passes through several
 * filters before being stored:
 * 
 * LAYER 1: Privacy/Sensitivity Filter (ALWAYS CHECKED FIRST)
 *   - Blocks: passwords, credit cards, SSNs, sensitive medical info, account numbers
 *   - This is a hard stop - nothing sensitive gets through
 * 
 * LAYER 2: Explicit Consent Filter
 *   - If user says "remember X", overrides relevance/frequency filters
 *   - Still respects privacy filter (cannot override)
 * 
 * LAYER 3: Relevance Filter
 *   - Asks: "Will this make future conversations better?"
 *   - Scores content based on patterns (names, preferences, projects, goals, etc.)
 *   - Blocks: jokes, random thoughts, very short messages, low-value content
 * 
 * LAYER 4: Frequency/Pattern Filter
 *   - Detects if topic appears repeatedly in conversation
 *   - Boosts importance if mentioned 3+ times
 *   - Makes recurring topics more likely to be remembered
 * 
 * LAYER 5: Categorization
 *   - Tags memories: Identity, Style, Projects, Goals, Emotional, Coping, People, Triggers
 *   - Helps with organization and retrieval
 * 
 * FLOW:
 *   Incoming Info → Privacy Filter → [BLOCKED?] → Explicit Consent? → Relevance → Frequency → Categorize → STORE
 * 
 * Analogy: Like a high-tech sieve with multiple mesh layers - only what passes all layers gets stored.
 */

export interface MemoryFilterResult {
  shouldStore: boolean;
  reason?: string;
  category?: string;
  importance?: number;
}

/**
 * LAYER 1: Relevance Filter
 * Asks: "Will remembering this make future conversations better for the user?"
 */
function relevanceFilter(content: string, context?: string): { passes: boolean; score: number } {
  const text = content.toLowerCase().trim();
  let score = 0;

  // Positive indicators (increase relevance)
  const relevancePatterns = {
    // Personal information
    name: /\b(?:my name is|i'm|i am|call me|i go by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    pronouns: /\b(?:my pronouns are|i use|pronouns?)\s+(he|she|they|it|xe|ze)/i,
    birthday: /\b(?:birthday|born on|my birthday is)\s+([A-Z][a-z]+\s+\d{1,2}|\d{1,2}\s+[A-Z][a-z]+)/i,
    
    // Preferences
    preference: /\b(?:i prefer|i like|i want|i'd like|prefer|favorite|favourite)\s+(.+?)(?:\.|,|$)/i,
    style: /\b(?:explain like|teach me like|be more|be less|tone should be)\s+(.+?)(?:\.|,|$)/i,
    
    // Ongoing projects/activities
    project: /\b(?:working on|building|developing|studying|learning|project)\s+(.+?)(?:\.|,|$)/i,
    hobby: /\b(?:hobby|interest|passion|i enjoy|i love)\s+(.+?)(?:\.|,|$)/i,
    
    // Goals and challenges
    goal: /\b(?:goal|trying to|want to|aiming to|planning to)\s+(.+?)(?:\.|,|$)/i,
    challenge: /\b(?:struggling with|having trouble with|difficulty with|challenge)\s+(.+?)(?:\.|,|$)/i,
  };

  // Check for relevance patterns
  for (const [key, pattern] of Object.entries(relevancePatterns)) {
    if (pattern.test(text)) {
      score += 3;
      logger.debug(`Relevance filter: Found ${key} pattern`);
    }
  }

  // Negative indicators (decrease relevance)
  const lowRelevancePatterns = [
    /\b(?:just kidding|haha|lol|lmao|jk|random thought|thinking out loud)\b/i,
    /\b(?:ignore that|never mind|scratch that|cancel that)\b/i,
    /\b(?:test|testing|this is a test)\b/i,
  ];

  for (const pattern of lowRelevancePatterns) {
    if (pattern.test(text)) {
      score -= 5;
      logger.debug('Relevance filter: Found low-relevance indicator');
    }
  }

  // Minimum length check (very short messages are usually not worth remembering)
  if (text.length < 10) {
    score -= 2;
  }

  // Minimum score threshold
  const passes = score >= 2;
  return { passes, score };
}

/**
 * LAYER 2: Privacy/Sensitivity Filter
 * Blocks: Passwords, credit cards, medical diagnoses, sensitive personal info
 */
function privacySensitivityFilter(content: string): { passes: boolean; reason?: string } {
  const text = content.toLowerCase();

  // Credit card patterns (16 digits with optional spaces/dashes)
  const creditCardPattern = /\b(?:\d{4}[\s-]?){3}\d{4}\b/;
  if (creditCardPattern.test(content)) {
    return { passes: false, reason: 'Contains potential credit card number' };
  }

  // Password indicators
  const passwordPatterns = [
    /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
    /\b(?:my password is|password is)\s+\S+/i,
  ];
  for (const pattern of passwordPatterns) {
    if (pattern.test(text)) {
      return { passes: false, reason: 'Contains potential password' };
    }
  }

  // SSN patterns (US format)
  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/;
  if (ssnPattern.test(content)) {
    return { passes: false, reason: 'Contains potential SSN' };
  }

  // Medical diagnosis keywords (block specific diagnoses but allow general discussion)
  const sensitiveMedicalTerms = [
    /\bdiagnosed with\s+(?:cancer|hiv|aids|std|sti|terminal|fatal)\b/i,
    /\b(?:terminal|fatal|life-threatening)\s+illness\b/i,
  ];
  for (const pattern of sensitiveMedicalTerms) {
    if (pattern.test(text)) {
      return { passes: false, reason: 'Contains sensitive medical information' };
    }
  }

  // Financial account numbers
  const accountNumberPattern = /\b(?:account|acct|routing)\s+(?:number|#|no\.?)\s*[:=]?\s*\d{8,}\b/i;
  if (accountNumberPattern.test(text)) {
    return { passes: false, reason: 'Contains potential account number' };
  }

  return { passes: true };
}

/**
 * LAYER 3: Explicit Consent Filter
 * User explicitly said "remember X" - override other filters (except privacy)
 */
function explicitConsentFilter(
  content: string,
  isExplicitCommand: boolean
): { passes: boolean; override: boolean } {
  if (isExplicitCommand) {
    // Explicit commands override relevance but NOT privacy
    return { passes: true, override: true };
  }
  return { passes: false, override: false };
}

/**
 * LAYER 4: Frequency/Pattern Filter
 * Detects if topic appears repeatedly (makes it more worth remembering)
 */
function frequencyPatternFilter(
  content: string,
  previousMessages: Array<{ content: string }>
): { passes: boolean; frequency: number } {
  if (!previousMessages || previousMessages.length === 0) {
    return { passes: false, frequency: 0 };
  }

  // Extract key terms from current content
  const keyTerms = extractKeyTerms(content);
  if (keyTerms.length === 0) {
    return { passes: false, frequency: 0 };
  }

  // Count how many previous messages mention similar topics
  let matchCount = 0;
  for (const msg of previousMessages.slice(-20)) { // Check last 20 messages
    const msgTerms = extractKeyTerms(msg.content);
    // Check if any key terms overlap
    const overlap = keyTerms.filter(term => 
      msgTerms.some(msgTerm => 
        term.toLowerCase().includes(msgTerm.toLowerCase()) ||
        msgTerm.toLowerCase().includes(term.toLowerCase())
      )
    );
    if (overlap.length > 0) {
      matchCount++;
    }
  }

  // If mentioned 3+ times in recent messages, it's a pattern
  const frequency = matchCount;
  const passes = frequency >= 3;

  if (passes) {
    logger.debug(`Frequency filter: Topic mentioned ${frequency} times - worth remembering`);
  }

  return { passes, frequency };
}

/**
 * Extract key terms from text (simple version - could be enhanced with NLP)
 */
function extractKeyTerms(text: string): string[] {
  // Remove common stop words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'could', 'may', 'might', 'must', 'can', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
    'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them'
  ]);

  // Extract words (2+ characters, not stop words)
  const words = text.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
  const terms = words
    .filter(word => !stopWords.has(word))
    .slice(0, 10); // Take top 10 key terms

  return terms;
}

/**
 * LAYER 5: Categorization
 * Determines memory category based on content
 */
function categorizeMemory(content: string): {
  category: string;
  type:
    | 'preference'
    | 'goal'
    | 'insight'
    | 'emotional_theme'
    | 'coping_pattern'
    | 'person'
    | 'trigger';
} {
  const text = content.toLowerCase();

  // Identity/Personal Info
  if (/\b(?:my name is|i'm|i am|call me|pronouns?|birthday|born on)\b/i.test(text)) {
    return { category: 'Identity', type: 'insight' };
  }

  // Preferences
  if (/\b(?:prefer|like|want|favorite|favourite|style|tone|explain like)\b/i.test(text)) {
    return { category: 'Style', type: 'preference' };
  }

  // Ongoing Projects
  if (/\b(?:working on|building|developing|project|app|studying|learning)\b/i.test(text)) {
    return { category: 'Projects', type: 'goal' };
  }

  // Goals
  if (/\b(?:goal|trying to|want to|aiming to|planning to|hope to)\b/i.test(text)) {
    return { category: 'Goals', type: 'goal' };
  }

  // Emotional themes
  if (/\b(?:feel|feeling|emotion|anxious|depressed|stressed|happy|sad)\b/i.test(text)) {
    return { category: 'Emotional', type: 'emotional_theme' };
  }

  // Coping patterns
  if (/\b(?:cope|coping|deal with|handle|manage|when i feel)\b/i.test(text)) {
    return { category: 'Coping', type: 'coping_pattern' };
  }

  // People
  if (/\b(?:friend|partner|spouse|parent|sibling|colleague|boss|teacher)\b/i.test(text)) {
    return { category: 'People', type: 'person' };
  }

  // Triggers
  if (/\b(?:trigger|triggers|when|if|makes me|causes me)\b/i.test(text)) {
    return { category: 'Triggers', type: 'trigger' };
  }

  // Default
  return { category: 'Notes', type: 'insight' };
}

/**
 * MAIN FILTER FUNCTION
 * Applies all filters in sequence (like a multi-layer sieve)
 */
export function filterMemoryForStorage(
  content: string,
  options: {
    isExplicitCommand?: boolean;
    previousMessages?: Array<{ content: string }>;
    context?: string;
  } = {}
): MemoryFilterResult {
  const { isExplicitCommand = false, previousMessages = [], context } = options;

  // STEP 1: Privacy/Sensitivity Filter (ALWAYS checked first - highest priority)
  const privacyCheck = privacySensitivityFilter(content);
  if (!privacyCheck.passes) {
    logger.debug(`Memory filter: BLOCKED by privacy filter - ${privacyCheck.reason}`);
    return {
      shouldStore: false,
      reason: privacyCheck.reason || 'Privacy/sensitivity filter blocked',
    };
  }

  // STEP 2: Explicit Consent Filter (overrides relevance/frequency if user explicitly asked)
  const consentCheck = explicitConsentFilter(content, isExplicitCommand);
  if (consentCheck.override && consentCheck.passes) {
    logger.debug('Memory filter: PASSED by explicit consent (override)');
    const categorization = categorizeMemory(content);
    return {
      shouldStore: true,
      reason: 'User explicitly requested to remember',
      category: categorization.category,
      importance: 9, // High importance for explicit memories
    };
  }

  // STEP 3: Relevance Filter
  const relevanceCheck = relevanceFilter(content, context);
  if (!relevanceCheck.passes) {
    logger.debug(`Memory filter: BLOCKED by relevance filter (score: ${relevanceCheck.score})`);
    return {
      shouldStore: false,
      reason: 'Not relevant enough for future conversations',
    };
  }

  // STEP 4: Frequency/Pattern Filter (boost importance if repeated)
  const frequencyCheck = frequencyPatternFilter(content, previousMessages);
  
  // Determine importance based on relevance score and frequency
  let importance = 5; // Base importance
  if (relevanceCheck.score >= 6) importance = 8; // High relevance
  if (frequencyCheck.frequency >= 3) importance = Math.max(importance, 7); // Repeated topic
  if (relevanceCheck.score >= 6 && frequencyCheck.frequency >= 3) importance = 9; // Both

  // STEP 5: Categorization
  const categorization = categorizeMemory(content);

  // Final decision: passes if relevance passes (privacy already checked)
  if (relevanceCheck.passes) {
    logger.debug(
      `Memory filter: PASSED - Category: ${categorization.category}, ` +
      `Importance: ${importance}, Frequency: ${frequencyCheck.frequency}`
    );
    return {
      shouldStore: true,
      reason: 'Passed all filters',
      category: categorization.category,
      importance,
    };
  }

  return {
    shouldStore: false,
    reason: 'Did not pass relevance filter',
  };
}

/**
 * Helper: Check if content should be stored based on filters
 */
export function shouldStoreMemory(
  content: string,
  options: {
    isExplicitCommand?: boolean;
    previousMessages?: Array<{ content: string }>;
    context?: string;
  } = {}
): boolean {
  const result = filterMemoryForStorage(content, options);
  return result.shouldStore;
}
