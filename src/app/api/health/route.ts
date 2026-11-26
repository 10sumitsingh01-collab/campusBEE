import { geminiApiKey } from '@/lib/server/geminiConfig';
import { getDataMode } from '@/lib/server/store';
import { NextResponse } from 'next/server';

export async function GET() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && key);
  const geminiConfigured = Boolean(geminiApiKey());

  return NextResponse.json({
    status: 'ok',
    app: 'campusBEE + Crew Sync AI',
    mode: getDataMode(),
    services: {
      supabase: supabaseConfigured,
      gemini: geminiConfigured,
    },
    timestamp: new Date().toISOString(),
  });
}
