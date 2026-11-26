import { saveDemoStore } from '@/lib/server/store';
import { NextRequest, NextResponse } from 'next/server';
import { canLockTeam } from '@/lib/registration/teamRules';
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

  const { id: teamId } = await context.params;

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
      return forbiddenResponse('Only the team leader can lock the team.');
    }

    const [{ data: event }, { count }] = await Promise.all([
      supabase
        .from('events')
        .select('min_team_size, max_team_size')
        .eq('id', team.event_id)
        .single(),
      supabase
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', team.id)
        .eq('status', 'accepted'),
    ]);

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
    }

    const memberCount = count ?? 0;
    if (memberCount < event.min_team_size) {
      return NextResponse.json(
        {
          error: `Need at least ${event.min_team_size} members to lock (currently ${memberCount}).`,
        },
        { status: 400 }
      );
    }
    if (memberCount > event.max_team_size) {
      return NextResponse.json(
        {
          error: `Maximum ${event.max_team_size} members allowed (currently ${memberCount}).`,
        },
        { status: 400 }
      );
    }

    const { data: locked, error } = await supabase
      .from('teams')
      .update({ status: 'locked', locked_at: new Date().toISOString() })
      .eq('id', team.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      team: {
        id: locked.id,
        eventId: locked.event_id,
        name: locked.name,
        leaderId: locked.leader_id,
        status: locked.status,
        lockedAt: locked.locked_at ?? undefined,
        members: [],
      },
    });
  }

  const store = getStore();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }

  if (team.leaderId !== user.id) {
    return forbiddenResponse('Only the team leader can lock the team.');
  }

  const event = store.events.find((e) => e.id === team.eventId);
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  const check = canLockTeam(team, event);
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }

  team.status = 'locked';
  team.lockedAt = new Date().toISOString();

  saveDemoStore(store);
  return NextResponse.json({ team });
}
