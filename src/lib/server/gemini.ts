import { geminiApiKey } from './geminiConfig';
import { GoogleGenAI } from '@google/genai';

export async function generateGroundedNarrative(
  prompt: string,
  fallbackText: string
): Promise<{ text: string; usedGemini: boolean }> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    return { text: fallbackText, usedGemini: false };
  }

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 10000, retryOptions: { attempts: 1 } } });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
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
