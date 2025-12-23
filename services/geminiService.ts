
import { GoogleGenAI, Type } from "@google/genai";

export interface ParlayPrediction {
  playerName: string;
  market: string;
  line: number;
  prediction: "MORE" | "LESS";
  reason: string;
}

/**
 * Analyzes NBA player odds data using Gemini 3 Flash.
 * Returns a JSON structured parlay analysis for player props.
 */
export const analyzeOddsWithGemini = async (
  marketName: string,
  selectedBookmakerTitle: string,
  data: any
): Promise<ParlayPrediction[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `
        You are a professional NBA betting analyst. Task: Build a parlay for the ${marketName} market.
        Analyze the provided market consensus and the data from bookmaker "${selectedBookmakerTitle}".
        
        Data: ${JSON.stringify(data)}

        For EVERY player, predict if they will go MORE (Over) or LESS (Under) the line.
        Include a short reasoning (max 12 words) based on the bookmaker odds and consensus.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              playerName: { type: Type.STRING },
              market: { type: Type.STRING },
              line: { type: Type.NUMBER },
              prediction: { type: Type.STRING, description: "Must be 'MORE' or 'LESS'" },
              reason: { type: Type.STRING }
            },
            required: ["playerName", "market", "line", "prediction", "reason"]
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
