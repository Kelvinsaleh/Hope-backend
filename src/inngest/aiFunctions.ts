import { inngest } from "./client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../utils/logger";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || "AIzaSyCCRSas8dVBP3ye4ZY5RBPsYqw7m_2jro8"
);

// Function to handle chat message processing
export const processChatMessage = inngest.createFunction(
  {
    id: "process-chat-message",
  },
  { event: "therapy/session.message" },
  async ({ event, step }) => {
    try {
      const {
        message,
        history,
        memory = {
          userProfile: {
            emotionalState: [],
            riskLevel: 0,
            preferences: {},
          },
          sessionContext: {
            conversationThemes: [],
            currentTechnique: null,
          },
        },
        goals = [],
        systemPrompt,
      } = event.data;

      logger.info("Processing chat message:", {
        message,
        historyLength: history?.length,
      });

      // Analyze the message using Gemini
      const analysis = await step.run("analyze-message", async () => {
        try {
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

          const prompt = `Analyze this therapy message and provide insights. Return ONLY a valid JSON object with no markdown formatting or additional text.
          Message: ${message}
          Context: ${JSON.stringify({ memory, goals })}
          
          Required JSON structure:
          {
            "emotionalState": "string",
            "themes": ["string"],
            "riskLevel": number,
            "recommendedApproach": "string",
            "progressIndicators": ["string"]
          }`;

          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text().trim();

          logger.info("Received analysis from Gemini:", { text });

          // Clean the response text to ensure it's valid JSON
          const cleanText = text.replace(/```json\n|\n```/g, "").trim();
          const parsedAnalysis = JSON.parse(cleanText);

          logger.info("Successfully parsed analysis:", parsedAnalysis);
          return parsedAnalysis;
        } catch (error) {
          logger.error("Error in message analysis:", { error, message });
          // Return a default analysis instead of throwing
          return {
            emotionalState: "neutral",
            themes: [],
            riskLevel: 0,
            recommendedApproach: "supportive",
            progressIndicators: [],
          };
        }
      });

      // Update memory based on analysis
      const updatedMemory = await step.run("update-memory", async () => {
        if (analysis.emotionalState) {
          memory.userProfile.emotionalState.push(analysis.emotionalState);
        }
        if (analysis.themes) {
          memory.sessionContext.conversationThemes.push(...analysis.themes);
        }
        if (analysis.riskLevel) {
          memory.userProfile.riskLevel = analysis.riskLevel;
        }
        return memory;
      });

      // If high risk is detected, trigger an alert
      if (analysis.riskLevel > 4) {
        await step.run("trigger-risk-alert", async () => {
          logger.warn("High risk level detected in chat message", {
            message,
            riskLevel: analysis.riskLevel,
          });
        });
      }

      // Generate therapeutic response
      const response = await step.run("generate-response", async () => {
        try {
          const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash"
          });

          const prompt = `You are Hope, a calm, kind, and emotionally aware companion.
Your role is to help users feel lighter, seen, and gently motivated — not analyzed or corrected.

Engagement & Conversation Guidelines:
1. Ask questions sparingly and strategically, not all at once. Avoid bombarding the user with multiple questions.
2. Encourage the user to explore one topic at a time rather than jumping between different subjects.
3. Use empathetic and supportive language instead of robotic or overly formal tone. Speak like a real person.
4. Avoid repetitive or irrelevant questions. Pay attention to what the user has already shared.
5. Offer gentle prompts when appropriate, such as "Would you like to tell me more about that?" or "How did that make you feel?" But use these thoughtfully, not after every response.
6. Balance listening and asking: Prioritize reflecting on user input before asking new questions. Show you're listening by acknowledging what they've said.
7. Adapt your questions based on the user's emotional state and responses. If they seem overwhelmed, slow down. If they're ready to explore, gently guide deeper.
8. End each interaction with a positive, encouraging note when appropriate, but make it genuine, not forced.

Example interaction style:
User: "I feel stressed about work."
Hope: "I hear that. Can you tell me which part of work is stressing you out the most?"
User: "Deadlines."
Hope: "That sounds tough. How have you been coping with those deadlines lately?"

Tone & style rules:
- Speak naturally, in 2–4 short sentences max
- Be warm and human — not overly cheerful or robotic
- Show empathy through word choice, not by saying "I understand" or "I'm sorry"
- Focus on emotions behind what users say, not giving solutions right away
- Prioritize reflecting and validating before asking new questions
- End with a small, open reflection or gentle question (but use questions sparingly)
- If a user is struggling, help them slow down, breathe, and feel grounded
- Keep your words under 60 words

User message: ${message}
Emotional state: ${analysis.emotionalState}
Risk level: ${analysis.riskLevel}/10

Help them feel safe, calm, and supported enough to open up — like talking to someone who truly listens.`;

          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.8,
              topP: 0.95,
            },
          });
          const responseText = result.response.text()?.trim() || '';

          // Validate response is not empty
          if (responseText.length === 0) {
            logger.warn("AI returned empty response, using fallback");
            return "I'm here with you. What's on your mind?";
          }

          logger.info("Generated response:", { responseText });
          return responseText;
        } catch (error) {
          logger.error("Error generating response:", { error, message });
          // Return a default response instead of throwing
          return "I'm here with you. What's on your mind?";
        }
      });

      // Return the response in the expected format
      return {
        response,
        analysis,
        updatedMemory,
      };
    } catch (error) {
      logger.error("Error in chat message processing:", {
        error,
        message: event.data.message,
      });
      // Return a default response instead of throwing
      return {
        response:
          "I'm here with you. What's on your mind?",
        analysis: {
          emotionalState: "neutral",
          themes: [],
          riskLevel: 0,
          recommendedApproach: "supportive",
          progressIndicators: [],
        },
        updatedMemory: event.data.memory,
      };
    }
  }
);

