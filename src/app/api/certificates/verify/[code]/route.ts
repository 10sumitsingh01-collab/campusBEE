import { NextRequest, NextResponse } from 'next/server';
import { getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { valid: false, error: 'Database unavailable.' },
        { status: 500 }
      );
    }

    const { data: cert } = await supabase
      .from('certificates')
      .select('*, events(title, clubs(name))')
      .ilike('certificate_code', code)
      .maybeSingle();

    if (!cert) {
      return NextResponse.json(
        { valid: false, error: 'Certificate code not found.' },
        { status: 404 }
      );
    }

    const eventObj = Array.isArray(cert.events) ? cert.events[0] : cert.events;
    const clubObj = eventObj?.clubs
      ? Array.isArray(eventObj.clubs)
        ? eventObj.clubs[0]
        : eventObj.clubs
      : null;

    return NextResponse.json({
      valid: true,
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
      eventTitle: eventObj?.title,
      clubName: clubObj?.name,
    });
  }

  const store = getStore();
  const cert = store.certificates.find(
    (c) => c.certificateCode.toUpperCase() === code.toUpperCase()
  );

  if (!cert) {
    return NextResponse.json(
      { valid: false, error: 'Certificate code not found.' },
      { status: 404 }
    );
  }

  const event = store.events.find((e) => e.id === cert.eventId);
  const club = event
    ? store.clubs.find((c) => c.id === event.clubId)
    : undefined;

  return NextResponse.json({
    valid: true,
    certificate: cert,
    eventTitle: event?.title,
    clubName: club?.name,
  });
}
