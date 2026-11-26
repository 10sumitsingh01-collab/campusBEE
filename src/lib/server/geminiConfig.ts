export function geminiApiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key !== 'your-gemini-api-key' ? key : undefined;
}

export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
}
