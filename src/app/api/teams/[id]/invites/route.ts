import { NextRequest, NextResponse } from 'next/server';
import {
  forbiddenResponse,
  getRequestUser,
  requireRole,
  unauthorizedResponse,
} from '@/lib/server/authGuard';
import { generateId, getDataMode, getStore } from '@/lib/server/store';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { TeamInvite } from '@/types/domain';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getRequestUser(request);
  const roleError = requireRole(user, ['student']);
  if (roleError || !user) return roleError ?? unauthorizedResponse();

  const { id: teamId } = await context.params;
  const body = (await request.json()) as { email?: string };
  if (!body.email?.trim()) {
    return NextResponse.json(
      { error: 'Invited email is required.' },
      { status: 400 }
    );
  }

  const invitedEmail = body.email.trim().toLowerCase();

  if (getDataMode() === 'supabase') {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return unauthorizedResponse();

    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    if (!team) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }
    if (team.leader_id !== user.id) {
      return forbiddenResponse('Only the team leader can send invites.');
    }
    if (team.status === 'locked') {
      return NextResponse.json(
        { error: 'Locked teams cannot send new invites.' },
        { status: 400 }
      );
    }

    const { data: event } = await supabase
      .from('events')
      .select('registration_deadline')
      .eq('id', team.event_id)
      .single();

    const { data: invite, error } = await supabase
      .from('team_invites')
      .insert({
        team_id: team.id,
        event_id: team.event_id,
        invited_email: invitedEmail,
        status: 'pending',
        expires_at:
          event?.registration_deadline ??
          new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('*')
      .single();

    if (error || !invite) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to create invite.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        invite: {
          id: invite.id,
          teamId: invite.team_id,
          eventId: invite.event_id,
          teamName: team.name,
          invitedEmail: invite.invited_email ?? invitedEmail,
          status: invite.status,
          expiresAt: invite.expires_at,
        },
      },
      { status: 201 }
    );
  }

  const store = getStore();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }

  if (team.leaderId !== user.id) {
    return forbiddenResponse('Only the team leader can send invites.');
  }

  if (team.status === 'locked') {
    return NextResponse.json(
      { error: 'Locked teams cannot send new invites.' },
      { status: 400 }
    );
  }

  const event = store.events.find((e) => e.id === team.eventId);
  const invite: TeamInvite = {
    id: generateId('inv'),
    teamId: team.id,
    eventId: team.eventId,
    teamName: team.name,
    invitedEmail,
    status: 'pending',
    expiresAt:
      event?.registrationDeadline ??
      new Date(Date.now() + 86_400_000).toISOString(),
  };

  store.invites.push(invite);
  return NextResponse.json({ invite }, { status: 201 });
}
