import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser, requireRole } from '@/lib/server/authGuard';
import { checkGeminiHealth } from '@/lib/server/gemini';
import { geminiModel } from '@/lib/server/geminiConfig';

export async function GET(request: NextRequest) {
  const diagnostics = request.nextUrl.searchParams.get('diagnostics') === '1';
  const denied = requireRole(await getRequestUser(request), diagnostics
    ? ['college_admin'] : ['club_organizer', 'college_admin']);
  if (denied) return denied;

  const { reason, checkedAt } = await checkGeminiHealth();
  return NextResponse.json({
    status: reason === 'verified' ? 'active' : 'fallback',
    checkedAt,
    ...(diagnostics && { diagnostics: {
      reason,
      ...(reason !== 'demo' && {
        model: geminiModel(),
        keyConfigured: reason !== 'missing_key',
        supabaseConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL &&
          (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)),
      }),
    } }),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
