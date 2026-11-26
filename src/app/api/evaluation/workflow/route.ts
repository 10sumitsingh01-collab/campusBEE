import { connection, NextRequest, NextResponse } from 'next/server';
import { getDataMode, getStore } from '@/lib/server/store';
import { standings } from '@/lib/judging/model';

import { canManageClub, getRequestUser } from '@/lib/server/authGuard';
import { Fault, load, principal } from '@/lib/server/competition';

export async function GET(request:NextRequest) {
  await connection();
  const missing = () => NextResponse.json({error:'The CLUSTER4 showcase is unavailable.'},{status:404});
  if (getDataMode() !== 'local_seed') return missing();
  const store = getStore();
  const event = store.events.find(e => e.id === 'cluster4-build24' && ['published','ongoing','completed'].includes(e.status));
  if (!event) return missing();
  const teams = store.teams.filter(t => t.eventId === event.id);
  const state = store.competitions?.[event.id]?.state;
  const round = state?.rounds.find(r => r.id === 'cluster4-final');
  const evaluations = state?.evaluations.filter(e => e.roundId === round?.id) ?? [];
  const user = await getRequestUser(request);
  const organizer = user?.role === 'club_organizer' && canManageClub(user,event.clubId);
  let visibleTeams = teams;
  if (!organizer) {
    const denied = () => NextResponse.json({error:'This workflow requires the hosting organizer or an assigned judge.'},
      {status:user ? 403 : 401,headers:{'Cache-Control':'private, no-store'}});
    try {
      const judge = principal(request,await load(event.id));
      const assignments = evaluations.filter(e => e.judgeId === judge.id);
      if (!assignments.length) return denied();
      visibleTeams = teams.filter(t => assignments.some(e => e.teamId === t.id));
    } catch (error) {
      if (error instanceof Fault && error.status === 401) return denied();
      throw error;
    }
  }
  const rows = visibleTeams.map(team => {
    const assigned = evaluations.filter(e => e.teamId === team.id);
    return {
      name:!organizer && round?.anonymous ? round.entries.find(e=>e.teamId===team.id)?.alias : team.name, submitted:store.submissions.some(s => s.eventId === event.id && s.teamId === team.id),
      assigned:assigned.length > 0, evaluated:assigned.length > 0 && assigned.every(e => e.submittedAt)
    };
  });
  return NextResponse.json({
    registeredCount:teams.length,title:event.title, start:event.startTime, end:event.endTime, capacity:event.maxTeams,
    venue:store.venues.find(v => v.id === event.venueId)?.name, teams:rows, status:round?.status,
    results:round?.status === 'published' ? standings(round,evaluations).map(r => ({
      team:teams.find(t => t.id === r.teamId)?.name, rank:r.rank, score:r.average
    })) : []
  },{headers:{'Cache-Control':'private, no-store'}});
}