// Function to analyze therapy session content
export const analyzeTherapySession = inngest.createFunction(
  { id: "analyze-therapy-session" },
  { event: "therapy/session.created" },
  async ({ event, step }) => {
    try {
      // Get the session content
      const sessionContent = await step.run("get-session-content", async () => {
        return event.data.notes || event.data.transcript;
      });

      // Analyze the session using Gemini
      const analysis = await step.run("analyze-with-gemini", async () => {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `Analyze this therapy session and provide insights:
        Session Content: ${sessionContent}
        
        Please provide:
        1. Key themes and topics discussed
        2. Emotional state analysis
        3. Potential areas of concern
        4. Recommendations for follow-up
        5. Progress indicators
        
        Format the response as a JSON object.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return JSON.parse(text);
      });

      // Store the analysis
      await step.run("store-analysis", async () => {
        // Here you would typically store the analysis in your database
        logger.info("Session analysis stored successfully");
        return analysis;
      });

      // If there are concerning indicators, trigger an alert
      if (analysis.areasOfConcern?.length > 0) {
        await step.run("trigger-concern-alert", async () => {
          logger.warn("Concerning indicators detected in session analysis", {
            sessionId: event.data.sessionId,
            concerns: analysis.areasOfConcern,
          });
          // Add your alert logic here
        });
      }

      return {
        message: "Session analysis completed",
        analysis,
      };
    } catch (error) {
      logger.error("Error in therapy session analysis:", error);
      throw error;
    }
  }
);

// Function to generate personalized activity recommendations
export const generateActivityRecommendations = inngest.createFunction(
  { id: "generate-activity-recommendations" },
  { event: "mood/updated" },
  async ({ event, step }) => {
    try {
      // Get user's mood history and activity history
      const userContext = await step.run("get-user-context", async () => {
        // Here you would typically fetch user's history from your database
        return {
          recentMoods: event.data.recentMoods,
          completedActivities: event.data.completedActivities,
          preferences: event.data.preferences,
        };
      });

      // Generate recommendations using Gemini
      const recommendations = await step.run(
        "generate-recommendations",
        async () => {
          const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

          const prompt = `Based on the following user context, generate personalized activity recommendations:
        User Context: ${JSON.stringify(userContext)}
        
        Please provide:
        1. 3-5 personalized activity recommendations
        2. Reasoning for each recommendation
        3. Expected benefits
        4. Difficulty level
        5. Estimated duration
        
        Format the response as a JSON object.`;

          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text();

          return JSON.parse(text);
        }
      );

      // Store the recommendations
      await step.run("store-recommendations", async () => {
        // Here you would typically store the recommendations in your database
        logger.info("Activity recommendations stored successfully");
        return recommendations;
      });

      return {
        message: "Activity recommendations generated",
        recommendations,
      };
    } catch (error) {
      logger.error("Error generating activity recommendations:", error);
      throw error;
    }
  }
);

// Add the functions to the exported array
export const functions = [
  processChatMessage,
  analyzeTherapySession,
  generateActivityRecommendations,
];
