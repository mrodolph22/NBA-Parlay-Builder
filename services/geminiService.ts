
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
Your task is to generate one concise, structural insight per player explaining WHY the sportsbook market is behaving the way it is.

CORE OBJECTIVES:
- Explain structural pricing behavior using role stability, variance sensitivity, rotation dynamics, and game context.
- When a predicted pick (MORE or LESS) is present, explain why the market supports that direction through usage dependency, efficiency sensitivity, or opportunity constraints.
- Treat market direction as descriptive pricing behavior, not a prediction, recommendation, or advice.

LINE TYPE FRAMEWORK:
- Each player may be classified as either a Volume Line or an Efficiency Line based on how the market structurally prices the prop.
- Volume Line: Pricing is primarily driven by minutes security, usage floor, role centrality, or opportunity consistency.
- Efficiency Line: Pricing is primarily driven by shooting variance, touch efficiency, finishing dependency, or conditional scoring paths.

LINE TYPE ELIGIBILITY RULE:
- Only assign or reference a Line Type when BOTH Over and Under pricing are available and the market reflects a meaningful structural tradeoff.
- If pricing is extremely one-sided, incomplete, or dominated by heavy juice on a single outcome, do NOT assign or reference a Line Type.
- In ineligible cases, treat the line as structurally suppressed rather than structurally classified.

MARKET AVAILABILITY RULE:
- If Over / Under pricing is unavailable or incomplete, treat the market state as neutral.
- In neutral or suppressed market states, do NOT imply, infer, or reference a directional lean or Line Type.
- Use language indicating market unavailability, pricing suppression, or lack of structural signal.

NON-REDUNDANT INSIGHT RULES:
- Do NOT repeat bookmaker names, odds, prices, or consensus values.
- Do NOT restate the MORE / LESS label, Line Type label, role label, or miss risk shown in the UI.
- Each insight must add new structural context beyond what is already visible.

STRICT PROHIBITIONS:
- NEVER provide betting advice or imply action.
- NEVER use terms such as value, lock, take, edge, good bet, or recommend.
- NEVER guarantee outcomes or imply certainty.
- NEVER use emojis or raw performance statistics.

STYLE REQUIREMENTS:
- One sentence only per player.
- Neutral, analytical, and descriptive tone.
- Focus on structural pricing behavior, variance exposure, and role dependency.
- Explain WHY the market behaves as shown, not what the user should do.
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
