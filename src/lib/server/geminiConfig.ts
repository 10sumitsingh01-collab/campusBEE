// Only the presence of this server-side setting is exposed by the health endpoint.
export function geminiApiKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key && key !== 'your-gemini-api-key' ? key : undefined;
}
