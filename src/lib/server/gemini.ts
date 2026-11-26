import { hostedDemo } from './store';
import { geminiApiKey, geminiModel } from './geminiConfig';
import { GoogleGenAI } from '@google/genai';

export async function generateGroundedNarrative(
  prompt: string,
  fallbackText: string
): Promise<{ text: string; usedGemini: boolean }> {
  const apiKey = hostedDemo.getStore() ? undefined : geminiApiKey();
  if (!apiKey) {
    return { text: fallbackText, usedGemini: false };
  }

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 10000, retryOptions: { attempts: 1 } } });
    const response = await ai.models.generateContent({
      model: geminiModel(),
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

type HealthReason = 'demo' | 'missing_key' | 'verified' | 'provider_unavailable';
type HealthCheck = { reason: HealthReason; checkedAt: number };

let lastCheck: HealthCheck | undefined;
let pending: Promise<HealthCheck> | undefined;

// A short, shared probe exercises the same model and credentials as report drafting.
export async function checkGeminiHealth(): Promise<HealthCheck> {
  if (hostedDemo.getStore()) return { reason: 'demo', checkedAt: Date.now() };
  if (!geminiApiKey()) return { reason: 'missing_key', checkedAt: Date.now() };
  if (lastCheck && Date.now() - lastCheck.checkedAt < 60_000) return lastCheck;
  pending ??= generateGroundedNarrative('Reply with OK.', '').then(({ usedGemini }) => {
    lastCheck = { reason: usedGemini ? 'verified' : 'provider_unavailable', checkedAt: Date.now() };
    return lastCheck;
  }).finally(() => { pending = undefined; });
  return pending;
}
