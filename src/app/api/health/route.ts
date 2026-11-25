import { NextResponse } from 'next/server';

export async function GET() {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && key);
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  return NextResponse.json({
    status: 'ok',
    app: 'CampusOS + Crew Sync AI',
    mode: supabaseConfigured ? 'supabase' : 'local_seed',
    services: {
      supabase: supabaseConfigured,
      gemini: geminiConfigured,
    },
    timestamp: new Date().toISOString(),
  });
}
