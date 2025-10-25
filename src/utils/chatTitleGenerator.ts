import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Generate a concise title for a chat session based on the conversation
 * @param messages Array of conversation messages
 * @returns A short, descriptive title (3-6 words)
 */
export async function generateChatTitle(messages: Array<{ role: string; content: string }>): Promise<string> {
  try {
    // Need at least 2 messages for meaningful title
    if (!messages || messages.length < 2) {
      return "New Conversation";
    }

    // Get first 4-6 messages for context
    const contextMessages = messages.slice(0, Math.min(6, messages.length));
    const conversation = contextMessages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Hope'}: ${msg.content}`)
      .join('\n');

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Generate a very short, concise title (3-6 words maximum) that captures the main topic of this conversation. 
Do not use quotes. Just return the title.

Conversation:
${conversation}

Title:`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 20, // Short titles only
      },
    });

    const response = await result.response;
    let title = response.text()?.trim() || "Conversation";

    // Clean up the title
    title = title
      .replace(/^["']|["']$/g, '') // Remove quotes
      .replace(/^Title:\s*/i, '') // Remove "Title:" prefix
      .trim();

    // Ensure title isn't too long
    if (title.length > 50) {
      title = title.substring(0, 47) + '...';
    }

    // Fallback if empty or too short
    if (!title || title.length < 3) {
      title = "Conversation";
    }

    logger.info(`Generated chat title: "${title}"`);
    return title;

  } catch (error) {
    logger.error("Failed to generate chat title:", error);
    // Fallback to first user message excerpt
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage && firstUserMessage.content.length > 0) {
      const excerpt = firstUserMessage.content.slice(0, 40);
      return excerpt.length < firstUserMessage.content.length ? excerpt + '...' : excerpt;
    }
    return "New Conversation";
  }
}

/**
 * Check if a session should have its title generated
 * @param messageCount Number of messages in the session
 * @param currentTitle Current title (if any)
 * @returns true if title should be generated
 */
export function shouldGenerateTitle(messageCount: number, currentTitle?: string): boolean {
  // Generate title after 3-4 messages if not already set
  return messageCount >= 3 && messageCount <= 4 && !currentTitle;
}

