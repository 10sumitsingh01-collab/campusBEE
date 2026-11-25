import { NextRequest, NextResponse } from 'next/server';
import { acceptTeamInvite } from '@/lib/registration/teamRules';
import {
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { getDataMode, getStore } from '@/lib/server/store';
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

    const { error: memberErr } = await supabase.from('team_members').insert({
      team_id: invite.team_id,
      event_id: invite.event_id,
      user_id: user.id,
      role: 'member',
      status: 'accepted',
    });

    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 400 });
    }

    await supabase.from('registrations').upsert(
      {
        event_id: invite.event_id,
        user_id: user.id,
        team_id: invite.team_id,
        registration_type: 'team',
        status: 'registered',
      },
      { onConflict: 'event_id,user_id' }
    );

    await supabase
      .from('team_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId);

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

  if (body.action === 'decline') {
    invite.status = 'declined';
    return NextResponse.json({ invite });
  }

  const res = acceptTeamInvite(inviteId, user, store.teams, store.invites);
  store.teams = res.teams;
  store.invites = res.invites;

  if (res.error) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }

  const ev = store.events.find((e) => e.id === invite.eventId);
  if (ev) ev.registrationsCount += 1;

  return NextResponse.json({
    teams: store.teams.filter((t) =>
      t.members.some((m) => m.userId === user.id)
    ),
    invites: store.invites.filter(
      (i) => i.invitedEmail.toLowerCase() === user.email.toLowerCase()
    ),
  });
}
