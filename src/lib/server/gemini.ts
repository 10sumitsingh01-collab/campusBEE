import { GoogleGenAI } from '@google/genai';

export async function generateGroundedNarrative(
  prompt: string,
  fallbackText: string
): Promise<{ text: string; usedGemini: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { text: fallbackText, usedGemini: false };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });
    const text = response.text?.trim();
    if (!text) {
      return { text: fallbackText, usedGemini: false };
    }
    return { text, usedGemini: true };
  } catch {
    return { text: fallbackText, usedGemini: false };
  }
}
