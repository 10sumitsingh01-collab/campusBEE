import { NextRequest, NextResponse } from 'next/server';
import { createOpaquePassCodes, registrationSummary, issueCampusTicket } from '@/lib/server/eventTicket';
import { acceptTeamInvite, checkStudentEligibility } from '@/lib/registration/teamRules';
import {
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { getDataMode, getStore, saveDemoStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['student']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const { id: inviteId } = await context.params;
  const body = (await request.json()) as { action?: 'accept' | 'decline' };
  if (body.action !== 'accept' && body.action !== 'decline') {
    return NextResponse.json(
      { error: 'action must be "accept" or "decline".' },
      { status: 400 }
    );
  }

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: invite } = await supabase
      .from('team_invites')
      .select('*')
      .eq('id', inviteId)
      .single();

    if (!invite) {
      return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
    }

    const isRecipient =
      invite.invited_user_id === user.id ||
      invite.invited_email?.toLowerCase() === user.email.toLowerCase();

    if (!isRecipient) {
      return forbiddenResponse('This invite belongs to another student.');
    }

    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: 'Invite is no longer pending.' },
        { status: 400 }
      );
    }

    if (body.action === 'decline') {
      const { data: declined } = await supabase
        .from('team_invites')
        .update({ status: 'declined' })
        .eq('id', inviteId)
        .select('*')
        .single();
      return NextResponse.json({ invite: declined });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await supabase
        .from('team_invites')
        .update({ status: 'expired' })
        .eq('id', inviteId);
      return NextResponse.json(
        { error: 'Invite has expired.' },
        { status: 400 }
      );
    }

    const prior = await supabase.from('registrations').select('id').eq('event_id',invite.event_id).eq('user_id',user.id).eq('status','registered').maybeSingle();
    if (prior.error || prior.data) return NextResponse.json({error:'Unable to accept: check your existing registration.'},{status:409});
    // Enforce: student can be an accepted member of only one team per event
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('id')
      .eq('event_id', invite.event_id)
      .eq('user_id', user.id)
      .eq('status', 'accepted')
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { error: 'You are already a member of a team for this event.' },
        { status: 409 }
      );
    }

    const {ticketCode,qrToken} = createOpaquePassCodes();
    const {error} = await supabase.rpc('register_event_participant',{p_event:invite.event_id,p_kind:'team',
      p_team_name:'',p_contact:{name:user.name},p_ticket:ticketCode,p_qr:qrToken,p_invite:inviteId});
    if (error) return NextResponse.json({error:error.message},{status:409});

    // Cancel other pending invites for the same event
    await supabase
      .from('team_invites')
      .update({ status: 'cancelled' })
      .eq('event_id', invite.event_id)
      .eq('status', 'pending')
      .neq('id', inviteId)
      .ilike('invited_email', user.email);

    const { data: updatedInvites } = await supabase
      .from('team_invites')
      .select('*')
      .ilike('invited_email', user.email);

    return NextResponse.json({
      accepted: true,
      invites: updatedInvites ?? [],
    });
  }

  const store = getStore();
  const invite = store.invites.find((i) => i.id === inviteId);
  if (!invite) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  if (invite.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
    return forbiddenResponse('This invite belongs to another student.');
  }

  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'This invite has already been answered.' }, { status: 409 });
  }

  if (body.action === 'decline') {
    invite.status = 'declined';
    saveDemoStore(store);
    return NextResponse.json({ invite });
  }

  const event = store.events.find(e => e.id === invite.eventId);
  const team = store.teams.find(t => t.id === invite.teamId);
  if (!event || event.status !== 'published' || !team || team.status === 'locked' || team.members.length >= event.maxTeamSize) {
    return NextResponse.json({ error: 'This team is no longer accepting members.' }, { status: 409 });
  }
  const eligibility = checkStudentEligibility(user, event);
  if (!eligibility.eligible) return NextResponse.json({ error: eligibility.reason }, { status: 400 });
  if (store.tickets.some(t => t.eventId === event.id && t.userId === user.id && t.status === 'registered'))
    return NextResponse.json({error:'You already have a role in this event.'},{status:409});
  if (registrationSummary(store,event).remaining === 0) return NextResponse.json({error:'This event is full.'},{status:409});
  const res = acceptTeamInvite(inviteId, user, store.teams, store.invites);
  store.teams = res.teams;
  store.invites = res.invites;

  if (res.error) {
    saveDemoStore(store);
    return NextResponse.json({ error: res.error }, { status: 400 });
  }

  const venue = store.venues.find(v => v.id === event.venueId);
  store.tickets.push(issueCampusTicket(event, venue, user, team.id));
  event.registrationsCount += 1;
  saveDemoStore(store);

  return NextResponse.json({
    teams: store.teams.filter((t) =>
      t.members.some((m) => m.userId === user.id)
    ),
    invites: store.invites.filter(
      (i) => i.invitedEmail.toLowerCase() === user.email.toLowerCase()
    ),
  });
}
