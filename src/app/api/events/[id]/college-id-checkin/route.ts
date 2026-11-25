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
import { CollegeIdCard, EventAttendance } from '@/types/domain';

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data, error } = await supabase
      .from('college_id_cards')
      .select('*')
      .eq('is_demo', true)
      .order('usn');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    const cards: CollegeIdCard[] = (data ?? []).map((c) => ({
      id: c.id,
      userId: c.user_id ?? undefined,
      name: c.name,
      usn: c.usn,
      email: c.email,
      department: c.department,
      year: c.year,
      college: c.college,
      barcodeToken: c.barcode_token,
      isDemo: Boolean(c.is_demo),
    }));

    return NextResponse.json({ cards });
  }

  return NextResponse.json({ cards: getStore().collegeIdCards });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['club_organizer', 'college_admin']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const { id: eventId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    barcodeOrUsn?: string;
    method?: 'barcode' | 'manual';
  };

  const query =
    body.barcodeOrUsn !== undefined && body.barcodeOrUsn !== null
      ? String(body.barcodeOrUsn).trim()
      : '';
  if (!query) {
    return NextResponse.json(
      { status: 'INVALID_STUDENT', error: 'Barcode or USN is required.' },
      { status: 400 }
    );
  }

  const mode = getDataMode();
  console.log('[college-id-checkin] request', {
    mode,
    eventId,
    query,
    method: body.method ?? 'barcode',
  });

  if (mode === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: ev } = await supabase
      .from('events')
      .select('id, title, club_id')
      .eq('id', eventId)
      .single();

    if (!ev) {
      return NextResponse.json(
        { status: 'INVALID_STUDENT', error: 'Event not found.' },
        { status: 404 }
      );
    }

    // Look up student in college_id_cards by exact barcode_token or USN
    const safeQuery = query.replace(/"/g, '');
    const { data: card, error: cardErr } = await supabase
      .from('college_id_cards')
      .select('*')
      .or(`barcode_token.eq."${safeQuery}",usn.ilike."${safeQuery}"`)
      .maybeSingle();

    if (cardErr) {
      console.error('[college-id-checkin] lookup error:', cardErr.message);
      return NextResponse.json(
        { status: 'INVALID_STUDENT', error: cardErr.message },
        { status: 500 }
      );
    }

    let student: CollegeIdCard | null = card
      ? {
          id: card.id,
          userId: card.user_id ?? undefined,
          name: card.name,
          usn: card.usn,
          email: card.email,
          department: card.department,
          year: card.year,
          college: card.college,
          barcodeToken: card.barcode_token,
          isDemo: Boolean(card.is_demo),
        }
      : null;

    // Fallback: check enrolled public.users by barcode_token or roll_number
    if (!student) {
      const { data: enrolled } = await supabase
        .from('users')
        .select('*')
        .or(`barcode_token.eq.${query},roll_number.ilike.${query}`)
        .maybeSingle();

      if (enrolled) {
        student = {
          id: enrolled.id,
          userId: enrolled.id,
          name: enrolled.name,
          usn: enrolled.roll_number ?? 'N/A',
          email: enrolled.email,
          department: enrolled.department ?? 'General',
          year: enrolled.year ?? 1,
          college: enrolled.college ?? 'CampusOS Institution',
          barcodeToken: enrolled.barcode_token ?? query,
          isDemo: false,
        };
      }
    }

    if (!student) {
      return NextResponse.json(
        {
          status: 'INVALID_STUDENT',
          error: 'No student record matches this College ID barcode.',
        },
        { status: 404 }
      );
    }

    // Verify registration for the selected event
    const regFilter = student.userId
      ? `user_id.eq.${student.userId},attendee_email.ilike.${student.email}`
      : `attendee_email.ilike.${student.email}`;

    const { data: reg } = await supabase
      .from('registrations')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'registered')
      .or(regFilter)
      .maybeSingle();

    if (!reg) {
      return NextResponse.json({
        status: 'STUDENT_IDENTIFIED_NOT_REGISTERED',
        student,
        eventTitle: ev.title,
      });
    }

    const { data: existingAtt } = await supabase
      .from('event_attendance')
      .select('*')
      .eq('event_id', eventId)
      .or(`registration_id.eq.${reg.id},user_id.eq.${reg.user_id}`)
      .maybeSingle();

    if (existingAtt) {
      return NextResponse.json({
        status: 'ALREADY_CHECKED_IN',
        student,
        eventTitle: ev.title,
        checkInTime: existingAtt.check_in_time,
      });
    }

    const { data: inserted, error } = await supabase
      .from('event_attendance')
      .insert({
        event_id: eventId,
        registration_id: reg.id,
        user_id: reg.user_id,
        team_id: reg.team_id ?? null,
        check_in_method: body.method === 'manual' ? 'manual' : 'qr',
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({
          status: 'ALREADY_CHECKED_IN',
          student,
          eventTitle: ev.title,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      {
        status: 'ATTENDANCE_MARKED',
        student,
        eventTitle: ev.title,
        checkInTime: inserted.check_in_time,
      },
      { status: 201 }
    );
  }

  // Local seed mode
  const store = getStore();
  const event = store.events.find((e) => e.id === eventId);
  if (!event) {
    return NextResponse.json(
      { status: 'INVALID_STUDENT', error: 'Event not found.' },
      { status: 404 }
    );
  }

  if (!canManageClub(user, event.clubId)) {
    return forbiddenResponse(
      'Only authorized club organizers or admins can scan College IDs.'
    );
  }

  const student = store.collegeIdCards.find(
    (c) =>
      (c.barcodeToken !== null && c.barcodeToken === query) ||
      (c.usn !== null && c.usn.toUpperCase() === query.toUpperCase())
  );

  if (!student) {
    return NextResponse.json(
      {
        status: 'INVALID_STUDENT',
        error: 'No student record matches this College ID barcode.',
      },
      { status: 404 }
    );
  }

  const ticket = store.tickets.find(
    (t) =>
      t.eventId === eventId &&
      t.status === 'registered' &&
      (t.userId === student.userId ||
        t.attendeeEmail.toLowerCase() === student.email.toLowerCase())
  );

  if (!ticket) {
    return NextResponse.json({
      status: 'STUDENT_IDENTIFIED_NOT_REGISTERED',
      student,
      eventTitle: event.title,
    });
  }

  const existing = store.attendance.find(
    (a) => a.eventId === eventId && a.userId === ticket.userId
  );
  if (existing) {
    return NextResponse.json({
      status: 'ALREADY_CHECKED_IN',
      student,
      eventTitle: event.title,
      checkInTime: existing.checkInTime,
    });
  }

  const record: EventAttendance = {
    id: generateId('att'),
    eventId,
    userId: ticket.userId,
    teamId: ticket.teamId,
    checkInTime: new Date().toISOString(),
    checkInMethod: body.method === 'manual' ? 'manual' : 'qr',
  };
  store.attendance.push(record);

  return NextResponse.json(
    {
      status: 'ATTENDANCE_MARKED',
      student,
      eventTitle: event.title,
      checkInTime: record.checkInTime,
    },
    { status: 201 }
  );
}
