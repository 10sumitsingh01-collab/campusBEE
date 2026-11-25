import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CertificateRecord } from '@/types/domain';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const { id: eventId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    teamId?: string;
    type?: CertificateRecord['type'];
    rankLabel?: string;
  };

  const targetUserId = body.userId ?? user.id;
  const certificateCode = `COS-${eventId.slice(-4).toUpperCase()}-${crypto
    .randomUUID()
    .slice(0, 6)
    .toUpperCase()}`;

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: cert, error } = await supabase
      .from('certificates')
      .insert({
        event_id: eventId,
        user_id: targetUserId,
        team_id: body.teamId ?? null,
        type: body.type ?? 'participation',
        rank_label: body.rankLabel ?? null,
        certificate_code: certificateCode,
      })
      .select('*')
      .single();

    if (error || !cert) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to issue certificate.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        certificate: {
          id: cert.id,
          eventId: cert.event_id,
          userId: cert.user_id,
          teamId: cert.team_id ?? undefined,
          type: cert.type,
          rankLabel: cert.rank_label ?? undefined,
          certificateCode: cert.certificate_code,
          issuedAt: cert.issued_at,
        },
      },
      { status: 201 }
    );
  }

  const store = getStore();
  const event = store.events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  if (!canManageClub(user, event.clubId)) {
    return forbiddenResponse(
      'Only the club organizer or admin can issue certificates.'
    );
  }

  const cert: CertificateRecord = {
    id: generateId('cert'),
    eventId,
    userId: targetUserId,
    teamId: body.teamId,
    type: body.type ?? 'participation',
    rankLabel: body.rankLabel,
    certificateCode,
    issuedAt: new Date().toISOString(),
  };

  store.certificates.push(cert);
  return NextResponse.json({ certificate: cert }, { status: 201 });
}
