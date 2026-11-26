import { createHmac, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  canManageClub,
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore, saveDemoStore } from '@/lib/server/store';
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
      barcodeToken: c.barcode_token ? 'DEMO-' + c.id : null,
      isDemo: Boolean(c.is_demo),
    }));

    return NextResponse.json({ cards });
  }

  return NextResponse.json({ cards: getStore().collegeIdCards.filter(c => c.isDemo).map(c => ({
    ...c, barcodeToken: c.barcodeToken ? 'DEMO-' + c.id : null,
  })) });
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
    ticketCode?: string;
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
  if (!/^[A-Za-z0-9._:/-]{1,128}$/.test(query)) {
    return NextResponse.json({ error: 'Enter the barcode printed on the ID.' }, { status: 400 });
  }

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

    if (user.role !== 'college_admin') {
      const { data: club } = await supabase.from('clubs').select('owner_id').eq('id', ev.club_id).maybeSingle();
      if (club?.owner_id !== user.id) return forbiddenResponse();
    }
    const demo = query.startsWith('DEMO-');
    const lookup = supabase.from('college_id_cards').select('*').eq('is_demo', demo);
    const { data: card, error: cardErr } = await (demo
      ? lookup.eq('id', query.slice(5))
      : lookup.or(`barcode_token.eq."${query}",usn.eq."${query.toUpperCase()}"`)).maybeSingle();

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
    if (!student && !demo) {
      const { data: enrolled } = await supabase
        .from('users')
        .select('*')
        .or(`barcode_token.eq.${query},roll_number.eq.${query.toUpperCase()}`)
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
          college: enrolled.college ?? 'campusBEE Institution',
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
        student: { name: student.name, usn: student.usn, department: student.department, year: student.year, college: student.college },
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
        student: { name: student.name, usn: student.usn, department: student.department, year: student.year, college: student.college },
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
          student: { name: student.name, usn: student.usn, department: student.department, year: student.year, college: student.college },
          eventTitle: ev.title,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      {
        status: 'ATTENDANCE_MARKED',
        student: { name: student.name, usn: student.usn, department: student.department, year: student.year, college: student.college },
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

  const demo = query.startsWith('DEMO-');
  const digest = (key: string) => 'hmac:' + createHmac('sha256', key).update(query).digest('hex');
  const token = store.collegeCardKey ? digest(store.collegeCardKey) : undefined;
  let student = store.collegeIdCards.find(card => {
    if (demo) return card.isDemo && 'DEMO-' + card.id === query;
    if (card.isDemo) return false;
    if (card.barcodeToken?.startsWith('hmac:')) return card.barcodeToken === token;
    return card.barcodeToken === query || card.usn?.toUpperCase() === query.toUpperCase();
  });

  if (body.ticketCode !== undefined) {
    const pass = store.tickets.find(t => t.eventId === eventId && t.status === 'registered'
      && typeof body.ticketCode === 'string' && t.ticketCode === body.ticketCode.trim().toUpperCase());
    const account = pass && store.accounts.find(a => a.profile.id === pass.userId && a.profile.role === 'student');
    if (!pass || !account || demo) {
      return NextResponse.json({ error: 'Use the registered student’s campusBEE pass for this event.' }, { status: 400 });
    }
    if ((student && student.userId !== pass.userId) || (!student && store.collegeIdCards.some(c => !c.isDemo && c.userId === pass.userId))) {
      return NextResponse.json({ error: 'This card or student already has a different link.' }, { status: 409 });
    }
    if (!student) {
      store.collegeCardKey ??= randomBytes(32).toString('hex');
      student = { id: generateId('card'), userId: pass.userId, name: account.profile.name,
        usn: null, email: account.profile.email, department: account.profile.department,
        year: account.profile.year ?? null, college: pass.college, isDemo: false, barcodeToken: digest(store.collegeCardKey) };
      store.collegeIdCards.push(student);
      saveDemoStore(store);
    }
  }
  if (!student) {
    return NextResponse.json({ status: demo ? 'INVALID_STUDENT' : 'CARD_NOT_LINKED',
      error: demo ? 'Unknown demo card.' : 'First visit with this card. Match the photo ID to the student’s event pass below.' }, { status: 404 });
  }
  const ticket = store.tickets.find(t => t.eventId === eventId && t.status === 'registered' &&
    (student.userId ? t.userId === student.userId : t.attendeeEmail.toLowerCase() === student.email.toLowerCase()));
  if (!ticket) {
    return NextResponse.json({
      status: 'STUDENT_IDENTIFIED_NOT_REGISTERED',
      student: { name: student.name, usn: student.usn, department: student.department, year: student.year, college: student.college },
      eventTitle: event.title,
    });
  }

  const existing = store.attendance.find(
    (a) => a.eventId === eventId && a.userId === ticket.userId
  );
  if (existing) {
    return NextResponse.json({
      status: 'ALREADY_CHECKED_IN',
      student: { name: student.name, usn: student.usn, department: student.department, year: student.year, college: student.college },
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
    checkInMethod: body.method === 'manual' ? 'manual' : 'barcode',
  };
  store.attendance.push(record);
  saveDemoStore(store);

  return NextResponse.json(
    {
      status: 'ATTENDANCE_MARKED',
      student: { name: student.name, usn: student.usn, department: student.department, year: student.year, college: student.college },
      eventTitle: event.title,
      checkInTime: record.checkInTime,
    },
    { status: 201 }
  );
}
