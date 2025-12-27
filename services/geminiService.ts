
import { GoogleGenAI, Type } from "@google/genai";

export interface PlayerInsight {
  playerName: string;
  insight: string;
}

/**
 * Generates structural NBA AI insights using Gemini 3 Flash.
 * Explains the structural drivers behind market-implied sentiment (MORE/LESS).
 */
export const generateInsightsWithGemini = async (
  marketName: string,
  data: any
): Promise<PlayerInsight[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
You are a professional NBA market-structure analyst.
Your task is to generate one concise, structural insight per player explaining WHY the sportsbook market is leaning the way it is.

CORE OBJECTIVES:
- Explain the structural drivers behind the market-implied lean using role stability, variance sensitivity, and game context.
- When the market leans MORE, focus on usage floor, minutes security, or role centrality.
- When the market leans LESS, focus on line fragility, efficiency dependence, rotation sensitivity, or blowout exposure.
- Treat market direction as descriptive pricing behavior, not a prediction or recommendation.

MARKET AVAILABILITY RULE:
- If Over / Under pricing is unavailable or incomplete, treat the market state as neutral.
- In neutral market states, do NOT imply or infer a directional lean.
- Use language indicating market unavailability or lack of pricing context instead of MORE / LESS framing.

NON-REDUNDANT INSIGHT RULES:
- Do NOT repeat bookmaker names, odds, prices, or consensus values.
- Do NOT restate the More / Less direction shown in the UI.
- Do NOT repeat Market Lean strength, role labels, or miss risk values verbatim.
- Each insight must add new structural context beyond what is already visible.

STRICT PROHIBITIONS:
- NEVER provide betting advice or imply action.
- NEVER use terms such as value, lock, take, edge, good bet, or recommend.
- NEVER guarantee outcomes or imply certainty.
- NEVER use emojis or raw performance statistics.

STYLE REQUIREMENTS:
- One sentence only per player.
- Neutral, analytical, and descriptive tone.
- Focus on variance, role dependency, rotation dynamics, pace, and game flow.
- Avoid outcome-oriented language; explain market behavior instead.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        Analyze the structural reasons for the market sentiment lean (MORE/LESS) in this ${marketName} dataset:
        ${JSON.stringify(data)}
      `,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              playerName: { type: Type.STRING },
              insight: { type: Type.STRING, description: "A structural explanation of why the market leans More or Less for this player." }
            },
            required: ["playerName", "insight"]
          }
        }
      }
    });

    const parsed = JSON.parse(response.text || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Gemini Error:", err);
    return [];
  }
};
